/**
 * 2D affine transforms for vector drawing.
 *
 * Painter2D has no transform stack, so coordinates have to be transformed
 * before they are recorded. The matrix math has no C# in it; only point() and
 * points() make a CS Vector2, through makePoint, which oj overrides to return
 * its own Vector2 because a cart cannot reach CS.
 *
 * THREE DESIGN CONSTRAINTS WORTH KNOWING ABOUT
 *
 * 1. The path wrapper covers only the ops that take coordinates.
 *    t.path(p) returns a wrapper for moveTo, lineTo, the curves and arc.
 *    Colours, line width, fill, stroke and everything else stay on the painter
 *    itself. Mirroring Painter's whole surface would mean editing this file
 *    every time Painter grows a feature; covering only what needs transforming
 *    means this file never has to change again.
 *
 * 2. Nothing here allocates per point.
 *    t.path(p) allocates once per draw. Every coordinate after that is computed
 *    into locals. point() still exists and still allocates, because it is the
 *    convenient form and the original API; applyX/applyY are the hot-loop form.
 *
 * 3. arc is never silently wrong.
 *    A circle under a non-uniform scale is an ellipse, which Painter2D's Arc
 *    cannot express. Under translation, rotation and uniform scale the arc is
 *    forwarded natively, so behaviour is exactly what it would be with no
 *    transform. Under anything else it is flattened into cubic beziers, which
 *    is correct for any affine matrix. The flattened path is only reached in
 *    cases that have no native equivalent at all, so it can only be an
 *    improvement over forwarding a wrong arc.
 *
 * arcTo is deliberately absent rather than approximated. Calling it on the
 * wrapper is a compile error, which is better than a runtime surprise.
 *
 *     import { Transform2D, drawing } from "onejs-react"
 *
 *     onGenerateVisualContent={drawing((p) => {
 *         const t = new Transform2D()
 *         t.translate(100, 100).rotate(Math.PI / 4)
 *
 *         const path = t.path(p)
 *         path.beginPath()
 *         path.moveTo(-40, -40)
 *         path.lineTo(40, -40)
 *         path.lineTo(40, 40)
 *         path.closePath()
 *
 *         p.fillColor("#f00")
 *         p.fill()
 *     })}
 */

import type { Vector2 } from "./types"

declare const CS: { UnityEngine: { Vector2: new (x: number, y: number) => Vector2 } }

const TAU = Math.PI * 2

/** Clockwise, matching Painter.ArcDirection.Clockwise. */
const ARC_CLOCKWISE = 0

/** Largest sweep flattened into a single cubic bezier. */
const MAX_SEGMENT_SWEEP = Math.PI / 2

/**
 * The painter methods the transform wrapper forwards to.
 *
 * Declared structurally rather than importing Painter's concrete type, so this
 * module is not coupled to Painter's full surface and tests can pass a
 * recording fake.
 */
export interface PathSink {
    beginPath(): unknown
    closePath(): unknown
    moveTo(x: number, y: number): unknown
    lineTo(x: number, y: number): unknown
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): unknown
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): unknown
    arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, dir?: number): unknown
}

/**
 * A 2D affine transformation matrix with a save/restore stack.
 *
 *     [ a  c  e ]   [ x ]   [ a*x + c*y + e ]
 *     [ b  d  f ] * [ y ] = [ b*x + d*y + f ]
 *     [ 0  0  1 ]   [ 1 ]   [       1       ]
 *
 * Methods return this so calls chain. The original returned void; returning
 * this is a superset, so code written against either works.
 *
 * `P` is what point() returns: a CS Vector2 here, for raw Painter2D calls.
 */
export class Transform2D<P = Vector2> {
    private _a = 1
    private _b = 0
    private _c = 0
    private _d = 1
    private _e = 0
    private _f = 0

    private _stack: number[] = []

    /** Pushes the current matrix. Restore returns to it. */
    save(): this {
        this._stack.push(this._a, this._b, this._c, this._d, this._e, this._f)
        return this
    }

    /** Pops the most recently saved matrix. Resets to identity if the stack is empty. */
    restore(): this {
        if (this._stack.length < 6) return this.reset()
        this._f = this._stack.pop()!
        this._e = this._stack.pop()!
        this._d = this._stack.pop()!
        this._c = this._stack.pop()!
        this._b = this._stack.pop()!
        this._a = this._stack.pop()!
        return this
    }

    /** Returns to identity. Does not clear the save stack. */
    reset(): this {
        this._a = 1
        this._b = 0
        this._c = 0
        this._d = 1
        this._e = 0
        this._f = 0
        return this
    }

    /** How many matrices are currently saved. */
    get depth(): number {
        return this._stack.length / 6
    }

    translate(x: number, y: number): this {
        this._e += this._a * x + this._c * y
        this._f += this._b * x + this._d * y
        return this
    }

    /** Rotates around the current origin. Angle in radians. */
    rotate(angle: number): this {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const a = this._a * cos + this._c * sin
        const b = this._b * cos + this._d * sin
        const c = this._c * cos - this._a * sin
        const d = this._d * cos - this._b * sin
        this._a = a
        this._b = b
        this._c = c
        this._d = d
        return this
    }

    /** Scales. y defaults to x for a uniform scale. */
    scale(x: number, y?: number): this {
        const sy = y ?? x
        this._a *= x
        this._b *= x
        this._c *= sy
        this._d *= sy
        return this
    }

    /** Replaces the matrix outright. */
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): this {
        this._a = a
        this._b = b
        this._c = c
        this._d = d
        this._e = e
        this._f = f
        return this
    }

    /** Multiplies the current matrix by another. */
    transform(a: number, b: number, c: number, d: number, e: number, f: number): this {
        const a_ = this._a * a + this._c * b
        const b_ = this._b * a + this._d * b
        const c_ = this._a * c + this._c * d
        const d_ = this._b * c + this._d * d
        const e_ = this._a * e + this._c * f + this._e
        const f_ = this._b * e + this._d * f + this._f
        this._a = a_
        this._b = b_
        this._c = c_
        this._d = d_
        this._e = e_
        this._f = f_
        return this
    }

    /** The raw matrix, as [a, b, c, d, e, f]. */
    get values(): [number, number, number, number, number, number] {
        return [this._a, this._b, this._c, this._d, this._e, this._f]
    }

    /** Transformed x, without allocating. The hot-loop form of point(). */
    applyX(x: number, y: number): number {
        return this._a * x + this._c * y + this._e
    }

    /** Transformed y, without allocating. */
    applyY(x: number, y: number): number {
        return this._b * x + this._d * y + this._f
    }

    /** Transforms a point. Allocates; use applyX and applyY in hot loops. */
    point(x: number, y: number): P {
        return this.makePoint(this.applyX(x, y), this.applyY(x, y))
    }

    /** Transforms several points at once. */
    points(...coords: [number, number][]): P[] {
        return coords.map(([x, y]) => this.point(x, y))
    }

    /** Builds the point point() returns. Override to return another point type. */
    protected makePoint(x: number, y: number): P {
        return new CS.UnityEngine.Vector2(x, y) as unknown as P
    }

    /** The determinant. Negative means the transform includes a reflection. */
    get determinant(): number {
        return this._a * this._d - this._b * this._c
    }

    /**
     * Whether the matrix maps circles to circles without reflecting, which is
     * what lets an arc be forwarded natively instead of flattened.
     */
    get preservesCircles(): boolean {
        const { _a: a, _b: b, _c: c, _d: d } = this
        const magnitude = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
        const tol = 1e-9 * Math.max(1, magnitude * magnitude)
        return (
            this.determinant > 0 &&
            Math.abs(a * a + b * b - (c * c + d * d)) <= tol &&
            Math.abs(a * c + b * d) <= tol
        )
    }

    /**
     * Wraps a painter so path coordinates are transformed as they are recorded.
     * Allocates once per draw; nothing after that allocates per point.
     */
    path(sink: PathSink): TransformedPath {
        return new TransformedPath(this, sink)
    }
}

/**
 * A painter whose path coordinates pass through a transform.
 *
 * Covers only the coordinate-taking ops. Colours, widths, fill and stroke stay
 * on the painter, which is what keeps this class from needing edits every time
 * Painter grows.
 */
export class TransformedPath {
    private _t: Transform2D<unknown>
    private _sink: PathSink
    /** Whether the current subpath has a point yet, which decides moveTo vs lineTo. */
    private _hasCurrent = false

    constructor(transform: Transform2D<unknown>, sink: PathSink) {
        this._t = transform
        this._sink = sink
    }

    beginPath(): this {
        this._hasCurrent = false
        this._sink.beginPath()
        return this
    }

    closePath(): this {
        this._sink.closePath()
        return this
    }

    moveTo(x: number, y: number): this {
        this._sink.moveTo(this._t.applyX(x, y), this._t.applyY(x, y))
        this._hasCurrent = true
        return this
    }

    lineTo(x: number, y: number): this {
        this._sink.lineTo(this._t.applyX(x, y), this._t.applyY(x, y))
        this._hasCurrent = true
        return this
    }

    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
        const t = this._t
        this._sink.bezierCurveTo(
            t.applyX(c1x, c1y), t.applyY(c1x, c1y),
            t.applyX(c2x, c2y), t.applyY(c2x, c2y),
            t.applyX(x, y), t.applyY(x, y),
        )
        this._hasCurrent = true
        return this
    }

    quadraticCurveTo(cx: number, cy: number, x: number, y: number): this {
        const t = this._t
        this._sink.quadraticCurveTo(
            t.applyX(cx, cy), t.applyY(cx, cy),
            t.applyX(x, y), t.applyY(x, y),
        )
        this._hasCurrent = true
        return this
    }

    /**
     * An arc in untransformed space.
     *
     * Forwarded natively when the transform preserves circles, so behaviour
     * matches an untransformed arc exactly. Flattened into cubic beziers
     * otherwise, because a non-uniform scale turns the arc into an ellipse that
     * Painter2D's Arc cannot express.
     */
    arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, dir: number = ARC_CLOCKWISE): this {
        const t = this._t

        if (t.preservesCircles) {
            const [a, b] = t.values
            const scale = Math.sqrt(a * a + b * b)
            const rotation = Math.atan2(b, a)
            this._sink.arc(
                t.applyX(cx, cy),
                t.applyY(cx, cy),
                radius * scale,
                startAngle + rotation,
                endAngle + rotation,
                dir,
            )
            this._hasCurrent = true
            return this
        }

        return this._flattenArc(cx, cy, radius, startAngle, endAngle, dir)
    }

    /** Emits the arc as cubic beziers. Correct under any affine matrix. */
    private _flattenArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, dir: number): this {
        const sweep = normalizeSweep(startAngle, endAngle, dir)
        const t = this._t

        const startX = cx + radius * Math.cos(startAngle)
        const startY = cy + radius * Math.sin(startAngle)
        if (this._hasCurrent) {
            this.lineTo(startX, startY)
        } else {
            this.moveTo(startX, startY)
        }

        if (sweep === 0) return this

        const segments = Math.max(1, Math.ceil(Math.abs(sweep) / MAX_SEGMENT_SWEEP))
        const step = sweep / segments
        // Control-point distance for a cubic approximation of a circular arc.
        const k = (4 / 3) * Math.tan(step / 4) * radius

        let theta = startAngle
        for (let i = 0; i < segments; i++) {
            const next = theta + step
            const cosT = Math.cos(theta)
            const sinT = Math.sin(theta)
            const cosN = Math.cos(next)
            const sinN = Math.sin(next)

            const p0x = cx + radius * cosT
            const p0y = cy + radius * sinT
            const p3x = cx + radius * cosN
            const p3y = cy + radius * sinN

            // Tangents are (-sin, cos) at each end, scaled by k.
            const c1x = p0x - k * sinT
            const c1y = p0y + k * cosT
            const c2x = p3x + k * sinN
            const c2y = p3y - k * cosN

            this._sink.bezierCurveTo(
                t.applyX(c1x, c1y), t.applyY(c1x, c1y),
                t.applyX(c2x, c2y), t.applyY(c2x, c2y),
                t.applyX(p3x, p3y), t.applyY(p3x, p3y),
            )
            theta = next
        }

        this._hasCurrent = true
        return this
    }
}

/**
 * The signed sweep an arc covers, following Canvas semantics: clockwise sweeps
 * forward, counter-clockwise sweeps backward, and a full turn stays a full turn
 * rather than collapsing to zero.
 */
function normalizeSweep(startAngle: number, endAngle: number, dir: number): number {
    let sweep = endAngle - startAngle
    if (dir === ARC_CLOCKWISE) {
        if (sweep >= TAU) return TAU
        if (sweep < 0) sweep = ((sweep % TAU) + TAU) % TAU
        return sweep
    }
    if (sweep <= -TAU) return -TAU
    if (sweep > 0) sweep = -(((-sweep % TAU) + TAU) % TAU)
    return sweep
}
