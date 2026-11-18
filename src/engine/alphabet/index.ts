import type { Alphabet, GlyphDef } from "../types"
import { latin, latinOrder } from "./latin"
import { cyrillic, cyrillicOrder } from "./cyrillic"

export { latinOrder, cyrillicOrder }
export const charset = latinOrder + cyrillicOrder

export const defaultAlphabet: Alphabet = { ...latin, ...cyrillic }

/** An alphabet version stores only the glyphs that differ from the default. */
export type AlphabetVersion = {
  id: string
  name: string
  glyphs: Record<string, GlyphDef>
  updated: number
}

export function buildAlphabet(overrides?: Record<string, GlyphDef>): Alphabet {
  return overrides ? { ...defaultAlphabet, ...overrides } : defaultAlphabet
}

/** Latin construction a Cyrillic letter shares, if it is a pure alias. */
export function sharedWith(char: string, alphabet: Alphabet): string | null {
  const g = alphabet[char]
  return g?.base && g.prims.length === 0 ? g.base : null
}

/** Letters that reuse this construction. */
export function sharedBy(char: string, alphabet: Alphabet): string[] {
  return Object.keys(alphabet).filter((c) => alphabet[c].base === char)
}

export const isSupported = (c: string, alphabet: Alphabet = defaultAlphabet) =>
  c in alphabet
