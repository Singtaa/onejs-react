/**
 * Responsive design system for OneJS
 *
 * Provides React context and hooks for responsive breakpoints.
 * Uses event-driven updates via GeometryChangedEvent (not polling).
 *
 * Mobile-first: At 1400px width, sm/md/lg/xl are all active (not just xl).
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

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
    // No panel root outside a OneJS context (a unit test, a server render).
    if (typeof __root === "undefined") return
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
    /**
     * The size to derive breakpoints from, instead of the panel root's.
     *
     * A host that fits the app into a box of its own (OneJS Play's stage, a
     * game laid out at 960 by 540 inside whatever window it got) wants the
     * breakpoints to describe that box, not the panel around it. With this
     * set, no viewport listener is installed and the provider follows the
     * prop.
     */
    size?: { width: number; height: number }
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
export function ScreenProvider({ children, size }: ScreenProviderProps) {
    // Initialize with current viewport size
    const [measured, setMeasured] = useState<ScreenContextValue>(() => {
        const root = typeof __root === "undefined" ? undefined : __root
        const width = root?.resolvedStyle?.width || 0
        const height = root?.resolvedStyle?.height || 0
        return calculateBreakpoints(width, height)
    })
    const screen = size ? calculateBreakpoints(size.width, size.height) : measured

    useEffect(() => {
        // Apply initial breakpoint classes
        applyBreakpointClasses(screen)
        // A controlled size has no viewport to listen to; the effect above
        // reruns when the prop changes and that is the whole update path.
        if (size) return

        // Handle viewport change events from C#
        const handleViewportChange = (evt: { width: number; height: number }) => {
            const newScreen = calculateBreakpoints(evt.width, evt.height)
            setMeasured(newScreen)
            applyBreakpointClasses(newScreen)
        }

        // Listen for viewport changes on root element
        __eventAPI.addEventListener(__root, "viewportchange", handleViewportChange)

        return () => {
            __eventAPI.removeEventListener(__root, "viewportchange", handleViewportChange)
        }
        // A controlled size reapplies its classes when it changes; the
        // measured path listens once and never needs to rerun.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size?.width, size?.height])

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
