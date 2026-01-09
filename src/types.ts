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
   * Background image - accepts a Texture2D, RenderTexture, or RenderTexture object from GPU compute.
   *
   * For GPU compute RenderTextures, you can pass the RenderTexture object directly:
   * @example
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

  /** Border width for all sides. Examples: 1, "1px" */
  borderWidth?: StyleLength;
  borderTopWidth?: StyleLength;
  borderRightWidth?: StyleLength;
  borderBottomWidth?: StyleLength;
  borderLeftWidth?: StyleLength;

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
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold-and-italic';
  unityTextAlign?: 'upper-left' | 'upper-center' | 'upper-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'lower-left' | 'lower-center' | 'lower-right';
  whiteSpace?: 'normal' | 'nowrap';
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
  x: number;
  y: number;
  delta: { x: number; y: number };
  modifiers?: number;
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

export interface FocusEventData {
  type: string;
  relatedTarget?: unknown;
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

export interface NavigationEventData {
  type: string;
  direction?: string;
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

// Base props for all components
export interface BaseProps {
  key?: string | number;
  children?: ReactNode;
  style?: ViewStyle;
  className?: string;

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
  onPointerStationary?: PointerEventHandler;

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
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  onChange?: ChangeEventHandler<string>;
}

export interface ToggleProps extends BaseProps {
  value?: boolean;
  label?: string;
  onChange?: ChangeEventHandler<boolean>;
}

export interface SliderProps extends BaseProps {
  value?: number;
  lowValue?: number;
  highValue?: number;
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
  src?: string;
  scaleMode?: 'stretch-to-fill' | 'scale-and-crop' | 'scale-to-fit';
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
  // Image-specific properties handled via style.backgroundImage
}

// ListView uses Unity's virtualization callbacks directly
// This is intentionally imperative - ListView manages its own element recycling
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
