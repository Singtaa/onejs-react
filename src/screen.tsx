/**
 * Responsive design system for OneJS
 *
 * Provides React context and hooks for responsive breakpoints.
 * Uses event-driven updates via GeometryChangedEvent (not polling).
 *
 * Mobile-first: At 1400px width, sm/md/lg/xl are all active (not just xl).
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

// Globals from QuickJS environment
declare const __root: {
    __csHandle: number
    resolvedStyle: {
        width: number
        height: number
    }
    AddToClassList: (className: string) => void
    RemoveFromClassList: (className: string) => void
}

declare const __eventAPI: {
    addEventListener: (element: unknown, eventType: string, callback: Function) => void
    removeEventListener: (element: unknown, eventType: string, callback: Function) => void
}

// Breakpoint definitions (Tailwind v3 defaults)
export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    "2xl": 1536,
} as const

export type BreakpointName = keyof typeof BREAKPOINTS | "base"

export interface ScreenContextValue {
    /** Current viewport width in pixels */
    width: number
    /** Current viewport height in pixels */
    height: number
    /** Current breakpoint name (highest matching) */
    breakpoint: BreakpointName
    /** True if viewport >= 640px */
    isSm: boolean
    /** True if viewport >= 768px */
    isMd: boolean
    /** True if viewport >= 1024px */
    isLg: boolean
    /** True if viewport >= 1280px */
    isXl: boolean
    /** True if viewport >= 1536px */
    is2xl: boolean
}

const ScreenContext = createContext<ScreenContextValue | null>(null)

/**
 * Calculate breakpoint state from viewport width
 */
function calculateBreakpoints(width: number, height: number): ScreenContextValue {
    const isSm = width >= BREAKPOINTS.sm
    const isMd = width >= BREAKPOINTS.md
    const isLg = width >= BREAKPOINTS.lg
    const isXl = width >= BREAKPOINTS.xl
    const is2xl = width >= BREAKPOINTS["2xl"]

    // Determine current breakpoint (highest matching)
    let breakpoint: BreakpointName = "base"
    if (is2xl) breakpoint = "2xl"
    else if (isXl) breakpoint = "xl"
    else if (isLg) breakpoint = "lg"
    else if (isMd) breakpoint = "md"
    else if (isSm) breakpoint = "sm"

    return { width, height, breakpoint, isSm, isMd, isLg, isXl, is2xl }
}

/**
 * Apply breakpoint classes to root element (mobile-first cascading)
 */
function applyBreakpointClasses(screen: ScreenContextValue) {
    // Remove all breakpoint classes first
    __root.RemoveFromClassList("sm")
    __root.RemoveFromClassList("md")
    __root.RemoveFromClassList("lg")
    __root.RemoveFromClassList("xl")
    __root.RemoveFromClassList("2xl")

    // Mobile-first: apply ALL matching breakpoints, not just highest
    if (screen.isSm) __root.AddToClassList("sm")
    if (screen.isMd) __root.AddToClassList("md")
    if (screen.isLg) __root.AddToClassList("lg")
    if (screen.isXl) __root.AddToClassList("xl")
    if (screen.is2xl) __root.AddToClassList("2xl")
}

export interface ScreenProviderProps {
    children: ReactNode
    /** Custom breakpoints (optional) */
    breakpoints?: Partial<typeof BREAKPOINTS>
}

/**
 * Provider component for responsive screen context.
 *
 * Wrap your app with this to enable responsive hooks.
 *
 * @example
 * ```tsx
 * render(
 *   <ScreenProvider>
 *     <App />
 *   </ScreenProvider>,
 *   __root
 * )
 * ```
 */
export function ScreenProvider({ children }: ScreenProviderProps) {
    // Initialize with current viewport size
    const [screen, setScreen] = useState<ScreenContextValue>(() => {
        const width = __root.resolvedStyle?.width || 0
        const height = __root.resolvedStyle?.height || 0
        return calculateBreakpoints(width, height)
    })

    useEffect(() => {
        // Apply initial breakpoint classes
        applyBreakpointClasses(screen)

        // Handle viewport change events from C#
        const handleViewportChange = (evt: { width: number; height: number }) => {
            const newScreen = calculateBreakpoints(evt.width, evt.height)
            setScreen(newScreen)
            applyBreakpointClasses(newScreen)
        }

        // Listen for viewport changes on root element
        __eventAPI.addEventListener(__root, "viewportchange", handleViewportChange)

        return () => {
            __eventAPI.removeEventListener(__root, "viewportchange", handleViewportChange)
        }
    }, [])

    return (
        <ScreenContext.Provider value={screen}>
            {children}
        </ScreenContext.Provider>
    )
}

/**
 * Hook to get the current breakpoint name.
 *
 * @example
 * ```tsx
 * function Component() {
 *   const breakpoint = useBreakpoint()
 *   return <Label text={`Current: ${breakpoint}`} />
 * }
 * ```
 */
export function useBreakpoint(): BreakpointName {
    const ctx = useContext(ScreenContext)
    if (!ctx) {
        throw new Error("useBreakpoint must be used within ScreenProvider")
    }
    return ctx.breakpoint
}

/**
 * Hook to get the current viewport size.
 *
 * @example
 * ```tsx
 * function Component() {
 *   const { width, height } = useScreenSize()
 *   return <Label text={`${width}x${height}`} />
 * }
 * ```
 */
export function useScreenSize(): { width: number; height: number } {
    const ctx = useContext(ScreenContext)
    if (!ctx) {
        throw new Error("useScreenSize must be used within ScreenProvider")
    }
    return { width: ctx.width, height: ctx.height }
}

/**
 * Hook to get all responsive state.
 *
 * @example
 * ```tsx
 * function Component() {
 *   const { isMd, isLg, breakpoint } = useResponsive()
 *   return (
 *     <View>
 *       {isLg && <Sidebar />}
 *       <Content />
 *     </View>
 *   )
 * }
 * ```
 */
export function useResponsive(): ScreenContextValue {
    const ctx = useContext(ScreenContext)
    if (!ctx) {
        throw new Error("useResponsive must be used within ScreenProvider")
    }
    return ctx
}

/**
 * Hook to check if a specific breakpoint is active.
 *
 * @example
 * ```tsx
 * function Component() {
 *   const isDesktop = useMediaQuery("lg")
 *   return isDesktop ? <DesktopLayout /> : <MobileLayout />
 * }
 * ```
 */
export function useMediaQuery(breakpoint: keyof typeof BREAKPOINTS): boolean {
    const ctx = useContext(ScreenContext)
    if (!ctx) {
        throw new Error("useMediaQuery must be used within ScreenProvider")
    }

    switch (breakpoint) {
        case "sm": return ctx.isSm
        case "md": return ctx.isMd
        case "lg": return ctx.isLg
        case "xl": return ctx.isXl
        case "2xl": return ctx.is2xl
        default: return false
    }
}
