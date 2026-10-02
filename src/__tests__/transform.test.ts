/**
 * Ported from oj, whose chainable Transform2D moved here so there is one. The
 * one difference: point() returns a CS Vector2 by default (what raw Painter2D
 * takes), and a subclass can return its own point type through makePoint.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { Transform2D, type PathSink } from "../transform"

beforeEach(() => {
    ;(globalThis as any).CS.UnityEngine.Vector2 = class { constructor(public x: number, public y: number) {} }
})

const TAU = Math.PI * 2
const CW = 0
const CCW = 1

type Call = { op: string; args: number[] }

class RecordingSink implements PathSink {
    calls: Call[] = []
    private push(op: string, ...args: number[]) { this.calls.push({ op, args }) }
    beginPath() { this.push("beginPath") }
    closePath() { this.push("closePath") }
    moveTo(x: number, y: number) { this.push("moveTo", x, y) }
    lineTo(x: number, y: number) { this.push("lineTo", x, y) }
    bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number) {
        this.push("bezierCurveTo", a, b, c, d, e, f)
    }
    quadraticCurveTo(a: number, b: number, c: number, d: number) { this.push("quadraticCurveTo", a, b, c, d) }
    arc(cx: number, cy: number, r: number, s: number, e: number, dir = 0) { this.push("arc", cx, cy, r, s, e, dir) }
    ops() { return this.calls.map((c) => c.op) }
}

/** Inverse of an affine matrix, for checking a transformed point against its source. */
function invert(t: Transform2D) {
    const [a, b, c, d, e, f] = t.values
    const det = a * d - b * c
    return (x: number, y: number) => ({
        x: (d * x - c * y + (c * f - d * e)) / det,
        y: (-b * x + a * y + (b * e - a * f)) / det,
    })
}

function cubicAt(p0: [number, number], c1: [number, number], c2: [number, number], p3: [number, number], t: number) {
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    return {
        x: w0 * p0[0] + w1 * c1[0] + w2 * c2[0] + w3 * p3[0],
        y: w0 * p0[1] + w1 * c1[1] + w2 * c2[1] + w3 * p3[1],
    }
}

/** Every point the emitted path traces, densely sampled. */
function samplePath(calls: Call[]): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = []
    let cur: [number, number] = [0, 0]
    for (const c of calls) {
        if (c.op === "moveTo" || c.op === "lineTo") {
            cur = [c.args[0]!, c.args[1]!]
            out.push({ x: cur[0], y: cur[1] })
        } else if (c.op === "bezierCurveTo") {
            const c1: [number, number] = [c.args[0]!, c.args[1]!]
            const c2: [number, number] = [c.args[2]!, c.args[3]!]
            const p3: [number, number] = [c.args[4]!, c.args[5]!]
            for (let i = 1; i <= 12; i++) out.push(cubicAt(cur, c1, c2, p3, i / 12))
            cur = p3
        }
    }
    return out
}

describe("Transform2D matrix", () => {
    it("starts as identity", () => {
        expect(new Transform2D().values).toEqual([1, 0, 0, 1, 0, 0])
        const p = new Transform2D().point(3, 7)
        expect(p.x).toBe(3)
        expect(p.y).toBe(7)
    })

    it("translates", () => {
        const p = new Transform2D().translate(10, 20).point(1, 2)
        expect(p.x).toBe(11)
        expect(p.y).toBe(22)
    })

    it("rotates around the current origin", () => {
        const p = new Transform2D().rotate(Math.PI / 2).point(1, 0)
        expect(p.x).toBeCloseTo(0, 12)
        expect(p.y).toBeCloseTo(1, 12)
    })

    it("scales, defaulting y to x", () => {
        expect(new Transform2D().scale(2).point(3, 4).x).toBe(6)
        expect(new Transform2D().scale(2).point(3, 4).y).toBe(8)
        expect(new Transform2D().scale(2, 1).point(3, 4).y).toBe(4)
    })

    it("applies operations in order, so translate then rotate differs from rotate then translate", () => {
        const a = new Transform2D().translate(10, 0).rotate(Math.PI / 2).point(1, 0)
        const b = new Transform2D().rotate(Math.PI / 2).translate(10, 0).point(1, 0)
        expect(a.x).toBeCloseTo(10, 12)
        expect(a.y).toBeCloseTo(1, 12)
        expect(b.x).toBeCloseTo(0, 12)
        expect(b.y).toBeCloseTo(11, 12)
    })

    it("chains, since every op returns this", () => {
        const t = new Transform2D()
        expect(t.translate(1, 1).rotate(0.3).scale(2)).toBe(t)
    })

    describe("save and restore", () => {
        it("returns to the saved matrix", () => {
            const t = new Transform2D().translate(10, 10)
            t.save()
            t.rotate(1).scale(3)
            t.restore()
            expect(t.values).toEqual(new Transform2D().translate(10, 10).values)
        })
        it("nests", () => {
            const t = new Transform2D()
            t.translate(1, 0); t.save()
            t.translate(2, 0); t.save()
            t.translate(4, 0)
            expect(t.point(0, 0).x).toBe(7)
            t.restore()
            expect(t.point(0, 0).x).toBe(3)
            t.restore()
            expect(t.point(0, 0).x).toBe(1)
        })
        it("tracks depth", () => {
            const t = new Transform2D()
            expect(t.depth).toBe(0)
            t.save(); t.save()
            expect(t.depth).toBe(2)
            t.restore()
            expect(t.depth).toBe(1)
        })
        it("resets to identity when restoring an empty stack", () => {
            const t = new Transform2D().translate(5, 5)
            t.restore()
            expect(t.values).toEqual([1, 0, 0, 1, 0, 0])
        })
    })

    it("setTransform replaces the matrix outright", () => {
        const t = new Transform2D().translate(99, 99).setTransform(1, 0, 0, 1, 5, 6)
        expect(t.values).toEqual([1, 0, 0, 1, 5, 6])
    })

    it("transform composes, matching an equivalent op sequence", () => {
        const viaOps = new Transform2D().translate(3, 4).scale(2, 5).values
        const viaMatrix = new Transform2D().transform(1, 0, 0, 1, 3, 4).transform(2, 0, 0, 5, 0, 0).values
        viaOps.forEach((v, i) => expect(viaMatrix[i]).toBeCloseTo(v, 12))
    })

    it("applyX and applyY agree with point but do not allocate", () => {
        const t = new Transform2D().translate(3, 4).rotate(0.7).scale(2, 3)
        const p = t.point(5, 6)
        expect(t.applyX(5, 6)).toBe(p.x)
        expect(t.applyY(5, 6)).toBe(p.y)
    })

    it("points transforms a batch", () => {
        const pts = new Transform2D().translate(1, 2).points([0, 0], [1, 1])
        expect(pts).toHaveLength(2)
        expect(pts[0]!.x).toBe(1)
        expect(pts[1]!.y).toBe(3)
    })

    describe("preservesCircles", () => {
        it("is true for identity, translation, rotation and uniform scale", () => {
            expect(new Transform2D().preservesCircles).toBe(true)
            expect(new Transform2D().translate(9, 9).preservesCircles).toBe(true)
            expect(new Transform2D().rotate(0.9).preservesCircles).toBe(true)
            expect(new Transform2D().scale(3).preservesCircles).toBe(true)
            expect(new Transform2D().translate(1, 2).rotate(0.4).scale(7).preservesCircles).toBe(true)
        })
        it("is false for non-uniform scale", () => {
            expect(new Transform2D().scale(2, 1).preservesCircles).toBe(false)
        })
        it("is false for skew", () => {
            expect(new Transform2D().transform(1, 0, 0.5, 1, 0, 0).preservesCircles).toBe(false)
        })
        it("is false for a reflection, even though it maps circles to circles", () => {
            expect(new Transform2D().scale(-1, 1).preservesCircles).toBe(false)
            expect(new Transform2D().scale(-1, 1).determinant).toBeLessThan(0)
        })
    })
})

describe("TransformedPath", () => {
    it("transforms moveTo and lineTo", () => {
        const sink = new RecordingSink()
        new Transform2D().translate(100, 50).path(sink).beginPath().moveTo(1, 2).lineTo(3, 4)
        expect(sink.calls[1]).toEqual({ op: "moveTo", args: [101, 52] })
        expect(sink.calls[2]).toEqual({ op: "lineTo", args: [103, 54] })
    })

    it("transforms every control point of a cubic", () => {
        const sink = new RecordingSink()
        new Transform2D().translate(10, 20).path(sink).bezierCurveTo(1, 1, 2, 2, 3, 3)
        expect(sink.calls[0]!.args).toEqual([11, 21, 12, 22, 13, 23])
    })

    it("transforms a quadratic", () => {
        const sink = new RecordingSink()
        new Transform2D().scale(2).path(sink).quadraticCurveTo(1, 2, 3, 4)
        expect(sink.calls[0]!.args).toEqual([2, 4, 6, 8])
    })

    it("forwards beginPath and closePath untouched", () => {
        const sink = new RecordingSink()
        new Transform2D().path(sink).beginPath().closePath()
        expect(sink.ops()).toEqual(["beginPath", "closePath"])
    })

    it("chains", () => {
        const path = new Transform2D().path(new RecordingSink())
        expect(path.beginPath().moveTo(0, 0).lineTo(1, 1)).toBe(path)
    })
})

describe("TransformedPath.arc", () => {
    describe("native fast path", () => {
        it("forwards an untransformed arc unchanged", () => {
            const sink = new RecordingSink()
            new Transform2D().path(sink).arc(10, 20, 5, 0, Math.PI, CW)
            expect(sink.ops()).toEqual(["arc"])
            expect(sink.calls[0]!.args).toEqual([10, 20, 5, 0, Math.PI, CW])
        })

        it("translates the centre and leaves the radius alone", () => {
            const sink = new RecordingSink()
            new Transform2D().translate(100, 100).path(sink).arc(10, 20, 5, 0, TAU)
            const [cx, cy, r] = sink.calls[0]!.args
            expect(cx).toBe(110)
            expect(cy).toBe(120)
            expect(r).toBe(5)
        })

        it("scales the radius under a uniform scale", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(3).path(sink).arc(0, 0, 5, 0, TAU)
            expect(sink.calls[0]!.args[2]).toBeCloseTo(15, 12)
        })

        it("rotates the angles under a rotation", () => {
            const sink = new RecordingSink()
            new Transform2D().rotate(Math.PI / 2).path(sink).arc(0, 0, 5, 0, Math.PI, CW)
            const [, , , start, end] = sink.calls[0]!.args
            expect(start).toBeCloseTo(Math.PI / 2, 12)
            expect(end).toBeCloseTo(Math.PI * 1.5, 12)
        })

        it("preserves the direction argument", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2).path(sink).arc(0, 0, 5, 0, Math.PI, CCW)
            expect(sink.calls[0]!.args[5]).toBe(CCW)
        })
    })

    describe("flattened path", () => {
        it("flattens rather than forwarding when the scale is non-uniform", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2, 1).path(sink).arc(0, 0, 10, 0, TAU)
            expect(sink.ops()).not.toContain("arc")
            expect(sink.ops().filter((o) => o === "bezierCurveTo").length).toBeGreaterThan(0)
        })

        // The real correctness question: does the emitted geometry actually
        // trace the transformed circle? Inverse-transforming every sampled
        // point must land it back on the source circle, for any matrix.
        const cases: Array<[string, () => Transform2D]> = [
            ["non-uniform scale", () => new Transform2D().scale(2, 1)],
            ["non-uniform scale then rotate", () => new Transform2D().scale(2, 1).rotate(0.6)],
            ["rotate then non-uniform scale", () => new Transform2D().rotate(0.6).scale(3, 0.5)],
            ["skew", () => new Transform2D().transform(1, 0, 0.7, 1, 0, 0)],
            ["reflection", () => new Transform2D().scale(-1, 1)],
            ["reflection with translation", () => new Transform2D().translate(50, 50).scale(1, -2)],
        ]

        it.each(cases)("traces the true transformed circle under %s", (_name, make) => {
            const t = make()
            const sink = new RecordingSink()
            t.path(sink).beginPath().arc(7, -3, 10, 0, TAU)

            const back = invert(t)
            const samples = samplePath(sink.calls)
            expect(samples.length).toBeGreaterThan(20)
            for (const s of samples) {
                const src = back(s.x, s.y)
                expect(Math.hypot(src.x - 7, src.y - -3)).toBeCloseTo(10, 2)
            }
        })

        it("covers the full turn for a full-circle sweep", () => {
            const t = new Transform2D().scale(2, 1)
            const sink = new RecordingSink()
            t.path(sink).beginPath().arc(0, 0, 10, 0, TAU)

            const back = invert(t)
            const angles = samplePath(sink.calls).map((s) => {
                const p = back(s.x, s.y)
                return (Math.atan2(p.y, p.x) + TAU) % TAU
            })
            // every quadrant is visited
            const quadrants = new Set(angles.map((a) => Math.floor(a / (Math.PI / 2))))
            expect(quadrants.size).toBe(4)
        })

        it("covers only a quarter turn for a quarter sweep", () => {
            const t = new Transform2D().scale(2, 1)
            const sink = new RecordingSink()
            t.path(sink).beginPath().arc(0, 0, 10, 0, Math.PI / 2, CW)

            const back = invert(t)
            const angles = samplePath(sink.calls).map((s) => {
                const p = back(s.x, s.y)
                return Math.atan2(p.y, p.x)
            })
            expect(Math.min(...angles)).toBeCloseTo(0, 6)
            expect(Math.max(...angles)).toBeCloseTo(Math.PI / 2, 6)
        })

        it("sweeps backwards when counter-clockwise", () => {
            const t = new Transform2D().scale(2, 1)
            const sink = new RecordingSink()
            t.path(sink).beginPath().arc(0, 0, 10, 0, Math.PI / 2, CCW)

            const back = invert(t)
            const angles = samplePath(sink.calls).map((s) => {
                const p = back(s.x, s.y)
                return Math.atan2(p.y, p.x)
            })
            // counter-clockwise from 0 to PI/2 is the long way round, so it
            // passes through negative angles rather than staying in [0, PI/2]
            expect(Math.min(...angles)).toBeLessThan(-0.1)
        })

        it("opens the subpath with moveTo when the path is empty", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2, 1).path(sink).beginPath().arc(0, 0, 10, 0, TAU)
            expect(sink.ops()[1]).toBe("moveTo")
        })

        it("connects with lineTo when the path already has a point", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2, 1).path(sink).beginPath().moveTo(50, 50).arc(0, 0, 10, 0, TAU)
            expect(sink.ops()[2]).toBe("lineTo")
        })

        it("emits only the opening move for a zero sweep", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2, 1).path(sink).beginPath().arc(0, 0, 10, 1, 1, CW)
            expect(sink.ops()).toEqual(["beginPath", "moveTo"])
        })

        it("splits a full turn into at least four segments", () => {
            const sink = new RecordingSink()
            new Transform2D().scale(2, 1).path(sink).beginPath().arc(0, 0, 10, 0, TAU)
            expect(sink.ops().filter((o) => o === "bezierCurveTo").length).toBeGreaterThanOrEqual(4)
        })
    })
})

describe("makePoint", () => {
    it("returns a CS Vector2 by default, and a subclass's own point type when overridden", () => {
        const p = new Transform2D().translate(1, 2).point(0, 0)
        expect(p).toBeInstanceOf((globalThis as any).CS.UnityEngine.Vector2)
        class Plain extends Transform2D<{ px: number; py: number }> {
            protected makePoint(x: number, y: number) { return { px: x, py: y } }
        }
        expect(new Plain().translate(1, 2).points([0, 0], [1, 1])).toEqual([{ px: 1, py: 2 }, { px: 2, py: 3 }])
    })
})
