/**
 * Pre-setup - Defines globals that must exist before any module imports.
 *
 * This runs before setup.ts to ensure useExtensions and CS are available when
 * components.tsx is first imported (it calls useExtensions at module level).
 * setup.ts replaces CS with a full mock in beforeEach.
 */

import { createMockCS } from "./mocks";

// No-op useExtensions for test environment (extension methods are mocked directly on types)
(globalThis as any).useExtensions = () => {};

// Minimal CS mock so module-level code can reference CS.UnityEngine.ImageConversion
(globalThis as any).CS = createMockCS();
