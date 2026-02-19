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
import { useFrameSync, useFrameSyncWith, toArray } from "../hooks"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

// ---------------------------------------------------------------------------
// RAF mock — needed because hooks use requestAnimationFrame for polling
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

/** Flush RAF then microtasks — simulates a full frame tick for the hook. */
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
// useFrameSync — simple mode (no selector)
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

        // NaN should be Object.is equal to NaN — no re-render
        val = NaN
        await advanceFrame()
        expect(capture.renderCount).toBe(initialRenders)
    })
})

// ===========================================================================
// useFrameSync — selector mode
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

        // Advance one frame with no changes — should not re-render
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

    it("simulates C# proxy caching — same object reference, property changes", async () => {
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

        // Set to null — should detect change (deps go from ["Tavern", 5] to [undefined, undefined])
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

        // No version change — no re-render
        gameState.data = "changed but version same"
        await advanceFrame()
        expect(capture.renderCount).toBe(afterInit)

        // Bump version — triggers re-render
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

        // Advance more frames — getter should not be called
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

        // No change — should not update (custom equality says they're equal)
        await advanceFrame()
        const stableValue = capturedValue

        await advanceFrame()
        // The reference may change (new object each getter call) but
        // custom equality prevents unnecessary state updates
        expect(capturedValue).toEqual({ x: 1, y: 2, z: 3 })

        // Change a value — should trigger update
        x = 10
        await advanceFrame()
        expect(capturedValue.x).toBe(10)
    })
})
