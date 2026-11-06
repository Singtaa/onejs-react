import { describe, it, expect, beforeEach } from "vitest"
import React from "react"
import { render, unmount } from "../renderer"
import { ShaderProgram, View } from "../components"
import { usePass } from "../pass"
import { LENT_TEXTURE, type LentTexture } from "../shader-props"
import { MockShaderPass, MockShaderEffectElement, createMockContainer, flushMicrotasks } from "./mocks"
import type { CompiledProgram } from "../types"

/**
 * A lent texture (ojplay's `scene.texture`): borrowed by the first program or
 * pass that reads it, given back by each one that stops, so the lender knows
 * when nothing reads it and can stop drawing it.
 */

const grade: CompiledProgram = { hash: "grade", uniforms: [], textures: ["scene"] }
const tint: CompiledProgram = { hash: "tint", uniforms: [], textures: ["scene"] }

function lender() {
    const texture = { name: "scene texture" }
    const counts = { acquired: 0, released: 0 }
    const source: LentTexture & { counts: typeof counts, texture: typeof texture } = {
        [LENT_TEXTURE]: true,
        acquire() { counts.acquired++; return texture },
        release() { counts.released++ },
        counts,
        texture,
    }
    return source
}

function mount(node: React.ReactElement) {
    const container = createMockContainer()
    render(node, container as any)
    return container
}

let scene: ReturnType<typeof lender>
beforeEach(() => {
    scene = lender()
    MockShaderPass.made = []
})

describe("a lent texture", () => {
    it("is borrowed once by a program that reads it, however often it renders, and bound at its slot", async () => {
        function App({ n }: { n: number }) {
            return <ShaderProgram program={grade} textures={{ scene }} style={{ width: n }} />
        }
        const container = mount(<App n={1} />)
        await flushMicrotasks()
        const reader = container.children[0] as unknown as MockShaderEffectElement
        expect(reader.SetProgramTexture).toHaveBeenCalledWith(0, scene.texture)
        render(<App n={2} />, container as any)
        render(<App n={3} />, container as any)
        await flushMicrotasks()
        expect(scene.counts).toEqual({ acquired: 1, released: 0 })
        expect(reader.SetProgramTexture).toHaveBeenCalledTimes(1)
    })

    it("is given back when the program stops reading it", async () => {
        function App({ reads }: { reads: boolean }) {
            return <ShaderProgram program={grade} textures={reads ? { scene } : { scene: "noise" }} />
        }
        const container = mount(<App reads />)
        await flushMicrotasks()
        render(<App reads={false} />, container as any)
        await flushMicrotasks()
        expect(scene.counts).toEqual({ acquired: 1, released: 1 })
    })

    it("is given back when its textures go altogether", async () => {
        function App({ reads }: { reads: boolean }) {
            return <ShaderProgram program={grade} textures={reads ? { scene } : undefined} />
        }
        const container = mount(<App reads />)
        await flushMicrotasks()
        render(<App reads={false} />, container as any)
        await flushMicrotasks()
        expect(scene.counts.released).toBe(1)
    })

    it("is given back by a program deep inside a tree that unmounts, not only the top of it", async () => {
        function Screen() {
            return <View><View><ShaderProgram program={grade} textures={{ scene }} /></View></View>
        }
        function App({ open }: { open: boolean }) {
            return <View>{open ? <Screen /> : null}</View>
        }
        const container = mount(<App open />)
        await flushMicrotasks()
        expect(scene.counts.acquired).toBe(1)
        render(<App open={false} />, container as any)
        await flushMicrotasks()
        expect(scene.counts).toEqual({ acquired: 1, released: 1 })
    })

    it("is bound again for a new program without being borrowed again", async () => {
        function App({ program }: { program: CompiledProgram }) {
            return <ShaderProgram program={program} textures={{ scene }} />
        }
        const container = mount(<App program={grade} />)
        await flushMicrotasks()
        render(<App program={tint} />, container as any)
        await flushMicrotasks()
        const reader = container.children[0] as unknown as MockShaderEffectElement
        expect(reader.SetProgramTexture).toHaveBeenCalledTimes(2)
        expect(scene.counts).toEqual({ acquired: 1, released: 0 })
    })

    it("is borrowed by each reader, so the lender counts them, and given back by each", async () => {
        function App({ both }: { both: boolean }) {
            return <View>
                <ShaderProgram program={grade} textures={{ scene }} />
                {both ? <ShaderProgram program={tint} textures={{ scene }} /> : null}
            </View>
        }
        const container = mount(<App both />)
        await flushMicrotasks()
        expect(scene.counts.acquired).toBe(2)
        render(<App both={false} />, container as any)
        await flushMicrotasks()
        expect(scene.counts).toEqual({ acquired: 2, released: 1 })
        unmount(container as any)
        await flushMicrotasks()
        expect(scene.counts.released).toBe(2)
    })

    it("is given back by a pass that read it when the pass goes", async () => {
        function Reader() {
            usePass(grade, { textures: { scene } })
            return null
        }
        function App({ open }: { open: boolean }) {
            return open ? <Reader /> : null
        }
        const container = mount(<App open />)
        await flushMicrotasks()
        expect(MockShaderPass.made[0]!.SetProgramTexture).toHaveBeenCalledWith(0, scene.texture)
        render(<App open={false} />, container as any)
        await flushMicrotasks()
        expect(scene.counts).toEqual({ acquired: 1, released: 1 })
    })
})
