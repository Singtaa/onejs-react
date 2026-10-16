/**
 * The props of a shader element and of a pass, applied to the C# object that
 * draws them. A ShaderEffectElement and a ShaderPass take the same calls, so
 * one function serves both: the element through host-config, a pass through
 * usePass.
 */
import {toRGBA} from './color';

/**
 * A program drawn into a texture every frame, made by `usePass`. Hand it to
 * `textures` on a ShaderProgram or another pass, under the name of a
 * texture2D the reading program declares.
 */
export class Pass {
    /**
     * The C# ShaderPass that draws it, or null on a OneJS without passes.
     * @internal
     */
    readonly target: any;

    /** @internal */
    constructor(target: any) {
        this.target = target;
    }
}

/** Whether the element or pass reads passes: OneJS from 3.9.11 says so. */
function acceptsPasses(el: any): boolean {
    try { return el.AcceptsPasses === true; } catch { return false; }
}

/**
 * Passes on a OneJS that has none, said once. A program reading one reads
 * nothing from it there, which is still a picture, so this is a line and not
 * a refusal.
 */
let reportedNoPasses = false;
export function reportNoPasses() {
    if (reportedNoPasses) return;
    reportedNoPasses = true;
    console.error(`[onejs-react] usePass needs OneJS 3.9.11 or newer; a program reading a pass reads nothing from it here. Update OneJS.`);
}

/** A pass handed to a shader that is not a program, which has no slots to read it by: said once. */
let warnedPassOnShader = false;
function warnPassOnShader() {
    if (warnedPassOnShader) return;
    warnedPassOnShader = true;
    console.warn(`[onejs-react] ShaderEffect: a pass is read by a ShaderProgram's texture2D; a shader by name cannot read one.`);
}

/**
 * A uniform name the program never declared, warned once per program.
 *
 * Names are strings on both sides, so a typo in `uniforms={{ wrap: v }}` type
 * checks, sets nothing and draws the default forever. Dropping it silently
 * turned that into "the slider does nothing" with no line to look at.
 */
const warnedUniforms = new Set<string>();
function warnUnknownUniform(hash: string | undefined, name: string, declared: readonly string[] | undefined) {
    const key = `${hash ?? ''}:${name}`;
    if (warnedUniforms.has(key)) return;
    warnedUniforms.add(key);
    const known = declared && declared.length > 0 ? declared.map((n) => `"${n}"`).join(', ') : 'none';
    console.warn(`[onejs-react] ShaderProgram: no uniform named "${name}" in this program (declared: ${known}). Check the name passed to sl.uniform.`);
}

const warnedTextures = new Set<string>();
function warnUnknownTexture(hash: string | undefined, name: string, declared: readonly string[] | undefined) {
    const key = `${hash ?? ''}:${name}`;
    if (warnedTextures.has(key)) return;
    warnedTextures.add(key);
    const known = declared && declared.length > 0 ? declared.map((n) => `"${n}"`).join(', ') : 'none';
    console.warn(`[onejs-react] ShaderProgram: no texture named "${name}" in this program (declared: ${known}). Check the name in the texture2D declaration.`);
}

/**
 * Whether the element draws a compiled program: OneJS 3.7 and newer say so.
 * Read in a try, since how a missing member reads depends on the interop, and
 * an older OneJS has none.
 */
function acceptsCompiledPrograms(el: any): boolean {
    try { return el.AcceptsCompiledPrograms === true; } catch { return false; }
}

/**
 * A program on a OneJS too old to take one, said once per program.
 *
 * The npm packages and OneJS update separately, so a project can bump the npm
 * side past the Unity side. The alternative to this line is an empty element
 * that points at neither package.
 */
const reportedOldOneJS = new Set<string>();
function reportOldOneJS(hash: string) {
    if (reportedOldOneJS.has(hash)) return;
    reportedOldOneJS.add(hash);
    console.error(`[onejs-react] shader program ${hash} needs OneJS 3.7 or newer. Update OneJS, or keep onejs-react below 0.2 and onejs-unity below 0.6.`);
}

/**
 * Whether the element steps a program: keeps the frame it drew before, counts
 * frames and hands over the step. OneJS says so from the release that added
 * `previous`, `frame` and `deltaTime` to the shader language.
 */
function acceptsSteppedPrograms(el: any): boolean {
    try { return el.AcceptsSteppedPrograms === true; } catch { return false; }
}

/** The OneJS that first steps a program, for the one line an older one gets. */
const STEPPED_ONEJS = '3.9.1';

/** Whether the element can show hard pixels: OneJS from 3.9.11 has `Pixelated`. */
function canPixelate(el: any): boolean {
    try { return typeof el.Pixelated === 'boolean'; } catch { return false; }
}

/** The OneJS that first shows hard pixels, for the one line an older one gets. */
const PIXELATED_ONEJS = '3.9.11';

/**
 * `pixelated` on a OneJS that cannot, said once. The picture still draws,
 * smoothed, so this is a line and not a refusal.
 */
let reportedNoPixelated = false;
function reportNoPixelated() {
    if (reportedNoPixelated) return;
    reportedNoPixelated = true;
    console.error(`[onejs-react] pixelated needs OneJS ${PIXELATED_ONEJS} or newer; this one smooths the picture. Update OneJS.`);
}

/** Whether a program reads anything a host keeps between frames. A program built before `reads` existed reads none. */
function readsBetweenFrames(p: any): boolean {
    const r = p.reads;
    return r != null && (r.previous === true || r.frame === true || r.deltaTime === true);
}

/**
 * A program that reads the previous frame, frame or deltaTime on a OneJS that
 * cannot step it, said once per program. Such a OneJS would draw it with a
 * clear previous frame and frame 0 forever: a picture, and the wrong one.
 */
const reportedUnstepped = new Set<string>();
function reportUnstepped(hash: string) {
    if (reportedUnstepped.has(hash)) return;
    reportedUnstepped.add(hash);
    console.error(`[onejs-react] shader program ${hash} reads the previous frame, frame or deltaTime, which needs OneJS ${STEPPED_ONEJS} or newer. Update OneJS.`);
}

const shaderValueEq = (a: any, b: any) => {
    if (a === b) return true;
    // An inline vector (`tint: [1, 0.5, 0, 1]`) is a new array every render
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
};

const shaderShallowEq = (a: any, b: any) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => shaderValueEq(a[k], b[k]));
};

/**
 * Applies ShaderEffect props. Each setter is one interop crossing and the
 * element re-applies them before every blit, so ordering against shader/material
 * creation does not matter. Dictionaries are compared shallowly, which is enough
 * because effect props are flat numbers, strings and short number arrays.
 */
export function applyShaderFxProps(el: any, props: any, oldProps?: any) {
    if (props.shader !== undefined && props.shader !== oldProps?.shader) el.SetShader(props.shader);

    // A compiled program, handed over by hash. Compared by
    // hash rather than by identity because a program is usually built inline in
    // a component body, so a fresh object arrives on every render while the
    // program itself has not changed. Comparing identity would rebuild the
    // material, drop the render target and restart the clock sixty times a
    // second.
    // A new program is a new material, and the values set on the old one went
    // with it, so the caller's uniforms and textures go again below even when
    // they did not change (a live .sl swap in the Play editor, the Ghost Hunt
    // dry run of 1 Oct 2026, or a cart picking between two programs).
    const newProgram = props.program !== undefined && props.program?.hash !== oldProps?.program?.hash;
    if (newProgram) {
        const p = props.program;
        // The names go with the program, because the native backend binds its
        // uniforms as per name material properties and only the program knows
        // which name owns which slot.
        //
        // SetProgram keeps the removed VM's three leading arguments, which
        // every OneJS since 3.7 ignores; an empty buffer and two zeros fill
        // them. A buffer an older bundle still carries is never sent.
        let wantsSource: unknown;
        const stepped = acceptsSteppedPrograms(el);
        let bound = acceptsCompiledPrograms(el);
        if (!bound) reportOldOneJS(p.hash);
        else if (!stepped && readsBetweenFrames(p)) {
            reportUnstepped(p.hash);
            bound = false;
        } else {
            // The element reads what the program keeps between frames from the
            // compiled shader itself, so nothing more crosses here.
            wantsSource = el.SetProgram(new Float32Array(0), 0, 0, p.hash, p.uniforms ?? []);
        }
        if (bound) {
            /**
             * The declared defaults, seeded before anything the caller passes.
             *
             * The generated shader carries them in its Properties block, so a
             * compiled material starts at them; the web host's uniform array
             * starts at zero. Without this an unset uniform was its declared
             * default in the editor and zero in the browser, from one program,
             * with nothing to see in either. `props.uniforms` is applied further down and writes over
             * whatever it names.
             */
            const defaults = p.defaults;
            if (defaults) {
                for (let slot = 0; slot * 4 < defaults.length; slot++) {
                    const at = slot * 4;
                    el.SetUniform(slot, defaults[at] ?? 0, defaults[at + 1] ?? 0,
                        defaults[at + 2] ?? 0, defaults[at + 3] ?? 0);
                }
            }
            // True only from an editor that has no compiled shader for this hash.
            // It records the HLSL and generates one, so the next run is native; the
            // getter is lazy, so a game in Play never emits a line of it.
            if (wantsSource === true) {
                const hlsl = p.hlsl;
                if (typeof hlsl === 'string') el.RecordProgram(p.hash, hlsl);
            }
            // A WebGL player compiles the program itself. Asked first, so nowhere
            // else pays for the strings (or, for a compile() result, for printing
            // them).
            // `in`, not a read: on a compile() result these are lazy getters.
            if ('wgsl' in p || 'glsl' in p) {
                if (el.WantsWebSource === true) el.SetProgramWeb(p.wgsl ?? '', p.glsl ?? '');
            }
        }
    }

    if (props.resolution !== undefined || oldProps?.resolution !== undefined) {
        const r = props.resolution;
        const o = oldProps?.resolution;
        if (!r || !o || r[0] !== o[0] || r[1] !== o[1]) {
            // 0,0 tells the element to follow its own layout size.
            el.SetResolution(r ? r[0] : 0, r ? r[1] : 0);
        }
    }

    if (props.floats && !shaderShallowEq(props.floats, oldProps?.floats)) {
        for (const k in props.floats) el.SetFloat(k, props.floats[k]);
    }
    /**
     * A program's uniforms go by SLOT. The element resolves the slot through
     * the names handed over with the program, and the bridge behind it writes
     * to whichever backend is live: a material property on a generated shader,
     * the uniform array in a browser.
     */
    if (props.uniforms && (newProgram || !shaderShallowEq(props.uniforms, oldProps?.uniforms))) {
        const names = props.program?.uniforms;
        for (const k in props.uniforms) {
            const slot = names ? names.indexOf(k) : -1;
            if (slot < 0) {
                warnUnknownUniform(props.program?.hash, k, names);
                continue;
            }
            const v = props.uniforms[k];
            if (typeof v === 'number') el.SetUniform(slot, v, 0, 0, 0);
            else el.SetUniform(slot, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
        }
    }
    if (props.vectors && !shaderShallowEq(props.vectors, oldProps?.vectors)) {
        for (const k in props.vectors) {
            const v = props.vectors[k];
            el.SetVector(k, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
        }
    }
    if (props.vectorArrays) {
        for (const k in props.vectorArrays) {
            const a = props.vectorArrays[k];
            const o = oldProps?.vectorArrays?.[k];
            if (!o || o.length !== a.length || a.some((v: number, i: number) => v !== o[i])) {
                // Float32Array so the bootstrap marshals it as a float array
                el.SetVectorArray(k, Float32Array.from(a));
            }
        }
    }
    if (props.colors && !shaderShallowEq(props.colors, oldProps?.colors)) {
        for (const k in props.colors) {
            const [r, g, b, a] = toRGBA(props.colors[k], `ShaderEffect colors.${k}`);
            el.SetColor(k, r, g, b, a);
        }
    }
    if (props.textures && (newProgram || !shaderShallowEq(props.textures, oldProps?.textures))) {
        /**
         * A program's textures go by SLOT, the way its uniforms do.
         *
         * Both backends declare _Tex0, _Tex1 and on, so a material property named
         * after what the author wrote ("grain") reached neither: the picture
         * came out as whatever an unbound sampler is, in the browser and after
         * an eject alike, with nothing said about it. The names ride with the
         * program because only the program knows which slot owns which.
         */
        const slots = props.program?.textures;
        for (const k in props.textures) {
            const t = props.textures[k];
            if (slots) {
                const slot = slots.indexOf(k);
                if (slot < 0) {
                    warnUnknownTexture(props.program?.hash, k, slots);
                    continue;
                }
                // A pass, drawn before this reads it; a string, a built-in
                // procedural texture; anything else, a CS Texture.
                if (t instanceof Pass) {
                    if (t.target && acceptsPasses(el)) el.SetProgramPass(slot, t.target);
                    else reportNoPasses();
                } else if (typeof t === 'string') el.SetProgramBuiltinTexture(slot, t);
                else if (t) el.SetProgramTexture(slot, t);
                continue;
            }
            if (t instanceof Pass) warnPassOnShader();
            else if (typeof t === 'string') el.SetBuiltinTexture(k, t);
            else if (t) el.SetTexture(k, t);
        }
    }
    if (props.ramp !== undefined) {
        const same = oldProps?.ramp && oldProps.ramp.length === props.ramp.length
            && props.ramp.every((c: unknown, i: number) => shaderValueEq(c, oldProps.ramp[i]));
        if (!same) {
            const flat: number[] = [];
            for (const c of props.ramp) flat.push(...toRGBA(c, 'TextureFX ramp'));
            el.SetRamp(props.rampProperty ?? '_Ramp', flat);
        }
    }
    if (props.paused !== undefined && props.paused !== oldProps?.paused) {
        if (props.paused) el.Pause(); else el.Resume();
    }
    // Hard-edged pixels for a picture smaller than its element. Removing the
    // prop turns them off, back to the smoothing the element always did.
    const pixelated = props.pixelated === true;
    if (pixelated !== (oldProps?.pixelated === true)) {
        if (canPixelate(el)) el.Pixelated = pixelated;
        else if (pixelated) reportNoPixelated();
    }
}
