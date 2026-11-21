// Centre lines of module stripes for vector export (the «lines» look of
// geometric glyphs): horizontal and vertical stripes become straight
// segments, arcs become true SVG arcs, contour stripes become isolines of the
// module. Every stripe is clipped to its module and to the glyph's cut-outs,
// so a plotter draws exactly the bundles seen on screen.
import { layerToWorld, type FrameLayer } from "../frame"
import { arcCentre, isGeoPrim, sdPrim } from "../sdf"
import type { CompiledGlyph, CompiledPrim, Vec } from "../types"
import type { Look } from "../scene/types"
import { traceLevels, type Contour } from "./trace"

type Geo = Extract<CompiledPrim, { neg: boolean }>

export type StripeSeg = { kind: "line"; a: Vec; b: Vec } | { kind: "arc"; c: Vec; r: number; a0: number; a1: number }

export type ModuleStripes = {
  segs: StripeSeg[]
  /** Contour stripes of modules (polygons, «contour» direction), in module coordinates. */
  contours: Contour[]
}

const LINE_DIR = { h: 0, v: 1, arc: 2, contour: 3 } as const

function primBox(t: Geo, pad: number) {
  switch (t.kind) {
    case "box":
      return { x0: t.c[0] - t.h[0] - pad, y0: t.c[1] - t.h[1] - pad, x1: t.c[0] + t.h[0] + pad, y1: t.c[1] + t.h[1] + pad }
    case "poly": {
      const xs = t.pts.map((p) => p[0]),
        ys = t.pts.map((p) => p[1])
      return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
    }
    case "ellipse":
      return { x0: t.c[0] - t.rx - pad, y0: t.c[1] - t.ry - pad, x1: t.c[0] + t.rx + pad, y1: t.c[1] + t.ry + pad }
    case "sector": {
      const rx = t.r * t.sx,
        ry = t.r * t.sy
      return { x0: t.c[0] - rx - pad, y0: t.c[1] - ry - pad, x1: t.c[0] + rx + pad, y1: t.c[1] + ry + pad }
    }
    case "ngon":
      return { x0: t.c[0] - t.sx - pad, y0: t.c[1] - t.sy - pad, x1: t.c[0] + t.sx + pad, y1: t.c[1] + t.sy + pad }
  }
}

/** Intervals of a parameter range where `inside(t)` holds, ends refined by bisection. */
function intervals(t0: number, t1: number, steps: number, inside: (t: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  const dt = (t1 - t0) / steps
  const refine = (a: number, b: number, inA: boolean) => {
    for (let k = 0; k < 24; k++) {
      const m = (a + b) / 2
      if (inside(m) === inA) a = m
      else b = m
    }
    return (a + b) / 2
  }
  let prev = inside(t0)
  let start = prev ? t0 : NaN
  for (let i = 1; i <= steps; i++) {
    const t = t0 + i * dt
    const cur = inside(t)
    if (cur !== prev) {
      const e = refine(t - dt, t, prev)
      if (cur) start = e
      else out.push([start, e])
    }
    prev = cur
  }
  if (prev) out.push([start, t1])
  return out.filter(([a, b]) => b - a > 1e-4)
}

/**
 * Stripes of every module drawn as lines, in the glyph's own (unsheared)
 * coordinates. `n` stripes per module, centres at (k + ½) / n.
 */
export function moduleStripes(g: CompiledGlyph, inset: number, lineDir: Look["lineDir"], n: number): ModuleStripes {
  const segs: StripeSeg[] = []
  const contours: Contour[] = []
  const tiles = (g.tiles ?? []).filter((t): t is Geo => isGeoPrim(t) && !t.neg && t.mode !== 1 && t.mode !== 3)
  const cuts = g.prims.filter((p): p is Geo => isGeoPrim(p) && p.neg)
  const strokeCuts = g.prims.filter((p) => p.kind === "hole" || p.kind === "slot")
  const free = (x: number, y: number) => {
    for (const c of cuts) if (sdPrim(c, x, y) < 0) return false
    for (const c of strokeCuts) if (sdPrim(c, x, y) < 0) return false
    return true
  }
  const step = 1 / Math.max(n, 0.1)
  for (const t of tiles) {
    const dir = lineDir ? LINE_DIR[lineDir] : t.dir
    const inTile = (x: number, y: number) => sdPrim(t, x, y) + inset * 0.5 < 0 && free(x, y)
    const b = primBox(t, 0)
    if (dir === 0 || dir === 1) {
      const lo = dir === 0 ? b.y0 : b.x0,
        hi = dir === 0 ? b.y1 : b.x1
      const a0 = dir === 0 ? b.x0 : b.y0,
        a1 = dir === 0 ? b.x1 : b.y1
      const res = Math.max(40, Math.ceil((a1 - a0) / 0.01))
      for (let k = Math.ceil(lo / step - 0.5); (k + 0.5) * step <= hi; k++) {
        const u = (k + 0.5) * step
        if (u < lo) continue
        for (const [s, e] of intervals(a0, a1, res, (v) => (dir === 0 ? inTile(v, u) : inTile(u, v))))
          segs.push(dir === 0 ? { kind: "line", a: [s, u], b: [e, u] } : { kind: "line", a: [u, s], b: [u, e] })
      }
    } else if (dir === 2) {
      const c = arcCentre(t)
      const corners: Vec[] = [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x0, b.y1],
        [b.x1, b.y1],
      ]
      const rMax = Math.max(...corners.map(([x, y]) => Math.hypot(x - c[0], y - c[1])))
      for (let k = 0; (k + 0.5) * step <= rMax; k++) {
        const r = (k + 0.5) * step
        const res = Math.max(64, Math.ceil((2 * Math.PI * r) / 0.01))
        // Start just off the axis so a full ring is not split at angle 0.
        const base = 0.1234
        for (const [s, e] of intervals(base, base + 2 * Math.PI, res, (a) => inTile(c[0] + r * Math.cos(a), c[1] + r * Math.sin(a))))
          segs.push({ kind: "arc", c, r, a0: s, a1: e })
      }
    } else {
      // Contour stripes: isolines of the module's own field.
      const levels: number[] = []
      for (let k = 0; k < 64; k++) levels.push(-(k + 0.5) * step)
      const field = (x: number, y: number) => {
        const d = sdPrim(t, x, y) + inset * 0.5
        return free(x, y) ? d : Math.max(d, 0.5)
      }
      for (const cs of traceLevels(field, primBox(t, 0.05), levels)) contours.push(...cs)
    }
  }
  return { segs, contours }
}

/**
 * SVG path data of stripe segments placed by a frame layer. `toSvg` maps a
 * world point to SVG units, `unit` is SVG units per module. Arcs stay arcs
 * unless the glyph is slanted (then they are sampled).
 */
export function stripesPath(st: ModuleStripes, l: FrameLayer, toSvg: (p: Vec) => Vec, unit: number, contourPath: (cs: Contour[], map: (p: Vec) => Vec) => string): string {
  const shear = l.glyph.shear
  const place = (p: Vec): Vec => toSvg(layerToWorld(l, p[0] + (p[1] - 2.5) * shear, p[1]))
  const f = (p: Vec) => {
    const q = place(p)
    return +q[0].toFixed(2) + " " + +q[1].toFixed(2)
  }
  let d = ""
  for (const s of st.segs) {
    if (s.kind === "line") {
      d += "M" + f(s.a) + "L" + f(s.b)
      continue
    }
    const at = (a: number): Vec => [s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]
    if (shear !== 0) {
      const n = Math.max(4, Math.ceil(((s.a1 - s.a0) * s.r) / 0.05))
      d += "M" + f(at(s.a0))
      for (let i = 1; i <= n; i++) d += "L" + f(at(s.a0 + ((s.a1 - s.a0) * i) / n))
      continue
    }
    // Counter-clockwise in design space reads clockwise on the y-down page, unless mirrored.
    const sweep = l.mirror === 1 ? 0 : 1
    const R = +(s.r * l.scale * unit).toFixed(2)
    const span = s.a1 - s.a0
    if (span > 2 * Math.PI - 1e-3) {
      // A full ring: two half arcs.
      const mid = s.a0 + Math.PI
      d += "M" + f(at(s.a0)) + `A${R} ${R} 0 1 ${sweep} ` + f(at(mid)) + `A${R} ${R} 0 1 ${sweep} ` + f(at(s.a0))
    } else d += "M" + f(at(s.a0)) + `A${R} ${R} 0 ${span > Math.PI ? 1 : 0} ${sweep} ` + f(at(s.a1))
  }
  if (st.contours.length) d += contourPath(st.contours, place)
  return d
}
