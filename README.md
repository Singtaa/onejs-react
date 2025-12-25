# onejs-react

React 19 reconciler for Unity's UI Toolkit.

## Files

| File | Purpose |
|------|---------|
| `src/host-config.ts` | React reconciler implementation (createInstance, commitUpdate, etc.) |
| `src/renderer.ts` | Entry point: `render(element, container)` |
| `src/components.tsx` | Component wrappers: View, Label, Button, TextField, etc. |
| `src/screen.tsx` | Responsive design: ScreenProvider, useBreakpoint, useScreenSize, useResponsive |
| `src/types.ts` | TypeScript type definitions |
| `src/index.ts` | Package exports |

## Usage

```tsx
import { render, View, Label, Button } from 'onejs-react';

function App() {
    return (
        <View style={{ padding: 20 }}>
            <Button text="Click me" onClick={() => console.log('clicked')} />
        </View>
    );
}

render(<App />, __root);
```

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
| `renderer.test.tsx` | Integration tests: render(), unmount(), React state, effects |
| `components.test.tsx` | Component wrappers, prop passing, event mapping |
| `mocks.ts` | Mock implementations of Unity UI Toolkit classes |
| `setup.ts` | Global test setup for CS, __eventAPI |

## Dependencies

- `react-reconciler@0.31.x` (React 19 compatible)
- `vitest` (dev) - Test runner
- Peer: `react@18.x || 19.x`
