/**
 * ErrorBoundary: fallbackRender with reset, resetKeys, the deprecated fallback
 * forms, and one log per caught error.
 */

import { describe, it, expect, vi } from "vitest"
import React, { useState } from "react"
import { render, unmount } from "../renderer"
import { Label } from "../components"
import { ErrorBoundary, type FallbackProps } from "../error-boundary"
import { createMockContainer, flushMicrotasks, getCreatedElements, type MockVisualElement } from "./mocks"

function labels(): string[] {
    return getCreatedElements()
        .filter(el => el.__csType === "UnityEngine.UIElements.Label")
        .filter(el => isAttached(el))
        .map(el => el.text)
}

function isAttached(el: MockVisualElement): boolean {
    let node: any = el
    while (node) {
        if (node.__csType === "Container") return true
        node = node._parent
    }
    return false
}

let broken = true
function Fragile() {
    if (broken) throw new Error("boom")
    return <Label text="healthy" />
}

describe("ErrorBoundary", () => {
    it("renders fallbackRender with the error and a reset that retries the children", async () => {
        broken = true
        const container = createMockContainer()
        let captured: FallbackProps | null = null
        render(
            <ErrorBoundary fallbackRender={(p) => { captured = p; return <Label text={`failed: ${p.error.message}`} /> }}>
                <Fragile />
            </ErrorBoundary>,
            container as any,
        )
        await flushMicrotasks()

        expect(labels()).toEqual(["failed: boom"])
        expect(captured!.error.message).toBe("boom")

        broken = false
        captured!.reset()
        await flushMicrotasks()
        expect(labels()).toEqual(["healthy"])
        unmount(container as any)
    })

    it("types errorInfo as nullable: the first fallback render has none yet", async () => {
        broken = true
        const container = createMockContainer()
        const seen: Array<FallbackProps["errorInfo"]> = []
        render(
            <ErrorBoundary fallbackRender={({ errorInfo }) => { seen.push(errorInfo); return null }}>
                <Fragile />
            </ErrorBoundary>,
            container as any,
        )
        await flushMicrotasks()
        expect(seen[0]).toBeNull()
        expect(seen[seen.length - 1]?.componentStack).toBeTypeOf("string")
        unmount(container as any)
    })

    it("resets when a resetKeys entry changes", async () => {
        broken = true
        const container = createMockContainer()
        let setLevel: (n: number) => void = () => {}
        const onReset = vi.fn()
        function Game() {
            const [level, set] = useState(1)
            setLevel = set
            return (
                <ErrorBoundary resetKeys={[level]} onReset={onReset} fallbackRender={() => <Label text="fallback" />}>
                    <Fragile />
                </ErrorBoundary>
            )
        }
        render(<Game />, container as any)
        await flushMicrotasks()
        expect(labels()).toEqual(["fallback"])

        broken = false
        setLevel(2)
        await flushMicrotasks()
        expect(labels()).toEqual(["healthy"])
        expect(onReset).toHaveBeenCalledWith({ reason: "keys", prev: [1], next: [2] })
        unmount(container as any)
    })

    it("does not reset on a rerender whose resetKeys are equal", async () => {
        broken = true
        const container = createMockContainer()
        let bump: () => void = () => {}
        function Game() {
            const [, set] = useState(0)
            bump = () => set(n => n + 1)
            return (
                <ErrorBoundary resetKeys={["same"]} fallbackRender={() => <Label text="fallback" />}>
                    <Fragile />
                </ErrorBoundary>
            )
        }
        render(<Game />, container as any)
        await flushMicrotasks()
        broken = false
        bump()
        await flushMicrotasks()
        expect(labels()).toEqual(["fallback"])
        unmount(container as any)
    })

    it("still accepts the deprecated fallback node and function", async () => {
        broken = true
        const a = createMockContainer()
        render(<ErrorBoundary fallback={<Label text="node" />}><Fragile /></ErrorBoundary>, a as any)
        const b = createMockContainer()
        render(<ErrorBoundary fallback={(error) => <Label text={`fn: ${error.message}`} />}><Fragile /></ErrorBoundary>, b as any)
        await flushMicrotasks()
        expect(labels().sort()).toEqual(["fn: boom", "node"])
        unmount(a as any)
        unmount(b as any)
    })

    it("logs each caught error once, with its stack and component stack, and calls onError", async () => {
        broken = true
        const container = createMockContainer()
        const onError = vi.fn()
        render(
            <ErrorBoundary onError={onError} fallbackRender={() => null}>
                <Fragile />
            </ErrorBoundary>,
            container as any,
        )
        await flushMicrotasks()
        const errors = (console.error as any).mock.calls
        expect(errors).toHaveLength(1)
        const line = errors[0].join(" ")
        expect(line).toContain("boom")
        expect(line).toContain("Component stack")
        expect(line).toContain("Fragile")
        expect(onError).toHaveBeenCalledTimes(1)
        unmount(container as any)
    })
})
