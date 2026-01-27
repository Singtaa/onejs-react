import { useState, useEffect, useRef } from "react"

/**
 * Syncs a value from C# (or any external source) to React state, checking every frame.
 *
 * This hook eliminates the need for C# events or codegen - just read any property
 * and React will automatically update when it changes.
 *
 * @param getter - Function that returns the current value (called every frame)
 * @param deps - Optional dependency array (if getter depends on changing references)
 * @returns The current value, updated each frame if changed
 *
 * @example
 * // Sync a C# property to React
 * const health = useFrameSync(() => player.health)
 * const position = useFrameSync(() => transform.position)
 *
 * @example
 * // With dependencies (if the object reference can change)
 * const health = useFrameSync(() => currentPlayer.health, [currentPlayer])
 *
 * @example
 * // Derived values work too
 * const healthPercent = useFrameSync(() => player.health / player.maxHealth * 100)
 */
export function useFrameSync<T>(getter: () => T, deps: readonly unknown[] = []): T {
    // Safely get initial value
    const getInitialValue = (): T => {
        try {
            return getter()
        } catch {
            return undefined as T
        }
    }

    const [value, setValue] = useState<T>(getInitialValue)
    const lastValueRef = useRef<T>(value)
    const getterRef = useRef(getter)
    const runningRef = useRef(false)

    // Keep getter ref updated
    getterRef.current = getter

    useEffect(() => {
        // Re-initialize when deps change
        try {
            const initial = getterRef.current()
            lastValueRef.current = initial
            setValue(initial)
        } catch {
            // Getter failed, keep current value
        }

        runningRef.current = true

        const check = () => {
            if (!runningRef.current) return

            try {
                const current = getterRef.current()
                if (!Object.is(current, lastValueRef.current)) {
                    lastValueRef.current = current
                    setValue(current)
                }
            } catch {
                // Getter might fail if object was destroyed - that's ok
            }

            if (runningRef.current) {
                requestAnimationFrame(check)
            }
        }

        requestAnimationFrame(check)

        return () => {
            runningRef.current = false
        }
    }, deps)

    return value
}

/**
 * Similar to useFrameSync but with a custom equality function.
 * Useful for objects/structs where reference equality isn't sufficient.
 *
 * @param getter - Function that returns the current value
 * @param isEqual - Custom equality function
 * @param deps - Optional dependency array
 *
 * @example
 * // Sync a Vector3, comparing by value not reference
 * const pos = useFrameSyncWith(
 *     () => transform.position,
 *     (a, b) => a.x === b.x && a.y === b.y && a.z === b.z
 * )
 */
export function useFrameSyncWith<T>(
    getter: () => T,
    isEqual: (a: T, b: T) => boolean,
    deps: readonly unknown[] = []
): T {
    const getInitialValue = (): T => {
        try {
            return getter()
        } catch {
            return undefined as T
        }
    }

    const [value, setValue] = useState<T>(getInitialValue)
    const lastValueRef = useRef<T>(value)
    const getterRef = useRef(getter)
    const isEqualRef = useRef(isEqual)
    const runningRef = useRef(false)

    getterRef.current = getter
    isEqualRef.current = isEqual

    useEffect(() => {
        try {
            const initial = getterRef.current()
            lastValueRef.current = initial
            setValue(initial)
        } catch {
            // Getter failed, keep current value
        }

        runningRef.current = true

        const check = () => {
            if (!runningRef.current) return

            try {
                const current = getterRef.current()
                if (!isEqualRef.current(current, lastValueRef.current)) {
                    lastValueRef.current = current
                    setValue(current)
                }
            } catch {
                // Getter might fail if object was destroyed
            }

            if (runningRef.current) {
                requestAnimationFrame(check)
            }
        }

        requestAnimationFrame(check)

        return () => {
            runningRef.current = false
        }
    }, deps)

    return value
}

/**
 * Throttled version of useFrameSync that only checks at a specified interval.
 * Useful when you don't need per-frame updates and want to reduce overhead.
 *
 * @param getter - Function that returns the current value
 * @param intervalMs - How often to check for changes (in milliseconds)
 * @param deps - Optional dependency array
 *
 * @example
 * // Check every 100ms instead of every frame
 * const score = useThrottledSync(() => gameState.score, 100)
 */
export function useThrottledSync<T>(
    getter: () => T,
    intervalMs: number,
    deps: readonly unknown[] = []
): T {
    const getInitialValue = (): T => {
        try {
            return getter()
        } catch {
            return undefined as T
        }
    }

    const [value, setValue] = useState<T>(getInitialValue)
    const lastValueRef = useRef<T>(value)
    const getterRef = useRef(getter)

    getterRef.current = getter

    useEffect(() => {
        try {
            const initial = getterRef.current()
            lastValueRef.current = initial
            setValue(initial)
        } catch {
            // Getter failed, keep current value
        }

        const id = setInterval(() => {
            try {
                const current = getterRef.current()
                if (!Object.is(current, lastValueRef.current)) {
                    lastValueRef.current = current
                    setValue(current)
                }
            } catch {
                // Getter might fail if object was destroyed
            }
        }, intervalMs)

        return () => clearInterval(id)
    }, [...deps, intervalMs])

    return value
}
