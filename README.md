# onejs-react

React 19 reconciler for Unity's UI Toolkit.

## Files

| File | Purpose |
|------|---------|
| `src/host-config.ts` | React reconciler implementation (createInstance, commitUpdate, etc.) |
| `src/renderer.ts` | Entry point: `render(element, container)` |
| `src/components.tsx` | Component wrappers: View, Text, Label, Button, TextField, etc. |
| `src/screen.tsx` | Responsive design: ScreenProvider, useBreakpoint, useScreenSize, useResponsive |
| `src/types.ts` | TypeScript type definitions (includes Vector Drawing types) |
| `src/index.ts` | Package exports |

## Components

| Component | UI Toolkit Element | Description |
|-----------|-------------------|-------------|
| `View` | VisualElement | Container element |
| `Text` | TextElement | Primary text display |
| `Label` | Label | Form labels, semantic labeling |
| `Button` | Button | Interactive button |
| `TextField` | TextField | Text input |
| `Toggle` | Toggle | Checkbox/toggle |
| `Slider` | Slider | Numeric slider |
| `ScrollView` | ScrollView | Scrollable container |
| `Image` | Image | Image display |
| `ListView` | ListView | Virtualized list |
| `TreeView` | TreeView | Virtualized tree (nested `rootItems`, data-resolving `bindItem`) |

**Raw text in JSX** (e.g., `<View>Hello</View>`) creates a `TextElement`, providing semantic distinction from explicit `<Label>` components.

## Usage

```tsx
import { render, View, Text, Label, Button } from 'onejs-react';

function App() {
    return (
        <View style={{ padding: 20 }}>
            <Text text="Welcome!" style={{ fontSize: 24 }} />
            <Button text="Click me" onClick={() => console.log('clicked')} />
            <View>Raw text also works</View>
        </View>
    );
}

render(<App />, __root);
```

## Type Usage Guide

OneJS has multiple type sources. Here's when to use each:

### React Components (Most Common)

Import types from `onejs-react` for refs and component props:

```tsx
import { View, Button, VisualElement, ButtonElement } from "onejs-react"

function MyComponent() {
    const viewRef = useRef<VisualElement>(null)
    const buttonRef = useRef<ButtonElement>(null)

    useEffect(() => {
        buttonRef.current?.Focus()
    }, [])

    return (
        <View ref={viewRef}>
            <Button ref={buttonRef} text="Click me" />
        </View>
    )
}
```

### Imperative Element Creation

For creating elements outside React, use `unity-types`:

```tsx
import { Button } from "UnityEngine.UIElements"

const btn = new Button()
btn.text = "Dynamic Button"
__root.Add(btn)
```

### render() Container

The `render()` function accepts any `RenderContainer`:

```tsx
import { render, RenderContainer } from "onejs-react"

// __root is provided by the runtime
render(<App />, __root)
```

### Unmounting & hot-reload teardown

`unmount(container)` tears a root down **synchronously** (`updateContainerSync` + `flushSyncWork` + `flushPassiveEffects`), so `useEffect`/`useLayoutEffect` cleanup functions fire immediately instead of on a later scheduler tick. `unmountAll()` does the same for every active root.

The first `render()` call registers `unmountAll` as a runtime teardown hook (`globalThis.__onTeardown`). The OneJS runtime invokes it right before destroying the JS context on hot reload / stop, so component cleanups run while the context is still alive. Without this, cleanups would be skipped on hot reload and stale C# subscriptions (e.g. from `useEventSync`) would leak across reloads.

### Type Hierarchy

```
RenderContainer         (minimal: __csHandle, __csType)
    └── VisualElement   (full API: style, hierarchy, events)
        ├── TextElement (+ text property)
        │   ├── LabelElement
        │   └── ButtonElement
        ├── TextFieldElement (+ value, isPasswordField, etc.)
        ├── ToggleElement    (+ value: boolean)
        ├── SliderElement    (+ value, lowValue, highValue)
        └── ScrollViewElement (+ scrollOffset, ScrollTo)
```

### Portals

`<Portal>` renders children above the rest of the UI (modals, tooltips, dropdowns). UI Toolkit has no `z-index` and `overflow: hidden` clips children, so a deeply-nested overlay gets clipped and stuck below later siblings. `<Portal>` mounts into a shared overlay layer that onejs-react keeps as the last child of `__root`, so overlays always paint on top. Zero setup.

```tsx
import { Portal, View } from "onejs-react"

function Modal({ children }) {
    return (
        <Portal>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
                {children}
            </View>
        </Portal>
    )
}
```

The layer ignores picking when empty, so a closed overlay never blocks the app.

`<Portal>` is built on `createPortal(children, container, key?)` (the OneJS equivalent of `react-dom`'s `createPortal`), exported for when you need a specific target. With a custom target you own draw order, so prefer `<Portal>` for overlays.

> Use the exports from `onejs-react`, not `react-dom`. The latter targets the browser DOM and will not work here.

## Key Concepts

- **Element types**: Use `ojs-` prefix internally (e.g., `ojs-view`, `ojs-button`) to avoid conflicts with HTML types
- **Style shorthands**: `padding`/`margin` are expanded to individual properties (UI Toolkit requirement)
- **Style cleanup**: When props change, removed style properties are cleared (not just new ones applied)
- **className updates**: Selective add/remove of classes (not full clear + reapply)
- **Event handlers**: Registered via `__eventAPI` from QuickJSBootstrap.js
- **Instance structure**: `{ element, type, props, eventHandlers: Map, appliedStyleKeys: Set }`

## Build & Test

```bash
npm run typecheck  # TypeScript check (no build output - consumed directly by App)
npm test           # Run test suite
npm run test:watch # Run tests in watch mode
```

## Testing

Test suite uses Vitest with mocked Unity CS globals. Tests are in `src/__tests__/`:

| File | Coverage |
|------|----------|
| `host-config.test.ts` | Instance creation, style/className management, events, children |
| `renderer.test.tsx` | Integration tests: render(), unmount(), createPortal(), React state, effects |
| `components.test.tsx` | Component wrappers, prop passing, event mapping |
| `mocks.ts` | Mock implementations of Unity UI Toolkit classes |
| `setup.ts` | Global test setup for CS, __eventAPI |

## Vector Drawing

OneJS exposes Unity's `Painter2D` API for GPU-accelerated vector graphics. Any element can render custom vector content via `onGenerateVisualContent`.

### Basic Usage

```tsx
import { View, render } from "onejs-react"

function Circle() {
    return (
        <View
            style={{ width: 200, height: 200, backgroundColor: "#333" }}
            onGenerateVisualContent={(mgc) => {
                const p = mgc.painter2D

                // Draw a filled circle
                p.fillColor = new CS.UnityEngine.Color(1, 0, 0, 1) // Red
                p.BeginPath()
                p.Arc(
                    new CS.UnityEngine.Vector2(100, 100), // center
                    80,                                   // radius
                    CS.UnityEngine.UIElements.Angle.Degrees(0),
                    CS.UnityEngine.UIElements.Angle.Degrees(360),
                    CS.UnityEngine.UIElements.ArcDirection.Clockwise
                )
                p.Fill(CS.UnityEngine.UIElements.FillRule.NonZero)
            }}
        />
    )
}
```

### Painter2D Methods

Path operations:
- `BeginPath()`: Start a new path
- `ClosePath()`: Close the current subpath
- `MoveTo(point)`: Move to point without drawing
- `LineTo(point)`: Draw line to point
- `Arc(center, radius, startAngle, endAngle, direction)`: Draw arc
- `ArcTo(p1, p2, radius)`: Draw arc tangent to two lines
- `BezierCurveTo(cp1, cp2, end)`: Cubic bezier curve
- `QuadraticCurveTo(cp, end)`: Quadratic bezier curve

Rendering:
- `Fill(fillRule)`: Fill the current path
- `Stroke()`: Stroke the current path

Properties:
- `fillColor`: Fill color (Unity Color)
- `strokeColor`: Stroke color (Unity Color)
- `lineWidth`: Stroke width in pixels
- `lineCap`: Line cap style (Butt, Round, Square)
- `lineJoin`: Line join style (Miter, Round, Bevel)

### Triggering Repaints

Use `MarkDirtyRepaint()` to trigger a repaint when drawing state changes:

```tsx
function AnimatedCircle() {
    const ref = useRef<VisualElement>(null)
    const [radius, setRadius] = useState(50)

    useEffect(() => {
        // Trigger repaint when radius changes
        ref.current?.MarkDirtyRepaint()
    }, [radius])

    return (
        <View
            ref={ref}
            style={{ width: 200, height: 200 }}
            onGenerateVisualContent={(mgc) => {
                const p = mgc.painter2D
                p.fillColor = new CS.UnityEngine.Color(0, 0.5, 1, 1)
                p.BeginPath()
                p.Arc(
                    new CS.UnityEngine.Vector2(100, 100),
                    radius,
                    CS.UnityEngine.UIElements.Angle.Degrees(0),
                    CS.UnityEngine.UIElements.Angle.Degrees(360),
                    CS.UnityEngine.UIElements.ArcDirection.Clockwise
                )
                p.Fill(CS.UnityEngine.UIElements.FillRule.NonZero)
            }}
        />
    )
}
```

### Differences from HTML5 Canvas

| Feature | Unity Painter2D | HTML5 Canvas |
|---------|-----------------|--------------|
| Transforms | Manual point calculation | Built-in translate/rotate/scale |
| Gradients | Limited (strokeGradient) | Full linear/radial/conic |
| State Stack | Not built-in | save()/restore() |
| Text | Via MeshGenerationContext.DrawText() | fillText/strokeText |
| Shadows | Not available | shadowBlur, shadowColor |
| Clipping | Via nested VisualElements | clip() path-based |

### Types

The following types are re-exported from `unity-types`:

```typescript
type Vector2 = CS.UnityEngine.Vector2
type Color = CS.UnityEngine.Color
type Angle = CS.UnityEngine.UIElements.Angle
type ArcDirection = CS.UnityEngine.UIElements.ArcDirection
type Painter2D = CS.UnityEngine.UIElements.Painter2D
type MeshGenerationContext = CS.UnityEngine.UIElements.MeshGenerationContext
type GenerateVisualContentCallback = (context: MeshGenerationContext) => void
```

## C# Interop Utilities

### `toArray<T>(collection): T[]`

Converts C# collections (`List<T>`, arrays) to JavaScript arrays. C# collections exposed through the OneJS proxy have `.Count`/`.Length` and indexers but lack `.map()`, `.filter()`, and other array methods.

```tsx
import { toArray } from "onejs-react"

// Convert a C# List for use in JSX
{toArray<Item>(inventory.Items).map(item => <ItemView key={item.Id} item={item} />)}

// Convert a C# array
const resolutions = toArray<Resolution>(Screen.resolutions)

// Safe with null - returns []
const npcs = toArray(currentPlace?.NPCs)
```

Supports objects with `.Count` (List, IList) or `.Length` (C# arrays). Returns `[]` for null/undefined.

## Dependencies

- `react-reconciler@0.31.x` (React 19 compatible)
- `vitest` (dev): Test runner
- Peer: `react@18.x || 19.x`
