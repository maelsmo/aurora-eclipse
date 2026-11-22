// Geometric distance functions against brute force over a dense polyline of
// the analytic boundary: exact functions must match it, approximate ones
// must agree on the sign and be accurate near the edge.
import { describe, expect, it } from "vitest"
import { sdEllipse, sdGlyph, sdNgon, sdPolygon, sdRoundBox4, sdSector, sdStarUnit } from "../sdf"
import { compileShape } from "../shapes"
import { compilePrims } from "../compile"
import { defaultAxes } from "../axes"
import { rng } from "../variations"
import { defaultShape, type ShapeDef } from "../scene"
import type { Vec } from "../types"

const TAU = Math.PI * 2

function polyDist(px: number, py: number, poly: Vec[]) {
  let d = Infinity,
    inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j],
      [bx, by] = poly[i]
    const ex = bx - ax,
      ey = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1)))
    d = Math.min(d, Math.hypot(px - ax - ex * t, py - ay - ey * t))
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside ? -d : d
}

const arcPts = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 400): Vec[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Vec
  })

function roundBoxPoly(cx: number, cy: number, hx: number, hy: number, r: number[]): Vec[] {
  const [tl, tr, br, bl] = r
  return [
    ...arcPts(cx + hx - tr, cy + hy - tr, tr, tr, 0, Math.PI / 2),
    ...arcPts(cx - hx + tl, cy + hy - tl, tl, tl, Math.PI / 2, Math.PI),
    ...arcPts(cx - hx + bl, cy - hy + bl, bl, bl, Math.PI, (3 * Math.PI) / 2),
    ...arcPts(cx + hx - br, cy - hy + br, br, br, (3 * Math.PI) / 2, TAU),
  ]
}

function samples(n: number, box: [number, number, number, number], seed = 1): Vec[] {
  const r = rng(seed)
  return Array.from({ length: n }, () => [box[0] + r() * (box[2] - box[0]), box[1] + r() * (box[3] - box[1])] as Vec)
}

/** Exact: |sdf − truth| within the polyline error. */
function expectExact(f: (x: number, y: number) => number, poly: Vec[], box: [number, number, number, number], tol = 2e-3) {
  for (const [x, y] of samples(600, box)) expect(Math.abs(f(x, y) - polyDist(x, y, poly)), `${x},${y}`).toBeLessThan(tol)
}

/** Approximate: same sign, accurate near the edge, never more than slightly over the truth. */
function expectClose(f: (x: number, y: number) => number, poly: Vec[], box: [number, number, number, number], rel = 0.08) {
  for (const [x, y] of samples(800, box, 7)) {
    const t = polyDist(x, y, poly),
      v = f(x, y)
    if (Math.abs(t) > 3e-3) expect(Math.sign(v), `sign at ${x},${y}`).toBe(Math.sign(t))
    if (Math.abs(t) < 0.06) expect(Math.abs(v - t), `edge at ${x},${y}`).toBeLessThan(Math.abs(t) * rel + 3e-3)
  }
}

describe("geometric distance functions", () => {
  it("rounded box with four radii is exact", () => {
    const r = [1, 0, 0.5, 0.25]
    expectExact((x, y) => sdRoundBox4(x, y, 0.5, -0.3, 2, 1.5, r), roundBoxPoly(0.5, -0.3, 2, 1.5, r), [-3, -3, 4, 3])
  })
  it("polygon is exact for triangles and quads", () => {
    const tri: Vec[] = [[0, 0], [3, 0.5], [1, 2.5]]
    expectExact((x, y) => sdPolygon(x, y, tri), tri, [-1, -1, 4, 3.5], 1e-9)
    const quad: Vec[] = [[0, 0], [2, 0], [3, 2], [1, 2]]
    expectExact((x, y) => sdPolygon(x, y, quad), quad, [-1, -1, 4, 3], 1e-9)
  })
  it("regular polygons and stars are exact", () => {
    for (const [n, k] of [[6, Math.cos(Math.PI / 6)], [5, 0.45], [8, 0.7], [3, Math.cos(Math.PI / 3)]]) {
      const poly: Vec[] = []
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 - (i * TAU) / n
        poly.push([Math.cos(a), Math.sin(a)])
        const b = a - Math.PI / n
        poly.push([Math.cos(b) * k, Math.sin(b) * k])
      }
      expectExact((x, y) => sdStarUnit(x, y, n, k), poly, [-1.5, -1.5, 1.5, 1.5], 1e-9)
    }
  })
  it("ellipse is close to the truth near its edge", () => {
    expectClose((x, y) => sdEllipse(x, y, 0.2, 0.1, 2.5, 1.2), arcPts(0.2, 0.1, 2.5, 1.2, 0, TAU, 2000), [-3, -2, 3.2, 2])
  })
  it("disc and ring sectors keep the sign and the edge", () => {
    const D = Math.PI / 180
    expectClose(
      (x, y) => sdSector(x, y, 0, 0, 2, 0, 0, 90 * D, 1, 1),
      [[0, 0], ...arcPts(0, 0, 2, 2, 0, Math.PI / 2)],
      [-1, -1, 2.5, 2.5],
    )
    expectClose(
      (x, y) => sdSector(x, y, 0, 0, 2, 1, 30 * D, 250 * D, 1, 1),
      [...arcPts(0, 0, 2, 2, 30 * D, 250 * D), ...arcPts(0, 0, 1, 1, 250 * D, 30 * D)],
      [-2.5, -2.5, 2.5, 2.5],
    )
  })
  it("stretched polygons keep the sign and the edge", () => {
    const n = 6
    const poly: Vec[] = []
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 - (i * TAU) / n
      poly.push([Math.cos(a) * 3, Math.sin(a) * 1.5])
    }
    expectClose((x, y) => sdNgon(x, y, 0, 0, n, 1, 3, 1.5, 0), poly, [-3.5, -2, 3.5, 2], 0.15)
  })
})

describe("shapes", () => {
  const make = (over: Partial<ShapeDef>) => compileShape({ ...defaultShape, ...over })
  it("compile centred on their origin with tight bounds", () => {
    for (const kind of ["rect", "ellipse", "polygon", "star", "line"] as const) {
      const g = make({ kind, w: 4, h: 2 })
      expect(g.anchor).toEqual([0, 0])
      expect(g.box).toEqual({ x0: -2, y0: -1, x1: 2, y1: 1 })
      expect(sdGlyph(g, 0, 0)).toBeLessThan(0)
      expect(sdGlyph(g, 2.5, 0)).toBeGreaterThan(0)
    }
  })
  it("rect corners, ring and sweep behave", () => {
    const sq = make({ kind: "rect", w: 2, h: 2, r: 1 })
    expect(sdGlyph(sq, 0.95, 0.95)).toBeGreaterThan(0) // fully rounded: a circle
    const ring = make({ kind: "ellipse", w: 4, h: 4, hole: 0.5 })
    expect(sdGlyph(ring, 0, 0)).toBeGreaterThan(0)
    expect(sdGlyph(ring, 1.5, 0)).toBeLessThan(0)
    const quarter = make({ kind: "ellipse", w: 4, h: 4, sweep: 90 })
    expect(sdGlyph(quarter, 1, 1)).toBeLessThan(0)
    expect(sdGlyph(quarter, -1, 1)).toBeGreaterThan(0)
  })
  it("geometric glyph modules compile, cut and inset", () => {
    const g = compilePrims(
      [
        { kind: "box", a: [0, 0], b: [2, 2], r: [0, 2, 0, 0] },
        { kind: "box", a: [2, 0], b: [4, 2] },
        { kind: "ellipse", c: [1, 1], rx: 0.4, ry: 0.4, neg: true },
      ],
      { ...defaultAxes, fillet: 0 },
    )
    expect(g.box).toMatchObject({ x0: 0, y0: 0, x1: 4, y1: 2 })
    expect(sdGlyph(g, 1, 1)).toBeGreaterThan(0) // the cut
    expect(sdGlyph(g, 1.8, 1.8)).toBeGreaterThan(0) // the quarter-round corner
    expect(sdGlyph(g, 2, 0.5)).toBeLessThanOrEqual(0) // modules touch (the GPU sums their coverage across the seam)…
    expect(sdGlyph(g, 2.05, 0.5)).toBeLessThan(0)
    expect(sdGlyph(g, 2, 0.5, 0.2)).toBeGreaterThan(0) // …until the inset opens a gap
  })
})
