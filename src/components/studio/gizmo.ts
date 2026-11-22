// Canvas selection and transform geometry: which node a click selects, the
// selection box and its handles, and how handle drags change nodes (world
// gestures turned into local fields through the parent transforms).
import { frameLayers, layerBounds, layerField, layerToWorld, warpPoint, type Frame, type FrameLayer } from "@/engine/frame"
import {
  ancestors,
  isDescendant,
  isGroup,
  parentXf,
  worldXf,
  xfApply,
  xfInvert,
  type Layer,
  type ShapeNode,
} from "@/engine/scene"
import type { Box, Vec } from "@/engine/types"

/** Leaf ids under a world point, topmost first. */
export function pickAll(f: Frame, x: number, y: number, slack = 0): string[] {
  const [wx, wy] = warpPoint(f, x, y)
  const out: string[] = []
  for (let k = f.items.length - 1; k >= 0; k--) {
    const ls = f.items[k].layers
    for (let i = ls.length - 1; i >= 0; i--) if (layerField(ls[i], wx, wy) < slack) out.push(ls[i].id)
  }
  return out
}

const locked = (layers: Layer[], id: string) => {
  const n = layers.find((l) => l.id === id)
  return !!n?.locked || ancestors(layers, id).some((g) => g.locked)
}

/** The topmost leaf under the point that is not locked (itself or through a group). */
/** Tolerance of canvas picking, modules: thin slots and edges still hit their object. */
export const PICK_SLACK = 0.15

export function pickLeaf(f: Frame, layers: Layer[], x: number, y: number, slack = PICK_SLACK): string | null {
  for (const id of pickAll(f, x, y, slack)) if (!locked(layers, id)) return id
  return null
}

/**
 * Figma-like resolution of a click on a leaf:
 * - deep (⌘ / Ctrl): the leaf itself;
 * - otherwise the outermost group, unless the selection is already inside
 *   that branch: then the child of the selected node's parent on the path.
 */
export function clickTarget(layers: Layer[], leaf: string, selected: string[], deep: boolean): string {
  if (deep) return leaf
  const path = [...ancestors(layers, leaf).reverse().map((g) => g.id), leaf] // outermost → leaf
  // Deepest level where the current selection (or its siblings) lives.
  let level = 0
  for (const s of selected) {
    const sn = layers.find((l) => l.id === s)
    if (!sn) continue
    const k = path.indexOf(s)
    if (k >= 0) level = Math.max(level, k)
    else {
      // A sibling inside the same branch keeps the click at the sibling level.
      const pk = sn.parent ? path.indexOf(sn.parent) : -1
      if (pk >= 0) level = Math.max(level, pk + 1)
    }
  }
  return path[Math.min(level, path.length - 1)]
}

/** One level deeper than `current` on the way to the leaf (double click). */
export function drillTarget(layers: Layer[], leaf: string, current: string | undefined): string {
  const path = [...ancestors(layers, leaf).reverse().map((g) => g.id), leaf]
  const k = current ? path.indexOf(current) : -1
  return path[Math.min(k + 1, path.length - 1)]
}

/** Frame layers by source node: every clone of an object, and masks (drawn nowhere, still selectable). */
function layersById(f: Frame) {
  const all = new Map<string, FrameLayer[]>()
  const add = (l: FrameLayer) => {
    const list = all.get(l.id)
    if (!list) all.set(l.id, [l])
    else if (!list.includes(l)) list.push(l)
  }
  for (const it of f.items) {
    for (const l of it.layers) add(l)
    if (it.mask) add(it.mask)
  }
  return all
}

function leavesOf(layers: Layer[], id: string, all: Map<string, FrameLayer[]>): FrameLayer[] {
  const out: FrameLayer[] = [...(all.get(id) ?? [])]
  for (const l of layers) if (isDescendant(layers, l, id)) out.push(...(all.get(l.id) ?? []))
  return out
}

export type Gizmo = {
  /** Box corners in world: bottom-left, bottom-right, top-right, top-left. */
  quad: [Vec, Vec, Vec, Vec]
  pivot: Vec
  /** Single shape: its local axes for side handles. */
  shape: ShapeNode | null
  ids: string[]
}

/** Selection box: oriented around a single leaf, axis-aligned for groups and several nodes. */
export function selectionGizmo(f: Frame, layers: Layer[], ids: string[]): Gizmo | null {
  if (!ids.length) return null
  const all = layersById(f)
  // A single object drawn once: a box along its own axes.
  if (ids.length === 1 && all.get(ids[0])?.length === 1) {
    const l = all.get(ids[0])![0]
    const g = l.glyph.box
    const q = [layerToWorld(l, g.x0, g.y0), layerToWorld(l, g.x1, g.y0), layerToWorld(l, g.x1, g.y1), layerToWorld(l, g.x0, g.y1)] as Gizmo["quad"]
    const node = layers.find((n) => n.id === ids[0])
    return { quad: q, pivot: [l.x, l.y], shape: node?.type === "shape" ? node : null, ids }
  }
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const id of ids)
    for (const fl of leavesOf(layers, id, all)) {
      const lb = layerBounds(fl)
      b.x0 = Math.min(b.x0, lb.x0)
      b.y0 = Math.min(b.y0, lb.y0)
      b.x1 = Math.max(b.x1, lb.x1)
      b.y1 = Math.max(b.y1, lb.y1)
    }
  if (!Number.isFinite(b.x0)) return null
  const pivot: Vec = ids.length === 1 && isGroup(layers.find((n) => n.id === ids[0])) ? [worldXf(layers, ids[0]).x, worldXf(layers, ids[0]).y] : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
  return { quad: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], pivot, shape: null, ids }
}

/** World bounds of a node (for marquee selection). */
export function nodeBounds(f: Frame, layers: Layer[], id: string): Box | null {
  const all = layersById(f)
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const fl of leavesOf(layers, id, all)) {
    const lb = layerBounds(fl)
    b.x0 = Math.min(b.x0, lb.x0)
    b.y0 = Math.min(b.y0, lb.y0)
    b.x1 = Math.max(b.x1, lb.x1)
    b.y1 = Math.max(b.y1, lb.y1)
  }
  return Number.isFinite(b.x0) ? b : null
}

export type Handle = "move" | "rotate" | "scale-0" | "scale-1" | "scale-2" | "scale-3" | "w+" | "w-" | "h+" | "h-"

/** Handles in world coordinates; `px` is the size of a screen pixel in world units. */
export function handlePoints(g: Gizmo, px: number): { h: Handle; p: Vec }[] {
  const [a, b, c, d] = g.quad
  const mid = (p: Vec, q: Vec): Vec => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const top = mid(c, d)
  // The rotation knob sits 22 px beyond the top edge, along the box's up direction.
  const up: Vec = [d[0] - a[0], d[1] - a[1]]
  const ul = Math.hypot(up[0], up[1]) || 1
  const out: { h: Handle; p: Vec }[] = [
    { h: "scale-0", p: a },
    { h: "scale-1", p: b },
    { h: "scale-2", p: c },
    { h: "scale-3", p: d },
    { h: "rotate", p: [top[0] + (up[0] / ul) * 22 * px, top[1] + (up[1] / ul) * 22 * px] },
  ]
  if (g.shape) out.push({ h: "w+", p: mid(b, c) }, { h: "w-", p: mid(a, d) }, { h: "h+", p: top }, { h: "h-", p: mid(a, b) })
  return out
}

export type NodeStart = { id: string; node: Layer; world: ReturnType<typeof worldXf>; parentInv: ReturnType<typeof xfInvert> }

export function captureStart(layers: Layer[], ids: string[]): NodeStart[] {
  return ids.flatMap((id) => {
    const node = layers.find((l) => l.id === id)
    if (!node) return []
    return [{ id, node, world: worldXf(layers, id), parentInv: xfInvert(parentXf(layers, id)) }]
  })
}

/** Translation by a world delta. */
export function moveBy(starts: NodeStart[], dx: number, dy: number) {
  return starts.map((s) => {
    const [x, y] = xfApply(s.parentInv, s.world.x + dx, s.world.y + dy)
    return { id: s.id, patch: { x, y } }
  })
}

/** Uniform scale by f around a world pivot. */
export function scaleAround(starts: NodeStart[], pivot: Vec, f: number) {
  return starts.map((s) => {
    const wx = pivot[0] + (s.world.x - pivot[0]) * f,
      wy = pivot[1] + (s.world.y - pivot[1]) * f
    const [x, y] = xfApply(s.parentInv, wx, wy)
    return { id: s.id, patch: { x, y, scale: Math.max(0.05, Math.min(20, s.node.scale * f)) } }
  })
}

/** Rotation by `deg` around a world pivot (the parent's mirror flips the local sense). */
export function rotateAround(starts: NodeStart[], pivot: Vec, deg: number) {
  const a = (deg * Math.PI) / 180,
    c = Math.cos(a),
    s_ = Math.sin(a)
  return starts.map((s) => {
    const dx = s.world.x - pivot[0],
      dy = s.world.y - pivot[1]
    const [x, y] = xfApply(s.parentInv, pivot[0] + c * dx - s_ * dy, pivot[1] + s_ * dx + c * dy)
    const sense = s.parentInv.m
    return { id: s.id, patch: { x, y, rotation: Math.round((s.node.rotation + sense * deg) * 100) / 100 } }
  })
}

/** Side handle of a shape: the opposite side stays put, the size changes along the local axis. */
export function resizeShape(start: NodeStart, handle: "w+" | "w-" | "h+" | "h-", from: Vec, to: Vec) {
  const n = start.node as ShapeNode
  const w = start.world
  // Local axes of the node in world units.
  const ax: Vec = [w.cos * w.m, w.sin * w.m],
    ay: Vec = [-w.sin, w.cos]
  const axis = handle[0] === "w" ? ax : ay
  const sign = handle[1] === "+" ? 1 : -1
  const delta = ((to[0] - from[0]) * axis[0] + (to[1] - from[1]) * axis[1]) / Math.max(w.s, 1e-6)
  const key = handle[0] as "w" | "h"
  const size = Math.max(0.1, n.shape[key] + sign * delta)
  const grow = (size - n.shape[key]) / 2
  // Shift the centre by half the growth towards the dragged side.
  const cx = w.x + axis[0] * sign * grow * w.s,
    cy = w.y + axis[1] * sign * grow * w.s
  const [x, y] = xfApply(start.parentInv, cx, cy)
  return { id: start.id, patch: { x, y, shape: { ...n.shape, [key]: size } } as Partial<Layer> }
}
