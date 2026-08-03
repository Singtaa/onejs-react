import { describe, it, expect } from "vitest"
import { TextureFXBuilder, buildTextureFX, MAX_TEXTUREFX_LAYERS } from "../texturefx"

/**
 * The builder's compiled output is the C#-JS contract: uniform names and the
 * packing order must match OneJS/TextureFX.shader. If a test here changes,
 * check the shader.
 */
describe("TextureFX builder", () => {
    it("packs a noise layer into the uniform layout the shader reads", () => {
        const c = buildTextureFX((fx) => {
            fx.noise({ scale: [3, 4], seed: 7, octaves: 2, scroll: [0.1, -0.5], amount: 2 })
            fx.erode(0.2, 0.4).ramp(["#000000ff", "#ffffffff"])
        })
        expect(c.floats._LayerCount).toBe(1)
        expect(c.floats._Threshold).toBe(0.2)
        expect(c.floats._Softness).toBe(0.4)
        // _LScale = (scaleX, scaleY, octaves, seed)
        expect(c.vectorArrays._LScale).toEqual([3, 4, 2, 7])
        // _LScroll = (scrollX, scrollY, amount, shapeId)
        expect(c.vectorArrays._LScroll).toEqual([0.1, -0.5, 2, 0])
        // _LMode = (src, blend, _, _); src 0 = noise, blend 0 = set
        expect(c.vectorArrays._LMode).toEqual([0, 0, 0, 0])
    })

    it("records the blend chosen on the returned handle", () => {
        const c = buildTextureFX((fx) => {
            fx.noise()
            fx.noise({ seed: 2 }).multiply()
            fx.noise({ seed: 3 }).screen()
            fx.ramp(["#000", "#fff"])
        })
        // blend is the second component of each _LMode entry
        expect([c.vectorArrays._LMode[1], c.vectorArrays._LMode[5], c.vectorArrays._LMode[9]])
            .toEqual([0, 1, 6])
    })

    it("maps shapes to ids and packs their params", () => {
        const c = buildTextureFX((fx) => {
            fx.shape("flame", { width: 0.5, taper: 0.8, softness: 0.02, falloff: 0.6 })
            fx.shape("radial", { falloff: 3 }).multiply()
            fx.shape("box", { width: 0.25, height: 0.35, softness: 0.05 }).multiply()
            fx.ramp(["#000", "#fff"])
        })
        // shape id rides in _LScroll.w
        expect([c.vectorArrays._LScroll[3], c.vectorArrays._LScroll[7], c.vectorArrays._LScroll[11]])
            .toEqual([0, 1, 3])
        expect(c.vectorArrays._LParams.slice(0, 4)).toEqual([0.5, 0.8, 0.02, 0.6])
        expect(c.vectorArrays._LParams.slice(4, 8)).toEqual([3, 0, 0, 0])
        expect(c.vectorArrays._LParams.slice(8, 12)).toEqual([0.25, 0.35, 0.05, 0])
        // shapes are positional: they must never carry a scroll
        expect(c.vectorArrays._LScroll.slice(0, 2)).toEqual([0, 0])
    })

    it("defaults a scalar scale to both axes", () => {
        const c = buildTextureFX((fx) => { fx.noise({ scale: 5 }); fx.ramp(["#000", "#fff"]) })
        expect(c.vectorArrays._LScale.slice(0, 2)).toEqual([5, 5])
    })

    it("clamps octaves to what the shader's unrolled loop supports", () => {
        const c = buildTextureFX((fx) => { fx.noise({ octaves: 9 }); fx.ramp(["#000", "#fff"]) })
        expect(c.vectorArrays._LScale[2]).toBe(4)
    })

    it("refuses more layers than the shader has slots", () => {
        expect(() => buildTextureFX((fx) => {
            for (let i = 0; i <= MAX_TEXTUREFX_LAYERS; i++) fx.noise({ seed: i })
        })).toThrow(/at most 6 layers/)
    })

    it("rejects an empty stack rather than rendering nothing", () => {
        expect(() => buildTextureFX(() => { })).toThrow(/no layers/)
    })

    it("carries the ramp through untouched, alpha included", () => {
        const ramp = ["#00000000", "#ff6a10ff"]
        expect(buildTextureFX((fx) => { fx.noise(); fx.ramp(ramp) }).ramp).toEqual(ramp)
    })
})
