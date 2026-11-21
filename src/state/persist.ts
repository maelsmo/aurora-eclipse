// Loading of stored data. v3 keys win; without them the v2 keys are read once
// and migrated (they are never written, so the v2 app keeps its data).
import { KEYS, KEYS_V2, readJSON } from "@/engine/storage"
import { mainSet, type GlyphSet, type SetBase, type SetKind } from "@/engine/alphabet/sets"
import { sanitizeLookPatch, sanitizeScene, type Scene } from "@/engine/scene"
import type { GlyphDef } from "@/engine/types"

export type SavedScene = { id: string; name: string; scene: Scene; created: number }
export type StoredUi = { tab?: string; editing?: string; editingSet?: string }

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v)

function sanitizeGlyphs(raw: unknown): Record<string, GlyphDef> {
  const out: Record<string, GlyphDef> = {}
  if (!isObj(raw)) return out
  for (const [c, g] of Object.entries(raw)) {
    if ([...c].length !== 1 || !isObj(g) || !Array.isArray(g.prims)) continue
    const def: GlyphDef = { prims: g.prims.filter((p) => isObj(p) && typeof p.kind === "string") as GlyphDef["prims"] }
    if (typeof g.adv === "number" && Number.isFinite(g.adv)) def.adv = g.adv
    if (typeof g.base === "string") def.base = g.base
    out[c] = def
  }
  return out
}

export function sanitizeSet(raw: unknown): GlyphSet | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || typeof raw.name !== "string") return null
  const kind: SetKind = raw.kind === "shapes" ? "shapes" : "strokes"
  const base: SetBase = raw.base === "geo" || raw.base === "empty" ? raw.base : "default"
  const set: GlyphSet = { id: raw.id.slice(0, 64), name: raw.name.slice(0, 64) || "Сет", kind, base, glyphs: sanitizeGlyphs(raw.glyphs), updated: Number(raw.updated) || Date.now() }
  const look = sanitizeLookPatch(raw.look)
  if (Object.keys(look).length) set.look = look
  return set
}

/** Built-in sets every library starts with (the geometric set registers itself here). */
export const builtInSets: (() => GlyphSet)[] = [mainSet]

function withBuiltIns(sets: GlyphSet[]): GlyphSet[] {
  const out = [...sets]
  for (const make of builtInSets) {
    const s = make()
    if (!out.some((x) => x.id === s.id)) out.push(s)
  }
  return out
}

export type Loaded = {
  sets: GlyphSet[]
  editingSet: string
  draft: Scene | null
  collection: SavedScene[]
  ui: StoredUi
  migrated: boolean
}

export function loadAll(): Loaded {
  const v3sets = readJSON<unknown[]>(KEYS.sets)
  if (Array.isArray(v3sets)) {
    const sets = withBuiltIns(v3sets.map(sanitizeSet).filter((s): s is GlyphSet => !!s))
    const ids = sets.map((s) => s.id)
    const ui = (readJSON<StoredUi>(KEYS.ui) ?? {}) as StoredUi
    const editingSet = ui.editingSet && ids.includes(ui.editingSet) ? ui.editingSet : ids[0]
    const ctx = { sets: ids, fallbackSet: editingSet }
    const coll = readJSON<unknown[]>(KEYS.collection)
    return {
      sets,
      editingSet,
      draft: sanitizeScene(readJSON(KEYS.draft), ctx),
      collection: Array.isArray(coll) ? coll.flatMap((it) => loadSaved(it, ids, editingSet)) : [],
      ui,
      migrated: false,
    }
  }
  // First start of v3: migrate the v2 data (if any).
  const v2 = readJSON<unknown[]>(KEYS_V2.alphabets)
  const old = Array.isArray(v2)
    ? v2.flatMap((v) => {
        const s = sanitizeSet(isObj(v) ? { ...v, kind: "strokes", base: "default" } : null)
        return s ? [s] : []
      })
    : []
  const sets = withBuiltIns(old.length ? old : [])
  const ids = sets.map((s) => s.id)
  const current = readJSON<string>(KEYS_V2.currentAlphabet)
  const editingSet = current && ids.includes(current) ? current : ids[0]
  const ui2 = (readJSON<StoredUi>(KEYS_V2.ui) ?? {}) as StoredUi
  const coll = readJSON<unknown[]>(KEYS_V2.collection)
  return {
    sets,
    editingSet,
    draft: sanitizeScene(readJSON(KEYS_V2.draft), { sets: ids, fallbackSet: editingSet }),
    collection: Array.isArray(coll) ? coll.flatMap((it) => loadSaved(it, ids, editingSet)) : [],
    ui: { tab: ui2.tab, editing: ui2.editing, editingSet },
    migrated: Array.isArray(v2) || Array.isArray(coll),
  }
}

function loadSaved(raw: unknown, ids: string[], fallback: string): SavedScene[] {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return []
  // v2 items name their alphabet next to the scene; it becomes the scene set.
  const alphabetId = typeof raw.alphabetId === "string" && ids.includes(raw.alphabetId) ? raw.alphabetId : fallback
  const scene = sanitizeScene(raw.scene, { sets: ids, fallbackSet: alphabetId })
  return scene ? [{ id: raw.id, name: raw.name, scene, created: Number(raw.created) || Date.now() }] : []
}
