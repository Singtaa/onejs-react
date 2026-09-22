import { describe, it, expect, afterEach } from "vitest"
import React from "react"
import { ScreenProvider, useBreakpoint, useScreenSize } from "../screen"
import { render, unmount } from "../renderer"
import { createMockContainer, flushMicrotasks } from "./mocks"

/**
 * A provider handed a size follows it instead of the panel root.
 *
 * OJPlay fits a game into a stage inside the window, so the breakpoints a
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

/**
 * A provider nested inside another follows it rather than the panel.
 *
 * The trap this closes: OJPlay's mount() wraps a game in a stage-sized
 * provider, and the OneJS Tailwind guide tells every OneJS user to wrap their
 * app in a <ScreenProvider>. A game doing both used to get the panel reading
 * back, silently. Measured against the real container at runtime 1.0.42, in a
 * 960x540 letterboxed game at a 1600x400 window: md without the inner
 * provider, 2xl with it, and the root's breakpoint classes went with it, so
 * Tailwind's lg: and xl: prefixes flipped with the window while nothing else
 * in the layout moved. See OneJS issue #113.
 *
 * The panel here is 2160 wide for that reason: it is the number that game's
 * panel root actually reports, and it is the answer a provider that measured
 * instead of inheriting would give.
 */
describe("a nested ScreenProvider", () => {
    const classes = new Set<string>()

    function installPanel(width: number, height: number) {
        classes.clear()
        ;(globalThis as any).__root = {
            __csHandle: 1,
            resolvedStyle: { width, height },
            AddToClassList: (c: string) => classes.add(c),
            RemoveFromClassList: (c: string) => classes.delete(c),
        }
    }

    afterEach(() => { delete (globalThis as any).__root })

    function Probe({ seen }: { seen: { bp?: string; w?: number } }) {
        seen.bp = useBreakpoint()
        seen.w = useScreenSize().width
        return null
    }

    it("follows the outer size instead of measuring the panel again", async () => {
        installPanel(2160, 540)
        const seen: { bp?: string; w?: number } = {}
        const container = createMockContainer()
        render(
            <ScreenProvider size={{ width: 960, height: 540 }}>
                <ScreenProvider>
                    <Probe seen={seen} />
                </ScreenProvider>
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        expect(seen.bp).toBe("md")
        expect(seen.w).toBe(960)
        // The Tailwind half: .lg .lg_c_p-8 is an ancestor selector, so these
        // classes on the root are what a breakpoint prefix actually resolves
        // against. Measuring the 2160-wide panel would add lg, xl and 2xl.
        expect([...classes].sort()).toEqual(["md", "sm"])
        unmount(container as any)
    })

    it("installs no viewport listener, since the outer provider is the update path", async () => {
        installPanel(2160, 540)
        const container = createMockContainer()
        render(
            <ScreenProvider size={{ width: 960, height: 540 }}>
                <ScreenProvider>
                    <Probe seen={{}} />
                </ScreenProvider>
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        const api = (globalThis as any).__eventAPI
        const viewportCalls = api.addEventListener.mock.calls.filter((c: unknown[]) => c[1] === "viewportchange")
        expect(viewportCalls).toHaveLength(0)
        unmount(container as any)
    })

    it("still lets an inner size win, so a real sub-box can say so", async () => {
        installPanel(2160, 540)
        const seen: { bp?: string; w?: number } = {}
        const container = createMockContainer()
        render(
            <ScreenProvider size={{ width: 960, height: 540 }}>
                <ScreenProvider size={{ width: 400, height: 300 }}>
                    <Probe seen={seen} />
                </ScreenProvider>
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        expect(seen.bp).toBe("base")
        expect(seen.w).toBe(400)
        unmount(container as any)
    })

    it("measures the panel when there is no outer provider, as it always did", async () => {
        installPanel(2160, 540)
        const seen: { bp?: string; w?: number } = {}
        const container = createMockContainer()
        render(
            <ScreenProvider>
                <Probe seen={seen} />
            </ScreenProvider>,
            container as any,
        )
        await flushMicrotasks()
        expect(seen.bp).toBe("2xl")
        expect(seen.w).toBe(2160)
        const api = (globalThis as any).__eventAPI
        const viewportCalls = api.addEventListener.mock.calls.filter((c: unknown[]) => c[1] === "viewportchange")
        expect(viewportCalls).toHaveLength(1)
        unmount(container as any)
    })
})
