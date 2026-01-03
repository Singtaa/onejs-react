import { Component, type ReactNode, type ErrorInfo } from "react"
import { View, Label } from "./components"

declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }

export interface ErrorBoundaryProps {
    children: ReactNode
    /**
     * Optional fallback to render when an error occurs.
     * Can be a ReactNode or a function that receives error details.
     */
    fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode)
    /**
     * Optional callback when an error is caught.
     * Use this for logging or error reporting.
     */
    onError?: (error: Error, errorInfo: ErrorInfo) => void
    /**
     * Optional callback when the boundary resets.
     */
    onReset?: () => void
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
}

/**
 * Error boundary component for catching and displaying React errors.
 *
 * @example Basic usage with default fallback
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example Custom fallback UI
 * ```tsx
 * <ErrorBoundary fallback={<Label>Something went wrong</Label>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example Fallback function with error details
 * ```tsx
 * <ErrorBoundary
 *   fallback={(error, info) => (
 *     <View>
 *       <Label>Error: {error.message}</Label>
 *       <Label>Stack: {info.componentStack}</Label>
 *     </View>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example Error logging
 * ```tsx
 * <ErrorBoundary onError={(error, info) => logError(error, info)}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        }
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo })

        // Log to console with helpful formatting
        console.error("[OneJS React] Error caught by ErrorBoundary:")
        console.error("  Error:", error.message)
        if (error.stack) {
            console.error("  Stack:", error.stack)
        }
        if (errorInfo.componentStack) {
            console.error("  Component Stack:", errorInfo.componentStack)
        }

        // Call user-provided error handler
        this.props.onError?.(error, errorInfo)
    }

    /**
     * Reset the error boundary to try rendering children again.
     * Useful after the underlying issue has been fixed.
     */
    reset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        })
        this.props.onReset?.()
    }

    render(): ReactNode {
        if (this.state.hasError) {
            const { fallback } = this.props
            const { error, errorInfo } = this.state

            // Render custom fallback if provided
            if (fallback !== undefined) {
                if (typeof fallback === "function") {
                    return fallback(error!, errorInfo!)
                }
                return fallback
            }

            // Default fallback UI
            return (
                <View style={{
                    padding: 16,
                    backgroundColor: "#2d1b1b",
                    borderColor: "#ff4444",
                    borderWidth: 2,
                }}>
                    <Label style={{
                        color: "#ff6666",
                        fontSize: 16,
                        marginBottom: 8,
                    }}>
                        Something went wrong
                    </Label>
                    <Label style={{
                        color: "#ffaaaa",
                        fontSize: 12,
                    }}>
                        {error?.message || "Unknown error"}
                    </Label>
                </View>
            )
        }

        return this.props.children
    }
}

/**
 * Helper hook-style error info for functional components.
 * Note: This is a simple utility. For actual error catching,
 * you must use the ErrorBoundary class component.
 */
export function formatError(error: Error, componentStack?: string): string {
    const parts = [`Error: ${error.message}`]

    if (error.stack) {
        // Get first few lines of stack
        const stackLines = error.stack.split("\n").slice(0, 5)
        parts.push(`Stack:\n${stackLines.join("\n")}`)
    }

    if (componentStack) {
        // Get first few lines of component stack
        const compLines = componentStack.split("\n").slice(0, 5)
        parts.push(`Component:\n${compLines.join("\n")}`)
    }

    return parts.join("\n\n")
}
