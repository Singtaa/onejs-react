/**
 * The <Image> cache creates Texture2Ds and VectorImages that nothing else
 * owns. On teardown (hot reload, stop) they are destroyed, after the React
 * tree that showed them has unmounted, so an edit-mode save no longer leaks
 * one decoded copy of every image.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { render } from "../renderer"
import { Image } from "../components"
import { createMockContainer, flushMicrotasks, mockFileSystem, mockUrlAssets, MockTexture2D, MockVectorImage } from "./mocks"

// The renderer registers its teardown once per module instance, on the first
// render that finds the bootstrap's __onTeardown. This file owns that first
// render, so the hook is installed here and kept for every test.
const hooks: Array<() => void> = []
;(globalThis as any).__onTeardown = (cb: () => void) => { if (!hooks.includes(cb)) hooks.push(cb) }

/** What QuickJSUIBridge.Dispose does: run every hook, last registered first. */
function runTeardown() {
    while (hooks.length > 0) hooks.pop()!()
}

let destroy: ReturnType<typeof vi.fn>
let destroyImmediate: ReturnType<typeof vi.fn>

beforeEach(() => {
    const UE = (globalThis as any).CS.UnityEngine
    destroy = vi.fn()
    destroyImmediate = vi.fn()
    UE.Object = { Destroy: destroy, DestroyImmediate: destroyImmediate }
    ;(globalThis as any).__workingDir = "/project/App"
    mockFileSystem.set("/project/App/assets/logo.png", [0x89, 0x50, 0x4e, 0x47])
    mockFileSystem.set("/project/App/assets/icon.svg", "<svg/>")
})

function imageOf(container: { children: readonly unknown[] }, index: number): unknown {
    return (container.children[index] as { image?: unknown }).image
}

async function mountImages() {
    const container = createMockContainer()
    render(<><Image src="logo.png" /><Image src="icon.svg" /><Image src="logo.png" /></>, container as any)
    await flushMicrotasks()
    return container
}

describe("the <Image> cache on teardown", () => {
    it("destroys each cached asset once, in edit mode with DestroyImmediate, after the tree unmounts", async () => {
        ;(globalThis as any).CS.UnityEngine.Application.isPlaying = false
        const container = await mountImages()
        const texture = imageOf(container, 0)
        expect(texture).toBeInstanceOf(MockTexture2D)
        expect(imageOf(container, 2)).toBe(texture)

        let childrenAtDestroy = -1
        destroyImmediate.mockImplementation(() => { childrenAtDestroy = container.childCount })
        runTeardown()

        expect(destroyImmediate).toHaveBeenCalledTimes(2)
        expect(destroyImmediate).toHaveBeenCalledWith(texture)
        expect(destroyImmediate.mock.calls.some(([asset]) => asset instanceof MockVectorImage)).toBe(true)
        expect(destroy).not.toHaveBeenCalled()
        expect(childrenAtDestroy).toBe(0)
    })

    it("uses Destroy in play mode, and decodes afresh after teardown", async () => {
        ;(globalThis as any).CS.UnityEngine.Application.isPlaying = true
        const first = await mountImages()
        const before = imageOf(first, 0)
        runTeardown()
        expect(destroy).toHaveBeenCalledWith(before)
        expect(destroyImmediate).not.toHaveBeenCalled()

        const second = await mountImages()
        expect(imageOf(second, 0)).toBeInstanceOf(MockTexture2D)
        expect(imageOf(second, 0)).not.toBe(before)
        runTeardown()
    })

    it("destroys a texture whose download lands after teardown instead of caching it", async () => {
        ;(globalThis as any).CS.UnityEngine.Application.isPlaying = true
        const app = (globalThis as any).CS.UnityEngine.Application
        app.isEditor = false
        app.streamingAssetsPath = "https://cdn.example/sa"
        mockUrlAssets.set("https://cdn.example/sa/onejs/assets/late.png", [0x89])

        let land: () => void = () => {}
        const network = (globalThis as any).CS.OneJS.Network
        const load = network.LoadTextureFromUrl
        network.LoadTextureFromUrl = (url: string) => new Promise(resolve => { land = () => resolve(load(url)) })

        const container = createMockContainer()
        render(<Image src="late.png" />, container as any)
        await flushMicrotasks()
        runTeardown()

        land()
        await flushMicrotasks()
        expect(destroy).toHaveBeenCalledTimes(1)
        expect(destroy.mock.calls[0][0]).toBeInstanceOf(MockTexture2D)
    })
})
