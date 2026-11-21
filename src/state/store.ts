// Application state. The render loop reads it with getState() every frame,
// so canvases never re-render React for animation.
import { create } from "zustand"
import { charset, defaultAlphabet } from "@/engine/alphabet"
import { makeLibrary, type GlyphSet, type Library, type SetBase, type SetKind } from "@/engine/alphabet/sets"
import type { Alphabet, GlyphDef } from "@/engine/types"
import { uid, type Layer, type LookPatch, type Scene } from "@/engine/scene"
import { initialScene } from "@/engine/presets"
import { KEYS, writeJSON } from "@/engine/storage"
import type { MicState } from "@/engine/signals"
import { loadAll, type SavedScene } from "./persist"

export type Tab = "studio" | "constructor" | "collection"
export type { SavedScene }

type SceneUpdate = Scene | ((s: Scene) => Scene)
type GlyphSnapshot = { set: string; glyphs: Record<string, GlyphDef> }

type State = {
  tab: Tab
  scene: Scene
  past: Scene[]
  future: Scene[]
  lastKey: string
  lastTime: number
  /** Selected node ids; the last one is the primary selection. May hold stale ids: read through selectors. */
  selected: string[]
  /** Node whose name is being edited in the layer tree. */
  renaming: string | null

  sets: GlyphSet[]
  library: Library
  revision: number
  /** Set open in the constructor. */
  editingSet: string
  glyphPast: GlyphSnapshot[]
  glyphFuture: GlyphSnapshot[]
  editing: string

  playing: boolean
  showGrid: boolean
  snap: boolean
  pointerOn: boolean
  mic: MicState
  micGain: number
  storageError: boolean

  collection: SavedScene[]
}

export type SelectMode = "replace" | "toggle" | "add"

type Actions = {
  setTab: (t: Tab) => void
  /** `key` coalesces rapid edits of one control into a single undo step. */
  setScene: (u: SceneUpdate, key?: string) => void
  replaceScene: (s: Scene) => void
  updateLayer: (id: string, patch: Partial<Layer>, key?: string) => void
  updateLayers: (patches: { id: string; patch: Partial<Layer> }[], key?: string) => void
  select: (id: string | null, mode?: SelectMode) => void
  selectMany: (ids: string[]) => void
  undo: () => void
  redo: () => void

  setEditing: (c: string) => void
  setGlyph: (c: string, g: GlyphDef | undefined, key?: string) => void
  glyphUndo: () => void
  glyphRedo: () => void
  setEditingSet: (id: string) => void
  addSet: (name: string, opts?: { base?: SetBase; kind?: SetKind; from?: string; glyphs?: Record<string, GlyphDef> }) => string
  renameSet: (id: string, name: string) => void
  deleteSet: (id: string) => void
  setSetLook: (id: string, look: LookPatch | undefined) => void

  set: (p: Partial<State>) => void
  saveToCollection: (name: string, scene: Scene) => boolean
  removeFromCollection: (id: string) => void
  renameInCollection: (id: string, name: string) => void
}

const HISTORY = 120

const loaded = loadAll()
const ui = loaded.ui

export const useStore = create<State & Actions>()((set, get) => {
  const changeSets = (sets: GlyphSet[], extra: Partial<State> = {}) => {
    const revision = get().revision + 1
    set({ sets, library: makeLibrary(sets, revision, get().library), revision, ...extra })
  }
  const editing = () => get().sets.find((s) => s.id === get().editingSet) ?? get().sets[0]
  return {
    tab: ui.tab === "constructor" || ui.tab === "collection" ? ui.tab : "studio",
    scene: loaded.draft && loaded.draft.layers.length ? loaded.draft : { ...initialScene(), set: loaded.editingSet },
    past: [],
    future: [],
    lastKey: "",
    lastTime: 0,
    selected: [],
    renaming: null,

    sets: loaded.sets,
    library: makeLibrary(loaded.sets, 1),
    revision: 1,
    editingSet: loaded.editingSet,
    glyphPast: [],
    glyphFuture: [],
    editing: typeof ui.editing === "string" && [...ui.editing].length === 1 ? ui.editing : "A",

    playing: true,
    showGrid: false,
    snap: true,
    pointerOn: true,
    mic: "off",
    micGain: 1,
    storageError: false,

    collection: loaded.collection,

    setTab: (tab) => set({ tab }),

    setScene: (u, key) => {
      const { scene, past, lastKey, lastTime } = get()
      const next = typeof u === "function" ? u(scene) : u
      if (next === scene) return
      const now = performance.now()
      const merge = !!key && key === lastKey && now - lastTime < 900
      set({
        scene: next,
        past: merge ? past : [...past.slice(-HISTORY), scene],
        future: [],
        lastKey: key ?? "",
        lastTime: now,
      })
    },
    replaceScene: (s) => {
      get().setScene(s)
      const top = [...s.layers].reverse().find((l) => !l.parent)
      set({ selected: top ? [top.id] : [] })
    },
    updateLayer: (id, patch, key) => get().updateLayers([{ id, patch }], key),
    updateLayers: (patches, key) => {
      if (!patches.length) return
      const byId = new Map(patches.map((p) => [p.id, p.patch]))
      get().setScene(
        (s) => ({ ...s, layers: s.layers.map((l) => (byId.has(l.id) ? ({ ...l, ...byId.get(l.id) } as Layer) : l)) }),
        key,
      )
    },
    select: (id, mode = "replace") => {
      if (id === null) return set({ selected: [] })
      const cur = get().selected
      if (mode === "replace") set({ selected: [id] })
      else if (mode === "add") set({ selected: [...cur.filter((x) => x !== id), id] })
      else set({ selected: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
    },
    selectMany: (ids) => set({ selected: [...new Set(ids)] }),
    undo: () => {
      const { past, scene, future } = get()
      if (!past.length) return
      set({ scene: past.at(-1)!, past: past.slice(0, -1), future: [scene, ...future], lastKey: "" })
    },
    redo: () => {
      const { past, scene, future } = get()
      if (!future.length) return
      set({ scene: future[0], future: future.slice(1), past: [...past, scene], lastKey: "" })
    },

    setEditing: (editing) => set({ editing }),
    setGlyph: (c, g, key) => {
      const { glyphPast, lastKey, lastTime } = get()
      const v = editing()
      const glyphs = { ...v.glyphs }
      if (g) glyphs[c] = g
      else delete glyphs[c]
      const now = performance.now()
      const merge = !!key && key === lastKey && now - lastTime < 900
      changeSets(
        get().sets.map((x) => (x.id === v.id ? { ...x, glyphs, updated: Date.now() } : x)),
        {
          glyphPast: merge ? glyphPast : [...glyphPast.slice(-HISTORY), { set: v.id, glyphs: v.glyphs }],
          glyphFuture: [],
          lastKey: key ?? "",
          lastTime: now,
        },
      )
    },
    glyphUndo: () => {
      const { glyphPast, glyphFuture, sets } = get()
      const snap = glyphPast.at(-1)
      if (!snap) return
      const cur = sets.find((x) => x.id === snap.set)
      if (!cur) return set({ glyphPast: glyphPast.slice(0, -1) })
      changeSets(
        sets.map((x) => (x.id === snap.set ? { ...x, glyphs: snap.glyphs } : x)),
        { glyphPast: glyphPast.slice(0, -1), glyphFuture: [{ set: snap.set, glyphs: cur.glyphs }, ...glyphFuture], lastKey: "", editingSet: snap.set },
      )
    },
    glyphRedo: () => {
      const { glyphPast, glyphFuture, sets } = get()
      const snap = glyphFuture[0]
      if (!snap) return
      const cur = sets.find((x) => x.id === snap.set)
      if (!cur) return set({ glyphFuture: glyphFuture.slice(1) })
      changeSets(
        sets.map((x) => (x.id === snap.set ? { ...x, glyphs: snap.glyphs } : x)),
        { glyphPast: [...glyphPast, { set: snap.set, glyphs: cur.glyphs }], glyphFuture: glyphFuture.slice(1), lastKey: "", editingSet: snap.set },
      )
    },
    setEditingSet: (id) => {
      if (get().sets.some((s) => s.id === id)) set({ editingSet: id })
    },
    addSet: (name, opts = {}) => {
      const id = uid()
      const from = opts.from ? get().sets.find((s) => s.id === opts.from) : undefined
      const next: GlyphSet = from
        ? { ...from, id, name, glyphs: { ...from.glyphs }, updated: Date.now() }
        : { id, name, kind: opts.kind ?? "strokes", base: opts.base ?? "default", glyphs: { ...opts.glyphs }, updated: Date.now() }
      changeSets([...get().sets, next], { editingSet: id })
      return id
    },
    renameSet: (id, name) => set({ sets: get().sets.map((v) => (v.id === id ? { ...v, name } : v)) }),
    deleteSet: (id) => {
      const rest = get().sets.filter((v) => v.id !== id)
      if (!rest.length) return
      changeSets(rest, {
        editingSet: get().editingSet === id ? rest[0].id : get().editingSet,
        glyphPast: get().glyphPast.filter((g) => g.set !== id),
        glyphFuture: get().glyphFuture.filter((g) => g.set !== id),
      })
    },
    setSetLook: (id, look) =>
      changeSets(get().sets.map((v) => (v.id === id ? { ...v, look, updated: Date.now() } : v))),

    set: (p) => set(p),
    saveToCollection: (name, scene) => {
      const item: SavedScene = { id: uid(), name, scene, created: Date.now() }
      const next = [item, ...get().collection]
      if (!writeJSON(KEYS.collection, next)) {
        set({ storageError: true })
        return false
      }
      set({ collection: next })
      return true
    },
    removeFromCollection: (id) => {
      const next = get().collection.filter((s) => s.id !== id)
      writeJSON(KEYS.collection, next)
      set({ collection: next })
    },
    renameInCollection: (id, name) => {
      const next = get().collection.map((s) => (s.id === id ? { ...s, name } : s))
      writeJSON(KEYS.collection, next)
      set({ collection: next })
    },
  }
})

/* ---------- persistence (v3 keys only) ---------- */

let timer = 0
const persist = () => {
  const st = useStore.getState()
  const ok =
    writeJSON(KEYS.draft, st.scene) &&
    writeJSON(KEYS.sets, st.sets) &&
    writeJSON(KEYS.ui, { tab: st.tab, editing: st.editing, editingSet: st.editingSet })
  if (!ok && !st.storageError) useStore.setState({ storageError: true })
}
// A migrated collection is written to the v3 key at once (v2 keys stay untouched).
if (loaded.migrated) {
  writeJSON(KEYS.collection, loaded.collection)
  persist()
}
useStore.subscribe((s, prev) => {
  if (s.scene === prev.scene && s.sets === prev.sets && s.editingSet === prev.editingSet && s.tab === prev.tab && s.editing === prev.editing) return
  clearTimeout(timer)
  timer = window.setTimeout(persist, 250)
})

/* ---------- selectors ---------- */

type S = State & Actions

/** Selected ids that still exist, in selection order. */
export const selectedIds = (s: S) => s.selected.filter((id) => s.scene.layers.some((l) => l.id === id))
/** The primary selected node. */
export const selectedLayer = (s: S): Layer | null => {
  for (let i = s.selected.length - 1; i >= 0; i--) {
    const l = s.scene.layers.find((x) => x.id === s.selected[i])
    if (l) return l
  }
  return null
}
/** Alphabet of the set open in the constructor. */
export const editingAlphabet = (s: S): Alphabet => s.library.sets[s.editingSet]?.alphabet ?? defaultAlphabet
/** Alphabet of the scene's default set. */
export const sceneAlphabet = (s: S): Alphabet => s.library.sets[s.scene.set]?.alphabet ?? defaultAlphabet
export const editingSetOf = (s: S): GlyphSet => s.sets.find((x) => x.id === s.editingSet) ?? s.sets[0]

export { charset, defaultAlphabet }
