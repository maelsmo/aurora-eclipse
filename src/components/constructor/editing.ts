// Helpers shared by the glyph editor panels.
import type { Alphabet, GeoDef, GlyphDef, PrimDef, PrimKind, Vec } from "@/engine/types"
import { sharedWith } from "@/engine/alphabet"
import type { Axes } from "@/engine/axes"

export type Tool = "select" | PrimKind

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
      const lim = Math.min(x1 - x0, y1 - y0) / 2
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
