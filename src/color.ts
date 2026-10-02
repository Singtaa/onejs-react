/**
 * One colour parser for every OneJS API that takes a colour: style, Painter,
 * particles, ShaderEffect, TextureFX ramps, FrostedGlass and image fx. A value
 * moved from one to another means the same thing in both, and a value none of
 * them understands is an error that names the API, never a silent NaN.
 */

/**
 * A colour as any OneJS API accepts it:
 * - hex, with or without `#`: `"#f80"`, `"#f808"`, `"#ff8800"`, `"ff880080"`
 * - `"rgb(255, 136, 0)"`, `"rgba(255, 136, 0, 0.5)"`, channels as 0-255 or percent
 * - a CSS name: `"orange"`, `"transparent"`
 * - `[r, g, b]` or `[r, g, b, a]`, each 0 to 1
 * - `{ r, g, b, a? }`, each 0 to 1 (oj's Color, for one)
 */
export type ColorInput =
    | string
    | readonly [number, number, number]
    | readonly [number, number, number, number]
    | { readonly r: number; readonly g: number; readonly b: number; readonly a?: number }

/** Red, green, blue and alpha, each 0 to 1. */
export type RGBA = [number, number, number, number]

/** CSS colour names, the common set. */
export const NAMED_COLORS: Readonly<Record<string, RGBA>> = {
    transparent: [0, 0, 0, 0],
    black: [0, 0, 0, 1],
    white: [1, 1, 1, 1],
    red: [1, 0, 0, 1],
    green: [0, 0.502, 0, 1],  // CSS green is #008000
    blue: [0, 0, 1, 1],
    yellow: [1, 1, 0, 1],
    cyan: [0, 1, 1, 1],
    magenta: [1, 0, 1, 1],
    orange: [1, 0.647, 0, 1],
    purple: [0.502, 0, 0.502, 1],
    pink: [1, 0.753, 0.796, 1],
    brown: [0.647, 0.165, 0.165, 1],
    gray: [0.502, 0.502, 0.502, 1],
    grey: [0.502, 0.502, 0.502, 1],
    silver: [0.753, 0.753, 0.753, 1],
    gold: [1, 0.843, 0, 1],
    navy: [0, 0, 0.502, 1],
    teal: [0, 0.502, 0.502, 1],
    olive: [0.502, 0.502, 0, 1],
    maroon: [0.502, 0, 0, 1],
    aqua: [0, 1, 1, 1],
    lime: [0, 1, 0, 1],
    fuchsia: [1, 0, 1, 1],
}

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\s*\(\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*,\s*([\d.]+)(%?)\s*(?:,\s*([\d.]+)(%?))?\s*\)$/i

/**
 * Reads any colour OneJS accepts as `[r, g, b, a]`, each 0 to 1.
 * Throws, naming `what` (the API or field) and the value, when it is not one.
 */
export function toRGBA(c: ColorInput, what = "colour"): RGBA {
    const rgba = tryRGBA(c)
    if (rgba === null) {
        const shown = typeof c === "string" ? `"${c}"` : JSON.stringify(c)
        throw new Error(`${what}: ${shown} is not a colour; use #rgb, #rrggbbaa, rgb(), a CSS name, [r, g, b, a] or { r, g, b, a }`)
    }
    return rgba
}

/** toRGBA without the throw: null when `c` is not a colour. */
export function tryRGBA(c: unknown): RGBA | null {
    if (typeof c === "string") return parseColorString(c)
    if (Array.isArray(c)) {
        if ((c.length !== 3 && c.length !== 4) || !c.every(isNumber)) return null
        const n = c as number[]
        return [n[0]!, n[1]!, n[2]!, n.length === 4 ? n[3]! : 1]
    }
    if (c !== null && typeof c === "object") {
        const o = c as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
        if (!isNumber(o.r) || !isNumber(o.g) || !isNumber(o.b)) return null
        if (o.a === undefined) return [o.r, o.g, o.b, 1]
        return isNumber(o.a) ? [o.r, o.g, o.b, o.a] : null
    }
    return null
}

function parseColorString(value: string): RGBA | null {
    const s = value.trim().toLowerCase()
    const named = NAMED_COLORS[s]
    if (named) return [...named]

    const hex = HEX.exec(s)
    if (hex) {
        const h = hex[1]!
        const short = h.length <= 4
        const channel = (i: number) => parseInt(short ? h[i]! + h[i]! : h.slice(i * 2, i * 2 + 2), 16) / 255
        const hasAlpha = h.length === 4 || h.length === 8
        return [channel(0), channel(1), channel(2), hasAlpha ? channel(3) : 1]
    }

    const rgb = RGB.exec(s)
    if (rgb) {
        const channel = (v: string, pct: string) => clamp01(parseFloat(v) / (pct === "%" ? 100 : 255))
        const a = rgb[7] === undefined ? 1 : clamp01(parseFloat(rgb[7]) / (rgb[8] === "%" ? 100 : 1))
        return [channel(rgb[1]!, rgb[2]!), channel(rgb[3]!, rgb[4]!), channel(rgb[5]!, rgb[6]!), a]
    }
    return null
}

function isNumber(v: unknown): v is number {
    return typeof v === "number" && !Number.isNaN(v)
}

function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n
}
