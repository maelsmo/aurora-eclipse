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

/**
 * Splits the letters of a text laid out by layoutText into runs of at most
 * `max` letters, breaking between words (a word longer than `max` is cut).
 * Returns letter indices in layout order; each chunk carries its words as `label`.
 */
export type TextChunk = number[] & { label: string }

export function chunkByWords(text: string, alphabet: Alphabet, max: number): TextChunk[] {
  const words: { idx: number[]; text: string }[] = []
  let word = { idx: [] as number[], text: "" }
  let i = 0
  const end = () => {
    if (word.idx.length) words.push(word)
    word = { idx: [], text: "" }
  }
  for (const raw of text) {
    const c = raw.toLocaleUpperCase("ru")
    if (c === " " || c === "\n") {
      end()
      continue
    }
    if (!(c in alphabet)) continue
    word.idx.push(i++)
    word.text += c
  }
  end()
  const chunks: TextChunk[] = []
  const make = (idx: number[], label: string) => Object.assign(idx, { label }) as TextChunk
  let cur: number[] = []
  let label: string[] = []
  const flush = () => {
    if (cur.length) chunks.push(make(cur, label.join(" ")))
    cur = []
    label = []
  }
  for (const w of words) {
    if (w.idx.length > max) {
      flush()
      for (let k = 0; k < w.idx.length; k += max) chunks.push(make(w.idx.slice(k, k + max), w.text.slice(k, k + max)))
      continue
    }
    if (cur.length + w.idx.length > max) flush()
    cur.push(...w.idx)
    label.push(w.text)
  }
  flush()
  return chunks
}
