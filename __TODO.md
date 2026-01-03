# onejs-react Reconciler TODO

## High Impact

### 1. `ref` Support
Allow React refs to access underlying UI Toolkit elements:
```tsx
const labelRef = useRef<Label>(null)
<Label ref={labelRef}>Hello</Label>

// Later:
labelRef.current.style.color = "red"
```

**Implementation:**
- Update `getPublicInstance()` to return the CSObject element
- Handle `ref` prop in `createInstance` and `commitUpdate`
- Support both callback refs and RefObject
- Consider what to expose: raw element vs wrapped instance

---

### 2. Mixed Content Ordering
Currently `<Label>A <Icon/> B</Label>` merges text but loses ordering with non-text children.

**Current behavior:**
- Text children ("A", "B") merge into label.text = "AB"
- Icon added as visual child
- Result: "AB" displayed, then Icon below

**Expected behavior:**
- Render as: A, Icon, B (inline or in order)

**Options:**
a) Don't merge when non-text siblings exist (fallback to separate TextElements)
b) Use nested VisualElements to maintain order
c) Document as limitation - use explicit `<Text>` components for mixed content

**Recommendation:** Option (a) - detect mixed content and skip merging

---

### 3. More Events
Add comprehensive event support matching UI Toolkit capabilities:

**Pointer Events:**
- [x] onClick
- [x] onPointerDown
- [x] onPointerUp
- [x] onPointerMove
- [x] onPointerEnter
- [x] onPointerLeave
- [ ] onPointerCancel
- [ ] onPointerCapture
- [ ] onPointerCaptureOut

**Mouse Events:**
- [ ] onMouseDown
- [ ] onMouseUp
- [ ] onMouseMove
- [ ] onMouseEnter
- [ ] onMouseLeave
- [ ] onMouseOver
- [ ] onMouseOut
- [ ] onWheel
- [ ] onContextMenu (right-click)

**Drag Events:**
- [ ] onDragStart (DragEnterEvent)
- [ ] onDrag (DragUpdatedEvent)
- [ ] onDragEnd (DragExitedEvent)
- [ ] onDrop (DragPerformEvent)

**Scroll Events:**
- [ ] onScroll

**Keyboard Events:**
- [x] onKeyDown
- [x] onKeyUp
- [ ] onKeyPress (deprecated but useful)

**Focus Events:**
- [x] onFocus
- [x] onBlur
- [ ] onFocusIn (bubbles)
- [ ] onFocusOut (bubbles)

**Input Events:**
- [x] onChange
- [ ] onInput
- [ ] onSubmit

**Touch Events (mobile):**
- [ ] onTouchStart
- [ ] onTouchMove
- [ ] onTouchEnd
- [ ] onTouchCancel

**Geometry Events:**
- [ ] onGeometryChanged
- [ ] onLayout (alias for geometry)

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
