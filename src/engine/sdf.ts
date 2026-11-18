// CPU reference of every distance function. The GLSL in gpu/shader.ts mirrors
// this file line for line; export, picking and the CPU fallback use it.

import type { CompiledGlyph, CompiledPrim, Box } from "./types"

export const BIG = 1e5

export const clamp = (v: number, a: number, b: number) =>
  v < a ? a : v > b ? b : v
export const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Circular smooth minimum: two perpendicular edges meet in a fillet of radius k. */
export function smin(a: number, b: number, k: number) {
  if (k < 1e-5) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - k * 0.5 * (1 + h - Math.sqrt(1 - h * (h - 2)))
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

/** Share of the second argument in a smooth union (for colour blending). */
export function blendWeight(a: number, b: number, k: number) {
  const e = Math.max(k, 1e-3)
  return clamp(0.5 + (0.5 * (a - b)) / e, 0, 1)
}

/** Segment a–b with half-thickness r and terminal corner radius rr (rr = r → capsule). */
export function sdStroke(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  rr: number,
) {
  let dx = bx - ax,
    dy = by - ay
  const l = Math.hypot(dx, dy)
  if (l < 1e-6) return Math.hypot(px - ax, py - ay) - r
  dx /= l
  dy /= l
  const qx0 = px - (ax + bx) * 0.5,
    qy0 = py - (ay + by) * 0.5
  const qx = Math.abs(dx * qx0 + dy * qy0) - (l * 0.5 + r - rr)
  const qy = Math.abs(-dy * qx0 + dx * qy0) - (r - rr)
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    rr
  )
}

export function sdCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
) {
  const pax = px - ax,
    pay = py - ay,
    bax = bx - ax,
    bay = by - ay
  const len = bax * bax + bay * bay
  const h = len > 0 ? clamp((pax * bax + pay * bay) / len, 0, 1) : 0
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

/**
 * Arc of centre-line radius ra from a0 to a1 (radians, CCW), half-thickness rb,
 * stretched by (sx, sy) into an elliptical arc of constant thickness.
 * round = 1 gives round caps, 0 gives radial flat cuts.
 */
export function sdArc(
  px: number,
  py: number,
  cx: number,
  cy: number,
  ra: number,
  sx: number,
  sy: number,
  a0: number,
  a1: number,
  rb: number,
  round: number,
) {
  const h = Math.max((a1 - a0) * 0.5, 1e-4)
  // Unstretch, then rotate so the arc is symmetric around +y.
  const qx = (px - cx) / sx,
    qy = (py - cy) / sy
  const len = Math.max(Math.hypot(qx, qy), 1e-6)
  // First-order distance to the ellipse: f / |∇f|.
  const grad = Math.hypot(qx / sx, qy / sy) / len
  const ring = Math.abs((len - ra) / Math.max(grad, 1e-6)) - rb
  if (h >= Math.PI - 1e-4) return ring
  const rot = Math.PI / 2 - (a0 + a1) * 0.5
  const c = Math.cos(rot),
    s = Math.sin(rot)
  const rx = c * qx - s * qy
  const x = Math.abs(rx),
    y = s * qx + c * qy
  const sh = Math.sin(h),
    ch = Math.cos(h)
  let capped = ring
  if (ch * x > sh * y) {
    const end = rx >= 0 ? a0 : a1
    capped =
      Math.hypot(
        px - (cx + Math.cos(end) * ra * sx),
        py - (cy + Math.sin(end) * ra * sy),
      ) - rb
  }
  if (round >= 1) return capped
  const flat = Math.max(ring, (x * ch - y * sh) * Math.min(sx, sy))
  return mix(flat, capped, round)
}

export function sdPrim(p: CompiledPrim, x: number, y: number) {
  switch (p.kind) {
    case "stroke":
      return sdStroke(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.r, p.r * p.round)
    case "arc":
      return sdArc(
        x,
        y,
        p.c[0],
        p.c[1],
        p.r,
        p.sx,
        p.sy,
        p.a0,
        p.a1,
        p.half,
        p.round,
      )
    case "slot":
      return sdCapsule(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.r)
    default:
      return Math.hypot(x - p.c[0], y - p.c[1]) - p.r
  }
}

/** Signed distance of a compiled glyph in its own design coordinates. */
export function sdGlyph(g: CompiledGlyph, x: number, y: number) {
  x -= (y - 2.5) * g.shear
  let body = BIG,
    cut = BIG,
    sat = BIG
  for (const p of g.prims) {
    const d = sdPrim(p, x, y)
    if (p.kind === "stroke" || p.kind === "arc") body = smin(body, d, g.fillet)
    else if (p.kind === "dot") sat = Math.min(sat, d)
    else cut = Math.min(cut, d)
  }
  let d = smax(body, -cut, g.cutK)
  d = g.attract > 0 ? smin(d, sat, g.attract) : Math.min(d, sat)
  return d - g.ink
}

export function sdBox(x: number, y: number, b: Box) {
  const cx = (b.x0 + b.x1) / 2,
    cy = (b.y0 + b.y1) / 2
  const qx = Math.abs(x - cx) - (b.x1 - b.x0) / 2,
    qy = Math.abs(y - cy) - (b.y1 - b.y0) / 2
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  )
}
