import Reconciler from 'react-reconciler';
import type { ReactNode } from 'react';
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

export function render(element: ReactNode, container: RenderContainer): void {
  let root = roots.get(container);

  if (!root) {
    root = reconciler.createContainer(
      container as Container,
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
  if (root) {
    reconciler.updateContainer(null, root, null, () => {});
    roots.delete(container);
  }
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
