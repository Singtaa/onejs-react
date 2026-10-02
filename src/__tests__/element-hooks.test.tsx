/**
 * Hooks that attach to the element behind a ref (useVectorContent,
 * useBatchedVectorContent, useParticles) must follow the ref: an element that
 * mounts after the hook, or one a key change replaces, still gets attached.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import React, { useState } from "react"
import { View } from "../components"
import { useVectorContent } from "../vector"
import { useBatchedVectorContent } from "../painter"
import { useParticles } from "../particles"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

type Setter = (v: boolean) => void

async function mountLate(useHook: () => React.RefObject<any>) {
    let setReady: Setter = () => {}
    let el: any = null
    function App() {
        const [ready, set] = useState(false)
        setReady = set
        const ref = useHook()
        if (!ready) return null
        return <View ref={(e: any) => { (ref as any).current = e; el = e }} />
    }
    const container = createMockContainer()
    render(<App />, container as any)
    await flushMicrotasks()
    setReady(true)
    await flushMicrotasks()
    return { el: () => el, container }
}

describe("drawing hooks follow an element that mounts late", () => {
    it("useVectorContent", async () => {
        const { el, container } = await mountLate(() => useVectorContent(() => {}))
        expect(el().generateVisualContent).toBeTypeOf("function")
        unmount(container as any)
    })

    it("useBatchedVectorContent", async () => {
        const { el, container } = await mountLate(() => useBatchedVectorContent(() => {}))
        expect(el().generateVisualContent).toBeTypeOf("function")
        unmount(container as any)
    })
})

describe("useParticles follows an element that mounts late", () => {
    let create: ReturnType<typeof vi.fn>
    let dispose: ReturnType<typeof vi.fn>
    beforeEach(() => {
        dispose = vi.fn()
        create = vi.fn(() => ({ Dispose: dispose, SetEmitterTexture: vi.fn(), AliveCount: 0 }))
        ;(globalThis as any).CS.OneJS.ParticleBridge = { Create: create }
    })

    it("creates the system once the element exists, and disposes it on unmount", async () => {
        const { el, container } = await mountLate(() => {
            const ref = React.useRef(null)
            useParticles(ref, { emitters: [{ rate: 1 }] })
            return ref
        })
        expect(create).toHaveBeenCalledTimes(1)
        expect(create.mock.calls[0][0]).toBe(el())
        unmount(container as any)
        await flushMicrotasks()
        expect(dispose).toHaveBeenCalledTimes(1)
    })

    it("gives a running system a texture that loads after mount, without recreating it", async () => {
        // `texture: useTexture("glow.png")` is null on the first render
        const setTexture = vi.fn()
        create.mockImplementation(() => ({ Dispose: dispose, SetEmitterTexture: setTexture, AliveCount: 0 }))
        let setTex: (t: any) => void = () => {}
        function App() {
            const [tex, set] = useState<any>(null)
            setTex = set
            const ref = React.useRef(null)
            useParticles(ref, { texture: tex, emitters: [{ rate: 1 }, { rate: 1, texture: "own" }] })
            return <View ref={ref as any} />
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        expect(create).toHaveBeenCalledTimes(1)
        setTexture.mockClear()

        setTex("glow")
        await flushMicrotasks()
        expect(create).toHaveBeenCalledTimes(1)
        // The emitter with its own texture keeps it
        expect(setTexture.mock.calls).toEqual([[0, "glow"]])

        setTexture.mockClear()
        setTex("glow")
        await flushMicrotasks()
        expect(setTexture).not.toHaveBeenCalled()
        unmount(container as any)
        await flushMicrotasks()
    })
})
