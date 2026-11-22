// Validation of glyph modules coming from storage or files: every kind is
// checked for its own fields, so a broken module is dropped instead of
// reaching the compiler. The kinds list is the single source for the union
// in types.ts (a new kind added there and not here fails to type-check).
import type { PrimDef, Vec } from "../types"

export const PRIM_KINDS = ["stroke", "arc", "dot", "hole", "slot", "box", "ellipse", "sector", "poly"] as const satisfies readonly PrimDef["kind"][]
type Missing = Exclude<PrimDef["kind"], (typeof PRIM_KINDS)[number]>
// Compile-time check: every PrimDef kind is listed above.
const exhaustive: Missing extends never ? true : false = true
void exhaustive

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v)
const fin = (v: unknown, lo = -1e4, hi = 1e4): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi
const vec = (v: unknown): v is Vec => Array.isArray(v) && v.length === 2 && fin(v[0]) && fin(v[1])
const oneOf = <T extends string>(v: unknown, opts: readonly T[]): v is T => typeof v === "string" && (opts as readonly string[]).includes(v)

/** Optional fields shared by geometric modules. */
function geo(p: Raw) {
  return {
    ...(oneOf(p.mode, ["fill", "lines", "outline"] as const) ? { mode: p.mode } : {}),
    ...(oneOf(p.dir, ["h", "v", "arc", "contour"] as const) ? { dir: p.dir } : {}),
    ...(p.neg === true ? { neg: true } : {}),
  }
}
const scale = (p: Raw) => (fin(p.s, 0.01, 100) ? { s: p.s } : {})
const weight = (p: Raw) => (fin(p.w, 0.01, 100) ? { w: p.w } : {})

/** A module with every field it needs, or null. */
export function sanitizePrim(raw: unknown): PrimDef | null {
  if (!isObj(raw) || !oneOf(raw.kind, PRIM_KINDS)) return null
  const p = raw
  switch (p.kind) {
    case "stroke": {
      if (!vec(p.a) || !vec(p.b)) return null
      const ends = Array.isArray(p.ends) && p.ends.length === 2 && p.ends.every((e) => e === "auto" || e === "flush") ? { ends: p.ends as ["auto" | "flush", "auto" | "flush"] } : {}
      return { kind: "stroke", a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]], ...weight(p), ...ends }
    }
    case "arc":
      if (!vec(p.c) || !fin(p.r, 0.01) || !fin(p.a0) || !fin(p.a1)) return null
      return { kind: "arc", c: [p.c[0], p.c[1]], r: p.r, a0: p.a0, a1: p.a1, ...weight(p) }
    case "dot":
    case "hole":
      if (!vec(p.c)) return null
      return { kind: p.kind, c: [p.c[0], p.c[1]], ...scale(p) }
    case "slot":
      if (!vec(p.a) || !vec(p.b)) return null
      return { kind: "slot", a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]], ...scale(p) }
    case "box": {
      if (!vec(p.a) || !vec(p.b)) return null
      const r = Array.isArray(p.r) && p.r.length === 4 && p.r.every((v) => fin(v, 0)) ? { r: p.r as [number, number, number, number] } : {}
      return { kind: "box", a: [p.a[0], p.a[1]], b: [p.b[0], p.b[1]], ...r, ...geo(p) }
    }
    case "ellipse":
      if (!vec(p.c) || !fin(p.rx, 1e-3) || !fin(p.ry, 1e-3)) return null
      return { kind: "ellipse", c: [p.c[0], p.c[1]], rx: p.rx, ry: p.ry, ...geo(p) }
    case "sector":
      if (!vec(p.c) || !fin(p.r, 1e-3) || !fin(p.a0) || !fin(p.a1)) return null
      return { kind: "sector", c: [p.c[0], p.c[1]], r: p.r, ...(fin(p.r0, 0) ? { r0: p.r0 } : {}), a0: p.a0, a1: p.a1, ...geo(p) }
    case "poly": {
      if (!Array.isArray(p.pts) || p.pts.length < 3 || p.pts.length > 8 || !p.pts.every(vec)) return null
      return { kind: "poly", pts: (p.pts as Vec[]).map((q) => [q[0], q[1]] as Vec), ...geo(p) }
    }
  }
  return null
}
