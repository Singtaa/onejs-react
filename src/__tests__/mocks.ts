/**
 * Mock implementations for Unity UI Toolkit elements
 *
 * These mocks simulate the behavior of C# VisualElement and related classes
 * as exposed through the QuickJS CS proxy.
 */

// Track all created elements for test assertions
let createdElements: MockVisualElement[] = [];

// MARK: Unity Types

/**
 * Mock Unity Color struct
 */
export class MockColor {
    constructor(
        public r: number,
        public g: number,
        public b: number,
        public a: number
    ) {}
}

/**
 * Mock Unity UIElements Length struct
 */
export class MockLength {
    constructor(
        public value: number,
        public unit: number = 0
    ) {}
}

/**
 * Mock LengthUnit enum
 */
export const MockLengthUnit = {
    Pixel: 0,
    Percent: 1,
};

/**
 * Mock StyleKeyword enum
 */
export const MockStyleKeyword = {
    Undefined: 0,
    Auto: 1,
    None: 2,
    Initial: 3,
};

/**
 * Mock VisualElement - base class for all UI Toolkit elements
 */
export class MockVisualElement {
    // Unique identifier (simulates Unity's instance ID via __csHandle)
    __csHandle: number;
    __csType: string;

    // Child management
    private _children: MockVisualElement[] = [];
    private _parent: MockVisualElement | null = null;

    // Style object (simulates IStyle)
    style: Record<string, unknown> = {};

    // Class list
    private _classList: Set<string> = new Set();

    // Common properties
    name = '';
    text = '';
    value: unknown = undefined;
    label = '';
    enabledSelf = true;
    pickingMode = 0;

    constructor(csType = 'UnityEngine.UIElements.VisualElement') {
        this.__csHandle = Math.floor(Math.random() * 1000000);
        this.__csType = csType;
        createdElements.push(this);
    }

    // Child management methods
    Add(child: MockVisualElement): void {
        if (child && !this._children.includes(child)) {
            this._children.push(child);
            child._parent = this;
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
            child._parent = this;
        }
    }

    Remove(child: MockVisualElement): void {
        const index = this._children.indexOf(child);
        if (index >= 0) {
            this._children.splice(index, 1);
            child._parent = null;
        }
    }

    RemoveAt(index: number): void {
        if (index >= 0 && index < this._children.length) {
            const [child] = this._children.splice(index, 1);
            if (child) child._parent = null;
        }
    }

    // Mirrors UnityEngine.UIElements.VisualElement.RemoveFromHierarchy(): detach from
    // the current parent, a no-op when already detached.
    RemoveFromHierarchy(): void {
        this._parent?.Remove(this);
    }

    IndexOf(child: MockVisualElement): number {
        return this._children.indexOf(child);
    }

    Clear(): void {
        for (const child of this._children) child._parent = null;
        this._children = [];
    }

    // Enabled state
    SetEnabled(value: boolean): void {
        this.enabledSelf = value;
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
 * Mock TextElement - base text element for implicit text content
 */
export class MockTextElement extends MockVisualElement {
    constructor() {
        super('UnityEngine.UIElements.TextElement');
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
 * Mock Texture2D for image loading tests
 */
export class MockTexture2D {
    width: number
    height: number
    filterMode: number = 0
    _loaded = false

    constructor(w: number, h: number) {
        this.width = w
        this.height = h
    }

    LoadImage(_bytes: any): boolean {
        this._loaded = true
        return true
    }
}

/**
 * Mock VectorImage as produced by SVGUtils.LoadFromString
 */
export class MockVectorImage {
    constructor(public svgText: string) {}
}

/**
 * Mock file system for image loading tests.
 * Tests can add entries to control which files "exist" and what they contain:
 * number[] entries are raster bytes, string entries are text (e.g. SVG source).
 */
export const mockFileSystem = new Map<string, number[] | string>()

/**
 * Mock URL-addressable assets for StreamingAssets-as-URL platforms (Android
 * APK jar: URLs, WebGL http URLs). Keyed by full URL; number[] entries are
 * served by Network.LoadTextureFromUrl, string entries by the fetch stub.
 */
export const mockUrlAssets = new Map<string, number[] | string>()

/**
 * Create the mock CS global object that mirrors QuickJSBootstrap.js proxy
 *
 * Enum values match Unity's actual enum definitions so that tests
 * verify the real mapping behavior (CSS string -> Unity enum number).
 */
export function createMockCS() {
    return {
        System: {
            IO: {
                Path: {
                    Combine: (...parts: string[]) => parts.join("/"),
                    GetDirectoryName: (p: string) => p.substring(0, p.lastIndexOf("/")),
                    IsPathRooted: (p: string) => p.startsWith("/"),
                },
                File: {
                    Exists: (path: string) => mockFileSystem.has(path),
                    ReadAllBytes: (path: string) => {
                        const entry = mockFileSystem.get(path);
                        return Array.isArray(entry) ? entry : [];
                    },
                    ReadAllText: (path: string) => {
                        const entry = mockFileSystem.get(path);
                        return typeof entry === "string" ? entry : "";
                    },
                },
            },
        },
        UnityEngine: {
            // Core types
            Color: MockColor,
            Rect: class { constructor(public x: number, public y: number, public width: number, public height: number) {} },
            ScaleMode: { StretchToFill: 0, ScaleAndCrop: 1, ScaleToFit: 2 },
            Application: {
                isEditor: true,
                dataPath: "/project/Assets",
                streamingAssetsPath: "/project/Assets/StreamingAssets",
            },
            Texture2D: MockTexture2D,
            FilterMode: { Point: 0, Bilinear: 1, Trilinear: 2 },
            // UI Elements
            UIElements: {
                VisualElement: MockVisualElement,
                TextElement: MockTextElement,
                Label: MockLabel,
                Button: MockButton,
                TextField: MockTextField,
                Toggle: MockToggle,
                Slider: MockSlider,
                ScrollView: MockScrollView,
                Image: MockImage,
                // Style types
                Length: MockLength,
                LengthUnit: MockLengthUnit,
                StyleKeyword: MockStyleKeyword,
                // Enums (values match Unity's actual enum definitions)
                FlexDirection: { Column: 0, ColumnReverse: 1, Row: 2, RowReverse: 3 },
                Wrap: { NoWrap: 0, Wrap: 1, WrapReverse: 2 },
                Align: { Auto: 0, FlexStart: 1, Center: 2, FlexEnd: 3, Stretch: 4 },
                Justify: { FlexStart: 0, Center: 1, FlexEnd: 2, SpaceBetween: 3, SpaceAround: 4 },
                Position: { Relative: 0, Absolute: 1 },
                Overflow: { Visible: 0, Hidden: 1 },
                DisplayStyle: { Flex: 0, None: 1 },
                Visibility: { Visible: 0, Hidden: 1 },
                WhiteSpace: { Normal: 0, NoWrap: 1 },
                TextOverflow: { Clip: 0, Ellipsis: 1 },
                TextOverflowPosition: { End: 0, Start: 1, Middle: 2 },
                OverflowClipBox: { PaddingBox: 0, ContentBox: 1 },
                PickingMode: { Position: 0, Ignore: 1 },
                SliderDirection: { Horizontal: 0, Vertical: 1 },
                // ScrollView enums
                ScrollViewMode: { Vertical: 0, Horizontal: 1, VerticalAndHorizontal: 2 },
                ScrollerVisibility: { Auto: 0, AlwaysVisible: 1, Hidden: 2 },
                TouchScrollBehavior: { Unrestricted: 0, Elastic: 1, Clamped: 2 },
                NestedInteractionKind: { Default: 0, StopScrolling: 1, ForwardScrolling: 2 },
                // ListView enums
                SelectionType: { None: 0, Single: 1, Multiple: 2 },
                ListViewReorderMode: { Simple: 0, Animated: 1 },
                AlternatingRowBackground: { None: 0, ContentOnly: 1, All: 2 },
                CollectionVirtualizationMethod: { FixedHeight: 0, DynamicHeight: 1 },
            },
        },
        OneJS: {
            SVGUtils: {
                LoadFromString: (svgText: string) => new MockVectorImage(svgText),
            },
            // Mirrors CS.OneJS.Network (Network.cs): LoadTextureFromUrl resolves
            // to a Texture2D on success, null on failure (no throw).
            Network: {
                LoadTextureFromUrl: async (url: string) => {
                    const entry = mockUrlAssets.get(url);
                    if (!Array.isArray(entry)) return null;
                    const tex = new MockTexture2D(2, 2);
                    tex.LoadImage(entry);
                    return tex;
                },
            },
            GPU: {
                GPUBridge: {
                    SetElementBackgroundImage: () => {},
                    SetElementBackgroundFromObject: () => {},
                    ClearElementBackgroundImage: () => {},
                },
            },
            // Mirrors the real CS.OneJS.StyleBridge batched path: ApplyStyles writes
            // each parsed style value onto element.style; AddClassesBatch adds each
            // class. host-config sends pre-parsed values (MockLength/MockColor/etc.),
            // so a direct assignment is faithful for assertions.
            StyleBridge: {
                ApplyStyles: (element: MockVisualElement, styles: Record<string, unknown>) => {
                    for (const key in styles) {
                        element.style[key] = styles[key];
                    }
                },
                AddClassesBatch: (element: MockVisualElement, classes: string[]) => {
                    for (const cls of classes) {
                        element.AddToClassList(cls);
                    }
                },
            },
            // Mirrors the real CS.OneJS.NodeBridge: resolve element handles and
            // delegate to the same tree ops the slow path would have called.
            NodeBridge: {
                Add: (parentHandle: number, childHandle: number) => {
                    const parent = findElementByHandle(parentHandle);
                    const child = findElementByHandle(childHandle);
                    if (parent && child) parent.Add(child);
                },
                Insert: (parentHandle: number, index: number, childHandle: number) => {
                    const parent = findElementByHandle(parentHandle);
                    const child = findElementByHandle(childHandle);
                    if (parent && child) parent.Insert(index, child);
                },
                RemoveFromHierarchy: (childHandle: number) => {
                    findElementByHandle(childHandle)?.RemoveFromHierarchy();
                },
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
    mockFileSystem.clear();
    mockUrlAssets.clear();
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
        await new Promise<void>(resolve => {
            if (typeof setImmediate !== "undefined") {
                setImmediate(resolve);
            } else {
                setTimeout(resolve, 0);
            }
        });
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
        setParent: ReturnType<typeof import('vitest').vi.fn>;
        removeParent: ReturnType<typeof import('vitest').vi.fn>;
    };
}
