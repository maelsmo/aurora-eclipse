// Loading a JSON recipe (the scene plus the glyph sets it uses) back into
// the app. Sets already in the library with the same content are reused; a
// set whose id is taken by different content comes in under a new id, and
// the scene's references follow it.
import { sanitizeScene, uid, type Scene } from "@/engine/scene"
import type { GlyphSet } from "@/engine/alphabet/sets"
import { sanitizeSet } from "./persist"

export type RecipeResult = { ok: true; scene: Scene; sets: GlyphSet[]; reused: number } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** Same glyph content and look (names and dates may differ). */
const sameContent = (a: GlyphSet, b: GlyphSet) =>
  a.kind === b.kind && a.base === b.base && JSON.stringify(a.glyphs) === JSON.stringify(b.glyphs) && JSON.stringify(a.look ?? {}) === JSON.stringify(b.look ?? {})

/**
 * Reads a recipe file's JSON. `current` are the library's sets; the result
 * lists only the sets to add (with fresh ids where needed).
 */
export function readRecipe(raw: unknown, current: GlyphSet[]): RecipeResult {
  if (!isObj(raw) || raw.format !== "aurora-eclipse/scene" || !isObj(raw.scene))
    return { ok: false, error: "Это не рецепт Aurora Eclipse. Нужен JSON, выгруженный через «Экспорт → JSON»." }
  const incoming = (Array.isArray(raw.sets) ? raw.sets : []).map(sanitizeSet).filter((s): s is GlyphSet => !!s)
  const add: GlyphSet[] = []
  const rename = new Map<string, string>()
  let reused = 0
  for (const s of incoming) {
    const have = current.find((c) => c.id === s.id)
    if (!have) add.push(s)
    else if (sameContent(have, s)) reused++
    else {
      const id = uid()
      rename.set(s.id, id)
      add.push({ ...s, id, name: (s.name + " (из рецепта)").slice(0, 64) })
    }
  }
  // The scene follows renamed sets before it is sanitized.
  const scene = structuredClone(raw.scene) as Record<string, unknown>
  if (typeof scene.set === "string" && rename.has(scene.set)) scene.set = rename.get(scene.set)
  if (Array.isArray(scene.layers))
    for (const l of scene.layers) if (isObj(l) && typeof l.set === "string" && rename.has(l.set)) l.set = rename.get(l.set)
  const ids = [...current, ...add].map((s) => s.id)
  const clean = sanitizeScene(scene, { sets: ids, fallbackSet: current[0]?.id ?? "main" })
  if (!clean) return { ok: false, error: "В рецепте нет читаемой сцены." }
  return { ok: true, scene: clean, sets: add, reused }
}
