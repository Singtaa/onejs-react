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

### 4. Fix Test Type Errors
The test suite has many TypeScript errors that should be cleaned up.

### 5. Error Boundaries
Better error messages when things go wrong in the reconciler.

### 6. DevTools Integration
React DevTools support for debugging component trees.

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
