import { forwardRef, type ReactElement, type Ref } from 'react';
import type {
  ViewProps,
  TextProps,
  LabelProps,
  ButtonProps,
  TextFieldProps,
  ToggleProps,
  SliderProps,
  ScrollViewProps,
  ImageProps,
  ListViewProps,
  VisualElement,
  TextElement,
  LabelElement,
  ButtonElement,
  TextFieldElement,
  ToggleElement,
  SliderElement,
  ScrollViewElement,
  ImageElement,
} from './types';

// Props with ref support for intrinsic elements
type WithRef<Props, Element> = Props & { ref?: Ref<Element> };

// Declare the intrinsic element types for JSX
// Using 'ojs-' prefix to avoid conflicts with HTML/SVG element names in @types/react
// For React 19 with jsx: "react-jsx", we need to augment 'react/jsx-runtime'
declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'ojs-view': WithRef<ViewProps, VisualElement>;
      'ojs-text': WithRef<TextProps, TextElement>;
      'ojs-label': WithRef<LabelProps, LabelElement>;
      'ojs-button': WithRef<ButtonProps, ButtonElement>;
      'ojs-textfield': WithRef<TextFieldProps, TextFieldElement>;
      'ojs-toggle': WithRef<ToggleProps, ToggleElement>;
      'ojs-slider': WithRef<SliderProps, SliderElement>;
      'ojs-scrollview': WithRef<ScrollViewProps, ScrollViewElement>;
      'ojs-image': WithRef<ImageProps, ImageElement>;
      'ojs-listview': WithRef<ListViewProps, VisualElement>;
    }
  }
}

// Also augment 'react' for compatibility
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ojs-view': WithRef<ViewProps, VisualElement>;
      'ojs-text': WithRef<TextProps, TextElement>;
      'ojs-label': WithRef<LabelProps, LabelElement>;
      'ojs-button': WithRef<ButtonProps, ButtonElement>;
      'ojs-textfield': WithRef<TextFieldProps, TextFieldElement>;
      'ojs-toggle': WithRef<ToggleProps, ToggleElement>;
      'ojs-slider': WithRef<SliderProps, SliderElement>;
      'ojs-scrollview': WithRef<ScrollViewProps, ScrollViewElement>;
      'ojs-image': WithRef<ImageProps, ImageElement>;
      'ojs-listview': WithRef<ListViewProps, VisualElement>;
    }
  }
}

// Component wrappers that provide nice capitalized names
// These use forwardRef to pass refs through to the intrinsic elements

export const View = forwardRef<VisualElement, ViewProps>((props, ref) => {
  return <ojs-view ref={ref} {...props} />;
});
View.displayName = 'View';

export const Text = forwardRef<TextElement, TextProps>((props, ref) => {
  return <ojs-text ref={ref} {...props} />;
});
Text.displayName = 'Text';

export const Label = forwardRef<LabelElement, LabelProps>((props, ref) => {
  return <ojs-label ref={ref} {...props} />;
});
Label.displayName = 'Label';

export const Button = forwardRef<ButtonElement, ButtonProps>((props, ref) => {
  return <ojs-button ref={ref} {...props} />;
});
Button.displayName = 'Button';

export const TextField = forwardRef<TextFieldElement, TextFieldProps>((props, ref) => {
  return <ojs-textfield ref={ref} {...props} />;
});
TextField.displayName = 'TextField';

export const Toggle = forwardRef<ToggleElement, ToggleProps>((props, ref) => {
  return <ojs-toggle ref={ref} {...props} />;
});
Toggle.displayName = 'Toggle';

export const Slider = forwardRef<SliderElement, SliderProps>((props, ref) => {
  return <ojs-slider ref={ref} {...props} />;
});
Slider.displayName = 'Slider';

export const ScrollView = forwardRef<ScrollViewElement, ScrollViewProps>((props, ref) => {
  return <ojs-scrollview ref={ref} {...props} />;
});
ScrollView.displayName = 'ScrollView';

export const Image = forwardRef<ImageElement, ImageProps>((props, ref) => {
  return <ojs-image ref={ref} {...props} />;
});
Image.displayName = 'Image';

export const ListView = forwardRef<VisualElement, ListViewProps>((props, ref) => {
  return <ojs-listview ref={ref} {...props} />;
});
ListView.displayName = 'ListView';
