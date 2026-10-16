import { useEffect, useLayoutEffect, useRef } from "react"
import { Pass, applyShaderFxProps, reportNoPasses } from "./shader-props"
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
 * It keeps values over 1 and below 0 (16 bits a channel), so a bloom can
 * threshold what is brighter than white. A pass can read its own `previous`,
 * but not, through other passes, itself: that is refused, and says so.
 *
 * The pass lives as long as the component that made it.
 */
export function usePass<Names extends string = string>(program: CompiledProgram<Names>, options: PassOptions<Names> = {}): Pass {
    const made = useRef<Pass | null>(null)
    if (!made.current) made.current = new Pass(makeTarget())
    const pass = made.current
    const applied = useRef<Record<string, unknown> | undefined>(undefined)

    // Before the frame draws, and before a reader's draw can need it. Only
    // what changed crosses, as on a ShaderProgram.
    useLayoutEffect(() => {
        const target = pass.target
        if (!target) return
        const props = { program, uniforms: options.uniforms, textures: options.textures, resolution: options.resolution }
        applyShaderFxProps(target, props, applied.current)
        const scale = options.scale ?? 1
        if (scale !== ((applied.current?.scale as number | undefined) ?? 1)) target.Scale = scale
        applied.current = { ...props, scale }
    })
    useEffect(() => () => { pass.target?.Dispose() }, [pass])
    return pass
}
