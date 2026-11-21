// Text layout: letters of one line share a baseline, lines are 7 modules apart.
import type { Axes } from "../axes"
import { compileGlyph } from "../compile"
import { CAP } from "../grid"
import type { Alphabet } from "../types"
import { makeLayer, type LetterNode } from "./types"

/** Horizontal anchor of a glyph: centre of its tight bounds; vertical: mid-cap. */
export function glyphAnchor(char: string, alphabet: Alphabet, axes: Axes, version: string | number = 0): [number, number] {
  const g = compileGlyph(char, alphabet, axes, version)
  return [(g.box.x0 + g.box.x1) / 2, CAP / 2]
}

/** Lays text out as letters. Spaces are 2 modules; unknown characters are skipped. */
export function layoutText(
  text: string,
  alphabet: Alphabet,
  axes: Axes,
  tracking: number,
  base: Partial<LetterNode> = {},
  version: string | number = 0,
): LetterNode[] {
  const lines = text.split("\n")
  const out: LetterNode[] = []
  const lineHeight = CAP + 2
  lines.forEach((line, li) => {
    const row: LetterNode[] = []
    let pen = 0
    for (const raw of line) {
      const c = raw.toLocaleUpperCase("ru")
      if (c === " ") {
        pen += 2
        continue
      }
      if (!(c in alphabet)) continue
      const g = compileGlyph(c, alphabet, axes, version)
      const w = g.box.x1 - g.box.x0
      row.push(makeLayer(c, { ...base, x: pen + w / 2 }))
      pen += w + tracking
    }
    const total = pen - tracking
    const y = ((lines.length - 1) / 2 - li) * lineHeight
    for (const l of row) out.push({ ...l, x: l.x - total / 2, y })
  })
  return out
}
