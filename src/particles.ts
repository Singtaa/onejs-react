/**
 * 2D particle engine control plane for OneJS.
 *
 * The simulation and rendering live entirely in C# (see Runtime/Particles in
 * the OneJS package): this module only normalizes an ergonomic config into the
 * versioned wire schema, creates the system in a single crossing, and exposes
 * imperative handles whose methods are each one crossing. Steady-state
 * emission costs zero JS work per frame.
 *
 *     import { useParticles } from "onejs-react"
 *
 *     const ref = useRef(null)
 *     const fx = useParticles(ref, {
 *         max: 2000,
 *         emitters: [{
 *             rate: 200,
 *             shape: { type: "circle", radius: 12 },
 *             speed: [40, 120],
 *             lifetime: [0.5, 1.5],
 *             sizeOverLife: [1, 0],
 *             colorOverLife: ["#ffd080", "#ff408000"],
 *             additiveness: 1,
 *             gravity: [0, 240],
 *         }],
 *     })
 *     // ...
 *     <View ref={ref} onPointerDown={(e) => fx.burst({ x: e.localX, y: e.localY, count: 30 })} />
 *
 * The wire schema (toWire's output) is the C#-JS contract: it must match
 * ParticleWire.cs, kept in sync by particles.test.ts and ParticleTests.cs.
 */

import { useEffect, useRef, type DependencyList, type RefObject } from "react"
import type { VisualElement } from "./types"

// MARK: CS interop surface

interface CSParticleSystem {
    SetEmitterPos(index: number, x: number, y: number): void
    SetEmitterAttractor(index: number, x: number, y: number): void
    SetEmitterTexture(index: number, texture: unknown): void
    SetEmitterRate(index: number, rate: number): void
    StartEmitter(index: number): void
    StopEmitter(index: number): void
    Burst(index: number, x: number, y: number, count: number): void
    Pause(): void
    Resume(): void
    Clear(): void
    Dispose(): void
    AliveCount: number
}

declare const CS: {
    OneJS: {
        ParticleBridge: {
            Create: (element: unknown, json: string, texture: unknown) => CSParticleSystem
        }
    }
}

// MARK: Config types (ergonomic)

/** A fixed value or a [min, max] range sampled uniformly per particle. */
export type ParticleRange = number | [number, number]

/** "#rgb" | "#rrggbb" | "#rrggbbaa" | [r, g, b, a?] with 0..1 floats. */
export type ParticleColor = string | [number, number, number, number?]

export type EmitterShape =
    | { type: "point" }
    | { type: "circle"; radius: number }
    | { type: "rect"; width: number; height: number }
    | { type: "line"; length: number }

/** Ramp shape for the attraction pull over a particle's life. */
export type AttractEase = "linear" | "in" | "out"

/**
 * Pulls particles toward a point so they *arrive* by end of life, rather than
 * modelling a physical attractor (which orbits and overshoots). Gravity, drag
 * and initial velocity still apply; the pull progressively wins over them.
 */
export interface AttractConfig {
    /** Target in emitter-local px (transformed like `pos` in panel space). */
    pos: [number, number]
    /** 0..1 - how completely the pull wins by end of life. 1 = exact arrival. Default 1. */
    strength?: number
    /** Default "in": particles hold their spread, then whoosh in. */
    ease?: AttractEase
}

/**
 * What happens when a particle's center leaves the host element's rect.
 * "kill" reclaims it, "bounce" reflects it, "stick" freezes it in place (it
 * still ages and fades, which is how snow/confetti settle).
 */
export type EdgeMode = "none" | "kill" | "bounce" | "stick"

/**
 * Treats the emitter's texture as a grid of animation frames. Frame 0 is the
 * sheet's top-left cell, advancing left to right, top to bottom: the standard
 * flipbook layout. This is how hand-painted effects (flames, explosions, smoke)
 * get their motion; procedural curves alone can't produce it.
 */
export interface SheetConfig {
    /** Grid dimensions of the sprite sheet. */
    cols: number
    rows: number
    /** "life" plays the sheet once over the particle's lifetime (default); "fps" loops at a fixed rate. */
    mode?: "life" | "fps"
    /** Frames per second for mode "fps". Default 24. */
    fps?: number
    /** Start each particle on a random frame, so a burst doesn't animate in lockstep. Default false. */
    randomStart?: boolean
    /** Use only the first N cells, for sheets whose last row is padded. Default cols*rows. */
    frameCount?: number
}

export interface EmitterConfig {
    /** Particles per second. Default 0 (burst-only emitter). */
    rate?: number
    /** Whether continuous emission starts enabled. Default true. */
    emitting?: boolean
    /** Emitter position in element-local pixels. Default [0, 0]. */
    pos?: [number, number]
    /** Spawn area. Default point. */
    shape?: EmitterShape
    /** Emission direction in degrees; 0 = +X, 90 = +Y (down). Default [0, 360]. */
    angle?: ParticleRange
    /** Initial speed in px/s. Default 0. */
    speed?: ParticleRange
    /** Particle lifetime in seconds. Default 1. */
    lifetime?: ParticleRange
    /** Initial size in px. Default 8. */
    size?: ParticleRange
    /** Quad width:height ratio, 1 is square, 0.2 a vertical streak. Default 1. */
    aspect?: ParticleRange
    /**
     * Which point of the sprite sits on the particle position, in normalized quad
     * coords: [0, 0] is the center (default), [0, 0.5] the bottom edge (Y is down).
     * Bottom-anchoring is what keeps a flame or fountain from hanging below its
     * source. This is also the point the sprite rotates around.
     */
    pivot?: [number, number]
    /** Constant acceleration in px/s^2. Default [0, 0]. */
    gravity?: [number, number]
    /** Velocity damping per second. Default 0. */
    drag?: number
    /** Initial rotation in degrees. Default 0. */
    rotation?: ParticleRange
    /** Angular velocity in deg/s. Default 0. */
    angularVel?: ParticleRange
    /** 0 = normal alpha blend, 1 = pure additive, values between mix. Default 0. */
    additiveness?: number
    /**
     * Color over normalized lifetime. Shorthand array entries are spaced
     * evenly; explicit entries carry their own t. 2-8 keys, linear interp.
     */
    colorOverLife?: ParticleColor[] | { t: number; color: ParticleColor }[]
    /** Size multiplier over normalized lifetime. Same key rules. */
    sizeOverLife?: number[] | { t: number; v: number }[]
    /**
     * Random per-particle tint, picked uniformly at spawn and *multiplied* into
     * colorOverLife, so the fade ramp still shapes the alpha. Up to 16 entries.
     * This is how one emitter produces multicolored confetti.
     */
    tintPalette?: ParticleColor[]
    /** Pulls particles toward a point, arriving by end of life. Default: none. */
    attract?: AttractConfig
    /** Behavior at the host element's edges. Default "none". */
    edge?: EdgeMode
    /** Restitution for edge "bounce": 0 = dead stop, 1 = perfectly elastic. Default 0.5. */
    bounciness?: number
    /**
     * CS Texture2D overriding the system sprite for this emitter. Emitters
     * sharing a texture share a draw call, so keep distinct sprites few.
     */
    texture?: unknown
    /** Play the texture as a flipbook grid instead of a single sprite. */
    sheet?: SheetConfig
}

export interface ParticlesConfig {
    /** Particle capacity (bursts and emission clamp here). Default 1000. */
    max?: number
    /** "local": particles ride the element. "panel": trails stay put. Default "local". */
    space?: "local" | "panel"
    /** RNG seed for deterministic playback. Default 0 (derived). */
    seed?: number
    /** CS Texture2D sprite (author premultiplied). Default: built-in soft disc. */
    texture?: unknown
    emitters: EmitterConfig[]
}

// MARK: Wire schema (must match ParticleWire.cs)

export interface WireColorKey { t: number; r: number; g: number; b: number; a: number }
export interface WireFloatKey { t: number; v: number }
export interface WireRGBA { r: number; g: number; b: number; a: number }

export interface WireEmitter {
    rate: number
    emitting: boolean
    x: number
    y: number
    shape: number
    shapeW: number
    shapeH: number
    angleMin: number
    angleMax: number
    speedMin: number
    speedMax: number
    lifeMin: number
    lifeMax: number
    sizeMin: number
    sizeMax: number
    aspectMin: number
    aspectMax: number
    gravityX: number
    gravityY: number
    drag: number
    rotMin: number
    rotMax: number
    angVelMin: number
    angVelMax: number
    additiveness: number
    attractX: number
    attractY: number
    attractStrength: number
    attractEase: number
    edge: number
    bounciness: number
    pivotX: number
    pivotY: number
    sheetCols: number
    sheetRows: number
    sheetMode: number
    sheetFps: number
    sheetFrames: number
    sheetRandomStart: boolean
    colorKeys: WireColorKey[]
    sizeKeys: WireFloatKey[]
    tintPalette: WireRGBA[]
}

export interface WireDoc {
    v: 4
    max: number
    space: 0 | 1
    seed: number
    emitters: WireEmitter[]
}

function range(v: ParticleRange | undefined, min: number, max: number): [number, number] {
    if (v === undefined) return [min, max]
    if (typeof v === "number") return [v, v]
    return v
}

function parseColor(c: ParticleColor): { r: number; g: number; b: number; a: number } {
    if (typeof c !== "string") {
        return { r: c[0], g: c[1], b: c[2], a: c[3] ?? 1 }
    }
    let h = c.startsWith("#") ? c.slice(1) : c
    if (h.length === 3 || h.length === 4) {
        h = h.split("").map((d) => d + d).join("")
    }
    if (h.length !== 6 && h.length !== 8) {
        throw new Error(`[onejs particles] invalid color "${c}"`)
    }
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 }
}

function evenT(index: number, length: number): number {
    return length <= 1 ? 0 : index / (length - 1)
}

const SHAPE_IDS = { point: 0, circle: 1, rect: 2, line: 3 } as const
const ATTRACT_EASE_IDS: Record<string, number> = { linear: 0, in: 1, out: 2 }
const EDGE_IDS: Record<string, number> = { none: 0, kill: 1, bounce: 2, stick: 3 }
const SHEET_MODE_IDS: Record<string, number> = { life: 0, fps: 1 }

function enumId(map: Record<string, number>, value: string | undefined, fallback: number, what: string): number {
    if (value === undefined) return fallback
    const id = map[value]
    if (id === undefined) throw new Error(`[onejs particles] invalid ${what} "${value}"`)
    return id
}

/**
 * Normalizes an ergonomic config into the canonical wire document. Every field
 * is emitted explicitly so the JS side is the single source of defaults.
 * Exported for the schema parity tests.
 */
export function toWire(config: ParticlesConfig): WireDoc {
    const emitters = config.emitters.map((e): WireEmitter => {
        const shape = e.shape ?? { type: "point" as const }
        const [angleMin, angleMax] = range(e.angle, 0, 360)
        const [speedMin, speedMax] = range(e.speed, 0, 0)
        const [lifeMin, lifeMax] = range(e.lifetime, 1, 1)
        const [sizeMin, sizeMax] = range(e.size, 8, 8)
        const [aspectMin, aspectMax] = range(e.aspect, 1, 1)
        const [rotMin, rotMax] = range(e.rotation, 0, 0)
        const [angVelMin, angVelMax] = range(e.angularVel, 0, 0)

        const colorSrc = e.colorOverLife ?? []
        const colorKeys: WireColorKey[] = colorSrc.length === 0
            ? [{ t: 0, r: 1, g: 1, b: 1, a: 1 }]
            : colorSrc.map((entry, i) => {
                const explicit = typeof entry === "object" && entry !== null && !Array.isArray(entry)
                const t = explicit ? (entry as { t: number }).t : evenT(i, colorSrc.length)
                const c = parseColor(explicit ? (entry as { color: ParticleColor }).color : entry as ParticleColor)
                return { t, ...c }
            })

        const sizeSrc = e.sizeOverLife ?? []
        const sizeKeys: WireFloatKey[] = sizeSrc.length === 0
            ? [{ t: 0, v: 1 }]
            : sizeSrc.map((entry, i) =>
                typeof entry === "number"
                    ? { t: evenT(i, sizeSrc.length), v: entry }
                    : { t: entry.t, v: entry.v })

        const tintPalette: WireRGBA[] = (e.tintPalette ?? []).map(parseColor)

        return {
            rate: e.rate ?? 0,
            emitting: e.emitting ?? true,
            x: e.pos?.[0] ?? 0,
            y: e.pos?.[1] ?? 0,
            shape: SHAPE_IDS[shape.type],
            shapeW: shape.type === "circle" ? shape.radius
                : shape.type === "rect" ? shape.width
                : shape.type === "line" ? shape.length : 0,
            shapeH: shape.type === "rect" ? shape.height : 0,
            angleMin, angleMax,
            speedMin, speedMax,
            lifeMin, lifeMax,
            sizeMin, sizeMax,
            aspectMin, aspectMax,
            gravityX: e.gravity?.[0] ?? 0,
            gravityY: e.gravity?.[1] ?? 0,
            drag: e.drag ?? 0,
            rotMin, rotMax,
            angVelMin, angVelMax,
            additiveness: e.additiveness ?? 0,
            attractX: e.attract?.pos[0] ?? 0,
            attractY: e.attract?.pos[1] ?? 0,
            attractStrength: e.attract ? e.attract.strength ?? 1 : 0,
            attractEase: enumId(ATTRACT_EASE_IDS, e.attract?.ease, 1, "attract ease"),
            edge: enumId(EDGE_IDS, e.edge, 0, "edge mode"),
            bounciness: e.bounciness ?? 0.5,
            pivotX: e.pivot?.[0] ?? 0,
            pivotY: e.pivot?.[1] ?? 0,
            sheetCols: e.sheet?.cols ?? 1,
            sheetRows: e.sheet?.rows ?? 1,
            sheetMode: enumId(SHEET_MODE_IDS, e.sheet?.mode, 0, "sheet mode"),
            sheetFps: e.sheet?.fps ?? 24,
            // 0 tells C# to resolve it to cols*rows, keeping one source of truth.
            sheetFrames: e.sheet?.frameCount ?? 0,
            sheetRandomStart: e.sheet?.randomStart ?? false,
            colorKeys,
            sizeKeys,
            tintPalette,
        }
    })

    return {
        v: 4,
        max: config.max ?? 1000,
        space: config.space === "panel" ? 1 : 0,
        seed: config.seed ?? 0,
        emitters,
    }
}

// MARK: Imperative handles

export interface EmitterHandle {
    /** Moves the emitter (element-local px). One crossing; fine per-frame. */
    pos(x: number, y: number): void
    /**
     * Moves the attraction target (element-local px). One crossing; fine
     * per-frame. No effect unless the emitter was configured with `attract`.
     */
    attract(x: number, y: number): void
    /** Live emission rate in particles/s. */
    rate: number
    start(): void
    stop(): void
}

export interface BurstOptions {
    x: number
    y: number
    count: number
    /** Emitter whose ranges the burst samples. Default 0. */
    emitter?: number
}

export interface ParticlesHandle {
    readonly emitters: EmitterHandle[]
    burst(opts: BurstOptions): void
    pause(): void
    resume(): void
    clear(): void
    /** Detaches from the element and frees the system. Idempotent. */
    dispose(): void
    readonly aliveCount: number
}

/**
 * Creates a particle system on an element. Prefer useParticles in components;
 * use this directly for imperative setups. Callers own disposal (a teardown
 * hook also disposes leaked systems on hot reload / context shutdown).
 */
export function createParticles(element: VisualElement, config: ParticlesConfig): ParticlesHandle {
    const doc = toWire(config)
    const sys = CS.OneJS.ParticleBridge.Create(element, JSON.stringify(doc), config.texture ?? null)

    // Textures can't ride the JSON document, so per-emitter overrides are applied
    // as setup-time crossings right after creation.
    config.emitters.forEach((e, i) => {
        if (e.texture) sys.SetEmitterTexture(i, e.texture)
    })

    let disposed = false
    const emitters: EmitterHandle[] = doc.emitters.map((e, i) => {
        let rate = e.rate
        return {
            pos: (x: number, y: number) => sys.SetEmitterPos(i, x, y),
            attract: (x: number, y: number) => sys.SetEmitterAttractor(i, x, y),
            get rate() { return rate },
            set rate(r: number) {
                rate = r
                sys.SetEmitterRate(i, r)
            },
            start: () => sys.StartEmitter(i),
            stop: () => sys.StopEmitter(i),
        }
    })

    const handle: ParticlesHandle = {
        emitters,
        burst: (o) => sys.Burst(o.emitter ?? 0, o.x, o.y, o.count),
        pause: () => sys.Pause(),
        resume: () => sys.Resume(),
        clear: () => sys.Clear(),
        dispose: () => {
            if (disposed) return
            disposed = true
            sys.Dispose()
        },
        get aliveCount() { return disposed ? 0 : sys.AliveCount },
    }

    // Hot-reload/shutdown safety net for systems created outside React effects.
    // Dispose is idempotent, so double-disposal via both paths is harmless.
    const teardown = (globalThis as { __onTeardown?: (cb: () => void) => void }).__onTeardown
    if (typeof teardown === "function") teardown(handle.dispose)

    return handle
}

/**
 * Hook form: creates the system when the ref attaches, disposes on unmount,
 * and recreates when deps change. Returns a stable handle whose methods no-op
 * until the system exists (e.g. before mount).
 */
export function useParticles(
    ref: RefObject<VisualElement | null>,
    config: ParticlesConfig,
    deps: DependencyList = []
): ParticlesHandle {
    const innerRef = useRef<ParticlesHandle | null>(null)
    const configRef = useRef(config)
    configRef.current = config

    const facadeRef = useRef<ParticlesHandle | null>(null)
    if (!facadeRef.current) {
        const inner = () => innerRef.current
        facadeRef.current = {
            get emitters() { return inner()?.emitters ?? [] },
            burst: (o) => inner()?.burst(o),
            pause: () => inner()?.pause(),
            resume: () => inner()?.resume(),
            clear: () => inner()?.clear(),
            dispose: () => inner()?.dispose(),
            get aliveCount() { return inner()?.aliveCount ?? 0 },
        }
    }

    useEffect(() => {
        const element = ref.current
        if (!element) return
        const handle = createParticles(element, configRef.current)
        innerRef.current = handle
        return () => {
            innerRef.current = null
            handle.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return facadeRef.current
}
