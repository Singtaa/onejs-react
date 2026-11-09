import { useEffect, useLayoutEffect, useRef } from "react"
import { Pass, applyShaderFxProps, releaseLentTextures, reportNoPasses } from "./shader-props"
import type { CompiledProgram } from "./types"

export { Pass }

declare const CS: any

export interface PassOptions<Names extends string = string> {
    /** Uniform values by the name they were declared with, as on ShaderProgram. */
    uniforms?: Partial<Record<Names, number | readonly number[]>>
    /**
     * What the program's texture2D declarations read, by name: another pass,
     * a built-in texture's name, or a CS Texture, as on ShaderProgram.
     */
    textures?: Record<string, string | unknown>
    /**
     * Size in px. Omit to take the size of the picture the pass ends up in:
     * the element at the end of the chain, the largest if several.
     */
    resolution?: [number, number]
    /**
     * A fraction of that picture's size: 0.5 draws half as wide and half as
     * high. Each pass in a chain says its own, so a half size blur is every
     * pass of the blur at 0.5. Default 1.
     */
    scale?: number
    /**
     * Bits a channel the picture is kept at: 16, half floats, the default; or
     * 32, floats, for a value a half cannot hold, such as a height that is
     * stretched or lit. A 32-bit pass is not filtered, since many WebGL2 and
     * WebGPU devices cannot filter floats: a reader fetches its texels, and
     * a `sample` of it reads black on those devices. A device that cannot
     * draw floats at all keeps 16, and says so once.
     */
    bits?: 16 | 32
}

/** The C# pass, or null on a OneJS that has none, which is said once. */
function makeTarget(): any {
    try {
        const T = CS?.OneJS?.ShaderFX?.ShaderPass
        if (typeof T === "function") {
            const t = new T()
            if (t.AcceptsPasses === true) return t
        }
    } catch {
        // An older OneJS has no ShaderPass, and how a missing type reads
        // depends on the interop.
    }
    reportNoPasses()
    return null
}

/**
 * A program drawn into a texture every frame, for another program to read.
 *
 *     const scene = usePass(pathtrace, { uniforms: { spp } })
 *     const glow = usePass(blur, { textures: { src: scene }, scale: 0.5 })
 *     <ShaderProgram program={composite} textures={{ scene, glow }} />
 *
 * The reading program declares `texture2D scene;` and reads it as it reads
 * any texture. A pass is drawn each frame before anything that reads it, so
 * a reader sees this frame's picture, and not at all while nothing reads it.
 * It keeps values over 1 and below 0 (16 bits a channel, or `bits: 32`), so a bloom can
 * threshold what is brighter than white. A pass can read its own `previous`,
 * but not, through other passes, itself: that is refused, and says so.
 *
 * The pass lives as long as the component that made it.
 */
export function usePass<Names extends string = string>(program: CompiledProgram<Names>, options: PassOptions<Names> = {}): Pass {
    const made = useRef<DrawnPass<Names> | null>(null)
    if (!made.current) made.current = new DrawnPass<Names>(makeTarget())
    const drawn = made.current

    // Before the frame draws, and before a reader's draw can need it. Only
    // what changed crosses, as on a ShaderProgram.
    useLayoutEffect(() => { drawn.update(program, options) })
    useEffect(() => () => drawn.dispose(), [drawn])
    return drawn.pass
}

/**
 * A pass made outside a component, drawn only when asked: for a picture made
 * once, at load, rather than every frame.
 *
 *     const noise = createPass(perlin, { uniforms: { seed: 7 }, resolution: [512, 512] })
 *     const bent = createPass(warp, { textures: { src: noise.pass }, resolution: [512, 512] })
 *     while (!bent.draw() || !noise.compiled) await nextFrame()
 *     // bent.texture holds the picture now; dispose both when done with it.
 *
 * A page compiles a program in the background, so the first draws of a new
 * program draw nothing: `draw` says whether this one has. A pass it reads
 * draws first, in the same draw, so once every pass in a chain says
 * `compiled` after a draw of the last, the whole chain is drawn.
 */
export function createPass<Names extends string = string>(program: CompiledProgram<Names>, options: PassOptions<Names> = {}): DrawnPass<Names> {
    const drawn = new DrawnPass<Names>(makeTarget())
    drawn.update(program, options)
    return drawn
}

/** A step a draw advances a program's clock by: one frame at 60 Hz, since a step must move it. */
const DRAW_STEP = 1 / 60

/** A pass and what has crossed to it: what usePass keeps and createPass returns. */
export class DrawnPass<Names extends string = string> {
    /** What a ShaderProgram or another pass reads it as, through `textures`. */
    readonly pass: Pass
    private applied: Record<string, unknown> | undefined

    /** @internal */
    constructor(target: any) {
        this.pass = new Pass(target)
    }

    /** Sets the program and its options. Only what changed crosses. */
    update(program: CompiledProgram<Names>, options: PassOptions<Names> = {}): void {
        const target = this.pass.target
        if (!target) return
        const props = { program, uniforms: options.uniforms, textures: options.textures, resolution: options.resolution }
        applyShaderFxProps(target, props, this.applied)
        const scale = options.scale ?? 1
        if (scale !== ((this.applied?.scale as number | undefined) ?? 1)) target.Scale = scale
        const bits = options.bits ?? 16
        if (bits !== ((this.applied?.bits as number | undefined) ?? 16)) {
            if (typeof target.Bits !== "number") throw new Error("[OneJS] a 32-bit pass needs a newer OneJS: this one keeps passes at 16 bits")
            target.Bits = bits
        }
        this.applied = { ...props, scale, bits }
    }

    /**
     * Draws once, now, after the passes it reads. True when this program drew;
     * false while the page is still compiling it, or on a OneJS with no passes.
     */
    draw(): boolean {
        const target = this.pass.target
        if (!target) return false
        target.Step(DRAW_STEP)
        return this.compiled
    }

    /** Whether this program has drawn at least once: a page compiles it first. */
    get compiled(): boolean {
        return this.pass.target?.IsCompiled === true
    }

    /** The texture holding the last picture drawn, or null before the first. */
    get texture(): unknown {
        return this.pass.target?.Output ?? null
    }

    /** Lets go of the pass and what it borrowed. Nothing reading it sees a picture after this. */
    dispose(): void {
        const target = this.pass.target
        if (!target) return
        releaseLentTextures(target)
        target.Dispose()
    }
}
