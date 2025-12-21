import type {HostConfig} from 'react-reconciler';
import type {BaseProps, ViewStyle} from './types';
import {parseStyleValue} from './style-parser';

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
        };
    };
};

declare const __eventAPI: {
    addEventListener: (element: CSObject, eventType: string, callback: Function) => void;
    removeEventListener: (element: CSObject, eventType: string, callback: Function) => void;
    removeAllEventListeners: (element: CSObject) => void;
};

interface CSObject {
    __csHandle: number;
    __csType: string;
    Add: (child: CSObject) => void;
    Insert: (index: number, child: CSObject) => void;
    Remove: (child: CSObject) => void;
    RemoveAt: (index: number) => void;
    IndexOf: (child: CSObject) => number;
    Clear: () => void;
    style: CSStyle;
    text?: string;
    value?: unknown;
    label?: string;
    AddToClassList: (className: string) => void;
    RemoveFromClassList: (className: string) => void;
    ClearClassList: () => void;
}

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

// Instance type used by the reconciler
export interface Instance {
    element: CSObject;
    type: string;
    props: BaseProps;
    eventHandlers: Map<string, Function>;
    appliedStyleKeys: Set<string>; // Track which style properties are currently applied
}

export type TextInstance = Instance; // For Label elements with text content
export type Container = CSObject;
export type ChildSet = never; // Not using persistent mode

// Map React element types to UI Toolkit classes
// Element types use 'ojs-' prefix to avoid conflicts with HTML/SVG in @types/react
const TYPE_MAP: Record<string, () => CSObject> = {
    'ojs-view': () => new CS.UnityEngine.UIElements.VisualElement(),
    'ojs-label': () => new CS.UnityEngine.UIElements.Label(),
    'ojs-button': () => new CS.UnityEngine.UIElements.Button(),
    'ojs-textfield': () => new CS.UnityEngine.UIElements.TextField(),
    'ojs-toggle': () => new CS.UnityEngine.UIElements.Toggle(),
    'ojs-slider': () => new CS.UnityEngine.UIElements.Slider(),
    'ojs-scrollview': () => new CS.UnityEngine.UIElements.ScrollView(),
    'ojs-image': () => new CS.UnityEngine.UIElements.Image(),
    'ojs-listview': () => new CS.UnityEngine.UIElements.ListView(),
};

// Event prop to event type mapping
const EVENT_PROPS: Record<string, string> = {
    onClick: 'click',
    onPointerDown: 'pointerdown',
    onPointerUp: 'pointerup',
    onPointerMove: 'pointermove',
    onPointerEnter: 'pointerenter',
    onPointerLeave: 'pointerleave',
    onFocus: 'focus',
    onBlur: 'blur',
    onKeyDown: 'keydown',
    onKeyUp: 'keyup',
    onChange: 'change',
};

// Shorthand style properties that expand to multiple properties
const STYLE_SHORTHANDS: Record<string, string[]> = {
    padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
    margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
    borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
    borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
    borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
};

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

// Apply style properties to element, returns the set of applied keys
function applyStyle(element: CSObject, style: ViewStyle | undefined): Set<string> {
    const appliedKeys = new Set<string>();
    if (!style) return appliedKeys;

    const s = element.style;
    for (const [key, value] of Object.entries(style)) {
        if (value === undefined) continue;

        // Handle shorthand properties
        const expanded = STYLE_SHORTHANDS[key];
        if (expanded) {
            // Parse the value once, apply to all expanded properties
            const parsed = parseStyleValue(expanded[0], value);
            for (const prop of expanded) {
                s[prop] = parsed;
                appliedKeys.add(prop);
            }
        } else {
            // Parse and apply individual property
            s[key] = parseStyleValue(key, value);
            appliedKeys.add(key);
        }
    }
    return appliedKeys;
}

// Clear style properties that are no longer in the new style
function clearRemovedStyles(element: CSObject, oldKeys: Set<string>, newKeys: Set<string>) {
    const s = element.style;
    for (const key of oldKeys) {
        if (!newKeys.has(key)) {
            // Setting to undefined clears the inline style, falling back to USS
            s[key] = undefined;
        }
    }
}

// Parse className string into a Set of class names
function parseClassNames(className: string | undefined): Set<string> {
    if (!className) return new Set();
    return new Set(className.split(/\s+/).filter(Boolean));
}

// Apply className(s) to element
function applyClassName(element: CSObject, className: string | undefined) {
    if (!className) return;

    const classes = className.split(/\s+/).filter(Boolean);
    for (const cls of classes) {
        element.AddToClassList(cls);
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

// Apply component-specific props
function applyComponentProps(element: CSObject, type: string, props: Record<string, unknown>) {
    // For Label, Button - set text property directly
    if (props.text !== undefined) {
        (element as { text: string }).text = props.text as string;
    }
    // For TextField, Toggle, Slider - set value property
    if (props.value !== undefined) {
        (element as { value: unknown }).value = props.value;
    }
    // For input elements that have a label
    if (props.label !== undefined) {
        (element as { label: string }).label = props.label as string;
    }

    // ScrollView-specific properties
    if (type === 'ojs-scrollview') {
        const sv = element as CSScrollView;
        if (props.mode !== undefined) {
            sv.mode = CS.UnityEngine.UIElements.ScrollViewMode[props.mode as string];
        }
        if (props.horizontalScrollerVisibility !== undefined) {
            sv.horizontalScrollerVisibility = CS.UnityEngine.UIElements.ScrollerVisibility[props.horizontalScrollerVisibility as string];
        }
        if (props.verticalScrollerVisibility !== undefined) {
            sv.verticalScrollerVisibility = CS.UnityEngine.UIElements.ScrollerVisibility[props.verticalScrollerVisibility as string];
        }
        if (props.elasticity !== undefined) {
            sv.elasticity = props.elasticity as number;
        }
        if (props.elasticAnimationIntervalMs !== undefined) {
            sv.elasticAnimationIntervalMs = props.elasticAnimationIntervalMs as number;
        }
        if (props.scrollDecelerationRate !== undefined) {
            sv.scrollDecelerationRate = props.scrollDecelerationRate as number;
        }
        if (props.mouseWheelScrollSize !== undefined) {
            sv.mouseWheelScrollSize = props.mouseWheelScrollSize as number;
        }
        if (props.horizontalPageSize !== undefined) {
            sv.horizontalPageSize = props.horizontalPageSize as number;
        }
        if (props.verticalPageSize !== undefined) {
            sv.verticalPageSize = props.verticalPageSize as number;
        }
        if (props.touchScrollBehavior !== undefined) {
            sv.touchScrollBehavior = CS.UnityEngine.UIElements.TouchScrollBehavior[props.touchScrollBehavior as string];
        }
        if (props.nestedInteractionKind !== undefined) {
            sv.nestedInteractionKind = CS.UnityEngine.UIElements.NestedInteractionKind[props.nestedInteractionKind as string];
        }
    }

    // ListView-specific properties
    if (type === 'ojs-listview') {
        const lv = element as CSListView;

        // Data binding - these are the core callbacks
        if (props.itemsSource !== undefined) {
            lv.itemsSource = props.itemsSource as unknown[];
        }
        if (props.makeItem !== undefined) {
            lv.makeItem = props.makeItem as () => CSObject;
        }
        if (props.bindItem !== undefined) {
            lv.bindItem = props.bindItem as (element: CSObject, index: number) => void;
        }
        if (props.unbindItem !== undefined) {
            lv.unbindItem = props.unbindItem as (element: CSObject, index: number) => void;
        }
        if (props.destroyItem !== undefined) {
            lv.destroyItem = props.destroyItem as (element: CSObject) => void;
        }

        // Virtualization
        if (props.fixedItemHeight !== undefined) {
            lv.fixedItemHeight = props.fixedItemHeight as number;
        }
        if (props.virtualizationMethod !== undefined) {
            lv.virtualizationMethod = CS.UnityEngine.UIElements.CollectionVirtualizationMethod[props.virtualizationMethod as string];
        }

        // Selection
        if (props.selectionType !== undefined) {
            lv.selectionType = CS.UnityEngine.UIElements.SelectionType[props.selectionType as string];
        }
        if (props.selectedIndex !== undefined) {
            lv.selectedIndex = props.selectedIndex as number;
        }
        if (props.selectedIndices !== undefined) {
            lv.selectedIndices = props.selectedIndices as number[];
        }

        // Reordering
        if (props.reorderable !== undefined) {
            lv.reorderable = props.reorderable as boolean;
        }
        if (props.reorderMode !== undefined) {
            lv.reorderMode = CS.UnityEngine.UIElements.ListViewReorderMode[props.reorderMode as string];
        }

        // Header/Footer
        if (props.showFoldoutHeader !== undefined) {
            lv.showFoldoutHeader = props.showFoldoutHeader as boolean;
        }
        if (props.headerTitle !== undefined) {
            lv.headerTitle = props.headerTitle as string;
        }
        if (props.showAddRemoveFooter !== undefined) {
            lv.showAddRemoveFooter = props.showAddRemoveFooter as boolean;
        }

        // Appearance
        if (props.showBorder !== undefined) {
            lv.showBorder = props.showBorder as boolean;
        }
        if (props.showAlternatingRowBackgrounds !== undefined) {
            lv.showAlternatingRowBackgrounds = CS.UnityEngine.UIElements.AlternatingRowBackground[props.showAlternatingRowBackgrounds as string];
        }
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
    applyComponentProps(element, type, props as Record<string, unknown>);

    return instance;
}

// Update an instance with new props
function updateInstance(instance: Instance, oldProps: BaseProps, newProps: BaseProps) {
    const element = instance.element;

    // Update style - clear removed properties, then apply new ones
    if (oldProps.style !== newProps.style) {
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

    // Update component-specific props
    applyComponentProps(element, instance.type, newProps as Record<string, unknown>);

    instance.props = newProps;
}

// The host config for react-reconciler
export const hostConfig: HostConfig<
    string,           // Type
    BaseProps,        // Props
    Container,        // Container
    Instance,         // Instance
    TextInstance,     // TextInstance
    never,            // SuspenseInstance
    never,            // HydratableInstance
    Instance,         // PublicInstance
    {},               // HostContext
    true,             // UpdatePayload (true = needs update)
    ChildSet,         // ChildSet
    number,           // TimeoutHandle
    number            // NoTimeout
> = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,

    isPrimaryRenderer: true,
    noTimeout: -1,

    createInstance(type, props) {
        return createInstance(type, props);
    },

    createTextInstance(text) {
        // Create a Label for text content
        const element = new CS.UnityEngine.UIElements.Label();
        element.text = text;
        return {
            element,
            type: 'text',
            props: {},
            eventHandlers: new Map(),
            appliedStyleKeys: new Set(),
        };
    },

    appendInitialChild(parentInstance, child) {
        parentInstance.element.Add(child.element);
    },

    appendChild(parentInstance, child) {
        parentInstance.element.Add(child.element);
    },

    appendChildToContainer(container, child) {
        container.Add(child.element);
    },

    insertBefore(parentInstance, child, beforeChild) {
        const index = parentInstance.element.IndexOf(beforeChild.element);
        if (index >= 0) {
            parentInstance.element.Insert(index, child.element);
        } else {
            parentInstance.element.Add(child.element);
        }
    },

    insertInContainerBefore(container, child, beforeChild) {
        const index = container.IndexOf(beforeChild.element);
        if (index >= 0) {
            container.Insert(index, child.element);
        } else {
            container.Add(child.element);
        }
    },

    removeChild(parentInstance, child) {
        __eventAPI.removeAllEventListeners(child.element);
        parentInstance.element.Remove(child.element);
    },

    removeChildFromContainer(container, child) {
        __eventAPI.removeAllEventListeners(child.element);
        container.Remove(child.element);
    },

    prepareUpdate(_instance, _type, oldProps, newProps) {
        // Return true if we need to update, null if no update needed
        return oldProps !== newProps ? true : null;
    },

    // React 19 changed the signature: (instance, type, oldProps, newProps, fiber)
    // The updatePayload parameter was removed!
    commitUpdate(instance, _type, oldProps, newProps, _fiber) {
        updateInstance(instance, oldProps, newProps);
    },

    commitTextUpdate(textInstance, _oldText, newText) {
        textInstance.element.text = newText;
    },

    finalizeInitialChildren() {
        return false;
    },

    getPublicInstance(instance) {
        return instance;
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

    getChildHostContext(parentHostContext) {
        return parentHostContext;
    },

    shouldSetTextContent() {
        return false;
    },

    clearContainer(container) {
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
        instance.element.style.display = 'none';
    },
    hideTextInstance(textInstance: TextInstance) {
        textInstance.element.style.display = 'none';
    },
    unhideInstance(instance: Instance, _props: BaseProps) {
        instance.element.style.display = '';
    },
    unhideTextInstance(textInstance: TextInstance, _text: string) {
        textInstance.element.style.display = '';
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
};
