/**
 * useFrame runs a callback every frame with the seconds since the last one.
 * One loop serves every subscriber, and a host can replace the clock (oj's
 * runtime does, so carts follow its pause and its input edges).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React, { useState } from "react"
import { useFrame, setFrameClock } from "../frame"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

type RafCallback = (time: number) => void
let rafQueue: Array<{ id: number; callback: RafCallback }> = []
let nextRafId = 0

function frameAt(ms: number) {
    const queue = rafQueue
    rafQueue = []
    for (const { callback } of queue) callback(ms)
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
    setFrameClock(null)
    delete (globalThis as any).requestAnimationFrame
    delete (globalThis as any).cancelAnimationFrame
})

describe("useFrame", () => {
    it("passes seconds since the previous frame, from one loop for every subscriber", async () => {
        const a: number[] = []
        const b: number[] = []
        function App() {
            useFrame((dt) => a.push(dt))
            useFrame((dt) => b.push(dt))
            return null
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        expect(rafQueue.length).toBe(1)
        frameAt(1000)
        frameAt(1016)
        frameAt(1050)
        expect(a).toEqual([0, 0.016, 0.034])
        expect(b).toEqual(a)
        expect(rafQueue.length).toBe(1)

        unmount(container as any)
        await flushMicrotasks()
        frameAt(1066)
        expect(rafQueue.length).toBe(0)
        expect(a.length).toBe(3)
    })

    it("calls the latest render's callback without resubscribing", async () => {
        const seen: number[] = []
        let setCount: (n: number) => void = () => {}
        function App() {
            const [count, set] = useState(1)
            setCount = set
            useFrame(() => seen.push(count))
            return null
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        frameAt(0)
        setCount(2)
        await flushMicrotasks()
        frameAt(16)
        expect(seen).toEqual([1, 2])
        unmount(container as any)
        await flushMicrotasks()
    })

    it("keeps the other subscribers running when one throws", async () => {
        const seen: number[] = []
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        function App() {
            useFrame(() => { throw new Error("boom") })
            useFrame((dt) => seen.push(dt))
            return null
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        frameAt(0)
        frameAt(10)
        expect(seen).toEqual([0, 0.01])
        expect(error).toHaveBeenCalled()
        error.mockRestore()
        unmount(container as any)
        await flushMicrotasks()
    })

    it("runs on a clock a host installs", async () => {
        const subscribers = new Set<(dt: number) => void>()
        setFrameClock((onFrame) => {
            subscribers.add(onFrame)
            return () => subscribers.delete(onFrame)
        })
        const seen: number[] = []
        function App() {
            useFrame((dt) => seen.push(dt))
            return null
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        expect(rafQueue.length).toBe(0)
        for (const s of subscribers) s(0.5)
        expect(seen).toEqual([0.5])
        unmount(container as any)
        await flushMicrotasks()
        expect(subscribers.size).toBe(0)
    })
})
