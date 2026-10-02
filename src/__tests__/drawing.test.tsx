/**
 * drawing and useDrawing are the taught names for batched vector drawing.
 * useDrawing takes the element's ref, like useParticles, and can repaint every
 * frame for drawings that animate on their own (a radar sweep).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React, { useRef, useState } from "react"
import { View } from "../components"
import { drawing, useDrawing, Painter } from "../painter"
import { setFrameClock } from "../frame"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

let execute: ReturnType<typeof vi.fn>
let frames = new Set<(dt: number) => void>()

beforeEach(() => {
    execute = vi.fn()
    ;(globalThis as any).CS.OneJS.PainterBridge = { Execute: execute }
    frames = new Set()
    setFrameClock((onFrame) => {
        frames.add(onFrame)
        return () => frames.delete(onFrame)
    })
})

afterEach(() => setFrameClock(null))

function tick() {
    for (const f of [...frames]) f(1 / 60)
}

describe("drawing", () => {
    it("records into a Painter and flushes in one crossing", () => {
        const draw = vi.fn((p: Painter) => p.beginPath().circle(5, 5, 4).fill())
        const paint = drawing(draw)
        paint({} as any)
        expect(draw).toHaveBeenCalledTimes(1)
        expect(execute).toHaveBeenCalledTimes(1)
    })
})

describe("useDrawing", () => {
    async function mount(deps?: React.DependencyList | "frame") {
        let el: any = null
        let setValue: (n: number) => void = () => {}
        const draws: number[] = []
        function App() {
            const [value, set] = useState(1)
            setValue = set
            const ref = useRef(null)
            useDrawing(ref, (p) => { draws.push(value); p.beginPath() }, deps === "frame" ? "frame" : [value])
            return <View ref={(e: any) => { (ref as any).current = e; el = e }} />
        }
        const container = createMockContainer()
        render(<App />, container as any)
        await flushMicrotasks()
        return { el: () => el, container, draws, setValue: async (n: number) => { setValue(n); await flushMicrotasks() } }
    }

    it("draws the latest render's closure into the element the ref points at", async () => {
        const { el, container, draws, setValue } = await mount()
        expect(el().generateVisualContent).toBeTypeOf("function")
        const repaint = vi.spyOn(el(), "MarkDirtyRepaint")
        await setValue(2)
        expect(repaint).toHaveBeenCalled()
        el().generateVisualContent({})
        expect(draws).toEqual([2])
        const element = el()
        unmount(container as any)
        await flushMicrotasks()
        expect(element.generateVisualContent).toBeNull()
    })

    it("repaints every frame with \"frame\", and stops on unmount", async () => {
        const { el, container } = await mount("frame")
        const repaint = vi.spyOn(el(), "MarkDirtyRepaint")
        tick()
        tick()
        expect(repaint).toHaveBeenCalledTimes(2)
        unmount(container as any)
        await flushMicrotasks()
        expect(frames.size).toBe(0)
    })
})
