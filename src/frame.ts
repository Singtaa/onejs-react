/**
 * useFrame: run a callback every frame.
 *
 * Every subscriber shares one frame loop, so a screen with twenty animated
 * components asks for one requestAnimationFrame a frame, not twenty. A host
 * that drives frames itself (oj's runtime, which pauses and orders frames
 * after its input edges) installs its own clock with `setFrameClock`, and
 * every `useFrame` follows it.
 */

import { useEffect, useRef, type DependencyList } from "react"

declare function requestAnimationFrame(callback: (time: number) => void): number
declare function cancelAnimationFrame(id: number): void

/**
 * Subscribes `onFrame` to frames and returns the unsubscribe function.
 * `onFrame` receives the seconds since the previous frame.
 */
export type FrameClock = (onFrame: (dt: number) => void) => () => void

const listeners = new Set<(dt: number) => void>()
let frameId = 0
let lastTime = -1

function tick(time: number): void {
    const dt = lastTime < 0 ? 0 : (time - lastTime) / 1000
    lastTime = time
    frameId = requestAnimationFrame(tick)
    for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue
        try {
            listener(dt)
        } catch (e) {
            console.error("useFrame callback error:", e)
        }
    }
}

const animationFrameClock: FrameClock = (onFrame) => {
    listeners.add(onFrame)
    if (listeners.size === 1) frameId = requestAnimationFrame(tick)
    return () => {
        if (!listeners.delete(onFrame) || listeners.size > 0) return
        cancelAnimationFrame(frameId)
        lastTime = -1
    }
}

let clock: FrameClock = animationFrameClock

/** Internal: subscribes to whichever clock is installed now. */
export function subscribeFrame(onFrame: (dt: number) => void): () => void {
    return clock(onFrame)
}

/**
 * Replaces the clock every `useFrame` runs on, or restores the default
 * requestAnimationFrame clock with `null`. Call it before mounting: hooks
 * already subscribed stay on the clock they joined.
 */
export function setFrameClock(next: FrameClock | null): void {
    clock = next ?? animationFrameClock
}

/**
 * Runs `callback` every frame for as long as the component is mounted, with
 * the seconds since the previous frame (0 on the first).
 *
 * The callback that runs is the one from the latest render, so it can read
 * state and props directly. `deps` decides when to resubscribe, which is once
 * by default: an inline closure costs nothing extra per render.
 *
 * ```tsx
 * function Spinner() {
 *     const [angle, setAngle] = useState(0)
 *     useFrame((dt) => setAngle((a) => a + 90 * dt))
 *     return <View style={{ rotate: `${angle}deg` }} />
 * }
 * ```
 */
export function useFrame(callback: (dt: number) => void, deps: DependencyList = []): void {
    const latest = useRef(callback)
    latest.current = callback

    useEffect(() => subscribeFrame((dt) => latest.current(dt)),
        // deps decides when to resubscribe; the callback is read through the ref
        // eslint-disable-next-line react-hooks/exhaustive-deps
        deps)
}
