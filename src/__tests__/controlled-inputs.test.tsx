/**
 * Controlled inputs: a control given `value` shows that value, whatever the
 * user did to it, the way React DOM restores a controlled input after every
 * event.
 *
 * UI Toolkit changes the native control before ChangeEvent reaches JS, so
 * each test starts by changing the element itself, then dispatches the change
 * the way the bootstrap does.
 */

import { describe, it, expect, vi } from "vitest"
import React, { useState } from "react"
import { render, unmount } from "../renderer"
import { registerElement } from "../host-config"
import { TextField, Toggle, Slider, View, createComponent } from "../components"
import type { BaseProps } from "../types"
import { createMockContainer, flushMicrotasks, getEventAPI, MockVisualElement } from "./mocks"

/** The change listener the reconciler registered on `el`, if any. */
function changeListener(el: MockVisualElement): ((e: unknown) => void) | undefined {
    const api = getEventAPI()
    const added = api.addEventListener.mock.calls.filter(c => c[0] === el && c[1] === "change").map(c => c[2])
    const removed = new Set(api.removeEventListener.mock.calls.filter(c => c[0] === el && c[1] === "change").map(c => c[2]))
    return added.filter(cb => !removed.has(cb)).pop()
}

/** What a user does: the control changes itself, then ChangeEvent is dispatched. */
function userChanges(el: MockVisualElement, value: unknown) {
    const previousValue = el.value
    el.value = value
    changeListener(el)?.({ type: "change", value, previousValue, target: el.__csHandle, currentTarget: el.__csHandle })
}

async function mount(node: React.ReactElement) {
    const container = createMockContainer()
    render(node, container as any)
    await flushMicrotasks()
    return { container, el: container.children[0] as any }
}

describe("controlled inputs re-assert their value", () => {
    it("a locked Toggle stays off when clicked", async () => {
        const onChange = vi.fn()
        const { container, el } = await mount(<Toggle value={false} onChange={onChange} />)

        userChanges(el, true)
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: true }))
        expect(el.value).toBe(false)
        expect(el.SetValueWithoutNotify).toHaveBeenCalledWith(false)
        unmount(container as any)
    })

    it("a TextField capped at five characters keeps the five", async () => {
        function Capped() {
            const [text, setText] = useState("abcde")
            return <TextField value={text} onChange={e => setText(e.value.slice(0, 5))} />
        }
        const { container, el } = await mount(<Capped />)

        userChanges(el, "abcdef")
        expect(el.value).toBe("abcde")
        unmount(container as any)
    })

    it("a clamping Slider commits the clamped value before the change returns", async () => {
        function Volume() {
            const [volume, setVolume] = useState(50)
            return <Slider min={0} max={100} value={volume} onChange={e => setVolume(Math.min(e.value, 80))} />
        }
        const { container, el } = await mount(<Volume />)

        // State moves 50 to 80: the commit lands inside the dispatch
        userChanges(el, 95)
        expect(el.value).toBe(80)

        // State is already 80, so React bails out and nothing commits
        userChanges(el, 95)
        expect(el.value).toBe(80)
        unmount(container as any)
    })

    it("an accepted change writes nothing back", async () => {
        function Name() {
            const [name, setName] = useState("")
            return <TextField value={name} onChange={e => setName(e.value)} />
        }
        const { container, el } = await mount(<Name />)

        userChanges(el, "Ada")
        expect(el.value).toBe("Ada")
        expect(el.SetValueWithoutNotify).not.toHaveBeenCalled()
        unmount(container as any)
    })

    it("a value with no onChange is read only", async () => {
        const { container, el } = await mount(<Slider value={30} />)
        userChanges(el, 60)
        expect(el.value).toBe(30)
        unmount(container as any)
    })

    it("leaves an uncontrolled control alone", async () => {
        const onChange = vi.fn()
        const { container, el } = await mount(<TextField onChange={onChange} />)

        userChanges(el, "free")
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(el.value).toBe("free")
        expect(el.SetValueWithoutNotify).not.toHaveBeenCalled()
        unmount(container as any)
    })

    it("re-asserts even when the handler throws", async () => {
        const { container, el } = await mount(<Toggle value={false} onChange={() => { throw new Error("nope") }} />)
        expect(() => userChanges(el, true)).toThrow("nope")
        expect(el.value).toBe(false)
        unmount(container as any)
    })

    it("follows the latest onChange without re-registering with the event API", async () => {
        const first = vi.fn(), second = vi.fn()
        const { container, el } = await mount(<Toggle value={false} onChange={first} />)
        const listener = changeListener(el)

        render(<Toggle value={false} onChange={second} />, container as any)
        await flushMicrotasks()
        expect(changeListener(el)).toBe(listener)

        userChanges(el, true)
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
        unmount(container as any)
    })

    it("stops listening when neither value nor onChange remain", async () => {
        const { container, el } = await mount(<Toggle value={false} />)
        expect(changeListener(el)).toBeTypeOf("function")

        render(<Toggle />, container as any)
        await flushMicrotasks()
        expect(changeListener(el)).toBeUndefined()
        unmount(container as any)
    })

    it("a parent's onChange still hears a child's change, and does not re-assert the child", async () => {
        const onAnyChange = vi.fn()
        const { container, el } = await mount(
            // View does not type onChange; a bubbling listener is still allowed at runtime
            <View {...({ onChange: onAnyChange } as object)}>
                <Toggle />
            </View>,
        )
        const toggle = el.children[0] as MockVisualElement
        toggle.value = true
        changeListener(el)!({ type: "change", value: true, target: toggle.__csHandle, currentTarget: el.__csHandle })
        expect(onAnyChange).toHaveBeenCalledTimes(1)
        expect(toggle.value).toBe(true)
        unmount(container as any)
    })

    it("covers a registered field such as DropdownField", async () => {
        class MockDropdownField extends MockVisualElement {
            choices: string[] = []
            SetValueWithoutNotify = vi.fn((v: unknown) => { this.value = v })
            constructor() { super("UnityEngine.UIElements.DropdownField") }
        }
        registerElement("dropdown-test", MockDropdownField)
        const Dropdown = createComponent<BaseProps & { value?: string, onChange?: (e: { value: string }) => void }>("dropdown-test")

        const { container, el } = await mount(<Dropdown value="Easy" onChange={() => {}} />)
        userChanges(el, "Hard")
        expect(el.value).toBe("Easy")
        unmount(container as any)
    })

    it("sees the new props when writing the value prop itself raises a change", async () => {
        // A re-assert that read the old props here would put the old value back
        // over the one React just wrote.
        let setVolume: (n: number) => void = () => {}
        function Volume() {
            const [volume, set] = useState(50)
            setVolume = set
            return <Slider value={volume} onChange={e => set(e.value)} />
        }
        const { container, el } = await mount(<Volume />)
        notifiesLikeUnity(el)

        setVolume(80)
        await flushMicrotasks()
        expect(el.value).toBe(80)
        unmount(container as any)
    })
})

/**
 * Gives `el` Unity's value setter, which raises ChangeEvent synchronously when
 * the value changes, and a SetValueWithoutNotify that does not.
 */
function notifiesLikeUnity(el: MockVisualElement) {
    let current = el.value
    Object.defineProperty(el, "value", {
        get: () => current,
        set: (v: unknown) => {
            if (v === current) return
            const previousValue = current
            current = v
            changeListener(el)?.({ type: "change", value: v, previousValue, target: el.__csHandle, currentTarget: el.__csHandle })
        },
        configurable: true,
    })
    ;(el as any).SetValueWithoutNotify = vi.fn((v: unknown) => { current = v })
}

// React DOM fires no onChange for a value it writes, only for one the user makes
describe("a value React writes is not a change", () => {
    for (const [name, Control, from, to] of [
        ["TextField", TextField, "a", "b"],
        ["Toggle", Toggle, false, true],
        ["Slider", Slider, 10, 20],
    ] as const) {
        it(`a ${name} given a new value fires no onChange`, async () => {
            const onChange = vi.fn()
            let setValue: (v: unknown) => void = () => {}
            function Controlled() {
                const [value, set] = useState<unknown>(from)
                setValue = set
                return React.createElement(Control as any, { value, onChange })
            }
            const { container, el } = await mount(<Controlled />)
            notifiesLikeUnity(el)

            setValue(to)
            await flushMicrotasks()
            expect(el.value).toBe(to)
            expect(onChange).not.toHaveBeenCalled()
            unmount(container as any)
        })
    }

    it("a registered field given a new value fires no onChange", async () => {
        class MockEnumField extends MockVisualElement {
            constructor() { super("UnityEngine.UIElements.EnumField") }
        }
        registerElement("enum-test", MockEnumField)
        const Field = createComponent<BaseProps & { value?: string, onChange?: (e: { value: string }) => void }>("enum-test")
        const onChange = vi.fn()
        let setValue: (v: string) => void = () => {}
        function Controlled() {
            const [value, set] = useState("Easy")
            setValue = set
            return <Field value={value} onChange={onChange} />
        }
        const { container, el } = await mount(<Controlled />)
        notifiesLikeUnity(el)

        setValue("Hard")
        await flushMicrotasks()
        expect(el.value).toBe("Hard")
        expect(onChange).not.toHaveBeenCalled()
        unmount(container as any)
    })

    it("a user's change still reaches onChange", async () => {
        const onChange = vi.fn()
        const { container, el } = await mount(<TextField onChange={onChange} />)
        notifiesLikeUnity(el)

        el.value = "typed"
        expect(onChange).toHaveBeenCalledTimes(1)
        unmount(container as any)
    })
})
