// Vector tracer of a signed field (negative inside).
// 1. Marching squares on a coarse grid gives the topology: closed loops with
//    the inside on the left.
// 2. Every loop vertex is projected onto the true zero set by Newton steps.
// 3. Corners are restored by intersecting the exact tangents on both sides.
// 4. The loop is cut at corners, line↔curve transitions, curvature jumps and
//    extremes; straight runs become lines, the rest cubic Béziers.
import type { Box, Vec } from "../types"
import { cross, fitCubic, isStraight, type Seg } from "./fit"

export type Field = (x: number, y: number) => number

export type TraceOptions = {
  /** Grid step of the topology pass, m. */
  step?: number
  /** Newton iterations per vertex. */
  newton?: number
  /** Turn above which two neighbouring tangents make a corner, degrees. */
  corner?: number
  /** Curve fitting tolerance, m. */
  tolerance?: number
}

export type Contour = { start: Vec; segs: Seg[] }

type Node = { p: Vec; tin: Vec; tout: Vec; corner: boolean; split: boolean }

const DEG = Math.PI / 180
const EPS_G = 1e-6

/* ---------- 1. marching squares ---------- */

type Grid = { v: Float64Array; x0: number; y0: number; nx: number; ny: number; h: number }

function sampleGrid(f: Field, box: Box, h: number): Grid {
  // An irrational offset keeps grid vertices off the module grid, so exact
  // zeros on vertices (and coincident crossings) practically never happen.
  const x0 = box.x0 - h * 1.381966,
    y0 = box.y0 - h * 1.2763932
  const nx = Math.max(2, Math.ceil((box.x1 - x0) / h) + 2),
    ny = Math.max(2, Math.ceil((box.y1 - y0) / h) + 2)
  const W = nx + 1
  const v = new Float64Array(W * (ny + 1))
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      // The outer ring is forced outside so every loop closes.
      v[j * W + i] = i === 0 || j === 0 || i === nx || j === ny ? Infinity : f(x0 + i * h, y0 + j * h)
    }
  return { v: v, x0, y0, nx, ny, h }
}

function marching(grid: Grid, level: number): Vec[][] {
  const { x0, y0, nx, ny, h } = grid
  const W = nx + 1
  const v = level === 0 ? grid.v : grid.v.map((x) => x - level)
  const inside = (i: number, j: number) => v[j * W + i] < 0
  const pt = new Map<number, Vec>()
  const next = new Map<number, number>()
  // Edge ids: horizontal edge from vertex (i, j) to (i+1, j) → 2k, vertical (i, j)–(i, j+1) → 2k+1.
  const hEdge = (i: number, j: number) => (j * W + i) * 2
  const vEdge = (i: number, j: number) => (j * W + i) * 2 + 1
  const cross0 = (id: number) => {
    let p = pt.get(id)
    if (p) return id
    const k = id >> 1
    const i = k % W,
      j = (k - i) / W
    const a = v[k]
    const b = id & 1 ? v[k + W] : v[k + 1]
    const t = Number.isFinite(a - b) ? a / (a - b) : a === Infinity ? 0 : 1
    p = id & 1 ? [x0 + i * h, y0 + (j + t) * h] : [x0 + (i + t) * h, y0 + j * h]
    pt.set(id, p)
    return id
  }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const bl = inside(i, j),
        br = inside(i + 1, j),
        tr = inside(i + 1, j + 1),
        tl = inside(i, j + 1)
      if (bl === br && br === tr && tr === tl) continue
      // Cell edges in CCW order with the inside state at their start and end.
      const edges: [number, boolean, boolean][] = [
        [hEdge(i, j), bl, br],
        [vEdge(i + 1, j), br, tr],
        [hEdge(i, j + 1), tr, tl],
        [vEdge(i, j), tl, bl],
      ]
      const cuts = edges.filter((e) => e[1] !== e[2])
      if (cuts.length === 2) {
        const [a, b] = cuts[0][1] ? [cuts[0], cuts[1]] : [cuts[1], cuts[0]]
        next.set(cross0(a[0]), cross0(b[0]))
      } else {
        // Saddle: the centre value decides which corners connect.
        const c = (v[j * W + i] + v[j * W + i + 1] + v[(j + 1) * W + i] + v[(j + 1) * W + i + 1]) / 4
        for (let n = 0; n < 4; n++) {
          if (!cuts[n][1]) continue // in→out crossings start a segment
          const m = c < 0 ? (n + 1) % 4 : (n + 3) % 4
          next.set(cross0(cuts[n][0]), cross0(cuts[m][0]))
        }
      }
    }
  const loops: Vec[][] = []
  const seen = new Set<number>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: Vec[] = []
    let id: number | undefined = start
    while (id !== undefined && !seen.has(id)) {
      seen.add(id)
      loop.push(pt.get(id)!)
      id = next.get(id)
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/* ---------- 2. exact points ---------- */

function makeTools(f: Field, h: number, iterations: number) {
  const grad = (x: number, y: number): Vec => [
    (f(x + EPS_G, y) - f(x - EPS_G, y)) / (2 * EPS_G),
    (f(x, y + EPS_G) - f(x, y - EPS_G)) / (2 * EPS_G),
  ]
  /** Forward tangent with the inside on the left. */
  const tangent = (p: Vec): Vec => {
    const g = grad(p[0], p[1])
    const l = Math.hypot(g[0], g[1]) || 1
    return [-g[1] / l, g[0] / l]
  }
  const project = (p0: Vec): Vec => {
    let x = p0[0],
      y = p0[1]
    for (let k = 0; k < iterations; k++) {
      const d = f(x, y)
      if (Math.abs(d) < 1e-9) break
      const g = grad(x, y)
      const g2 = g[0] * g[0] + g[1] * g[1]
      if (g2 < 1e-6) return p0 // flat field: keep the marching squares vertex
      let sx = (d * g[0]) / g2,
        sy = (d * g[1]) / g2
      const s = Math.hypot(sx, sy)
      if (s > h) {
        sx *= h / s
        sy *= h / s
      }
      x -= sx
      y -= sy
    }
    if (Math.hypot(x - p0[0], y - p0[1]) > 1.5 * h) return p0
    return [x, y]
  }
  return { grad, tangent, project }
}

const angle = (a: Vec, b: Vec) => Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1])

/** Intersection of p + s·u and q + w·v, or null when the lines are near parallel. */
function meet(p: Vec, u: Vec, q: Vec, v: Vec): { c: Vec; s: number; w: number } | null {
  const den = cross(u, v)
  if (Math.abs(den) < Math.sin(5 * DEG)) return null
  const d: Vec = [q[0] - p[0], q[1] - p[1]]
  const s = cross(d, v) / den,
    w = cross(d, u) / den
  return { c: [p[0] + u[0] * s, p[1] + u[1] * s], s, w }
}

/* ---------- 3–4. corners, segmentation, fitting ---------- */

function traceLoop(raw: Vec[], f: Field, h: number, opts: Required<TraceOptions>): Contour | null {
  const { tangent, project } = makeTools(f, h, opts.newton)
  const thr = opts.corner * DEG
  // Exact points with tangents; coincident neighbours merge into one node.
  let nodes: Node[] = []
  for (const q of raw) {
    const p = project(q)
    const t = tangent(p)
    const last = nodes[nodes.length - 1]
    if (last && Math.hypot(p[0] - last.p[0], p[1] - last.p[1]) < 1e-7) {
      last.tout = t
      continue
    }
    nodes.push({ p, tin: t, tout: t, corner: false, split: false })
  }
  if (nodes.length > 1) {
    const a = nodes[0],
      z = nodes[nodes.length - 1]
    if (Math.hypot(a.p[0] - z.p[0], a.p[1] - z.p[1]) < 1e-7) {
      a.tin = z.tin
      nodes.pop()
    }
  }
  if (nodes.length < 3) return null
  for (const n of nodes) if (Math.abs(angle(n.tin, n.tout)) > thr) n.corner = true

  // Corners between nodes: a node sitting on the corner, or a corner inside a step.
  const tol = Math.max(0.1 * h, 1e-4)
  const okCorner = (c: Vec) => Math.abs(f(c[0], c[1])) < tol
  let n = nodes.length
  const brk = nodes.map((a, i) => Math.abs(angle(a.tout, nodes[(i + 1) % n].tin)) > thr)
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n,
      nx = (i + 1) % n
    if (!brk[prev] || !brk[i]) continue
    const A = nodes[prev],
      B = nodes[nx]
    if (Math.abs(angle(A.tout, B.tin)) <= thr) continue
    const m = meet(A.p, A.tout, B.p, B.tin)
    const node = nodes[i]
    if (m && m.s > -0.25 * h && m.w < 0.25 * h && m.s < 3 * h && m.w > -3 * h && okCorner(m.c)) node.p = m.c
    node.tin = A.tout
    node.tout = B.tin
    node.corner = true
    brk[prev] = brk[i] = false
  }
  const withCorners: Node[] = []
  for (let i = 0; i < n; i++) {
    const a = nodes[i],
      b = nodes[(i + 1) % n]
    withCorners.push(a)
    if (!brk[i]) continue
    const m = meet(a.p, a.tout, b.p, b.tin)
    if (m && m.s > -0.25 * h && m.w < 0.25 * h && m.s < 3 * h && m.w > -3 * h && okCorner(m.c)) {
      withCorners.push({ p: m.c, tin: a.tout, tout: b.tin, corner: true, split: false })
    } else {
      const mid = project([(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2])
      const t = tangent(mid)
      withCorners.push({ p: mid, tin: t, tout: t, corner: false, split: true })
    }
  }
  nodes = withCorners
  n = nodes.length

  // Step classes by curvature (robust to the uneven spacing of grid crossings):
  // straight steps barely turn and follow their chord.
  const kappa = nodes.map((a, i) => {
    const b = nodes[(i + 1) % n]
    const l = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) || 1e-9
    return angle(a.tout, b.tin) / l
  })
  const sinS = Math.sin(0.5 * DEG)
  const straight = nodes.map((a, i) => {
    const b = nodes[(i + 1) % n]
    const ch: Vec = [b.p[0] - a.p[0], b.p[1] - a.p[1]]
    const l = Math.hypot(ch[0], ch[1]) || 1
    const d: Vec = [ch[0] / l, ch[1] / l]
    return Math.abs(kappa[i]) < 0.02 && Math.abs(cross(d, a.tout)) < sinS && Math.abs(cross(d, b.tin)) < sinS
  })
  const turning = (i: number) => !straight[i] && !nodes[i].corner && !nodes[(i + 1) % n].corner
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n
    if (nodes[i].corner) continue
    // Line ↔ curve transitions.
    if (straight[prev] !== straight[i]) nodes[i].split = true
    // Inflections and jumps of curvature between two curved steps (skipping the step that straddles the joint).
    const pp = (i + n - 2) % n
    if (turning(pp) && turning(i)) {
      const ka = kappa[pp],
        kb = kappa[i]
      if (ka * kb < 0 && Math.abs(ka) > 0.05 && Math.abs(kb) > 0.05) nodes[i].split = true
      else if (ka * kb > 0) {
        const lo = Math.min(Math.abs(ka), Math.abs(kb)),
          hi = Math.max(Math.abs(ka), Math.abs(kb))
        if (hi > 1.6 * lo + 0.1) nodes[i].split = true
      }
    }
  }

  // Extremes of curved steps: exact nodes where the tangent is axis aligned.
  const out: Node[] = []
  for (let i = 0; i < n; i++) {
    const a = nodes[i],
      b = nodes[(i + 1) % n]
    out.push(a)
    if (straight[i] || a.corner || b.corner) continue
    for (const axis of [0, 1] as const) {
      const sa = a.tout[axis],
        sb = b.tin[axis]
      if (!(sa * sb < 0) || Math.abs(sa) < 1e-9 || Math.abs(sb) < 1e-9) continue
      let lo = 0,
        hi = 1
      let q = a.p
      for (let it = 0; it < 32; it++) {
        const mid = (lo + hi) / 2
        q = project([a.p[0] + (b.p[0] - a.p[0]) * mid, a.p[1] + (b.p[1] - a.p[1]) * mid])
        if (tangent(q)[axis] * sa > 0) lo = mid
        else hi = mid
      }
      const t = tangent(q)
      out.push({ p: q, tin: t, tout: t, corner: false, split: true })
      break
    }
  }
  nodes = out
  n = nodes.length

  // Cut into runs at break nodes and fit each run.
  const breaks: number[] = []
  for (let i = 0; i < n; i++) if (nodes[i].corner || nodes[i].split) breaks.push(i)
  if (breaks.length === 0) breaks.push(0, Math.floor(n / 2))
  else if (breaks.length === 1) breaks.push((breaks[0] + Math.floor(n / 2)) % n)
  const segs: Seg[] = []
  for (let b = 0; b < breaks.length; b++) {
    const s = breaks[b],
      e = breaks[(b + 1) % breaks.length]
    const run: Node[] = []
    for (let i = s; ; i = (i + 1) % n) {
      run.push(nodes[i])
      if (i === e && run.length > 1) break
    }
    const pts = run.map((r) => r.p)
    const t0 = run[0].tout,
      t1 = run[run.length - 1].tin
    if (isStraight(pts, t0, t1)) segs.push({ k: "L", p: pts[pts.length - 1] })
    else segs.push(...fitCubic(pts, t0, t1, opts.tolerance, (i) => run[i].tin))
  }
  return { start: nodes[breaks[0]].p, segs }
}

export const defaultTrace: Required<TraceOptions> = { step: 0.05, newton: 3, corner: 30, tolerance: 0.004 }

/** Traces the zero set of `f` inside `box` into closed contours (inside on the left). */
export function traceField(f: Field, box: Box, options: TraceOptions = {}): Contour[] {
  return traceLevels(f, box, [0], options)[0]
}

/** Traces several level sets f = level from one sampling of the grid. */
export function traceLevels(f: Field, box: Box, levels: number[], options: TraceOptions = {}): Contour[][] {
  const opts = { ...defaultTrace, ...options }
  if (!(box.x1 > box.x0) || !(box.y1 > box.y0)) return levels.map(() => [])
  const grid = sampleGrid(f, box, opts.step)
  return levels.map((level) => {
    const g: Field = level === 0 ? f : (x, y) => f(x, y) - level
    const out: Contour[] = []
    for (const l of marching(grid, level)) {
      const c = traceLoop(l, g, opts.step, opts)
      if (c && c.segs.length) out.push(c)
    }
    return out
  })
}

/** SVG path data of contours; `map` turns world points into SVG coordinates. */
export function contoursToPath(contours: Contour[], map: (p: Vec) => Vec, digits = 2): string {
  const f = (p: Vec) => {
    const q = map(p)
    return +q[0].toFixed(digits) + " " + +q[1].toFixed(digits)
  }
  let d = ""
  for (const c of contours) {
    d += "M" + f(c.start)
    for (const s of c.segs) d += s.k === "L" ? "L" + f(s.p) : "C" + f(s.c1) + " " + f(s.c2) + " " + f(s.p)
    d += "Z"
  }
  return d
}
