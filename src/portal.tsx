import { useState, useEffect, type ReactNode } from "react"
import { createPortal } from "./renderer"
import { getPortalLayer } from "./host-config"
import type { RenderContainer } from "./types"

export interface PortalProps {
    children: ReactNode
    /** Target element. Defaults to OneJS's shared overlay layer (last child of `__root`). */
    container?: RenderContainer
}

/**
 * Render `children` above the rest of the UI, outside the normal hierarchy.
 *
 * Zero setup: portals into a shared overlay layer that OneJS keeps as the last
 * child of `__root`, so modals, tooltips, and dropdowns always paint on top and
 * escape any `overflow: hidden` ancestor. Pass `container` to target a specific
 * element instead.
 *
 * Built on {@link createPortal}; reach for that directly only when you need a
 * custom target and want to manage draw order yourself.
 *
 * @example
 * function Modal({ onClose, children }) {
 *     return (
 *         <Portal>
 *             <View
 *                 style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
 *                          backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
 *                 onClick={onClose}
 *             >
 *                 <View onClick={(e) => e.stopPropagation()}>{children}</View>
 *             </View>
 *         </Portal>
 *     )
 * }
 */
export function Portal({ children, container }: PortalProps) {
    // The shared layer is appended to __root in an effect (after the app mounts) so
    // it lands last. It is therefore unavailable on the first render; we resolve it
    // post-mount, which adds one frame before the overlay appears. An explicit
    // container is used immediately, with no delay.
    const [layer, setLayer] = useState<RenderContainer | null>(container ?? null)

    useEffect(() => {
        if (!container) setLayer(getPortalLayer())
    }, [container])

    const target = container ?? layer
    return target ? createPortal(children, target) : null
}
