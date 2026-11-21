// Curve fitting for the tracer: a run of exact contour points becomes a line
// or a chain of cubic Béziers whose end tangents are given exactly.
// Least squares with fixed tangent directions (Schneider), Newton
// reparameterisation, and subdivision at the point of maximum error.
import type { Vec } from "../types"

export type Seg = { k: "L"; p: Vec } | { k: "C"; c1: Vec; c2: Vec; p: Vec }

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1]
const len = (a: Vec) => Math.hypot(a[0], a[1])
export const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0]

function bez(c: Vec[], t: number): Vec {
  const mt = 1 - t
  const a = mt * mt * mt,
    b = 3 * mt * mt * t,
    d = 3 * mt * t * t,
    e = t * t * t
  return [
    a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
    a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1],
  ]
}
function bez1(c: Vec[], t: number): Vec {
  const mt = 1 - t
  return [
    3 * (mt * mt * (c[1][0] - c[0][0]) + 2 * mt * t * (c[2][0] - c[1][0]) + t * t * (c[3][0] - c[2][0])),
    3 * (mt * mt * (c[1][1] - c[0][1]) + 2 * mt * t * (c[2][1] - c[1][1]) + t * t * (c[3][1] - c[2][1])),
  ]
}
function bez2(c: Vec[], t: number): Vec {
  const mt = 1 - t
  return [
    6 * (mt * (c[2][0] - 2 * c[1][0] + c[0][0]) + t * (c[3][0] - 2 * c[2][0] + c[1][0])),
    6 * (mt * (c[2][1] - 2 * c[1][1] + c[0][1]) + t * (c[3][1] - 2 * c[2][1] + c[1][1])),
  ]
}

function chordParams(pts: Vec[]) {
  const u = [0]
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + len(sub(pts[i], pts[i - 1])))
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

/** Least-squares cubic with the given start / end tangent directions. */
function generate(pts: Vec[], u: number[], t0: Vec, t1: Vec): Vec[] {
  const p0 = pts[0],
    p3 = pts[pts.length - 1]
  // t1 points forward at the end; the end handle goes backwards along it.
  const tb: Vec = [-t1[0], -t1[1]]
  let c00 = 0,
    c01 = 0,
    c11 = 0,
    x0 = 0,
    x1 = 0
  for (let i = 0; i < pts.length; i++) {
    const t = u[i],
      mt = 1 - t
    const b0 = mt * mt * mt,
      b1 = 3 * mt * mt * t,
      b2 = 3 * mt * t * t,
      b3 = t * t * t
    const A1 = mul(t0, b1),
      A2 = mul(tb, b2)
    c00 += dot(A1, A1)
    c01 += dot(A1, A2)
    c11 += dot(A2, A2)
    const tmp = sub(pts[i], add(mul(p0, b0 + b1), mul(p3, b2 + b3)))
    x0 += dot(A1, tmp)
    x1 += dot(A2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  const seg = len(sub(p3, p0))
  let a1 = 0,
    a2 = 0
  if (Math.abs(det) > 1e-12) {
    a1 = (x0 * c11 - x1 * c01) / det
    a2 = (c00 * x1 - c01 * x0) / det
  }
  const eps = 1e-6 * seg
  if (!(a1 > eps) || !(a2 > eps) || a1 > seg * 2 || a2 > seg * 2) a1 = a2 = seg / 3
  return [p0, add(p0, mul(t0, a1)), add(p3, mul(tb, a2)), p3]
}

function maxError(pts: Vec[], c: Vec[], u: number[]) {
  let err = 0,
    at = Math.floor(pts.length / 2)
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len(sub(bez(c, u[i]), pts[i]))
    if (d > err) {
      err = d
      at = i
    }
  }
  return { err, at }
}

function reparam(pts: Vec[], u: number[], c: Vec[]) {
  return u.map((t, i) => {
    const d = sub(bez(c, t), pts[i])
    const d1 = bez1(c, t),
      d2 = bez2(c, t)
    const num = dot(d, d1),
      den = dot(d1, d1) + dot(d, d2)
    if (Math.abs(den) < 1e-12) return t
    return Math.max(0, Math.min(1, t - num / den))
  })
}

const normalize = (v: Vec): Vec => {
  const l = len(v) || 1
  return [v[0] / l, v[1] / l]
}

/**
 * Is the run a straight line? Points must lie on the chord and both
 * tangents must follow it (a straight piece between two corners).
 */
export function isStraight(pts: Vec[], t0: Vec, t1: Vec, tol = 2e-4) {
  const a = pts[0],
    b = pts[pts.length - 1]
  const ch = sub(b, a)
  const l = len(ch)
  if (l < 1e-9) return true
  const d = mul(ch, 1 / l)
  const sinMax = Math.sin((1 * Math.PI) / 180)
  if (Math.abs(cross(d, t0)) > sinMax || dot(d, t0) < 0) return false
  if (Math.abs(cross(d, t1)) > sinMax || dot(d, t1) < 0) return false
  for (let i = 1; i < pts.length - 1; i++) if (Math.abs(cross(d, sub(pts[i], a))) > tol) return false
  return true
}

/**
 * Fits `pts` (exact points on the curve, in order) with cubic segments.
 * `t0` and `t1` are the forward tangents at both ends; `tangentAt(i)` gives the
 * exact forward tangent at an inner point, used when the run is subdivided.
 */
export function fitCubic(
  pts: Vec[],
  t0: Vec,
  t1: Vec,
  tol: number,
  tangentAt: (i: number) => Vec,
  depth = 0,
): Seg[] {
  const p3 = pts[pts.length - 1]
  if (pts.length <= 2) {
    const l = len(sub(p3, pts[0])) / 3
    return [{ k: "C", c1: add(pts[0], mul(t0, l)), c2: sub(p3, mul(t1, l)), p: p3 }]
  }
  let u = chordParams(pts)
  let c = generate(pts, u, t0, t1)
  let { err, at } = maxError(pts, c, u)
  if (err < tol * 16) {
    // Newton reparameterisation also polishes fits that already pass:
    // chord-length parameters overestimate the error of a good curve.
    for (let it = 0; it < 6; it++) {
      const u2 = reparam(pts, u, c)
      const c2 = generate(pts, u2, t0, t1)
      const e2 = maxError(pts, c2, u2)
      if (e2.err >= err * 0.98 && err <= tol) break
      u = u2
      c = c2
      err = e2.err
      at = e2.at
    }
  }
  if (err <= tol) return [{ k: "C", c1: c[1], c2: c[2], p: p3 }]
  if (depth > 24 || pts.length < 4) return [{ k: "C", c1: c[1], c2: c[2], p: p3 }]
  at = Math.max(1, Math.min(pts.length - 2, at))
  const tm = normalize(tangentAt(at))
  return [
    ...fitCubic(pts.slice(0, at + 1), t0, tm, tol, (i) => tangentAt(i), depth + 1),
    ...fitCubic(pts.slice(at), tm, t1, tol, (i) => tangentAt(i + at), depth + 1),
  ]
}

/** Point on a cubic segment (for tests and error measurement). */
export function cubicPoint(p0: Vec, s: Extract<Seg, { k: "C" }>, t: number): Vec {
  return bez([p0, s.c1, s.c2, s.p], t)
}
