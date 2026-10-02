import { useEffect, useRef, type RefObject } from "react"
import type { VisualElement } from "./types"

/**
 * Keeps something attached to whichever element `ref` currently points at.
 *
 * Hooks that hand back a ref cannot attach once on mount: the element may
 * render later than the hook (behind a loading state), or a key change may
 * replace it. This checks the ref after every commit, which is one identity
 * comparison, and moves the attachment when the element changes. `key`
 * changes force a reattach to the same element.
 *
 * Internal: not exported from the package.
 */
export function useAttachToRef(
    ref: RefObject<VisualElement | null>,
    attach: (element: VisualElement) => () => void,
    key: readonly unknown[] = [],
): void {
    const attachRef = useRef(attach)
    attachRef.current = attach
    const current = useRef<{ element: VisualElement, key: readonly unknown[], detach: () => void } | null>(null)

    useEffect(() => {
        const element = ref.current
        const live = current.current
        if (live && live.element === element && sameKey(live.key, key)) return
        if (live) {
            current.current = null
            live.detach()
        }
        if (element) current.current = { element, key, detach: attachRef.current(element) }
    })

    useEffect(() => () => {
        const live = current.current
        current.current = null
        live?.detach()
    }, [])
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
    return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}
