import { describe, it, expect, beforeEach, vi } from "vitest"
import { Painter, batchedVisualContent } from "../painter"

// Opcodes mirrored from painter.ts. These assertions cover the JS recorder's own
// output; they are NOT the guard that it agrees with C#, because this file never
// reads PainterBridge.cs. That guard is PainterOpcodeContractTests in the
// container repo, which is the only checkout holding both sides.
const OP = {
    BeginPath: 1, ClosePath: 2, MoveTo: 3, LineTo: 4, Arc: 5, ArcTo: 6,
    Bezier: 7, Quad: 8, Fill: 9, Stroke: 10, LineWidth: 11, FillColor: 12,
    StrokeColor: 13, LineCap: 14, LineJoin: 15, MiterLimit: 16,
    DashOffset: 17, DashPattern: 18,
}

describe("Painter command buffer", () => {
    let lastBuffer: Float32Array | null
    let executeSpy: ReturnType<typeof vi.fn>
    const mgc = {} as never

    beforeEach(() => {
        lastBuffer = null
        executeSpy = vi.fn((_mgc: unknown, buffer: Float32Array) => {
            lastBuffer = buffer
        })
        // setup.ts installs a fresh mock CS each test; augment it with PainterBridge.
        ;(globalThis as any).CS.OneJS.PainterBridge = { Execute: executeSpy }
    })

    it("flushes recorded ops as a Float32Array and resets", () => {
        const p = new Painter()
        p.beginPath()
        p.moveTo(10, 20)
        p.lineTo(30, 40)
        p.fill()

        expect(p.length).toBe(9)
        p.flush(mgc)

        expect(executeSpy).toHaveBeenCalledTimes(1)
        expect(lastBuffer).toBeInstanceOf(Float32Array)
        expect(Array.from(lastBuffer!)).toEqual([
            OP.BeginPath,
            OP.MoveTo, 10, 20,
            OP.LineTo, 30, 40,
            OP.Fill, 0, // default rule = NonZero
        ])
        // Buffer is reset after flush so the next repaint starts clean.
        expect(p.length).toBe(0)
    })

    it("applies defaults: arc direction Clockwise (0) and color alpha 1", () => {
        const p = new Painter()
        p.fillColor(0.5, 0.25, 0.125)
        p.arc(100, 100, 80, 0, 0.5)
        p.flush(mgc)

        expect(Array.from(lastBuffer!)).toEqual([
            OP.FillColor, 0.5, 0.25, 0.125, 1,
            OP.Arc, 100, 100, 80, 0, 0.5, 0, // dir default = Clockwise
        ])
    })

    it("honors explicit enum options", () => {
        const p = new Painter()
        p.lineCap(Painter.LineCap.Round)
        p.lineJoin(Painter.LineJoin.Bevel)
        p.fill(Painter.FillRule.OddEven)
        p.flush(mgc)

        expect(Array.from(lastBuffer!)).toEqual([
            OP.LineCap, 1,
            OP.LineJoin, 1,
            OP.Fill, 1,
        ])
    })

    it("flush is a no-op when nothing was recorded", () => {
        new Painter().flush(mgc)
        expect(executeSpy).not.toHaveBeenCalled()
    })

    it("methods are chainable", () => {
        const p = new Painter()
        const ret = p.beginPath().moveTo(0, 0).lineTo(1, 1)
        expect(ret).toBe(p)
    })

    it("batchedVisualContent reuses one buffer and does not accumulate across repaints", () => {
        const draw = (p: Painter) => {
            p.beginPath()
            p.moveTo(1, 2)
        }
        const callback = batchedVisualContent(draw)

        callback(mgc)
        const first = Array.from(lastBuffer!)
        callback(mgc)
        const second = Array.from(lastBuffer!)

        expect(executeSpy).toHaveBeenCalledTimes(2)
        expect(first).toEqual([OP.BeginPath, OP.MoveTo, 1, 2])
        // Second repaint is identical, not double-length: the painter cleared.
        expect(second).toEqual(first)
    })
})
