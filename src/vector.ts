/**
 * Vector drawing utilities for OneJS.
 *
 * Provides Transform2D for applying 2D transformations to drawing coordinates,
 * since Unity's Painter2D doesn't have built-in transform support.
 *
 * Also provides useVectorContent hook for automatic repaint on dependency changes.
 */

import { useRef, useEffect, useCallback, type DependencyList, type RefObject } from 'react'
import type { Vector2, VisualElement, MeshGenerationContext, GenerateVisualContentCallback } from './types'

// Global declarations for Unity interop
declare const CS: {
    UnityEngine: {
        Vector2: new (x: number, y: number) => Vector2;
    };
};

/**
 * 2D transformation helper for vector drawing.
 *
 * Unity's Painter2D doesn't support transforms (translate, rotate, scale).
 * This class provides client-side matrix math to transform coordinates
 * before passing them to Painter2D methods.
 *
 * @example
 * import { Transform2D } from "onejs-react"
 *
 * <View
 *     style={{ width: 200, height: 200 }}
 *     onGenerateVisualContent={(mgc) => {
 *         const p = mgc.painter2D
 *         const t = new Transform2D()
 *
 *         // Center and rotate 45 degrees
 *         t.translate(100, 100)
 *         t.rotate(Math.PI / 4)
 *
 *         // Draw a square using transformed coordinates
 *         p.BeginPath()
 *         p.MoveTo(t.point(-40, -40))
 *         p.LineTo(t.point(40, -40))
 *         p.LineTo(t.point(40, 40))
 *         p.LineTo(t.point(-40, 40))
 *         p.ClosePath()
 *         p.Fill()
 *     }}
 * />
 */
export class Transform2D {
    // Current transformation matrix (a, b, c, d, e, f)
    // [ a  c  e ]   [ x ]   [ a*x + c*y + e ]
    // [ b  d  f ] * [ y ] = [ b*x + d*y + f ]
    // [ 0  0  1 ]   [ 1 ]   [       1       ]
    private _a: number = 1
    private _b: number = 0
    private _c: number = 0
    private _d: number = 1
    private _e: number = 0
    private _f: number = 0

    // State stack for save/restore
    private _stack: Array<[number, number, number, number, number, number]> = []

    /**
     * Save the current transformation state to the stack.
     * Use restore() to return to this state later.
     */
    save(): void {
        this._stack.push([this._a, this._b, this._c, this._d, this._e, this._f])
    }

    /**
     * Restore the most recently saved transformation state.
     * If the stack is empty, resets to identity.
     */
    restore(): void {
        const state = this._stack.pop()
        if (state) {
            [this._a, this._b, this._c, this._d, this._e, this._f] = state
        } else {
            this.reset()
        }
    }

    /**
     * Reset the transformation to identity (no transformation).
     */
    reset(): void {
        this._a = 1
        this._b = 0
        this._c = 0
        this._d = 1
        this._e = 0
        this._f = 0
    }

    /**
     * Apply a translation (move the origin).
     * @param x - Horizontal translation
     * @param y - Vertical translation
     */
    translate(x: number, y: number): void {
        // new_e = a*x + c*y + e
        // new_f = b*x + d*y + f
        this._e += this._a * x + this._c * y
        this._f += this._b * x + this._d * y
    }

    /**
     * Apply a rotation around the current origin.
     * @param angle - Rotation angle in radians (clockwise)
     */
    rotate(angle: number): void {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        // Multiply current matrix by rotation matrix
        const a = this._a * cos + this._c * sin
        const b = this._b * cos + this._d * sin
        const c = this._a * -sin + this._c * cos
        const d = this._b * -sin + this._d * cos

        this._a = a
        this._b = b
        this._c = c
        this._d = d
    }

    /**
     * Apply a scale transformation.
     * @param x - Horizontal scale factor
     * @param y - Vertical scale factor (defaults to x for uniform scale)
     */
    scale(x: number, y?: number): void {
        const sy = y ?? x

        this._a *= x
        this._b *= x
        this._c *= sy
        this._d *= sy
    }

    /**
     * Transform a point using the current transformation matrix.
     * @param x - X coordinate in local space
     * @param y - Y coordinate in local space
     * @returns Transformed point as Unity Vector2
     */
    point(x: number, y: number): Vector2 {
        const tx = this._a * x + this._c * y + this._e
        const ty = this._b * x + this._d * y + this._f
        return new CS.UnityEngine.Vector2(tx, ty)
    }

    /**
     * Transform multiple points at once.
     * @param coords - Array of [x, y] coordinate pairs
     * @returns Array of transformed Vector2 points
     *
     * @example
     * const corners = t.points([-40, -40], [40, -40], [40, 40], [-40, 40])
     * p.MoveTo(corners[0])
     * for (let i = 1; i < corners.length; i++) p.LineTo(corners[i])
     */
    points(...coords: [number, number][]): Vector2[] {
        return coords.map(([x, y]) => this.point(x, y))
    }

    /**
     * Get the raw transformation values.
     * Useful for debugging or advanced matrix operations.
     *
     * Returns [a, b, c, d, e, f] where:
     * - a, d: scale
     * - b, c: rotation/skew
     * - e, f: translation
     */
    get values(): [number, number, number, number, number, number] {
        return [this._a, this._b, this._c, this._d, this._e, this._f]
    }

    /**
     * Set the transformation matrix directly.
     * @param a - Horizontal scale (1 = no scale)
     * @param b - Vertical skew
     * @param c - Horizontal skew
     * @param d - Vertical scale (1 = no scale)
     * @param e - Horizontal translation
     * @param f - Vertical translation
     */
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
        this._a = a
        this._b = b
        this._c = c
        this._d = d
        this._e = e
        this._f = f
    }

    /**
     * Multiply the current matrix by another matrix.
     * @param a - Horizontal scale
     * @param b - Vertical skew
     * @param c - Horizontal skew
     * @param d - Vertical scale
     * @param e - Horizontal translation
     * @param f - Vertical translation
     */
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
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
    }
}

/**
 * Hook for vector drawing with automatic repaint on dependency changes.
 *
 * Returns a ref to attach to a VisualElement. When dependencies change,
 * automatically calls MarkDirtyRepaint() to trigger a redraw.
 *
 * @param draw - Drawing callback that receives MeshGenerationContext
 * @param deps - Dependency array (like useEffect) - repaint when these change
 * @returns Ref to attach to the element
 *
 * @example
 * ```tsx
 * function AnimatedCircle() {
 *     const [radius, setRadius] = useState(50)
 *
 *     const ref = useVectorContent((mgc) => {
 *         const p = mgc.painter2D
 *         const Angle = CS.UnityEngine.UIElements.Angle
 *
 *         p.fillColor = new CS.UnityEngine.Color(1, 0, 0, 1)
 *         p.BeginPath()
 *         p.Arc(
 *             new CS.UnityEngine.Vector2(100, 100),
 *             radius,
 *             Angle.Degrees(0),
 *             Angle.Degrees(360),
 *             CS.UnityEngine.UIElements.ArcDirection.Clockwise
 *         )
 *         p.Fill()
 *     }, [radius]) // Auto-repaints when radius changes
 *
 *     return <View ref={ref} style={{ width: 200, height: 200 }} />
 * }
 * ```
 */
export function useVectorContent(
    draw: GenerateVisualContentCallback,
    deps: DependencyList = []
): RefObject<VisualElement | null> {
    const ref = useRef<VisualElement | null>(null)
    const drawRef = useRef(draw)

    // Keep drawRef current
    drawRef.current = draw

    // Register callback and handle updates
    useEffect(() => {
        const element = ref.current
        if (!element) return

        // Create a stable wrapper that always calls the latest draw function
        const callback: GenerateVisualContentCallback = (mgc) => {
            drawRef.current(mgc)
        }

        // Assign the callback to generateVisualContent
        // Use unknown cast because VisualElement interface doesn't expose this property directly
        const el = element as unknown as { generateVisualContent: GenerateVisualContentCallback | null }
        el.generateVisualContent = callback

        // Initial repaint to render content
        element.MarkDirtyRepaint()

        return () => {
            // Clear callback on cleanup
            el.generateVisualContent = null
        }
    }, []) // Only run once on mount

    // Trigger repaint when dependencies change (but not on first render)
    const isFirstRender = useRef(true)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }

        const element = ref.current
        if (element) {
            element.MarkDirtyRepaint()
        }
    }, deps)

    return ref
}
