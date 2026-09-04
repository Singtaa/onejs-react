import { describe, it, expect } from "vitest"
import React from "react"
import { ScreenProvider, useBreakpoint, useScreenSize } from "../screen"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

/**
 * A provider handed a size follows it instead of the panel root.
 *
 * OneJS Play fits a game into a stage inside the window, so the breakpoints a
 * game reads have to describe the stage. There is no panel root at all in this
 * harness, which is also the case the guards in the provider exist for.
 */
describe("ScreenProvider with a controlled size", () => {
    function Probe({ seen }: { seen: { bp?: string; w?: number } }) {
        seen.bp = useBreakpoint()
        seen.w = useScreenSize().width
        return null
    }

    it("derives the breakpoint from the size it is given", async () => {
        const seen: { bp?: string; w?: number } = {}
        const container = createMockContainer()
        render(
            <ScreenProvider size={{ width: 960, height: 540 }}>
                <Probe seen={seen} />
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        expect(seen.bp).toBe("md")
        expect(seen.w).toBe(960)
        unmount(container as any)
    })

    it("follows the size when it changes", async () => {
        const seen: { bp?: string; w?: number } = {}
        const container = createMockContainer()
        const tree = (width: number) => (
            <ScreenProvider size={{ width, height: 540 }}>
                <Probe seen={seen} />
            </ScreenProvider>
        )
        render(tree(400), container as any)
        await flushMicrotasks()
        expect(seen.bp).toBe("base")
        render(tree(1300), container as any)
        await flushMicrotasks()
        expect(seen.bp).toBe("xl")
        unmount(container as any)
    })

    it("installs no viewport listener when controlled", async () => {
        const container = createMockContainer()
        render(
            <ScreenProvider size={{ width: 800, height: 600 }}>
                <Probe seen={{}} />
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        const api = (globalThis as any).__eventAPI
        const viewportCalls = api.addEventListener.mock.calls.filter((c: unknown[]) => c[1] === "viewportchange")
        expect(viewportCalls).toHaveLength(0)
        unmount(container as any)
    })
})
