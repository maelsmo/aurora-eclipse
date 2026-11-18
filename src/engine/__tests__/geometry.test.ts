import { describe, expect, it } from "vitest"
import { sdArc, sdStroke, smin, sdGlyph } from "../sdf"
import { compilePrims, compileGlyph, glyphPrims, junctionEnds } from "../compile"
import { defaultAxes } from "../axes"
import { defaultAlphabet, charset } from "../alphabet"
import { combine, ops } from "../operators"
import type { CompiledGlyph } from "../types"

const DEG = Math.PI / 180

function topology(g: CompiledGlyph, step = 0.04) {
  const pad = 0.3
  const x0 = g.box.x0 - pad,
    y0 = g.box.y0 - pad
  const w = Math.ceil((g.box.x1 - g.box.x0 + 2 * pad) / step)
  const h = Math.ceil((g.box.y1 - g.box.y0 + 2 * pad) / step)
  const inside = new Uint8Array(w * h)
  let area = 0
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = sdGlyph(g, x0 + (i + 0.5) * step, y0 + (j + 0.5) * step) < 0
      inside[j * w + i] = v ? 1 : 0
      if (v) area++
    }
  const seen = new Uint8Array(w * h)
  const fill = (start: number, val: number) => {
    const stack = [start]
    seen[start] = 1
    let border = false
    while (stack.length) {
      const k = stack.pop()!
      const i = k % w,
        j = (k - i) / w
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) border = true
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di,
          nj = j + dj
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
        const n = nj * w + ni
        if (!seen[n] && inside[n] === val) {
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    return border
  }
  let parts = 0,
    holes = 0
  for (let k = 0; k < w * h; k++) {
    if (seen[k]) continue
    if (inside[k]) {
      fill(k, 1)
      parts++
    } else if (!fill(k, 0)) holes++
  }
  return { parts, holes, area: area * step * step }
}

describe("distance functions", () => {
  it("capsule distance", () => {
    expect(sdStroke(0, 2, 0, 0, 4, 0, 0.5, 0.5)).toBeCloseTo(1.5, 5)
    expect(sdStroke(5, 0, 0, 0, 4, 0, 0.5, 0.5)).toBeCloseTo(0.5, 5)
    expect(sdStroke(2, 0, 0, 0, 4, 0, 0.5, 0.5)).toBeCloseTo(-0.5, 5)
  })
  it("flat terminal is a box that ends half a stroke beyond the node", () => {
    expect(sdStroke(4.45, 0.45, 0, 0, 4, 0, 0.5, 0)).toBeLessThan(0)
    expect(sdStroke(4.6, 0, 0, 0, 4, 0, 0.5, 0)).toBeCloseTo(0.1, 5)
  })
  it("arc distance and caps", () => {
    // Upper half circle of radius 2.
    expect(sdArc(0, 2, 0, 0, 2, 1, 1, 0, 180 * DEG, 0.5, 1)).toBeCloseTo(-0.5, 5)
    expect(sdArc(0, 3, 0, 0, 2, 1, 1, 0, 180 * DEG, 0.5, 1)).toBeCloseTo(0.5, 5)
    // Below the arc: nearest point is an end cap.
    expect(sdArc(2, -1, 0, 0, 2, 1, 1, 0, 180 * DEG, 0.5, 1)).toBeCloseTo(0.5, 5)
    // A full ring.
    expect(sdArc(0, -2, 0, 0, 2, 1, 1, 0, 360 * DEG, 0.5, 1)).toBeCloseTo(-0.5, 5)
  })
  it("smooth minimum reduces to min without radius", () => {
    expect(smin(1, 2, 0)).toBe(1)
    expect(smin(1, 1, 0.5)).toBeLessThan(1)
    expect(smin(1, 5, 0.5)).toBe(1)
  })
})

describe("construction rules", () => {
  it("E: the pills pass through the stem, the stem does not pass through them", () => {
    const prims = glyphPrims("E", defaultAlphabet)!
    const j = junctionEnds(prims)
    expect(j[0]).toEqual(["retract", "retract"])
    for (const k of [1, 2, 3]) expect(j[k]).toEqual(["extend", "none"])
    const g = compilePrims(prims, defaultAxes)
    expect(g.box.x0).toBeCloseTo(-0.5, 5)
    expect(g.box.y1).toBeCloseTo(5, 5)
  })
  it("T: the stem passes through the bar and makes a nub", () => {
    const j = junctionEnds(glyphPrims("T", defaultAlphabet)!)
    expect(j[1]).toEqual(["none", "extend"])
  })
  it("diagonals never overshoot", () => {
    for (const c of ["K", "V", "X", "N", "Ж"]) {
      const prims = glyphPrims(c, defaultAlphabet)!
      junctionEnds(prims).forEach((e, i) => {
        const p = prims[i]
        if (p.kind === "stroke" && p.a[0] !== p.b[0] && p.a[1] !== p.b[1])
          expect(e).not.toContain("extend")
      })
    }
  })
  it("tangent joins of a stadium never overshoot", () => {
    expect(junctionEnds(glyphPrims("O", defaultAlphabet)!).flat()).toEqual(Array(8).fill("none"))
    // Bars flow into the bowls of B without a seam.
    const B = junctionEnds(glyphPrims("B", defaultAlphabet)!)
    expect(B[1][1]).toBe("none")
  })
  it("V keeps a round apex: symmetric corners neither extend nor retract", () => {
    expect(junctionEnds(glyphPrims("V", defaultAlphabet)!).flat()).toEqual(Array(4).fill("none"))
  })
  it("overshoot 0 gives a clean monoline", () => {
    const g = compilePrims(glyphPrims("E", defaultAlphabet)!, { ...defaultAxes, overshoot: 0 })
    expect(g.box.x0).toBeCloseTo(0, 5)
  })
})

describe("alphabet", () => {
  it("has 59 letters", () => {
    expect([...charset].length).toBe(59)
    for (const c of charset) expect(defaultAlphabet[c]).toBeDefined()
  })
  it("every node lies on the 0.25 grid and inside the metric zone", () => {
    for (const c of charset) {
      for (const p of glyphPrims(c, defaultAlphabet)!) {
        const pts = "c" in p ? [p.c] : [p.a, p.b]
        for (const [x, y] of pts) {
          expect(Math.abs(x * 4 - Math.round(x * 4))).toBeLessThan(1e-9)
          expect(Math.abs(y * 4 - Math.round(y * 4))).toBeLessThan(1e-9)
          expect(y).toBeGreaterThanOrEqual(-1)
          expect(y).toBeLessThanOrEqual(6)
        }
      }
    }
  })
  it("compiles every glyph at default and extreme axes", () => {
    const sets = [
      defaultAxes,
      { ...defaultAxes, weight: 0.4, width: 0.75, fillet: 0, terminal: 0 },
      { ...defaultAxes, weight: 1.6, width: 1.35, fillet: 1, overshoot: 1, slant: 15, contrast: 1.5 },
    ]
    for (const axes of sets)
      for (const c of charset) {
        const g = compileGlyph(c, defaultAlphabet, axes)
        expect(g.prims.length).toBeGreaterThan(0)
        for (const v of Object.values(g.box)) expect(Number.isFinite(v)).toBe(true)
        expect(Number.isFinite(sdGlyph(g, 1, 2))).toBe(true)
      }
  })
  it("has a positive area and sane topology", () => {
    for (const c of charset) {
      const t = topology(compileGlyph(c, defaultAlphabet, defaultAxes))
      expect(t.area, c).toBeGreaterThan(3)
    }
    const O = topology(compileGlyph("O", defaultAlphabet, defaultAxes))
    expect(O).toMatchObject({ parts: 1, holes: 1 })
    const A = topology(compileGlyph("A", defaultAlphabet, defaultAxes))
    expect(A.parts).toBe(2) // body + satellite
    expect(A.holes).toBe(1) // pupil
    expect(topology(compileGlyph("Ё", defaultAlphabet, defaultAxes)).parts).toBe(3)
    expect(topology(compileGlyph("H", defaultAlphabet, defaultAxes))).toMatchObject({ parts: 1, holes: 0 })
    expect(topology(compileGlyph("B", defaultAlphabet, defaultAxes)).holes).toBe(2)
  })
})

describe("operators", () => {
  const samples: [number, number][] = []
  for (let a = -2; a <= 2; a += 0.25) for (let b = -2; b <= 2; b += 0.25) samples.push([a, b])
  it("union contains both, intersection lies in both, cut lies in the lower", () => {
    for (const [a, b] of samples) {
      if (a < 0 || b < 0) expect(combine("union", a, b, 0, 0, 0)[0]).toBeLessThan(0)
      if (combine("intersect", a, b, 0, 0, 0)[0] < 0) expect(a < 0 && b < 0).toBe(true)
      if (combine("cut", a, b, 0, 0, 0)[0] < 0) expect(a).toBeLessThan(0)
      if (combine("eclipse", a, b, 0, 0.2, 0)[0] < 0) expect(a < 0 || b < 0).toBe(true)
    }
  })
  it("eclipse keeps the lower shape intact and leaves a gap around it", () => {
    expect(combine("eclipse", -0.5, -1, 0, 0.3, 0)[0]).toBe(-0.5)
    // A point 0.1 outside the lower shape, inside the layer, falls into the gap.
    expect(combine("eclipse", 0.1, -1, 0, 0.3, 0)[0]).toBeGreaterThan(0)
  })
  it("every operator returns finite values", () => {
    for (const op of ops)
      for (const [a, b] of samples) {
        const [d, w] = combine(op, a, b, 0.5, 0.2, 0.5)
        expect(Number.isFinite(d) && Number.isFinite(w)).toBe(true)
      }
  })
})
