/**
 * TextureFX: compose a procedural texture out of noise, shapes and blends.
 *
 *     <TextureFX
 *         style={{ width: 160, height: 240 }}
 *         build={(fx) => {
 *             fx.noise({ scale: [3, 4], seed: 1, scroll: [0.03, -0.35] })
 *             fx.noise({ scale: [6, 8], seed: 2, scroll: [-0.05, -0.62] }).multiply()
 *             fx.shape("flame", { width: 0.44, taper: 0.7 }).multiply()
 *             fx.erode(0.10, 0.30)
 *             fx.ramp(["#00000000", "#c22200", "#ff6a10", "#fff4d2"])
 *         }}
 *     />
 *
 * The builder produces *data*, not shader code: runtime shader compilation is not
 * available in player builds, so the stack crosses to C# as uniform arrays and one
 * shader (OneJS/TextureFX) evaluates it. That keeps an effect to a single draw with
 * no compilation step, at the cost of a fixed layer ceiling.
 *
 * Noise is computed in the shader from a seed rather than sampled, so effects need
 * no textures and scrolling never repeats.
 */

/** Order matters: these indices are the shader's `src` and `blend` encodings. */
const SRC = { noise: 0, shape: 1, constant: 2, sdf: 3 } as const;
const BLEND = { set: 0, multiply: 1, add: 2, subtract: 3, min: 4, max: 5, screen: 6 } as const;
const SHAPE = { flame: 0, radial: 1, linear: 2, box: 3 } as const;

/**
 * Signed distance shapes, from Inigo Quilez by way of SDF2D.cginc. These ids are
 * the `switch` in sdfDistance(); do not renumber without changing the shader.
 *
 * Two names differ from the HLSL: IQ spells them `sdOctogon` and `sdHyberbola`,
 * and the .cginc keeps his spelling so it diffs cleanly against the original.
 * The public API spells them correctly.
 */
const SDF = {
    circle: 0, roundedBox: 1, box: 2, orientedBox: 3, segment: 4, rhombus: 5,
    trapezoid: 6, parallelogram: 7, equilateralTriangle: 8, triangleIsosceles: 9,
    triangle: 10, unevenCapsule: 11, pentagon: 12, hexagon: 13, octagon: 14,
    hexagram: 15, star5: 16, star: 17, pie: 18, cutDisk: 19, arc: 20, ring: 21,
    horseshoe: 22, vesica: 23, orientedVesica: 24, moon: 25, roundedCross: 26,
    egg: 27, heart: 28, cross: 29, roundedX: 30, ellipse: 31, parabola: 32,
    parabolaSegment: 33, bezier: 34, blobbyCross: 35, tunnel: 36, stairs: 37,
    quadraticCircle: 38, hyperbola: 39, coolS: 40, circleWave: 41,
} as const;

export type BlendMode = keyof typeof BLEND;
export type ShapeKind = keyof typeof SHAPE;
export type SDFKind = keyof typeof SDF;

/** Must match MAX_LAYERS in OneJS/TextureFX.shader. */
export const MAX_TEXTUREFX_LAYERS = 6;

export interface NoiseOptions {
    /**
     * Repeats across the element, so it is element-relative: the same scale on a
     * bigger element gives bigger features, and an effect that reads well at one
     * size can go blobby at another. Scale this with the element to keep a
     * constant feature size. A scalar applies to both axes. Default 4.
     */
    scale?: number | [number, number];
    /** Any number; different seeds give unrelated fields. Default 1. */
    seed?: number;
    /** fBm octaves, 1..4. More is wispier and costs more. Default 3. */
    octaves?: number;
    /**
     * Element-heights per second. 1 means the pattern travels the element's full
     * height each second, and -1 travels upward. Deliberately independent of
     * `scale`: the builder multiplies it by scale before it reaches the shader,
     * which samples in noise space, so changing scale re-sizes the features
     * without also changing how fast they move. Default [0, 0].
     */
    scroll?: [number, number];
    /** Multiplier on this layer's value before blending. Default 1. */
    amount?: number;
}

export interface ShapeOptions {
    /** flame: half-width at the base. box: half-width. Default 0.44. */
    width?: number;
    /** flame: how fast it narrows toward the tip. Default 0.7. */
    taper?: number;
    /** flame: fade-in off the base. box: edge softness. Default 0.05. */
    softness?: number;
    /** flame: how quickly it thins with height. radial/linear: falloff exponent. Default 0.55. */
    falloff?: number;
    /** box only: half-height. Default 0.4. */
    height?: number;
    amount?: number;
}

/**
 * Common to every SDF shape. Distances live in a square-ish space centred on the
 * element and aspect corrected by the shader, so 0.5 reaches the shorter edge:
 * a radius reads as a fraction of the element and a circle stays round.
 */
export interface SDFCommonOptions {
    /** Centre offset, in the same units as the shape's own params. Default 0, 0. */
    x?: number;
    y?: number;
    /** Rotation in degrees, clockwise. Default 0. */
    rotation?: number;
    /**
     * Uniform scale applied to the whole shape. Prefer the shape's own size
     * params; this is for the handful IQ authored at unit size (heart, coolS,
     * roundedCross, blobbyCross, quadraticCircle), which need ~0.4 here.
     */
    scale?: number;
    /**
     * Rounds every corner by this much, by shrinking the field. Costs one
     * subtraction and works on any shape, which is most of why SDFs beat masks.
     */
    rounded?: number;
    /**
     * Turns the shape into its own outline of this half-width. Also works on any
     * shape. Set it to give an open shape (segment, arc, bezier) some thickness.
     */
    onion?: number;
    /**
     * Width of the antialiased edge, in the same units. Larger is blurrier.
     * Default 0.01, which is about a pixel on a 200px element.
     */
    softness?: number;
    /**
     * Emit the raw signed field (positive inside) instead of a 0..1 mask. The
     * mask is the default because it blends with noise the way the other shape
     * sources do; the field is what you want to feed `erode` directly.
     */
    field?: boolean;
    /** Multiplier on this layer before blending. Default 1. */
    amount?: number;
}

/** Per shape parameters. Every field is optional and has a usable default. */
export interface SDFParams {
    circle: { r?: number };
    /** corners run top-right, bottom-right, top-left, bottom-left. */
    roundedBox: { w?: number; h?: number; corners?: number | [number, number, number, number] };
    box: { w?: number; h?: number };
    orientedBox: { a?: [number, number]; b?: [number, number]; thickness?: number };
    /** Zero width by itself: give it `onion` or `rounded` to see anything. */
    segment: { a?: [number, number]; b?: [number, number] };
    rhombus: { w?: number; h?: number };
    trapezoid: { rBottom?: number; rTop?: number; h?: number };
    parallelogram: { w?: number; h?: number; skew?: number };
    equilateralTriangle: { r?: number };
    triangleIsosceles: { w?: number; h?: number };
    triangle: { a?: [number, number]; b?: [number, number]; c?: [number, number] };
    unevenCapsule: { rBottom?: number; rTop?: number; h?: number };
    pentagon: { r?: number };
    hexagon: { r?: number };
    octagon: { r?: number };
    hexagram: { r?: number };
    /** inset 0..1 pulls the inner vertices toward the centre. */
    star5: { r?: number; inset?: number };
    /** points is the vertex count; sharpness runs 2 (blunt) to points (spiky). */
    star: { r?: number; points?: number; sharpness?: number };
    /** aperture is the half angle in degrees. */
    pie: { aperture?: number; r?: number };
    cutDisk: { r?: number; cut?: number };
    arc: { aperture?: number; r?: number; thickness?: number };
    ring: { angle?: number; r?: number; thickness?: number };
    horseshoe: { angle?: number; r?: number; w?: number; h?: number };
    vesica: { r?: number; d?: number };
    orientedVesica: { a?: [number, number]; b?: [number, number]; w?: number };
    moon: { d?: number; r?: number; rCut?: number };
    roundedCross: { h?: number };
    egg: { r?: number; rTop?: number };
    heart: {};
    cross: { w?: number; h?: number; r?: number };
    roundedX: { w?: number; r?: number };
    ellipse: { rx?: number; ry?: number };
    parabola: { k?: number };
    parabolaSegment: { w?: number; h?: number };
    bezier: { a?: [number, number]; b?: [number, number]; c?: [number, number] };
    blobbyCross: { h?: number };
    tunnel: { w?: number; h?: number };
    stairs: { w?: number; h?: number; steps?: number };
    quadraticCircle: {};
    /** k sets how tight the curve is; h is how far the arms extend. */
    hyperbola: { k?: number; h?: number };
    coolS: {};
    /** tightness 0..1 sets the wavelength. */
    circleWave: { tightness?: number; r?: number };
}

interface Layer {
    src: number;
    blend: number;
    scale: [number, number];
    octaves: number;
    seed: number;
    scroll: [number, number];
    amount: number;
    shape: number;
    params: [number, number, number, number];
    params2: [number, number, number, number];
    rounded: number;
    onion: number;
    /** sdf only: these ride in _LScale, which an sdf layer does not otherwise use. */
    pos: [number, number];
    rot: number;
    uniformScale: number;
}

/** Returned by each source so the blend reads as a sentence: `fx.noise(...).multiply()`. */
export interface LayerHandle {
    set(): LayerHandle;
    multiply(): LayerHandle;
    add(): LayerHandle;
    subtract(): LayerHandle;
    min(): LayerHandle;
    max(): LayerHandle;
    screen(): LayerHandle;
    /** Index of this layer, for the imperative setters on the element. */
    readonly index: number;
}

const DEG2RAD = Math.PI / 180;

type Quad = [number, number, number, number];
type Pair = [number, number];
const xy = (v: Pair | undefined, dx: number, dy: number): Pair => v ?? [dx, dy];

/**
 * Flattens a shape's named options into the six floats sdfDistance() reads.
 *
 * The angle conventions are IQ's and they are not uniform: pie and arc want
 * (sin, cos) of the half angle while ring and horseshoe want (cos, sin) of a
 * rotation. Callers give degrees and this hides the difference; getting it
 * backwards silently draws a different wedge, so keep the pairs as written.
 */
function packSDF(kind: SDFKind, o: any): [Quad, Pair] {
    const q = (a = 0, b = 0, c = 0, d = 0): Quad => [a, b, c, d];
    const none: Pair = [0, 0];
    switch (kind) {
        case "circle": return [q(o.r ?? 0.35), none];
        case "roundedBox": {
            const c = o.corners ?? 0.1;
            const [tr, br, tl, bl] = typeof c === "number" ? [c, c, c, c] : c;
            return [q(o.w ?? 0.3, o.h ?? 0.35, tr, br), [tl, bl]];
        }
        case "box": return [q(o.w ?? 0.3, o.h ?? 0.35), none];
        case "orientedBox": {
            const [ax, ay] = xy(o.a, -0.25, -0.2), [bx, by] = xy(o.b, 0.25, 0.2);
            return [q(ax, ay, bx, by), [o.thickness ?? 0.15, 0]];
        }
        case "segment": {
            const [ax, ay] = xy(o.a, -0.25, -0.25), [bx, by] = xy(o.b, 0.25, 0.25);
            return [q(ax, ay, bx, by), none];
        }
        case "rhombus": return [q(o.w ?? 0.3, o.h ?? 0.4), none];
        case "trapezoid": return [q(o.rBottom ?? 0.35, o.rTop ?? 0.2, o.h ?? 0.35), none];
        case "parallelogram": return [q(o.w ?? 0.3, o.h ?? 0.3, o.skew ?? 0.12), none];
        case "equilateralTriangle": return [q(o.r ?? 0.35), none];
        case "triangleIsosceles": return [q(o.w ?? 0.3, o.h ?? 0.45), none];
        case "triangle": {
            const [ax, ay] = xy(o.a, -0.35, -0.3), [bx, by] = xy(o.b, 0.35, -0.25);
            return [q(ax, ay, bx, by), xy(o.c, 0, 0.4)];
        }
        case "unevenCapsule": return [q(o.rBottom ?? 0.2, o.rTop ?? 0.1, o.h ?? 0.35), none];
        case "pentagon": return [q(o.r ?? 0.35), none];
        case "hexagon": return [q(o.r ?? 0.35), none];
        case "octagon": return [q(o.r ?? 0.35), none];
        case "hexagram": return [q(o.r ?? 0.25), none];
        case "star5": return [q(o.r ?? 0.35, o.inset ?? 0.45), none];
        case "star": return [q(o.r ?? 0.35, o.points ?? 6, o.sharpness ?? 3), none];
        case "pie": {
            const a = (o.aperture ?? 60) * DEG2RAD;
            return [q(Math.sin(a), Math.cos(a), o.r ?? 0.38), none];
        }
        case "cutDisk": return [q(o.r ?? 0.38, o.cut ?? -0.15), none];
        case "arc": {
            const a = (o.aperture ?? 70) * DEG2RAD;
            return [q(Math.sin(a), Math.cos(a), o.r ?? 0.32, o.thickness ?? 0.06), none];
        }
        case "ring": {
            const a = (o.angle ?? 70) * DEG2RAD;
            return [q(Math.cos(a), Math.sin(a), o.r ?? 0.3, o.thickness ?? 0.1), none];
        }
        case "horseshoe": {
            const a = (o.angle ?? 57) * DEG2RAD;
            return [q(Math.cos(a), Math.sin(a), o.r ?? 0.3, o.w ?? 0.1), [o.h ?? 0.06, 0]];
        }
        case "vesica": return [q(o.r ?? 0.4, o.d ?? 0.2), none];
        case "orientedVesica": {
            const [ax, ay] = xy(o.a, -0.25, -0.2), [bx, by] = xy(o.b, 0.25, 0.2);
            return [q(ax, ay, bx, by), [o.w ?? 0.12, 0]];
        }
        case "moon": return [q(o.d ?? 0.15, o.r ?? 0.35, o.rCut ?? 0.32), none];
        case "roundedCross": return [q(o.h ?? 0.5), none];
        case "egg": return [q(o.r ?? 0.3, o.rTop ?? 0.12), none];
        case "heart": return [q(), none];
        case "cross": return [q(o.w ?? 0.35, o.h ?? 0.12, o.r ?? 0.03), none];
        case "roundedX": return [q(o.w ?? 0.5, o.r ?? 0.08), none];
        case "ellipse": return [q(o.rx ?? 0.4, o.ry ?? 0.25), none];
        case "parabola": return [q(o.k ?? 2), none];
        case "parabolaSegment": return [q(o.w ?? 0.35, o.h ?? 0.4), none];
        case "bezier": {
            const [ax, ay] = xy(o.a, -0.35, -0.25), [bx, by] = xy(o.b, 0, 0.5);
            return [q(ax, ay, bx, by), xy(o.c, 0.35, -0.25)];
        }
        case "blobbyCross": return [q(o.h ?? 0.4), none];
        case "tunnel": return [q(o.w ?? 0.3, o.h ?? 0.3), none];
        case "stairs": return [q(o.w ?? 0.12, o.h ?? 0.12, o.steps ?? 4), none];
        case "quadraticCircle": return [q(), none];
        case "hyperbola": return [q(o.k ?? 0.01, o.h ?? 0.35), none];
        case "coolS": return [q(), none];
        case "circleWave": return [q(o.tightness ?? 0.5, o.r ?? 0.25), none];
    }
}

const pair = (v: number | [number, number] | undefined, d: number): [number, number] =>
    v === undefined ? [d, d] : typeof v === "number" ? [v, v] : v;

/**
 * Collects layers. Every source method appends a layer and returns a handle whose
 * blend methods set how it combines with what came before. The first layer always
 * replaces, whatever blend it declares, because there is nothing under it.
 */
export class TextureFXBuilder {
    readonly layers: Layer[] = [];
    threshold = 0;
    softness = 1;
    speed = 1;
    colors: string[] = ["#00000000", "#ffffffff"];

    private push(layer: Layer): LayerHandle {
        if (this.layers.length >= MAX_TEXTUREFX_LAYERS) {
            throw new Error(
                `[onejs texturefx] at most ${MAX_TEXTUREFX_LAYERS} layers; ` +
                "combine sources or raise MAX_LAYERS in OneJS/TextureFX.shader.");
        }
        const index = this.layers.push(layer) - 1;
        const setBlend = (b: number): LayerHandle => { layer.blend = b; return handle; };
        const handle: LayerHandle = {
            index,
            set: () => setBlend(BLEND.set),
            multiply: () => setBlend(BLEND.multiply),
            add: () => setBlend(BLEND.add),
            subtract: () => setBlend(BLEND.subtract),
            min: () => setBlend(BLEND.min),
            max: () => setBlend(BLEND.max),
            screen: () => setBlend(BLEND.screen),
        };
        return handle;
    }

    /** Scrolling fBm value noise. The workhorse: two of these multiplied is fire, smoke or water. */
    noise(o: NoiseOptions = {}): LayerHandle {
        return this.push({
            src: SRC.noise,
            blend: BLEND.set,
            scale: pair(o.scale, 4),
            octaves: Math.max(1, Math.min(4, o.octaves ?? 3)),
            seed: o.seed ?? 1,
            scroll: o.scroll ?? [0, 0],
            amount: o.amount ?? 1,
            shape: 0,
            params: [0, 0, 0, 0],
            params2: [0, 0, 0, 0],
            pos: [0, 0],
            rot: 0,
            uniformScale: 1,
            rounded: 0,
            onion: 0,
        });
    }

    /** A positional falloff that carves the silhouette. Not scaled or scrolled. */
    shape(kind: ShapeKind, o: ShapeOptions = {}): LayerHandle {
        const params: [number, number, number, number] =
            kind === "box"
                ? [o.width ?? 0.3, o.height ?? 0.4, o.softness ?? 0.1, 0]
                : kind === "flame"
                    ? [o.width ?? 0.44, o.taper ?? 0.7, o.softness ?? 0.05, o.falloff ?? 0.55]
                    : [o.falloff ?? 1, 0, 0, 0]; // radial / linear
        return this.push({
            src: SRC.shape,
            blend: BLEND.set,
            scale: [1, 1],
            octaves: 1,
            seed: 0,
            scroll: [0, 0],
            amount: o.amount ?? 1,
            shape: SHAPE[kind],
            params,
            params2: [0, 0, 0, 0],
            pos: [0, 0],
            rot: 0,
            uniformScale: 1,
            rounded: 0,
            onion: 0,
        });
    }

    /** A flat value, for biasing or flooring the stack. */
    constant(value: number): LayerHandle {
        return this.push({
            src: SRC.constant, blend: BLEND.set, scale: [1, 1], octaves: 1, seed: 0,
            scroll: [0, 0], amount: 1, shape: 0, params: [value, 0, 0, 0],
            params2: [0, 0, 0, 0], rounded: 0, onion: 0,
            pos: [0, 0], rot: 0, uniformScale: 1,
        });
    }

    /**
     * A signed distance shape: precise geometry with a hard, antialiased edge.
     *
     * Distinct from `shape()`, which is four soft positional falloffs meant for
     * carving noise. These are the real outlines, they take a transform, and
     * `rounded` / `onion` work on all of them. Both families have a "box"; they
     * are not the same thing and do not take the same options.
     *
     *     fx.sdf("hexagon", { r: 0.4, rounded: 0.04 })
     *     fx.sdf("star", { r: 0.35, points: 6, rotation: 15 }).subtract()
     */
    sdf<K extends SDFKind>(kind: K, o: SDFParams[K] & SDFCommonOptions = {} as any): LayerHandle {
        const [params, params2] = packSDF(kind, o as any);
        return this.push({
            src: SRC.sdf,
            blend: BLEND.set,
            scale: [1, 1],
            octaves: 1,
            seed: 0,
            // An sdf layer has no noise field, so _LScale carries its transform.
            pos: [o.x ?? 0, o.y ?? 0],
            rot: (o.rotation ?? 0) * DEG2RAD,
            uniformScale: o.scale ?? 1,
            scroll: [0, 0],
            amount: o.amount ?? 1,
            shape: SDF[kind],
            params,
            // z = edge softness, w = 1 to emit the raw field instead of a mask
            params2: [params2[0], params2[1], o.softness ?? 0.01, o.field ? 1 : 0],
            rounded: o.rounded ?? 0,
            onion: o.onion ?? 0,
        });
    }

    /**
     * Erodes the accumulated field to a defined edge before colouring. This is what
     * turns a soft blob into licks and wisps; without it everything looks like fog.
     */
    erode(threshold: number, softness = 0.3): this {
        this.threshold = threshold;
        this.softness = softness;
        return this;
    }

    /** Gradient the eroded value indexes. Alpha is carried, so cutoff lives here too. */
    ramp(colors: string[]): this {
        this.colors = colors;
        return this;
    }

    /** Multiplies every layer's scroll rate. */
    setSpeed(speed: number): this {
        this.speed = speed;
        return this;
    }

    /** Flattens to the uniforms OneJS/TextureFX expects. */
    compile() {
        if (this.layers.length === 0) throw new Error("[onejs texturefx] no layers");
        const scale: number[] = [], scroll: number[] = [], params: number[] = [];
        const params2: number[] = [], mode: number[] = [];
        for (const l of this.layers) {
            // _LScale is the one slot whose meaning depends on the source: a noise
            // layer needs scale/octaves/seed, an sdf layer needs a transform and
            // has no use for any of those.
            if (l.src === SRC.sdf) scale.push(l.pos[0], l.pos[1], l.rot, l.uniformScale);
            else scale.push(l.scale[0], l.scale[1], l.octaves, l.seed);
            // Scroll is authored element-relative but the shader samples in noise
            // space, so pre-multiply by scale here. Without this, raising scale
            // silently slows the animation.
            scroll.push(l.scroll[0] * l.scale[0], l.scroll[1] * l.scale[1], l.amount, l.shape);
            params.push(...l.params);
            params2.push(...l.params2);
            mode.push(l.src, l.blend, l.rounded, l.onion);
        }
        return {
            floats: {
                _LayerCount: this.layers.length,
                _Threshold: this.threshold,
                _Softness: this.softness,
                _Speed: this.speed,
            },
            vectorArrays: {
                _LScale: scale, _LScroll: scroll, _LParams: params,
                _LParams2: params2, _LMode: mode,
            },
            ramp: this.colors,
        };
    }
}

export type TextureFXBuild = (fx: TextureFXBuilder) => void;

/** Runs a build function and returns the flattened uniforms. */
export function buildTextureFX(build: TextureFXBuild) {
    const fx = new TextureFXBuilder();
    build(fx);
    return fx.compile();
}
