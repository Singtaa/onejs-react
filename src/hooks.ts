import { useState, useEffect, useRef, useReducer } from "react"

// QuickJS environment declarations
declare function requestAnimationFrame(callback: (time: number) => void): number;
declare function cancelAnimationFrame(id: number): void;

/**
 * Syncs a value from C# (or any external source) to React state, checking every frame.
 *
 * Has two modes depending on whether a `select` function is provided:
 *
 * **Simple mode** (no selector): Compares values with `Object.is`. Best for primitives
 * (numbers, strings, booleans) and cases where the getter returns a new object each time.
 *
 * **Selector mode**: Extracts an array of comparable values to watch. Re-renders only when
 * any selected value changes. Essential for C# proxy objects where the proxy reference is
 * cached — without a selector, you'd be comparing the same proxy to itself.
 * The returned value is always read fresh from the getter during render.
 *
 * @param getter - Function that returns the current value (called every frame)
 * @param selectOrDeps - Either a selector function or a dependency array
 * @param deps - Optional dependency array (only when using a selector)
 * @returns The current value, updated each frame if changed
 *
 * @example
 * // Simple: sync a C# property (primitives)
 * const health = useFrameSync(() => player.Health)
 * const score = useFrameSync(() => gameManager.Score)
 *
 * @example
 * // Selector: watch specific properties on a C# proxy object
 * const place = useFrameSync(
 *     () => gameState.currentPlace,
 *     (p) => [p?.Name, p?.NPCs?.Count, p?.Items?.Count]
 * )
 *
 * @example
 * // Selector: with a version stamp from C#
 * const quest = useFrameSync(
 *     () => questManager.activeQuest ?? null,
 *     (q) => [q?.Version]
 * )
 *
 * @example
 * // Simple with dependencies (if the source reference can change)
 * const health = useFrameSync(() => currentPlayer.Health, [currentPlayer])
 */
export function useFrameSync<T>(
    getter: () => T,
    selectOrDeps?: ((value: T) => readonly unknown[]) | readonly unknown[],
    deps?: readonly unknown[]
): T {
    // Determine which mode we're in
    const hasSelector = typeof selectOrDeps === "function"
    const select = hasSelector ? selectOrDeps as (value: T) => readonly unknown[] : undefined
    const effectDeps = hasSelector ? (deps ?? []) : (selectOrDeps as readonly unknown[] ?? [])

    if (select) {
        return useFrameSyncSelect(getter, select, effectDeps)
    } else {
        return useFrameSyncSimple(getter, effectDeps)
    }
}

/** Simple mode: compare with Object.is. */
function useFrameSyncSimple<T>(getter: () => T, deps: readonly unknown[]): T {
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

    getterRef.current = getter

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

/** Selector mode: extract comparable values, always return fresh from getter. */
function useFrameSyncSelect<T>(
    getter: () => T,
    select: (value: T) => readonly unknown[],
    deps: readonly unknown[]
): T {
    const [, forceRender] = useReducer((x: number) => x + 1, 0)
    const getterRef = useRef(getter)
    const selectRef = useRef(select)
    const lastSelectedRef = useRef<readonly unknown[]>([])
    const runningRef = useRef(false)
    const initializedRef = useRef(false)

    getterRef.current = getter
    selectRef.current = select

    // Initialize dependency tracking on first render
    if (!initializedRef.current) {
        initializedRef.current = true
        try {
            const val = getter()
            lastSelectedRef.current = select(val)
        } catch {
            // Getter or select failed, keep empty deps
        }
    }

    useEffect(() => {
        try {
            const val = getterRef.current()
            lastSelectedRef.current = selectRef.current(val)
        } catch {
            // Getter or select failed
        }

        runningRef.current = true

        const check = () => {
            if (!runningRef.current) return

            try {
                const current = getterRef.current()
                const selected = selectRef.current(current)
                const prev = lastSelectedRef.current
                const changed = selected.length !== prev.length ||
                    selected.some((val, i) => !Object.is(val, prev[i]))

                if (changed) {
                    lastSelectedRef.current = selected
                    forceRender()
                }
            } catch {
                // Getter or select might fail if object was destroyed
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

    // Always read fresh from getter during render.
    // This ensures we return the latest proxy with current C# state.
    try {
        return getterRef.current()
    } catch {
        return undefined as T
    }
}

/**
 * @deprecated Use `useFrameSync` with a selector instead.
 *
 * `useFrameSyncWith` compares the value returned by the getter using a custom
 * equality function. However, this does NOT work with C# proxy objects because
 * the proxy reference is cached — you end up comparing the same object to itself.
 *
 * Instead, use `useFrameSync` with a selector that extracts comparable values:
 * ```ts
 * // Before (broken with C# proxies):
 * const pos = useFrameSyncWith(
 *     () => transform.position,
 *     (a, b) => a.x === b.x && a.y === b.y && a.z === b.z
 * )
 *
 * // After (works correctly):
 * const pos = useFrameSync(
 *     () => transform.position,
 *     (p) => [p.x, p.y, p.z]
 * )
 * ```
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

/**
 * Converts a C# collection (List<T>, array, etc.) to a JavaScript array.
 *
 * C# collections exposed through the OneJS proxy are not JS arrays — they
 * lack .map(), .filter(), and other array methods. This utility converts
 * them for use in React rendering.
 *
 * Supports objects with a `.Count` property (List<T>, IList) or a `.Length`
 * property (C# arrays). Returns an empty array for null/undefined input.
 *
 * @param collection - A C# collection, or null/undefined
 * @returns A JavaScript array containing the elements
 *
 * @example
 * // Map over a C# List in JSX
 * {toArray(inventory.Items).map(item => <ItemView key={item.Id} item={item} />)}
 *
 * @example
 * // Convert a C# array
 * const renderers = toArray(go.GetComponentsInChildren(CS.UnityEngine.Renderer))
 *
 * @example
 * // Safe with null — returns []
 * const npcs = toArray(currentPlace?.NPCs)
 *
 * @example
 * // With explicit type parameter
 * const items = toArray<Item>(questLog.ActiveQuests)
 */
export function toArray<T = unknown>(collection: unknown): T[] {
    if (collection == null) return []
    const col = collection as Record<string, unknown>
    const len = typeof col.Count === "number" ? col.Count
              : typeof col.Length === "number" ? col.Length
              : 0
    const result: T[] = []
    for (let i = 0; i < len; i++) {
        result.push((col as any)[i])
    }
    return result
}

/**
 * Event source descriptor for useEventSync: [sourceObject, eventName].
 * The eventName should NOT include the "add_" / "remove_" prefix.
 */
export type EventSource = [source: object, eventName: string]

/**
 * Syncs a value from C# to React state via event subscription instead of polling.
 * Zero work when nothing changes — the getter is only called when an event fires.
 *
 * Use this instead of `useFrameSync` when C# fires events on state change.
 * `useFrameSync` polls every frame (causing GC pressure); `useEventSync` does
 * zero work between events.
 *
 * **Convention form**: Derives the getter and event name from a property name.
 * `useEventSync(source, "Health")` subscribes to `source.add_OnHealthChanged`
 * and reads `source.Health`. The C# side must have an event named `On{Prop}Changed`.
 *
 * **Explicit form**: User-provided getter and event descriptors.
 * Supports multiple event sources, static events, and derived state.
 *
 * If the source object can be null or change over time, pass it in deps:
 * `useEventSync(player, "Health", [player])`
 *
 * Events must fire on Unity's main thread (the normal case for MonoBehaviour methods).
 *
 * @example
 * // Convention: subscribes to player.add_OnHealthChanged, reads player.Health
 * const health = useEventSync(player, "Health")
 *
 * @example
 * // Convention with deps (required if source can change or start null)
 * const health = useEventSync(currentPlayer, "Health", [currentPlayer])
 *
 * @example
 * // Explicit: custom getter, multiple events
 * const itemCount = useEventSync(
 *     () => inventory.Items.Count,
 *     [[inventory, "OnItemAdded"], [inventory, "OnItemRemoved"]]
 * )
 *
 * @example
 * // Explicit: static events
 * const state = useEventSync(
 *     () => CS.GameManager.Score,
 *     [[CS.GameManager, "OnScoreChanged"]]
 * )
 */
export function useEventSync<T>(getter: () => T, events: EventSource[], deps?: readonly unknown[]): T
export function useEventSync(source: object, propertyName: string, deps?: readonly unknown[]): unknown
export function useEventSync<T>(
    sourceOrGetter: object | (() => T),
    propOrEvents: string | EventSource[],
    depsOrNothing?: readonly unknown[]
): T {
    if (typeof sourceOrGetter === "function") {
        return useEventSyncImpl(
            sourceOrGetter as () => T,
            propOrEvents as EventSource[],
            depsOrNothing ?? []
        )
    }

    const source = sourceOrGetter
    const propName = propOrEvents as string
    return useEventSyncImpl(
        () => source ? (source as any)[propName] : undefined,
        source ? [[source, `On${propName}Changed`]] : [],
        depsOrNothing ?? []
    )
}

function useEventSyncImpl<T>(
    getter: () => T,
    events: EventSource[],
    deps: readonly unknown[]
): T {
    const [value, setValue] = useState<T>(() => {
        try { return getter() } catch { return undefined as T }
    })
    const getterRef = useRef(getter)
    getterRef.current = getter

    useEffect(() => {
        try { setValue(getterRef.current()) } catch {}

        const handler = () => {
            try { setValue(getterRef.current()) } catch {}
        }

        for (const [source, eventName] of events) {
            try {
                const addFn = (source as any)[`add_${eventName}`]
                if (typeof addFn === "function") addFn(handler)
            } catch {}
        }

        return () => {
            for (const [source, eventName] of events) {
                try {
                    const removeFn = (source as any)[`remove_${eventName}`]
                    if (typeof removeFn === "function") removeFn(handler)
                } catch {}
            }
        }
    }, deps)

    return value
}
