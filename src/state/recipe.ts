// Loading a JSON recipe (the scene plus the glyph sets it uses) back into
// the app. Sets already in the library with the same content are reused; a
// set whose id is taken by different content comes in under a new id, and
// the scene's references follow it.
import { sanitizeScene, uid, type Scene } from "@/engine/scene"
import type { GlyphSet } from "@/engine/alphabet/sets"
import { sanitizeGlyphs, sanitizeSet } from "./persist"

export type RecipeResult = { ok: true; scene: Scene; sets: GlyphSet[]; reused: number } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** Canonical JSON: object keys sorted, so key order never makes two equal sets differ. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]"
  if (isObj(v))
    return (
      "{" +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canon(v[k]))
        .join(",") +
      "}"
    )
  return JSON.stringify(v)
}

/** Same glyph content and look (names and dates may differ); both sides go through the sanitizer. */
const sameContent = (a: GlyphSet, b: GlyphSet) => {
  const x = sanitizeSet(a),
    y = sanitizeSet(b)
  return !!x && !!y && x.kind === y.kind && x.base === y.base && canon(x.glyphs) === canon(y.glyphs) && canon(x.look ?? {}) === canon(y.look ?? {})
}

/**
 * Reads a recipe file's JSON. `current` are the library's sets; the result
 * lists only the sets to add (with fresh ids where needed).
 */
export function readRecipe(raw: unknown, current: GlyphSet[]): RecipeResult {
  if (!isObj(raw) || raw.format !== "aurora-eclipse/scene" || !isObj(raw.scene))
    return { ok: false, error: "Это не рецепт Aurora Eclipse. Нужен JSON, выгруженный через «Экспорт → JSON»." }
  const incoming = (Array.isArray(raw.sets) ? raw.sets : []).map(sanitizeSet).filter((s): s is GlyphSet => !!s)
  // A v2 recipe carries one alphabet (edited glyphs of the stroke set) instead of sets.
  let fallback: string | undefined
  if (!incoming.length && isObj(raw.alphabet)) {
    const glyphs = sanitizeGlyphs(raw.alphabet.glyphs)
    if (Object.keys(glyphs).length) {
      const name = typeof raw.alphabet.name === "string" && raw.alphabet.name ? raw.alphabet.name : "Алфавит из рецепта"
      const v2: GlyphSet = { id: "v2-" + uid(), name: name.slice(0, 64), kind: "strokes", base: "default", glyphs, updated: Date.now() }
      const same = current.find((c) => sameContent(c, v2))
      if (same) fallback = same.id
      else {
        incoming.push(v2)
        fallback = v2.id
      }
    }
  }
  const add: GlyphSet[] = []
  const rename = new Map<string, string>()
  let reused = 0
  const seen = new Set<string>()
  for (const s of incoming) {
    // One id once per recipe.
    if (seen.has(s.id)) continue
    seen.add(s.id)
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
  const clean = sanitizeScene(scene, { sets: ids, fallbackSet: fallback ?? current[0]?.id ?? "main" })
  if (!clean) return { ok: false, error: "В рецепте нет читаемой сцены." }
  return { ok: true, scene: clean, sets: add, reused }
}
