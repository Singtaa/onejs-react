import { describe, it, expect, beforeEach, vi } from "vitest"
import { toWire, createParticles, type ParticlesConfig } from "../particles"

/**
 * Wire-schema parity tests. toWire's output is the C#-JS contract: field names
 * and semantics must match ParticleWire.cs (validated on the C# side by
 * ParticleTests.cs). If a test here changes, check the C# side.
 */
describe("particles wire schema", () => {
    it("emits the canonical document with all defaults resolved", () => {
        const doc = toWire({ emitters: [{}] })
        expect(doc).toEqual({
            v: 4,
            max: 1000,
            space: 0,
            seed: 0,
            emitters: [{
                rate: 0,
                emitting: true,
                x: 0,
                y: 0,
                shape: 0,
                shapeW: 0,
                shapeH: 0,
                angleMin: 0,
                angleMax: 360,
                speedMin: 0,
                speedMax: 0,
                lifeMin: 1,
                lifeMax: 1,
                sizeMin: 8,
                sizeMax: 8,
                aspectMin: 1,
                aspectMax: 1,
                gravityX: 0,
                gravityY: 0,
                drag: 0,
                rotMin: 0,
                rotMax: 0,
                angVelMin: 0,
                angVelMax: 0,
                additiveness: 0,
                attractX: 0,
                attractY: 0,
                attractStrength: 0,
                attractEase: 1,
                edge: 0,
                bounciness: 0.5,
                pivotX: 0,
                pivotY: 0,
                sheetCols: 1,
                sheetRows: 1,
                sheetMode: 0,
                sheetFps: 24,
                sheetFrames: 0,
                sheetRandomStart: false,
                colorKeys: [{ t: 0, r: 1, g: 1, b: 1, a: 1 }],
                sizeKeys: [{ t: 0, v: 1 }],
                tintPalette: [],
            }],
        })
    })

    it("normalizes scalar and [min,max] ranges", () => {
        const doc = toWire({ emitters: [{ speed: 50, lifetime: [0.5, 1.5] }] })
        const e = doc.emitters[0]
        expect([e.speedMin, e.speedMax]).toEqual([50, 50])
        expect([e.lifeMin, e.lifeMax]).toEqual([0.5, 1.5])
    })

    it("maps shapes to ids and dimensions", () => {
        const circle = toWire({ emitters: [{ shape: { type: "circle", radius: 12 } }] }).emitters[0]
        expect([circle.shape, circle.shapeW, circle.shapeH]).toEqual([1, 12, 0])

        const rect = toWire({ emitters: [{ shape: { type: "rect", width: 30, height: 20 } }] }).emitters[0]
        expect([rect.shape, rect.shapeW, rect.shapeH]).toEqual([2, 30, 20])

        const line = toWire({ emitters: [{ shape: { type: "line", length: 40 } }] }).emitters[0]
        expect([line.shape, line.shapeW, line.shapeH]).toEqual([3, 40, 0])
    })

    it("parses hex colors including shorthand and alpha", () => {
        const doc = toWire({ emitters: [{ colorOverLife: ["#f00", "#00ff0080", [0, 0, 1]] }] })
        const keys = doc.emitters[0].colorKeys
        expect(keys[0]).toEqual({ t: 0, r: 1, g: 0, b: 0, a: 1 })
        expect(keys[1].t).toBeCloseTo(0.5)
        expect(keys[1].g).toBe(1)
        expect(keys[1].a).toBeCloseTo(128 / 255)
        expect(keys[2]).toEqual({ t: 1, r: 0, g: 0, b: 1, a: 1 })
    })

    it("spaces shorthand keys evenly and preserves explicit t", () => {
        const doc = toWire({
            emitters: [{
                sizeOverLife: [1, 2, 0],
                colorOverLife: [{ t: 0.2, color: "#fff" }, { t: 0.9, color: "#000" }],
            }],
        })
        expect(doc.emitters[0].sizeKeys).toEqual([
            { t: 0, v: 1 }, { t: 0.5, v: 2 }, { t: 1, v: 0 },
        ])
        expect(doc.emitters[0].colorKeys.map((k) => k.t)).toEqual([0.2, 0.9])
    })

    it("rejects malformed colors", () => {
        expect(() => toWire({ emitters: [{ colorOverLife: ["#12345"] }] })).toThrow(/invalid color/)
    })

    it("normalizes the aspect range", () => {
        expect(toWire({ emitters: [{ aspect: 0.25 }] }).emitters[0]).toMatchObject({
            aspectMin: 0.25, aspectMax: 0.25,
        })
        expect(toWire({ emitters: [{ aspect: [0.2, 0.6] }] }).emitters[0]).toMatchObject({
            aspectMin: 0.2, aspectMax: 0.6,
        })
    })

    it("parses tintPalette entries as flat rgba (no curve time)", () => {
        const palette = toWire({ emitters: [{ tintPalette: ["#f00", "#00ff0080"] }] }).emitters[0].tintPalette
        expect(palette).toEqual([
            { r: 1, g: 0, b: 0, a: 1 },
            { r: 0, g: 1, b: 0, a: 128 / 255 },
        ])
    })

    it("maps attract config, defaulting to full-strength ease-in", () => {
        expect(toWire({ emitters: [{ attract: { pos: [40, 90] } }] }).emitters[0]).toMatchObject({
            attractX: 40, attractY: 90, attractStrength: 1, attractEase: 1,
        })
        expect(toWire({
            emitters: [{ attract: { pos: [1, 2], strength: 0.4, ease: "out" } }],
        }).emitters[0]).toMatchObject({ attractStrength: 0.4, attractEase: 2 })
    })

    it("maps edge modes and bounciness", () => {
        expect(toWire({ emitters: [{ edge: "bounce", bounciness: 0.2 }] }).emitters[0]).toMatchObject({
            edge: 2, bounciness: 0.2,
        })
        expect(toWire({ emitters: [{ edge: "stick" }] }).emitters[0].edge).toBe(3)
        expect(toWire({ emitters: [{ edge: "kill" }] }).emitters[0].edge).toBe(1)
    })

    it("rejects unknown enum strings", () => {
        expect(() => toWire({ emitters: [{ edge: "explode" as never }] })).toThrow(/invalid edge mode/)
        expect(() => toWire({
            emitters: [{ attract: { pos: [0, 0], ease: "bouncy" as never } }],
        })).toThrow(/invalid attract ease/)
        expect(() => toWire({
            emitters: [{ sheet: { cols: 2, rows: 2, mode: "pingpong" as never } }],
        })).toThrow(/invalid sheet mode/)
    })

    it("maps the flipbook sheet, defaulting to play-once-over-life", () => {
        expect(toWire({ emitters: [{ sheet: { cols: 4, rows: 4 } }] }).emitters[0]).toMatchObject({
            sheetCols: 4, sheetRows: 4, sheetMode: 0, sheetFps: 24,
            sheetFrames: 0, sheetRandomStart: false,
        })
        expect(toWire({
            emitters: [{ sheet: { cols: 8, rows: 2, mode: "fps", fps: 30, randomStart: true, frameCount: 13 } }],
        }).emitters[0]).toMatchObject({
            sheetCols: 8, sheetRows: 2, sheetMode: 1, sheetFps: 30,
            sheetFrames: 13, sheetRandomStart: true,
        })
    })

    it("leaves frameCount at 0 so C# resolves it from the grid", () => {
        // One source of truth for cols*rows: the JS side never duplicates it.
        expect(toWire({ emitters: [{ sheet: { cols: 3, rows: 5 } }] }).emitters[0].sheetFrames).toBe(0)
    })
})

describe("createParticles handle", () => {
    let sys: {
        SetEmitterPos: ReturnType<typeof vi.fn>
        SetEmitterAttractor: ReturnType<typeof vi.fn>
        SetEmitterTexture: ReturnType<typeof vi.fn>
        SetEmitterRate: ReturnType<typeof vi.fn>
        StartEmitter: ReturnType<typeof vi.fn>
        StopEmitter: ReturnType<typeof vi.fn>
        Burst: ReturnType<typeof vi.fn>
        Pause: ReturnType<typeof vi.fn>
        Resume: ReturnType<typeof vi.fn>
        Clear: ReturnType<typeof vi.fn>
        Dispose: ReturnType<typeof vi.fn>
        AliveCount: number
    }
    let createSpy: ReturnType<typeof vi.fn>
    const element = { __fake: "element" } as never

    beforeEach(() => {
        sys = {
            SetEmitterPos: vi.fn(),
            SetEmitterAttractor: vi.fn(),
            SetEmitterTexture: vi.fn(),
            SetEmitterRate: vi.fn(),
            StartEmitter: vi.fn(),
            StopEmitter: vi.fn(),
            Burst: vi.fn(),
            Pause: vi.fn(),
            Resume: vi.fn(),
            Clear: vi.fn(),
            Dispose: vi.fn(),
            AliveCount: 7,
        }
        createSpy = vi.fn(() => sys)
        ;(globalThis as any).CS.OneJS.ParticleBridge = { Create: createSpy }
    })

    const config: ParticlesConfig = { max: 50, emitters: [{ rate: 10 }, { rate: 0 }] }

    it("creates with element, wire JSON, and null texture", () => {
        createParticles(element, config)
        expect(createSpy).toHaveBeenCalledTimes(1)
        const [el, json, texture] = createSpy.mock.calls[0]
        expect(el).toBe(element)
        expect(JSON.parse(json)).toEqual(toWire(config))
        expect(texture).toBeNull()
    })

    it("forwards emitter and system calls as single crossings", () => {
        const fx = createParticles(element, config)
        expect(fx.emitters).toHaveLength(2)

        fx.emitters[1].pos(5, 6)
        expect(sys.SetEmitterPos).toHaveBeenCalledWith(1, 5, 6)

        fx.emitters[1].attract(7, 8)
        expect(sys.SetEmitterAttractor).toHaveBeenCalledWith(1, 7, 8)

        fx.emitters[0].rate = 99
        expect(sys.SetEmitterRate).toHaveBeenCalledWith(0, 99)
        expect(fx.emitters[0].rate).toBe(99)

        fx.emitters[0].stop()
        expect(sys.StopEmitter).toHaveBeenCalledWith(0)
        fx.emitters[0].start()
        expect(sys.StartEmitter).toHaveBeenCalledWith(0)

        fx.burst({ x: 1, y: 2, count: 30 })
        expect(sys.Burst).toHaveBeenCalledWith(0, 1, 2, 30)
        fx.burst({ x: 1, y: 2, count: 3, emitter: 1 })
        expect(sys.Burst).toHaveBeenCalledWith(1, 1, 2, 3)

        expect(fx.aliveCount).toBe(7)
    })

    it("applies per-emitter texture overrides after creation", () => {
        const spark = { __fake: "spark" }
        const smoke = { __fake: "smoke" }
        createParticles(element, {
            max: 10,
            emitters: [{ rate: 1, texture: spark }, { rate: 1 }, { rate: 1, texture: smoke }],
        })
        expect(sys.SetEmitterTexture).toHaveBeenCalledTimes(2)
        expect(sys.SetEmitterTexture).toHaveBeenCalledWith(0, spark)
        expect(sys.SetEmitterTexture).toHaveBeenCalledWith(2, smoke)
    })

    it("dispose is idempotent and zeroes aliveCount", () => {
        const fx = createParticles(element, config)
        fx.dispose()
        fx.dispose()
        expect(sys.Dispose).toHaveBeenCalledTimes(1)
        expect(fx.aliveCount).toBe(0)
    })

    it("registers a teardown hook when the bootstrap provides one", () => {
        const hooks: Array<() => void> = []
        ;(globalThis as any).__onTeardown = (cb: () => void) => hooks.push(cb)
        try {
            createParticles(element, config)
            expect(hooks).toHaveLength(1)
            hooks[0]()
            expect(sys.Dispose).toHaveBeenCalledTimes(1)
        } finally {
            delete (globalThis as any).__onTeardown
        }
    })
})

describe("the emitter's plain names", () => {
    it("reads glow, spin and position, and still the old names", () => {
        const plain = toWire({ emitters: [{ glow: 0.7, spin: [10, 20], position: [5, 6], attract: { position: [1, 2] } }] }).emitters[0]
        expect(plain).toMatchObject({ additiveness: 0.7, angVelMin: 10, angVelMax: 20, x: 5, y: 6, attractX: 1, attractY: 2 })
        const old = toWire({ emitters: [{ additiveness: 0.7, angularVel: [10, 20], pos: [5, 6], attract: { pos: [1, 2] } }] }).emitters[0]
        expect(old).toMatchObject({ additiveness: 0.7, angVelMin: 10, angVelMax: 20, x: 5, y: 6, attractX: 1, attractY: 2 })
    })

    it("lets the plain name win when both are given", () => {
        const w = toWire({ emitters: [{ glow: 1, additiveness: 0, position: [9, 9], pos: [0, 0] }] }).emitters[0]
        expect(w).toMatchObject({ additiveness: 1, x: 9, y: 9 })
    })
})
