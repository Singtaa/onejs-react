# onejs-react Reconciler TODO

## High Impact: COMPLETED

### 1. `ref` Support ✅
Refs now point to the actual UI Toolkit element (CSObject).

```tsx
import { useRef } from "react"
import { LabelElement } from "onejs-react"

const labelRef = useRef<LabelElement>(null)
<Label ref={labelRef}>Hello</Label>

// Access the element:
labelRef.current.style.color = "red"
labelRef.current.Focus()
labelRef.current.AddToClassList("highlight")
```

Element types exported: `VisualElement`, `TextElement`, `LabelElement`, `ButtonElement`, `TextFieldElement`, `ToggleElement`, `SliderElement`, `ScrollViewElement`, `ImageElement`

---

### 2. Mixed Content Ordering ✅
When non-text children are added to a text-merge parent (Label/Text/Button), all text children are "unmerged" and added as separate TextElement children to preserve order.

```tsx
// This now renders correctly: A, then View, then B
<Label>A <View /> B</Label>
```

Implementation: `hasMixedContent` flag + `unmergTextChildren()` function

---

### Keyed Reorder Insertion Order ✅
When a keyed array sits next to a trailing static sibling, reordering the array moves a reused child, which React commits as `insertBefore(parent, child, staticSibling)`. Unity's `VisualElement.Insert(i, child)` calls `child.RemoveFromHierarchy()` *before* placing it at index `i`, so a naive `IndexOf(beforeChild)` + `Insert` overshoots when the moved child currently sits before the target, landing it *past* the static sibling.

```tsx
// The ADD button stays last even when the keyed list reorders
<View>
    {items.map(it => <Slot key={it.id} />)}
    <PaletteButton />
</View>
```

Implementation: `insertElementBefore()` helper (targets `beforeIndex - 1` when the child precedes `beforeChild`), used by both `insertBefore` and `insertInContainerBefore`. Note: freshly-mounted children never overshoot. Only reused/moved ones do.

---

### 3. More Events (partly wired)
40 event props are typed and listed in `EVENT_PROPS` (`host-config.ts`). An unchecked box below is typed but never fires: `QuickJSUIBridge.cs` registers no UI Toolkit callback for it, so the handler is silently ignored. Wire it in the runtime or delete the prop.

**Pointer Events:**
- [x] onClick
- [x] onPointerDown/Up/Move/Enter/Leave
- [x] onPointerCancel/Capture/CaptureOut

**Mouse Events:**
- [ ] onMouseDown/Up/Move/Enter/Leave/Over/Out
- [x] onWheel
- [ ] onContextClick

**Focus Events:**
- [x] onFocus/Blur
- [x] onFocusIn/FocusOut (bubbling)

**Keyboard Events:**
- [x] onKeyDown/KeyUp

**Input Events:**
- [x] onChange
- [ ] onInput

**Drag Events:**
- [ ] onDragEnter/Leave/Updated/Perform/Exited

**Geometry Events:**
- [x] onGeometryChanged

**Navigation Events:**
- [x] onNavigationMove/Submit/Cancel

**Transition Events:**
- [ ] onTransitionRun/Start/End/Cancel

**Other:**
- [ ] onTooltip

---

## Developer Experience

### 4. Fix Test Type Errors ✅
Test type errors fixed by:
- Adding proper type annotations to hostConfig functions
- Using type assertions for react-reconciler compatibility (outdated @types)
- Creating wrapper functions for test helpers

### 5. Error Boundaries ✅
`ErrorBoundary` follows react-error-boundary's shape:
- Default fallback UI
- `fallbackRender={({ error, errorInfo, reset }) => ...}` (`errorInfo` is null on the first fallback render)
- `resetKeys`: resets when an entry changes
- `onError` and `onReset` callbacks; the root logs each caught error once
- `fallback` (node or `(error, errorInfo) => node`) kept, deprecated
- `formatError()` helper function

```tsx
import { ErrorBoundary } from "onejs-react"

<ErrorBoundary resetKeys={[levelId]} fallbackRender={({ error, reset }) => (
    <Button text={`${error.message}: retry`} onClick={reset} />
)}>
    <Level id={levelId} />
</ErrorBoundary>
```

### 6. DevTools Integration (Future Work)

**Current state:** Basic `injectIntoDevTools` call exists but doesn't enable actual DevTools inspection. The bootstrap now has a `WebSocket` (C# `ClientWebSocket` via `WebSocketBridge` natively, the browser's on WebGL), so the transport below exists; the backend and bootstrap wiring do not.

**Added utilities:**
- `flushSync(callback)`: Execute synchronously, flush all updates
- `batchedUpdates(callback)`: Batch multiple updates together
- `getDebugInfo()`: Get renderer version and active root count

**Full DevTools would require:**

1. ~~**WebSocket bridge**: C# `ClientWebSocket` exposed to JS~~ (done: bootstrap `WebSocket`)
2. **react-devtools-core backend**: Bundle and load before React
3. **Bootstrap integration**: Initialize DevTools before user code

Architecture (React Native approach):
```
QuickJS ──WebSocket polyfill──► C# WebSocket ──► DevTools Standalone (port 8097)
```

Alternative: `connectWithCustomMessagingProtocol` for non-WebSocket transport.

See: [react-devtools-core](https://www.npmjs.com/package/react-devtools-core)

---

## Performance

### 7. Style Diffing
Only update changed style properties instead of reapplying all.

### 8. Batch Text Rebuilds
If multiple merged text children update in one render, rebuild parent text once.

---

## Advanced Features

### 9. Portals ✅
`createPortal()` and `<Portal>` (shared overlay layer) shipped; see README "Portals".

### 10. Suspense
Full Suspense support for async components and data fetching.
