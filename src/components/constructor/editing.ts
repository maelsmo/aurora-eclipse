// Helpers shared by the glyph editor panels.
import type { Alphabet, GlyphDef, PrimDef, PrimKind } from "@/engine/types"
import { sharedWith } from "@/engine/alphabet"
import type { Axes } from "@/engine/axes"

export type Tool = "select" | PrimKind

export const primNames: Record<PrimKind, string> = {
  stroke: "Штрих",
  arc: "Дуга",
  dot: "Спутник",
  hole: "Зрачок",
  slot: "Прорезь",
}

/** The glyph whose construction is edited for a letter (aliases edit their base). */
export function editTarget(char: string, alphabet: Alphabet) {
  const shared = sharedWith(char, alphabet)
  const target = shared ?? char
  const def = alphabet[target]
  return { target, shared, def }
}

/** Editing happens on the undeformed grid so handles sit on nodes. */
export function editAxes(studio: Axes): Axes {
  return { ...studio, weight: 1, contrast: 1, width: 1, slant: 0, ink: 0 }
}

export function withPrims(def: GlyphDef | undefined, prims: PrimDef[], adv?: number): GlyphDef {
  const out: GlyphDef = { ...(def ?? { prims: [] }), prims }
  if (adv !== undefined) out.adv = adv
  else if (out.adv === undefined && !out.base) out.adv = 4
  return out
}
