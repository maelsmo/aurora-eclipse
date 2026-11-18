// Packs a frame into two RGBA32F data textures read by the shader with texelFetch.
import { opIndex } from "../operators"
import type { Frame } from "../frame"

export const PRIM_TEXELS = 4
export const LAYER_TEXELS = 8
export const MAX_LAYERS = 32
export const MAX_PRIMS = 2048
export const MAX_GLYPH_PRIMS = 48

/** Primitive kinds as stored on the GPU (ring = full-circle arc). */
export const KIND = { stroke: 0, arc: 1, dot: 2, hole: 3, slot: 4, ring: 5 } as const

export type Packed = {
  prims: Float32Array
  layers: Float32Array
  primCount: number
  layerCount: number
}

export function createPacked(): Packed {
  return {
    prims: new Float32Array(MAX_PRIMS * PRIM_TEXELS * 4),
    layers: new Float32Array(MAX_LAYERS * LAYER_TEXELS * 4),
    primCount: 0,
    layerCount: 0,
  }
}

export function packFrame(frame: Frame, out: Packed = createPacked()): Packed {
  const P = out.prims,
    L = out.layers
  let pi = 0,
    li = 0
  for (const layer of frame.layers) {
    if (li >= MAX_LAYERS) break
    const g = layer.glyph
    const count = Math.min(g.prims.length, MAX_GLYPH_PRIMS, MAX_PRIMS - pi)
    const start = pi
    for (let n = 0; n < count; n++, pi++) {
      const p = g.prims[n]
      const o = pi * PRIM_TEXELS * 4
      P.fill(0, o, o + PRIM_TEXELS * 4)
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
      }
    }
    const o = li * LAYER_TEXELS * 4
    L.set(
      [
        start, count, opIndex(layer.op), 0,
        layer.x, layer.y, layer.cos, layer.sin,
        layer.scale, layer.ax, layer.ay, g.shear,
        g.fillet, g.cutK, g.attract, g.ink,
        layer.k, layer.gap, layer.t, 0,
        layer.color[0], layer.color[1], layer.color[2], 0,
        layer.box.x0, layer.box.y0, layer.box.x1, layer.box.y1,
        layer.reach, 0, 0, 0,
      ],
      o,
    )
    li++
  }
  out.primCount = pi
  out.layerCount = li
  return out
}
