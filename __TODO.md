# onejs-react Reconciler TODO

## High Impact - COMPLETED

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

### 3. More Events ✅
Added 40+ event handlers:

**Pointer Events:**
- [x] onClick
- [x] onPointerDown/Up/Move/Enter/Leave
- [x] onPointerCancel/Capture/CaptureOut/Stationary

**Mouse Events:**
- [x] onMouseDown/Up/Move/Enter/Leave/Over/Out
- [x] onWheel
- [x] onContextClick

**Focus Events:**
- [x] onFocus/Blur
- [x] onFocusIn/FocusOut (bubbling)

**Keyboard Events:**
- [x] onKeyDown/KeyUp

**Input Events:**
- [x] onChange
- [x] onInput

**Drag Events:**
- [x] onDragEnter/Leave/Updated/Perform/Exited

**Geometry Events:**
- [x] onGeometryChanged

**Navigation Events:**
- [x] onNavigationMove/Submit/Cancel

**Transition Events:**
- [x] onTransitionRun/Start/End/Cancel

**Other:**
- [x] onTooltip

---

## Developer Experience

### 4. Fix Test Type Errors ✅
Test type errors fixed by:
- Adding proper type annotations to hostConfig functions
- Using type assertions for react-reconciler compatibility (outdated @types)
- Creating wrapper functions for test helpers

### 5. Error Boundaries ✅
Added `ErrorBoundary` component with:
- Default fallback UI
- Custom fallback (ReactNode or function with error details)
- `onError` callback for logging
- `reset()` method to recover
- `formatError()` helper function

```tsx
import { ErrorBoundary } from "onejs-react"

// Basic usage
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={<Label>Error!</Label>}>
  <MyComponent />
</ErrorBoundary>

// With error details
<ErrorBoundary fallback={(error, info) => (
  <Label>Error: {error.message}</Label>
)}>
  <MyComponent />
</ErrorBoundary>
```

### 6. DevTools Integration (Future Work)

**Current state:** Basic `injectIntoDevTools` call exists but doesn't enable actual DevTools inspection since QuickJS lacks WebSocket support.

**Added utilities:**
- `flushSync(callback)` - Execute synchronously, flush all updates
- `batchedUpdates(callback)` - Batch multiple updates together
- `getDebugInfo()` - Get renderer version and active root count

**Full DevTools would require:**

1. **WebSocket bridge** - C# `ClientWebSocket` exposed to JS
2. **react-devtools-core backend** - Bundle and load before React
3. **Bootstrap integration** - Initialize DevTools before user code

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

### 9. Portals
`createPortal()` to render children into different UI Toolkit containers.

### 10. Suspense
Full Suspense support for async components and data fetching.
