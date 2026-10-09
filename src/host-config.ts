import type {HostConfig} from 'react-reconciler';
import type {BaseProps, ViewStyle, VisualElement, GenerateVisualContentCallback} from './types';
import {parseStyleValue, parseColor} from './style-parser';
import {toRGBA} from './color';
import {flattenTree} from './treeview';
import {escapeClassName} from './class-names';
import type {TreeViewItem} from './types';

// CSObject is an alias for VisualElement: they represent the same C# objects
type CSObject = VisualElement & { pickingMode?: number };

// Global declarations for QuickJS environment
declare function setTimeout(callback: () => void, ms?: number): number;

declare function clearTimeout(id: number): void;

declare const console: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };


// Priority constant from react-reconciler/constants, matching React's
// internal lane priorities. Only the default lane is used here; for
// reference the others are Discrete=2, Continuous=8, Idle=536870912.
const DefaultEventPriority = 32;

// Current update priority: used by React's scheduler
let currentUpdatePriority = DefaultEventPriority;

// Microtask scheduling
declare function queueMicrotask(callback: () => void): void;

// Unity enum types (accessed as CS.UnityEngine.UIElements.EnumName.Value)
interface CSEnum {
    [key: string]: number;
}

// CS interop: these are provided by QuickJSBootstrap.js
declare const CS: {
    UnityEngine: {
        UIElements: {
            VisualElement: new () => CSObject;
            TextElement: new () => CSObject;
            Label: new () => CSObject;
            Button: new () => CSObject;
            TextField: new () => CSObject;
            Toggle: new () => CSObject;
            Slider: new () => CSObject;
            ScrollView: new () => CSObject;
            Image: new () => CSObject;
            ListView: new () => CSListView;
            TreeView: new () => CSTreeView;
            // Enums
            ScrollViewMode: CSEnum;
            ScrollerVisibility: CSEnum;
            TouchScrollBehavior: CSEnum;
            NestedInteractionKind: CSEnum;
            SelectionType: CSEnum;
            ListViewReorderMode: CSEnum;
            AlternatingRowBackground: CSEnum;
            CollectionVirtualizationMethod: CSEnum;
            DisplayStyle: CSEnum;
            PickingMode: CSEnum;
            SliderDirection: CSEnum;
            // Nested in ScrollView, so reached by the CLR nested name. The
            // namespace path (UIE.TouchScrollBehavior) names no type: it reads
            // as an empty proxy whose members are all 0, so every value set
            // Unrestricted. The dotted path (UIE.ScrollView.TouchScrollBehavior)
            // resolves on OneJS 3.4.2+ only; the CLR name works on every runtime.
            "ScrollView+TouchScrollBehavior": CSEnum;
            "ScrollView+NestedInteractionKind": CSEnum;
        };
        ScaleMode: CSEnum;
        Rect: new (...args: any[]) => any;
        Color: new (r: number, g: number, b: number, a: number) => any;
    };
    OneJS: {
        GPU: {
            GPUBridge: {
                SetElementBackgroundImage: (element: CSObject, rtHandle: number) => void;
                SetElementBackgroundFromObject: (element: CSObject, obj: CSObject) => void;
                ClearElementBackgroundImage: (element: CSObject) => void;
            };
            FrostedGlassElement: new () => CSObject;
        };
        ShaderFX: {
            ShaderEffectElement: new () => CSObject;
        };
        StyleBridge: {
            ApplyStyles: (element: CSObject, styles: Record<string, unknown>) => void;
            AddClassesBatch: (element: CSObject, classes: string[]) => void;
        };
        NodeBridge: {
            Add: (parentHandle: number, childHandle: number) => void;
            Insert: (parentHandle: number, index: number, childHandle: number) => void;
            RemoveFromHierarchy: (childHandle: number) => void;
        };
        TreeViewBridge: {
            SetRootItems: (treeView: CSObject, ids: number[], parentIds: number[]) => void;
            GetSelectedIds: (treeView: CSObject) => unknown;
            GetSelectedIndices: (view: CSObject) => unknown;
        };
    };
};

declare const __eventAPI: {
    addEventListener: (element: CSObject, eventType: string, callback: Function) => void;
    removeEventListener: (element: CSObject, eventType: string, callback: Function) => void;
    removeAllEventListeners: (element: CSObject) => void;
    setParent: (childHandle: number, parentHandle: number) => void;
    removeParent: (childHandle: number) => void;
};

// Panel root element, provided by the runtime. This is also the container apps
// pass to render(), so it is the natural home for a shared overlay layer.
declare const __root: CSObject;


// ScrollView-specific interface
interface CSScrollView extends CSObject {
    mode: number;
    horizontalScrollerVisibility: number;
    verticalScrollerVisibility: number;
    elasticity: number;
    elasticAnimationIntervalMs: number;
    scrollDecelerationRate: number;
    mouseWheelScrollSize: number;
    horizontalPageSize: number;
    verticalPageSize: number;
    touchScrollBehavior: number;
    nestedInteractionKind: number;
}

// ListView-specific interface
interface CSListView extends CSObject {
    // Data binding callbacks
    itemsSource: unknown[];
    makeItem: () => CSObject;
    bindItem: (element: CSObject, index: number) => void;
    unbindItem: (element: CSObject, index: number) => void;
    destroyItem: (element: CSObject) => void;

    // Virtualization
    fixedItemHeight: number;
    virtualizationMethod: number;

    // Selection
    selectionType: number;
    selectedIndex: number;
    selectedIndices: number[];

    // Reordering
    reorderable: boolean;
    reorderMode: number;

    // Header/Footer
    showFoldoutHeader: boolean;
    headerTitle: string;
    showAddRemoveFooter: boolean;

    // Appearance
    showBorder: boolean;
    showAlternatingRowBackgrounds: number;

    // Methods
    RefreshItems: () => void;
    Rebuild: () => void;
}

// TreeView-specific interface (see applyTreeViewProps; data flows through
// CS.OneJS.TreeViewBridge because SetRootItems<T> is a generic method)
interface CSTreeView extends CSObject {
    makeItem: () => CSObject;
    bindItem: (element: CSObject, index: number) => void;
    unbindItem: (element: CSObject, index: number) => void;
    destroyItem: (element: CSObject) => void;

    fixedItemHeight: number;
    virtualizationMethod: number;
    autoExpand: boolean;
    selectionType: number;
    showBorder: boolean;
    showAlternatingRowBackgrounds: number;

    GetIdForIndex: (index: number) => number;
    add_selectedIndicesChanged: (handler: (indices: unknown) => void) => void;
}

// Elements that merge text children into their text property instead of adding as visual children
// This enables <Label>Hello {"World"}</Label> to render as single line, matching React Native behavior
const TEXT_MERGE_TYPES = new Set(['ojs-label', 'ojs-text', 'ojs-button']);

// Instance type used by the reconciler
export interface Instance {
    element: CSObject;
    type: string;
    props: BaseProps;
    eventHandlers: Map<string, Function>;
    // The inline style as last sent: longhand key -> the raw value it came from
    appliedStyle: FlatStyle;
    // For text-merging parents: ordered list of merged text children
    mergedTextChildren?: Instance[];
    // For merged text children: reference to parent they're merged into
    mergedInto?: Instance;
    // For text instances: the string React last gave it. A merged child's own
    // element is not drawn, so its text is kept here and its element is told
    // only when it is unmerged: reading element.text back is a crossing.
    text?: string;
    // Set to true when a non-text child is added, disabling further text merging
    hasMixedContent?: boolean;
    // For vector drawing: track the current generateVisualContent callback
    visualContentCallback?: GenerateVisualContentCallback;
    // For TextField: the inner input element, resolved once and cached.
    // undefined = never looked up; null = looked up and not found.
    inputElement?: CSObject | null;
    // For TextField: the inputStyle as last sent, like appliedStyle
    appliedInputStyle?: FlatStyle;
    // The one `change` listener, registered while the element has onChange or
    // a controlled value. Stable for the instance's life; reads instance.props.
    changeListener?: (event: ChangeDispatch) => void;
}

// What the bootstrap hands a `change` listener, as far as the reconciler reads it
interface ChangeDispatch {
    target?: number;
}

export type TextInstance = Instance; // For Label elements with text content
export type Container = CSObject;
export type ChildSet = never; // Not using persistent mode

// Map React element types to UI Toolkit classes
// Element types use 'ojs-' prefix to avoid conflicts with HTML/SVG in @types/react
/**
 * How far a ScrollView steps per wheel event, when something upstream is
 * normalising the wheel.
 *
 * On WebGL the OneJS bootstrap accumulates pixel deltas and emits one event per
 * notch of travel, because Unity's legacy input discards a wheel event's
 * magnitude and only the count survives. That fixes how FAR a gesture goes and
 * says nothing about how it gets there: the panel still jumps three ticks of
 * mouseWheelScrollSize per event, 54px at the default 18, which is felt as
 * stutter on a trackpad.
 *
 * The two are one setting, not two. Distance per gesture is
 * (gesture / notch) x 3 x step, so holding it constant means step = 0.18 x
 * notch, and deriving the step here rather than shipping a second constant is
 * what stops them drifting apart: halve the notch and the step follows, and a
 * gesture covers the same distance in twice as many, half-sized jumps.
 *
 * Returns null off WebGL, where __ojWheelNotch does not exist, nothing is
 * normalising anything, and lowering this would only make scrolling slower.
 * An explicit mouseWheelScrollSize prop still wins: this is a default, applied
 * at construction, and applyScrollViewProps runs after it.
 */
function pairedWheelStep(): number | null {
    const notch = (globalThis as unknown as { __ojWheelNotch?: unknown }).__ojWheelNotch;
    return typeof notch === 'number' && notch > 0 ? notch * 0.18 : null;
}

const TYPE_MAP: Record<string, () => CSObject> = {
    'ojs-view': () => new CS.UnityEngine.UIElements.VisualElement(),
    'ojs-text': () => new CS.UnityEngine.UIElements.TextElement(),
    'ojs-label': () => new CS.UnityEngine.UIElements.Label(),
    'ojs-button': () => new CS.UnityEngine.UIElements.Button(),
    'ojs-textfield': () => new CS.UnityEngine.UIElements.TextField(),
    'ojs-toggle': () => new CS.UnityEngine.UIElements.Toggle(),
    'ojs-slider': () => new CS.UnityEngine.UIElements.Slider(),
    'ojs-scrollview': () => {
        const view = new CS.UnityEngine.UIElements.ScrollView() as CSScrollView;
        const step = pairedWheelStep();
        if (step !== null) view.mouseWheelScrollSize = step;
        return view;
    },
    'ojs-image': () => new CS.UnityEngine.UIElements.Image(),
    'ojs-listview': () => new CS.UnityEngine.UIElements.ListView(),
    'ojs-treeview': () => new CS.UnityEngine.UIElements.TreeView(),
    'ojs-frostedglass': () => new CS.OneJS.GPU.FrostedGlassElement(),
    'ojs-shaderfx': () => new CS.OneJS.ShaderFX.ShaderEffectElement(),
};

// Built-in types with specific prop handling in applyComponentProps
const BUILT_IN_TYPES = new Set(Object.keys(TYPE_MAP));

/**
 * Register a custom VisualElement type for use in React JSX.
 *
 * @param name: Element name (with or without 'ojs-' prefix)
 * @param constructor: C# constructor reference (e.g., CS.MyNamespace.MyWidget)
 *
 * @example
 * import { registerElement, createComponent } from "onejs-react"
 *
 * // Register the custom element
 * registerElement("radial-progress", CS.MyGame.UI.RadialProgress)
 *
 * // Create a typed React component for it
 * const RadialProgress = createComponent<RadialProgressProps>("radial-progress")
 *
 * // Use in JSX
 * <RadialProgress progress={0.75} />
 */
export function registerElement(name: string, constructor: new (...args: any[]) => any): void {
    const key = name.startsWith('ojs-') ? name : `ojs-${name}`;
    if (TYPE_MAP[key]) {
        console.error(`registerElement: "${name}" is already registered. Overwriting.`);
    }
    TYPE_MAP[key] = () => new constructor();
}

// Event prop to event type mapping
const EVENT_PROPS: Record<string, string> = {
    // Click
    onClick: 'click',

    // Pointer events
    onPointerDown: 'pointerdown',
    onPointerUp: 'pointerup',
    onPointerMove: 'pointermove',
    onPointerEnter: 'pointerenter',
    onPointerLeave: 'pointerleave',
    onPointerCancel: 'pointercancel',
    onPointerCapture: 'pointercapture',
    onPointerCaptureOut: 'pointercaptureout',

    // Mouse events
    onMouseDown: 'mousedown',
    onMouseUp: 'mouseup',
    onMouseMove: 'mousemove',
    onMouseEnter: 'mouseenter',
    onMouseLeave: 'mouseleave',
    onMouseOver: 'mouseover',
    onMouseOut: 'mouseout',
    onWheel: 'wheel',
    onContextClick: 'contextclick',

    // Focus events
    onFocus: 'focus',
    onBlur: 'blur',
    onFocusIn: 'focusin',
    onFocusOut: 'focusout',

    // Keyboard events
    onKeyDown: 'keydown',
    onKeyUp: 'keyup',

    // Input events
    onChange: 'change',
    onInput: 'input',

    // Drag events
    onDragEnter: 'dragenter',
    onDragLeave: 'dragleave',
    onDragUpdated: 'dragupdated',
    onDragPerform: 'dragperform',
    onDragExited: 'dragexited',

    // Geometry events
    onGeometryChanged: 'geometrychanged',

    // Navigation events
    onNavigationMove: 'navigationmove',
    onNavigationSubmit: 'navigationsubmit',
    onNavigationCancel: 'navigationcancel',

    // Tooltip
    onTooltip: 'tooltip',

    // Transition events
    onTransitionRun: 'transitionrun',
    onTransitionStart: 'transitionstart',
    onTransitionEnd: 'transitionend',
    onTransitionCancel: 'transitioncancel',
};

// Shorthand style properties that expand to multiple properties
const STYLE_SHORTHANDS: Record<string, string[]> = {
    padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
    borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
    borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
};

// Shallow equality check for plain objects (style, props).
// Returns true if both have identical own-property values (===).
function shallowEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
        const k = keysA[i];
        if (a[k] !== b[k]) return false;
    }
    return true;
}

/**
 * A style object flattened to what UI Toolkit has: longhand key -> the raw
 * value the style gave it. Shorthands are expanded (`padding: 8` gives four
 * entries of 8) and a later entry wins, so `{ padding: 8, paddingTop: 4 }`
 * holds 4 for paddingTop. Undefined entries are left out.
 *
 * Two of these compare key by key, which is how an update finds the
 * longhands it has to send and the ones it has to clear.
 */
type FlatStyle = Map<string, unknown>;

const EMPTY_STYLE: FlatStyle = new Map();

function flattenStyle(style: ViewStyle | undefined): FlatStyle {
    const flat: FlatStyle = new Map();
    if (!style) return flat;

    for (const [key, value] of Object.entries(style)) {
        if (value === undefined) continue;

        const expanded = STYLE_SHORTHANDS[key];
        if (expanded) {
            for (const prop of expanded) flat.set(prop, value);
        } else {
            flat.set(key, value);
        }
    }
    return flat;
}

/**
 * RenderTexture-like object for backgroundImage style property.
 * Can be either:
 * - A marker object with __rtHandle (from rt.getUnityObject())
 * - A RenderTexture object directly (has __handle property)
 */
interface RenderTextureRef {
    __rtHandle?: number;
    __handle?: number;
}

/**
 * Check if a value is a RenderTexture or RenderTexture handle marker.
 * Supports both:
 * - Direct RenderTexture objects (have __handle)
 * - Marker objects from getUnityObject() (have __rtHandle)
 */
function isRenderTextureHandle(value: unknown): value is RenderTextureRef {
    if (typeof value !== "object" || value === null) return false;
    return "__rtHandle" in value || "__handle" in value;
}

/**
 * Get the RT handle from a RenderTexture-like object.
 */
function getRenderTextureHandle(value: RenderTextureRef): number {
    return value.__rtHandle ?? value.__handle ?? -1;
}

// Apply a style to a new element; returns it flattened, for the next update.
function applyStyle(element: CSObject, style: ViewStyle | undefined): FlatStyle {
    const flat = flattenStyle(style);
    sendStyles(element, flat, flat.keys());
    return flat;
}

// Move an element from the style it was last sent to a new one: send the
// longhands whose value changed and the ones that are gone, which go as null
// and clear. Returns the new style flattened, for the next update.
function updateStyle(element: CSObject, previous: FlatStyle, style: ViewStyle | undefined): FlatStyle {
    const next = flattenStyle(style);
    const changed: string[] = [];
    for (const [key, value] of next) {
        if (!previous.has(key) || !Object.is(previous.get(key), value)) changed.push(key);
    }
    for (const key of previous.keys()) {
        if (!next.has(key)) changed.push(key);
    }
    sendStyles(element, next, changed);
    return next;
}

// Send the given longhands of a flattened style. A key the style no longer has
// goes as null: StyleBridge clears it to StyleKeyword.Null, so the sheet's value
// shows again, and warns once rather than throwing for a key this Unity lacks.
// (Assigning undefined through element.style set the property's default
// instead, width 0 or opacity 0, and threw for an unknown key.)
//
// One crossing for all of them: the values are parsed into plain data (see
// style-parser.ts) and handed to CS.OneJS.StyleBridge.ApplyStyles together.
// On WebGL each crossing is ~3ms (JSON marshal + reflection), so this is the
// difference between one call per element and one per property.
// backgroundImage stays on its own GPU-bridge path since it is not a plain
// IStyle setter.
function sendStyles(element: CSObject, flat: FlatStyle, keys: Iterable<string>) {
    let batched: Record<string, unknown> | null = null;
    for (const key of keys) {
        const value = flat.get(key);
        if (key === "backgroundImage") {
            applyBackgroundImage(element, value);
            continue;
        }
        batched ??= {};
        batched[key] = value === undefined ? null : resolveForBatch(parseStyleValue(key, value));
    }
    if (batched) CS.OneJS.StyleBridge.ApplyStyles(element, batched);
}

function applyBackgroundImage(element: CSObject, value: unknown) {
    if (value == null) {
        CS.OneJS.GPU.GPUBridge.ClearElementBackgroundImage(element);
    } else if (isRenderTextureHandle(value)) {
        const handle = getRenderTextureHandle(value);
        if (handle >= 0) {
            CS.OneJS.GPU.GPUBridge.SetElementBackgroundImage(element, handle);
        }
    } else if (typeof value === "object" && "__csHandle" in value) {
        CS.OneJS.GPU.GPUBridge.SetElementBackgroundFromObject(element, value as CSObject);
    }
}

// Shared overlay layer for <Portal>. A full-screen, click-through element kept as
// the LAST child of __root, so portaled content (modals, tooltips, dropdowns)
// always paints above the app and escapes any `overflow: hidden` ancestor.
//
// It must be appended AFTER the app's root view exists, otherwise it lands before
// the app and renders behind it. Callers create it from an effect (post-mount), by
// which point the app root is already in __root, so Add() puts the layer last.
//
// Keyed by __root so a fresh root (e.g. after a domain reload) gets its own layer.
const _portalLayers = new WeakMap<object, VisualElement>();

export function getPortalLayer(): VisualElement {
    const root = __root as unknown as object;
    let layer = _portalLayers.get(root);
    if (!layer) {
        const el: CSObject = new CS.UnityEngine.UIElements.VisualElement();
        el.name = "onejs-portal-root";
        applyStyle(el, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
        // The layer itself ignores picking so empty regions stay click-through; its
        // children (modals, etc.) still receive input normally.
        el.pickingMode = CS.UnityEngine.UIElements.PickingMode.Ignore;
        __root.Add(el);
        // Portaled content bubbles through the layer to __root, as DOM portal
        // content reaches document: that is where dismissal listens.
        trackParent(el, __root as unknown as CSObject);
        layer = el;
        _portalLayers.set(root, layer);
    }
    return layer;
}

// Force-resolve CS path proxies (e.g. CS.UnityEngine.UIElements.Justify.Center)
// to their underlying int value. parseStyleValue no longer returns any, but a
// style may hold one directly (`display: CS...DisplayStyle.None`), and its
// .valueOf() reads the int via GetField. The batched path JSON.stringifies the
// whole dict, so a path proxy would otherwise serialize via toJSON to
// {__csTypeRef:...}, which C# can't interpret as an enum value. CS object
// proxies (with __csHandle) keep their toJSON shape: only path proxies need
// coercion.
function resolveForBatch(value: unknown): unknown {
    // Path proxies (e.g. CS.UnityEngine.UIElements.Justify.Center) have a
    // function as their underlying Proxy target so they can also be invoked
    // as constructors, so typeof is "function", not "object". Just check the
    // __csPathProxy sentinel and rely on truthy/property semantics.
    if (value && (value as any).__csPathProxy) {
        return Number(value)
    }
    return value
}

// Parse className string into a Set of escaped class names.
// Results are cached since the same className strings recur across renders.
const _parseCache = new Map<string, Set<string>>();
function parseClassNames(className: string | undefined): Set<string> {
    if (!className) return new Set();
    const cached = _parseCache.get(className);
    if (cached !== undefined) return cached;
    const result = new Set(
        className.split(/\s+/)
            .filter(Boolean)
            .map(escapeClassName)
    );
    _parseCache.set(className, result);
    return result;
}

// Apply className(s) to element (with escaping for Tailwind/USS compatibility).
// Routes through StyleBridge.AddClassesBatch so a multi-class string is one
// __cs.invoke crossing instead of one per class.
function applyClassName(element: CSObject, className: string | undefined) {
    if (!className) return;

    const classes: string[] = [];
    for (const cls of className.split(/\s+/)) {
        if (cls) classes.push(escapeClassName(cls));
    }
    if (classes.length > 0) {
        CS.OneJS.StyleBridge.AddClassesBatch(element, classes);
    }
}

// Update className selectively: only add/remove what changed
function updateClassNames(element: CSObject, oldClassName: string | undefined, newClassName: string | undefined) {
    const oldClasses = parseClassNames(oldClassName);
    const newClasses = parseClassNames(newClassName);

    // Remove classes that are no longer present
    for (const cls of oldClasses) {
        if (!newClasses.has(cls)) {
            element.RemoveFromClassList(cls);
        }
    }

    // Add classes that are new
    for (const cls of newClasses) {
        if (!oldClasses.has(cls)) {
            element.AddToClassList(cls);
        }
    }
}

// Track parent-child relationships for event bubbling
function trackParent(child: CSObject, parent: CSObject) {
    const childHandle = (child as unknown as { __csHandle: number }).__csHandle;
    const parentHandle = (parent as unknown as { __csHandle: number }).__csHandle;
    if (childHandle > 0 && parentHandle > 0) {
        __eventAPI.setParent(childHandle, parentHandle);
    }
}

function untrackParent(child: CSObject) {
    const childHandle = (child as unknown as { __csHandle: number }).__csHandle;
    if (childHandle > 0) {
        __eventAPI.removeParent(childHandle);
    }
}

// Tree wiring routes through CS.OneJS.NodeBridge, a zero-alloc fast path, instead
// of the per-element VisualElement.Add/Insert/RemoveFromHierarchy reflection calls.
// Handles are read from the proxy's __csHandle (a JS-side field, no crossing).
// Falls back to the direct proxy call when a handle isn't available (e.g. a
// container that isn't a handle-tracked element).
function elementHandle(el: CSObject): number {
    return (el as unknown as { __csHandle?: number }).__csHandle ?? -1;
}

function nodeAdd(parentEl: CSObject, childEl: CSObject) {
    const ph = elementHandle(parentEl);
    const ch = elementHandle(childEl);
    if (ph > 0 && ch > 0) CS.OneJS.NodeBridge.Add(ph, ch);
    else parentEl.Add(childEl);
}

function nodeInsert(parentEl: CSObject, index: number, childEl: CSObject) {
    const ph = elementHandle(parentEl);
    const ch = elementHandle(childEl);
    if (ph > 0 && ch > 0) CS.OneJS.NodeBridge.Insert(ph, index, ch);
    else parentEl.Insert(index, childEl);
}

function nodeRemoveFromHierarchy(childEl: CSObject) {
    const ch = elementHandle(childEl);
    if (ch > 0) CS.OneJS.NodeBridge.RemoveFromHierarchy(ch);
    else childEl.RemoveFromHierarchy();
}


// `change` has its own listener (see applyChangeListener); every other event
// prop registers the handler it was given.
const DIRECT_EVENT_ENTRIES = Object.entries(EVENT_PROPS).filter(([, eventType]) => eventType !== 'change');

// Runs a callback and commits any React update it scheduled before returning.
// The renderer installs the reconciler's flushSync here; host-config cannot
// import it without a module cycle.
let runSync: <T>(fn: () => T) => T = (fn) => fn();

/** Internal: called once by the renderer. */
export function setSyncRunner(fn: <T>(fn: () => T) => T): void {
    runSync = fn;
}

// Apply event handlers
function applyEvents(instance: Instance, props: BaseProps) {
    applyChangeListener(instance, props);
    for (const [propName, eventType] of DIRECT_EVENT_ENTRIES) {
        const handler = (props as Record<string, unknown>)[propName] as Function | undefined;
        const existingHandler = instance.eventHandlers.get(eventType);

        if (handler !== existingHandler) {
            if (existingHandler) {
                __eventAPI.removeEventListener(instance.element, eventType, existingHandler);
                instance.eventHandlers.delete(eventType);
            }
            if (handler) {
                __eventAPI.addEventListener(instance.element, eventType, handler);
                instance.eventHandlers.set(eventType, handler);
            }
        }
    }
}

/**
 * Controlled inputs, the way React DOM does them: a control given `value`
 * shows that value whatever the user did to it.
 *
 * UI Toolkit changes the native control before ChangeEvent reaches JS. When
 * the handler rejects or transforms the change, state may not change at all,
 * React bails out, nothing commits, and the control would keep the user's
 * value. So the listener runs onChange inside flushSync, which commits any
 * state it set before returning, then compares the element with the value
 * prop and writes the prop back without raising another ChangeEvent.
 *
 * One listener per instance, reading the latest props, so a new inline
 * onChange each render costs nothing. It is registered while the element has
 * onChange or a controlled value, and removed when it has neither.
 */
function applyChangeListener(instance: Instance, props: BaseProps) {
    const p = props as Record<string, unknown>;
    const wanted = p.onChange !== undefined || p.value != null;
    if (wanted && !instance.changeListener) {
        const listener = (event: ChangeDispatch) => dispatchChange(instance, event);
        instance.changeListener = listener;
        __eventAPI.addEventListener(instance.element, 'change', listener);
    } else if (!wanted && instance.changeListener) {
        __eventAPI.removeEventListener(instance.element, 'change', instance.changeListener);
        instance.changeListener = undefined;
    }
}

function dispatchChange(instance: Instance, event: ChangeDispatch) {
    try {
        const onChange = (instance.props as Record<string, unknown>).onChange as ((e: unknown) => void) | undefined;
        if (onChange) runSync(() => onChange(event));
    } finally {
        // A change bubbling up from a descendant is the descendant's to restore
        if (event.target === undefined || event.target === elementHandle(instance.element)) {
            reassertValue(instance);
        }
    }
}

// The built-in controls, all INotifyValueChanged<T>
const VALUE_CONTROL_TYPES = new Set(['ojs-textfield', 'ojs-toggle', 'ojs-slider']);

function reassertValue(instance: Instance) {
    const value = (instance.props as Record<string, unknown>).value;
    if (value == null) return;
    const el = instance.element as any;
    if (el.value === value) return;
    if (VALUE_CONTROL_TYPES.has(instance.type)) {
        el.SetValueWithoutNotify(value);
        return;
    }
    // A registered element: every UI Toolkit field (DropdownField, IntegerField,
    // EnumField...) implements INotifyValueChanged and has SetValueWithoutNotify.
    // One that raises ChangeEvent without it falls back to a plain write.
    try {
        el.SetValueWithoutNotify(value);
    } catch {
        el.value = value;
    }
}

/**
 * Apply generateVisualContent callback for vector drawing.
 * Uses Unity's generateVisualContent delegate on VisualElement.
 *
 * This follows the same pattern as ListView's makeItem/bindItem callbacks -
 * we assign JS functions directly to C# delegate properties via the interop layer.
 */
function applyVisualContentCallback(instance: Instance, props: BaseProps) {
    const callback = props.onGenerateVisualContent;
    const existingCallback = instance.visualContentCallback;

    if (callback !== existingCallback) {
        const element = instance.element as unknown as { generateVisualContent: GenerateVisualContentCallback | null };

        // Remove old callback if exists
        if (existingCallback) {
            // Clear the delegate via C# interop
            element.generateVisualContent = null;
        }

        // Add new callback if provided
        if (callback) {
            // Assign callback to generateVisualContent property
            // The C# interop layer handles the delegate conversion
            element.generateVisualContent = callback;
            instance.visualContentCallback = callback;
        } else {
            instance.visualContentCallback = undefined;
        }

        // A different drawing is only a different drawing once the element has
        // been told. UI Toolkit caches the mesh a callback generated and will
        // not call the new one until something invalidates it, so swapping the
        // callback on its own leaves the OLD picture on screen indefinitely.
        // The failure is confusing rather than obviously broken: text and
        // styles beside it keep updating, so a card ends up showing one suit's
        // rank next to another suit's pip.
        instance.element.MarkDirtyRepaint();
    }
}

// MARK: Text Merging
// Rebuild concatenated text from merged text children
function rebuildMergedText(instance: Instance) {
    const children = instance.mergedTextChildren;
    if (!children || children.length === 0) {
        // No merged children: clear text (or keep prop-based text?)
        // For now, set to empty: if user wants text, they should use children
        instance.element.text = '';
        return;
    }
    instance.element.text = children.map(c => c.text ?? '').join('');
}

// Check if a child should be merged into parent's text property
function shouldMergeText(parentInstance: Instance, child: Instance): boolean {
    // Don't merge if parent has mixed content (non-text children were added)
    if (parentInstance.hasMixedContent) return false;
    return TEXT_MERGE_TYPES.has(parentInstance.type) && child.type === 'text';
}

// "Unmerge" all text children: add them as actual visual children
// Called when a non-text child is added, breaking the pure-text assumption
function unmergTextChildren(parentInstance: Instance) {
    const children = parentInstance.mergedTextChildren;
    if (!children || children.length === 0) return;

    // Clear parent's merged text
    parentInstance.element.text = '';

    // Add each merged text child as an actual visual child, carrying the text
    // it was given while merged, which went only to the parent
    for (const child of children) {
        child.mergedInto = undefined;
        child.element.text = child.text ?? '';
        nodeAdd(parentInstance.element, child.element);
    }

    // Clear the merged children list
    parentInstance.mergedTextChildren = undefined;
    parentInstance.hasMixedContent = true;
}

// Handle adding a non-text child to a text-merge parent
// This triggers unmerging of any previously merged text
function handleNonTextChild(parentInstance: Instance) {
    if (TEXT_MERGE_TYPES.has(parentInstance.type) && !parentInstance.hasMixedContent) {
        unmergTextChildren(parentInstance);
    }
}

// Append a text child to a text-merging parent
function appendMergedTextChild(parentInstance: Instance, child: Instance) {
    if (!parentInstance.mergedTextChildren) {
        parentInstance.mergedTextChildren = [];
    }
    parentInstance.mergedTextChildren.push(child);
    child.mergedInto = parentInstance;
    rebuildMergedText(parentInstance);
}

// Insert a text child before another in a text-merging parent
function insertMergedTextChild(parentInstance: Instance, child: Instance, beforeChild: Instance) {
    if (!parentInstance.mergedTextChildren) {
        parentInstance.mergedTextChildren = [];
    }
    const index = parentInstance.mergedTextChildren.indexOf(beforeChild);
    if (index >= 0) {
        parentInstance.mergedTextChildren.splice(index, 0, child);
    } else {
        parentInstance.mergedTextChildren.push(child);
    }
    child.mergedInto = parentInstance;
    rebuildMergedText(parentInstance);
}

// Remove a text child from a text-merging parent
function removeMergedTextChild(parentInstance: Instance, child: Instance) {
    const children = parentInstance.mergedTextChildren;
    if (children) {
        const index = children.indexOf(child);
        if (index >= 0) {
            children.splice(index, 1);
        }
    }
    child.mergedInto = undefined;
    rebuildMergedText(parentInstance);
}

// Insert childEl immediately before beforeChildEl in parentEl's child list.
//
// Unity's VisualElement.Insert(i, child) calls child.RemoveFromHierarchy() *before*
// placing it at index i. So when childEl is already a child of parentEl sitting
// *before* beforeChildEl (a reorder/move, which is exactly what react-reconciler
// commits via insertBefore for a reused keyed child), that internal removal shifts
// beforeChildEl down one slot and childEl overshoots its target, landing one
// position too late (e.g. past a static sibling kept last). Target one slot earlier
// in precisely that case. Fresh inserts (childEl not yet in parentEl) and children
// sitting after beforeChildEl are unaffected.
//
// IndexOf/Insert/Add all route through contentContainer identically, so the indices
// and the insertion share one coordinate space (correct for ScrollView-style parents).
function insertElementBefore(parentEl: CSObject, childEl: CSObject, beforeChildEl: CSObject) {
    const beforeIndex = parentEl.IndexOf(beforeChildEl);
    if (beforeIndex < 0) {
        // beforeChild isn't actually in the parent (should not normally happen).
        // Fall back to appending, preserving the previous fallback behavior.
        nodeAdd(parentEl, childEl);
        return;
    }
    const childIndex = parentEl.IndexOf(childEl);
    const target = childIndex >= 0 && childIndex < beforeIndex ? beforeIndex - 1 : beforeIndex;
    nodeInsert(parentEl, target, childEl);
}

// MARK: Component-specific prop handlers

// Apply common props (text, value, label): skip unchanged values
function applyCommonProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    if (props.text !== undefined && props.text !== oldProps?.text) el.text = props.text as string;
    if (props.value !== undefined && props.value !== oldProps?.value) el.value = props.value;
    if (props.label !== undefined && props.label !== oldProps?.label) el.label = props.label as string;
}

// Helper to set enum prop if defined and changed
function setEnumProp<T>(target: T, key: keyof T, props: Record<string, unknown>, propKey: string, enumType: CSEnum, oldProps?: Record<string, unknown>) {
    if (props[propKey] !== undefined && props[propKey] !== oldProps?.[propKey]) {
        (target as Record<string, unknown>)[key as string] = enumType[props[propKey] as string];
    }
}

// Helper to set value prop if defined and changed
function setValueProp<T>(target: T, key: keyof T, props: Record<string, unknown>, propKey: string, oldProps?: Record<string, unknown>) {
    if (props[propKey] !== undefined && props[propKey] !== oldProps?.[propKey]) {
        (target as Record<string, unknown>)[key as string] = props[propKey];
    }
}

// Apply TextField-specific properties: skip unchanged values
function applyTextFieldProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    // Unlike every other prop here, `placeholder` is not a TextField property:
    // Unity only exposes it on the text edition interface.
    if (props.placeholder !== undefined && props.placeholder !== oldProps?.placeholder) {
        el.textEdition.placeholder = props.placeholder;
    }
    if (props.readOnly !== undefined && props.readOnly !== oldProps?.readOnly) el.isReadOnly = props.readOnly;
    if (props.multiline !== undefined && props.multiline !== oldProps?.multiline) el.multiline = props.multiline;
    if (props.maxLength !== undefined && props.maxLength !== oldProps?.maxLength) el.maxLength = props.maxLength;
    if (props.isPasswordField !== undefined && props.isPasswordField !== oldProps?.isPasswordField) el.isPasswordField = props.isPasswordField;
    if (props.maskChar !== undefined && props.maskChar !== oldProps?.maskChar) el.maskChar = (props.maskChar as string).charAt(0);
    if (props.isDelayed !== undefined && props.isDelayed !== oldProps?.isDelayed) el.isDelayed = props.isDelayed;
    if (props.selectAllOnFocus !== undefined && props.selectAllOnFocus !== oldProps?.selectAllOnFocus) el.selectAllOnFocus = props.selectAllOnFocus;
    if (props.selectAllOnMouseUp !== undefined && props.selectAllOnMouseUp !== oldProps?.selectAllOnMouseUp) el.selectAllOnMouseUp = props.selectAllOnMouseUp;
    if (props.hideMobileInput !== undefined && props.hideMobileInput !== oldProps?.hideMobileInput) el.hideMobileInput = props.hideMobileInput;
    if (props.autoCorrection !== undefined && props.autoCorrection !== oldProps?.autoCorrection) el.autoCorrection = props.autoCorrection;
}

// A TextField is a composite control: the visible box (border, background,
// padding) lives on an inner TextInput child, not on the field itself, so
// `className`/`style` on the outer element cannot reach it. `inputClassName`
// and `inputStyle` land on that inner element. Found among the field's direct
// children by the input's USS class and cached: the inner element is created
// in the TextField constructor and never replaced. Not through
// UQueryExtensions.Q: its generic Q<T> twin has the same parameters, and a
// runtime that picks the twin (OneJS 3.4.1 on Unity 6000.5) throws inside
// React's commit, taking the whole tree down with it. A child walk needs no
// overload resolution. Index is not fixed: a label, when there is one, sits
// before the input.
function getTextFieldInput(instance: Instance): CSObject | null {
    if (instance.inputElement === undefined) {
        instance.inputElement = null;
        const field = instance.element as unknown as VisualElement;
        for (let i = 0, n = field.childCount; i < n; i++) {
            const child = field.ElementAt(i);
            if (child.ClassListContains('unity-text-field__input')) {
                instance.inputElement = child as unknown as CSObject;
                break;
            }
        }
    }
    return instance.inputElement;
}

function applyTextFieldInputProps(instance: Instance, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const inputStyle = props.inputStyle as ViewStyle | undefined;
    const oldInputStyle = oldProps?.inputStyle as ViewStyle | undefined;
    if (oldProps ? (oldInputStyle !== inputStyle && !shallowEqual(oldInputStyle as any, inputStyle as any)) : inputStyle !== undefined) {
        const input = getTextFieldInput(instance);
        if (input) {
            instance.appliedInputStyle = oldProps
                ? updateStyle(input, instance.appliedInputStyle ?? EMPTY_STYLE, inputStyle)
                : applyStyle(input, inputStyle);
        }
    }

    const inputClassName = props.inputClassName as string | undefined;
    const oldInputClassName = oldProps?.inputClassName as string | undefined;
    if (oldProps ? oldInputClassName !== inputClassName : inputClassName !== undefined) {
        const input = getTextFieldInput(instance);
        if (input) {
            if (oldProps) {
                updateClassNames(input, oldInputClassName, inputClassName);
            } else {
                applyClassName(input, inputClassName);
            }
        }
    }
}

// Apply Slider-specific properties: skip unchanged values
function applySliderProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    // min and max are the words; lowValue and highValue are UI Toolkit's and
    // still accepted. The word wins when both are given.
    const low = props.min ?? props.lowValue, high = props.max ?? props.highValue;
    const oldLow = oldProps?.min ?? oldProps?.lowValue, oldHigh = oldProps?.max ?? oldProps?.highValue;
    if (low !== undefined && low !== oldLow) el.lowValue = low;
    if (high !== undefined && high !== oldHigh) el.highValue = high;
    if (props.showInputField !== undefined && props.showInputField !== oldProps?.showInputField) el.showInputField = props.showInputField;
    if (props.inverted !== undefined && props.inverted !== oldProps?.inverted) el.inverted = props.inverted;
    if (props.pageSize !== undefined && props.pageSize !== oldProps?.pageSize) el.pageSize = props.pageSize;
    if (props.fill !== undefined && props.fill !== oldProps?.fill) el.fill = props.fill;
    if (props.direction !== undefined && props.direction !== oldProps?.direction) {
        el.direction = CS.UnityEngine.UIElements.SliderDirection[props.direction as string];
    }
}

// Apply Toggle-specific properties: skip unchanged values
function applyToggleProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    if (props.text !== undefined && props.text !== oldProps?.text) el.text = props.text;
    if (props.toggleOnLabelClick !== undefined && props.toggleOnLabelClick !== oldProps?.toggleOnLabelClick) el.toggleOnLabelClick = props.toggleOnLabelClick;
}

// Apply Image-specific properties: skip unchanged values
function applyImageProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    if (props.image !== undefined && props.image !== oldProps?.image) {
        const img = props.image;
        if (img != null && (img as any).GetType?.().Name === "VectorImage") {
            el.image = null;
            el.vectorImage = img;
        } else {
            el.vectorImage = null;
            el.image = img;
        }
    }
    if (props.sprite !== undefined && props.sprite !== oldProps?.sprite) el.sprite = props.sprite;
    if (props.vectorImage !== undefined && props.vectorImage !== oldProps?.vectorImage) el.vectorImage = props.vectorImage;
    if (props.scaleMode !== undefined && props.scaleMode !== oldProps?.scaleMode) {
        el.scaleMode = CS.UnityEngine.ScaleMode[props.scaleMode as string];
    }
    if (props.tintColor !== undefined && props.tintColor !== oldProps?.tintColor) {
        const color = parseColor(props.tintColor as string);
        if (color) el.tintColor = color;
    }
    if (props.sourceRect !== undefined && props.sourceRect !== oldProps?.sourceRect) {
        const rect = props.sourceRect as { x: number; y: number; width: number; height: number };
        el.sourceRect = new CS.UnityEngine.Rect(rect.x, rect.y, rect.width, rect.height);
    }
    if (props.uv !== undefined && props.uv !== oldProps?.uv) {
        const rect = props.uv as { x: number; y: number; width: number; height: number };
        el.uv = new CS.UnityEngine.Rect(rect.x, rect.y, rect.width, rect.height);
    }
}

// Apply ScrollView-specific properties: skip unchanged values
function applyScrollViewProps(element: CSScrollView, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const UIE = CS.UnityEngine.UIElements;
    setEnumProp(element, 'mode', props, 'mode', UIE.ScrollViewMode, oldProps);
    setEnumProp(element, 'horizontalScrollerVisibility', props, 'horizontalScrollerVisibility', UIE.ScrollerVisibility, oldProps);
    setEnumProp(element, 'verticalScrollerVisibility', props, 'verticalScrollerVisibility', UIE.ScrollerVisibility, oldProps);
    setEnumProp(element, 'touchScrollBehavior', props, 'touchScrollBehavior', UIE["ScrollView+TouchScrollBehavior"], oldProps);
    setEnumProp(element, 'nestedInteractionKind', props, 'nestedInteractionKind', UIE["ScrollView+NestedInteractionKind"], oldProps);
    setValueProp(element, 'elasticity', props, 'elasticity', oldProps);
    setValueProp(element, 'elasticAnimationIntervalMs', props, 'elasticAnimationIntervalMs', oldProps);
    setValueProp(element, 'scrollDecelerationRate', props, 'scrollDecelerationRate', oldProps);
    setValueProp(element, 'mouseWheelScrollSize', props, 'mouseWheelScrollSize', oldProps);
    setValueProp(element, 'horizontalPageSize', props, 'horizontalPageSize', oldProps);
    setValueProp(element, 'verticalPageSize', props, 'verticalPageSize', oldProps);
}

// Apply ListView-specific properties: skip unchanged values
// Per-element state for collection views (ListView/TreeView). Delegate and
// event wrappers are assigned ONCE per element and read the current callback
// from here, so re-renders never re-register native callback slots (the
// callback table is a fixed 4096 slots).
interface CollectionState {
    props: Record<string, unknown>;
    dataById: Map<number, unknown> | null;
}
const collectionState = new WeakMap<object, CollectionState>();

function getCollectionState(element: object): CollectionState {
    let state = collectionState.get(element);
    if (!state) {
        state = { props: {}, dataById: null };
        collectionState.set(element, state);
    }
    return state;
}

// C# int[] arrives as a proxy with Length + indexer; mocks hand back plain arrays
function asNumberArray(value: unknown): number[] {
    if (Array.isArray(value)) return value as number[];
    const col = value as Record<string, unknown> | null;
    const len = col && typeof col.Length === 'number' ? col.Length : 0;
    const out: number[] = [];
    for (let i = 0; i < len; i++) out.push((col as any)[i] as number);
    return out;
}

// Hook a C# event once per element, at the first render that supplies the
// callback prop. The stable handler reads the current callback from
// collectionState, so later renders only need to update state.props.
function hookOnce(element: CSObject, props: Record<string, unknown>, oldProps: Record<string, unknown> | undefined, propKey: string, subscribe: () => void) {
    if (props[propKey] !== undefined && oldProps?.[propKey] === undefined) {
        subscribe();
    }
}

function applyListViewProps(element: CSListView, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const UIE = CS.UnityEngine.UIElements;

    const state = getCollectionState(element);
    state.props = props;

    hookOnce(element, props, oldProps, 'onSelectionChange', () => {
        (element as any).add_selectedIndicesChanged(() => {
            const cb = getCollectionState(element).props.onSelectionChange as ((indices: number[]) => void) | undefined;
            if (!cb) return;
            cb(asNumberArray(CS.OneJS.TreeViewBridge.GetSelectedIndices(element)));
        });
    });
    hookOnce(element, props, oldProps, 'onItemsChosen', () => {
        (element as any).add_itemsChosen(() => {
            const s = getCollectionState(element);
            const cb = s.props.onItemsChosen as ((items: unknown[]) => void) | undefined;
            if (!cb) return;
            const indices = asNumberArray(CS.OneJS.TreeViewBridge.GetSelectedIndices(element));
            const source = s.props.itemsSource as unknown[] | undefined;
            cb(indices.map(i => source?.[i]));
        });
    });

    // Data binding callbacks
    setValueProp(element, 'itemsSource', props, 'itemsSource', oldProps);
    setValueProp(element, 'makeItem', props, 'makeItem', oldProps);
    setValueProp(element, 'bindItem', props, 'bindItem', oldProps);
    setValueProp(element, 'unbindItem', props, 'unbindItem', oldProps);
    setValueProp(element, 'destroyItem', props, 'destroyItem', oldProps);

    // Virtualization
    setValueProp(element, 'fixedItemHeight', props, 'fixedItemHeight', oldProps);
    setEnumProp(element, 'virtualizationMethod', props, 'virtualizationMethod', UIE.CollectionVirtualizationMethod, oldProps);

    // Selection
    setEnumProp(element, 'selectionType', props, 'selectionType', UIE.SelectionType, oldProps);
    setValueProp(element, 'selectedIndex', props, 'selectedIndex', oldProps);
    setValueProp(element, 'selectedIndices', props, 'selectedIndices', oldProps);

    // Reordering
    setValueProp(element, 'reorderable', props, 'reorderable', oldProps);
    setEnumProp(element, 'reorderMode', props, 'reorderMode', UIE.ListViewReorderMode, oldProps);

    // Header/Footer
    setValueProp(element, 'showFoldoutHeader', props, 'showFoldoutHeader', oldProps);
    setValueProp(element, 'headerTitle', props, 'headerTitle', oldProps);
    setValueProp(element, 'showAddRemoveFooter', props, 'showAddRemoveFooter', oldProps);

    // Appearance
    setValueProp(element, 'showBorder', props, 'showBorder', oldProps);
    setEnumProp(element, 'showAlternatingRowBackgrounds', props, 'showAlternatingRowBackgrounds', UIE.AlternatingRowBackground, oldProps);
}

function applyTreeViewProps(element: CSTreeView, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const UIE = CS.UnityEngine.UIElements;

    const state = getCollectionState(element);
    state.props = props;

    // Delegates first so they are in place before the first data set. Each is a
    // stable wrapper assigned once; bindItem/unbindItem also resolve the row's
    // data (id via the non-generic GetIdForIndex, then the JS-side map).
    hookOnce(element, props, oldProps, 'makeItem', () => {
        element.makeItem = () => {
            const cb = getCollectionState(element).props.makeItem as (() => CSObject) | undefined;
            return cb ? cb() : new UIE.VisualElement();
        };
    });
    hookOnce(element, props, oldProps, 'bindItem', () => {
        element.bindItem = (item, index) => {
            const s = getCollectionState(element);
            const cb = s.props.bindItem as ((el: CSObject, i: number, data: unknown) => void) | undefined;
            if (!cb) return;
            cb(item, index, s.dataById?.get(element.GetIdForIndex(index)));
        };
    });
    hookOnce(element, props, oldProps, 'unbindItem', () => {
        element.unbindItem = (item, index) => {
            const s = getCollectionState(element);
            const cb = s.props.unbindItem as ((el: CSObject, i: number, data: unknown) => void) | undefined;
            if (!cb) return;
            cb(item, index, s.dataById?.get(element.GetIdForIndex(index)));
        };
    });
    hookOnce(element, props, oldProps, 'destroyItem', () => {
        element.destroyItem = (item) => {
            const cb = getCollectionState(element).props.destroyItem as ((el: CSObject) => void) | undefined;
            if (cb) cb(item);
        };
    });

    hookOnce(element, props, oldProps, 'onSelectionChange', () => {
        element.add_selectedIndicesChanged(() => {
            const s = getCollectionState(element);
            const cb = s.props.onSelectionChange as ((items: unknown[], ids: number[]) => void) | undefined;
            if (!cb) return;
            const ids = asNumberArray(CS.OneJS.TreeViewBridge.GetSelectedIds(element));
            cb(ids.map(id => s.dataById?.get(id)), ids);
        });
    });

    // Virtualization and behavior before data, so the first refresh already
    // sees autoExpand and the item height
    setValueProp(element, 'fixedItemHeight', props, 'fixedItemHeight', oldProps);
    setEnumProp(element, 'virtualizationMethod', props, 'virtualizationMethod', UIE.CollectionVirtualizationMethod, oldProps);
    setValueProp(element, 'autoExpand', props, 'autoExpand', oldProps);
    setEnumProp(element, 'selectionType', props, 'selectionType', UIE.SelectionType, oldProps);

    // Appearance
    setValueProp(element, 'showBorder', props, 'showBorder', oldProps);
    setEnumProp(element, 'showAlternatingRowBackgrounds', props, 'showAlternatingRowBackgrounds', UIE.AlternatingRowBackground, oldProps);

    // Data: flatten to the parallel-array wire and keep the data map JS-side
    if (props.rootItems !== undefined && props.rootItems !== oldProps?.rootItems) {
        const flat = flattenTree(props.rootItems as TreeViewItem[]);
        state.dataById = flat.dataById;
        CS.OneJS.TreeViewBridge.SetRootItems(element, flat.ids, flat.parentIds);
    }
}

// Props handled by the reconciler infrastructure, not forwarded to C# elements
const RESERVED_PROPS = new Set([
    'children', 'key', 'ref', 'style', 'className', 'name', 'pickingMode', 'focusable', 'disabled',
    'onGenerateVisualContent',
    ...Object.keys(EVENT_PROPS),
]);

// Forward non-reserved props directly to C# element (for custom elements): skip unchanged
function applyCustomProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || RESERVED_PROPS.has(key)) continue;
        if (value === oldProps?.[key]) continue;
        (element as any)[key] = value;
    }
}

// Apply component-specific props based on element type
function applyComponentProps(element: CSObject, type: string, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    // Custom elements: forward all non-reserved props directly to C# element
    if (!BUILT_IN_TYPES.has(type)) {
        applyCustomProps(element, props, oldProps);
        return;
    }

    // For Slider, apply range props (lowValue/highValue) BEFORE value
    // Unity's Slider clamps value to [lowValue, highValue], so range must be set first
    if (type === 'ojs-slider') {
        applySliderProps(element, props, oldProps);
        applyCommonProps(element, props, oldProps);
        return;
    }

    applyCommonProps(element, props, oldProps);

    if (type === 'ojs-textfield') {
        applyTextFieldProps(element, props, oldProps);
    } else if (type === 'ojs-toggle') {
        applyToggleProps(element, props, oldProps);
    } else if (type === 'ojs-image') {
        applyImageProps(element, props, oldProps);
    } else if (type === 'ojs-scrollview') {
        applyScrollViewProps(element as CSScrollView, props, oldProps);
    } else if (type === 'ojs-listview') {
        applyListViewProps(element as CSListView, props, oldProps);
    } else if (type === 'ojs-treeview') {
        applyTreeViewProps(element as CSTreeView, props, oldProps);
    } else if (type === 'ojs-frostedglass') {
        const el = element as any;
        if (props.blurRadius !== undefined && props.blurRadius !== oldProps?.blurRadius) el.BlurRadius = props.blurRadius;
        if (props.tintColor !== undefined && props.tintColor !== oldProps?.tintColor) el.TintColor = props.tintColor;
    } else if (type === 'ojs-shaderfx') {
        applyShaderFxProps(element as any, props, oldProps);
    }
}

// Create an instance
function createInstance(type: string, props: BaseProps): Instance {
    const factory = TYPE_MAP[type];
    if (!factory) {
        throw new Error(`Unknown element type: ${type}`);
    }

    const element = factory();
    const instance: Instance = {
        element,
        type,
        props,
        eventHandlers: new Map(),
        appliedStyle: applyStyle(element, props.style),
    };

    applyClassName(element, props.className);
    applyEvents(instance, props);
    applyVisualContentCallback(instance, props);
    applyComponentProps(element, type, props as Record<string, unknown>);
    if (type === 'ojs-textfield') {
        applyTextFieldInputProps(instance, props as Record<string, unknown>);
    }

    // Apply name (VisualElement.name). Drives USS #id selectors and the label
    // shown in the UI Toolkit Debugger. Universal to every VisualElement, so
    // it lives here rather than in the per-type prop handlers.
    if (props.name !== undefined) {
        element.name = props.name;
    }

    // Apply pickingMode
    if (props.pickingMode !== undefined) {
        element.pickingMode = CS.UnityEngine.UIElements.PickingMode[props.pickingMode];
    }

    // Apply focusable
    if (props.focusable !== undefined) {
        element.focusable = props.focusable;
    }

    // Apply disabled (inverted: SetEnabled(true) means "not disabled")
    if (props.disabled !== undefined) {
        element.SetEnabled(!props.disabled);
    }

    return instance;
}

// Update an instance with new props
function updateInstance(instance: Instance, oldProps: BaseProps, newProps: BaseProps) {
    const element = instance.element;
    // First, not last: writing `value` below can raise a ChangeEvent
    // synchronously, and its listener must see the props being committed, not
    // the ones they replace, or it re-asserts the old value.
    instance.props = newProps;

    // Update style: skip if values are shallowly equal (inline style objects are
    // new references each render but usually contain the same values), and
    // otherwise send only the longhands that changed
    if (oldProps.style !== newProps.style && !shallowEqual(oldProps.style as any, newProps.style as any)) {
        instance.appliedStyle = updateStyle(element, instance.appliedStyle, newProps.style);
    }

    // Update className: selectively add/remove classes
    if (oldProps.className !== newProps.className) {
        updateClassNames(element, oldProps.className, newProps.className);
    }

    // Update events
    applyEvents(instance, newProps);

    // Update vector drawing callback
    applyVisualContentCallback(instance, newProps);

    // Update component-specific props: pass oldProps to skip unchanged values
    applyComponentProps(element, instance.type, newProps as Record<string, unknown>, oldProps as Record<string, unknown>);
    if (instance.type === 'ojs-textfield') {
        applyTextFieldInputProps(instance, newProps as Record<string, unknown>, oldProps as Record<string, unknown>);
    }

    // Update name. Unity defaults VisualElement.name to "", so removing the prop
    // resets it to empty rather than leaving the stale value behind.
    if (oldProps.name !== newProps.name) {
        element.name = newProps.name ?? '';
    }

    // Update pickingMode
    if (oldProps.pickingMode !== newProps.pickingMode) {
        if (newProps.pickingMode !== undefined) {
            element.pickingMode = CS.UnityEngine.UIElements.PickingMode[newProps.pickingMode];
        } else {
            // Reset to default (Position)
            element.pickingMode = CS.UnityEngine.UIElements.PickingMode.Position;
        }
    }

    // Update focusable: only set if explicitly provided, do not override
    // element-specific defaults (Button is focusable by default, View is not)
    // when the prop is removed.
    if (oldProps.focusable !== newProps.focusable && newProps.focusable !== undefined) {
        element.focusable = newProps.focusable;
    }

    // Update disabled: unlike focusable, every VisualElement starts enabled
    // by default, so removing the prop after a previous `disabled={true}` is
    // expected to restore the enabled state.
    if (oldProps.disabled !== newProps.disabled) {
        if (newProps.disabled !== undefined) {
            element.SetEnabled(!newProps.disabled);
        } else {
            element.SetEnabled(true);
        }
    }
}

// NOTE: We use a type assertion because @types/react-reconciler (0.28.x) is outdated
// and doesn't match react-reconciler 0.31.x (React 19). The HostConfig interface
// has changed significantly: notably commitUpdate no longer receives updatePayload.
// Once @types/react-reconciler is updated for React 19, we can use proper typing.
type OurHostConfig = HostConfig<
    string,           // Type
    BaseProps,        // Props
    Container,        // Container
    Instance,         // Instance
    TextInstance,     // TextInstance
    never,            // SuspenseInstance
    never,            // HydratableInstance
    CSObject,         // PublicInstance - refs point to the actual UI Toolkit element
    {},               // HostContext
    true,             // UpdatePayload (true = needs update)
    ChildSet,         // ChildSet
    number,           // TimeoutHandle
    number            // NoTimeout
>;

// The host config for react-reconciler
export const hostConfig = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,

    isPrimaryRenderer: true,
    noTimeout: -1,

    createInstance(type: string, props: BaseProps) {
        return createInstance(type, props);
    },

    createTextInstance(text: string) {
        // Create a TextElement for implicit text content
        // Using TextElement (not Label) for semantic clarity:
        // - TextElement = raw text content in JSX
        // - Label = explicit <Label> component
        const element = new CS.UnityEngine.UIElements.TextElement();
        element.text = text;
        return {
            element,
            text,
            type: 'text',
            props: {},
            eventHandlers: new Map(),
            appliedStyle: EMPTY_STYLE,
        };
    },

    appendInitialChild(parentInstance: Instance, child: Instance) {
        if (shouldMergeText(parentInstance, child)) {
            appendMergedTextChild(parentInstance, child);
        } else {
            handleNonTextChild(parentInstance);
            nodeAdd(parentInstance.element, child.element);
        }
        trackParent(child.element, parentInstance.element);
    },

    appendChild(parentInstance: Instance, child: Instance) {
        if (shouldMergeText(parentInstance, child)) {
            appendMergedTextChild(parentInstance, child);
        } else {
            handleNonTextChild(parentInstance);
            nodeAdd(parentInstance.element, child.element);
        }
        trackParent(child.element, parentInstance.element);
    },

    appendChildToContainer(container: Container, child: Instance) {
        nodeAdd(container, child.element);
        // Linked like any other parent: JS bubbling follows these links, and a
        // listener on the container (__root) must hear what bubbles up to it.
        trackParent(child.element, container);
    },

    insertBefore(parentInstance: Instance, child: Instance, beforeChild: Instance) {
        if (shouldMergeText(parentInstance, child)) {
            insertMergedTextChild(parentInstance, child, beforeChild);
        } else {
            handleNonTextChild(parentInstance);
            insertElementBefore(parentInstance.element, child.element, beforeChild.element);
        }
        trackParent(child.element, parentInstance.element);
    },

    insertInContainerBefore(container: Container, child: Instance, beforeChild: Instance) {
        insertElementBefore(container, child.element, beforeChild.element);
        trackParent(child.element, container);
    },

    removeChild(parentInstance: Instance, child: Instance) {
        if (child.mergedInto === parentInstance) {
            removeMergedTextChild(parentInstance, child);
        } else {
            __eventAPI.removeAllEventListeners(child.element);
            // RemoveFromHierarchy() detaches the element from its current parent and
            // is a safe no-op if it's already detached. Using it instead of
            // parentInstance.element.Remove(child.element) keeps unmount from throwing
            // when the root was cleared before React tore the tree down (hot reload).
            nodeRemoveFromHierarchy(child.element);
        }
        untrackParent(child.element);
    },

    removeChildFromContainer(container: Container, child: Instance) {
        __eventAPI.removeAllEventListeners(child.element);
        // See removeChild: tolerant of an already-detached element so a hot-reload
        // teardown (which clears the root first) can still unmount cleanly.
        nodeRemoveFromHierarchy(child.element);
        untrackParent(child.element);
    },

    prepareUpdate(_instance: Instance, _type: string, oldProps: BaseProps, newProps: BaseProps) {
        // Return true if we need to update, null if no update needed
        return oldProps !== newProps ? true : null;
    },

    // React 19 changed the signature: (instance, type, oldProps, newProps, fiber)
    // The updatePayload parameter was removed!
    commitUpdate(instance: Instance, _type: string, oldProps: BaseProps, newProps: BaseProps, _fiber: unknown) {
        updateInstance(instance, oldProps, newProps);
    },

    commitTextUpdate(textInstance: Instance, _oldText: string, newText: string) {
        textInstance.text = newText;
        // A merged text shows only through its parent's concatenated text, so
        // that is the one element told: one crossing, not three
        if (textInstance.mergedInto) {
            rebuildMergedText(textInstance.mergedInto);
        } else {
            textInstance.element.text = newText;
        }
    },

    finalizeInitialChildren() {
        return false;
    },

    getPublicInstance(instance: Instance) {
        // Return the actual UI Toolkit element so refs point to it
        return instance.element;
    },

    prepareForCommit() {
        return null;
    },

    resetAfterCommit() {
        // Nothing to do
    },

    preparePortalMount() {
        // Nothing to do
    },

    getRootHostContext() {
        return {};
    },

    getChildHostContext(parentHostContext: {}) {
        return parentHostContext;
    },

    shouldSetTextContent() {
        return false;
    },

    clearContainer(container: Container) {
        // Clear() also removes the portal layer, so forget it: the next Portal
        // makes a new one instead of rendering into a detached element.
        _portalLayers.delete(container as unknown as object);
        container.Clear();
    },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,

    // Priority management: required by React 19's reconciler
    setCurrentUpdatePriority(priority: number) {
        currentUpdatePriority = priority;
    },

    getCurrentUpdatePriority() {
        return currentUpdatePriority;
    },

    resolveUpdatePriority() {
        // When no specific priority is set, use default
        return currentUpdatePriority || DefaultEventPriority;
    },

    getCurrentEventPriority() {
        return DefaultEventPriority;
    },

    // Microtask support
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,

    // Transition support
    shouldAttemptEagerTransition() {
        return false;
    },

    // Form support (React 19)
    NotPendingTransition: null as unknown,
    resetFormInstance() {},

    getInstanceFromNode() {
        return null;
    },

    beforeActiveInstanceBlur() {
    },
    afterActiveInstanceBlur() {
    },
    prepareScopeUpdate() {
    },
    getInstanceFromScope() {
        return null;
    },

    detachDeletedInstance() {
    },

    // Suspense commit support (React 19)
    maySuspendCommit() {
        return false;
    },
    preloadInstance() {
        return true; // Already loaded
    },
    startSuspendingCommit() {
    },
    suspendInstance() {
    },
    waitForCommitToBeReady() {
        return null;
    },

    // Visibility support
    hideInstance(instance: Instance) {
        instance.element.style.display = CS.UnityEngine.UIElements.DisplayStyle.None;
    },
    hideTextInstance(textInstance: TextInstance) {
        textInstance.element.style.display = CS.UnityEngine.UIElements.DisplayStyle.None;
    },
    unhideInstance(instance: Instance, props: BaseProps) {
        // Restore what the element asked for rather than forcing Flex: its own
        // display: "none", or no inline value so its USS classes decide.
        const own = props.style?.display;
        instance.element.style.display = own === "none"
            ? CS.UnityEngine.UIElements.DisplayStyle.None
            : own === "flex" ? CS.UnityEngine.UIElements.DisplayStyle.Flex : undefined;
    },
    unhideTextInstance(textInstance: TextInstance, _text: string) {
        textInstance.element.style.display = CS.UnityEngine.UIElements.DisplayStyle.Flex;
    },

    // Text content
    resetTextContent(_instance: Instance) {
        // Nothing to do for UI Toolkit
    },

    // Resources (not used)
    supportsResources: false,

    // Singletons (not used)
    supportsSingletons: false,

    // Test selectors (not used)
    supportsTestSelectors: false,

    // Post paint callback (not used)
    requestPostPaintCallback() {
    },

    // Event resolution (not used)
    resolveEventType() {
        return null;
    },
    resolveEventTimeStamp() {
        return 0;
    },

    // Console binding (dev tools)
    bindToConsole(methodName: string, args: unknown[], _badgeName: string) {
        return (console as Record<string, Function>)[methodName]?.bind(console, ...args);
    },
} as unknown as OurHostConfig;

// MARK: ShaderFX


/**
 * A uniform name the program never declared, warned once per program.
 *
 * Names are strings on both sides, so a typo in `uniforms={{ wrap: v }}` type
 * checks, sets nothing and draws the default forever. Dropping it silently
 * turned that into "the slider does nothing" with no line to look at.
 */
const warnedUniforms = new Set<string>();
function warnUnknownUniform(hash: string | undefined, name: string, declared: readonly string[] | undefined) {
    const key = `${hash ?? ''}:${name}`;
    if (warnedUniforms.has(key)) return;
    warnedUniforms.add(key);
    const known = declared && declared.length > 0 ? declared.map((n) => `"${n}"`).join(', ') : 'none';
    console.warn(`[onejs-react] ShaderProgram: no uniform named "${name}" in this program (declared: ${known}). Check the name passed to sl.uniform.`);
}

const warnedTextures = new Set<string>();
function warnUnknownTexture(hash: string | undefined, name: string, declared: readonly string[] | undefined) {
    const key = `${hash ?? ''}:${name}`;
    if (warnedTextures.has(key)) return;
    warnedTextures.add(key);
    const known = declared && declared.length > 0 ? declared.map((n) => `"${n}"`).join(', ') : 'none';
    console.warn(`[onejs-react] ShaderProgram: no texture named "${name}" in this program (declared: ${known}). Check the name in the texture2D declaration.`);
}

/**
 * Whether the element draws a compiled program: OneJS 3.7 and newer say so.
 * Read in a try, since how a missing member reads depends on the interop, and
 * an older OneJS has none.
 */
function acceptsCompiledPrograms(el: any): boolean {
    try { return el.AcceptsCompiledPrograms === true; } catch { return false; }
}

/**
 * A program on a OneJS too old to take one, said once per program.
 *
 * The npm packages and OneJS update separately, so a project can bump the npm
 * side past the Unity side. The alternative to this line is an empty element
 * that points at neither package.
 */
const reportedOldOneJS = new Set<string>();
function reportOldOneJS(hash: string) {
    if (reportedOldOneJS.has(hash)) return;
    reportedOldOneJS.add(hash);
    console.error(`[onejs-react] shader program ${hash} needs OneJS 3.7 or newer. Update OneJS, or keep onejs-react below 0.2 and onejs-unity below 0.6.`);
}

/**
 * Whether the element steps a program: keeps the frame it drew before, counts
 * frames and hands over the step. OneJS says so from the release that added
 * `previous`, `frame` and `deltaTime` to the shader language.
 */
function acceptsSteppedPrograms(el: any): boolean {
    try { return el.AcceptsSteppedPrograms === true; } catch { return false; }
}

/** The OneJS that first steps a program, for the one line an older one gets. */
const STEPPED_ONEJS = '3.9.1';

/** Whether a program reads anything a host keeps between frames. A program built before `reads` existed reads none. */
function readsBetweenFrames(p: any): boolean {
    const r = p.reads;
    return r != null && (r.previous === true || r.frame === true || r.deltaTime === true);
}

/**
 * A program that reads the previous frame, frame or deltaTime on a OneJS that
 * cannot step it, said once per program. Such a OneJS would draw it with a
 * clear previous frame and frame 0 forever: a picture, and the wrong one.
 */
const reportedUnstepped = new Set<string>();
function reportUnstepped(hash: string) {
    if (reportedUnstepped.has(hash)) return;
    reportedUnstepped.add(hash);
    console.error(`[onejs-react] shader program ${hash} reads the previous frame, frame or deltaTime, which needs OneJS ${STEPPED_ONEJS} or newer. Update OneJS.`);
}

const shaderValueEq = (a: any, b: any) => {
    if (a === b) return true;
    // An inline vector (`tint: [1, 0.5, 0, 1]`) is a new array every render
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
};

const shaderShallowEq = (a: any, b: any) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => shaderValueEq(a[k], b[k]));
};

/**
 * Applies ShaderEffect props. Each setter is one interop crossing and the
 * element re-applies them before every blit, so ordering against shader/material
 * creation does not matter. Dictionaries are compared shallowly, which is enough
 * because effect props are flat numbers, strings and short number arrays.
 */
function applyShaderFxProps(el: any, props: any, oldProps?: any) {
    if (props.shader !== undefined && props.shader !== oldProps?.shader) el.SetShader(props.shader);

    // A compiled program, handed over by hash. Compared by
    // hash rather than by identity because a program is usually built inline in
    // a component body, so a fresh object arrives on every render while the
    // program itself has not changed. Comparing identity would rebuild the
    // material, drop the render target and restart the clock sixty times a
    // second.
    // A new program is a new material, and the values set on the old one went
    // with it, so the caller's uniforms and textures go again below even when
    // they did not change (a live .sl swap in the Play editor, the Ghost Hunt
    // dry run of 1 Oct 2026, or a cart picking between two programs).
    const newProgram = props.program !== undefined && props.program?.hash !== oldProps?.program?.hash;
    if (newProgram) {
        const p = props.program;
        // The names go with the program, because the native backend binds its
        // uniforms as per name material properties and only the program knows
        // which name owns which slot.
        //
        // SetProgram keeps the removed VM's three leading arguments, which
        // every OneJS since 3.7 ignores; an empty buffer and two zeros fill
        // them. A buffer an older bundle still carries is never sent.
        let wantsSource: unknown;
        const stepped = acceptsSteppedPrograms(el);
        let bound = acceptsCompiledPrograms(el);
        if (!bound) reportOldOneJS(p.hash);
        else if (!stepped && readsBetweenFrames(p)) {
            reportUnstepped(p.hash);
            bound = false;
        } else {
            // The element reads what the program keeps between frames from the
            // compiled shader itself, so nothing more crosses here.
            wantsSource = el.SetProgram(new Float32Array(0), 0, 0, p.hash, p.uniforms ?? []);
        }
        if (bound) {
            /**
             * The declared defaults, seeded before anything the caller passes.
             *
             * The generated shader carries them in its Properties block, so a
             * compiled material starts at them; the web host's uniform array
             * starts at zero. Without this an unset uniform was its declared
             * default in the editor and zero in the browser, from one program,
             * with nothing to see in either. `props.uniforms` is applied further down and writes over
             * whatever it names.
             */
            const defaults = p.defaults;
            if (defaults) {
                for (let slot = 0; slot * 4 < defaults.length; slot++) {
                    const at = slot * 4;
                    el.SetUniform(slot, defaults[at] ?? 0, defaults[at + 1] ?? 0,
                        defaults[at + 2] ?? 0, defaults[at + 3] ?? 0);
                }
            }
            // True only from an editor that has no compiled shader for this hash.
            // It records the HLSL and generates one, so the next run is native; the
            // getter is lazy, so a game in Play never emits a line of it.
            if (wantsSource === true) {
                const hlsl = p.hlsl;
                if (typeof hlsl === 'string') el.RecordProgram(p.hash, hlsl);
            }
            // A WebGL player compiles the program itself. Asked first, so nowhere
            // else pays for the strings (or, for a compile() result, for printing
            // them).
            // `in`, not a read: on a compile() result these are lazy getters.
            if ('wgsl' in p || 'glsl' in p) {
                if (el.WantsWebSource === true) el.SetProgramWeb(p.wgsl ?? '', p.glsl ?? '');
            }
        }
    }

    if (props.resolution !== undefined || oldProps?.resolution !== undefined) {
        const r = props.resolution;
        const o = oldProps?.resolution;
        if (!r || !o || r[0] !== o[0] || r[1] !== o[1]) {
            // 0,0 tells the element to follow its own layout size.
            el.SetResolution(r ? r[0] : 0, r ? r[1] : 0);
        }
    }

    if (props.floats && !shaderShallowEq(props.floats, oldProps?.floats)) {
        for (const k in props.floats) el.SetFloat(k, props.floats[k]);
    }
    /**
     * A program's uniforms go by SLOT. The element resolves the slot through
     * the names handed over with the program, and the bridge behind it writes
     * to whichever backend is live: a material property on a generated shader,
     * the uniform array in a browser.
     */
    if (props.uniforms && (newProgram || !shaderShallowEq(props.uniforms, oldProps?.uniforms))) {
        const names = props.program?.uniforms;
        for (const k in props.uniforms) {
            const slot = names ? names.indexOf(k) : -1;
            if (slot < 0) {
                warnUnknownUniform(props.program?.hash, k, names);
                continue;
            }
            const v = props.uniforms[k];
            if (typeof v === 'number') el.SetUniform(slot, v, 0, 0, 0);
            else el.SetUniform(slot, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
        }
    }
    if (props.vectors && !shaderShallowEq(props.vectors, oldProps?.vectors)) {
        for (const k in props.vectors) {
            const v = props.vectors[k];
            el.SetVector(k, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
        }
    }
    if (props.vectorArrays) {
        for (const k in props.vectorArrays) {
            const a = props.vectorArrays[k];
            const o = oldProps?.vectorArrays?.[k];
            if (!o || o.length !== a.length || a.some((v: number, i: number) => v !== o[i])) {
                // Float32Array so the bootstrap marshals it as a float array
                el.SetVectorArray(k, Float32Array.from(a));
            }
        }
    }
    if (props.colors && !shaderShallowEq(props.colors, oldProps?.colors)) {
        for (const k in props.colors) {
            const [r, g, b, a] = toRGBA(props.colors[k], `ShaderEffect colors.${k}`);
            el.SetColor(k, r, g, b, a);
        }
    }
    if (props.textures && (newProgram || !shaderShallowEq(props.textures, oldProps?.textures))) {
        /**
         * A program's textures go by SLOT, the way its uniforms do.
         *
         * Both backends declare _Tex0 to _Tex3, so a material property named
         * after what the author wrote ("grain") reached neither: the picture
         * came out as whatever an unbound sampler is, in the browser and after
         * an eject alike, with nothing said about it. The names ride with the
         * program because only the program knows which slot owns which.
         */
        const slots = props.program?.textures;
        for (const k in props.textures) {
            const t = props.textures[k];
            if (slots) {
                const slot = slots.indexOf(k);
                if (slot < 0) {
                    warnUnknownTexture(props.program?.hash, k, slots);
                    continue;
                }
                // A string names a built-in procedural texture; anything else is a CS Texture.
                if (typeof t === 'string') el.SetProgramBuiltinTexture(slot, t);
                else if (t) el.SetProgramTexture(slot, t);
                continue;
            }
            if (typeof t === 'string') el.SetBuiltinTexture(k, t);
            else if (t) el.SetTexture(k, t);
        }
    }
    if (props.ramp !== undefined) {
        const same = oldProps?.ramp && oldProps.ramp.length === props.ramp.length
            && props.ramp.every((c: unknown, i: number) => shaderValueEq(c, oldProps.ramp[i]));
        if (!same) {
            const flat: number[] = [];
            for (const c of props.ramp) flat.push(...toRGBA(c, 'TextureFX ramp'));
            el.SetRamp(props.rampProperty ?? '_Ramp', flat);
        }
    }
    if (props.paused !== undefined && props.paused !== oldProps?.paused) {
        if (props.paused) el.Pause(); else el.Resume();
    }
}
