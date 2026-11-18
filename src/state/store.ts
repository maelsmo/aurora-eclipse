// Application state. The render loop reads it with getState() every frame,
// so canvases never re-render React for animation.
import { create } from "zustand"
import {
  buildAlphabet,
  charset,
  defaultAlphabet,
  type AlphabetVersion,
} from "@/engine/alphabet"
import type { Alphabet, GlyphDef } from "@/engine/types"
import { sanitizeScene, uid, type Layer, type Scene } from "@/engine/scene"
import { initialScene } from "@/engine/presets"
import { KEYS, readJSON, writeJSON } from "@/engine/storage"
import { clearCompileCache } from "@/engine/compile"
import type { MicState } from "@/engine/signals"

export type Tab = "studio" | "constructor" | "collection"
export type SavedScene = {
  id: string
  name: string
  scene: Scene
  alphabetId: string
  created: number
}

type SceneUpdate = Scene | ((s: Scene) => Scene)

type State = {
  tab: Tab
  scene: Scene
  past: Scene[]
  future: Scene[]
  lastKey: string
  lastTime: number
  selected: string | null

  versions: AlphabetVersion[]
  alphabetId: string
  alphabet: Alphabet
  revision: number
  glyphPast: Record<string, GlyphDef>[]
  glyphFuture: Record<string, GlyphDef>[]
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

type Actions = {
  setTab: (t: Tab) => void
  /** `key` coalesces rapid edits of one control into a single undo step. */
  setScene: (u: SceneUpdate, key?: string) => void
  replaceScene: (s: Scene) => void
  updateLayer: (id: string, patch: Partial<Layer>, key?: string) => void
  select: (id: string | null) => void
  undo: () => void
  redo: () => void

  setEditing: (c: string) => void
  setGlyph: (c: string, g: GlyphDef | undefined, key?: string) => void
  glyphUndo: () => void
  glyphRedo: () => void
  setAlphabetVersion: (id: string) => void
  addVersion: (name: string, from?: Record<string, GlyphDef>) => string
  renameVersion: (id: string, name: string) => void
  deleteVersion: (id: string) => void

  set: (p: Partial<State>) => void
  saveToCollection: (name: string, scene: Scene) => boolean
  removeFromCollection: (id: string) => void
  renameInCollection: (id: string, name: string) => void
}

const HISTORY = 120

function loadVersions(): AlphabetVersion[] {
  const raw = readJSON<AlphabetVersion[]>(KEYS.alphabets)
  const ok = Array.isArray(raw)
    ? raw.filter(
        (v) =>
          v && typeof v.id === "string" && typeof v.name === "string" && v.glyphs && typeof v.glyphs === "object",
      )
    : []
  return ok.length ? ok : [{ id: "main", name: "Основной", glyphs: {}, updated: Date.now() }]
}

function loadCollection(alphabet: Alphabet): SavedScene[] {
  const raw = readJSON<SavedScene[]>(KEYS.collection)
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s) => {
    if (!s || typeof s.id !== "string" || typeof s.name !== "string") return []
    const scene = sanitizeScene(s.scene, alphabet)
    return scene
      ? [{ id: s.id, name: s.name, scene, alphabetId: String(s.alphabetId ?? "main"), created: Number(s.created) || Date.now() }]
      : []
  })
}

const versions = loadVersions()
const storedId = readJSON<string>(KEYS.currentAlphabet)
const alphabetId = versions.some((v) => v.id === storedId) ? storedId! : versions[0].id
const alphabet = buildAlphabet(versions.find((v) => v.id === alphabetId)!.glyphs)
const draft = sanitizeScene(readJSON(KEYS.draft), alphabet)
const ui = readJSON<Partial<State>>(KEYS.ui) ?? {}

export const useStore = create<State & Actions>()((set, get) => ({
  tab: ui.tab === "constructor" || ui.tab === "collection" ? ui.tab : "studio",
  scene: draft && draft.layers.length ? draft : initialScene(),
  past: [],
  future: [],
  lastKey: "",
  lastTime: 0,
  selected: null,

  versions,
  alphabetId,
  alphabet,
  revision: 1,
  glyphPast: [],
  glyphFuture: [],
  editing: typeof ui.editing === "string" && ui.editing in alphabet ? ui.editing : "A",

  playing: true,
  showGrid: false,
  snap: true,
  pointerOn: true,
  mic: "off",
  micGain: 1,
  storageError: false,

  collection: loadCollection(alphabet),

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
    set({ selected: s.layers.at(-1)?.id ?? null })
  },
  updateLayer: (id, patch, key) =>
    get().setScene(
      (s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
      key,
    ),
  select: (selected) => set({ selected }),
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
    const { versions, alphabetId, glyphPast, lastKey, lastTime } = get()
    const v = versions.find((x) => x.id === alphabetId)!
    const glyphs = { ...v.glyphs }
    if (g) glyphs[c] = g
    else delete glyphs[c]
    const now = performance.now()
    const merge = !!key && key === lastKey && now - lastTime < 900
    const nextVersions = versions.map((x) => (x.id === alphabetId ? { ...x, glyphs, updated: Date.now() } : x))
    clearCompileCache()
    set({
      versions: nextVersions,
      alphabet: buildAlphabet(glyphs),
      revision: get().revision + 1,
      glyphPast: merge ? glyphPast : [...glyphPast.slice(-HISTORY), v.glyphs],
      glyphFuture: [],
      lastKey: key ?? "",
      lastTime: now,
    })
  },
  glyphUndo: () => {
    const { glyphPast, glyphFuture, versions, alphabetId } = get()
    if (!glyphPast.length) return
    const v = versions.find((x) => x.id === alphabetId)!
    const glyphs = glyphPast.at(-1)!
    clearCompileCache()
    set({
      versions: versions.map((x) => (x.id === alphabetId ? { ...x, glyphs } : x)),
      alphabet: buildAlphabet(glyphs),
      revision: get().revision + 1,
      glyphPast: glyphPast.slice(0, -1),
      glyphFuture: [v.glyphs, ...glyphFuture],
      lastKey: "",
    })
  },
  glyphRedo: () => {
    const { glyphPast, glyphFuture, versions, alphabetId } = get()
    if (!glyphFuture.length) return
    const v = versions.find((x) => x.id === alphabetId)!
    const glyphs = glyphFuture[0]
    clearCompileCache()
    set({
      versions: versions.map((x) => (x.id === alphabetId ? { ...x, glyphs } : x)),
      alphabet: buildAlphabet(glyphs),
      revision: get().revision + 1,
      glyphPast: [...glyphPast, v.glyphs],
      glyphFuture: glyphFuture.slice(1),
      lastKey: "",
    })
  },
  setAlphabetVersion: (id) => {
    const v = get().versions.find((x) => x.id === id)
    if (!v) return
    clearCompileCache()
    set({
      alphabetId: id,
      alphabet: buildAlphabet(v.glyphs),
      revision: get().revision + 1,
      glyphPast: [],
      glyphFuture: [],
    })
  },
  addVersion: (name, from) => {
    const id = uid()
    const glyphs = from ?? get().versions.find((x) => x.id === get().alphabetId)!.glyphs
    set({ versions: [...get().versions, { id, name, glyphs: { ...glyphs }, updated: Date.now() }] })
    get().setAlphabetVersion(id)
    return id
  },
  renameVersion: (id, name) =>
    set({ versions: get().versions.map((v) => (v.id === id ? { ...v, name } : v)) }),
  deleteVersion: (id) => {
    const rest = get().versions.filter((v) => v.id !== id)
    if (!rest.length) return
    set({ versions: rest })
    if (get().alphabetId === id) get().setAlphabetVersion(rest[0].id)
  },

  set: (p) => set(p),
  saveToCollection: (name, scene) => {
    const item: SavedScene = { id: uid(), name, scene, alphabetId: get().alphabetId, created: Date.now() }
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
}))

/* ---------- persistence ---------- */

let timer = 0
useStore.subscribe((s, prev) => {
  if (s.scene === prev.scene && s.versions === prev.versions && s.alphabetId === prev.alphabetId && s.tab === prev.tab && s.editing === prev.editing) return
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    const st = useStore.getState()
    const ok =
      writeJSON(KEYS.draft, st.scene) &&
      writeJSON(KEYS.alphabets, st.versions) &&
      writeJSON(KEYS.currentAlphabet, st.alphabetId) &&
      writeJSON(KEYS.ui, { tab: st.tab, editing: st.editing })
    if (!ok && !st.storageError) useStore.setState({ storageError: true })
  }, 250)
})

export const selectedLayer = (s: State) => s.scene.layers.find((l) => l.id === s.selected) ?? null
export { charset, defaultAlphabet }
