import type { ReactElement } from 'react';
import type {
  ViewProps,
  LabelProps,
  ButtonProps,
  TextFieldProps,
  ToggleProps,
  SliderProps,
  ScrollViewProps,
  ImageProps,
  ListViewProps
} from './types';

// Declare the intrinsic element types for JSX
// Using 'ojs-' prefix to avoid conflicts with HTML/SVG element names in @types/react
// For React 19 with jsx: "react-jsx", we need to augment 'react/jsx-runtime'
declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'ojs-view': ViewProps;
      'ojs-label': LabelProps;
      'ojs-button': ButtonProps;
      'ojs-textfield': TextFieldProps;
      'ojs-toggle': ToggleProps;
      'ojs-slider': SliderProps;
      'ojs-scrollview': ScrollViewProps;
      'ojs-image': ImageProps;
      'ojs-listview': ListViewProps;
    }
  }
}

// Also augment 'react' for compatibility
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ojs-view': ViewProps;
      'ojs-label': LabelProps;
      'ojs-button': ButtonProps;
      'ojs-textfield': TextFieldProps;
      'ojs-toggle': ToggleProps;
      'ojs-slider': SliderProps;
      'ojs-scrollview': ScrollViewProps;
      'ojs-image': ImageProps;
      'ojs-listview': ListViewProps;
    }
  }
}

// Component wrappers that provide nice capitalized names
// These return JSX elements with 'ojs-' prefixed type strings

export function View(props: ViewProps): ReactElement {
  return <ojs-view {...props} />;
}

export function Label(props: LabelProps): ReactElement {
  return <ojs-label {...props} />;
}

export function Button(props: ButtonProps): ReactElement {
  return <ojs-button {...props} />;
}

export function TextField(props: TextFieldProps): ReactElement {
  return <ojs-textfield {...props} />;
}

export function Toggle(props: ToggleProps): ReactElement {
  return <ojs-toggle {...props} />;
}

export function Slider(props: SliderProps): ReactElement {
  return <ojs-slider {...props} />;
}

export function ScrollView(props: ScrollViewProps): ReactElement {
  return <ojs-scrollview {...props} />;
}

export function Image(props: ImageProps): ReactElement {
  return <ojs-image {...props} />;
}

export function ListView(props: ListViewProps): ReactElement {
  return <ojs-listview {...props} />;
}
