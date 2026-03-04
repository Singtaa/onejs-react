import { forwardRef, createElement, useMemo, type ReactElement, type Ref } from 'react';
import type {
  BaseProps,
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

declare const CS: any
declare function useExtensions(typeRef: any): void

// Register ImageConversion extension methods so tex.LoadImage(bytes) works
useExtensions(CS.UnityEngine.ImageConversion)

// Module-level image cache shared across all Image instances
const _imageCache = new Map<string, any>()

function _resolveAssetPath(src: string): string {
    const Path = CS.System.IO.Path
    if (CS.UnityEngine.Application.isEditor) {
        const workingDir = typeof (globalThis as any).__workingDir === "string"
            ? (globalThis as any).__workingDir
            : Path.Combine(Path.GetDirectoryName(CS.UnityEngine.Application.dataPath), "App")
        return Path.Combine(workingDir, "assets", src)
    }
    return Path.Combine(CS.UnityEngine.Application.streamingAssetsPath, "onejs", "assets", src)
}

function _loadImageAsset(src: string): any | null {
    const cached = _imageCache.get(src)
    if (cached) return cached

    const fullPath = _resolveAssetPath(src)
    if (!CS.System.IO.File.Exists(fullPath)) {
        console.error(`Image src not found: ${src} (resolved to ${fullPath})`)
        return null
    }

    let result: any
    if (src.toLowerCase().endsWith(".svg")) {
        const svgText = CS.System.IO.File.ReadAllText(fullPath)
        result = CS.OneJS.SVGUtils.LoadFromString(svgText)
    } else {
        const bytes = CS.System.IO.File.ReadAllBytes(fullPath)
        const tex = new CS.UnityEngine.Texture2D(2, 2)
        tex.LoadImage(bytes)
        tex.filterMode = CS.UnityEngine.FilterMode.Bilinear
        result = tex
    }

    _imageCache.set(src, result)
    return result
}

/**
 * Clear the Image component's image cache.
 * Call this if you need to force-reload images (e.g., after replacing files on disk).
 */
export function clearImageCache(): void {
    _imageCache.clear()
}

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

export const Image = forwardRef<ImageElement, ImageProps>(({ src, image, ...rest }, ref) => {
  const resolved = useMemo(() => {
    if (src) return _loadImageAsset(src)
    return image
  }, [src, image])
  return <ojs-image ref={ref} image={resolved} {...rest} />;
});
Image.displayName = 'Image';

export const ListView = forwardRef<VisualElement, ListViewProps>((props, ref) => {
  return <ojs-listview ref={ref} {...props} />;
});
ListView.displayName = 'ListView';

/**
 * Create a typed React component for a registered custom element.
 * Use with `registerElement()` to add custom C# VisualElement types to React.
 *
 * @param name - Element name matching what was passed to registerElement()
 * @param displayName - Optional display name for React DevTools
 *
 * @example
 * import { registerElement, createComponent } from "onejs-react"
 * import { BaseProps, VisualElement } from "onejs-react"
 *
 * // Define props for your custom element
 * interface RadialProgressProps extends BaseProps {
 *     progress?: number
 *     trackColor?: string
 * }
 *
 * // Register and create the component
 * registerElement("radial-progress", CS.MyGame.UI.RadialProgress)
 * export const RadialProgress = createComponent<RadialProgressProps>("radial-progress")
 *
 * // Use in JSX like any React component
 * <RadialProgress progress={0.75} trackColor="#333" style={{ width: 100, height: 100 }} />
 */
export function createComponent<P extends BaseProps = BaseProps>(
    name: string,
    displayName?: string
) {
    const type = name.startsWith('ojs-') ? name : `ojs-${name}`;
    const Component = forwardRef<VisualElement, P>((props, ref) => {
        return createElement(type, { ...props, ref });
    });
    Component.displayName = displayName || name;
    return Component;
}
