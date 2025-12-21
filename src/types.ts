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

export type PointerEventHandler = (event: PointerEventData) => void;
export type KeyEventHandler = (event: KeyEventData) => void;
export type ChangeEventHandler<T = unknown> = (event: ChangeEventData<T>) => void;
export type FocusEventHandler = () => void;

// Base props for all components
export interface BaseProps {
  key?: string | number;
  children?: ReactNode;
  style?: ViewStyle;
  className?: string;

  // Pointer events
  onClick?: PointerEventHandler;
  onPointerDown?: PointerEventHandler;
  onPointerUp?: PointerEventHandler;
  onPointerMove?: PointerEventHandler;
  onPointerEnter?: PointerEventHandler;
  onPointerLeave?: PointerEventHandler;

  // Focus events
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;

  // Keyboard events
  onKeyDown?: KeyEventHandler;
  onKeyUp?: KeyEventHandler;
}

// Component-specific props
export interface ViewProps extends BaseProps {}

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

// VisualElement type for ListView callbacks
// This is the C# VisualElement exposed to JS
export interface VisualElement {
  __csHandle: number;
  __csType: string;
  style: Record<string, unknown>;
  text?: string;
  value?: unknown;
  Add: (child: VisualElement) => void;
  Remove: (child: VisualElement) => void;
  AddToClassList: (className: string) => void;
  RemoveFromClassList: (className: string) => void;
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
