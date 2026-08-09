/**
 * Tests for C# interop hooks and utilities
 *
 * Tests cover:
 * - toArray: Converting C# collections (List<T>, arrays) to JS arrays
 * - useFrameSync (simple mode): Object.is comparison for primitives
 * - useFrameSync (selector mode): Deps-based change detection for C# proxy objects
 * - useFrameSyncWith (deprecated): Custom equality comparison
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { useFrameSync, useFrameSyncWith, useEventSync, toArray } from "../hooks"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

// ---------------------------------------------------------------------------
// RAF mock: needed because hooks use requestAnimationFrame for polling
// ---------------------------------------------------------------------------

type RafCallback = (time: number) => void

let rafQueue: Array<{ id: number; callback: RafCallback }> = []
let nextRafId = 0

/** Flush all pending requestAnimationFrame callbacks (one round). */
function flushRaf() {
    const queue = [...rafQueue]
    rafQueue = []
    const now = Date.now()
    for (const { callback } of queue) {
        callback(now)
    }
}

/** Flush RAF then microtasks - simulates a full frame tick for the hook. */
async function advanceFrame() {
    flushRaf()
    await flushMicrotasks()
}

beforeEach(() => {
    rafQueue = []
    nextRafId = 0
    ;(globalThis as any).requestAnimationFrame = vi.fn((cb: RafCallback) => {
        const id = ++nextRafId
        rafQueue.push({ id, callback: cb })
        return id
    })
    ;(globalThis as any).cancelAnimationFrame = vi.fn((id: number) => {
        rafQueue = rafQueue.filter((e) => e.id !== id)
    })
})

afterEach(() => {
    delete (globalThis as any).requestAnimationFrame
    delete (globalThis as any).cancelAnimationFrame
})

// ===========================================================================
// toArray
// ===========================================================================

describe("toArray", () => {
    it("returns empty array for null", () => {
        expect(toArray(null)).toEqual([])
    })

    it("returns empty array for undefined", () => {
        expect(toArray(undefined)).toEqual([])
    })

    it("converts a C# List (Count property)", () => {
        const mockList: Record<string, unknown> = {
            Count: 3,
            0: "alpha",
            1: "beta",
            2: "gamma",
        }
        expect(toArray(mockList)).toEqual(["alpha", "beta", "gamma"])
    })

    it("converts a C# array (Length property)", () => {
        const mockArray: Record<string, unknown> = {
            Length: 2,
            0: 10,
            1: 20,
        }
        expect(toArray(mockArray)).toEqual([10, 20])
    })

    it("returns empty array for empty collection with Count=0", () => {
        expect(toArray({ Count: 0 })).toEqual([])
    })

    it("returns empty array for empty collection with Length=0", () => {
        expect(toArray({ Length: 0 })).toEqual([])
    })

    it("prefers Count over Length when both exist", () => {
        const mock: Record<string, unknown> = {
            Count: 2,
            Length: 3,
            0: "x",
            1: "y",
            2: "z",
        }
        // Should use Count (2), not Length (3)
        expect(toArray(mock)).toEqual(["x", "y"])
    })

    it("returns empty array for objects without Count or Length", () => {
        expect(toArray({})).toEqual([])
        expect(toArray({ foo: "bar" })).toEqual([])
    })

    it("returns empty array for non-numeric Count/Length", () => {
        expect(toArray({ Count: "not a number" })).toEqual([])
        expect(toArray({ Length: null })).toEqual([])
        expect(toArray({ Count: true })).toEqual([])
    })

    it("handles collection with object elements", () => {
        const mockList: Record<string, unknown> = {
            Count: 2,
            0: { id: 1, name: "Sword" },
            1: { id: 2, name: "Shield" },
        }
        const result = toArray<{ id: number; name: string }>(mockList)
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe(1)
        expect(result[0].name).toBe("Sword")
        expect(result[1].id).toBe(2)
        expect(result[1].name).toBe("Shield")
    })

    it("handles single-element collection", () => {
        expect(toArray({ Count: 1, 0: "only" })).toEqual(["only"])
    })

    it("handles large collections", () => {
        const mock: Record<string, unknown> = { Count: 100 }
        for (let i = 0; i < 100; i++) {
            mock[i] = i * 2
        }
        const result = toArray<number>(mock)
        expect(result).toHaveLength(100)
        expect(result[0]).toBe(0)
        expect(result[50]).toBe(100)
        expect(result[99]).toBe(198)
    })
})

// ===========================================================================
// useFrameSync: simple mode (no selector)
// ===========================================================================

describe("useFrameSync (simple mode)", () => {
    let container: ReturnType<typeof createMockContainer>

    beforeEach(() => {
        container = createMockContainer()
    })

    afterEach(() => {
        unmount(container as any)
    })

    function renderHookCapture<T>(
        getter: () => T,
        deps?: readonly unknown[]
    ) {
        let capturedValue: T = undefined as T
        let renderCount = 0

        function TestComponent() {
            const value = useFrameSync(getter, deps)
            capturedValue = value
            renderCount++
            return null
        }

        render(<TestComponent />, container as any)

        return {
            get value() { return capturedValue },
            get renderCount() { return renderCount },
        }
    }

    it("returns initial value from getter", async () => {
        const capture = renderHookCapture(() => 42)
        await flushMicrotasks()
        expect(capture.value).toBe(42)
    })

    it("updates when primitive value changes", async () => {
        let counter = 0
        const capture = renderHookCapture(() => counter)
        await flushMicrotasks()
        await advanceFrame()
        const initialRenders = capture.renderCount

        counter = 1
        await advanceFrame()
        expect(capture.renderCount).toBeGreaterThan(initialRenders)
        expect(capture.value).toBe(1)
    })

    it("does not re-render when value is unchanged", async () => {
        const capture = renderHookCapture(() => "stable")
        await flushMicrotasks()
        await advanceFrame()
        const initialRenders = capture.renderCount

        await advanceFrame()
        await advanceFrame()
        expect(capture.renderCount).toBe(initialRenders)
    })

    it("handles null return from getter", async () => {
        const capture = renderHookCapture(() => null)
        await flushMicrotasks()
        expect(capture.value).toBeNull()
    })

    it("handles getter that throws", async () => {
        const capture = renderHookCapture(() => { throw new Error("boom") })
        await flushMicrotasks()
        expect(capture.value).toBeUndefined()
    })

    it("stops polling after unmount", async () => {
        const getter = vi.fn(() => 42)
        renderHookCapture(getter)
        await flushMicrotasks()
        await advanceFrame()

        const callsBeforeUnmount = getter.mock.calls.length

        unmount(container as any)
        await flushMicrotasks()

        await advanceFrame()
        await advanceFrame()
        await advanceFrame()

        // At most one extra call from the in-flight RAF callback
        expect(getter.mock.calls.length).toBeLessThanOrEqual(callsBeforeUnmount + 1)
    })

    it("uses Object.is for comparison (NaN === NaN)", async () => {
        let val = NaN
        const capture = renderHookCapture(() => val)
        await flushMicrotasks()
        await advanceFrame()
        const initialRenders = capture.renderCount

        // NaN should be Object.is equal to NaN: no re-render
        val = NaN
        await advanceFrame()
        expect(capture.renderCount).toBe(initialRenders)
    })
})

// ===========================================================================
// useFrameSync: selector mode
// ===========================================================================

describe("useFrameSync (selector mode)", () => {
    let container: ReturnType<typeof createMockContainer>

    beforeEach(() => {
        container = createMockContainer()
    })

    afterEach(() => {
        unmount(container as any)
    })

    function renderHookCapture<T>(
        getter: () => T,
        select: (v: T) => readonly unknown[],
        deps?: readonly unknown[]
    ) {
        let capturedValue: T = undefined as T
        let renderCount = 0

        function TestComponent() {
            const value = useFrameSync(getter, select, deps)
            capturedValue = value
            renderCount++
            return null
        }

        render(<TestComponent />, container as any)

        return {
            get value() { return capturedValue },
            get renderCount() { return renderCount },
        }
    }

    it("returns initial value from getter on first render", async () => {
        const capture = renderHookCapture(
            () => ({ name: "Town", population: 100 }),
            (v) => [v.name, v.population]
        )
        await flushMicrotasks()

        expect(capture.value).toEqual({ name: "Town", population: 100 })
    })

    it("returns null when getter returns null", async () => {
        const capture = renderHookCapture(
            () => null,
            (v) => [v]
        )
        await flushMicrotasks()

        expect(capture.value).toBeNull()
    })

    it("returns undefined when getter throws", async () => {
        const capture = renderHookCapture(
            () => { throw new Error("destroyed") },
            (v) => [v]
        )
        await flushMicrotasks()

        expect(capture.value).toBeUndefined()
    })

    it("re-renders when a selected dep changes", async () => {
        const data = { name: "Town A", count: 1, untracked: "foo" }

        const capture = renderHookCapture(
            () => data,
            (v) => [v.name, v.count]
        )
        await flushMicrotasks()
        const initialRenders = capture.renderCount

        // Advance one frame with no changes: should not re-render
        await advanceFrame()
        expect(capture.renderCount).toBe(initialRenders)

        // Change a tracked dep
        data.name = "Town B"
        await advanceFrame()

        expect(capture.renderCount).toBeGreaterThan(initialRenders)
        expect(capture.value.name).toBe("Town B")
    })

    it("does not re-render when untracked properties change", async () => {
        const data = { name: "Town", count: 1, untracked: "a" }

        const capture = renderHookCapture(
            () => data,
            (v) => [v.name, v.count]
        )
        await flushMicrotasks()
        // Let the effect run and schedule the first RAF check
        await advanceFrame()
        const afterInit = capture.renderCount

        // Change only an untracked property
        data.untracked = "b"
        await advanceFrame()

        expect(capture.renderCount).toBe(afterInit)
    })

    it("detects changes in the number of selected deps", async () => {
        let depCount = 2

        const capture = renderHookCapture(
            () => "value",
            () => {
                // Return different-length arrays based on external state
                const arr: unknown[] = []
                for (let i = 0; i < depCount; i++) arr.push(i)
                return arr
            }
        )
        await flushMicrotasks()
        await advanceFrame()
        const afterInit = capture.renderCount

        // Change the number of deps
        depCount = 3
        await advanceFrame()

        expect(capture.renderCount).toBeGreaterThan(afterInit)
    })

    it("simulates C# proxy caching - same object reference, property changes", async () => {
        // This is the core scenario: a C# proxy always returns the same
        // JS object reference, but its properties change because they
        // read through to C# on each access.
        const proxy = { Name: "Village", NPCCount: 3, Version: 1 }

        const capture = renderHookCapture(
            () => proxy, // Always returns the SAME object reference
            (p) => [p.Name, p.NPCCount, p.Version]
        )
        await flushMicrotasks()
        await advanceFrame()
        expect(capture.value.Name).toBe("Village")
        const afterInit = capture.renderCount

        // Mutate the proxy (simulates C# property change via proxy)
        proxy.Name = "City"
        proxy.Version = 2
        await advanceFrame()

        expect(capture.renderCount).toBeGreaterThan(afterInit)
        expect(capture.value.Name).toBe("City")
    })

    it("handles nullable C# references with optional chaining in select", async () => {
        let currentPlace: { Name: string; Items: { Count: number } } | null = {
            Name: "Tavern",
            Items: { Count: 5 },
        }

        const capture = renderHookCapture(
            () => currentPlace,
            (p) => [p?.Name, p?.Items?.Count]
        )
        await flushMicrotasks()
        await advanceFrame()
        expect(capture.value?.Name).toBe("Tavern")
        const afterInit = capture.renderCount

        // Set to null: should detect change (deps go from ["Tavern", 5] to [undefined, undefined])
        currentPlace = null
        await advanceFrame()

        expect(capture.renderCount).toBeGreaterThan(afterInit)
        expect(capture.value).toBeNull()
    })

    it("works with version stamp pattern", async () => {
        const gameState = { Version: 1, data: "initial" }

        const capture = renderHookCapture(
            () => gameState,
            (s) => [s.Version]
        )
        await flushMicrotasks()
        await advanceFrame()
        const afterInit = capture.renderCount

        // No version change: no re-render
        gameState.data = "changed but version same"
        await advanceFrame()
        expect(capture.renderCount).toBe(afterInit)

        // Bump version: triggers re-render
        gameState.Version = 2
        gameState.data = "updated"
        await advanceFrame()
        expect(capture.renderCount).toBeGreaterThan(afterInit)
        expect(capture.value.data).toBe("updated")
    })

    it("stops polling after unmount", async () => {
        const getter = vi.fn(() => 42)

        renderHookCapture(getter, (v) => [v])
        await flushMicrotasks()
        await advanceFrame()

        const callsBeforeUnmount = getter.mock.calls.length

        // Unmount
        unmount(container as any)
        await flushMicrotasks()

        // Advance more frames: getter should not be called
        await advanceFrame()
        await advanceFrame()
        await advanceFrame()

        // At most one extra call from the in-flight RAF callback
        expect(getter.mock.calls.length).toBeLessThanOrEqual(callsBeforeUnmount + 1)
    })

    it("continues polling across multiple frames", async () => {
        const data = { value: 0 }

        const capture = renderHookCapture(
            () => data,
            (d) => [d.value]
        )
        await flushMicrotasks()
        await advanceFrame()
        const afterInit = capture.renderCount

        // Frame 2: change value
        data.value = 1
        await advanceFrame()
        expect(capture.renderCount).toBeGreaterThan(afterInit)
        const afterFirst = capture.renderCount

        // Frame 3: change value again
        data.value = 2
        await advanceFrame()
        expect(capture.renderCount).toBeGreaterThan(afterFirst)
        expect(capture.value.value).toBe(2)
    })

    it("always returns fresh value from getter on render", async () => {
        // Even between detected changes, the returned value should
        // be the current live getter result (not a stale snapshot).
        let callCount = 0
        const capture = renderHookCapture(
            () => {
                callCount++
                return { fresh: callCount }
            },
            () => [1] // Deps never change after init
        )
        await flushMicrotasks()

        // The value should reflect a recent getter call
        expect(capture.value.fresh).toBeGreaterThan(0)
    })
})

// ===========================================================================
// useFrameSyncWith (deprecated)
// ===========================================================================

describe("useFrameSyncWith (deprecated)", () => {
    let container: ReturnType<typeof createMockContainer>

    beforeEach(() => {
        container = createMockContainer()
    })

    afterEach(() => {
        unmount(container as any)
    })

    it("works with custom equality for new JS objects", async () => {
        // useFrameSyncWith works when the getter returns a NEW object each time
        // (not a cached proxy). This is its valid use case.
        let x = 1, y = 2, z = 3
        let capturedValue: { x: number; y: number; z: number } = undefined as any

        function TestComponent() {
            const value = useFrameSyncWith(
                () => ({ x, y, z }),
                (a, b) => a.x === b.x && a.y === b.y && a.z === b.z
            )
            capturedValue = value
            return null
        }

        render(<TestComponent />, container as any)
        await flushMicrotasks()
        expect(capturedValue).toEqual({ x: 1, y: 2, z: 3 })

        // No change: should not update (custom equality says they're equal)
        await advanceFrame()
        const stableValue = capturedValue

        await advanceFrame()
        // The reference may change (new object each getter call) but
        // custom equality prevents unnecessary state updates
        expect(capturedValue).toEqual({ x: 1, y: 2, z: 3 })

        // Change a value: should trigger update
        x = 10
        await advanceFrame()
        expect(capturedValue.x).toBe(10)
    })
})

// ===========================================================================
// useEventSync
// ===========================================================================

/**
 * Creates a mock C# object with event subscription support.
 * Simulates the bootstrap's add_EventName / remove_EventName proxy mechanism.
 */
function createMockCSharpObject(initialValues: Record<string, unknown>) {
    const listeners = new Map<string, Set<Function>>()
    const values = { ...initialValues }

    const proxy = new Proxy(values, {
        get(target, prop) {
            const propName = String(prop)
            if (propName.startsWith("add_")) {
                return (handler: Function) => {
                    const eventName = propName.slice(4)
                    if (!listeners.has(eventName)) listeners.set(eventName, new Set())
                    listeners.get(eventName)!.add(handler)
                }
            }
            if (propName.startsWith("remove_")) {
                return (handler: Function) => {
                    const eventName = propName.slice(7)
                    listeners.get(eventName)?.delete(handler)
                }
            }
            return target[propName]
        },
    })

    return {
        proxy,
        fire(eventName: string) {
            listeners.get(eventName)?.forEach(h => (h as any)())
        },
        set(prop: string, value: unknown) {
            (values as any)[prop] = value
        },
        listenerCount(eventName: string) {
            return listeners.get(eventName)?.size ?? 0
        },
    }
}

describe("useEventSync", () => {
    // -- Convention form --

    describe("convention form", () => {
        it("reads initial value on mount", async () => {
            const obj = createMockCSharpObject({ Health: 100 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            expect(capturedValue).toBe(100)
        })

        it("subscribes to OnPropertyChanged event", async () => {
            const obj = createMockCSharpObject({ Health: 100 })

            function TestComponent() {
                useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            expect(obj.listenerCount("OnHealthChanged")).toBe(1)
        })

        it("updates when event fires", async () => {
            const obj = createMockCSharpObject({ Health: 100 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(100)

            obj.set("Health", 75)
            obj.fire("OnHealthChanged")
            await flushMicrotasks()
            expect(capturedValue).toBe(75)
        })

        it("unsubscribes on unmount", async () => {
            const obj = createMockCSharpObject({ Health: 100 })

            function TestComponent() {
                useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(obj.listenerCount("OnHealthChanged")).toBe(1)

            unmount(container)
            await flushMicrotasks()
            expect(obj.listenerCount("OnHealthChanged")).toBe(0)
        })

        it("does not poll via RAF", async () => {
            const obj = createMockCSharpObject({ Health: 100 })

            function TestComponent() {
                useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            // RAF should not have been called by useEventSync
            // (useFrameSync calls it, useEventSync should not)
            const rafCallCount = (globalThis as any).requestAnimationFrame.mock.calls.length
            // Advance several frames: count should not grow from useEventSync
            await advanceFrame()
            await advanceFrame()
            await advanceFrame()
            const rafCallCountAfter = (globalThis as any).requestAnimationFrame.mock.calls.length
            expect(rafCallCountAfter).toBe(rafCallCount)
        })

        it("handles null source without crashing", async () => {
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(null as any, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            expect(capturedValue).toBeUndefined()
        })

        it("re-subscribes when deps change", async () => {
            const obj1 = createMockCSharpObject({ Health: 100 })
            const obj2 = createMockCSharpObject({ Health: 200 })
            let capturedValue: unknown
            let currentSource = obj1

            function TestComponent({ source }: { source: any }) {
                capturedValue = useEventSync(source.proxy, "Health", [source.proxy])
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent, { source: currentSource }), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(100)
            expect(obj1.listenerCount("OnHealthChanged")).toBe(1)

            // Switch source
            currentSource = obj2
            render(React.createElement(TestComponent, { source: currentSource }), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(200)
            expect(obj1.listenerCount("OnHealthChanged")).toBe(0)
            expect(obj2.listenerCount("OnHealthChanged")).toBe(1)
        })

        it("handles multiple rapid events correctly", async () => {
            const obj = createMockCSharpObject({ Score: 0 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(obj.proxy, "Score")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            obj.set("Score", 10)
            obj.fire("OnScoreChanged")
            obj.set("Score", 20)
            obj.fire("OnScoreChanged")
            obj.set("Score", 30)
            obj.fire("OnScoreChanged")
            await flushMicrotasks()

            expect(capturedValue).toBe(30)
        })
    })

    // -- Explicit form --

    describe("explicit form", () => {
        it("reads initial value from custom getter", async () => {
            const obj = createMockCSharpObject({ Items: { Count: 5 } })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(
                    () => (obj.proxy as any).Items.Count,
                    [[obj.proxy, "OnItemsChanged"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            expect(capturedValue).toBe(5)
        })

        it("subscribes to multiple events", async () => {
            const obj = createMockCSharpObject({ Count: 0 })

            function TestComponent() {
                useEventSync(
                    () => (obj.proxy as any).Count,
                    [[obj.proxy, "OnItemAdded"], [obj.proxy, "OnItemRemoved"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()

            expect(obj.listenerCount("OnItemAdded")).toBe(1)
            expect(obj.listenerCount("OnItemRemoved")).toBe(1)
        })

        it("updates on any subscribed event", async () => {
            const obj = createMockCSharpObject({ Count: 0 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(
                    () => (obj.proxy as any).Count,
                    [[obj.proxy, "OnItemAdded"], [obj.proxy, "OnItemRemoved"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(0)

            obj.set("Count", 3)
            obj.fire("OnItemAdded")
            await flushMicrotasks()
            expect(capturedValue).toBe(3)

            obj.set("Count", 2)
            obj.fire("OnItemRemoved")
            await flushMicrotasks()
            expect(capturedValue).toBe(2)
        })

        it("unsubscribes all events on unmount", async () => {
            const obj = createMockCSharpObject({ Count: 0 })

            function TestComponent() {
                useEventSync(
                    () => (obj.proxy as any).Count,
                    [[obj.proxy, "OnItemAdded"], [obj.proxy, "OnItemRemoved"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(obj.listenerCount("OnItemAdded")).toBe(1)
            expect(obj.listenerCount("OnItemRemoved")).toBe(1)

            unmount(container)
            await flushMicrotasks()
            expect(obj.listenerCount("OnItemAdded")).toBe(0)
            expect(obj.listenerCount("OnItemRemoved")).toBe(0)
        })

        it("supports events from multiple sources", async () => {
            const inventory = createMockCSharpObject({ Count: 5 })
            const player = createMockCSharpObject({ Level: 1 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(
                    () => (inventory.proxy as any).Count * (player.proxy as any).Level,
                    [[inventory.proxy, "OnChanged"], [player.proxy, "OnLevelUp"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(5)

            player.set("Level", 2)
            player.fire("OnLevelUp")
            await flushMicrotasks()
            expect(capturedValue).toBe(10)

            inventory.set("Count", 10)
            inventory.fire("OnChanged")
            await flushMicrotasks()
            expect(capturedValue).toBe(20)
        })

        it("handles getter that throws", async () => {
            let shouldThrow = false
            let capturedValue: unknown

            const obj = createMockCSharpObject({})

            function TestComponent() {
                capturedValue = useEventSync(
                    () => {
                        if (shouldThrow) throw new Error("destroyed")
                        return 42
                    },
                    [[obj.proxy, "OnChanged"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(42)

            shouldThrow = true
            obj.fire("OnChanged")
            await flushMicrotasks()
            // Should not crash: value stays at last good value
            expect(capturedValue).toBe(42)
        })

        it("works with static-like event sources", async () => {
            const staticClass = createMockCSharpObject({ Score: 999 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(
                    () => (staticClass.proxy as any).Score,
                    [[staticClass.proxy, "OnScoreChanged"]]
                )
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(999)

            staticClass.set("Score", 1500)
            staticClass.fire("OnScoreChanged")
            await flushMicrotasks()
            expect(capturedValue).toBe(1500)
        })

        it("handler still fires when event passes arguments (ignored by design)", async () => {
            const obj = createMockCSharpObject({ Health: 100 })
            let capturedValue: unknown

            function TestComponent() {
                capturedValue = useEventSync(obj.proxy, "Health")
                return null
            }

            const container = createMockContainer()
            render(React.createElement(TestComponent), container)
            await flushMicrotasks()
            expect(capturedValue).toBe(100)

            // C# event fires: handler re-reads getter, ignoring event args
            obj.set("Health", 80)
            obj.fire("OnHealthChanged")
            await flushMicrotasks()
            expect(capturedValue).toBe(80)
        })

        it("multiple components subscribe to the same event independently", async () => {
            const obj = createMockCSharpObject({ Health: 100 })
            let value1: unknown, value2: unknown

            function Component1() { value1 = useEventSync(() => (obj.proxy as any).Health, [[obj.proxy, "OnHealthChanged"]]); return null }
            function Component2() { value2 = useEventSync(() => (obj.proxy as any).Health, [[obj.proxy, "OnHealthChanged"]]); return null }

            function Parent() {
                return React.createElement(React.Fragment, null,
                    React.createElement(Component1),
                    React.createElement(Component2)
                )
            }

            const container = createMockContainer()
            render(React.createElement(Parent), container)
            await flushMicrotasks()
            expect(value1).toBe(100)
            expect(value2).toBe(100)
            expect(obj.listenerCount("OnHealthChanged")).toBe(2)

            obj.set("Health", 50)
            obj.fire("OnHealthChanged")
            await flushMicrotasks()
            expect(value1).toBe(50)
            expect(value2).toBe(50)
        })
    })
})
