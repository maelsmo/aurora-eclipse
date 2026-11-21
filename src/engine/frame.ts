// A frame is the fully resolved scene for one moment: compiled glyphs, world
// transforms, colours, grouped into draw items in z-order. Both the GPU
// packer and the CPU reference consume it.
import { resolveAxes } from "./axes"
import { compileGlyph } from "./compile"
import { combine, type Op } from "./operators"
import { BIG, sdBox, sdGlyph, clamp } from "./sdf"
import { CAP } from "./grid"
import type { Alphabet, Box, CompiledGlyph } from "./types"
import type { ColorMode, FillMode, Material, Scene, Warp } from "./scene"

export type RGB = [number, number, number]

export type FrameLayer = {
  /** Source layer id (picking, overlays). */
  id: string
  glyph: CompiledGlyph
  x: number
  y: number
  cos: number
  sin: number
  scale: number
  /** Anchor in glyph coordinates (rotation / scale centre). */
  ax: number
  ay: number
  op: Op
  k: number
  gap: number
  t: number
  color: RGB
  /** Local box used for the early exit, already expanded by `reach`. */
  box: Box
  /** How far the box was expanded: the true distance at its border is at least this. */
  reach: number
}

/** How an item is drawn: the per-object part of the material. */
export type FrameLook = {
  fill: FillMode
  line: number
  spacing: number
  rings: number
  dot: number
  colorMode: ColorMode
}

/**
 * A draw item. A cluster folds its layers bottom-up with their operators
 * (the merged "eclipse" composition) and is drawn as one instance.
 */
export type FrameItem = {
  kind: "cluster"
  /** Source node id. */
  id: string
  layers: FrameLayer[]
  look: FrameLook
  opacity: number
}

export type Frame = {
  /** Draw items in z-order (bottom first). */
  items: FrameItem[]
  warp: Warp
  time: number
  pointer: [number, number]
  /** Extra reach that the early exit must keep (glow, gaps, fillets). */
  margin: number
}

export const lookOf = (m: Material): FrameLook => ({
  fill: m.fill,
  line: m.line,
  spacing: m.spacing,
  rings: m.rings,
  dot: m.dot,
  colorMode: m.colorMode,
})

/** Every layer of the frame, bottom-up. */
export function frameLayers(f: Frame): FrameLayer[] {
  return f.items.length === 1 ? f.items[0].layers : f.items.flatMap((it) => it.layers)
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function makeFrameLayer(
  id: string,
  glyph: CompiledGlyph,
  t: { x: number; y: number; scale: number; rotation: number; op: Op; k: number; gap: number; t: number; color: string },
  margin: number,
): FrameLayer {
  const scale = Math.max(t.scale, 0.05)
  const reach =
    Math.max(t.k, Math.abs(t.gap), glyph.fillet, Math.abs(glyph.ink), glyph.attract) + 0.25 + margin / scale
  const a = (t.rotation * Math.PI) / 180
  return {
    id,
    glyph,
    x: t.x,
    y: t.y,
    cos: Math.cos(a),
    sin: Math.sin(a),
    scale,
    ax: (glyph.box.x0 + glyph.box.x1) / 2,
    ay: CAP / 2,
    op: t.op,
    k: t.k,
    gap: t.gap,
    t: t.t,
    color: hexToRgb(t.color),
    box: {
      x0: glyph.box.x0 - reach,
      y0: glyph.box.y0 - reach,
      x1: glyph.box.x1 + reach,
      y1: glyph.box.y1 + reach,
    },
    reach,
  }
}

export function buildFrame(
  scene: Scene,
  alphabet: Alphabet,
  revision: number,
  time: number,
  pointer: [number, number],
  margin = 0,
): Frame {
  const layers: FrameLayer[] = []
  for (const l of scene.layers) {
    if (!l.visible || !(l.char in alphabet)) continue
    const axes = resolveAxes(scene.axes, l.axes)
    const glyph = compileGlyph(l.char, alphabet, axes, revision)
    layers.push(makeFrameLayer(l.id, glyph, l, margin))
  }
  const items: FrameItem[] = layers.length
    ? [{ kind: "cluster", id: "root", layers, look: lookOf(scene.material), opacity: 1 }]
    : []
  return { items, warp: scene.warp, time, pointer, margin }
}

/* ---------- portable noise (identical integer hash in GLSL) ---------- */

export function hash2(ix: number, iy: number) {
  let h = (Math.imul(ix | 0, 1597334673) ^ Math.imul(iy | 0, 3812015801)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967295
}

export function noise2(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y)
  const fx = x - ix,
    fy = y - iy
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy),
    b = hash2(ix + 1, iy),
    c = hash2(ix, iy + 1),
    d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/** World-space deformations: wave, flow noise, pointer bulge. */
export function warpPoint(f: Frame, x: number, y: number): [number, number] {
  const w = f.warp
  if (w.wave > 0) {
    const ph = f.time * w.waveSpeed * 2
    x += w.wave * Math.sin(y * w.waveFreq + ph)
    y += w.wave * 0.5 * Math.sin(x * w.waveFreq * 0.7 + ph * 1.3)
  }
  if (w.flow > 0) {
    const s = w.flowScale,
      tt = f.time * w.flowSpeed
    const nx = noise2(x * s + tt, y * s) - 0.5
    const ny = noise2(x * s + 17.3, y * s - tt) - 0.5
    x += w.flow * 2 * nx
    y += w.flow * 2 * ny
  }
  if (w.pointer !== 0) {
    const dx = x - f.pointer[0],
      dy = y - f.pointer[1]
    const r = Math.max(w.pointerRadius, 0.1)
    const fall = Math.exp(-(dx * dx + dy * dy) / (r * r))
    // Positive values magnify the shape under the pointer, negative pinch it.
    x -= dx * w.pointer * fall
    y -= dy * w.pointer * fall
  }
  return [x, y]
}

/** Field of one layer at a world point (after warps). */
export function layerField(l: FrameLayer, wx: number, wy: number) {
  const dx = wx - l.x,
    dy = wy - l.y
  const lx = (l.cos * dx + l.sin * dy) / l.scale + l.ax
  const ly = (-l.sin * dx + l.cos * dy) / l.scale + l.ay
  const b = sdBox(lx, ly, l.box)
  // Outside the expanded box: a continuous lower bound of the true distance.
  if (b > 0) return (b + l.reach) * l.scale
  return sdGlyph(l.glyph, lx, ly) * l.scale
}

export type Sample = {
  d: number
  color: RGB
  overlap: number
  /** Distance to the union of all pairwise overlaps (layer ∩ everything below). */
  overlapD: number
}

/**
 * Folds the layers of one cluster bottom-up. `px` is the size of a pixel in
 * world units and only shapes the overlap mask and colour fronts.
 */
export function sampleItem(f: Frame, item: FrameItem, x: number, y: number, px = 0.02): Sample {
  const [wx, wy] = warpPoint(f, x, y)
  return foldLayers(item.layers, wx, wy, px)
}

function foldLayers(layers: FrameLayer[], wx: number, wy: number, px: number): Sample {
  let acc = BIG
  const color: RGB = [0, 0, 0]
  let overlap = 0,
    overlapD = BIG
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]
    const b = layerField(l, wx, wy)
    if (i === 0) {
      acc = b
      color[0] = l.color[0]
      color[1] = l.color[1]
      color[2] = l.color[2]
      continue
    }
    const cov = (d: number) => clamp(0.5 - d / px, 0, 1)
    overlap = Math.max(overlap, cov(acc) * cov(b))
    overlapD = Math.min(overlapD, Math.max(acc, b))
    const [d, w] = combine(l.op, acc, b, l.k, l.gap, l.t, px)
    acc = d
    color[0] += (l.color[0] - color[0]) * w
    color[1] += (l.color[1] - color[1]) * w
    color[2] += (l.color[2] - color[2]) * w
  }
  return { d: acc, color, overlap, overlapD }
}

/**
 * Samples the whole frame: the union of all items, coloured by the topmost
 * item that contains the point (the nearest one outside every shape).
 */
export function sampleFrame(f: Frame, x: number, y: number, px = 0.02): Sample {
  if (f.items.length === 1) return sampleItem(f, f.items[0], x, y, px)
  const [wx, wy] = warpPoint(f, x, y)
  let best: Sample = { d: BIG, color: [0, 0, 0], overlap: 0, overlapD: BIG }
  for (let k = f.items.length - 1; k >= 0; k--) {
    const s = foldLayers(f.items[k].layers, wx, wy, px)
    if (best.d < 0) {
      best = { ...best, d: Math.min(best.d, s.d) }
      continue
    }
    if (s.d < best.d) best = s
  }
  return best
}

/** Id of the topmost layer whose own shape contains the world point. */
export function pickLayer(f: Frame, x: number, y: number, slack = 0): string | null {
  const [wx, wy] = warpPoint(f, x, y)
  for (let k = f.items.length - 1; k >= 0; k--) {
    const ls = f.items[k].layers
    for (let i = ls.length - 1; i >= 0; i--) if (layerField(ls[i], wx, wy) < slack) return ls[i].id
  }
  return null
}

/** Distance from a world point to the nearest shape of the frame (no operators). */
export function nearestDistance(f: Frame, x: number, y: number) {
  const [wx, wy] = warpPoint(f, x, y)
  let d = Infinity
  for (const it of f.items) for (const l of it.layers) d = Math.min(d, layerField(l, wx, wy))
  return d
}

/** World bounds of one layer (transformed glyph box), before warps. */
export function layerBounds(l: FrameLayer, pad = 0): Box {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const g = l.glyph.box
  const ink = Math.max(0, l.glyph.ink)
  for (const [gx, gy] of [
    [g.x0 - ink, g.y0 - ink],
    [g.x1 + ink, g.y0 - ink],
    [g.x0 - ink, g.y1 + ink],
    [g.x1 + ink, g.y1 + ink],
  ]) {
    const lx = (gx - l.ax) * l.scale,
      ly = (gy - l.ay) * l.scale
    const x = l.x + l.cos * lx - l.sin * ly,
      y = l.y + l.sin * lx + l.cos * ly
    b.x0 = Math.min(b.x0, x)
    b.y0 = Math.min(b.y0, y)
    b.x1 = Math.max(b.x1, x)
    b.y1 = Math.max(b.y1, y)
  }
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}

/** How far the warps can move a point (bounds of wave, flow and the pointer lens). */
export function warpReach(w: Warp) {
  return w.wave + w.flow + 0.43 * Math.abs(w.pointer) * w.pointerRadius
}

/** World bounds of the frame (union of transformed glyph boxes). */
export function frameBounds(f: Frame, pad = 0): Box {
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const l of frameLayers(f)) {
    const lb = layerBounds(l)
    b.x0 = Math.min(b.x0, lb.x0)
    b.y0 = Math.min(b.y0, lb.y0)
    b.x1 = Math.max(b.x1, lb.x1)
    b.y1 = Math.max(b.y1, lb.y1)
  }
  if (!Number.isFinite(b.x0)) return { x0: -3, y0: -3, x1: 3, y1: 3 }
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }
}
