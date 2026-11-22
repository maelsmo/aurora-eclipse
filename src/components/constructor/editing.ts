// Helpers shared by the glyph editor panels.
import type { Alphabet, GeoDef, GlyphDef, PrimDef, PrimKind, Vec } from "@/engine/types"
import { sharedWith } from "@/engine/alphabet"
import type { Axes } from "@/engine/axes"

export type Tool = "select" | "stroke" | "arc" | "dot" | "hole" | "slot" | "box" | "quarter" | "ellipse" | "poly"

export const primNames: Record<PrimKind, string> = {
  stroke: "Штрих",
  arc: "Дуга",
  dot: "Спутник",
  hole: "Зрачок",
  slot: "Прорезь",
  box: "Прямоугольник",
  ellipse: "Эллипс",
  sector: "Сектор",
  poly: "Многоугольник",
}

const add = (a: Vec, d: Vec): Vec => [a[0] + d[0], a[1] + d[1]]

/** Moves a module by d. */
export function movePrim(p: PrimDef, d: Vec): PrimDef {
  switch (p.kind) {
    case "stroke":
    case "slot":
    case "box":
      return { ...p, a: add(p.a, d), b: add(p.b, d) }
    case "poly":
      return { ...p, pts: p.pts.map((q) => add(q, d)) }
    default:
      return { ...p, c: add(p.c, d) }
  }
}

const DEG = Math.PI / 180

/** Outline of a geometric module as SVG path data; `map` turns design points into screen points. */
export function geoPath(p: GeoDef, map: (x: number, y: number) => Vec, scale: number): string {
  const f = (v: Vec) => v.map((n) => +n.toFixed(2)).join(" ")
  switch (p.kind) {
    case "box": {
      const x0 = Math.min(p.a[0], p.b[0]),
        x1 = Math.max(p.a[0], p.b[0]),
        y0 = Math.min(p.a[1], p.b[1]),
        y1 = Math.max(p.a[1], p.b[1])
      const lim = Math.min(x1 - x0, y1 - y0)
      const [tl, tr, br, bl] = (p.r ?? [0, 0, 0, 0]).map((r) => Math.min(r, lim))
      const arc = (r: number, to: Vec) => (r > 0 ? `A${(r * scale).toFixed(2)} ${(r * scale).toFixed(2)} 0 0 1 ${f(to)}` : `L${f(to)}`)
      return [
        `M${f(map(x0 + tl, y1))}`,
        `L${f(map(x1 - tr, y1))}`,
        arc(tr, map(x1, y1 - tr)),
        `L${f(map(x1, y0 + br))}`,
        arc(br, map(x1 - br, y0)),
        `L${f(map(x0 + bl, y0))}`,
        arc(bl, map(x0, y0 + bl)),
        `L${f(map(x0, y1 - tl))}`,
        arc(tl, map(x0 + tl, y1)),
        "Z",
      ].join("")
    }
    case "ellipse": {
      const [cx, cy] = map(p.c[0], p.c[1])
      const rx = p.rx * scale,
        ry = p.ry * scale
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
    }
    case "sector": {
      const pt = (r: number, a: number) => map(p.c[0] + Math.cos(a * DEG) * r, p.c[1] + Math.sin(a * DEG) * r)
      const span = p.a1 - p.a0
      const large = span > 180 ? 1 : 0
      const R = p.r * scale,
        r0 = (p.r0 ?? 0) * scale
      if (span >= 359.9) {
        const [cx, cy] = map(p.c[0], p.c[1])
        const ring = `M${cx - R} ${cy}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`
        return r0 > 0 ? ring + `M${cx - r0} ${cy}a${r0} ${r0} 0 1 1 ${2 * r0} 0a${r0} ${r0} 0 1 1 ${-2 * r0} 0Z` : ring
      }
      const outer = `M${f(pt(p.r, p.a0))}A${R} ${R} 0 ${large} 0 ${f(pt(p.r, p.a1))}`
      if (r0 > 0) return outer + `L${f(pt(p.r0!, p.a1))}A${r0} ${r0} 0 ${large} 1 ${f(pt(p.r0!, p.a0))}Z`
      return outer + `L${f(map(p.c[0], p.c[1]))}Z`
    }
    case "poly":
      return "M" + p.pts.map((q) => f(map(q[0], q[1]))).join("L") + "Z"
  }
}

/** The glyph whose construction is edited for a letter (aliases edit their base). */
export function editTarget(char: string, alphabet: Alphabet) {
  const shared = sharedWith(char, alphabet)
  const target = shared ?? char
  const def = alphabet[target]
  return { target, shared, def }
}

/** Editing happens on the undeformed grid so handles sit on nodes. */
export function editAxes(studio: Axes): Axes {
  return { ...studio, weight: 1, contrast: 1, width: 1, slant: 0, ink: 0 }
}

export function withPrims(def: GlyphDef | undefined, prims: PrimDef[], adv?: number): GlyphDef {
  const out: GlyphDef = { ...(def ?? { prims: [] }), prims }
  if (adv !== undefined) out.adv = adv
  else if (out.adv === undefined && !out.base) out.adv = 4
  return out
}

/** Tools: "quarter" draws a box whose far corner is a quarter disc. */
export type GeoTool = "box" | "quarter" | "ellipse" | "poly"
export const isGeoTool = (t: string): t is GeoTool => t === "box" || t === "quarter" || t === "ellipse" || t === "poly"

/** A module drawn by dragging from a to b. */
export function geoFromDrag(tool: GeoTool, a: Vec, b: Vec): PrimDef | null {
  const x0 = Math.min(a[0], b[0]),
    x1 = Math.max(a[0], b[0]),
    y0 = Math.min(a[1], b[1]),
    y1 = Math.max(a[1], b[1])
  if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return null
  switch (tool) {
    case "box":
      return { kind: "box", a: [x0, y0], b: [x1, y1], dir: x1 - x0 > y1 - y0 ? "h" : "v" }
    case "quarter": {
      // The corner under the end point turns round (radius = the shorter side).
      const r = Math.min(x1 - x0, y1 - y0)
      const right = b[0] >= a[0],
        top = b[1] >= a[1]
      const k = top ? (right ? 1 : 0) : right ? 2 : 3
      const rr: [number, number, number, number] = [0, 0, 0, 0]
      rr[k] = r
      return { kind: "box", a: [x0, y0], b: [x1, y1], r: rr, dir: "arc" }
    }
    case "ellipse":
      return { kind: "ellipse", c: [(x0 + x1) / 2, (y0 + y1) / 2], rx: (x1 - x0) / 2, ry: (y1 - y0) / 2, dir: "arc" }
    case "poly":
      // Right triangle with the right angle at the start point.
      return { kind: "poly", pts: [a, [b[0], a[1]], [a[0], b[1]]], dir: "contour" }
  }
}

const mirrorV = (v: Vec, axis: "x" | "y", c: Vec): Vec => (axis === "x" ? [2 * c[0] - v[0], v[1]] : [v[0], 2 * c[1] - v[1]])

/** Mirrors a module across the vertical (x) or horizontal (y) line through c. */
export function mirrorPrim(p: PrimDef, axis: "x" | "y", c: Vec): PrimDef {
  const m = (v: Vec) => mirrorV(v, axis, c)
  switch (p.kind) {
    case "stroke":
    case "slot":
      return { ...p, a: m(p.a), b: m(p.b) }
    case "box": {
      const a = m(p.a),
        b = m(p.b)
      const r = p.r ? ((axis === "x" ? [p.r[1], p.r[0], p.r[3], p.r[2]] : [p.r[3], p.r[2], p.r[1], p.r[0]]) as BoxR) : undefined
      return { ...p, a: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], b: [Math.max(a[0], b[0]), Math.max(a[1], b[1])], ...(r ? { r } : {}) }
    }
    case "arc":
    case "sector":
      return axis === "x" ? { ...p, c: m(p.c), a0: 180 - p.a1, a1: 180 - p.a0 } : { ...p, c: m(p.c), a0: -p.a1, a1: -p.a0 }
    case "poly":
      return { ...p, pts: p.pts.map(m).reverse() }
    default:
      return { ...p, c: m(p.c) }
  }
}
type BoxR = [number, number, number, number]

/** Turns a module 90° counter-clockwise around c. */
export function rotatePrim(p: PrimDef, c: Vec): PrimDef {
  const r = (v: Vec): Vec => [c[0] - (v[1] - c[1]), c[1] + (v[0] - c[0])]
  switch (p.kind) {
    case "stroke":
    case "slot":
      return { ...p, a: r(p.a), b: r(p.b) }
    case "box": {
      const a = r(p.a),
        b = r(p.b)
      // tl ← tr, tr ← br, br ← bl, bl ← tl
      const rr = p.r ? ([p.r[1], p.r[2], p.r[3], p.r[0]] as BoxR) : undefined
      const dir = p.dir === "h" ? "v" : p.dir === "v" ? "h" : p.dir
      return { ...p, a: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], b: [Math.max(a[0], b[0]), Math.max(a[1], b[1])], ...(rr ? { r: rr } : {}), ...(dir ? { dir } : {}) }
    }
    case "arc":
    case "sector":
      return { ...p, c: r(p.c), a0: p.a0 + 90, a1: p.a1 + 90 }
    case "ellipse":
      return { ...p, c: r(p.c), rx: p.ry, ry: p.rx }
    case "poly":
      return { ...p, pts: p.pts.map(r) }
    default:
      return { ...p, c: r(p.c) }
  }
}
