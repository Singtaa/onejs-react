/**
 * Test setup - Mocks the Unity QuickJS runtime environment
 *
 * In the real environment, these globals are provided by:
 * - CS: QuickJSBootstrap.js proxy to C# types
 * - __eventAPI: Event registration system from QuickJSBootstrap.js
 * - queueMicrotask: Polyfilled by QuickJSBootstrap.js
 * - console: QuickJS built-in
 */

import { vi } from 'vitest';
import { createMockCS, resetAllMocks } from './mocks';

// Store original globals (Node.js provides these)
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalQueueMicrotask = globalThis.queueMicrotask;

// Set up globals before each test
beforeEach(() => {
    resetAllMocks();

    // Create fresh mock CS global
    (globalThis as any).CS = createMockCS();

    // Mock event API with spies
    (globalThis as any).__eventAPI = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        removeAllEventListeners: vi.fn(),
    };

    // Use real console but spy on it for test assertions
    // (React reconciler logs things we want to see during debugging)
    (globalThis as any).console = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    };

    // Use real queueMicrotask - React scheduler depends on it
    (globalThis as any).queueMicrotask = originalQueueMicrotask || ((cb: () => void) => Promise.resolve().then(cb));

    // Use real setTimeout/clearTimeout - React scheduler depends on them
    (globalThis as any).setTimeout = originalSetTimeout;
    (globalThis as any).clearTimeout = originalClearTimeout;
});

// Clean up after each test
afterEach(() => {
    vi.clearAllMocks();
});
