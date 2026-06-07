import type {HostConfig} from 'react-reconciler';
import type {BaseProps, ViewStyle, VisualElement, GenerateVisualContentCallback} from './types';
import {parseStyleValue, parseColor} from './style-parser';

// CSObject is an alias for VisualElement - they represent the same C# objects
type CSObject = VisualElement & { pickingMode?: number };

// Global declarations for QuickJS environment
declare function setTimeout(callback: () => void, ms?: number): number;

declare function clearTimeout(id: number): void;

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };


// Priority constants from react-reconciler/constants
// These match React's internal lane priorities
const DiscreteEventPriority = 2;
const ContinuousEventPriority = 8;
const DefaultEventPriority = 32;
const IdleEventPriority = 536870912;

// Current update priority - used by React's scheduler
let currentUpdatePriority = DefaultEventPriority;

// Microtask scheduling
declare function queueMicrotask(callback: () => void): void;

// Unity enum types (accessed as CS.UnityEngine.UIElements.EnumName.Value)
interface CSEnum {
    [key: string]: number;
}

// CS interop - these are provided by QuickJSBootstrap.js
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
        StyleBridge: {
            ApplyStyles: (element: CSObject, styles: Record<string, unknown>) => void;
            AddClassesBatch: (element: CSObject, classes: string[]) => void;
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

interface CSStyle {
    [key: string]: unknown;
}

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

// Elements that merge text children into their text property instead of adding as visual children
// This enables <Label>Hello {"World"}</Label> to render as single line, matching React Native behavior
const TEXT_MERGE_TYPES = new Set(['ojs-label', 'ojs-text', 'ojs-button']);

// Instance type used by the reconciler
export interface Instance {
    element: CSObject;
    type: string;
    props: BaseProps;
    eventHandlers: Map<string, Function>;
    appliedStyleKeys: Set<string>; // Track which style properties are currently applied
    // For text-merging parents: ordered list of merged text children
    mergedTextChildren?: Instance[];
    // For merged text children: reference to parent they're merged into
    mergedInto?: Instance;
    // Set to true when a non-text child is added, disabling further text merging
    hasMixedContent?: boolean;
    // For vector drawing: track the current generateVisualContent callback
    visualContentCallback?: GenerateVisualContentCallback;
}

export type TextInstance = Instance; // For Label elements with text content
export type Container = CSObject;
export type ChildSet = never; // Not using persistent mode

// Map React element types to UI Toolkit classes
// Element types use 'ojs-' prefix to avoid conflicts with HTML/SVG in @types/react
const TYPE_MAP: Record<string, () => CSObject> = {
    'ojs-view': () => new CS.UnityEngine.UIElements.VisualElement(),
    'ojs-text': () => new CS.UnityEngine.UIElements.TextElement(),
    'ojs-label': () => new CS.UnityEngine.UIElements.Label(),
    'ojs-button': () => new CS.UnityEngine.UIElements.Button(),
    'ojs-textfield': () => new CS.UnityEngine.UIElements.TextField(),
    'ojs-toggle': () => new CS.UnityEngine.UIElements.Toggle(),
    'ojs-slider': () => new CS.UnityEngine.UIElements.Slider(),
    'ojs-scrollview': () => new CS.UnityEngine.UIElements.ScrollView(),
    'ojs-image': () => new CS.UnityEngine.UIElements.Image(),
    'ojs-listview': () => new CS.UnityEngine.UIElements.ListView(),
    'ojs-frostedglass': () => new CS.OneJS.GPU.FrostedGlassElement(),
};

// Built-in types with specific prop handling in applyComponentProps
const BUILT_IN_TYPES = new Set(Object.keys(TYPE_MAP));

/**
 * Register a custom VisualElement type for use in React JSX.
 *
 * @param name - Element name (with or without 'ojs-' prefix)
 * @param constructor - C# constructor reference (e.g., CS.MyNamespace.MyWidget)
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
    onPointerStationary: 'pointerstationary',

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

// Character escape mapping for Tailwind/USS compatibility
// USS class names only support [\w-] so special characters must be escaped
const CLASS_ESCAPE_MAP: [string, string][] = [
    [':', '_c_'],   // Pseudo-classes and breakpoints (hover:, sm:)
    ['/', '_s_'],   // Fractions (w-1/2)
    ['.', '_d_'],   // Decimals (p-2.5)
    ['[', '_lb_'],  // Arbitrary values ([100px])
    [']', '_rb_'],
    ['(', '_lp_'],  // Functions (calc())
    [')', '_rp_'],
    ['#', '_n_'],   // Hex colors
    ['%', '_p_'],   // Percentages
    [',', '_cm_'],  // Multiple values
    ['&', '_amp_'],
    ['>', '_gt_'],
    ['<', '_lt_'],
    ['*', '_ast_'],
    ["'", '_sq_'],
];

/**
 * Escape special characters in a class name for USS compatibility.
 * Tailwind class names like "hover:bg-red-500" become "hover_c_bg-red-500"
 * Results are cached since the same class names are used repeatedly across renders.
 */
const _escapeCache = new Map<string, string>();
function escapeClassName(name: string): string {
    const cached = _escapeCache.get(name);
    if (cached !== undefined) return cached;
    let escaped = name;
    for (const [char, replacement] of CLASS_ESCAPE_MAP) {
        if (escaped.includes(char)) {
            escaped = escaped.split(char).join(replacement);
        }
    }
    _escapeCache.set(name, escaped);
    return escaped;
}

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

// Get all expanded property keys for a style object
function getExpandedStyleKeys(style: ViewStyle | undefined): Set<string> {
    const keys = new Set<string>();
    if (!style) return keys;

    for (const [key, value] of Object.entries(style)) {
        if (value === undefined) continue;

        const expanded = STYLE_SHORTHANDS[key];
        if (expanded) {
            for (const prop of expanded) {
                keys.add(prop);
            }
        } else {
            keys.add(key);
        }
    }
    return keys;
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

// Apply style properties to element, returns the set of applied keys.
//
// Batched path: parsed style values are collected into a single dict and sent
// to CS.OneJS.StyleBridge.ApplyStyles in one __cs.invoke crossing instead of
// one per property. On WebGL each crossing is ~3ms (JSON marshal + reflection),
// so the difference is ~N invokes vs 1 invoke per element. backgroundImage
// stays on its individual GPU-bridge path since it's not a plain IStyle setter.
function applyStyle(element: CSObject, style: ViewStyle | undefined): Set<string> {
    const appliedKeys = new Set<string>();
    if (!style) return appliedKeys;

    const batched: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(style)) {
        if (value === undefined) continue;

        const expanded = STYLE_SHORTHANDS[key];
        if (expanded) {
            const parsed = resolveForBatch(parseStyleValue(expanded[0], value));
            for (const prop of expanded) {
                batched[prop] = parsed;
                appliedKeys.add(prop);
            }
        } else if (key === "backgroundImage") {
            if (value == null) {
                CS.OneJS.GPU.GPUBridge.ClearElementBackgroundImage(element);
            } else if (isRenderTextureHandle(value)) {
                const handle = getRenderTextureHandle(value);
                if (handle >= 0) {
                    CS.OneJS.GPU.GPUBridge.SetElementBackgroundImage(element, handle);
                }
            } else if (typeof value === "object" && "__csHandle" in value) {
                CS.OneJS.GPU.GPUBridge.SetElementBackgroundFromObject(element, value);
            }
            appliedKeys.add(key);
        } else {
            batched[key] = resolveForBatch(parseStyleValue(key, value));
            appliedKeys.add(key);
        }
    }

    if (Object.keys(batched).length > 0) {
        CS.OneJS.StyleBridge.ApplyStyles(element, batched);
    }

    return appliedKeys;
}

// Force-resolve CS path proxies (e.g. CS.UnityEngine.UIElements.Justify.Center)
// to their underlying int value. parseEnumValue and parseLength's StyleKeyword
// cases return path proxies whose .valueOf() reads the int via GetField. The
// non-batched __cs.invoke path resolved these implicitly via __resolveValue;
// the batched path JSON.stringifies the whole dict, so path proxies serialize
// via toJSON to {__csTypeRef:...} which C# can't interpret as an enum value.
// CS object proxies (with __csHandle) keep their toJSON shape — only path
// proxies need coercion.
function resolveForBatch(value: unknown): unknown {
    // Path proxies (e.g. CS.UnityEngine.UIElements.Justify.Center) have a
    // function as their underlying Proxy target so they can also be invoked
    // as constructors — so typeof is "function", not "object". Just check the
    // __csPathProxy sentinel and rely on truthy/property semantics.
    if (value && (value as any).__csPathProxy) {
        return Number(value)
    }
    return value
}

// Clear style properties that are no longer in the new style
function clearRemovedStyles(element: CSObject, oldKeys: Set<string>, newKeys: Set<string>) {
    const s = element.style;
    for (const key of oldKeys) {
        if (!newKeys.has(key)) {
            if (key === "backgroundImage") {
                // Special handling for backgroundImage - use GPUBridge to clear
                CS.OneJS.GPU.GPUBridge.ClearElementBackgroundImage(element);
            } else {
                // Setting to undefined clears the inline style, falling back to USS
                s[key] = undefined;
            }
        }
    }
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

// Update className selectively - only add/remove what changed
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


// Apply event handlers
function applyEvents(instance: Instance, props: BaseProps) {
    for (const [propName, eventType] of Object.entries(EVENT_PROPS)) {
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
    }
}

// MARK: Text Merging
// Rebuild concatenated text from merged text children
function rebuildMergedText(instance: Instance) {
    const children = instance.mergedTextChildren;
    if (!children || children.length === 0) {
        // No merged children - clear text (or keep prop-based text?)
        // For now, set to empty - if user wants text, they should use children
        instance.element.text = '';
        return;
    }
    instance.element.text = children.map(c => c.element.text || '').join('');
}

// Check if a child should be merged into parent's text property
function shouldMergeText(parentInstance: Instance, child: Instance): boolean {
    // Don't merge if parent has mixed content (non-text children were added)
    if (parentInstance.hasMixedContent) return false;
    return TEXT_MERGE_TYPES.has(parentInstance.type) && child.type === 'text';
}

// "Unmerge" all text children - add them as actual visual children
// Called when a non-text child is added, breaking the pure-text assumption
function unmergTextChildren(parentInstance: Instance) {
    const children = parentInstance.mergedTextChildren;
    if (!children || children.length === 0) return;

    // Clear parent's merged text
    parentInstance.element.text = '';

    // Add each merged text child as an actual visual child
    for (const child of children) {
        child.mergedInto = undefined;
        parentInstance.element.Add(child.element);
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
        parentEl.Add(childEl);
        return;
    }
    const childIndex = parentEl.IndexOf(childEl);
    const target = childIndex >= 0 && childIndex < beforeIndex ? beforeIndex - 1 : beforeIndex;
    parentEl.Insert(target, childEl);
}

// MARK: Component-specific prop handlers

// Apply common props (text, value, label) - skip unchanged values
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

// Apply TextField-specific properties - skip unchanged values
function applyTextFieldProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
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

// Apply Slider-specific properties - skip unchanged values
function applySliderProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    if (props.lowValue !== undefined && props.lowValue !== oldProps?.lowValue) el.lowValue = props.lowValue;
    if (props.highValue !== undefined && props.highValue !== oldProps?.highValue) el.highValue = props.highValue;
    if (props.showInputField !== undefined && props.showInputField !== oldProps?.showInputField) el.showInputField = props.showInputField;
    if (props.inverted !== undefined && props.inverted !== oldProps?.inverted) el.inverted = props.inverted;
    if (props.pageSize !== undefined && props.pageSize !== oldProps?.pageSize) el.pageSize = props.pageSize;
    if (props.fill !== undefined && props.fill !== oldProps?.fill) el.fill = props.fill;
    if (props.direction !== undefined && props.direction !== oldProps?.direction) {
        el.direction = CS.UnityEngine.UIElements.SliderDirection[props.direction as string];
    }
}

// Apply Toggle-specific properties - skip unchanged values
function applyToggleProps(element: CSObject, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const el = element as any;
    if (props.text !== undefined && props.text !== oldProps?.text) el.text = props.text;
    if (props.toggleOnLabelClick !== undefined && props.toggleOnLabelClick !== oldProps?.toggleOnLabelClick) el.toggleOnLabelClick = props.toggleOnLabelClick;
}

// Apply Image-specific properties - skip unchanged values
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

// Apply ScrollView-specific properties - skip unchanged values
function applyScrollViewProps(element: CSScrollView, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const UIE = CS.UnityEngine.UIElements;
    setEnumProp(element, 'mode', props, 'mode', UIE.ScrollViewMode, oldProps);
    setEnumProp(element, 'horizontalScrollerVisibility', props, 'horizontalScrollerVisibility', UIE.ScrollerVisibility, oldProps);
    setEnumProp(element, 'verticalScrollerVisibility', props, 'verticalScrollerVisibility', UIE.ScrollerVisibility, oldProps);
    setEnumProp(element, 'touchScrollBehavior', props, 'touchScrollBehavior', UIE.TouchScrollBehavior, oldProps);
    setEnumProp(element, 'nestedInteractionKind', props, 'nestedInteractionKind', UIE.NestedInteractionKind, oldProps);
    setValueProp(element, 'elasticity', props, 'elasticity', oldProps);
    setValueProp(element, 'elasticAnimationIntervalMs', props, 'elasticAnimationIntervalMs', oldProps);
    setValueProp(element, 'scrollDecelerationRate', props, 'scrollDecelerationRate', oldProps);
    setValueProp(element, 'mouseWheelScrollSize', props, 'mouseWheelScrollSize', oldProps);
    setValueProp(element, 'horizontalPageSize', props, 'horizontalPageSize', oldProps);
    setValueProp(element, 'verticalPageSize', props, 'verticalPageSize', oldProps);
}

// Apply ListView-specific properties - skip unchanged values
function applyListViewProps(element: CSListView, props: Record<string, unknown>, oldProps?: Record<string, unknown>) {
    const UIE = CS.UnityEngine.UIElements;

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

// Props handled by the reconciler infrastructure - not forwarded to C# elements
const RESERVED_PROPS = new Set([
    'children', 'key', 'ref', 'style', 'className', 'pickingMode', 'focusable', 'disabled',
    'onGenerateVisualContent',
    ...Object.keys(EVENT_PROPS),
]);

// Forward non-reserved props directly to C# element (for custom elements) - skip unchanged
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
    } else if (type === 'ojs-frostedglass') {
        const el = element as any;
        if (props.blurRadius !== undefined && props.blurRadius !== oldProps?.blurRadius) el.BlurRadius = props.blurRadius;
        if (props.tintColor !== undefined && props.tintColor !== oldProps?.tintColor) el.TintColor = props.tintColor;
    }
}

// Create an instance
function createInstance(type: string, props: BaseProps): Instance {
    const factory = TYPE_MAP[type];
    if (!factory) {
        throw new Error(`Unknown element type: ${type}`);
    }

    const element = factory();
    const appliedStyleKeys = applyStyle(element, props.style);
    const instance: Instance = {
        element,
        type,
        props,
        eventHandlers: new Map(),
        appliedStyleKeys,
    };

    applyClassName(element, props.className);
    applyEvents(instance, props);
    applyVisualContentCallback(instance, props);
    applyComponentProps(element, type, props as Record<string, unknown>);

    // Apply pickingMode
    if (props.pickingMode !== undefined) {
        element.pickingMode = CS.UnityEngine.UIElements.PickingMode[props.pickingMode];
    }

    // Apply focusable
    if (props.focusable !== undefined) {
        element.focusable = props.focusable;
    }

    // Apply disabled (inverted — SetEnabled(true) means "not disabled")
    if (props.disabled !== undefined) {
        element.SetEnabled(!props.disabled);
    }

    return instance;
}

// Update an instance with new props
function updateInstance(instance: Instance, oldProps: BaseProps, newProps: BaseProps) {
    const element = instance.element;

    // Update style - skip if values are shallowly equal (inline style objects are
    // new references each render but usually contain the same values)
    if (oldProps.style !== newProps.style && !shallowEqual(oldProps.style as any, newProps.style as any)) {
        const newStyleKeys = getExpandedStyleKeys(newProps.style);
        clearRemovedStyles(element, instance.appliedStyleKeys, newStyleKeys);
        instance.appliedStyleKeys = applyStyle(element, newProps.style);
    }

    // Update className - selectively add/remove classes
    if (oldProps.className !== newProps.className) {
        updateClassNames(element, oldProps.className, newProps.className);
    }

    // Update events
    applyEvents(instance, newProps);

    // Update vector drawing callback
    applyVisualContentCallback(instance, newProps);

    // Update component-specific props - pass oldProps to skip unchanged values
    applyComponentProps(element, instance.type, newProps as Record<string, unknown>, oldProps as Record<string, unknown>);

    // Update pickingMode
    if (oldProps.pickingMode !== newProps.pickingMode) {
        if (newProps.pickingMode !== undefined) {
            element.pickingMode = CS.UnityEngine.UIElements.PickingMode[newProps.pickingMode];
        } else {
            // Reset to default (Position)
            element.pickingMode = CS.UnityEngine.UIElements.PickingMode.Position;
        }
    }

    // Update focusable - only set if explicitly provided, do not override
    // element-specific defaults (Button is focusable by default, View is not)
    // when the prop is removed.
    if (oldProps.focusable !== newProps.focusable && newProps.focusable !== undefined) {
        element.focusable = newProps.focusable;
    }

    // Update disabled - unlike focusable, every VisualElement starts enabled
    // by default, so removing the prop after a previous `disabled={true}` is
    // expected to restore the enabled state.
    if (oldProps.disabled !== newProps.disabled) {
        if (newProps.disabled !== undefined) {
            element.SetEnabled(!newProps.disabled);
        } else {
            element.SetEnabled(true);
        }
    }

    instance.props = newProps;
}

// NOTE: We use a type assertion because @types/react-reconciler (0.28.x) is outdated
// and doesn't match react-reconciler 0.31.x (React 19). The HostConfig interface
// has changed significantly - notably commitUpdate no longer receives updatePayload.
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
            type: 'text',
            props: {},
            eventHandlers: new Map(),
            appliedStyleKeys: new Set(),
        };
    },

    appendInitialChild(parentInstance: Instance, child: Instance) {
        if (shouldMergeText(parentInstance, child)) {
            appendMergedTextChild(parentInstance, child);
        } else {
            handleNonTextChild(parentInstance);
            parentInstance.element.Add(child.element);
        }
        trackParent(child.element, parentInstance.element);
    },

    appendChild(parentInstance: Instance, child: Instance) {
        if (shouldMergeText(parentInstance, child)) {
            appendMergedTextChild(parentInstance, child);
        } else {
            handleNonTextChild(parentInstance);
            parentInstance.element.Add(child.element);
        }
        trackParent(child.element, parentInstance.element);
    },

    appendChildToContainer(container: Container, child: Instance) {
        container.Add(child.element);
        // Container is the root - no parent to track
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
        // Container is the root - no parent to track
    },

    removeChild(parentInstance: Instance, child: Instance) {
        if (child.mergedInto === parentInstance) {
            removeMergedTextChild(parentInstance, child);
        } else {
            __eventAPI.removeAllEventListeners(child.element);
            parentInstance.element.Remove(child.element);
        }
        untrackParent(child.element);
    },

    removeChildFromContainer(container: Container, child: Instance) {
        __eventAPI.removeAllEventListeners(child.element);
        container.Remove(child.element);
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
        textInstance.element.text = newText;
        // If this text is merged into a parent, rebuild the parent's concatenated text
        if (textInstance.mergedInto) {
            rebuildMergedText(textInstance.mergedInto);
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
        container.Clear();
    },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,

    // Priority management - required by React 19's reconciler
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
    unhideInstance(instance: Instance, _props: BaseProps) {
        instance.element.style.display = CS.UnityEngine.UIElements.DisplayStyle.Flex;
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
