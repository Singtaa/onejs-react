import Reconciler from 'react-reconciler';
import type { ReactNode } from 'react';
import { hostConfig, type Container } from './host-config';

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

// Create the reconciler
const reconciler = Reconciler(hostConfig);

// Inject into dev tools (helps with proper initialization)
reconciler.injectIntoDevTools({
  bundleType: 1, // 0 for prod, 1 for dev
  version: '19.0.0',
  rendererPackageName: 'onejs-react',
});

// Track roots for hot reload / re-render
const roots = new Map<Container, ReturnType<typeof reconciler.createContainer>>();

export function render(element: ReactNode, container: Container): void {
  console.log('[onejs-react] render() called');
  let root = roots.get(container);

  if (!root) {
    console.log('[onejs-react] creating new container');
    root = reconciler.createContainer(
      container,
      0, // LegacyRoot (0) vs ConcurrentRoot (1)
      null, // hydrationCallbacks
      false, // isStrictMode
      null, // concurrentUpdatesByDefaultOverride
      '', // identifierPrefix
      (error: Error) => console.error('[OneJS React] Recoverable error:', error),
      null // transitionCallbacks
    );
    roots.set(container, root);
  }

  console.log('[onejs-react] calling updateContainer');
  reconciler.updateContainer(element, root, null, () => {
    console.log('[onejs-react] updateContainer callback fired');
  });

  // Try to flush synchronous work
  console.log('[onejs-react] attempting to flush sync work');
  try {
    // flushSync may be exported differently - try flushSyncWork first
    if (typeof (reconciler as any).flushSyncWork === 'function') {
      (reconciler as any).flushSyncWork();
      console.log('[onejs-react] flushSyncWork completed');
    } else if (typeof (reconciler as any).flushSync === 'function') {
      (reconciler as any).flushSync(() => {});
      console.log('[onejs-react] flushSync completed');
    } else {
      console.log('[onejs-react] no sync flush method available, relying on microtasks');
    }
  } catch (e) {
    console.log('[onejs-react] sync flush failed, relying on microtasks:', e);
  }
}

export function unmount(container: Container): void {
  const root = roots.get(container);
  if (root) {
    reconciler.updateContainer(null, root, null, () => {});
    roots.delete(container);
  }
}

// Export for testing/debugging
export function getRoot(container: Container) {
  return roots.get(container);
}
