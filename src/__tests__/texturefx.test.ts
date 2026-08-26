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
        // _LScroll = (scrollX*scaleX, scrollY*scaleY, amount, shapeId): scroll is
        // authored element-relative and pre-multiplied so scale does not change speed
        expect(c.vectorArrays._LScroll[0]).toBeCloseTo(0.3)
        expect(c.vectorArrays._LScroll[1]).toBeCloseTo(-2.0)
        expect(c.vectorArrays._LScroll.slice(2, 4)).toEqual([2, 0])
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

describe("TextureFX scroll semantics", () => {
    it("keeps speed independent of scale", () => {
        // The same element-relative scroll at two scales must traverse the element
        // at the same rate, i.e. noise-space velocity scales with the field.
        const at = (scale: number) =>
            buildTextureFX((fx) => { fx.noise({ scale, scroll: [0, -1] }); fx.ramp(["#000", "#fff"]) })
                .vectorArrays._LScroll[1]
        expect(at(4)).toBeCloseTo(-4)
        expect(at(8)).toBeCloseTo(-8)
        // one element-height per second at either scale
        expect(at(4) / 4).toBeCloseTo(at(8) / 8)
    })
})

/**
 * SDF layers reuse _LScale for their transform and add _LParams2. If any of these
 * change, sdfValue()/sdfDistance() in OneJS/TextureFX.shader change with them.
 */
describe("TextureFX SDF shapes", () => {
    it("packs an sdf layer into the slots the shader reads", () => {
        const c = buildTextureFX((fx) => {
            fx.sdf("circle", { r: 0.4, x: 0.1, y: -0.2, rotation: 90, scale: 2,
                               rounded: 0.03, onion: 0.01, softness: 0.05, amount: 3 })
            fx.ramp(["#000", "#fff"])
        })
        // _LMode = (src, blend, rounded, onion); src 3 = sdf
        expect(c.vectorArrays._LMode).toEqual([3, 0, 0.03, 0.01])
        // _LScale = (x, y, rotation in radians, uniform scale)
        expect(c.vectorArrays._LScale.slice(0, 2)).toEqual([0.1, -0.2])
        expect(c.vectorArrays._LScale[2]).toBeCloseTo(Math.PI / 2)
        expect(c.vectorArrays._LScale[3]).toBe(2)
        // shape id in _LScroll.w, amount in .z, and never a scroll
        expect(c.vectorArrays._LScroll).toEqual([0, 0, 3, 0])
        expect(c.vectorArrays._LParams.slice(0, 4)).toEqual([0.4, 0, 0, 0])
        // _LParams2 = (param5, param6, softness, fieldMode)
        expect(c.vectorArrays._LParams2).toEqual([0, 0, 0.05, 0])
    })

    it("spends params 5 and 6 only on the shapes that need them", () => {
        const c = buildTextureFX((fx) => {
            fx.sdf("roundedBox", { w: 0.3, h: 0.4, corners: [0.1, 0.2, 0.3, 0.4] })
            fx.ramp(["#000", "#fff"])
        })
        // corners are top-right, bottom-right in _LParams.zw and top-left,
        // bottom-left in _LParams2.xy, which is IQ's r.xyzw order
        expect(c.vectorArrays._LParams.slice(0, 4)).toEqual([0.3, 0.4, 0.1, 0.2])
        expect(c.vectorArrays._LParams2.slice(0, 2)).toEqual([0.3, 0.4])
    })

    it("converts angles to the sin/cos pair each shape actually wants", () => {
        const c = buildTextureFX((fx) => {
            fx.sdf("pie", { aperture: 30, r: 0.4 })
            fx.sdf("ring", { angle: 30, r: 0.3, thickness: 0.1 }).add()
            fx.ramp(["#000", "#fff"])
        })
        const a = 30 * Math.PI / 180
        // pie wants (sin, cos)
        expect(c.vectorArrays._LParams[0]).toBeCloseTo(Math.sin(a))
        expect(c.vectorArrays._LParams[1]).toBeCloseTo(Math.cos(a))
        // ring wants (cos, sin): swapping these silently draws a different wedge
        expect(c.vectorArrays._LParams[4]).toBeCloseTo(Math.cos(a))
        expect(c.vectorArrays._LParams[5]).toBeCloseTo(Math.sin(a))
    })

    it("gives every shape a default that packs without NaN", () => {
        const kinds = ["circle","roundedBox","box","orientedBox","segment","rhombus",
            "trapezoid","parallelogram","equilateralTriangle","triangleIsosceles",
            "triangle","unevenCapsule","pentagon","hexagon","octagon","hexagram",
            "star5","star","pie","cutDisk","arc","ring","horseshoe","vesica",
            "orientedVesica","moon","roundedCross","egg","heart","cross","roundedX",
            "ellipse","parabola","parabolaSegment","bezier","blobbyCross","tunnel",
            "stairs","quadraticCircle","hyperbola","coolS","circleWave"] as const
        expect(kinds.length).toBe(42)
        const seen = new Set<number>()
        for (const k of kinds) {
            const c = buildTextureFX((fx) => { fx.sdf(k); fx.ramp(["#000", "#fff"]) })
            for (const v of [...c.vectorArrays._LParams, ...c.vectorArrays._LParams2,
                             ...c.vectorArrays._LScale, ...c.vectorArrays._LMode])
                expect(Number.isFinite(v)).toBe(true)
            seen.add(c.vectorArrays._LScroll[3])
        }
        // ids must be unique and contiguous, since the shader switches on them
        expect(seen.size).toBe(42)
        expect(Math.min(...seen)).toBe(0)
        expect(Math.max(...seen)).toBe(41)
    })

    it("keeps non-sdf layers out of the sdf slots", () => {
        const c = buildTextureFX((fx) => {
            fx.noise({ scale: 4, seed: 2 })
            fx.shape("radial").multiply()
            fx.ramp(["#000", "#fff"])
        })
        expect(c.vectorArrays._LParams2).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
        // rounded/onion stay zero, so _LMode.zw is untouched for old stacks
        expect(c.vectorArrays._LMode.slice(2, 4)).toEqual([0, 0])
        expect(c.vectorArrays._LMode.slice(6, 8)).toEqual([0, 0])
        // a noise layer still gets scale/octaves/seed in _LScale
        expect(c.vectorArrays._LScale.slice(0, 4)).toEqual([4, 4, 3, 2])
    })
})
