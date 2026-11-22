// Compiles a glyph construction into absolute geometry for one set of axes.
// All seven construction rules live here, so every glyph obeys them equally.

import type { Axes } from "./axes"
import { CAP } from "./grid"
import { sdRoundBox4 } from "./sdf"
import {
  assertNever,
  type Alphabet,
  type Box,
  type CompiledGlyph,
  type CompiledPrim,
  type GeoDef,
  type GeoFlags,
  type PrimDef,
  type Vec,
} from "./types"

const MODE_INDEX = { fill: 1, lines: 2, outline: 3 } as const
const DIR_INDEX = { h: 0, v: 1, arc: 2, contour: 3 } as const

/** Mode, stripe direction and cut flag of a geometric module. */
export function geoFlags(p: GeoDef): GeoFlags {
  return { mode: p.mode ? MODE_INDEX[p.mode] : 0, dir: p.dir ? DIR_INDEX[p.dir] : 0, neg: !!p.neg }
}

const EPS = 1e-3
const DEG = Math.PI / 180

/** Default radii, × weight (dots, holes, slots) — shared by the whole alphabet. */
export const DOT_RADIUS = 0.5
export const HOLE_RADIUS = 0.3
export const SLOT_RADIUS = 0.22

/** Glyph modules including the base glyph (Ё = E + …). */
export function glyphPrims(
  char: string,
  alphabet: Alphabet,
  depth = 0,
): PrimDef[] | null {
  const g = alphabet[char]
  if (!g) return null
  if (!g.base || depth > 3) return g.prims
  return [...(glyphPrims(g.base, alphabet, depth + 1) ?? []), ...g.prims]
}

export function glyphAdvance(
  char: string,
  alphabet: Alphabet,
  depth = 0,
): number {
  const g = alphabet[char]
  if (!g) return 3
  if (g.adv !== undefined || !g.base || depth > 3) return g.adv ?? 3
  return glyphAdvance(g.base, alphabet, depth + 1)
}

function segDist(p: Vec, a: Vec, b: Vec) {
  const bx = b[0] - a[0],
    by = b[1] - a[1]
  const len = bx * bx + by * by
  const t =
    len > 0
      ? Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / len))
      : 0
  return Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - by * t)
}

const angleNorm = (a: number) => ((a % 360) + 360) % 360

function onArc(p: Vec, arc: Extract<PrimDef, { kind: "arc" }>) {
  const dx = p[0] - arc.c[0],
    dy = p[1] - arc.c[1]
  if (Math.abs(Math.hypot(dx, dy) - arc.r) > EPS) return false
  const span = arc.a1 - arc.a0
  if (span >= 360 - EPS) return true
  const a = angleNorm(Math.atan2(dy, dx) / DEG - arc.a0)
  return a <= span + 0.01
}

function arcEnds(arc: Extract<PrimDef, { kind: "arc" }>): [Vec, Vec] {
  return [arc.a0, arc.a1].map((a) => [
    arc.c[0] + Math.cos(a * DEG) * arc.r,
    arc.c[1] + Math.sin(a * DEG) * arc.r,
  ]) as [Vec, Vec]
}

const close = (a: Vec, b: Vec) =>
  Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS
const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}

/** What happens to a stroke end at a junction. */
export type EndAction = "none" | "extend" | "retract"

const axisAligned = (u: Vec) => Math.abs(u[0]) > 0.99 || Math.abs(u[1]) > 0.99

/**
 * Rule 3 (overshoot) and clean joins.
 * - A horizontal or vertical end that meets the side of another stroke passes
 *   through it ("extend"); a diagonal end there hides inside it ("retract").
 * - At a corner (end meets end) the more horizontal axis-aligned stroke passes
 *   through, the other one hides inside its terminal. Symmetric corners (V) and
 *   tangent continuations (stroke into arc) keep a round join ("none").
 * - Hidden ends never touch the outer contour, so smooth unions cannot swell there.
 */
export function junctionEnds(prims: PrimDef[]): [EndAction, EndAction][] {
  return prims.map((p, i) => {
    if (p.kind !== "stroke") return ["none", "none"]
    return [0, 1].map((e): EndAction => {
      const P = e === 0 ? p.a : p.b,
        Q = e === 0 ? p.b : p.a
      const u = norm([P[0] - Q[0], P[1] - Q[1]])
      let side = false,
        corner = false,
        tangent = false,
        iWin = true,
        otherWins = false
      const atCorner = (v: Vec, canWin: boolean) => {
        corner = true
        if (Math.abs(u[0] * v[0] + u[1] * v[1]) > 0.98) tangent = true
        if (!axisAligned(u) || Math.abs(u[0]) <= Math.abs(v[0]) + 0.05) iWin = false
        if (canWin && axisAligned(v) && Math.abs(v[0]) > Math.abs(u[0]) + 0.05) otherWins = true
      }
      prims.forEach((q, j) => {
        if (j === i) return
        if (q.kind === "stroke") {
          if (segDist(P, q.a, q.b) > EPS) return
          const qa = close(P, q.a)
          if (!qa && !close(P, q.b)) {
            side = true
            return
          }
          // Direction of the partner pointing out of the shared node.
          const v = norm(qa ? [q.a[0] - q.b[0], q.a[1] - q.b[1]] : [q.b[0] - q.a[0], q.b[1] - q.a[1]])
          atCorner(v, q.ends?.[qa ? 0 : 1] !== "flush")
        } else if (q.kind === "arc") {
          if (!onArc(P, q)) return
          const atEnd = q.a1 - q.a0 < 360 - EPS && arcEnds(q).some((x) => close(P, x))
          if (!atEnd) {
            side = true
            return
          }
          const a = Math.atan2(P[1] - q.c[1], P[0] - q.c[0])
          atCorner([-Math.sin(a), Math.cos(a)], false)
        }
      })
      if (!side && !corner) return "none"
      if (p.ends?.[e] === "flush") return tangent ? "none" : "retract"
      if (side) return axisAligned(u) ? "extend" : "retract"
      if (tangent) return "none"
      if (iWin) return "extend"
      return otherWins ? "retract" : "none"
    }) as [EndAction, EndAction]
  })
}

/** Maps design coordinates onto the deformed grid of the given axes. */
export function gridMap(axes: Axes) {
  const tH = axes.weight * axes.contrast
  // Cap height stays constant: thicker horizontals squeeze the gaps between them.
  const ky = Math.max(0.55, (CAP - tH) / (CAP - 1))
  const kx = axes.width
  const map = (p: Vec): Vec => [
    axes.weight / 2 + (p[0] - 0.5) * kx,
    CAP / 2 + (p[1] - CAP / 2) * ky,
  ]
  return { map, kx, ky }
}

function grow(box: Box, x: number, y: number, r: number) {
  box.x0 = Math.min(box.x0, x - r)
  box.y0 = Math.min(box.y0, y - r)
  box.x1 = Math.max(box.x1, x + r)
  box.y1 = Math.max(box.y1, y + r)
}

export function compilePrims(prims: PrimDef[], axes: Axes): CompiledGlyph {
  const { map, kx, ky } = gridMap(axes)
  const junction = junctionEnds(prims)
  const round = Math.max(0, Math.min(1, axes.terminal))
  const out: CompiledPrim[] = []
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  prims.forEach((p, i) => {
    switch (p.kind) {
      case "stroke": {
        let a = map(p.a),
          b = map(p.b)
        const dir = norm([b[0] - a[0], b[1] - a[1]])
        // Rule 2: contrast thickens horizontals relative to verticals.
        const t =
          axes.weight * (1 + (axes.contrast - 1) * dir[0] * dir[0]) * (p.w ?? 1)
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const shift = (act: EndAction) =>
          act === "extend" ? axes.overshoot * t : act === "retract" ? -Math.min(t / 2, len * 0.45) : 0
        const sa = shift(junction[i][0]),
          sb = shift(junction[i][1])
        a = [a[0] - dir[0] * sa, a[1] - dir[1] * sa]
        b = [b[0] + dir[0] * sb, b[1] + dir[1] * sb]
        out.push({ kind: "stroke", a, b, r: t / 2, round })
        grow(box, a[0], a[1], t / 2)
        grow(box, b[0], b[1], t / 2)
        break
      }
      case "arc": {
        const c = map(p.c)
        // Arcs sit between horizontals and verticals: average contrast.
        const t = axes.weight * (1 + (axes.contrast - 1) * 0.5) * (p.w ?? 1)
        const a0 = p.a0 * DEG,
          a1 = Math.max(p.a1, p.a0 + 1) * DEG
        out.push({
          kind: "arc",
          c,
          r: p.r,
          sx: kx,
          sy: ky,
          a0,
          a1,
          half: t / 2,
          round,
        })
        const n = 24
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n
          grow(
            box,
            c[0] + Math.cos(a) * p.r * kx,
            c[1] + Math.sin(a) * p.r * ky,
            t / 2,
          )
        }
        break
      }
      case "dot": {
        const c = map(p.c),
          r = DOT_RADIUS * axes.weight * axes.satellite * (p.s ?? 1)
        out.push({ kind: "dot", c, r })
        grow(box, c[0], c[1], r)
        break
      }
      case "hole": {
        const c = map(p.c)
        out.push({
          kind: "hole",
          c,
          r: HOLE_RADIUS * axes.weight * axes.counter * (p.s ?? 1),
        })
        break
      }
      case "slot":
        out.push({
          kind: "slot",
          a: map(p.a),
          b: map(p.b),
          r: SLOT_RADIUS * axes.weight * axes.counter * (p.s ?? 1),
        })
        break
      case "box": {
        const a = map(p.a),
          b = map(p.b)
        const hx = Math.abs(b[0] - a[0]) / 2,
          hy = Math.abs(b[1] - a[1]) / 2
        const k = Math.min(kx, ky)
        // Radii go up to the full side (a quarter disc cell).
        const r = (p.r ?? [0, 0, 0, 0]).map((v) => Math.max(0, Math.min(v * k, 2 * hx, 2 * hy))) as [number, number, number, number]
        // Modules follow the terminal axis: 1 — the corner cuts are arcs (quarters, bowls),
        // 0 — straight 45° cuts through the same points ("прямой срез"): a quarter becomes a
        // triangle, a bowl an octagon; a round cut-out becomes a diamond, the end of a slot a point.
        const t = Math.max(0, Math.min(1, axes.terminal))
        out.push({ kind: "box", c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h: [hx, hy], r, ...(t < 1 ? { t } : {}), ...geoFlags(p) })
        if (!p.neg) {
          grow(box, Math.min(a[0], b[0]), Math.min(a[1], b[1]), 0)
          grow(box, Math.max(a[0], b[0]), Math.max(a[1], b[1]), 0)
        }
        break
      }
      case "ellipse": {
        const c = map(p.c)
        const rx = Math.max(1e-3, p.rx * kx),
          ry = Math.max(1e-3, p.ry * ky)
        out.push({ kind: "ellipse", c, rx, ry, ...geoFlags(p) })
        if (!p.neg) grow(box, c[0], c[1], 0), grow(box, c[0] - rx, c[1] - ry, 0), grow(box, c[0] + rx, c[1] + ry, 0)
        break
      }
      case "sector": {
        const c = map(p.c)
        const a0 = p.a0 * DEG,
          a1 = Math.max(p.a1, p.a0 + 1) * DEG
        out.push({ kind: "sector", c, r: p.r, r0: Math.max(0, Math.min(p.r0 ?? 0, p.r - 1e-3)), a0, a1, sx: kx, sy: ky, ...geoFlags(p) })
        if (!p.neg) {
          grow(box, c[0], c[1], 0)
          for (let k = 0; k <= 24; k++) {
            const a = a0 + ((a1 - a0) * k) / 24
            grow(box, c[0] + Math.cos(a) * p.r * kx, c[1] + Math.sin(a) * p.r * ky, 0)
          }
        }
        break
      }
      case "poly": {
        const pts = p.pts.slice(0, 8).map(map)
        if (pts.length < 3) break
        out.push({ kind: "poly", pts, ...geoFlags(p) })
        if (!p.neg) for (const q of pts) grow(box, q[0], q[1], 0)
        break
      }
      default:
        assertNever(p)
    }
  })
  if (!Number.isFinite(box.x0)) Object.assign(box, { x0: 0, y0: 0, x1: 1, y1: 1 })
  const shear = Math.tan(Math.max(-30, Math.min(30, axes.slant)) * DEG)
  if (shear !== 0) {
    const dx0 = (box.y0 - CAP / 2) * shear,
      dx1 = (box.y1 - CAP / 2) * shear
    box.x0 += Math.min(dx0, dx1)
    box.x1 += Math.max(dx0, dx1)
  }
  const geo = out.filter(isGeoPrim)
  return {
    prims: geo.length ? [...out.filter((p) => !isGeoPrim(p)), ...mergeTiles(geo)] : out,
    ...(geo.length ? { tiles: geo } : {}),
    box,
    fillet: Math.max(0, axes.fillet),
    cutK: Math.max(0, axes.fillet) * 0.5,
    attract: Math.max(0, axes.attract) * 0.8,
    ink: axes.ink,
    shear,
  }
}

type Geo = Extract<CompiledPrim, { neg: boolean }>
type CBox = Extract<CompiledPrim, { kind: "box" }>
const isGeoPrim = (p: CompiledPrim): p is Geo =>
  p.kind === "box" || p.kind === "ellipse" || p.kind === "sector" || p.kind === "poly" || p.kind === "ngon"
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

/** Two boxes sharing a whole edge with square corners on it merge into one box. */
function mergePair(a: CBox, b: CBox): CBox | null {
  const [ax0, ay0, ax1, ay1] = [a.c[0] - a.h[0], a.c[1] - a.h[1], a.c[0] + a.h[0], a.c[1] + a.h[1]]
  const [bx0, by0, bx1, by1] = [b.c[0] - b.h[0], b.c[1] - b.h[1], b.c[0] + b.h[0], b.c[1] + b.h[1]]
  const make = (x0: number, y0: number, x1: number, y1: number, r: [number, number, number, number]): CBox => ({
    kind: "box",
    c: [(x0 + x1) / 2, (y0 + y1) / 2],
    h: [(x1 - x0) / 2, (y1 - y0) / 2],
    r,
    // Tiles of one glyph share the terminal axis: the merged box keeps their corner roundness.
    ...(a.t !== undefined ? { t: a.t } : {}),
    mode: 0,
    dir: 0,
    neg: false,
  })
  // r: tl, tr, br, bl
  if (near(ay0, by0) && near(ay1, by1)) {
    if (near(ax1, bx0) && a.r[1] === 0 && a.r[2] === 0 && b.r[0] === 0 && b.r[3] === 0) return make(ax0, ay0, bx1, ay1, [a.r[0], b.r[1], b.r[2], a.r[3]])
    if (near(bx1, ax0)) return mergePair(b, a)
  }
  if (near(ax0, bx0) && near(ax1, bx1)) {
    if (near(ay1, by0) && a.r[0] === 0 && a.r[1] === 0 && b.r[2] === 0 && b.r[3] === 0) return make(ax0, ay0, ax1, by1, [b.r[0], b.r[1], a.r[2], a.r[3]])
    if (near(by1, ay0)) return mergePair(b, a)
  }
  return null
}

/**
 * Field primitives of geometric modules: filled boxes that share whole edges
 * merge (min() of touching tiles reads 0 along their seam, a merged box does
 * not); cut-outs and other modules stay as they are. Modules drawn as lines
 * or outlines by their set stay out of the filled field.
 */
export function mergeTiles(tiles: Geo[]): Geo[] {
  const boxes: CBox[] = []
  const rest: Geo[] = []
  for (const t of tiles) {
    if (t.mode === 2 || t.mode === 3) continue
    if (t.kind === "box" && !t.neg) boxes.push({ ...t, mode: 0, dir: 0 })
    else rest.push(t)
  }
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < boxes.length && !merged; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const m = mergePair(boxes[i], boxes[j])
        if (m) {
          boxes.splice(j, 1)
          boxes[i] = m
          merged = true
          break
        }
      }
  }
  // Cut-outs last, so the order matches the glyph rules (body, then cuts).
  return [...boxes, ...welds(boxes), ...rest.filter((t) => !t.neg), ...rest.filter((t) => t.neg)]
}

/** How far a weld reaches into the two tiles it joins, and the hairline weld under it. */
const WELD = 0.4
const WELD_THIN = 0.04

/**
 * Welds: boxes that touch along a part of an edge cannot merge into one box
 * (a stem and a bowl, two quarters of different size), and min() of their
 * fields reads 0 along the seam — a hairline in the fill. A weld is a box
 * laid across the seam, inside both tiles: a thick one where both are solid,
 * and a thin one up to the points where their corner cuts leave the seam.
 */
function welds(boxes: CBox[]): CBox[] {
  const out: CBox[] = []
  const ext = (b: CBox) => [b.c[0] - b.h[0], b.c[1] - b.h[1], b.c[0] + b.h[0], b.c[1] + b.h[1]] as const
  const inside = (b: CBox, x: number, y: number) => sdRoundBox4(x, y, b.c[0], b.c[1], b.h[0], b.h[1], b.r, b.t ?? 1) <= 1e-9
  const make = (x0: number, y0: number, x1: number, y1: number): CBox => ({ kind: "box", c: [(x0 + x1) / 2, (y0 + y1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2], r: [0, 0, 0, 0], mode: 0, dir: 0, neg: false })
  /** Moves the end `from` of a span towards `to` until the weld corner (given by `at`) is inside the tile. */
  const trim = (from: number, to: number, ok: (s: number) => boolean) => {
    if (ok(from)) return from
    let lo = from,
      hi = to
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2
      if (ok(m)) hi = m
      else lo = m
    }
    return hi
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue
      const a = boxes[i],
        b = boxes[j]
      const [ax0, ay0, ax1, ay1] = ext(a)
      const [bx0, by0, bx1, by1] = ext(b)
      // r: tl, tr, br, bl. `a` on the left of a vertical seam, or below a horizontal one.
      if (near(ax1, bx0)) {
        const y0 = Math.max(ay0 + a.r[2], by0 + b.r[3]),
          y1 = Math.min(ay1 - a.r[1], by1 - b.r[0])
        if (y1 - y0 < 1e-6) continue
        const w = Math.min(WELD, a.h[0], b.h[0])
        const mid = (y0 + y1) / 2
        const ok = (y: number) => inside(a, ax1 - w, y) && inside(b, ax1 + w, y)
        const t0 = trim(y0, mid, ok),
          t1 = trim(y1, mid, ok)
        if (t1 - t0 > 1e-6) out.push(make(ax1 - w, t0, ax1 + w, t1))
        if (t0 - y0 > 1e-6 || y1 - t1 > 1e-6) out.push(make(ax1 - WELD_THIN, y0, ax1 + WELD_THIN, y1))
      }
      if (near(ay1, by0)) {
        const x0 = Math.max(ax0 + a.r[0], bx0 + b.r[3]),
          x1 = Math.min(ax1 - a.r[1], bx1 - b.r[2])
        if (x1 - x0 < 1e-6) continue
        const w = Math.min(WELD, a.h[1], b.h[1])
        const mid = (x0 + x1) / 2
        const ok = (x: number) => inside(a, x, ay1 - w) && inside(b, x, ay1 + w)
        const t0 = trim(x0, mid, ok),
          t1 = trim(x1, mid, ok)
        if (t1 - t0 > 1e-6) out.push(make(t0, ay1 - w, t1, ay1 + w))
        if (t0 - x0 > 1e-6 || x1 - t1 > 1e-6) out.push(make(x0, ay1 - WELD_THIN, x1, ay1 + WELD_THIN))
      }
    }
  return out
}

/** LRU cache of compiled glyphs; clones with quantised axes stay well inside it. */
const CACHE_SIZE = 4096
const cache = new Map<string, CompiledGlyph>()

/**
 * Compiles a glyph from an alphabet, cached by content. `version` identifies
 * the alphabet edition (set id and revision).
 */
export function compileGlyph(
  char: string,
  alphabet: Alphabet,
  axes: Axes,
  version: string | number = 0,
): CompiledGlyph {
  const key = version + "|" + char + "|" + axesKey(axes)
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const prims = glyphPrims(char, alphabet) ?? []
  let g: CompiledGlyph
  try {
    g = compilePrims(prims, axes)
  } catch (e) {
    // A malformed module (old or foreign data) draws nothing instead of taking the app down.
    console.warn(`Знак «${char}» не собран:`, e)
    g = compilePrims([], axes)
  }
  const anchor = alphabet[char]?.anchor
  if (anchor) g.anchor = anchor
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(key, g)
  return g
}

function axesKey(a: Axes) {
  return `${a.weight},${a.contrast},${a.width},${a.fillet},${a.overshoot},${a.terminal},${a.counter},${a.satellite},${a.attract},${a.ink},${a.slant}`
}

export function clearCompileCache() {
  cache.clear()
}
