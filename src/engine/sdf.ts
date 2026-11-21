// CPU reference of every distance function. The GLSL in gpu/shader.ts mirrors
// this file line for line; export, picking and the CPU fallback use it.

import { assertNever, type CompiledGlyph, type CompiledPrim, type Box } from "./types"

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

/** Rectangle with a radius per corner; r = [top-left, top-right, bottom-right, bottom-left]. */
export function sdRoundBox4(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: readonly number[]) {
  const qx0 = px - cx,
    qy0 = py - cy
  const rr = Math.min(qx0 > 0 ? (qy0 > 0 ? r[1] : r[2]) : qy0 > 0 ? r[0] : r[3], hx, hy)
  const qx = Math.abs(qx0) - hx + rr,
    qy = Math.abs(qy0) - hy + rr
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rr
}

/** Ellipse, first-order distance (exact zero set, unit gradient on the edge). */
export function sdEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number) {
  const x = (px - cx) / rx,
    y = (py - cy) / ry
  const k0 = Math.hypot(x, y)
  const k1 = Math.hypot(x / rx, y / ry)
  if (k1 < 1e-9) return -Math.min(rx, ry)
  return (k0 * (k0 - 1)) / k1
}

/** Signed distance to a wedge symmetric around +y with half-angle h (q.x ≥ 0 after folding). */
function sdWedge(x: number, y: number, sinH: number, cosH: number) {
  const t = Math.max(x * sinH + y * cosH, 0)
  const d = Math.hypot(x - sinH * t, y - cosH * t)
  return x * cosH - y * sinH < 0 ? -d : d
}

/**
 * Disc sector (r0 = 0) or ring sector from a0 to a1 (radians), stretched by
 * (sx, sy) with the width axis.
 */
export function sdSector(px: number, py: number, cx: number, cy: number, r: number, r0: number, a0: number, a1: number, sx: number, sy: number) {
  const qx = (px - cx) / sx,
    qy = (py - cy) / sy
  const len = Math.hypot(qx, qy)
  const radial = r0 > 0 ? Math.abs(len - (r + r0) / 2) - (r - r0) / 2 : len - r
  const h = (a1 - a0) / 2
  let d = radial
  if (h < Math.PI - 1e-4) {
    const rot = Math.PI / 2 - (a0 + a1) / 2
    const c = Math.cos(rot),
      s = Math.sin(rot)
    const x = Math.abs(c * qx - s * qy),
      y = s * qx + c * qy
    d = Math.max(radial, sdWedge(x, y, Math.sin(h), Math.cos(h)))
  }
  return d * Math.min(sx, sy)
}

/** Simple polygon (any winding). */
export function sdPolygon(px: number, py: number, pts: readonly (readonly number[])[]) {
  const n = pts.length
  let d = (px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2
  let sgn = 1
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const ex = pts[j][0] - pts[i][0],
      ey = pts[j][1] - pts[i][1]
    const wx = px - pts[i][0],
      wy = py - pts[i][1]
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1)
    const bx = wx - ex * t,
      by = wy - ey * t
    d = Math.min(d, bx * bx + by * by)
    const c1 = py >= pts[i][1],
      c2 = py < pts[j][1],
      c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sgn = -sgn
  }
  return sgn * Math.sqrt(d)
}

/**
 * Star with `n` points in the unit circle; inner vertices at radius k
 * (k = cos(π/n) gives the regular n-gon). Exact by folding into one sector.
 */
export function sdStarUnit(px: number, py: number, n: number, k: number) {
  const an = Math.PI / n
  const len = Math.hypot(px, py)
  let b = Math.atan2(px, py)
  b = ((((b + an) % (2 * an)) + 2 * an) % (2 * an)) - an
  b = Math.abs(b)
  const qx = len * Math.sin(b),
    qy = len * Math.cos(b)
  // Edge from the outer vertex V = (0, 1) to the inner vertex W.
  const wx = k * Math.sin(an),
    wy = k * Math.cos(an)
  const ex = wx,
    ey = wy - 1
  const t = clamp((qx * ex + (qy - 1) * ey) / (ex * ex + ey * ey), 0, 1)
  const d = Math.hypot(qx - ex * t, qy - 1 - ey * t)
  return ex * (qy - 1) - ey * qx < 0 ? -d : d
}

/** Regular polygon / star, stretched by (sx, sy), corners rounded by `round` (share of the radius). */
export function sdNgon(px: number, py: number, cx: number, cy: number, sides: number, inner: number, sx: number, sy: number, round: number) {
  const k = inner >= 1 ? Math.cos(Math.PI / sides) : inner
  const shrink = 1 - round
  const f = (x: number, y: number) => sdStarUnit((x - cx) / sx / shrink, (y - cy) / sy / shrink, sides, k) * shrink - round
  const v = f(px, py)
  // First-order correction of the stretch: value / |gradient| in world units.
  const e = 1e-4 * Math.min(sx, sy)
  const gx = (f(px + e, py) - v) / e,
    gy = (f(px, py + e) - v) / e
  const g = Math.hypot(gx, gy)
  return g > 1e-6 ? v / g : v * Math.min(sx, sy)
}

export function sdPrim(p: CompiledPrim, x: number, y: number) {
  switch (p.kind) {
    case "stroke":
      return sdStroke(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.r, p.r * p.round)
    case "arc":
      return sdArc(x, y, p.c[0], p.c[1], p.r, p.sx, p.sy, p.a0, p.a1, p.half, p.round)
    case "slot":
      return sdCapsule(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.r)
    case "dot":
    case "hole":
      return Math.hypot(x - p.c[0], y - p.c[1]) - p.r
    case "box":
      return sdRoundBox4(x, y, p.c[0], p.c[1], p.h[0], p.h[1], p.r)
    case "ellipse":
      return sdEllipse(x, y, p.c[0], p.c[1], p.rx, p.ry)
    case "sector":
      return sdSector(x, y, p.c[0], p.c[1], p.r, p.r0, p.a0, p.a1, p.sx, p.sy)
    case "poly":
      return sdPolygon(x, y, p.pts)
    case "ngon":
      return sdNgon(x, y, p.c[0], p.c[1], p.sides, p.inner, p.sx, p.sy, p.round)
    default:
      return assertNever(p)
  }
}

/** Is a compiled primitive a geometric module (box, ellipse, sector, poly, ngon)? */
export const isGeoPrim = (p: CompiledPrim): p is Extract<CompiledPrim, { neg: boolean }> =>
  p.kind === "box" || p.kind === "ellipse" || p.kind === "sector" || p.kind === "poly" || p.kind === "ngon"

/**
 * Signed distance of a compiled glyph in its own design coordinates.
 * `inset` shrinks every geometric module by inset / 2, and modules then meet
 * without fillets, so a gap opens between them.
 */
export function sdGlyph(g: CompiledGlyph, x: number, y: number, inset = 0) {
  x -= (y - 2.5) * g.shear
  let body = BIG,
    cut = BIG,
    sat = BIG
  for (const p of g.prims) {
    const d = sdPrim(p, x, y)
    if (p.kind === "stroke" || p.kind === "arc") body = smin(body, d, g.fillet)
    else if (p.kind === "dot") sat = Math.min(sat, d)
    else if (p.kind === "hole" || p.kind === "slot") cut = Math.min(cut, d)
    else if (p.neg) cut = Math.min(cut, d)
    else body = inset > 0 ? Math.min(body, d + inset * 0.5) : smin(body, d, g.fillet)
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
