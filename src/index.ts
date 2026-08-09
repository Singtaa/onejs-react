// Components
export {
  View,
  Text,
  Label,
  Button,
  TextField,
  Toggle,
  Slider,
  ScrollView,
  Image,
  ListView,
  FrostedGlass,
  clearImageCache,
  createComponent,
} from './components';

// Custom Element Registration
export { registerElement } from './host-config';

// Renderer
export { render, unmount, unmountAll, createPortal, flushSync, batchedUpdates, getDebugInfo } from './renderer';

// Portals
export { Portal } from './portal';
export type { PortalProps } from './portal';

// Error Handling
export { ErrorBoundary, formatError } from './error-boundary';
export type { ErrorBoundaryProps } from './error-boundary';

// Responsive Design
export {
  ScreenProvider,
  useBreakpoint,
  useScreenSize,
  useResponsive,
  useMediaQuery,
  BREAKPOINTS,
} from './screen';

export type {
  ScreenContextValue,
  ScreenProviderProps,
  BreakpointName,
} from './screen';

// Vector Drawing
export { Transform2D, useVectorContent } from './vector';

// Batched vector drawing: single-crossing command buffer (see painter.ts)
export { Painter, batchedVisualContent, useBatchedVectorContent } from './painter';

// 2D particle engine control plane (C#-owned sim/render; see OneJS Runtime/Particles)
export { createParticles, useParticles, toWire } from './particles';
export type {
  ParticlesConfig,
  EmitterConfig,
  EmitterShape,
  ParticlesHandle,
  EmitterHandle,
  BurstOptions,
  ParticleRange,
  ParticleColor,
  AttractConfig,
  AttractEase,
  EdgeMode,
  SheetConfig,
} from './particles';

// Shader-driven procedural effects (C#-owned blit; see OneJS Runtime/ShaderFX)
export { ShaderEffect, TextureFX, Flame } from './components';
export type { FlameProps, TextureFXProps } from './components';
export { TextureFXBuilder, buildTextureFX, MAX_TEXTUREFX_LAYERS } from './texturefx';
export type { TextureFXBuild, LayerHandle, NoiseOptions, ShapeOptions, BlendMode, ShapeKind } from './texturefx';
export type { ShaderEffectProps } from './types';

// Sync Hooks & C# Interop Utilities
export { useFrameSync, useFrameSyncWith, useThrottledSync, useEventSync, toArray } from './hooks';
export type { EventSource } from './hooks';

// Types
export type {
  ViewStyle,
  // Event data types
  PointerEventData,
  MouseEventData,
  WheelEventData,
  KeyEventData,
  ChangeEventData,
  FocusEventData,
  DragEventData,
  GeometryEventData,
  NavigationEventData,
  NavigationDirection,
  TransitionEventData,
  // Event handler types
  PointerEventHandler,
  MouseEventHandler,
  WheelEventHandler,
  KeyEventHandler,
  ChangeEventHandler,
  FocusEventHandler,
  DragEventHandler,
  GeometryEventHandler,
  NavigationEventHandler,
  TransitionEventHandler,
  // Component props
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
  // Container type for render()
  RenderContainer,
  // Element types for refs
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
  // Vector drawing types
  Vector2,
  Color,
  Angle,
  ArcDirection,
  Painter2D,
  MeshGenerationContext,
  GenerateVisualContentCallback,
} from './types';
