// Tree operations on the flat pre-order array. Invariant: every subtree is
// contiguous and follows its group, so z-order equals the array order.
// All structural edits go through here and end with normalize().
import { isGroup, isLeaf, LIMITS, uid, type GroupMode, type GroupNode, type Layer, type Route, type Scene, makeGroup } from "./types"

/* ---------- similarity transforms (rotation, uniform scale, optional mirror) ---------- */

/** p ↦ t + s · R(θ) · diag(m, 1) · p */
export type Xf = { x: number; y: number; cos: number; sin: number; s: number; m: 1 | -1 }

export const identity: Xf = { x: 0, y: 0, cos: 1, sin: 0, s: 1, m: 1 }

export function xfApply(a: Xf, px: number, py: number): [number, number] {
  const qx = a.m * px * a.s,
    qy = py * a.s
  return [a.x + a.cos * qx - a.sin * qy, a.y + a.sin * qx + a.cos * qy]
}

/** a ∘ b: first b, then a. */
export function xfCompose(a: Xf, b: Xf): Xf {
  const [x, y] = xfApply(a, b.x, b.y)
  const sb = a.m * b.sin
  return {
    x,
    y,
    cos: a.cos * b.cos - a.sin * sb,
    sin: a.sin * b.cos + a.cos * sb,
    s: a.s * b.s,
    m: (a.m * b.m) as 1 | -1,
  }
}

export function xfInvert(a: Xf): Xf {
  const s = 1 / Math.max(a.s, 1e-9)
  // Inverse linear part: diag(m,1) · R(−θ) / s = R(−m·θ) · diag(m,1) / s.
  const inv: Xf = { x: 0, y: 0, cos: a.cos, sin: -a.m * a.sin, s, m: a.m }
  const [x, y] = xfApply(inv, a.x, a.y)
  return { ...inv, x: -x, y: -y }
}

export function xfAngle(a: Xf) {
  return (Math.atan2(a.sin, a.cos) * 180) / Math.PI
}

/** Local transform of a node (its anchor is its own origin). */
export function nodeXf(n: Pick<Layer, "x" | "y" | "scale" | "rotation" | "flipX" | "flipY">): Xf {
  const flipY = !!n.flipY,
    flipX = !!n.flipX
  // diag(1, −1) = R(180°) · diag(−1, 1): a vertical flip is a mirror plus a half turn.
  const a = ((n.rotation + (flipY ? 180 : 0)) * Math.PI) / 180
  return {
    x: n.x,
    y: n.y,
    cos: Math.cos(a),
    sin: Math.sin(a),
    s: Math.max(n.scale, 0.01),
    m: flipX !== flipY ? -1 : 1,
  }
}

/** Writes a transform back into node fields (flips are folded into flipX + rotation). */
export function xfToFields(a: Xf): Pick<Layer, "x" | "y" | "scale" | "rotation" | "flipX" | "flipY"> {
  return { x: a.x, y: a.y, scale: a.s, rotation: round6(xfAngle(a)), flipX: a.m < 0 ? true : undefined, flipY: undefined }
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

/* ---------- queries ---------- */

export function indexOf(layers: Layer[], id: string) {
  return layers.findIndex((l) => l.id === id)
}

/** Index just past the subtree starting at `i`. */
export function subtreeEnd(layers: Layer[], i: number) {
  const root = layers[i]
  if (!root || !isGroup(root)) return i + 1
  let j = i + 1
  while (j < layers.length && isDescendant(layers, layers[j], root.id)) j++
  return j
}

export function isDescendant(layers: Layer[], node: Layer, ancestorId: string) {
  let p = node.parent
  let guard = 0
  while (p && guard++ < 64) {
    if (p === ancestorId) return true
    p = layers.find((l) => l.id === p)?.parent
  }
  return false
}

export function childrenOf(layers: Layer[], parent: string | undefined) {
  return layers.filter((l) => l.parent === parent)
}

export function ancestors(layers: Layer[], id: string): GroupNode[] {
  const out: GroupNode[] = []
  const byId = new Map(layers.map((l) => [l.id, l]))
  let p = byId.get(id)?.parent
  while (p && out.length < 64) {
    const g = byId.get(p)
    if (!g || !isGroup(g)) break
    out.push(g)
    p = g.parent
  }
  return out
}

/** World transform of a node's parent space. */
export function parentXf(layers: Layer[], id: string): Xf {
  let x = identity
  for (const g of ancestors(layers, id).reverse()) x = xfCompose(x, nodeXf(g))
  return x
}

export function worldXf(layers: Layer[], id: string): Xf {
  const n = layers.find((l) => l.id === id)
  return n ? xfCompose(parentXf(layers, id), nodeXf(n)) : identity
}

/** The merge group a node sits in, if any. */
export function mergeParent(layers: Layer[], id: string): GroupNode | null {
  const n = layers.find((l) => l.id === id)
  const p = n?.parent ? layers.find((l) => l.id === n.parent) : undefined
  return isGroup(p) && p.mode === "merge" ? p : null
}

/* ---------- normalisation ---------- */

/**
 * Repairs any array into a valid tree: dangling parents and cycles go to the
 * root, non-groups cannot be parents, merge groups hold leaves only (at most
 * 32), depth ≤ 6, ≤ 256 nodes; then the array is reordered so that every
 * subtree is contiguous (children keep their relative order).
 */
export function normalize(input: Layer[]): Layer[] {
  const seen = new Set<string>()
  let layers = input
    .filter((l) => {
      if (seen.has(l.id)) return false
      seen.add(l.id)
      return true
    })
    .slice(0, LIMITS.nodes)
    .map((l) => ({ ...l }))
  const byId = new Map(layers.map((l) => [l.id, l]))
  for (const l of layers) {
    const p = l.parent ? byId.get(l.parent) : undefined
    if (l.parent !== undefined && (!p || !isGroup(p) || p.id === l.id)) delete l.parent
  }
  // Cycles.
  for (const l of layers) {
    const chain: string[] = []
    let p = l.parent
    while (p) {
      if (p === l.id || chain.includes(p)) {
        delete l.parent
        break
      }
      chain.push(p)
      p = byId.get(p)?.parent
    }
  }
  // The valid tree as given: nodes moved below keep their world placement in it.
  const before = layers.map((l) => ({ ...l }))
  const parentBefore = new Map(layers.map((l) => [l.id, l.parent]))
  // Depth.
  for (const l of layers) {
    const chain: string[] = []
    let p = l.parent
    while (p) {
      chain.push(p)
      p = byId.get(p)?.parent
    }
    if (chain.length > LIMITS.depth) l.parent = chain[chain.length - LIMITS.depth]
  }
  // Merge groups hold leaves only: nested groups move up to the merge group's parent.
  for (const l of layers) {
    const p = l.parent ? byId.get(l.parent) : undefined
    if (isGroup(p) && p.mode === "merge" && !isLeaf(l)) {
      if (p.parent) l.parent = p.parent
      else delete l.parent
    }
  }
  // A node moved to an ancestor keeps where it is drawn (its transform becomes local to the new parent).
  for (const l of layers) {
    if (l.parent === parentBefore.get(l.id)) continue
    const world = worldXf(before, l.id)
    const host = l.parent ? worldXf(before, l.parent) : identity
    Object.assign(l, xfToFields(xfCompose(xfInvert(host), world)))
  }
  // Pre-order rebuild: children in their original relative order.
  const kids = new Map<string | undefined, Layer[]>()
  for (const l of layers) {
    const k = kids.get(l.parent) ?? []
    k.push(l)
    kids.set(l.parent, k)
  }
  const out: Layer[] = []
  const walk = (parent: string | undefined, depth: number) => {
    let list = kids.get(parent) ?? []
    const pg = parent ? byId.get(parent) : undefined
    if (isGroup(pg) && pg.mode === "merge") list = list.slice(0, LIMITS.mergeChildren)
    for (const l of list) {
      out.push(l)
      if (isGroup(l) && depth < LIMITS.depth + 1) walk(l.id, depth + 1)
    }
  }
  walk(undefined, 0)
  layers = out
  return layers
}

/* ---------- limits ---------- */

/** Nodes in a subtree (the node itself included). */
export function subtreeSize(layers: Layer[], id: string) {
  const i = indexOf(layers, id)
  return i < 0 ? 0 : subtreeEnd(layers, i) - i
}

/**
 * Why adding `total` nodes, `leaves` of them straight into `parent`, would
 * break the scene limits — or null when it fits. Edits check this before
 * changing anything, so normalize() never has to drop objects.
 */
export function addIssue(layers: Layer[], parent: string | undefined, leaves: number, total: number): string | null {
  if (layers.length + total > LIMITS.nodes) return `В сцене не больше ${LIMITS.nodes} объектов: сейчас ${layers.length}, добавляется ${total}.`
  const host = parent ? layers.find((l) => l.id === parent) : undefined
  if (isGroup(host) && host.mode === "merge") {
    const n = layers.filter((l) => l.parent === host.id).length
    if (n + leaves > LIMITS.mergeChildren) return `В сплаве не больше ${LIMITS.mergeChildren} объектов: в «${host.name ?? "Сплав"}» уже ${n}.`
  }
  return null
}

/** Levels below a node (0 for a leaf or an empty group). */
function heightBelow(layers: Layer[], id: string): number {
  let h = 0
  for (const l of layers) if (l.parent === id) h = Math.max(h, 1 + heightBelow(layers, l.id))
  return h
}

/**
 * Why putting the subtrees `ids` under `parent` (or, with `parent` omitted,
 * wrapping them into one new group where they are) would nest deeper than
 * LIMITS.depth — or null when it fits.
 */
export function depthIssue(layers: Layer[], ids: string[], parent?: string | null): string | null {
  for (const id of ids) {
    const above = parent === undefined ? ancestors(layers, id).length + 1 : parent === null ? 0 : ancestors(layers, parent).length + 1
    if (above + heightBelow(layers, id) > LIMITS.depth) return `Вложенность групп не больше ${LIMITS.depth} уровней.`
  }
  return null
}

/* ---------- edits (pure: scene in, scene out) ---------- */

/** Drops groups that had children before an edit and have none after it. */
function pruneEmptied(before: Layer[], after: Layer[]): Layer[] {
  const had = new Set(before.filter((l) => l.parent).map((l) => l.parent!))
  const has = new Set(after.filter((l) => l.parent).map((l) => l.parent!))
  const drop = new Set([...had].filter((id) => !has.has(id)))
  return drop.size ? after.filter((l) => !drop.has(l.id)) : after
}

const targetId = (target: string) => {
  const m = target.match(/^layer:([^.]+)\./)
  return m ? m[1] : null
}

/** Removes nodes with their subtrees and every route that points into them. */
export function deleteNodes(scene: Scene, ids: string[]): Scene {
  const drop = new Set<string>()
  for (const id of ids) {
    const i = indexOf(scene.layers, id)
    if (i < 0) continue
    for (let j = i; j < subtreeEnd(scene.layers, i); j++) drop.add(scene.layers[j].id)
  }
  if (!drop.size) return scene
  return {
    ...scene,
    layers: normalize(scene.layers.filter((l) => !drop.has(l.id))),
    routes: scene.routes.filter((r) => {
      const id = targetId(r.target)
      return !id || !drop.has(id)
    }),
  }
}

/** Copies routes of the old ids onto new ids (duplicates, variations). */
export function remapRoutes(routes: Route[], idMap: Map<string, string>, keepOld = true): Route[] {
  const out: Route[] = []
  for (const r of routes) {
    const id = targetId(r.target)
    if (id && idMap.has(id)) {
      const moved = { ...r, id: uid(), target: r.target.replace(`layer:${id}.`, `layer:${idMap.get(id)}.`) }
      if (keepOld) out.push(r, moved)
      else out.push({ ...moved, id: r.id })
    } else out.push(r)
  }
  return out
}

/** Duplicates nodes (with subtrees and their routes), placed right above each original. */
export function duplicateNodes(scene: Scene, ids: string[], offset: [number, number] = [1, -1]): { scene: Scene; ids: string[] } {
  let layers = [...scene.layers]
  const idMap = new Map<string, string>()
  const top: string[] = []
  // Skip ids whose ancestor is also duplicated.
  const roots = ids.filter((id) => !ids.some((o) => o !== id && layers.find((l) => l.id === id) && isDescendant(layers, layers.find((l) => l.id === id)!, o)))
  for (const id of roots) {
    const i = indexOf(layers, id)
    if (i < 0) continue
    const end = subtreeEnd(layers, i)
    const copy = layers.slice(i, end).map((l) => {
      const nid = uid()
      idMap.set(l.id, nid)
      return { ...l, id: nid }
    })
    for (const c of copy) if (c.parent && idMap.has(c.parent) && c !== copy[0]) c.parent = idMap.get(c.parent)
    copy[0] = { ...copy[0], x: copy[0].x + offset[0], y: copy[0].y + offset[1] }
    if (copy[0].motion.target && idMap.has(copy[0].motion.target)) copy[0].motion = { ...copy[0].motion, target: idMap.get(copy[0].motion.target) }
    layers.splice(end, 0, ...copy)
    top.push(copy[0].id)
  }
  layers = normalize(layers)
  return { scene: { ...scene, layers, routes: remapRoutes(scene.routes, idMap) }, ids: top }
}

/**
 * Wraps nodes into a new group placed where the topmost of them was.
 * The group origin is the centre of their positions; children keep their
 * world placement (their transforms become local to the group).
 */
export function groupNodes(scene: Scene, ids: string[], mode: GroupMode, over: Partial<GroupNode> = {}): { scene: Scene; id: string | null } {
  const layers = scene.layers
  const picked = layers.filter((l) => ids.includes(l.id) && !ids.some((o) => o !== l.id && isDescendant(layers, l, o)))
  if (!picked.length) return { scene, id: null }
  // The new group lives in the parent of the first picked node.
  const parent = picked[0].parent
  const pX = parentXf(layers, picked[0].id)
  const pInv = xfInvert(pX)
  const worlds = picked.map((n) => worldXf(layers, n.id))
  const cx = worlds.reduce((a, w) => a + w.x, 0) / worlds.length,
    cy = worlds.reduce((a, w) => a + w.y, 0) / worlds.length
  const [lx, ly] = xfApply(pInv, cx, cy)
  const g = makeGroup(mode, { name: mode === "merge" ? "Сплав" : "Группа", ...over, parent, x: lx, y: ly })
  const gWorld = xfCompose(pX, nodeXf(g))
  const gInv = xfInvert(gWorld)
  const moved = new Map<string, Layer>()
  picked.forEach((n, k) => {
    const local = xfCompose(gInv, worlds[k])
    moved.set(n.id, { ...n, ...xfToFields(local), parent: g.id })
  })
  // The group takes the z-position of the topmost picked node; picked subtrees move inside.
  const inPicked = new Set<string>()
  for (const n of picked) {
    const i = indexOf(layers, n.id)
    for (let j = i; j < subtreeEnd(layers, i); j++) inPicked.add(layers[j].id)
  }
  const lastIndex = Math.max(...picked.map((n) => indexOf(layers, n.id)))
  const rest = layers.filter((l) => !inPicked.has(l.id))
  const at = layers.slice(0, lastIndex).filter((l) => !inPicked.has(l.id)).length
  const inner = layers.filter((l) => inPicked.has(l.id)).map((l) => moved.get(l.id) ?? l)
  const next = [...rest.slice(0, at), g, ...inner, ...rest.slice(at)]
  return { scene: { ...scene, layers: pruneEmptied(layers, normalize(next)) }, id: g.id }
}

/**
 * Adds laid-out letters as merge groups, one per chunk of letter indices
 * (see chunkByWords); several chunks are wrapped into one stack group so
 * the text moves as a whole. Returns the top node id.
 */
export function groupText(scene: Scene, letters: Layer[], chunks: (number[] & { label?: string })[], name: string): { scene: Scene; id: string | null } {
  const firsts = new Set(chunks.map((c) => c[0]))
  let s: Scene = { ...scene, layers: [...scene.layers, ...letters.map((l, i) => (firsts.has(i) ? { ...l, op: "union" as const } : l))] }
  const merges: string[] = []
  for (const c of chunks) {
    const label = c.label ?? c.map((i) => (letters[i].type === "letter" ? letters[i].char : "")).join("")
    const r = groupNodes(s, c.map((i) => letters[i].id), "merge", { name: chunks.length === 1 ? name : label })
    s = r.scene
    if (r.id) merges.push(r.id)
  }
  if (merges.length <= 1) return { scene: s, id: merges[0] ?? null }
  return groupNodes(s, merges, "stack", { name })
}

/** Dissolves a group: its children move to the group's parent and keep their world placement. */
export function ungroup(scene: Scene, id: string): Scene {
  const layers = scene.layers
  const g = layers.find((l) => l.id === id)
  if (!isGroup(g)) return scene
  const gx = nodeXf(g)
  const next = layers
    .filter((l) => l.id !== id)
    .map((l) => {
      if (l.parent !== id) return l
      const out = { ...l, ...xfToFields(xfCompose(gx, nodeXf(l))), parent: g.parent }
      if (out.parent === undefined) delete out.parent
      return out
    })
  return {
    ...scene,
    layers: normalize(next),
    routes: scene.routes.filter((r) => targetId(r.target) !== id),
  }
}

/** Moves a node (with its subtree) into `parent` at sibling position `index`, keeping its world placement. */
export function moveNode(scene: Scene, id: string, parent: string | undefined, index: number): Scene {
  const layers = scene.layers
  const i = indexOf(layers, id)
  if (i < 0) return scene
  if (parent && (parent === id || isDescendant(layers, layers.find((l) => l.id === parent)!, id))) return scene
  const pg = parent ? layers.find((l) => l.id === parent) : undefined
  if (parent && !isGroup(pg)) return scene
  const node = layers[i]
  if (isGroup(pg) && pg.mode === "merge" && !isLeaf(node)) return scene
  const world = worldXf(layers, id)
  const newParentXf = parent ? worldXf(layers, parent) : identity
  const local = xfCompose(xfInvert(newParentXf), world)
  const sub = layers.slice(i, subtreeEnd(layers, i))
  const moved = { ...sub[0], ...xfToFields(local), parent }
  if (moved.parent === undefined) delete moved.parent
  const rest = [...layers.slice(0, i), ...layers.slice(subtreeEnd(layers, i))]
  // Find the array position of the index-th sibling in the new parent.
  const siblings = rest.filter((l) => l.parent === parent)
  let at: number
  if (index >= siblings.length) {
    if (siblings.length) {
      const last = indexOf(rest, siblings[siblings.length - 1].id)
      at = subtreeEnd(rest, last)
    } else at = parent ? indexOf(rest, parent) + 1 : rest.length
  } else at = indexOf(rest, siblings[Math.max(0, index)].id)
  const next = [...rest.slice(0, at), moved, ...sub.slice(1), ...rest.slice(at)]
  return { ...scene, layers: pruneEmptied(layers, normalize(next)) }
}

/** Swaps a node with its neighbour sibling (dir +1 = up in z-order). */
export function shiftNode(scene: Scene, id: string, dir: 1 | -1): Scene {
  const n = scene.layers.find((l) => l.id === id)
  if (!n) return scene
  const sibs = childrenOf(scene.layers, n.parent)
  const k = sibs.findIndex((s) => s.id === id)
  const j = k + dir
  if (j < 0 || j >= sibs.length) return scene
  return moveNode(scene, id, n.parent, j)
}
