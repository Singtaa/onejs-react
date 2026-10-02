/**
 * Tests for style-parser.ts: style value parsing utilities
 *
 * Tests cover:
 * - Length parsing (numbers, "px", "%", "auto") into plain { value, unit } and { keyword }
 * - Color parsing (hex, rgb, rgba, named colors)
 * - parseStyleValue dispatcher
 */

import { describe, it, expect } from "vitest"
import { parseLength, parseColor, parseStyleValue } from "../style-parser"
import { MockColor, MockStyleKeyword } from "./mocks"

type PlainPixels = { value: number; unit: number }

describe("style-parser", () => {
    describe("parseLength", () => {
        it("parses number as pixels", () => {
            const result = parseLength(100) as PlainPixels
            expect(result.value).toBe(100)
            expect(result.unit).toBe(0) // Pixel
        })

        it("parses negative number as pixels", () => {
            const result = parseLength(-50) as PlainPixels
            expect(result.value).toBe(-50)
        })

        it("parses float number as pixels", () => {
            const result = parseLength(10.5) as PlainPixels
            expect(result.value).toBe(10.5)
        })

        it("parses string without unit as pixels", () => {
            const result = parseLength("100") as PlainPixels
            expect(result.value).toBe(100)
            expect(result.unit).toBe(0)
        })

        it("parses 'px' suffix as pixels", () => {
            const result = parseLength("200px") as PlainPixels
            expect(result.value).toBe(200)
            expect(result.unit).toBe(0)
        })

        it("parses '%' suffix as percent", () => {
            const result = parseLength("50%") as PlainPixels
            expect(result.value).toBe(50)
            expect(result.unit).toBe(1) // Percent
        })

        it("parses negative percentage", () => {
            const result = parseLength("-25%") as PlainPixels
            expect(result.value).toBe(-25)
            expect(result.unit).toBe(1)
        })

        it("parses decimal percentage", () => {
            const result = parseLength("33.33%") as PlainPixels
            expect(result.value).toBeCloseTo(33.33)
            expect(result.unit).toBe(1)
        })

        it("returns StyleKeyword.Auto for 'auto'", () => {
            const result = parseLength("auto")
            expect(result).toEqual({ keyword: MockStyleKeyword.Auto })
        })

        it("returns StyleKeyword.None for 'none'", () => {
            const result = parseLength("none")
            expect(result).toEqual({ keyword: MockStyleKeyword.None })
        })

        it("returns StyleKeyword.Initial for 'initial'", () => {
            const result = parseLength("initial")
            expect(result).toEqual({ keyword: MockStyleKeyword.Initial })
        })

        it("handles whitespace in string values", () => {
            const result = parseLength("  100px  ") as PlainPixels
            expect(result.value).toBe(100)
        })

        it("is case insensitive for keywords", () => {
            expect(parseLength("AUTO")).toEqual({ keyword: MockStyleKeyword.Auto })
            expect(parseLength("Auto")).toEqual({ keyword: MockStyleKeyword.Auto })
        })

        it("returns null for invalid string", () => {
            expect(parseLength("invalid")).toBeNull()
            expect(parseLength("px")).toBeNull()
            expect(parseLength("100em")).toBeNull()
        })
    })

    describe("parseColor", () => {
        describe("hex colors", () => {
            it("parses 3-digit hex (#rgb)", () => {
                const result = parseColor("#fff") as MockColor
                expect(result).toBeInstanceOf(MockColor)
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBeCloseTo(1)
                expect(result.b).toBeCloseTo(1)
                expect(result.a).toBe(1)
            })

            it("parses 3-digit hex with colors", () => {
                const result = parseColor("#f00") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
            })

            it("parses 4-digit hex (#rgba)", () => {
                const result = parseColor("#fff8") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBeCloseTo(1)
                expect(result.b).toBeCloseTo(1)
                expect(result.a).toBeCloseTo(0.533, 2)
            })

            it("parses 6-digit hex (#rrggbb)", () => {
                const result = parseColor("#ff0000") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
                expect(result.a).toBe(1)
            })

            it("parses 6-digit hex with mixed values", () => {
                const result = parseColor("#3498db") as MockColor
                expect(result.r).toBeCloseTo(0.204, 2)
                expect(result.g).toBeCloseTo(0.596, 2)
                expect(result.b).toBeCloseTo(0.859, 2)
            })

            it("parses 8-digit hex (#rrggbbaa)", () => {
                const result = parseColor("#ff000080") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
                expect(result.a).toBeCloseTo(0.502, 2)
            })

            it("handles uppercase hex", () => {
                const result = parseColor("#FF0000") as MockColor
                expect(result.r).toBeCloseTo(1)
            })

            it("returns null for invalid hex length", () => {
                expect(parseColor("#ff")).toBeNull()
                expect(parseColor("#fffff")).toBeNull()
                expect(parseColor("#fffffff")).toBeNull()
            })
        })

        describe("rgb/rgba colors", () => {
            it("parses rgb(r, g, b)", () => {
                const result = parseColor("rgb(255, 0, 0)") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
                expect(result.a).toBe(1)
            })

            it("parses rgba(r, g, b, a)", () => {
                const result = parseColor("rgba(255, 128, 0, 0.5)") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBeCloseTo(0.502, 2)
                expect(result.b).toBe(0)
                expect(result.a).toBe(0.5)
            })

            it("handles whitespace in rgb", () => {
                const result = parseColor("rgb( 255 , 255 , 255 )") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBeCloseTo(1)
                expect(result.b).toBeCloseTo(1)
            })

            it("clamps values above 255", () => {
                const result = parseColor("rgb(300, 0, 0)") as MockColor
                expect(result.r).toBe(1)
            })

            it("clamps alpha above 1", () => {
                const result = parseColor("rgba(255, 0, 0, 2)") as MockColor
                expect(result.a).toBe(1)
            })

            it("parses rgb with percentage values", () => {
                const result = parseColor("rgb(100%, 50%, 0%)") as MockColor
                expect(result.r).toBeCloseTo(1)
                expect(result.g).toBeCloseTo(0.5)
                expect(result.b).toBe(0)
            })
        })

        describe("named colors", () => {
            it("parses 'red'", () => {
                const result = parseColor("red") as MockColor
                expect(result.r).toBe(1)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
            })

            it("parses 'blue'", () => {
                const result = parseColor("blue") as MockColor
                expect(result.r).toBe(0)
                expect(result.g).toBe(0)
                expect(result.b).toBe(1)
            })

            it("parses 'transparent'", () => {
                const result = parseColor("transparent") as MockColor
                expect(result.a).toBe(0)
            })

            it("parses 'white'", () => {
                const result = parseColor("white") as MockColor
                expect(result.r).toBe(1)
                expect(result.g).toBe(1)
                expect(result.b).toBe(1)
            })

            it("parses 'black'", () => {
                const result = parseColor("black") as MockColor
                expect(result.r).toBe(0)
                expect(result.g).toBe(0)
                expect(result.b).toBe(0)
            })

            it("is case insensitive", () => {
                expect(parseColor("RED")).toBeTruthy()
                expect(parseColor("Red")).toBeTruthy()
            })

            it("returns null for unknown color names", () => {
                expect(parseColor("notacolor")).toBeNull()
            })
        })
    })

    describe("parseStyleValue", () => {
        it("parses length properties with numbers", () => {
            const result = parseStyleValue("width", 100) as PlainPixels
            expect(result.value).toBe(100)
        })

        it("parses length properties with string values", () => {
            const result = parseStyleValue("height", "50%") as PlainPixels
            expect(result.value).toBe(50)
            expect(result.unit).toBe(1) // Percent
        })

        it("parses padding shorthand", () => {
            const result = parseStyleValue("padding", 16) as PlainPixels
            expect(result.value).toBe(16)
        })

        it("parses margin with percentage", () => {
            const result = parseStyleValue("marginTop", "10%") as PlainPixels
            expect(result.unit).toBe(1)
        })

        it("parses borderRadius", () => {
            const result = parseStyleValue("borderRadius", 8) as PlainPixels
            expect(result.value).toBe(8)
        })

        it("parses borderWidth as plain number (StyleFloat)", () => {
            const result = parseStyleValue("borderWidth", 1)
            expect(result).toBe(1)
        })

        it("parses fontSize", () => {
            const result = parseStyleValue("fontSize", 16) as PlainPixels
            expect(result.value).toBe(16)
        })

        it("parses color properties", () => {
            const result = parseStyleValue("backgroundColor", "#ff0000") as MockColor
            expect(result.r).toBeCloseTo(1)
        })

        it("parses borderColor", () => {
            const result = parseStyleValue("borderColor", "rgba(0,0,0,0.1)") as MockColor
            expect(result.a).toBeCloseTo(0.1)
        })

        it("parses color with named value", () => {
            const result = parseStyleValue("color", "blue") as MockColor
            expect(result.b).toBe(1)
        })

        it("passes through number properties unchanged", () => {
            expect(parseStyleValue("opacity", 0.5)).toBe(0.5)
            expect(parseStyleValue("flexGrow", 1)).toBe(1)
            expect(parseStyleValue("flexShrink", 0)).toBe(0)
        })

        it("converts enum properties to Unity enum member names", () => {
            expect(parseStyleValue("flexDirection", "row")).toBe("Row")
            expect(parseStyleValue("display", "none")).toBe("None")
            expect(parseStyleValue("position", "absolute")).toBe("Absolute")
        })

        it("passes through unknown properties unchanged", () => {
            expect(parseStyleValue("unknownProp", "value")).toBe("value")
        })

        it("handles null and undefined", () => {
            expect(parseStyleValue("width", null)).toBeNull()
            expect(parseStyleValue("width", undefined)).toBeUndefined()
        })
    })
})

describe('justifyContent space-evenly', () => {
    it('maps to Justify.SpaceEvenly', () => {
        expect(parseStyleValue('justifyContent', 'space-evenly')).toBe('SpaceEvenly')
    })
})

/**
 * Style values cross to StyleBridge.ApplyStyles as plain data, so building a
 * style costs no C# call. Each shape is one StyleBridge already reads:
 * {value, unit} and {keyword} through the StyleLength deserializer,
 * {r, g, b, a} through ResolveValue's Color reconstruction, and an enum
 * member's name through ConvertToTargetType's StyleEnum<T> string parse.
 */
describe("style values as plain data", () => {
    it("sends a length as { value, unit }", () => {
        expect(parseStyleValue("width", 100)).toStrictEqual({ value: 100, unit: 0 })
        expect(parseStyleValue("height", "50%")).toStrictEqual({ value: 50, unit: 1 })
        expect(parseStyleValue("marginTop", "-4px")).toStrictEqual({ value: -4, unit: 0 })
        expect(parseStyleValue("fontSize", "12")).toStrictEqual({ value: 12, unit: 0 })
    })

    it("sends a length keyword as { keyword }", () => {
        expect(parseStyleValue("width", "auto")).toStrictEqual({ keyword: MockStyleKeyword.Auto })
        expect(parseStyleValue("maxWidth", "none")).toStrictEqual({ keyword: MockStyleKeyword.None })
        expect(parseStyleValue("left", "initial")).toStrictEqual({ keyword: MockStyleKeyword.Initial })
    })

    it("sends a colour as { r, g, b, a }, from any colour form", () => {
        expect(parseStyleValue("backgroundColor", "#ff0000")).toStrictEqual({ r: 1, g: 0, b: 0, a: 1 })
        expect(parseStyleValue("color", [0, 1, 0, 0.5])).toStrictEqual({ r: 0, g: 1, b: 0, a: 0.5 })
        expect(parseStyleValue("borderTopColor", { r: 0, g: 0, b: 1, a: 1 })).toStrictEqual({ r: 0, g: 0, b: 1, a: 1 })
    })

    it("sends an enum as the Unity member's name", () => {
        expect(parseStyleValue("flexDirection", "row-reverse")).toBe("RowReverse")
        expect(parseStyleValue("justifyContent", "space-between")).toBe("SpaceBetween")
        expect(parseStyleValue("display", "none")).toBe("None")
        expect(parseStyleValue("unityFontStyleAndWeight", "bold-and-italic")).toBe("BoldAndItalic")
        expect(parseStyleValue("unityOverflowClipBox", "content-box")).toBe("ContentBox")
    })

    it("makes no C# call to build a length, a colour or an enum", () => {
        const UIE = (globalThis as any).CS.UnityEngine.UIElements
        const UE = (globalThis as any).CS.UnityEngine
        const crossing = () => { throw new Error("C# constructor called") }
        UIE.Length = crossing
        UE.Color = crossing
        for (const name of ["FlexDirection", "Wrap", "Align", "Justify", "Position", "Overflow", "DisplayStyle", "Visibility", "WhiteSpace", "TextOverflow", "TextOverflowPosition", "OverflowClipBox"]) {
            delete UIE[name]
        }
        delete UE.FontStyle

        expect(() => {
            parseStyleValue("width", 10)
            parseStyleValue("width", "auto")
            parseStyleValue("backgroundColor", "red")
            parseStyleValue("flexDirection", "row")
            parseStyleValue("unityFontStyleAndWeight", "bold")
        }).not.toThrow()
    })
})
