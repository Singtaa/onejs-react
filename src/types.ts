import type { ReactNode } from 'react';

// Style types (subset of UI Toolkit USS properties)
export interface ViewStyle {
  // Layout
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;

  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';

  position?: 'relative' | 'absolute';
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  left?: number | string;

  // Margin & Padding
  margin?: number | string;
  marginTop?: number | string;
  marginRight?: number | string;
  marginBottom?: number | string;
  marginLeft?: number | string;

  padding?: number | string;
  paddingTop?: number | string;
  paddingRight?: number | string;
  paddingBottom?: number | string;
  paddingLeft?: number | string;

  // Appearance
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderTopLeftRadius?: number;
  borderTopRightRadius?: number;
  borderBottomLeftRadius?: number;
  borderBottomRightRadius?: number;

  opacity?: number;
  overflow?: 'visible' | 'hidden';
  display?: 'flex' | 'none';
  visibility?: 'visible' | 'hidden';

  // Text
  color?: string;
  fontSize?: number;
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
