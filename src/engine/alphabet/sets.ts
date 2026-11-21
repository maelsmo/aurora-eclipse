// Glyph sets: several alphabets live side by side; a letter names its set.
// A set stores only the glyphs that differ from its base alphabet.
import type { Alphabet, GlyphDef } from "../types"
import type { LookPatch } from "../scene/types"
import { defaultAlphabet } from "./index"
import { geoAlphabet, geoLook } from "./geo"

export type SetKind = "strokes" | "shapes"
export type SetBase = "default" | "geo" | "empty"

export type GlyphSet = {
  id: string
  name: string
  kind: SetKind
  base: SetBase
  glyphs: Record<string, GlyphDef>
  /** Look applied to every letter of the set (inherited, overridable). */
  look?: LookPatch
  updated: number
}

const bases: Record<SetBase, () => Alphabet> = {
  default: () => defaultAlphabet,
  geo: () => geoAlphabet,
  empty: () => ({}),
}

/** Registers the alphabet behind a base (the geometric set plugs in here). */
export function registerBase(base: SetBase, make: () => Alphabet) {
  bases[base] = make
}

export function baseAlphabet(base: SetBase): Alphabet {
  return bases[base]()
}

export function setAlphabet(set: GlyphSet): Alphabet {
  const base = baseAlphabet(set.base)
  if (!Object.keys(set.glyphs).length) return base
  const out = { ...base, ...set.glyphs }
  // A deleted glyph is stored as an empty construction without base: drop it.
  for (const [c, g] of Object.entries(set.glyphs)) if (!g.prims.length && !g.base && g.adv === undefined) delete out[c]
  return out
}

export const mainSet = (): GlyphSet => ({ id: "main", name: "Основной", kind: "strokes", base: "default", glyphs: {}, updated: Date.now() })
/** The built-in geometric set, present in every library. */
export const geoSet = (): GlyphSet => ({ id: "geo", name: "Геометрия", kind: "shapes", base: "geo", glyphs: {}, look: { ...geoLook }, updated: Date.now() })

export type LibraryEntry = { set: GlyphSet; alphabet: Alphabet; version: string }

/** Every set compiled to its alphabet, plus the fallback set id. */
export type Library = {
  sets: Record<string, LibraryEntry>
  fallback: string
  revision: number
}

export function makeLibrary(sets: GlyphSet[], revision: number, prev?: Library): Library {
  const out: Library = { sets: {}, fallback: sets[0]?.id ?? "main", revision }
  for (const s of sets) {
    const old = prev?.sets[s.id]
    out.sets[s.id] =
      old && old.set === s ? old : { set: s, alphabet: setAlphabet(s), version: `${s.id}#${revision}` }
  }
  if (!sets.length) out.sets.main = { set: mainSet(), alphabet: defaultAlphabet, version: "main#0" }
  return out
}

/** The set a letter is drawn from: its own, the scene's, the fallback; null when no set has the glyph. */
export function resolveGlyphSet(lib: Library, char: string, own: string | undefined, sceneSet: string): LibraryEntry | null {
  for (const id of [own, sceneSet, lib.fallback]) {
    const e = id ? lib.sets[id] : undefined
    if (e && char in e.alphabet) return e
  }
  // Last resort: any set that has the sign (pattern tiles of another set).
  for (const e of Object.values(lib.sets)) if (char in e.alphabet) return e
  return null
}

/** A library with only the default alphabet (tests, previews without a store). */
export const defaultLibrary = (): Library => makeLibrary([mainSet(), geoSet()], 0)
