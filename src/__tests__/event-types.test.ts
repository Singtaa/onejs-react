/**
 * Every handler receives the bootstrap's synthetic event, so every event type
 * carries its propagation surface. Type-level: `npm run typecheck` is the
 * check, the runtime assertion only keeps vitest from reporting an empty file.
 */

import { it, expect } from "vitest"
import type {
    PointerEventHandler, MouseEventHandler, WheelEventHandler, KeyEventHandler,
    ChangeEventHandler, FocusEventHandler, NavigationEventHandler, GeometryEventHandler,
} from "../types"

it("every event type carries the synthetic event surface", () => {
    const onPointer: PointerEventHandler = (e) => { e.stopPropagation(); e.preventDefault(); void e.target; void e.currentTarget }
    const onMouse: MouseEventHandler = (e) => { e.stopPropagation() }
    const onWheel: WheelEventHandler = (e) => { e.preventDefault(); void e.defaultPrevented }
    const onKey: KeyEventHandler = (e) => { e.preventDefault(); void e.propagationStopped }
    const onChange: ChangeEventHandler<number> = (e) => { e.stopPropagation() }
    const onFocus: FocusEventHandler = (e) => { e.stopPropagation() }
    const onNav: NavigationEventHandler = (e) => { e.preventDefault() }
    const onGeometry: GeometryEventHandler = (e) => { void e.currentTarget }
    expect([onPointer, onMouse, onWheel, onKey, onChange, onFocus, onNav, onGeometry]).toHaveLength(8)
})
