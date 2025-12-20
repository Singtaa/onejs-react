/**
 * Mock implementations for Unity UI Toolkit elements
 *
 * These mocks simulate the behavior of C# VisualElement and related classes
 * as exposed through the QuickJS CS proxy.
 */

// Track all created elements for test assertions
let createdElements: MockVisualElement[] = [];

/**
 * Mock VisualElement - base class for all UI Toolkit elements
 */
export class MockVisualElement {
    // Unique identifier (simulates Unity's instance ID via __csHandle)
    __csHandle: number;
    __csType: string;

    // Child management
    private _children: MockVisualElement[] = [];

    // Style object (simulates IStyle)
    style: Record<string, unknown> = {};

    // Class list
    private _classList: Set<string> = new Set();

    // Common properties
    text = '';
    value: unknown = undefined;
    label = '';

    constructor(csType = 'UnityEngine.UIElements.VisualElement') {
        this.__csHandle = Math.floor(Math.random() * 1000000);
        this.__csType = csType;
        createdElements.push(this);
    }

    // Child management methods
    Add(child: MockVisualElement): void {
        if (child && !this._children.includes(child)) {
            this._children.push(child);
        }
    }

    Insert(index: number, child: MockVisualElement): void {
        if (child) {
            // Remove if already exists
            const existingIndex = this._children.indexOf(child);
            if (existingIndex >= 0) {
                this._children.splice(existingIndex, 1);
            }
            this._children.splice(index, 0, child);
        }
    }

    Remove(child: MockVisualElement): void {
        const index = this._children.indexOf(child);
        if (index >= 0) {
            this._children.splice(index, 1);
        }
    }

    RemoveAt(index: number): void {
        if (index >= 0 && index < this._children.length) {
            this._children.splice(index, 1);
        }
    }

    IndexOf(child: MockVisualElement): number {
        return this._children.indexOf(child);
    }

    Clear(): void {
        this._children = [];
    }

    // Class list methods
    AddToClassList(className: string): void {
        this._classList.add(className);
    }

    RemoveFromClassList(className: string): void {
        this._classList.delete(className);
    }

    ClearClassList(): void {
        this._classList.clear();
    }

    // Test helpers (not in real API)
    get children(): readonly MockVisualElement[] {
        return this._children;
    }

    get childCount(): number {
        return this._children.length;
    }

    get classList(): ReadonlySet<string> {
        return this._classList;
    }

    hasClass(className: string): boolean {
        return this._classList.has(className);
    }
}

/**
 * Mock Label element
 */
export class MockLabel extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.Label');
    }
}

/**
 * Mock Button element
 */
export class MockButton extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.Button');
    }
}

/**
 * Mock TextField element
 */
export class MockTextField extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.TextField');
        this.value = '';
    }
}

/**
 * Mock Toggle element
 */
export class MockToggle extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.Toggle');
        this.value = false;
    }
}

/**
 * Mock Slider element
 */
export class MockSlider extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.Slider');
        this.value = 0;
    }
}

/**
 * Mock ScrollView element
 */
export class MockScrollView extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.ScrollView');
    }
}

/**
 * Mock Image element
 */
export class MockImage extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.Image');
    }
}

/**
 * Create the mock CS global object that mirrors QuickJSBootstrap.js proxy
 */
export function createMockCS() {
    return {
        UnityEngine: {
            UIElements: {
                VisualElement: MockVisualElement,
                Label: MockLabel,
                Button: MockButton,
                TextField: MockTextField,
                Toggle: MockToggle,
                Slider: MockSlider,
                ScrollView: MockScrollView,
                Image: MockImage,
            },
        },
    };
}

/**
 * Get all elements created during the test
 */
export function getCreatedElements(): readonly MockVisualElement[] {
    return createdElements;
}

/**
 * Find a created element by its handle
 */
export function findElementByHandle(handle: number): MockVisualElement | undefined {
    return createdElements.find((el) => el.__csHandle === handle);
}

/**
 * Reset all mocks - call this before each test
 */
export function resetAllMocks(): void {
    createdElements = [];
}

/**
 * Create a mock container for render() tests
 */
export function createMockContainer(): MockVisualElement {
    return new MockVisualElement('Container');
}

/**
 * Helper to wait for React to flush updates
 * React uses microtasks for scheduling, so we need to flush the microtask queue
 */
export async function flushMicrotasks(): Promise<void> {
    // Flush multiple rounds of microtasks to handle nested scheduling
    // React's reconciler needs more iterations to flush all work
    for (let i = 0; i < 50; i++) {
        await Promise.resolve();
        // Also allow any setTimeout callbacks to run
        await new Promise(resolve => setImmediate ? setImmediate(resolve) : setTimeout(resolve, 0));
    }
}

/**
 * Wait for a specific condition to be true, with timeout
 */
export async function waitFor(
    condition: () => boolean,
    { timeout = 1000, interval = 10 } = {}
): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeout) {
            throw new Error('waitFor timed out');
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

/**
 * Helper to get the __eventAPI mock for assertions
 */
export function getEventAPI() {
    return (globalThis as any).__eventAPI as {
        addEventListener: ReturnType<typeof import('vitest').vi.fn>;
        removeEventListener: ReturnType<typeof import('vitest').vi.fn>;
        removeAllEventListeners: ReturnType<typeof import('vitest').vi.fn>;
    };
}
