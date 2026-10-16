import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { render, unmount } from "../renderer"
import { ShaderProgram } from "../components"
import { usePass, Pass, type PassOptions } from "../pass"
import { MockShaderPass, MockShaderEffectElement, createMockContainer, flushMicrotasks } from "./mocks"
import type { CompiledProgram } from "../types"

/**
 * usePass: a program drawn into a texture every frame, which another program
 * reads through a texture2D it declares. The ordering, the sizing and the
 * drawing are C#'s (ShaderPass.cs); these hold what crosses to it.
 */

const prog = (hash: string, uniforms: string[] = [], textures: string[] = []): CompiledProgram =>
    ({ hash, uniforms, textures })

const scene = prog("scene", ["glow"])
const blur = prog("blur", [], ["src"])
const composite = prog("composite", [], ["scene", "glow"])

function mount(node: React.ReactElement) {
    const container = createMockContainer()
    render(node, container as any)
    return container
}

describe("usePass", () => {
    beforeEach(() => { MockShaderPass.made = [] })

    it("makes one pass for the life of the component, sets what changed, and disposes it on unmount", async () => {
        let seen: Pass | null = null
        function App({ glow }: { glow: number }) {
            seen = usePass(scene, { uniforms: { glow } })
            return null
        }
        const container = mount(<App glow={0.5} />)
        await flushMicrotasks()
        expect(MockShaderPass.made).toHaveLength(1)
        const pass = MockShaderPass.made[0]!
        const first = seen
        expect(pass.SetProgram).toHaveBeenCalledTimes(1)
        expect(pass.SetProgram.mock.calls[0]![3]).toBe("scene")
        expect(pass.SetUniform).toHaveBeenLastCalledWith(0, 0.5, 0, 0, 0)

        render(<App glow={0.75} />, container as any)
        await flushMicrotasks()
        expect(MockShaderPass.made).toHaveLength(1)
        expect(seen).toBe(first)
        expect(pass.SetProgram).toHaveBeenCalledTimes(1)
        expect(pass.SetUniform).toHaveBeenLastCalledWith(0, 0.75, 0, 0, 0)

        expect(pass.Dispose).not.toHaveBeenCalled()
        unmount(container as any)
        await flushMicrotasks()
        expect(pass.Dispose).toHaveBeenCalledTimes(1)
    })

    it("is read through the texture2D a program declares, and bound once", async () => {
        function App({ n }: { n: number }) {
            const s = usePass(scene)
            const glow = usePass(blur, { textures: { src: s } })
            return <ShaderProgram program={composite} textures={{ scene: s, glow }} style={{ width: n }} />
        }
        const container = mount(<App n={10} />)
        await flushMicrotasks()
        const [s, glow] = MockShaderPass.made
        const reader = container.children[0] as unknown as MockShaderEffectElement
        // A pass reading a pass, and an element reading both, by slot.
        expect(glow!.SetProgramPass).toHaveBeenCalledWith(0, s)
        expect(reader.SetProgramPass).toHaveBeenCalledWith(0, s)
        expect(reader.SetProgramPass).toHaveBeenCalledWith(1, glow)
        expect(reader.SetProgramTexture).not.toHaveBeenCalled()

        // The same passes on the next render cross nothing again.
        render(<App n={20} />, container as any)
        await flushMicrotasks()
        expect(reader.SetProgramPass).toHaveBeenCalledTimes(2)
        expect(glow!.SetProgramPass).toHaveBeenCalledTimes(1)
    })

    it("follows what reads it unless given a size, and takes a scale", async () => {
        function App(o: PassOptions) {
            usePass(scene, o)
            return null
        }
        const container = mount(<App scale={0.5} />)
        await flushMicrotasks()
        const pass = MockShaderPass.made[0]!
        expect(pass.Scale).toBe(0.5)
        expect(pass.SetResolution).not.toHaveBeenCalled()

        render(<App resolution={[64, 32]} />, container as any)
        await flushMicrotasks()
        expect(pass.SetResolution).toHaveBeenLastCalledWith(64, 32)
        // Removing scale is a scale of 1 again.
        expect(pass.Scale).toBe(1)

        render(<App />, container as any)
        await flushMicrotasks()
        expect(pass.SetResolution).toHaveBeenLastCalledWith(0, 0)
    })

    it("says once that a OneJS before 3.9.11 has no passes, and the program still draws", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const cs = (globalThis as any).CS.OneJS.ShaderFX
        const saved = cs.ShaderPass
        try {
            delete cs.ShaderPass
            MockShaderEffectElement.readsPasses = false
            function App() {
                const s = usePass(scene)
                return <ShaderProgram program={composite} textures={{ scene: s }} />
            }
            const container = mount(<><App /><App /></>)
            await flushMicrotasks()
            const reader = container.children[0] as unknown as MockShaderEffectElement
            expect(reader.SetProgram).toHaveBeenCalledTimes(1)
            expect(reader.SetProgramPass).not.toHaveBeenCalled()
            const lines = error.mock.calls.filter((c) => String(c[0]).includes("usePass"))
            expect(lines).toHaveLength(1)
            expect(String(lines[0]![0])).toContain("OneJS 3.9.11")
        } finally {
            cs.ShaderPass = saved
            MockShaderEffectElement.readsPasses = true
            error.mockRestore()
        }
    })
})
