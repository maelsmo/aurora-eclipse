// A frame is the fully resolved scene for one moment: compiled glyphs, world
// transforms, colours and looks, grouped into draw items in z-order. Both the
// GPU packer and the CPU reference consume it.
import { resolveAxes } from "./axes"
import { compileGlyph } from "./compile"
import { combine, type Op } from "./operators"
import { BIG, sdBox, sdGlyph, clamp } from "./sdf"
import { CAP } from "./grid"
import type { Box, CompiledGlyph } from "./types"
import { CLONE_LIMITS, type Cloner, type Layer, type LetterNode, type Look, type LookPatch, type Material, type Scene, type ShapeNode, type Warp } from "./scene/types"
import { identity, nodeXf, xfApply, xfCompose, type Xf } from "./scene/tree"
import { hash2, noise2 } from "./noise"
import { layoutClones } from "./cloner"
import { applyEffectors, noEffect } from "./effectors"
import { resolveGlyphSet, type Library } from "./alphabet/sets"
import { compileShape } from "./shapes"

export type RGB = [number, number, number]

export type FrameLayer = {
  /** Source node id (picking, overlays): every clone of an object shares it. */
  id: string
  /** Unique instance key of a clone (`${id}#3`); absent outside cloners. */
  key?: string
  glyph: CompiledGlyph
  /** World placement: p = (x, y) + scale · R · diag(mirror, 1) · (q − anchor). */
  x: number
  y: number
  cos: number
  sin: number
  scale: number
  mirror: 1 | -1
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

/** How an item is drawn: the resolved look. */
export type FrameLook = Look

/**
 * A draw item. A cluster folds its layers bottom-up with their operators
 * (a merge group, or a single object) and is drawn as one instance.
 */
export type FrameItem = {
  /** cluster: a merge group folded with operators; solo: one letter or shape drawn on its own. */
  kind: "cluster" | "solo"
  /** Source node id: the merge group or the object. */
  id: string
  layers: FrameLayer[]
  look: FrameLook
  opacity: number
  /** Clips the item: drawn only inside this layer's shape. */
  mask?: FrameLayer
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

/** How far the scene material reaches beyond the shapes (corona, shadow). */
export function materialReach(m: Material) {
  let r = 0
  if (m.glow > 0) r = Math.max(r, m.glowSize * 6)
  if (m.shadow > 0) r = Math.max(r, Math.hypot(m.shadowX, m.shadowY) + m.shadowSoft + 0.5)
  return r
}

/** How far a look draws beyond the shape (isolines, halftone). */
export function lookMargin(l: Look) {
  if (l.mode === "isolines") return l.rings * l.spacing + l.spacing
  if (l.mode === "halftone") return l.dot * 2
  return 0
}

/** Every layer of the frame, bottom-up. */
export function frameLayers(f: Frame): FrameLayer[] {
  return f.items.length === 1 ? f.items[0].layers : f.items.flatMap((it) => it.layers)
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type LayerParams = { op: Op; k: number; gap: number; t: number; color: string }

export function makeFrameLayer(id: string, glyph: CompiledGlyph, world: Xf, p: LayerParams, margin: number): FrameLayer {
  const scale = Math.max(world.s, 0.05)
  const reach = Math.max(p.k, Math.abs(p.gap), glyph.fillet, Math.abs(glyph.ink), glyph.attract) + 0.25 + margin / scale
  return {
    id,
    glyph,
    x: world.x,
    y: world.y,
    cos: world.cos,
    sin: world.sin,
    scale,
    mirror: world.m,
    ax: glyph.anchor ? glyph.anchor[0] : (glyph.box.x0 + glyph.box.x1) / 2,
    ay: glyph.anchor ? glyph.anchor[1] : CAP / 2,
    op: p.op,
    k: p.k,
    gap: p.gap,
    t: p.t,
    color: hexToRgb(p.color),
    box: {
      x0: glyph.box.x0 - reach,
      y0: glyph.box.y0 - reach,
      x1: glyph.box.x1 + reach,
      y1: glyph.box.y1 + reach,
    },
    reach,
  }
}

type Ctx = {
  xf: Xf
  opacity: number
  look: LookPatch
  merge: FrameItem | null
  /** Mask of the nearest masking group (its bottom child). */
  mask: FrameLayer | null
  /** Clone path: "" outside cloners, "#3", "#3#12" in nested ones. */
  suffix: string
  /** Palette colour of the clone (replaces the object colour). */
  color: string | null
  /** Effector tint and its weight. */
  tint: RGB | null
  tintW: number
}

/** Layout step of a cloner: effector moves are measured in it. */
function clonerCell(c: Cloner) {
  switch (c.kind) {
    case "grid":
      return Math.max(Math.abs(c.dx), Math.abs(c.dy), 0.5)
    case "radial":
      return Math.max((2 * Math.PI * Math.max(c.radius, 0.5)) / Math.max(1, c.count), 0.5)
    case "linear":
      return Math.max(Math.hypot(c.dx, c.dy), 0.5)
    case "scatter":
      return Math.max(Math.sqrt((c.width * c.height) / Math.max(1, c.count)), 0.5)
  }
}

/**
 * Resolves the scene tree for one moment. Groups compose their transforms,
 * opacity and look patches downwards (scene ← set ← groups ← object); a merge
 * group becomes one cluster item, every other object its own item. A cloner
 * group repeats its children along its layout (effectors on top); a masking
 * group clips the rest of its children by its bottom child.
 */
export function buildFrame(
  scene: Scene,
  lib: Library,
  time: number,
  pointer: [number, number],
  margin = materialReach(scene.material),
): Frame {
  const items: FrameItem[] = []
  const kids = new Map<string | undefined, Layer[]>()
  for (const n of scene.layers) {
    const list = kids.get(n.parent)
    if (list) list.push(n)
    else kids.set(n.parent, [n])
  }
  let clones = 0

  // Clones of one object share its compiled glyph: compile once per node.
  const compiled = new Map<string, { glyph: CompiledGlyph; setLook?: LookPatch } | null>()
  const glyphOf = (n: LetterNode | ShapeNode) => {
    let c = compiled.get(n.id)
    if (c !== undefined) return c
    if (n.type === "letter") {
      const entry = resolveGlyphSet(lib, n.char, n.set, scene.set)
      c = entry ? { glyph: compileGlyph(n.char, entry.alphabet, resolveAxes(scene.axes, n.axes), entry.version), setLook: entry.set.look } : null
    } else c = { glyph: compileShape(n.shape) }
    compiled.set(n.id, c)
    return c
  }

  const makeLeaf = (n: LetterNode | ShapeNode, parent: Ctx): { layer: FrameLayer; look: Look } | null => {
    const c = glyphOf(n)
    if (!c) return null
    const { glyph, setLook } = c
    const look: Look = { ...scene.look, ...setLook, ...parent.look, ...n.look }
    const color = n.look?.tint ?? parent.look.tint ?? parent.color ?? n.color
    const world = xfCompose(parent.xf, nodeXf(n))
    const host = parent.merge
    const m = Math.max(margin, lookMargin(host ? host.look : look))
    const layer = makeFrameLayer(n.id, glyph, world, { op: n.op, k: n.k, gap: n.gap, t: n.t, color }, m)
    if (parent.suffix) layer.key = n.id + parent.suffix
    if (parent.tint && parent.tintW > 0) {
      const w = parent.tintW
      for (let i = 0; i < 3; i++) layer.color[i] += (parent.tint[i] - layer.color[i]) * w
    }
    return { layer, look }
  }

  const visit = (n: Layer, parent: Ctx) => {
    if (!n.visible) return
    if (n.type !== "group") {
      const leaf = makeLeaf(n, parent)
      if (!leaf) return
      if (parent.merge) parent.merge.layers.push(leaf.layer)
      else
        items.push({
          kind: "solo",
          id: n.id + parent.suffix,
          layers: [leaf.layer],
          look: leaf.look,
          opacity: parent.opacity * (n.opacity ?? 1),
          mask: parent.mask ?? undefined,
        })
      return
    }
    const ctx: Ctx = {
      ...parent,
      xf: xfCompose(parent.xf, nodeXf(n)),
      opacity: parent.opacity * (n.opacity ?? 1),
      look: n.look ? { ...parent.look, ...n.look } : parent.look,
    }
    if (n.mode === "merge" && !parent.merge) {
      const look = { ...scene.look, ...ctx.look }
      ctx.merge = { kind: "cluster", id: n.id + parent.suffix, layers: [], look, opacity: ctx.opacity, mask: parent.mask ?? undefined }
      items.push(ctx.merge)
    }
    let children = kids.get(n.id) ?? []
    if (n.mode === "stack" && !ctx.merge) {
      // The bottom child of a masking group is the mask: drawn nowhere, it clips the rest.
      if (n.mask && children.length > 1) {
        const m = children[0]
        children = children.slice(1)
        if (m.type !== "group" && m.visible) {
          const leaf = makeLeaf(m, { ...ctx, tint: null, tintW: 0, color: null })
          if (leaf) ctx.mask = leaf.layer
        }
      }
      const c = n.cloner
      if (c?.enabled && children.length) {
        expand(c, children, ctx)
        return
      }
    }
    for (const k of children) visit(k, ctx)
  }

  const expand = (c: Cloner, protos: Layer[], ctx: Ctx) => {
    const limit = Math.max(0, Math.min(CLONE_LIMITS.maxPerCloner, CLONE_LIMITS.scene - clones))
    const list = layoutClones(c, protos.length, limit)
    clones += list.length
    const cell = clonerCell(c)
    const centre: [number, number] = [ctx.xf.x, ctx.xf.y]
    const palette = c.palette.length ? c.palette : null
    const fx = noEffect()
    for (const cl of list) {
      let { x, y, rotation, scale } = cl
      let opacity = 1,
        tint: RGB | null = ctx.tint,
        tintW = ctx.tintW
      if (c.effectors.length) {
        Object.assign(fx, noEffect())
        applyEffectors(c.effectors, cl.index, [x, y], xfApply(ctx.xf, x, y), cell, time, centre, pointer, fx)
        x += fx.dx
        y += fx.dy
        rotation += fx.rotation
        scale *= fx.scale
        opacity = fx.opacity
        if (fx.tint && fx.tintW > 0) {
          tint = hexToRgb(fx.tint)
          tintW = fx.tintW
        }
      }
      if (opacity <= 0.002) continue
      const place = nodeXf({ x, y, scale, rotation, flipX: cl.flipX, flipY: cl.flipY })
      visit(protos[cl.child], {
        ...ctx,
        xf: xfCompose(ctx.xf, place),
        opacity: ctx.opacity * opacity,
        suffix: ctx.suffix + "#" + cl.index,
        color: palette ? palette[((cl.zone % palette.length) + palette.length) % palette.length] : ctx.color,
        tint,
        tintW,
      })
    }
  }

  const root: Ctx = { xf: identity, opacity: 1, look: {}, merge: null, mask: null, suffix: "", color: null, tint: null, tintW: 0 }
  for (const n of kids.get(undefined) ?? []) visit(n, root)
  return { items: items.filter((it) => it.layers.length > 0), warp: scene.warp, time, pointer, margin }
}

export { hash2, noise2 }

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
export function layerField(l: FrameLayer, wx: number, wy: number, inset = 0) {
  const dx = wx - l.x,
    dy = wy - l.y
  const lx = (l.mirror * (l.cos * dx + l.sin * dy)) / l.scale + l.ax
  const ly = (-l.sin * dx + l.cos * dy) / l.scale + l.ay
  const b = sdBox(lx, ly, l.box)
  // Outside the expanded box: a continuous lower bound of the true distance.
  if (b > 0) return (b + l.reach) * l.scale
  return sdGlyph(l.glyph, lx, ly, inset) * l.scale
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
  return foldItem(item, wx, wy, px)
}

/** Fold of an item, clipped by its mask. */
function foldItem(item: FrameItem, wx: number, wy: number, px: number): Sample {
  const s = foldLayers(item.layers, wx, wy, px, item.look.inset)
  if (item.mask) {
    const m = layerField(item.mask, wx, wy)
    s.d = Math.max(s.d, m)
    s.overlapD = Math.max(s.overlapD, m)
  }
  return s
}

function foldLayers(layers: FrameLayer[], wx: number, wy: number, px: number, inset = 0): Sample {
  let acc = BIG
  const color: RGB = [0, 0, 0]
  let overlap = 0,
    overlapD = BIG
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]
    const b = layerField(l, wx, wy, inset)
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
    const s = foldItem(f.items[k], wx, wy, px)
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
    const it = f.items[k]
    if (it.mask && layerField(it.mask, wx, wy) > slack) continue
    const ls = it.layers
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

/** Glyph point → world point. */
export function layerToWorld(l: FrameLayer, gx: number, gy: number): [number, number] {
  const lx = (gx - l.ax) * l.scale * l.mirror,
    ly = (gy - l.ay) * l.scale
  return [l.x + l.cos * lx - l.sin * ly, l.y + l.sin * lx + l.cos * ly]
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
    const [x, y] = layerToWorld(l, gx, gy)
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
