/**
 * One colour parser for every API that takes a colour, so a value moved from
 * `style` to a particle curve, a Painter or a shader means the same thing.
 */
import { describe, it, expect } from "vitest"
import { toRGBA } from "../color"
import { paintColor } from "../painter"
import { toWire } from "../particles"

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 3))

describe("toRGBA", () => {
    it("reads hex with or without #, in all four lengths", () => {
        close(toRGBA("#f80"), [1, 0x88 / 255, 0, 1])
        close(toRGBA("f808"), [1, 0x88 / 255, 0, 0x88 / 255])
        close(toRGBA("#ff8800"), [1, 0x88 / 255, 0, 1])
        close(toRGBA("ff880080"), [1, 0x88 / 255, 0, 0x80 / 255])
    })

    it("reads rgb() and rgba(), integer or percent", () => {
        close(toRGBA("rgb(255, 0, 0)"), [1, 0, 0, 1])
        close(toRGBA("rgba(0, 255, 0, 0.5)"), [0, 1, 0, 0.5])
        close(toRGBA("rgb(100%, 50%, 0%)"), [1, 0.5, 0, 1])
    })

    it("reads CSS names, any case", () => {
        close(toRGBA("Red"), [1, 0, 0, 1])
        close(toRGBA("transparent"), [0, 0, 0, 0])
    })

    it("reads arrays and {r, g, b, a} objects, alpha defaulting to 1", () => {
        close(toRGBA([0.1, 0.2, 0.3]), [0.1, 0.2, 0.3, 1])
        close(toRGBA([0.1, 0.2, 0.3, 0.4]), [0.1, 0.2, 0.3, 0.4])
        close(toRGBA({ r: 0.5, g: 0.6, b: 0.7 }), [0.5, 0.6, 0.7, 1])
    })

    it("throws naming the API and the value instead of returning NaN", () => {
        expect(() => toRGBA("red?", "colorOverLife")).toThrow(/colorOverLife: "red\?" is not a colour/)
        expect(() => toRGBA("#12345")).toThrow(/not a colour/)
        expect(() => toRGBA([1, 2] as any)).toThrow(/not a colour/)
    })
})

describe("every colour API uses it", () => {
    it("Painter takes names, rgb() and arrays", () => {
        close(paintColor("red"), [1, 0, 0, 1])
        close(paintColor("rgb(0, 0, 255)"), [0, 0, 1, 1])
    })

    it("particles take a CSS name instead of producing NaN", () => {
        const doc = toWire({ emitters: [{ colorOverLife: ["red", "#00f"] }] } as any)
        const [red, blue] = doc.emitters[0]!.colorKeys
        expect([red!.r, red!.g, red!.b, red!.a]).toEqual([1, 0, 0, 1])
        expect([blue!.r, blue!.g, blue!.b]).toEqual([0, 0, 1])
    })

    it("particles read an {r, g, b} colour as a colour, not as a keyed entry", () => {
        const doc = toWire({ emitters: [{ colorOverLife: [{ r: 1, g: 0, b: 0 }, { t: 1, color: "#00f" }] }] } as any)
        const [first, last] = doc.emitters[0]!.colorKeys
        expect([first!.t, first!.r, first!.a]).toEqual([0, 1, 1])
        expect([last!.t, last!.b]).toEqual([1, 1])
    })
})
