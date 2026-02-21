/**
 * Test setup - Mocks the Unity QuickJS runtime environment
 *
 * In the real environment, these globals are provided by:
 * - CS: QuickJSBootstrap.js proxy to C# types
 * - __eventAPI: Event registration system from QuickJSBootstrap.js
 * - queueMicrotask: Polyfilled by QuickJSBootstrap.js
 * - console: QuickJS built-in
 */

import { vi, beforeEach, afterEach } from "vitest";
import { createMockCS, resetAllMocks } from "./mocks";

// Extend globalThis type for our mocks
declare global {
    // eslint-disable-next-line no-var
    var __eventAPI: {
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
        removeAllEventListeners: ReturnType<typeof vi.fn>;
        setParent: ReturnType<typeof vi.fn>;
        removeParent: ReturnType<typeof vi.fn>;
    };
}

// Store original globals (Node.js provides these)
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const originalQueueMicrotask = global.queueMicrotask;

// Set up globals before each test
beforeEach(() => {
    resetAllMocks();

    // Create fresh mock CS global
    (globalThis as any).CS = createMockCS();

    // Mock event API with spies
    global.__eventAPI = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        removeAllEventListeners: vi.fn(),
        setParent: vi.fn(),
        removeParent: vi.fn(),
    };

    // Use real console but spy on it for test assertions
    // (React reconciler logs things we want to see during debugging)
    (global as any).console = {
        log: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    };

    // Use real queueMicrotask - React scheduler depends on it
    (global as any).queueMicrotask = originalQueueMicrotask || ((cb: () => void) => Promise.resolve().then(cb));

    // Use real setTimeout/clearTimeout - React scheduler depends on them
    (global as any).setTimeout = originalSetTimeout;
    (global as any).clearTimeout = originalClearTimeout;
});

// Clean up after each test
afterEach(() => {
    vi.clearAllMocks();
});
