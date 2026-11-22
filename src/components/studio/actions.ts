// Scene actions on the current selection, shared by the layer tree, its
// context menu, the canvas and keyboard shortcuts.
import { toast } from "sonner"
import { childrenOf, deleteNodes, duplicateNodes, groupNodes, isDescendant, isGroup, isLeaf, LIMITS, moveNode, ungroup, type GroupMode, type Layer, type Scene, ancestors, defaultCloner, addIssue, subtreeSize, depthIssue } from "@/engine/scene"
import { selectedIds, useStore } from "@/state/store"
import { runtime } from "@/state/runtime"
import { layerBounds } from "@/engine/frame"

const st = () => useStore.getState()

/** Selected ids without the ones whose ancestor is selected too (subtree roots). */
export function selectionRoots(scene: Scene, ids: string[]): string[] {
  const set = new Set(ids)
  return ids.filter((id) => {
    const n = scene.layers.find((l) => l.id === id)
    return n && ![...set].some((o) => o !== id && isDescendant(scene.layers, n, o))
  })
}

export function groupSelection(mode: GroupMode) {
  const s = st()
  let ids = selectionRoots(s.scene, selectedIds(s))
  if (mode === "merge") ids = ids.filter((id) => isLeaf(s.scene.layers.find((l) => l.id === id)))
  if (!ids.length) {
    if (mode === "merge") toast("В сплав объединяются буквы и фигуры. Выделите хотя бы одну.")
    return
  }
  if (mode === "merge" && ids.length > LIMITS.mergeChildren)
    return void toast.error(`В сплаве не больше ${LIMITS.mergeChildren} объектов, выделено ${ids.length}. Разбейте их на несколько сплавов.`)
  const issue = addIssue(s.scene.layers, undefined, 0, 1) ?? depthIssue(s.scene.layers, ids)
  if (issue) return void toast.error(issue)
  const { scene, id } = groupNodes(s.scene, ids, mode)
  s.setScene(scene)
  if (id) s.select(id)
}

export function ungroupSelection() {
  const s = st()
  const groups = selectedIds(s).filter((id) => isGroup(s.scene.layers.find((l) => l.id === id)))
  if (!groups.length) return
  const kids = groups.flatMap((g) => childrenOf(s.scene.layers, g).map((c) => c.id))
  s.setScene((scene) => groups.reduce((acc, g) => ungroup(acc, g), scene))
  s.selectMany(kids)
}

export function duplicateSelection() {
  const s = st()
  const ids = selectionRoots(s.scene, selectedIds(s))
  if (!ids.length) return
  // Copies count whole subtrees; copies of merge children stay in that merge.
  const total = ids.reduce((n, id) => n + subtreeSize(s.scene.layers, id), 0)
  const byParent = new Map<string | undefined, number>()
  for (const id of ids) {
    const p = s.scene.layers.find((l) => l.id === id)?.parent
    byParent.set(p, (byParent.get(p) ?? 0) + 1)
  }
  const issue =
    addIssue(s.scene.layers, undefined, 0, total) ?? [...byParent].map(([p, n]) => addIssue(s.scene.layers, p, n, 0)).find((x) => x) ?? null
  if (issue) return void toast.error(issue)
  const res = duplicateNodes(s.scene, ids)
  s.setScene(res.scene)
  s.selectMany(res.ids)
}

export function deleteSelection() {
  const s = st()
  const ids = selectedIds(s).filter((id) => !s.scene.layers.find((l) => l.id === id)?.locked)
  if (!ids.length) return
  s.setScene((scene) => deleteNodes(scene, ids))
  s.select(null)
}

/** Shows / hides (or locks / unlocks) the given nodes: all become the opposite of the first. */
export function toggleFlag(ids: string[], flag: "visible" | "locked") {
  const s = st()
  const first = s.scene.layers.find((l) => l.id === ids[0])
  if (!first) return
  const value = flag === "visible" ? !first.visible : !first.locked
  s.updateLayers(
    ids.map((id) => ({ id, patch: flag === "visible" ? { visible: value } : { locked: value || undefined } })),
  )
}

/** Moves the selection to the top or the bottom of its siblings. */
export function arrange(edge: "front" | "back") {
  const s = st()
  const ids = selectionRoots(s.scene, selectedIds(s))
  s.setScene((scene) =>
    ids.reduce((acc, id) => {
      const n = acc.layers.find((l) => l.id === id)
      if (!n) return acc
      const sibs = childrenOf(acc.layers, n.parent).filter((x) => x.id !== id)
      return moveNode(acc, id, n.parent, edge === "front" ? sibs.length : 0)
    }, scene),
  )
}

export function selectAll() {
  const s = st()
  s.selectMany(s.scene.layers.filter((l) => !l.parent).map((l) => l.id))
}

/** Children of the selected groups become the selection. */
export function selectChildren() {
  const s = st()
  const kids = selectedIds(s).flatMap((id) => childrenOf(s.scene.layers, id).map((c) => c.id))
  if (kids.length) s.selectMany(kids)
}

/**
 * Drop target in the layer list: `before` / `after` refer to the list
 * (top of the list = top of the z-order), `inside` puts the nodes on top of
 * a group's children.
 */
export type DropTarget = { id: string; where: "above" | "below" | "inside" }

export function moveTo(dragged: string[], target: DropTarget) {
  const s = st()
  const scene = s.scene
  const t = scene.layers.find((l) => l.id === target.id)
  if (!t) return
  const roots = selectionRoots(scene, dragged).filter((id) => id !== target.id && !isDescendant(scene.layers, t, id))
  if (!roots.length) return
  const parent = target.where === "inside" ? t.id : t.parent
  const host = parent ? scene.layers.find((l) => l.id === parent) : undefined
  // Merge groups take letters and shapes only.
  const ok = roots.filter((id) => !(isGroup(host) && host.mode === "merge" && !isLeaf(scene.layers.find((l) => l.id === id))))
  if (ok.length < roots.length) toast("Группы не входят в сплав: в нём только буквы и фигуры.")
  const arriving = ok.filter((id) => scene.layers.find((l) => l.id === id)?.parent !== parent).length
  const issue = addIssue(scene.layers, parent, arriving, 0) ?? depthIssue(scene.layers, ok, parent ?? null)
  if (issue) return void toast.error(issue)
  let next = scene
  // Keep the dragged nodes' z-order: the topmost one ends up highest.
  const ordered = [...ok].sort((a, b) => next.layers.findIndex((l) => l.id === a) - next.layers.findIndex((l) => l.id === b))
  for (const id of ordered) {
    const sibs = childrenOf(next.layers, parent).filter((x) => x.id !== id)
    let index: number
    if (target.where === "inside") index = sibs.length
    else {
      const k = sibs.findIndex((x) => x.id === target.id)
      index = target.where === "above" ? k + 1 : k
    }
    next = moveNode(next, id, parent, Math.max(0, index))
    // The next node goes right above the one just placed.
    target = { id, where: "above" }
  }
  s.setScene(next)
}

/** Human description of where a node sits (for the list's second line). */
export function nodeRole(scene: Scene, n: Layer): "base" | "operand" | "free" {
  const p = n.parent ? scene.layers.find((l) => l.id === n.parent) : undefined
  if (!isGroup(p) || p.mode !== "merge") return "free"
  return childrenOf(scene.layers, p.id)[0]?.id === n.id ? "base" : "operand"
}

/**
 * Wraps the selection into a new cloner group (a stack group with a grid
 * cloner). The objects keep their places as offsets inside the layout.
 */
export function clonerFromSelection() {
  const s = st()
  const ids = selectionRoots(s.scene, selectedIds(s))
  if (!ids.length) return
  // A single group that is not a merge becomes a cloner itself.
  const only = ids.length === 1 ? s.scene.layers.find((l) => l.id === ids[0]) : undefined
  if (isGroup(only) && only.mode === "stack") {
    s.updateLayer(only.id, { cloner: { ...(only.cloner ?? defaultCloner), enabled: true } })
    return
  }
  // The layout step follows the size of what is cloned (as drawn now), plus a slot of air.
  const frame = runtime.frame
  let w = 2.5,
    h = 2.5
  if (frame) {
    const inside = (lid: string) => ids.some((r) => r === lid || isDescendant(s.scene.layers, s.scene.layers.find((l) => l.id === lid)!, r))
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity
    for (const it of frame.items)
      for (const l of it.layers) {
        if (!s.scene.layers.some((n) => n.id === l.id) || !inside(l.id)) continue
        const b = layerBounds(l)
        x0 = Math.min(x0, b.x0)
        y0 = Math.min(y0, b.y0)
        x1 = Math.max(x1, b.x1)
        y1 = Math.max(y1, b.y1)
      }
    if (Number.isFinite(x0)) {
      w = Math.max(0.5, x1 - x0)
      h = Math.max(0.5, y1 - y0)
    }
  }
  const tiles = w <= 2.6 && h <= 2.6
  const cloner = tiles
    ? { ...defaultCloner, dx: Math.round(w * 4) / 4, dy: Math.round(h * 4) / 4 }
    : { ...defaultCloner, cols: 4, rows: 3, dx: Math.round((w + 0.5) * 4) / 4, dy: Math.round((h + 0.5) * 4) / 4 }
  const issue = addIssue(s.scene.layers, undefined, 0, 1) ?? depthIssue(s.scene.layers, ids)
  if (issue) return void toast.error(issue)
  const { scene, id } = groupNodes(s.scene, ids, "stack", { name: "Клонер", cloner })
  s.setScene(scene)
  if (id) s.select(id)
}

/**
 * Solo: shows only this node (with its ancestors and everything inside it);
 * when it is already alone, shows everything again.
 */
export function soloVisibility(id: string) {
  const s = st()
  const layers = s.scene.layers
  const n = layers.find((l) => l.id === id)
  if (!n) return
  const keep = new Set<string>([id, ...ancestors(layers, id).map((g) => g.id)])
  for (const l of layers) if (isDescendant(layers, l, id)) keep.add(l.id)
  const alone = layers.every((l) => keep.has(l.id) || !l.visible)
  s.updateLayers(layers.map((l) => ({ id: l.id, patch: { visible: alone ? true : keep.has(l.id) } })))
}

/** Collapses or expands a group and every group inside it (all groups when id is undefined). */
export function setCollapsedDeep(id: string | undefined, collapsed: boolean) {
  const s = st()
  const layers = s.scene.layers
  const targets = layers.filter((l) => isGroup(l) && (id === undefined || l.id === id || isDescendant(layers, l, id)))
  if (targets.length) s.updateLayersQuiet(targets.map((g) => ({ id: g.id, patch: { collapsed: collapsed || undefined } })))
}

/**
 * Moves freshly laid-out nodes (centred on the origin) to the centre of the
 * studio view.
 */
export function placeInView<T extends Layer>(nodes: T[]): T[] {
  const v = runtime.view
  if (!v || !nodes.length) return nodes
  return nodes.map((n) => ({ ...n, x: n.x + v.cx, y: n.y + v.cy }))
}

/** Fits the view to a world box when it is not entirely visible. */
export function reveal(box: { x0: number; y0: number; x1: number; y1: number }) {
  const v = runtime.view
  if (!v) return
  const inside = box.x0 >= v.cx - v.w / 2 && box.x1 <= v.cx + v.w / 2 && box.y0 >= v.cy - v.h / 2 && box.y1 <= v.cy + v.h / 2
  if (!inside) runtime.focus(box)
}
