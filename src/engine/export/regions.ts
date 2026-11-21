// Colour regions of a merged composition for vector export.
// Capturing operators (union, fuse, eclipse, inlay, xor) give their layer a
// region bounded by the front f = b' − acc; toning operators (intersect,
// morph) tint every region below without new borders; cut owns nothing.
// Regions are painted bottom-up with overprint: region i = {d < 0} ∩ {f_i < 0}.
import { combine, frontOf, opRole, toneOf } from "../operators"
import { layerBounds, layerField, warpPoint, warpReach, type Frame, type FrameItem, type RGB } from "../frame"
import { BIG } from "../sdf"
import type { Box } from "../types"
import type { Field } from "./trace"

export type Region = {
  /** Layers whose fronts bound the region; −1 stands for the whole shape. */
  layers: number[]
  color: RGB
  box: Box
}

/**
 * Folds the frame at a world point like sampleFrame and records the front of
 * every capturing layer into `fronts` (BIG for other layers).
 */
export function foldFronts(f: Frame, item: FrameItem, x: number, y: number, fronts?: Float64Array): number {
  const [wx, wy] = warpPoint(f, x, y)
  let acc = BIG
  item.layers.forEach((l, i) => {
    const b = layerField(l, wx, wy)
    if (i === 0) {
      acc = b
      if (fronts) fronts[0] = -BIG
      return
    }
    if (fronts) fronts[i] = opRole(l.op) === "capture" ? frontOf(l.op, acc, b, l.gap) : BIG
    acc = combine(l.op, acc, b, l.k, l.gap, l.t)[0]
  })
  return acc
}

const same = (a: RGB, b: RGB) =>
  Math.abs(a[0] - b[0]) < 1 / 512 && Math.abs(a[1] - b[1]) < 1 / 512 && Math.abs(a[2] - b[2]) < 1 / 512

const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
})

/** World bounds of an item before warps. */
export function itemBounds(item: FrameItem, pad = 0): Box {
  let b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const l of item.layers) b = union(b, layerBounds(l))
  if (!Number.isFinite(b.x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}

/** Regions of one cluster in paint order; neighbours of one colour are merged. */
export function buildRegions(f: Frame, item: FrameItem): Region[] {
  if (!item.layers.length) return []
  const wr = warpReach(f.warp)
  const fuse = Math.max(0, ...item.layers.map((l) => (l.op === "fuse" ? l.k * 0.3 : 0)))
  const all = itemBounds(item, 0.6 + wr + fuse)
  const regions: Region[] = [{ layers: [-1], color: [...item.layers[0].color] as RGB, box: all }]
  item.layers.forEach((l, i) => {
    if (i === 0) return
    const role = opRole(l.op)
    if (role === "capture") {
      // The region lies inside the layer (fuse bridges reach k beyond it).
      const pad = 0.3 + wr + (l.op === "fuse" ? l.k : 0)
      regions.push({ layers: [i], color: [...l.color] as RGB, box: layerBounds(l, pad) })
    } else if (role === "tone") {
      const w = toneOf(l.op, l.t)
      for (const r of regions)
        r.color = [
          r.color[0] + (l.color[0] - r.color[0]) * w,
          r.color[1] + (l.color[1] - r.color[1]) * w,
          r.color[2] + (l.color[2] - r.color[2]) * w,
        ]
    }
  })
  const merged: Region[] = []
  for (const r of regions) {
    const last = merged[merged.length - 1]
    if (last && same(last.color, r.color)) {
      last.layers.push(...r.layers)
      last.box = union(last.box, r.box)
    } else merged.push({ ...r, layers: [...r.layers] })
  }
  return merged
}

/** Field whose zero set bounds the region: max(d, min over its fronts). */
export function regionField(f: Frame, item: FrameItem, r: Region): Field {
  if (r.layers.includes(-1)) return (x, y) => foldFronts(f, item, x, y)
  const fronts = new Float64Array(item.layers.length)
  return (x, y) => {
    const d = foldFronts(f, item, x, y, fronts)
    let m = BIG
    for (const i of r.layers) m = Math.min(m, fronts[i])
    return Math.max(d, m)
  }
}

/** Index of the topmost region containing a point (for tests and picking). */
export function regionAt(f: Frame, item: FrameItem, regions: Region[], x: number, y: number): number {
  const fronts = new Float64Array(item.layers.length)
  const d = foldFronts(f, item, x, y, fronts)
  if (d >= 0) return -1
  for (let k = regions.length - 1; k >= 0; k--) {
    const r = regions[k]
    if (r.layers.some((i) => i === -1 || fronts[i] < 0)) return k
  }
  return -1
}
