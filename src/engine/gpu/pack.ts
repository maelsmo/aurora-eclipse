// Packs a frame for the instanced renderer:
// - primitives of every distinct compiled glyph (deduplicated by reference)
//   into a 1024-wide RGBA32F texture, 128 primitives × 8 texels per row;
// - cluster layers (transform, operator, colour, early-exit box) into 8 × 2048;
// - looks (per-object drawing parameters) into 8 × 256;
// - one instance record per draw item (matrix, bbox, ranges, opacity).
// Every texture stays within the 2048 px guaranteed by WebGL2.
import { opIndex } from "../operators"
import { layerBounds, warpReach, type Frame, type FrameItem, type FrameLook } from "../frame"
import { assertNever, type CompiledGlyph, type Box } from "../types"

export const PRIM_TEXELS = 8
export const PRIMS_PER_ROW = 128
export const PRIM_TEX_W = PRIM_TEXELS * PRIMS_PER_ROW
export const MAX_PRIMS = 8192
export const PRIM_TEX_H = MAX_PRIMS / PRIMS_PER_ROW
export const MAX_GLYPH_PRIMS = 48

export const LAYER_TEXELS = 8
export const MAX_LAYERS = 2048
/** Layers folded by one cluster instance (a merge group). */
export const MAX_CLUSTER = 32

export const LOOK_TEXELS = 8
export const MAX_LOOKS = 256

export const INSTANCE_FLOATS = 20
export const MAX_INSTANCES = 4096

/** Primitive kinds as stored on the GPU (ring = full-circle arc). */
export const KIND = { stroke: 0, arc: 1, dot: 2, hole: 3, slot: 4, ring: 5, box: 6, ellipse: 7, sector: 8, poly: 9, ngon: 10 } as const
export const FILL = { fill: 0, outline: 1, isolines: 2, halftone: 3, lines: 4 } as const
export const COLOR_MODE = { layer: 0, aurora: 1, depth: 2 } as const
/** Instance kinds (selects the fragment program). */
export const INSTANCE = { cluster: 0, solo: 1 } as const

export type Packed = {
  prims: Float32Array
  layers: Float32Array
  looks: Float32Array
  instances: Float32Array
  primCount: number
  layerCount: number
  lookCount: number
  instanceCount: number
  /** False when the glyph list is unchanged since the last pack: the primitive upload can be skipped. */
  primsDirty: boolean
  /** Glyphs in packing order, for the next frame's comparison. */
  glyphs: CompiledGlyph[]
}

export function createPacked(): Packed {
  return {
    prims: new Float32Array(PRIM_TEX_W * PRIM_TEX_H * 4),
    layers: new Float32Array(MAX_LAYERS * LAYER_TEXELS * 4),
    looks: new Float32Array(MAX_LOOKS * LOOK_TEXELS * 4),
    instances: new Float32Array(MAX_INSTANCES * INSTANCE_FLOATS),
    primCount: 0,
    layerCount: 0,
    lookCount: 0,
    instanceCount: 0,
    primsDirty: true,
    glyphs: [],
  }
}

function writeGlyph(P: Float32Array, g: CompiledGlyph, start: number, count: number) {
  for (let n = 0; n < count; n++) {
    const i = start + n
    const o = ((i >> 7) * PRIM_TEX_W + (i & 127) * PRIM_TEXELS) * 4
    P.fill(0, o, o + PRIM_TEXELS * 4)
    const p = g.prims[n]
    switch (p.kind) {
      case "stroke":
        P.set([KIND.stroke, p.a[0], p.a[1], p.r, p.b[0], p.b[1], p.round, 0], o)
        break
      case "slot":
        P.set([KIND.slot, p.a[0], p.a[1], p.r, p.b[0], p.b[1], 1, 0], o)
        break
      case "dot":
        P.set([KIND.dot, p.c[0], p.c[1], p.r], o)
        break
      case "hole":
        P.set([KIND.hole, p.c[0], p.c[1], p.r], o)
        break
      case "arc": {
        const h = Math.max((p.a1 - p.a0) * 0.5, 1e-4)
        const full = h >= Math.PI - 1e-4
        const rot = Math.PI / 2 - (p.a0 + p.a1) * 0.5
        P.set(
          [
            full ? KIND.ring : KIND.arc,
            p.c[0],
            p.c[1],
            p.half,
            p.r,
            p.sx,
            p.sy,
            p.round,
            Math.cos(rot),
            Math.sin(rot),
            Math.sin(h),
            Math.cos(h),
            p.c[0] + Math.cos(p.a0) * p.r * p.sx,
            p.c[1] + Math.sin(p.a0) * p.r * p.sy,
            p.c[0] + Math.cos(p.a1) * p.r * p.sx,
            p.c[1] + Math.sin(p.a1) * p.r * p.sy,
          ],
          o,
        )
        break
      }
      case "box":
        P.set([KIND.box, p.c[0], p.c[1], p.h[0], p.h[1], p.r[0], p.r[1], p.r[2], p.r[3], p.mode, p.dir, p.neg ? 1 : 0], o)
        break
      case "ellipse":
        P.set([KIND.ellipse, p.c[0], p.c[1], p.rx, p.ry, 0, 0, 0, 0, p.mode, p.dir, p.neg ? 1 : 0], o)
        break
      case "sector": {
        const h = (p.a1 - p.a0) / 2
        const rot = Math.PI / 2 - (p.a0 + p.a1) / 2
        const full = h >= Math.PI - 1e-4 ? 1 : 0
        P.set([KIND.sector, p.c[0], p.c[1], p.r, p.r0, p.sx, p.sy, full, 0, p.mode, p.dir, p.neg ? 1 : 0, Math.cos(rot), Math.sin(rot), Math.sin(h), Math.cos(h)], o)
        break
      }
      case "poly": {
        const q = [...p.pts]
        while (q.length < 4) q.push(q[q.length - 1])
        P.set([KIND.poly, p.pts.length, 0, 0, 0, 0, 0, 0, 0, p.mode, p.dir, p.neg ? 1 : 0, q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]], o)
        break
      }
      case "ngon": {
        const k = p.inner >= 1 ? Math.cos(Math.PI / p.sides) : p.inner
        P.set([KIND.ngon, p.c[0], p.c[1], p.sides, k, p.sx, p.sy, p.round, 0, p.mode, p.dir, p.neg ? 1 : 0], o)
        break
      }
      default:
        assertNever(p)
    }
  }
}

const lookKey = (l: FrameLook) => `${l.mode}|${l.line}|${l.spacing}|${l.rings}|${l.dot}|${l.stripes}|${l.stripeFill}|${l.inset}|${l.colorMode}`

/** How far the drawing of a look reaches beyond the shape, modules. */
export function lookReach(l: FrameLook) {
  switch (l.mode) {
    case "outline":
      return l.line * 0.5
    case "isolines":
      return l.rings * l.spacing + l.spacing * 0.5
    case "halftone":
      return l.dot * 1.25
    default:
      return 0
  }
}

/** World bounds of an item's body instance (before the pixel margin). */
export function itemBox(f: Frame, item: FrameItem): Box {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  let grow = 0
  for (const l of item.layers) {
    const lb = layerBounds(l)
    b.x0 = Math.min(b.x0, lb.x0)
    b.y0 = Math.min(b.y0, lb.y0)
    b.x1 = Math.max(b.x1, lb.x1)
    b.y1 = Math.max(b.y1, lb.y1)
    // Smooth unions swell the shape by at most 0.3 × their radius.
    grow = Math.max(grow, (l.op === "fuse" ? l.k : 0) * 0.3 * l.scale, 0.3 * Math.max(l.glyph.fillet, l.glyph.attract) * l.scale)
  }
  const pad = grow + lookReach(item.look) + warpReach(f.warp)
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}

export function packFrame(frame: Frame, out: Packed = createPacked()): Packed {
  const { prims: P, layers: L, looks: K, instances: I } = out
  // Primitive ranges by glyph reference: identical glyphs are stored once.
  const ranges = new Map<CompiledGlyph, [number, number]>()
  const glyphs: CompiledGlyph[] = []
  let pi = 0
  for (const item of frame.items)
    for (const l of item.layers) {
      if (ranges.has(l.glyph)) continue
      const count = Math.min(l.glyph.prims.length, MAX_GLYPH_PRIMS, MAX_PRIMS - pi)
      ranges.set(l.glyph, [pi, count])
      glyphs.push(l.glyph)
      pi += count
    }
  const same = glyphs.length === out.glyphs.length && glyphs.every((g, i) => g === out.glyphs[i])
  out.primsDirty = !same
  if (!same) for (const g of glyphs) writeGlyph(P, g, ranges.get(g)![0], ranges.get(g)![1])
  out.glyphs = glyphs
  out.primCount = pi

  const looks = new Map<string, number>()
  /** Glyph records of solo instances (layer texture rows), shared by identical glyphs. */
  const glyphRows = new Map<CompiledGlyph, number>()
  let li = 0,
    ki = 0,
    ii = 0
  const writeLayer = (layer: FrameItem["layers"][number], row: number) => {
    const [ps, pc] = ranges.get(layer.glyph)!
    const g = layer.glyph
    L.set(
      [
        ps, pc, opIndex(layer.op), layer.mirror,
        layer.x, layer.y, layer.cos, layer.sin,
        layer.scale, layer.ax, layer.ay, g.shear,
        g.fillet, g.cutK, g.attract, g.ink,
        layer.k, layer.gap, layer.t, 0,
        layer.color[0], layer.color[1], layer.color[2], 0,
        layer.box.x0, layer.box.y0, layer.box.x1, layer.box.y1,
        layer.reach, 0, 0, 0,
      ],
      row * LAYER_TEXELS * 4,
    )
  }
  const wr = warpReach(frame.warp)
  for (const item of frame.items) {
    if (ii >= MAX_INSTANCES) break
    const key = lookKey(item.look)
    let look = looks.get(key)
    if (look === undefined && ki < MAX_LOOKS) {
      look = ki++
      looks.set(key, look)
      const o = look * LOOK_TEXELS * 4
      const lk = item.look
      K.fill(0, o, o + LOOK_TEXELS * 4)
      K.set([FILL[lk.mode], lk.line, lk.spacing, lk.rings, lk.dot, COLOR_MODE[lk.colorMode], lk.inset, 0, lk.stripes, lk.stripeFill, 0, 0], o)
    }
    if (item.kind === "solo") {
      const l = item.layers[0]
      let row = glyphRows.get(l.glyph)
      if (row === undefined) {
        if (li >= MAX_LAYERS) continue
        row = li++
        glyphRows.set(l.glyph, row)
        writeLayer(l, row)
      }
      // Glyph coordinates → world: p = t + s·R·diag(m,1)·(q − anchor).
      const s = l.scale
      const a = s * l.mirror * l.cos,
        b = s * l.mirror * l.sin,
        c = -s * l.sin,
        d = s * l.cos
      const tx = l.x - (a * l.ax + c * l.ay),
        ty = l.y - (b * l.ax + d * l.ay)
      const g = l.glyph.box
      const pad = (lookReach(item.look) + item.look.line * 0.5 + wr) / s + Math.max(0, l.glyph.ink) + 0.3 * l.glyph.fillet
      I.set(
        [
          a, b, c, d,
          tx, ty, item.opacity, look ?? 0,
          row, 0, INSTANCE.solo, s,
          g.x0 - pad, g.y0 - pad, g.x1 + pad, g.y1 + pad,
          l.color[0], l.color[1], l.color[2], 0,
        ],
        ii * INSTANCE_FLOATS,
      )
      ii++
      continue
    }
    const start = li
    for (const layer of item.layers.slice(0, MAX_CLUSTER)) {
      if (li >= MAX_LAYERS) break
      writeLayer(layer, li++)
    }
    const box = itemBox(frame, item)
    I.set(
      [
        1, 0, 0, 1,
        0, 0, item.opacity, look ?? 0,
        start, li - start, INSTANCE.cluster, 1,
        box.x0, box.y0, box.x1, box.y1,
        0, 0, 0, 0,
      ],
      ii * INSTANCE_FLOATS,
    )
    ii++
  }
  out.layerCount = li
  out.lookCount = ki
  out.instanceCount = ii
  return out
}
