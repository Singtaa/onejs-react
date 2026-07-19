import Reconciler from 'react-reconciler';
import type { ReactNode, ReactPortal } from 'react';
import { hostConfig, type Container } from './host-config';
import type { RenderContainer, VisualElement } from './types';

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

// Create the reconciler
const reconciler = Reconciler(hostConfig);

// Inject into dev tools with full configuration
// This enables React DevTools to inspect the component tree
reconciler.injectIntoDevTools({
    bundleType: 1, // 0 for prod, 1 for dev
    version: '19.0.0',
    rendererPackageName: 'onejs-react',
});

// Track roots for hot reload / re-render
const roots = new Map<RenderContainer, ReturnType<typeof reconciler.createContainer>>();

// react-reconciler 0.31 (React 19) inserted onUncaughtError/onCaughtError ahead of
// onRecoverableError in createContainer's signature. @types/react-reconciler (0.28.x)
// predates them, so the call is typed manually here; with the 0.28-shaped arg list the
// root's onCaughtError slot is left null at runtime and any error boundary catch
// throws "onCaughtError is not a function".
type RootErrorHandler = (error: unknown, errorInfo: unknown) => void;
const createContainer = reconciler.createContainer as unknown as (
  containerInfo: Container,
  tag: number,
  hydrationCallbacks: null,
  isStrictMode: boolean,
  concurrentUpdatesByDefaultOverride: null,
  identifierPrefix: string,
  onUncaughtError: RootErrorHandler,
  onCaughtError: RootErrorHandler,
  onRecoverableError: RootErrorHandler,
  transitionCallbacks: null
) => ReturnType<typeof reconciler.createContainer>;

// Register unmountAll as a runtime teardown hook exactly once. The OneJS runtime
// (QuickJSUIBridge.Dispose) invokes __runTeardown() right before destroying the JS
// context on hot reload / stop. Unmounting here fires useEffect/useLayoutEffect
// cleanups while the context is still alive; otherwise they never run and stale
// C# subscriptions (e.g. from useEventSync) leak across reloads.
let teardownHookRegistered = false;
function ensureTeardownHook(): void {
  if (teardownHookRegistered) return;
  const g = globalThis as any;
  if (typeof g !== 'undefined' && typeof g.__onTeardown === 'function') {
    g.__onTeardown(unmountAll);
    teardownHookRegistered = true;
  }
}

export function render(element: ReactNode, container: RenderContainer): void {
  ensureTeardownHook();

  let root = roots.get(container);

  if (!root) {
    root = createContainer(
      container as Container,
      0, // LegacyRoot (0) vs ConcurrentRoot (1)
      null, // hydrationCallbacks
      false, // isStrictMode
      null, // concurrentUpdatesByDefaultOverride
      '', // identifierPrefix
      (error) => console.error('[OneJS React] Uncaught error:', error),
      (error) => console.error('[OneJS React] Error caught by boundary:', error),
      (error) => console.error('[OneJS React] Recoverable error:', error),
      null // transitionCallbacks
    );
    roots.set(container, root);
  }

  reconciler.updateContainer(element, root, null, () => {});

  // Try to flush synchronous work
  try {
    if (typeof (reconciler as any).flushSyncWork === 'function') {
      (reconciler as any).flushSyncWork();
    } else if (typeof (reconciler as any).flushSync === 'function') {
      (reconciler as any).flushSync(() => {});
    }
  } catch (e) {
    // Sync flush failed, rely on microtasks
  }
}

export function unmount(container: RenderContainer): void {
  const root = roots.get(container);
  if (!root) return;
  roots.delete(container);

  const r = reconciler as any;
  // Tear the tree down synchronously. updateContainer(null, ...) only *schedules*
  // the unmount, which never gets a scheduler tick during a hot-reload teardown
  // (the context is destroyed immediately after). updateContainerSync + flushSyncWork
  // runs the commit now, firing useLayoutEffect cleanups during it.
  if (typeof r.updateContainerSync === 'function') {
    r.updateContainerSync(null, root, null, null);
    if (typeof r.flushSyncWork === 'function') r.flushSyncWork();
  } else {
    reconciler.updateContainer(null, root, null, () => {});
  }
  // useEffect (passive) cleanups are queued by the unmount commit, not run by it.
  // Flush them now so they also fire before the context goes away.
  if (typeof r.flushPassiveEffects === 'function') r.flushPassiveEffects();
}

/**
 * Unmount every active root. Invoked by the OneJS runtime teardown hook before the
 * JS context is destroyed (hot reload / stop) so component cleanups run.
 */
export function unmountAll(): void {
  // Snapshot keys first: unmount() mutates the roots map.
  for (const container of Array.from(roots.keys())) {
    unmount(container);
  }
}

/**
 * Render `children` into a different container, outside the normal parent
 * hierarchy. The returned node must be included in a render tree (i.e. returned
 * from a component) to take effect.
 *
 * Unlike the DOM, UI Toolkit has no `z-index`: paint order follows the element
 * hierarchy (later siblings draw on top) and a parent with `overflow: hidden`
 * clips its descendants. Portaling a subtree into a top-level container such as
 * `__root` lets modals, tooltips, and other overlays escape clipping and paint
 * above the rest of the UI.
 *
 * @param children  React nodes to render into `container`.
 * @param container Target VisualElement, e.g. `__root` or a ref'd element.
 * @param key       Optional React key for the portal.
 *
 * @example
 * function Modal({ children }: { children: ReactNode }) {
 *     return createPortal(
 *         <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
 *             {children}
 *         </View>,
 *         __root
 *     )
 * }
 */
export function createPortal(children: ReactNode, container: RenderContainer, key: string | null = null): ReactPortal {
  // `react-reconciler`'s ReactPortal type ({ containerInfo, implementation, ... })
  // is structurally different from `react`'s ReactPortal (extends ReactElement with
  // type/props). The runtime value is a valid portal either way; bridge the known
  // @types discrepancy so consumers get `react`'s ReactPortal, matching react-dom.
  return reconciler.createPortal(children, container as Container, null, key) as unknown as ReactPortal;
}

/**
 * Execute a callback synchronously, flushing all updates before returning.
 * Useful for tests or when you need immediate UI updates.
 */
export function flushSync<T>(callback: () => T): T {
    if (typeof (reconciler as any).flushSync === 'function') {
        return (reconciler as any).flushSync(callback);
    }
    // Fallback: just call the callback
    return callback();
}

/**
 * Batch multiple updates together for better performance.
 * All updates inside the callback are batched into a single render.
 */
export function batchedUpdates<T>(callback: () => T): T {
    if (typeof (reconciler as any).batchedUpdates === 'function') {
        return (reconciler as any).batchedUpdates(callback);
    }
    // Fallback: just call the callback
    return callback();
}

// Export for testing/debugging
export function getRoot(container: RenderContainer) {
    return roots.get(container);
}

/**
 * Get debug info about all active render roots.
 * Useful for debugging and DevTools integration.
 */
export function getDebugInfo() {
    return {
        activeRoots: roots.size,
        reconcilerVersion: '0.31.0',
        reactVersion: '19.0.0',
    };
}
