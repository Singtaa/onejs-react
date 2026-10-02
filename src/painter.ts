/**
 * Batched vector drawing for OneJS.
 *
 * A Painter records drawing ops into a flat numeric buffer and flushes them to
 * C# in a single crossing via CS.OneJS.PainterBridge.Execute, instead of making
 * one reflection crossing per Painter2D call (and per `new Vector2`/`new Color`)
 * the way raw mgc.painter2D usage does. On the QuickJS interpreter those
 * per-op crossings are the dominant cost of custom vector drawing.
 *
 * Wrap a draw function with `drawing` and the flush is automatic, or use
 * `useDrawing(ref, draw, deps)` from a component:
 *
 *     import { drawing } from "onejs-react"
 *
 *     <View
 *         style={{ width: 200, height: 200 }}
 *         onGenerateVisualContent={drawing((p) => {
 *             p.fillColor("#f00")
 *             p.beginPath()
 *             p.circle(100, 100, 80)
 *             p.fill()
 *         })}
 *     />
 *
 * Gradients, textures, and DrawText are not part of the buffer; for those keep
 * using the raw mgc.painter2D / mgc API.
 */

import { useRef, useEffect, type DependencyList, type RefObject } from "react"
import type { VisualElement, MeshGenerationContext, GenerateVisualContentCallback } from "./types"
import { useAttachToRef } from "./attach"
import { subscribeFrame } from "./frame"

declare const CS: {
    OneJS: {
        PainterBridge: {
            Execute: (mgc: MeshGenerationContext, buffer: Float32Array) => void
        }
    }
}

// Opcode contract: must match Assets/Singtaa/OneJS/Runtime/PainterBridge.cs.
const OP_BEGIN_PATH = 1
const OP_CLOSE_PATH = 2
const OP_MOVE_TO = 3
const OP_LINE_TO = 4
const OP_ARC = 5
const OP_ARC_TO = 6
const OP_BEZIER_CURVE_TO = 7
const OP_QUADRATIC_CURVE_TO = 8
const OP_FILL = 9
const OP_STROKE = 10
const OP_LINE_WIDTH = 11
const OP_FILL_COLOR = 12
const OP_STROKE_COLOR = 13
const OP_LINE_CAP = 14
const OP_LINE_JOIN = 15
const OP_MITER_LIMIT = 16
const OP_DASH_OFFSET = 17
const OP_DASH_PATTERN = 18

/**
 * Records Painter2D drawing ops into a numeric buffer for batched playback.
 *
 * Methods are chainable. Coordinates and colors are plain numbers (no CS object
 * construction), which is the whole point: the buffer crosses to C# once and
 * the structs are built C#-side.
 *
 * Enum-like options live as statics so they do not collide with the CS enum
 * type aliases (ArcDirection, FillRule, ...) re-exported from the package root:
 *   p.arc(..., Painter.ArcDirection.CounterClockwise)
 *   p.fill(Painter.FillRule.OddEven)
 */
/** "#rgb", "#rrggbb" or "#rrggbbaa" to 0..1 components; opacity overrides the alpha. */
export function paintColor(c: string | number, g?: number, b?: number, a = 1): [number, number, number, number] {
    if (typeof c === "number") return [c, g ?? 0, b ?? 0, a]
    const m = /^#([0-9a-fA-F]{3,8})$/.exec(c.trim())
    if (m === null) throw new Error(`[onejs-react] Painter: "${c}" is not a colour; use #rgb, #rrggbb or #rrggbbaa`)
    const h = m[1]!
    const grab = (i: number, n: number) => parseInt(n === 1 ? h[i]! + h[i]! : h.slice(i * 2, i * 2 + 2), 16) / 255
    const opacity = g
    if (h.length === 3) return [grab(0, 1), grab(1, 1), grab(2, 1), opacity ?? 1]
    if (h.length === 6) return [grab(0, 2), grab(1, 2), grab(2, 2), opacity ?? 1]
    if (h.length === 8) return [grab(0, 2), grab(1, 2), grab(2, 2), opacity ?? grab(3, 2)]
    throw new Error(`[onejs-react] Painter: "${c}" is not a colour; use #rgb, #rrggbb or #rrggbbaa`)
}

export class Painter {
    /** Stroke cap style. Values are the buffer contract, not Unity enum values. */
    static readonly LineCap = { Butt: 0, Round: 1 } as const
    /** Stroke join style. */
    static readonly LineJoin = { Miter: 0, Bevel: 1, Round: 2 } as const
    /** Fill rule for self-intersecting paths. */
    static readonly FillRule = { NonZero: 0, OddEven: 1 } as const
    /** Arc sweep direction. */
    static readonly ArcDirection = { Clockwise: 0, CounterClockwise: 1 } as const

    private _buf: number[] = []

    /** Discard all recorded ops, keeping allocated capacity for reuse. */
    clear(): this {
        this._buf.length = 0
        return this
    }

    /** Number of recorded floats. Useful for diagnostics and tests. */
    get length(): number {
        return this._buf.length
    }

    beginPath(): this { this._buf.push(OP_BEGIN_PATH); return this }
    closePath(): this { this._buf.push(OP_CLOSE_PATH); return this }
    moveTo(x: number, y: number): this { this._buf.push(OP_MOVE_TO, x, y); return this }
    lineTo(x: number, y: number): this { this._buf.push(OP_LINE_TO, x, y); return this }

    /** Arc with center (cx, cy). Angles in radians. dir uses Painter.ArcDirection. */
    arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, dir: number = 0 /* Clockwise */): this {
        this._buf.push(OP_ARC, cx, cy, radius, startAngle, endAngle, dir)
        return this
    }

    /** A full circle, added to the current path. The common case of arc. */
    circle(cx: number, cy: number, radius: number): this {
        return this.arc(cx, cy, radius, 0, Math.PI * 2)
    }
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): this {
        this._buf.push(OP_ARC_TO, x1, y1, x2, y2, radius)
        return this
    }

    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
        this._buf.push(OP_BEZIER_CURVE_TO, c1x, c1y, c2x, c2y, x, y)
        return this
    }

    quadraticCurveTo(cx: number, cy: number, x: number, y: number): this {
        this._buf.push(OP_QUADRATIC_CURVE_TO, cx, cy, x, y)
        return this
    }

    /** Fill the current path. rule uses Painter.FillRule (default NonZero). */
    fill(rule: number = 0 /* NonZero */): this { this._buf.push(OP_FILL, rule); return this }
    stroke(): this { this._buf.push(OP_STROKE); return this }

    lineWidth(w: number): this { this._buf.push(OP_LINE_WIDTH, w); return this }
    /**
     * Fill colour: a hex string with an optional opacity, or four 0..1 floats.
     *
     *     p.fillColor("#ff9e33")          p.fillColor("#ff9e33", 0.5)
     *     p.fillColor(1, 0.62, 0.2, 1)
     *
     * The string form is the one to write; every other colour in OneJS is a
     * hex string, and four positional floats were the least readable line in
     * every painter game.
     */
    fillColor(color: string, opacity?: number): this
    fillColor(r: number, g: number, b: number, a?: number): this
    fillColor(c: string | number, g?: number, b?: number, a: number = 1): this {
        const [r, gg, bb, aa] = paintColor(c, g, b, a)
        this._buf.push(OP_FILL_COLOR, r, gg, bb, aa); return this
    }
    /** Stroke colour, written like fillColor. */
    strokeColor(color: string, opacity?: number): this
    strokeColor(r: number, g: number, b: number, a?: number): this
    strokeColor(c: string | number, g?: number, b?: number, a: number = 1): this {
        const [r, gg, bb, aa] = paintColor(c, g, b, a)
        this._buf.push(OP_STROKE_COLOR, r, gg, bb, aa); return this
    }
    lineCap(cap: number): this { this._buf.push(OP_LINE_CAP, cap); return this }
    lineJoin(join: number): this { this._buf.push(OP_LINE_JOIN, join); return this }
    miterLimit(limit: number): this { this._buf.push(OP_MITER_LIMIT, limit); return this }
    dashOffset(offset: number): this { this._buf.push(OP_DASH_OFFSET, offset); return this }
    dashPattern(dash: number, gap: number): this { this._buf.push(OP_DASH_PATTERN, dash, gap); return this }

    /**
     * Send all recorded ops to C# in one crossing, then reset the buffer.
     * No-op when nothing was recorded.
     */
    flush(mgc: MeshGenerationContext): void {
        if (this._buf.length === 0) return
        CS.OneJS.PainterBridge.Execute(mgc, Float32Array.from(this._buf))
        this._buf.length = 0
    }
}

/**
 * Turns a draw function into an `onGenerateVisualContent` callback. The draw
 * records into a reused Painter, and everything it drew crosses to C# in one
 * call per repaint.
 *
 * ```tsx
 * <View
 *     style={{ width: 100, height: 100 }}
 *     onGenerateVisualContent={drawing((p) => p.fillColor("#f80").beginPath().circle(50, 50, 40).fill())}
 * />
 * ```
 */
export function drawing(draw: (p: Painter) => void): GenerateVisualContentCallback {
    const painter = new Painter()
    return (mgc: MeshGenerationContext) => {
        painter.clear()
        draw(painter)
        painter.flush(mgc)
    }
}

/** @deprecated Use `drawing`. */
export const batchedVisualContent = drawing

/**
 * Draws into the element behind `ref`, with the draw function from the latest
 * render. It repaints when `deps` change, or every frame with `"frame"` for a
 * drawing that moves on its own.
 *
 * ```tsx
 * const ref = useRef(null)
 * useDrawing(ref, (p) => p.strokeColor("#0f8").beginPath().arc(50, 50, 40, 0, sweep).stroke(), [sweep])
 * return <View ref={ref} style={{ width: 100, height: 100 }} />
 * ```
 */
export function useDrawing(
    ref: RefObject<VisualElement | null>,
    draw: (p: Painter) => void,
    deps: DependencyList | "frame" = [],
): void {
    useDrawInto(ref, draw)
    const everyFrame = deps === "frame"

    useEffect(() => {
        if (!everyFrame) return
        return subscribeFrame(() => ref.current?.MarkDirtyRepaint())
    }, [everyFrame, ref])

    useRepaintOnChange(ref, everyFrame ? [] : deps as DependencyList)
}

/**
 * @deprecated Use `useDrawing(ref, draw, deps)`, which takes the ref like
 * `useParticles` does.
 */
export function useBatchedVectorContent(
    draw: (p: Painter) => void,
    deps: DependencyList = []
): RefObject<VisualElement | null> {
    const ref = useRef<VisualElement | null>(null)
    useDrawInto(ref, draw)
    useRepaintOnChange(ref, deps)
    return ref
}

function useDrawInto(ref: RefObject<VisualElement | null>, draw: (p: Painter) => void): void {
    const drawRef = useRef(draw)
    drawRef.current = draw

    useAttachToRef(ref, (element) => {
        const paint = drawing((p) => drawRef.current(p))
        const el = element as unknown as { generateVisualContent: GenerateVisualContentCallback | null }
        el.generateVisualContent = paint
        element.MarkDirtyRepaint()
        return () => {
            el.generateVisualContent = null
        }
    })
}

function useRepaintOnChange(ref: RefObject<VisualElement | null>, deps: DependencyList): void {
    const isFirstRender = useRef(true)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        ref.current?.MarkDirtyRepaint()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
}
