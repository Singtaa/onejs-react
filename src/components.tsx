import { forwardRef, createElement, useEffect, useMemo, useState, type ReactElement, type Ref } from 'react';
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
  FrostedGlassProps,
  FrostedGlassIntrinsicProps,
  ShaderEffectProps,
  ShaderEffectIntrinsicProps,
  VisualElement,
  TextElement,
  LabelElement,
  ButtonElement,
  TextFieldElement,
  ToggleElement,
  SliderElement,
  ScrollViewElement,
  ImageElement,
  FrostedGlassElement,
} from './types';

import { TextureFXBuilder, buildTextureFX, type TextureFXBuild } from './texturefx';

declare const CS: any
declare function useExtensions(typeRef: any): void
// Provided by the OneJS bootstrap (Network.cs) on native, by the browser on WebGL
declare function fetch(url: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }>

// Register ImageConversion extension methods so tex.LoadImage(bytes) works
useExtensions(CS.UnityEngine.ImageConversion)

// Module-level image cache shared across all Image instances
const _imageCache = new Map<string, any>()
// In-flight async loads keyed by src, so simultaneous mounts share one request
const _imagePending = new Map<string, Promise<any>>()

// On Android, streamingAssetsPath is a jar:file://...apk!/assets URL; on WebGL
// it's http(s). System.IO.File can't read those - they need UnityWebRequest.
function _isUrlPath(path: string): boolean {
    return path.includes("://")
}

function _resolveAssetPath(src: string): string {
    const Path = CS.System.IO.Path
    // Absolute paths bypass asset resolution entirely
    if (Path.IsPathRooted(src)) {
        return src
    }
    if (CS.UnityEngine.Application.isEditor) {
        const workingDir = typeof (globalThis as any).__workingDir === "string"
            ? (globalThis as any).__workingDir
            : Path.Combine(Path.GetDirectoryName(CS.UnityEngine.Application.dataPath), "App")
        return Path.Combine(workingDir, "assets", src)
    }
    const streamingAssets = CS.UnityEngine.Application.streamingAssetsPath
    if (_isUrlPath(streamingAssets)) {
        return `${streamingAssets}/onejs/assets/${src}`
    }
    return Path.Combine(streamingAssets, "onejs", "assets", src)
}

function _loadImageAsset(src: string): any | null {
    const cached = _imageCache.get(src)
    if (cached) return cached

    const fullPath = _resolveAssetPath(src)
    // URL paths (Android APK, WebGL) can't be read synchronously; the Image
    // component falls back to _loadImageAssetAsync for these.
    if (_isUrlPath(fullPath)) return null
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

function _loadImageAssetAsync(src: string, url: string): Promise<any> {
    const existing = _imagePending.get(src)
    if (existing) return existing

    const promise = (async (): Promise<any> => {
        try {
            let result: any
            if (src.toLowerCase().endsWith(".svg")) {
                const res = await fetch(url)
                if (!res.ok) {
                    console.error(`Image src not found: ${src} (resolved to ${url})`)
                    return null
                }
                const svgText = await res.text()
                result = CS.OneJS.SVGUtils.LoadFromString(svgText)
            } else {
                const tex = await CS.OneJS.Network.LoadTextureFromUrl(url)
                if (!tex) {
                    console.error(`Image src not found: ${src} (resolved to ${url})`)
                    return null
                }
                tex.filterMode = CS.UnityEngine.FilterMode.Bilinear
                result = tex
            }
            _imageCache.set(src, result)
            return result
        } catch (e) {
            console.error(`Image src failed to load: ${src} (resolved to ${url}): ${e}`)
            return null
        }
    })()

    _imagePending.set(src, promise)
    promise.then(() => {
        if (_imagePending.get(src) === promise) _imagePending.delete(src)
    })
    return promise
}

/**
 * Clear the Image component's image cache.
 * Call this if you need to force-reload images (e.g., after replacing files on disk).
 */
export function clearImageCache(): void {
    _imageCache.clear()
    _imagePending.clear()
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
      'ojs-frostedglass': WithRef<FrostedGlassIntrinsicProps, FrostedGlassElement>;
      'ojs-shaderfx': WithRef<ShaderEffectIntrinsicProps, VisualElement>;
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
      'ojs-frostedglass': WithRef<FrostedGlassIntrinsicProps, FrostedGlassElement>;
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
  const [loaded, setLoaded] = useState<{ src: string; image: any } | null>(null)
  const resolved = useMemo(() => {
    if (src) return _loadImageAsset(src)
    return image
  }, [src, image])

  // Async fallback for platforms where StreamingAssets is a URL (Android APK,
  // WebGL): load via UnityWebRequest, then re-render with the result.
  useEffect(() => {
    if (!src || resolved) return
    const fullPath = _resolveAssetPath(src)
    if (!_isUrlPath(fullPath)) return
    let cancelled = false
    _loadImageAssetAsync(src, fullPath).then((result) => {
      if (!cancelled && result) setLoaded({ src, image: result })
    })
    return () => { cancelled = true }
  }, [src, resolved])

  const asyncImage = loaded && loaded.src === src ? loaded.image : null
  return <ojs-image ref={ref} image={resolved ?? asyncImage} {...rest} />;
});
Image.displayName = 'Image';

export const ListView = forwardRef<VisualElement, ListViewProps>((props, ref) => {
  return <ojs-listview ref={ref} {...props} />;
});
ListView.displayName = 'ListView';

export const FrostedGlass = forwardRef<FrostedGlassElement, FrostedGlassProps>(({ blur, tint, ...rest }, ref) => {
  const parsedTint = useMemo(() => {
    if (!tint) return new CS.UnityEngine.Color(1, 1, 1, 0.15)
    const m = tint.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/)
    if (m) return new CS.UnityEngine.Color(+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] != null ? +m[4] : 1)
    return new CS.UnityEngine.Color(1, 1, 1, 0.15)
  }, [tint])
  return <ojs-frostedglass ref={ref} blurRadius={blur ?? 10} tintColor={parsedTint} {...rest} />;
});
FrostedGlass.displayName = 'FrostedGlass';

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

// MARK: ShaderFX

/**
 * Runs a shader into this element's background, one blit per frame.
 *
 * The generic layer: any shader, any properties. An effect is this component
 * plus a wrapper that fills in the shader name and friendly prop names, so
 * shipping a new effect costs a shader file and a few lines of TSX - no C#.
 *
 *     <ShaderEffect
 *         shader="OneJS/Fire"
 *         textures={{ _NoiseA: "noise:1", _NoiseB: "noise:2" }}
 *         ramp={["#00000000", "#7a0d00", "#ff5a00", "#ffd042", "#fffbe8"]}
 *         floats={{ _Speed: 1.2 }}
 *         style={{ width: 160, height: 240 }}
 *     />
 */
export const ShaderEffect = forwardRef<any, ShaderEffectProps>((props, ref) => {
  return <ojs-shaderfx {...(props as any)} ref={ref} />;
});
ShaderEffect.displayName = 'ShaderEffect';

/** Warm fire, transparent at the cool end so the flame sits on any background. */
const FIRE_RAMP = ['#00000000', '#4a060088', '#c22200dd', '#ff6a10ff', '#ffc23cff', '#fff4d2ff'];

export interface TextureFXProps extends Omit<ShaderEffectProps, 'shader' | 'floats' | 'vectorArrays' | 'ramp'> {
  /** Imperative builder: add sources, blend them, erode, then ramp. */
  build: TextureFXBuild;
}

/**
 * Composes a procedural texture from noise, shapes and blends.
 *
 *     <TextureFX
 *         style={{ width: 160, height: 240 }}
 *         build={(fx) => {
 *             fx.noise({ scale: [3, 4], seed: 1, scroll: [0.03, -0.35] })
 *             fx.noise({ scale: [6, 8], seed: 2, scroll: [-0.05, -0.62] }).multiply()
 *             fx.shape('flame', { width: 0.44 }).multiply()
 *             fx.erode(0.10, 0.30).ramp(['#00000000', '#c22200', '#ff6a10', '#fff4d2'])
 *         }}
 *     />
 */
export const TextureFX = forwardRef<any, TextureFXProps>(({ build, ...rest }, ref) => {
  // Recompiling on every render would rebuild the uniform arrays for nothing;
  // the caller controls invalidation by identity of `build`.
  const compiled = useMemo(() => buildTextureFX(build), [build]);
  return (
    <ShaderEffect
      {...rest}
      ref={ref}
      shader="OneJS/TextureFX"
      floats={compiled.floats}
      vectorArrays={compiled.vectorArrays}
      ramp={compiled.ramp}
    />
  );
});
TextureFX.displayName = 'TextureFX';

export interface FlameProps extends Omit<ShaderEffectProps, 'shader' | 'floats' | 'vectorArrays' | 'ramp' | 'colors' | 'textures'> {
  /** Gradient from coolest to hottest. The first stop should be transparent. */
  colors?: string[];
  /** Overall animation rate. Default 1. */
  speed?: number;
  /** Erosion cutoff: higher eats the flame back to fewer, sharper licks. Default 0.30. */
  threshold?: number;
  /** Width of the eroded band. Must be on the order of the stack's value range
   * (roughly `gain` x the shape), or the ramp saturates to its hot end. Default 1.0. */
  softness?: number;
  /** Half-width at the base, as a fraction of the element's width. Default 0.44. */
  width?: number;
  /** How fast the silhouette narrows toward the tip. Default 0.7. */
  taper?: number;
  /** How quickly the flame thins with height. Lower burns taller. Default 0.55. */
  topFalloff?: number;
  /** Multiplier on both noise layers, i.e. how much the field is boosted. Default 7.5. */
  gain?: number;
}

/**
 * A procedural flame. This is a *preset over TextureFX*, not its own shader: two
 * scrolling noise fields multiplied, carved by a flame shape, eroded and ramped.
 * Anything it does is reachable from <TextureFX> directly.
 */
export const Flame = forwardRef<any, FlameProps>(
  ({ colors, speed, threshold, softness, width, taper, topFalloff, gain, ...rest }, ref) => {
    const build = useMemo<TextureFXBuild>(() => (fx: TextureFXBuilder) => {
      const g = gain ?? 7.5;
      // Two fields at different scales and rates: their product is what gives fire
      // its wispy, non-repeating structure. The gain is split so the product lands
      // in a usable range instead of collapsing toward zero.
      fx.noise({ scale: [3, 4], seed: 1, scroll: [0.02, -1.1], amount: Math.sqrt(g) });
      fx.noise({ scale: [6, 8], seed: 2, scroll: [-0.03, -1.9], amount: Math.sqrt(g) }).multiply();
      fx.shape('flame', {
        width: width ?? 0.44,
        taper: taper ?? 0.7,
        softness: 0.05,
        falloff: topFalloff ?? 0.55,
      }).multiply();
      fx.erode(threshold ?? 0.30, softness ?? 1.0);
      fx.ramp(colors ?? FIRE_RAMP);
      fx.setSpeed(speed ?? 1);
    }, [colors, speed, threshold, softness, width, taper, topFalloff, gain]);

    return <TextureFX {...rest} ref={ref} build={build} />;
  }
);
Flame.displayName = 'Flame';
