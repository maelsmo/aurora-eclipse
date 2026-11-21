// Parametric canvas shapes compile into a one-primitive glyph centred on its
// own origin, so they share the renderer, the looks, the export and picking
// with letters.
import type { ShapeDef } from "./scene/types"
import type { CompiledGlyph, CompiledPrim } from "./types"

const flags = { mode: 0, dir: 0, neg: false }
const cache = new Map<string, CompiledGlyph>()

const DEG = Math.PI / 180

export function shapePrim(s: ShapeDef): CompiledPrim {
  const hw = s.w / 2,
    hh = s.h / 2
  switch (s.kind) {
    case "rect": {
      // A radius above half the side would bulge past the neighbour corner: for the
      // uniform radius keep Figma's limit; independent corners may reach the full side.
      const lim = s.corners ? Math.min(s.w, s.h) : Math.min(hw, hh)
      const r = (s.corners ?? [s.r, s.r, s.r, s.r]).map((v) => Math.max(0, Math.min(v, lim))) as [number, number, number, number]
      return { kind: "box", c: [0, 0], h: [hw, hh], r, ...flags }
    }
    case "ellipse":
      if (s.sweep >= 360 && s.hole <= 0) return { kind: "ellipse", c: [0, 0], rx: hw, ry: hh, ...flags }
      return { kind: "sector", c: [0, 0], r: 1, r0: Math.min(s.hole, 0.98), a0: 0, a1: Math.max(1, Math.min(360, s.sweep)) * DEG, sx: hw, sy: hh, ...flags }
    case "polygon":
    case "star": {
      const round = Math.max(0, Math.min(0.9, s.r / Math.max(Math.min(hw, hh), 1e-3)))
      return { kind: "ngon", c: [0, 0], sides: Math.round(s.sides), inner: s.kind === "polygon" ? 1 : s.inner, sx: hw, sy: hh, round, ...flags }
    }
    case "line": {
      const t = Math.min(hh, hw)
      return { kind: "stroke", a: [-hw + t, 0], b: [hw - t, 0], r: hh, round: s.r > 0 ? 1 : 0 }
    }
  }
}

/** Compiled glyph of a shape (cached by its parameters). */
export function compileShape(s: ShapeDef): CompiledGlyph {
  const key = `${s.kind}|${s.w}|${s.h}|${s.r}|${s.corners?.join(",") ?? ""}|${s.sides}|${s.inner}|${s.sweep}|${s.hole}`
  const hit = cache.get(key)
  if (hit) return hit
  const hw = s.w / 2,
    hh = s.h / 2
  const g: CompiledGlyph = {
    prims: [shapePrim(s)],
    box: { x0: -hw, y0: -hh, x1: hw, y1: hh },
    fillet: 0,
    cutK: 0,
    attract: 0,
    ink: 0,
    shear: 0,
    anchor: [0, 0],
  }
  if (cache.size > 512) cache.delete(cache.keys().next().value!)
  cache.set(key, g)
  return g
}
