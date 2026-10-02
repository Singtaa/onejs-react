/**
 * Raw Painter2D drawing for OneJS: useVectorContent repaints an element's
 * generateVisualContent callback when deps change. Batched drawing (`drawing`,
 * `useDrawing`) is the faster path; Transform2D lives in transform.ts.
 */

import { useRef, useEffect, type DependencyList, type RefObject } from 'react'
import type { VisualElement, GenerateVisualContentCallback } from './types'
import { useAttachToRef } from './attach'

/**
 * Hook for vector drawing with automatic repaint on dependency changes.
 *
 * Returns a ref to attach to a VisualElement. When dependencies change,
 * automatically calls MarkDirtyRepaint() to trigger a redraw.
 *
 * @param draw: Drawing callback that receives MeshGenerationContext
 * @param deps: Dependency array (like useEffect), repaint when these change
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

    // Register the callback on whichever element the ref points at, including
    // one that mounts after this hook or replaces the first
    useAttachToRef(ref, (element) => {
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
    })

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
