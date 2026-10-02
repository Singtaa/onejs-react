# onejs-react

React 19 reconciler for Unity's UI Toolkit.

## Install

```bash
npm install onejs-react
```

npm adds the peers `react` and `unity-types`. A OneJS project already has this package, and its `types/global.d.ts` declares the runtime globals that this package's source and the examples below use (`__root`, `console`, the timers). Outside a OneJS project, copy that file (OneJS's `Editor/Templates/global.d.ts.txt`), or TypeScript reports `Cannot find name '__root'`, and `console` and `setInterval` inside this package.

## Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Package exports (the only entry point) |
| `src/host-config.ts` | React reconciler implementation (createInstance, commitUpdate, etc.), event prop table, `registerElement` |
| `src/renderer.ts` | `render`, `unmount`, `unmountAll`, `createPortal`, `flushSync`, `batchedUpdates`, `getDebugInfo` |
| `src/components.tsx` | Component wrappers (View, Text, ... FrostedGlass, ShaderEffect, TextureFX, Flame), `createComponent`, `clearImageCache` |
| `src/portal.tsx` | `<Portal>` and the shared overlay layer |
| `src/error-boundary.tsx` | `ErrorBoundary`, `formatError` |
| `src/screen.tsx` | Responsive design: ScreenProvider, useBreakpoint, useScreenSize, useResponsive, useMediaQuery |
| `src/hooks.ts` | C# sync hooks (`useFrameSync`, `useFrameSyncWith`, `useThrottledSync`, `useEventSync`) and `toArray` |
| `src/style-parser.ts` | Converts style values (`"100px"`, `"#ff0000"`, enums) to UI Toolkit values |
| `src/vector.ts` | `Transform2D` and `useVectorContent` for `Painter2D` drawing |
| `src/painter.ts` | Batched drawing: `Painter`, `batchedVisualContent`, `useBatchedVectorContent` |
| `src/particles.ts` | 2D particle control plane: `useParticles`, `createParticles`, wire schema (`toWire`) |
| `src/texturefx.ts` | `TextureFX` layer builder (noise, shapes, SDFs, blends) |
| `src/rows.tsx`, `src/treeview.ts` | `renderItem` row portals for ListView/TreeView; TreeView data flattening |
| `src/types.ts` | TypeScript type definitions (props, event data, element refs, vector drawing) |

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
| `ListView` | ListView | Virtualized list (`renderItem` for JSX rows, or `makeItem`/`bindItem`) |
| `TreeView` | TreeView | Virtualized tree (nested `rootItems`, same two row APIs) |
| `FrostedGlass` | `OneJS.GPU.FrostedGlassElement` | Blurred backdrop (`blur`, `tint`) |
| `ShaderEffect` | `OneJS.ShaderFX.ShaderEffectElement` | Runs any shader into the element's background |
| `ShaderProgram` | `OneJS.ShaderFX.ShaderEffectElement` | Runs a compiled shader language program (`onejs-unity/sl`) |
| `TextureFX`, `Flame` | `OneJS.ShaderFX.ShaderEffectElement` | Procedural textures built from noise, shapes and blends |

Custom C# elements: `registerElement(name, CS.My.Element)` then `createComponent<Props>(name)`.

**Controlled inputs** work as in React DOM. A `TextField`, `Toggle`, `Slider` or registered field (a `DropdownField`, say) given `value` always shows that value: after `onChange` runs, and the update it made has committed, the reconciler writes `value` back with `SetValueWithoutNotify` if the control disagrees. So a handler that rejects or caps a change (`onChange={e => setName(e.value.slice(0, 12))}`) keeps the control in step, and `value` without `onChange` is read only. Leave `value` out for an uncontrolled control.

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
import { useEffect, useRef } from "react"
import { View, Button, type VisualElement, type ButtonElement } from "onejs-react"

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

For creating elements outside React, import the C# type (typed by `unity-types`, rewritten to `CS.*` by onejs-unity's esbuild import transform):

```tsx
import { Button } from "UnityEngine/UIElements"

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

Events in portaled content bubble through the overlay layer to `__root`, as DOM portal events reach `document`, and so do events from the rest of the app (onejs-react 0.2.2 and newer). That is where onejs-ui listens for outside presses and Escape.

`<Portal>` is built on `createPortal(children, container, key?)` (the OneJS equivalent of `react-dom`'s `createPortal`), exported for when you need a specific target. With a custom target you own draw order, so prefer `<Portal>` for overlays.

> Use the exports from `onejs-react`, not `react-dom`. The latter targets the browser DOM and will not work here.

## Key Concepts

- **Element types**: Use `ojs-` prefix internally (e.g., `ojs-view`, `ojs-button`) to avoid conflicts with HTML types
- **Style shorthands**: `padding`/`margin`/`borderWidth`/`borderColor`/`borderRadius` are expanded to individual properties (UI Toolkit requirement)
- **Style batching**: an element's parsed styles cross to C# in one `StyleBridge.ApplyStyles` call
- **Style cleanup**: When props change, removed style properties are cleared (not just new ones applied)
- **className updates**: Selective add/remove of classes (not full clear + reapply)
- **Event handlers**: Registered via `__eventAPI` from QuickJSBootstrap.js. `change` is the exception: one reconciler-owned listener per element calls the latest `onChange` inside `flushSync` and then re-asserts a controlled `value`
- **Events that fire**: click, pointer (down/up/move/enter/leave/cancel/capture/captureout), focus/blur/focusin/focusout, keydown/keyup, change, wheel, navigation (move/submit/cancel) and geometrychanged. The mouse, contextclick, input, drag, tooltip and transition props are typed but the runtime does not dispatch them yet
- **Instance structure**: `{ element, type, props, eventHandlers: Map, appliedStyleKeys: Set, changeListener? }`

## Build & Test

```bash
npm run typecheck           # TypeScript check (no build output: consumed directly by App)
npm run typecheck:consumer  # Check src the way a consumer compiles it (see below)
npm run lint                # ESLint
npm test                    # Run test suite
npm run test:watch          # Run tests in watch mode
```

This package ships raw TypeScript, so the compiler that reads these sources
belongs to whoever consumes them, and it is configured by them. `typecheck`
uses this repo's `tsconfig.json`, which sets `strict` and emits nothing;
`typecheck:consumer` instead mirrors how PlaySite's `gen-oj-types` compiles
`src/index.ts`, non-strict and emitting declarations. Those find different
errors, and the non-strict one is not the weaker of the two: without
`strictNullChecks` an optional property loses its `undefined`, so casts that
strict mode accepts can fail. Both gates run in CI. `typecheck:consumer` needs
`unity-types` checked out as a sibling directory.

## Testing

Test suite uses Vitest with mocked Unity CS globals. Tests are in `src/__tests__/`:

| File | Coverage |
|------|----------|
| `host-config.test.ts` | Instance creation, style/className management, events, children |
| `renderer.test.tsx` | Integration tests: render(), unmount(), createPortal(), React state, effects |
| `components.test.tsx` | Component wrappers, prop passing, event mapping |
| `controlled-inputs.test.tsx` | Controlled `value` re-asserted after a rejected or transformed change |
| `error-boundary.test.tsx` | `ErrorBoundary`: `fallbackRender`, `reset`, `resetKeys`, one log per caught error |
| `portal.test.tsx` | `<Portal>` overlay layer |
| `bubbling.test.tsx` | Parent links the bootstrap bubbles along: app and portaled events reach a listener on `__root` |
| `rows.test.tsx`, `treeview.test.tsx` | `renderItem` rows on recycled ListView/TreeView elements; `flattenTree` (fixtures mirror `TreeViewBridgeTests.cs`) |
| `hooks.test.tsx`, `collection-sync.test.tsx` | Sync hooks, `toArray`, syncing C# collections into components |
| `screen.test.tsx` | Controlled and nested `ScreenProvider` |
| `style-parser.test.ts` | Length, color and enum parsing (`parseLength`, `parseColor`, `parseStyleValue`); transforms have no test |
| `painter.test.ts` | Batched Painter command buffer (JS side only; the C# contract guard is `PainterOpcodeContractTests` in the container) |
| `particles.test.ts` | Particle wire schema and handle |
| `texturefx.test.ts` | TextureFX uniform packing |
| `mocks.ts` | Mock implementations of Unity UI Toolkit classes |
| `pre-setup.ts`, `setup.ts` | Globals defined before imports (`CS`, `useExtensions`), then the test setup for CS, __eventAPI |

## Vector Drawing

OneJS exposes Unity's `Painter2D` API for GPU-accelerated vector graphics. Any element can render custom vector content via `onGenerateVisualContent`.

Raw `mgc.painter2D` costs one C# crossing per call and per `new Vector2`/`new Color`. For paths redrawn often, prefer the batched API, which records the whole draw and replays it in one crossing:

```tsx
import { View, batchedVisualContent } from "onejs-react"

<View
    style={{ width: 200, height: 200 }}
    onGenerateVisualContent={batchedVisualContent((p) => {
        p.fillColor("#ff0000").beginPath().circle(100, 100, 80).fill()
    })}
/>
```

It covers paths, fill/stroke, colours, line width/cap/join, miter limit and dashes; use raw `painter2D` for gradients, textures and text. `useBatchedVectorContent(draw, deps)` is the hook form.

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
import { useEffect, useRef, useState } from "react"
import { View, type VisualElement } from "onejs-react"

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
| Gradients | Linear/radial (`fillGradient`, `strokeFillGradient`), plus `strokeGradient` | Linear/radial/conic |
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

// Safe with null: returns []
const npcs = toArray(currentPlace?.NPCs)
```

Supports objects with `.Count` (List, IList) or `.Length` (C# arrays). Returns `[]` for null/undefined.

### Sync hooks

- `useFrameSync(getter, selectOrDeps?, deps?)`: polls a C# value every frame and re-renders when it (or the selected fields) change
- `useFrameSyncWith(getter, isEqual, deps?)`: the same with a custom comparison
- `useThrottledSync(getter, intervalMs, deps?)`: polls on an interval instead of every frame
- `useEventSync(getter, [[source, "EventName"], ...], deps?)` or `useEventSync(source, "Health")` (reads `source.Health` on `OnHealthChanged`): re-reads when a C# event fires, no polling

## Other exports

- `ErrorBoundary`, `formatError`: catch render errors and show `fallbackRender={({ error, errorInfo, reset }) => ...}` instead; `resetKeys` resets it when an entry changes, `onError` and `onReset` report. `errorInfo` is null on the first fallback render. The root logs each caught error once. `fallback` (a node, or `(error, errorInfo) => node`) still works and is deprecated.
- `useParticles(ref, config)` / `createParticles`: C#-owned 2D particle systems (see the OneJS runtime's `Particles/`). The hook compares the config by value: an equal config keeps the system, a changed one recreates it (dropping live particles), and textures are swapped in without a restart. Drive continuous values through the handle (`fx.emitters[0].pos(x, y)`, `.rate`).
- `Transform2D`, `useVectorContent`: transforms and auto-repaint for raw `Painter2D` drawing
- `TextureFXBuilder`, `buildTextureFX`: the builder behind `<TextureFX build={...}>`

## Dependencies

- `react-reconciler@0.31.x` (React 19 compatible)
- `@types/react-reconciler@0.31.x`: this package ships raw TypeScript, so a consumer compiles these sources and needs the types too. 0.32 changed `HostConfig`'s arity and does not typecheck against 0.31.
- `vitest` (dev): Test runner
- Peer: `react@18.x || 19.x`
- Peer: `unity-types@6000.3.x` or newer, which declares the global `CS` namespace the exported `Vector2`, `Color` and `Angle` aliases are built from. npm installs it for you.
