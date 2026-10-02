import { Component, type ReactNode, type ErrorInfo } from "react"
import { View, Label } from "./components"

/** What `fallbackRender` receives. */
export interface FallbackProps {
    /** The error a descendant threw. */
    error: Error
    /**
     * React's details about the throw, including `componentStack`. Null on the
     * first fallback render: React renders the fallback before it hands the
     * boundary this object, then renders again once it has.
     */
    errorInfo: ErrorInfo | null
    /** Clear the error and render the children again. */
    reset: () => void
}

/** Why the boundary reset, as `onReset` receives it. */
export type ErrorBoundaryResetDetails =
    | { reason: "imperative-api" }
    | { reason: "keys"; prev: readonly unknown[]; next: readonly unknown[] }

export interface ErrorBoundaryProps {
    children?: ReactNode
    /**
     * Render this instead of the children after one of them throws. Call
     * `reset` to try the children again, typically from a retry button.
     *
     * @example
     * <ErrorBoundary fallbackRender={({ error, reset }) => (
     *     <Button text={`${error.message}: retry`} onClick={reset} />
     * )}>
     */
    fallbackRender?: (props: FallbackProps) => ReactNode
    /**
     * When any entry changes (compared with `Object.is`), a boundary showing
     * its fallback resets and renders the children again. Pass what the
     * failure depended on, such as the level or the item id.
     */
    resetKeys?: readonly unknown[]
    /**
     * @deprecated Use `fallbackRender`, which also receives `reset`. A node
     * still renders as is; a function still receives `(error, errorInfo)`,
     * with `errorInfo` null on the first fallback render.
     */
    fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo | null) => ReactNode)
    /** Called once per caught error, for reporting. The runtime already logs it. */
    onError?: (error: Error, errorInfo: ErrorInfo) => void
    /** Called after the boundary resets, from `reset` or from a changed `resetKeys`. */
    onReset?: (details: ErrorBoundaryResetDetails) => void
}

interface ErrorBoundaryState {
    error: Error | null
    errorInfo: ErrorInfo | null
}

const cleared: ErrorBoundaryState = { error: null, errorInfo: null }

function keysChanged(prev: readonly unknown[] = [], next: readonly unknown[] = []): boolean {
    return prev.length !== next.length || prev.some((key, i) => !Object.is(key, next[i]))
}

/**
 * Catches errors thrown while rendering its children and shows a fallback
 * instead of unmounting the whole tree. Each caught error is logged once, by
 * the root (see `render`).
 *
 * @example Retry from the fallback
 * ```tsx
 * <ErrorBoundary fallbackRender={({ error, reset }) => (
 *     <View>
 *         <Label text={error.message} />
 *         <Button text="Retry" onClick={reset} />
 *     </View>
 * )}>
 *     <Inventory />
 * </ErrorBoundary>
 * ```
 *
 * @example Start over when the input changes
 * ```tsx
 * <ErrorBoundary resetKeys={[levelId]} fallbackRender={() => <Label text="Level failed to load" />}>
 *     <Level id={levelId} />
 * </ErrorBoundary>
 * ```
 *
 * With neither `fallbackRender` nor `fallback`, a red panel shows the message.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = cleared

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { error, errorInfo: null }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // No logging here: the root's onCaughtError (renderer.ts) logs every
        // caught error once, for this boundary and for any other.
        this.setState({ errorInfo })
        this.props.onError?.(error, errorInfo)
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
        // Only a boundary that was already showing its fallback resets. The
        // update that catches the error can carry new keys too, and resetting
        // then would rethrow straight away.
        if (prevState.error === null || this.state.error === null) return
        if (!keysChanged(prevProps.resetKeys, this.props.resetKeys)) return
        this.setState(cleared)
        this.props.onReset?.({ reason: "keys", prev: prevProps.resetKeys ?? [], next: this.props.resetKeys ?? [] })
    }

    /**
     * Clear the error and render the children again. `fallbackRender` receives
     * this as `reset`, which is the way to call it.
     */
    reset = (): void => {
        if (this.state.error === null) return
        this.setState(cleared)
        this.props.onReset?.({ reason: "imperative-api" })
    }

    render(): ReactNode {
        const { error, errorInfo } = this.state
        if (error === null) return this.props.children

        const { fallbackRender, fallback } = this.props
        if (fallbackRender) return fallbackRender({ error, errorInfo, reset: this.reset })
        if (typeof fallback === "function") return fallback(error, errorInfo)
        if (fallback !== undefined) return fallback

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
                    {error.message || "Unknown error"}
                </Label>
            </View>
        )
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
