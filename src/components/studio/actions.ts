// Scene actions on the current selection, shared by the layer tree, its
// context menu, the canvas and keyboard shortcuts.
import { toast } from "sonner"
import {
  childrenOf,
  deleteNodes,
  duplicateNodes,
  groupNodes,
  isDescendant,
  isGroup,
  isLeaf,
  LIMITS,
  moveNode,
  ungroup,
  type GroupMode,
  type Layer,
  type Scene,
} from "@/engine/scene"
import { selectedIds, useStore } from "@/state/store"

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
  if (s.scene.layers.length + ids.length > LIMITS.nodes) {
    toast.error(`В сцене не больше ${LIMITS.nodes} объектов.`)
    return
  }
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
