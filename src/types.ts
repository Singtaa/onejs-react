import type { ReactNode } from 'react';

/**
 * Length value - can be a number (pixels) or string with unit
 * @example
 * 100        // 100px
 * "100px"    // 100px
 * "50%"      // 50 percent
 * "auto"     // auto keyword
 */
export type StyleLength = number | string;

/**
 * Color value - supports multiple formats
 * @example
 * "#fff"              // Short hex
 * "#ffffff"           // Full hex
 * "#ffffff80"         // Hex with alpha
 * "rgb(255, 0, 0)"    // RGB
 * "rgba(255, 0, 0, 0.5)" // RGBA
 * "red"               // Named color
 */
export type StyleColor = string;

/**
 * Style properties for UI elements (subset of UI Toolkit USS properties)
 *
 * Length values accept:
 * - Numbers: treated as pixels (e.g., `100` = 100px)
 * - Strings: "100px", "50%", "auto"
 *
 * Color values accept:
 * - Hex: "#fff", "#ffffff", "#ffffffff" (with alpha)
 * - RGB: "rgb(255, 0, 0)", "rgba(255, 0, 0, 0.5)"
 * - Named: "red", "blue", "transparent", etc.
 */
export interface ViewStyle {
  // Layout - dimensions
  /** Width in pixels or percentage. Examples: 100, "100px", "50%", "auto" */
  width?: StyleLength;
  /** Height in pixels or percentage. Examples: 100, "100px", "50%", "auto" */
  height?: StyleLength;
  minWidth?: StyleLength;
  minHeight?: StyleLength;
  maxWidth?: StyleLength;
  maxHeight?: StyleLength;

  // Flexbox
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: StyleLength;
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';

  // Positioning
  position?: 'relative' | 'absolute';
  top?: StyleLength;
  right?: StyleLength;
  bottom?: StyleLength;
  left?: StyleLength;

  // Margin & Padding (shorthand applies to all sides)
  /** Margin for all sides. Examples: 16, "16px", "5%" */
  margin?: StyleLength;
  marginTop?: StyleLength;
  marginRight?: StyleLength;
  marginBottom?: StyleLength;
  marginLeft?: StyleLength;

  /** Padding for all sides. Examples: 16, "16px", "5%" */
  padding?: StyleLength;
  paddingTop?: StyleLength;
  paddingRight?: StyleLength;
  paddingBottom?: StyleLength;
  paddingLeft?: StyleLength;

  // Background
  /** Background color. Examples: "#3498db", "rgba(0,0,0,0.5)", "red" */
  backgroundColor?: StyleColor;
  /**
   * Background image - accepts Texture2D, Sprite, VectorImage, RenderTexture,
   * or a GPU compute RenderTexture handle.
   *
   * @example
   * // Texture2D
   * const tex = loadImage("images/card-bg.png")
   * <View style={{ backgroundImage: tex }} />
   *
   * // Sprite from C#
   * const sprite = getSpriteFromCSharp()
   * <View style={{ backgroundImage: sprite }} />
   *
   * // GPU compute RenderTexture
   * const rt = compute.renderTexture({ width: 100, height: 100 })
   * <View style={{ backgroundImage: rt }} />
   */
  backgroundImage?: object | null;

  // Border
  /** Border color for all sides. Examples: "#ccc", "rgba(0,0,0,0.1)" */
  borderColor?: StyleColor;
  borderTopColor?: StyleColor;
  borderRightColor?: StyleColor;
  borderBottomColor?: StyleColor;
  borderLeftColor?: StyleColor;

  /** Border width for all sides (StyleFloat). Examples: 1, 2 */
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;

  /** Border radius for all corners. Examples: 8, "8px", "50%" */
  borderRadius?: StyleLength;
  borderTopLeftRadius?: StyleLength;
  borderTopRightRadius?: StyleLength;
  borderBottomLeftRadius?: StyleLength;
  borderBottomRightRadius?: StyleLength;

  // Display
  opacity?: number;
  overflow?: 'visible' | 'hidden';
  display?: 'flex' | 'none';
  visibility?: 'visible' | 'hidden';

  // Text
  /** Text color. Examples: "#333", "white" */
  color?: StyleColor;
  /** Font size in pixels. Examples: 16, "16px" */
  fontSize?: StyleLength;
  /** Text alignment. Note: Use USS class or stylesheet for -unity-font-style (italic/bold) */
  unityTextAlign?: 'upper-left' | 'upper-center' | 'upper-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'lower-left' | 'lower-center' | 'lower-right';
  whiteSpace?: 'normal' | 'nowrap';

  // Typography
  /** C# Font object */
  unityFont?: any;
  /** C# FontDefinition object */
  unityFontDefinition?: any;
  /** Font style and weight */
  unityFontStyleAndWeight?: 'normal' | 'bold' | 'italic' | 'bold-and-italic';
  /** Spacing between characters */
  letterSpacing?: StyleLength;
  /** Spacing between words */
  wordSpacing?: StyleLength;
  /** Spacing between paragraphs */
  unityParagraphSpacing?: StyleLength;
  /** Text outline color */
  unityTextOutlineColor?: StyleColor;
  /** Text outline width (StyleFloat) */
  unityTextOutlineWidth?: number;
  /** How overflowing text is handled */
  textOverflow?: 'clip' | 'ellipsis';
  /** Position of text overflow indicator */
  unityTextOverflowPosition?: 'end' | 'start' | 'middle';

  // Background (additional)
  /** Tint color applied to the background image */
  unityBackgroundImageTintColor?: StyleColor;

  /**
   * Override the shader / material used to render the element. Accepts a
   * Unity `Material` (typical) or a `MaterialDefinition`; `null` clears the
   * inline override so the element falls back to the panel default.
   *
   * Typed loosely as `object | null` because the React layer has no reason
   * to pin the caller to a specific C# shape — the style parser constructs
   * a `StyleMaterialDefinition` at assignment time.
   */
  unityMaterial?: object | null;

  // Slicing
  /** 9-slice top inset */
  unitySliceTop?: number;
  /** 9-slice right inset */
  unitySliceRight?: number;
  /** 9-slice bottom inset */
  unitySliceBottom?: number;
  /** 9-slice left inset */
  unitySliceLeft?: number;
  /** Scale applied to 9-slice borders */
  unitySliceScale?: number;

  // Transform
  /**
   * Rotation transform.
   * - number: degrees (e.g., 45)
   * - string: with unit (e.g., "0.5turn", "1.57rad", "45deg", "50grad")
   * - C# Rotate struct: pass-through (auto-wrapped in StyleRotate)
   */
  rotate?: any;
  /**
   * Scale transform.
   * - number: uniform scale (e.g., 1.5)
   * - [x, y]: non-uniform scale (e.g., [1.5, 2])
   * - C# Scale struct: pass-through (auto-wrapped in StyleScale)
   */
  scale?: any;
  /**
   * Translation transform.
   * - [x, y]: numbers are px, strings parsed (e.g., [10, 20] or ["50%", 10])
   * - C# Translate struct: pass-through (auto-wrapped in StyleTranslate)
   */
  translate?: any;
  /**
   * Transform origin point.
   * - [x, y]: numbers are px, strings parsed (e.g., ["50%", "50%"])
   * - C# TransformOrigin struct: pass-through (auto-wrapped in StyleTransformOrigin)
   */
  transformOrigin?: any;

  // Transition
  /** Delay before transitions start. Pass a C# StyleList. */
  transitionDelay?: any;
  /** Duration of transitions. Pass a C# StyleList. */
  transitionDuration?: any;
  /** Properties to transition. Pass a C# StyleList. */
  transitionProperty?: any;
  /** Timing functions for transitions. Pass a C# StyleList. */
  transitionTimingFunction?: any;

  // Other
  /** Overflow clipping box */
  unityOverflowClipBox?: 'padding-box' | 'content-box';
  /** Cursor style. Pass a C# Cursor struct. */
  cursor?: any;
}

// Event types
export interface PointerEventData {
  type: string;
  x: number;
  y: number;
  button: number;
  pointerId: number;
  modifiers?: number;
}

export interface MouseEventData {
  type: string;
  x: number;
  y: number;
  button: number;
  modifiers?: number;
}

export interface WheelEventData {
  type: string;
  deltaX: number;
  deltaY: number;
}

export interface KeyEventData {
  type: string;
  keyCode: number;
  key: string;
  char: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

export interface ChangeEventData<T = unknown> {
  type: string;
  value: T;
}

/**
 * Shape of the synthetic event object passed to focus / blur handlers at
 * runtime. Matches `QuickJSBootstrap.__dispatchEvent` (see
 * `OneJS/Resources/OneJS/QuickJSBootstrap.js.txt:980-1031`) — every synthetic
 * event carries `target` / `currentTarget` as integer C# handles plus the
 * propagation-control surface, and the C# bridge's `OnFocusIn` / `OnFocusOut`
 * dispatch an empty data object, so focus events add no fields beyond the
 * base.
 *
 * `relatedTarget` is intentionally absent: the C# bridge serializes `{}` for
 * focus events and never includes it. Any code that previously depended on
 * `e.relatedTarget` at runtime has been silently receiving `undefined`.
 *
 * `target` / `currentTarget` are raw C# handles, not `VisualElement` proxies.
 * Resolve them via `CS.OneJS.QuickJSNative.GetObjectByHandle(handle)` when an
 * element reference is needed, or compare them directly against
 * `ref.current?.__csHandle` to check element identity.
 */
export interface FocusEventData {
  type: string;
  target: number;
  currentTarget: number;
  preventDefault(): void;
  stopPropagation(): void;
  defaultPrevented: boolean;
  propagationStopped: boolean;
}

export interface DragEventData {
  type: string;
  x: number;
  y: number;
  // Drag-specific properties
  getData?: (type: string) => unknown;
}

export interface GeometryEventData {
  type: string;
  oldRect: { x: number; y: number; width: number; height: number };
  newRect: { x: number; y: number; width: number; height: number };
}

/**
 * Direction values dispatched by `NavigationMoveEvent`. Mirrors
 * `UnityEngine.UIElements.NavigationMoveEvent.Direction`, serialized to
 * lowercase strings by the C# bridge (see `QuickJSUIBridge.OnNavigationMove`
 * and `QuickJSBootstrap.__NAV_DIRECTION_NAMES`). `NavigationSubmitEvent` /
 * `NavigationCancelEvent` do not carry a direction — the field is only
 * populated for navigation-move.
 */
export type NavigationDirection =
  | 'none'
  | 'left'
  | 'up'
  | 'right'
  | 'down'
  | 'next'
  | 'previous';

export interface NavigationEventData {
  type: string;
  direction?: NavigationDirection;
  modifiers?: number;
}

export interface TransitionEventData {
  type: string;
  styleProperty: string;
  elapsedTime: number;
}

export type PointerEventHandler = (event: PointerEventData) => void;
export type MouseEventHandler = (event: MouseEventData) => void;
export type WheelEventHandler = (event: WheelEventData) => void;
export type KeyEventHandler = (event: KeyEventData) => void;
export type ChangeEventHandler<T = unknown> = (event: ChangeEventData<T>) => void;
export type FocusEventHandler = (event?: FocusEventData) => void;
export type DragEventHandler = (event: DragEventData) => void;
export type GeometryEventHandler = (event: GeometryEventData) => void;
export type NavigationEventHandler = (event: NavigationEventData) => void;
export type TransitionEventHandler = (event: TransitionEventData) => void;

// Vector Drawing Types - Re-export from unity-types (CS.* namespace)
// These types are provided by the unity-types package and represent Unity's actual API

/** Unity Vector2 - 2D point/vector. Use CS.UnityEngine.Vector2 at runtime. */
export type Vector2 = CS.UnityEngine.Vector2;

/** Unity Color - RGBA color. Use CS.UnityEngine.Color at runtime. */
export type Color = CS.UnityEngine.Color;

/** Unity Angle - Represents an angle with unit. Use CS.UnityEngine.UIElements.Angle at runtime. */
export type Angle = CS.UnityEngine.UIElements.Angle;

/** Unity ArcDirection - Direction for arc drawing. Use CS.UnityEngine.UIElements.ArcDirection at runtime. */
export type ArcDirection = CS.UnityEngine.UIElements.ArcDirection;

/** Unity Painter2D - Vector drawing API. Accessed via mgc.painter2D in generateVisualContent. */
export type Painter2D = CS.UnityEngine.UIElements.Painter2D;

/**
 * Unity MeshGenerationContext - Provides rendering context within generateVisualContent callback.
 *
 * Access painter2D for vector drawing, or use DrawText/DrawVectorImage for other content.
 *
 * @example
 * <View
 *     style={{ width: 200, height: 200 }}
 *     onGenerateVisualContent={(mgc) => {
 *         const p = mgc.painter2D
 *
 *         p.fillColor = new CS.UnityEngine.Color(0, 0.5, 1, 1)
 *         p.BeginPath()
 *         p.Arc(
 *             new CS.UnityEngine.Vector2(100, 100),
 *             80,
 *             CS.UnityEngine.UIElements.Angle.Degrees(0),
 *             CS.UnityEngine.UIElements.Angle.Degrees(360),
 *             CS.UnityEngine.UIElements.ArcDirection.Clockwise
 *         )
 *         p.Fill()
 *     }}
 * />
 */
export type MeshGenerationContext = CS.UnityEngine.UIElements.MeshGenerationContext;

/**
 * Callback type for generateVisualContent
 */
export type GenerateVisualContentCallback = (context: MeshGenerationContext) => void;

// Base props for all components
export interface BaseProps {
  key?: string | number;
  children?: ReactNode;
  style?: ViewStyle;
  className?: string;

  /**
   * Element name. Maps directly to `VisualElement.name` in Unity UI Toolkit.
   *
   * Useful for:
   * - **USS `#id` selectors**: a rule like `#my-panel { ... }` targets the
   *   element whose `name` is `my-panel` (analogous to a CSS ID selector).
   * - **Debugging**: the UI Toolkit Debugger window shows the name instead of
   *   the bare type (e.g. `VisualElement#my-panel`).
   *
   * Names need not be unique, but since `#` selectors match by name, prefer
   * unique names for elements you intend to select on. Removing the prop resets
   * the name to an empty string (Unity's default).
   */
  name?: string;

  // Click
  onClick?: PointerEventHandler;

  // Pointer events
  onPointerDown?: PointerEventHandler;
  onPointerUp?: PointerEventHandler;
  onPointerMove?: PointerEventHandler;
  onPointerEnter?: PointerEventHandler;
  onPointerLeave?: PointerEventHandler;
  onPointerCancel?: PointerEventHandler;
  onPointerCapture?: PointerEventHandler;
  onPointerCaptureOut?: PointerEventHandler;

  // Mouse events
  onMouseDown?: MouseEventHandler;
  onMouseUp?: MouseEventHandler;
  onMouseMove?: MouseEventHandler;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  onMouseOver?: MouseEventHandler;
  onMouseOut?: MouseEventHandler;
  onWheel?: WheelEventHandler;
  onContextClick?: MouseEventHandler;

  // Focus events
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
  onFocusIn?: FocusEventHandler;
  onFocusOut?: FocusEventHandler;

  // Keyboard events
  onKeyDown?: KeyEventHandler;
  onKeyUp?: KeyEventHandler;

  // Input events
  onInput?: ChangeEventHandler;

  // Drag events
  onDragEnter?: DragEventHandler;
  onDragLeave?: DragEventHandler;
  onDragUpdated?: DragEventHandler;
  onDragPerform?: DragEventHandler;
  onDragExited?: DragEventHandler;

  // Geometry events
  onGeometryChanged?: GeometryEventHandler;

  // Navigation events
  onNavigationMove?: NavigationEventHandler;
  onNavigationSubmit?: NavigationEventHandler;
  onNavigationCancel?: NavigationEventHandler;

  // Tooltip
  onTooltip?: () => void;

  // Transition events
  onTransitionRun?: TransitionEventHandler;
  onTransitionStart?: TransitionEventHandler;
  onTransitionEnd?: TransitionEventHandler;
  onTransitionCancel?: TransitionEventHandler;

  // Picking mode - controls whether the element receives pointer events
  /**
   * Controls whether this element is pickable by pointer events.
   * - "Position" (default): Element receives pointer events based on its rectangle
   * - "Ignore": Element is transparent to pointer events (clicks pass through)
   */
  pickingMode?: 'Position' | 'Ignore';

  // Focus
  /**
   * Whether this element can receive focus.
   * Maps directly to `VisualElement.focusable` in Unity UI Toolkit.
   *
   * Default is element-specific (e.g. Button is focusable by default, View is not).
   * Setting this to `true` makes the element a focus target for keyboard/gamepad
   * navigation and enables `NavigationMoveEvent`/`NavigationSubmitEvent` routing.
   */
  focusable?: boolean;

  // Enabled state
  /**
   * Whether this element is disabled. When `true`, the reconciler calls
   * `VisualElement.SetEnabled(false)` on the underlying C# element, which
   * applies the `:disabled` USS pseudo-class, blocks pointer events, and
   * prevents the element and its descendants from receiving focus.
   *
   * Removing the prop (or setting it to `false`) restores the element to
   * `SetEnabled(true)`. Every VisualElement starts enabled by default.
   */
  disabled?: boolean;

  // Vector drawing
  /**
   * Callback for custom vector drawing via Unity's generateVisualContent.
   * Called when the element needs to repaint its visual content.
   *
   * Use element.MarkDirtyRepaint() to trigger a repaint when your drawing state changes.
   *
   * @example
   * <View
   *     style={{ width: 200, height: 200 }}
   *     onGenerateVisualContent={(mgc) => {
   *         const p = mgc.painter2D
   *         const Angle = CS.UnityEngine.UIElements.Angle
   *
   *         p.fillColor = new CS.UnityEngine.Color(0, 0.5, 1, 1)
   *         p.BeginPath()
   *         p.Arc(
   *             new CS.UnityEngine.Vector2(100, 100),
   *             80,
   *             Angle.Degrees(0),
   *             Angle.Degrees(360),
   *             CS.UnityEngine.UIElements.ArcDirection.Clockwise
   *         )
   *         p.Fill()
   *     }}
   * />
   */
  onGenerateVisualContent?: GenerateVisualContentCallback;
}

// Component-specific props
export interface ViewProps extends BaseProps {}

export interface TextProps extends BaseProps {
  text?: string;
}

export interface LabelProps extends BaseProps {
  text?: string;
}

export interface ButtonProps extends BaseProps {
  text?: string;
}

export interface TextFieldProps extends BaseProps {
  value?: string;
  label?: string;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  isPasswordField?: boolean;
  maskChar?: string;
  isDelayed?: boolean;
  selectAllOnFocus?: boolean;
  selectAllOnMouseUp?: boolean;
  hideMobileInput?: boolean;
  autoCorrection?: boolean;
  onChange?: ChangeEventHandler<string>;
}

export interface ToggleProps extends BaseProps {
  value?: boolean;
  label?: string;
  text?: string;
  toggleOnLabelClick?: boolean;
  onChange?: ChangeEventHandler<boolean>;
}

export interface SliderProps extends BaseProps {
  value?: number;
  label?: string;
  lowValue?: number;
  highValue?: number;
  direction?: 'Horizontal' | 'Vertical';
  pageSize?: number;
  showInputField?: boolean;
  inverted?: boolean;
  fill?: boolean;
  onChange?: ChangeEventHandler<number>;
}

export interface ScrollViewProps extends BaseProps {
  // Scroll direction
  mode?: 'Vertical' | 'Horizontal' | 'VerticalAndHorizontal';

  // Scrollbar visibility
  horizontalScrollerVisibility?: 'Auto' | 'AlwaysVisible' | 'Hidden';
  verticalScrollerVisibility?: 'Auto' | 'AlwaysVisible' | 'Hidden';

  // Scroll behavior
  elasticity?: number;
  elasticAnimationIntervalMs?: number;
  scrollDecelerationRate?: number;
  mouseWheelScrollSize?: number;
  horizontalPageSize?: number;
  verticalPageSize?: number;

  // Touch behavior
  touchScrollBehavior?: 'Unrestricted' | 'Elastic' | 'Clamped';

  // Nested scroll handling
  nestedInteractionKind?: 'Default' | 'StopScrolling' | 'ForwardScrolling';
}

export interface ImageProps extends BaseProps {
  /** Path to image asset relative to the assets/ folder. Supports PNG, JPG, and SVG files. */
  src?: string;
  /** Pre-loaded Texture2D or VectorImage object. Type is auto-detected at runtime. */
  image?: object;
  /** Sprite to display (alternative to image) */
  sprite?: object;
  /** How the image scales to fit the element */
  scaleMode?: 'StretchToFill' | 'ScaleAndCrop' | 'ScaleToFit';
  /** Tint color applied to the image */
  tintColor?: string;
  /** Source rectangle within the texture (normalized 0-1 coordinates) */
  sourceRect?: { x: number; y: number; width: number; height: number };
  /** UV coordinates for the image */
  uv?: { x: number; y: number; width: number; height: number };
}

/**
 * Minimal container type for render() function.
 * Accepts any Unity VisualElement (CS.UnityEngine.UIElements.VisualElement)
 * or the detailed VisualElement interface below.
 */
export interface RenderContainer {
  __csHandle: number;
  __csType: string;
}

// VisualElement - base type for all UI Toolkit elements
// This is the C# VisualElement exposed to JS via refs
// Note: This interface represents the JS-side view of Unity's VisualElement
export interface VisualElement extends RenderContainer {
  style: Record<string, unknown>;
  name: string;
  visible: boolean;
  enabledSelf: boolean;
  enabledInHierarchy: boolean;
  SetEnabled: (value: boolean) => void;

  // Text content (for TextElement-derived types)
  text?: string;

  // Label (for labeled controls like Toggle)
  label?: string;

  // Value (for input controls)
  value?: unknown;

  // Hierarchy
  Add: (child: VisualElement) => void;
  Insert: (index: number, child: VisualElement) => void;
  Remove: (child: VisualElement) => void;
  RemoveAt: (index: number) => void;
  RemoveFromHierarchy: () => void;
  Clear: () => void;
  IndexOf: (child: VisualElement) => number;
  childCount: number;
  parent: VisualElement | null;

  // Classes
  AddToClassList: (className: string) => void;
  RemoveFromClassList: (className: string) => void;
  ClearClassList: () => void;
  ClassListContains: (className: string) => boolean;

  // Focus
  Focus: () => void;
  Blur: () => void;
  focusable: boolean;

  // Layout
  MarkDirtyRepaint: () => void;
  /** Element bounds in panel space (Unity's VisualElement.worldBound). */
  worldBound: { x: number; y: number; width: number; height: number };
  /** Element bounds in local space (Unity's VisualElement.localBound). */
  localBound: { x: number; y: number; width: number; height: number };

  // Vector drawing
  /**
   * Callback delegate for custom visual content generation.
   * Can be used via ref for raw access to Unity's generateVisualContent.
   *
   * @example
   * useEffect(() => {
   *     const ve = ref.current
   *     const draw = (mgc) => { ... }
   *     ve.generateVisualContent += draw
   *     return () => { ve.generateVisualContent -= draw }
   * }, [])
   */
  generateVisualContent: {
    (callback: GenerateVisualContentCallback): void;
  } & {
    // Delegate operators (C# interop)
    '+='?: (callback: GenerateVisualContentCallback) => void;
    '-='?: (callback: GenerateVisualContentCallback) => void;
  };
}

// Specific element types for better ref typing
export interface TextElement extends VisualElement {
  text: string;
}

export interface LabelElement extends TextElement {}

export interface ButtonElement extends TextElement {}

export interface TextFieldElement extends VisualElement {
  value: string;
  text: string;
  isReadOnly: boolean;
  isPasswordField: boolean;
  maxLength: number;
  SelectAll: () => void;
}

export interface ToggleElement extends VisualElement {
  value: boolean;
  text: string;
}

export interface SliderElement extends VisualElement {
  value: number;
  lowValue: number;
  highValue: number;
}

export interface ScrollViewElement extends VisualElement {
  scrollOffset: { x: number; y: number };
  ScrollTo: (child: VisualElement) => void;
}

export interface ImageElement extends VisualElement {
  image: any;
  sprite: any;
  vectorImage: any;
  scaleMode: number;
  tintColor: any;
  sourceRect: any;
  uv: any;
}

// ListView uses Unity's virtualization callbacks directly
// This is intentionally imperative - ListView manages its own element recycling
export interface FrostedGlassProps extends BaseProps {
  /** Blur radius in screen pixels. Higher = more blurry. Default: 10. */
  blur?: number;
  /** Tint color overlaid on the blurred background (CSS color string). */
  tint?: string;
}

/** Internal props for the ojs-frostedglass intrinsic element */
export interface FrostedGlassIntrinsicProps extends BaseProps {
  blurRadius?: number;
  tintColor?: any;
}

export interface FrostedGlassElement extends VisualElement {
  blurRadius: number;
  tintColor: any;
}

export interface ListViewProps extends BaseProps {
  // Data source - the array of items to display
  itemsSource: unknown[];

  // Element creation callback - called when ListView needs a new visual element
  // Return a VisualElement (e.g., new CS.UnityEngine.UIElements.Label())
  makeItem: () => VisualElement;

  // Bind callback - called to populate an element with data at the given index
  // The element is recycled, so clear/set all relevant properties
  bindItem: (element: VisualElement, index: number) => void;

  // Optional: called when an element is about to be recycled
  unbindItem?: (element: VisualElement, index: number) => void;

  // Optional: called when an element is being destroyed
  destroyItem?: (element: VisualElement) => void;

  // Virtualization settings
  fixedItemHeight?: number;
  virtualizationMethod?: 'FixedHeight' | 'DynamicHeight';

  // Selection
  selectionType?: 'None' | 'Single' | 'Multiple';
  selectedIndex?: number;
  selectedIndices?: number[];
  onSelectionChange?: (selectedIndices: number[]) => void;
  onItemsChosen?: (chosenItems: unknown[]) => void;

  // Reordering
  reorderable?: boolean;
  reorderMode?: 'Simple' | 'Animated';

  // Header/Footer
  showFoldoutHeader?: boolean;
  headerTitle?: string;
  showAddRemoveFooter?: boolean;

  // Appearance
  showBorder?: boolean;
  showAlternatingRowBackgrounds?: 'None' | 'ContentOnly' | 'All';
}

/**
 * A UI element whose background is generated each frame by a shader. The effect
 * is blitted into a RenderTexture and shown as the element's backgroundImage, so
 * the element stays a normal UI element: border-radius, clipping, opacity and
 * antialiasing all still apply to it.
 *
 * Property names are the shader's own (`_Speed`, `_Ramp`, ...). Effects are a
 * shader plus a thin wrapper component, so adding one needs no C#.
 */
export interface ShaderEffectProps extends BaseProps {
  /** Shader to run, resolved through Resources (e.g. "OneJS/Fire"). */
  shader: string;
  /** Render size in px. Omit to follow the element's own layout size. */
  resolution?: [number, number];
  /** Scalar shader properties. */
  floats?: Record<string, number>;
  /** float4 shader properties. */
  vectors?: Record<string, [number, number, number, number]>;
  /** float4 array properties, as flat arrays of 4 floats per element. */
  vectorArrays?: Record<string, number[]>;
  /** Colour properties as CSS hex strings. */
  colors?: Record<string, string>;
  /**
   * Texture properties. A string names a built-in procedural texture
   * ("noise", "noise:2", "flame-mask", "radial-mask"); anything else is
   * treated as a CS Texture. Built-ins mean an effect can ship with no art.
   */
  textures?: Record<string, string | unknown>;
  /** Gradient stops built into a 256x1 ramp texture. Alpha is carried through. */
  ramp?: string[];
  /** Shader property the ramp binds to. Default "_Ramp". */
  rampProperty?: string;
  /** Freeze the effect's clock. */
  paused?: boolean;
}

/** Internal props for the ojs-shaderfx intrinsic element */
export interface ShaderEffectIntrinsicProps extends ShaderEffectProps { }
