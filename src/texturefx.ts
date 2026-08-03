/**
 * TextureFX - compose a procedural texture out of noise, shapes and blends.
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
const SRC = { noise: 0, shape: 1, constant: 2 } as const;
const BLEND = { set: 0, multiply: 1, add: 2, subtract: 3, min: 4, max: 5, screen: 6 } as const;
const SHAPE = { flame: 0, radial: 1, linear: 2, box: 3 } as const;

export type BlendMode = keyof typeof BLEND;
export type ShapeKind = keyof typeof SHAPE;

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
        });
    }

    /** A flat value, for biasing or flooring the stack. */
    constant(value: number): LayerHandle {
        return this.push({
            src: SRC.constant, blend: BLEND.set, scale: [1, 1], octaves: 1, seed: 0,
            scroll: [0, 0], amount: 1, shape: 0, params: [value, 0, 0, 0],
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
        const scale: number[] = [], scroll: number[] = [], params: number[] = [], mode: number[] = [];
        for (const l of this.layers) {
            scale.push(l.scale[0], l.scale[1], l.octaves, l.seed);
            // Scroll is authored element-relative but the shader samples in noise
            // space, so pre-multiply by scale here. Without this, raising scale
            // silently slows the animation.
            scroll.push(l.scroll[0] * l.scale[0], l.scroll[1] * l.scale[1], l.amount, l.shape);
            params.push(...l.params);
            mode.push(l.src, l.blend, 0, 0);
        }
        return {
            floats: {
                _LayerCount: this.layers.length,
                _Threshold: this.threshold,
                _Softness: this.softness,
                _Speed: this.speed,
            },
            vectorArrays: { _LScale: scale, _LScroll: scroll, _LParams: params, _LMode: mode },
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
