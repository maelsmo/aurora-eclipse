// «Геометрия» — the built-in geometric set, in the spirit of the AQA family
// (amuki): every capital is a block of big square cells, 2 × 2 (3 × 2 for
// wide letters), cell = 2.5 modules, so the cap height is two cells.
// - A cell is a square or a quarter disc (one corner rounded with the cell
//   radius); two quarters make a half disc, four make a disc.
// - Counters are hairline slots (0.25 m, rounded ends) cut into the block.
// - Diagonal letters use solid polygons.
// - Each cell carries its stripe direction: stems vertical, bars horizontal,
//   rounded cells concentric arcs, diagonals contours — the «lines» look draws
//   the letter as bundles of parallel lines (AQA 003), the inset opens gaps
//   between cells (AQA 001), the terminal axis turns round cells square
//   (AQA 002), outlines give AQA 004–005.
// The construction system follows the reference; the letter solutions are
// our own.
import type { Alphabet, BoxDef, PolyDef, PrimDir, SectorDef, Vec } from "../types"

const C = 2.5 // cell
const T = 0.25 // slot width

type Corner = "tl" | "tr" | "br" | "bl"
const ORDER: Corner[] = ["tl", "tr", "br", "bl"]

/** Cell (i, j) — column, row from the bottom — with rounded corners. */
const cell = (i: number, j: number, round: Corner[] = [], dir: PrimDir = "v"): BoxDef => ({
  kind: "box",
  a: [i * C, j * C],
  b: [(i + 1) * C, (j + 1) * C],
  ...(round.length ? { r: ORDER.map((k) => (round.includes(k) ? C : 0)) as BoxDef["r"] } : {}),
  dir: round.length ? "arc" : dir,
})
/** Bar (horizontal stripes) or stem (vertical stripes) of any size. */
const bar = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "h", ...(r ? { r } : {}) })
const stem = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "v", ...(r ? { r } : {}) })
/** Vertical / horizontal slot counters (cut-outs with round ends). */
const vs = (x: number, y0: number, y1: number): BoxDef => ({ kind: "box", a: [x - T / 2, y0], b: [x + T / 2, y1], r: [T / 2, T / 2, T / 2, T / 2], neg: true })
const hs = (y: number, x0: number, x1: number): BoxDef => ({ kind: "box", a: [x0, y - T / 2], b: [x1, y + T / 2], r: [T / 2, T / 2, T / 2, T / 2], neg: true })
/** Solid polygon (diagonal letters), stripes follow its contour. */
const P = (...pts: Vec[]): PolyDef => ({ kind: "poly", pts, dir: "contour" })
/** Round accent (Ё, Й). */
const dot = (cx: number, cy: number, r = 0.5): BoxDef => ({ kind: "box", a: [cx - r, cy - r], b: [cx + r, cy + r], r: [r, r, r, r], dir: "arc" })
/** Full disc of four quarter cells. */
const disc = (i = 0) => [cell(i, 1, ["tl"]), cell(i + 1, 1, ["tr"]), cell(i, 0, ["bl"]), cell(i + 1, 0, ["br"])]
const alias = (base: string) => ({ base, prims: [] })
const OUT = 0.25 // slots that open a side run this far past the edge

export const geoLatin: Alphabet = {
  // Dome on square legs; the slot opens the legs, a short slot marks the bar.
  A: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0), vs(2.5, -OUT, 3.5), hs(2.5, 2.5, 4.375)] },
  B: { adv: 5, prims: [cell(0, 1), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0, ["br"]), hs(2.5, 2.5, 5 + OUT), vs(2.5, 3.125, 4.375), vs(2.5, 0.625, 1.875)] },
  C: { adv: 5, prims: [...disc(), hs(2.5, 2.5, 5 + OUT), vs(2.5, 1, 4)] },
  D: { adv: 5, prims: [cell(0, 1), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0, ["br"]), vs(2.5, 1, 4)] },
  E: {
    adv: 5,
    prims: [cell(0, 1, ["tl"]), cell(1, 1, [], "h"), cell(0, 0, ["bl"]), cell(1, 0, [], "h"), hs(3.375, 2.5, 5 + OUT), hs(1.625, 2.5, 5 + OUT), { ...bar(4.25, 1.5, 5 + OUT, 3.5), neg: true }],
  },
  F: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), bar(2.5, 3.5, 5, 5), bar(2.5, 1.75, 4.25, 3.25)] },
  G: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0, ["bl"]), cell(1, 0), hs(3.375, 2.5, 5 + OUT), vs(2.5, 1, 3.375)] },
  H: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(2.5, -OUT, 1.75), vs(2.5, 3.25, 5 + OUT)] },
  I: { adv: 2.5, prims: [cell(0, 1), cell(0, 0)] },
  J: { adv: 5, prims: [cell(1, 1), cell(1, 0, ["br"]), cell(0, 0, ["bl"]), vs(2.5, 1, 5 + OUT)] },
  // Two leaves grow from the stem; their curves make the notch.
  K: { adv: 5, prims: [cell(0, 1), cell(0, 0), cell(1, 1, ["br"]), cell(1, 0, ["tr"])] },
  L: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), bar(2.5, 0, 5, 1.5, [0, 0.75, 0.75, 0])] },
  M: { adv: 7.5, prims: [cell(0, 1, ["tl"]), cell(1, 1, [], "h"), cell(2, 1, ["tr"]), cell(0, 0), cell(2, 0), vs(3.75, 2.75, 5 + OUT)] },
  // Two offset slots make the diagonal.
  N: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(3.25, 1.5, 5 + OUT), vs(1.75, -OUT, 3.5)] },
  O: { adv: 5, prims: [...disc(), vs(2.5, 1.25, 3.75)] },
  P: { adv: 5, prims: [cell(0, 1), cell(1, 1, ["tr"]), cell(0, 0), vs(2.5, 3, 4.5)] },
  Q: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0, ["bl"]), cell(1, 0), vs(2.5, 1.25, 3.75)] },
  R: { adv: 5, prims: [cell(0, 1), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0, ["tr"]), vs(2.5, 3, 4.5), hs(2.5, 2.5, 5 + OUT)] },
  S: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, [], "h"), cell(0, 0, [], "h"), cell(1, 0, ["br"]), hs(3.375, 1.75, 5 + OUT), hs(1.625, -OUT, 3.25)] },
  T: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, [], "h"), stem(1.25, 0, 3.75, 2.5)] },
  U: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0, ["bl"]), cell(1, 0, ["br"]), vs(2.5, 1.25, 5 + OUT)] },
  V: { adv: 5, prims: [P([0, 5], [5, 5], [5, 2.5], [2.5, 0], [0, 2.5]), vs(2.5, 1.75, 5 + OUT)] },
  W: { adv: 7.5, prims: [P([0, 5], [7.5, 5], [7.5, 2.5], [5.625, 0], [3.75, 1.25], [1.875, 0], [0, 2.5]), vs(2.5, 1.5, 5 + OUT), vs(5, 1.5, 5 + OUT)] },
  X: { adv: 5, prims: [P([0, 5], [1.75, 5], [5, 0], [3.25, 0]), P([3.25, 5], [5, 5], [1.75, 0], [0, 0])] },
  // A cup on a stem.
  Y: { adv: 5, prims: [cell(0, 1, ["bl"]), cell(1, 1, ["br"]), stem(1.25, 0, 3.75, 2.75), vs(2.5, 3.25, 5 + OUT)] },
  Z: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, [], "h"), cell(0, 0, [], "h"), cell(1, 0, [], "h"), hs(3.375, -OUT, 3.25), hs(1.625, 1.75, 5 + OUT)] },
}

export const geoCyrillic: Alphabet = {
  А: alias("A"),
  Б: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), cell(1, 0, ["br"]), bar(2.5, 3.5, 5, 5), vs(2.5, 0.625, 1.875)] },
  В: alias("B"),
  Г: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), bar(2.5, 3.5, 5, 5)] },
  Д: {
    adv: 5,
    prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0), vs(2.5, 0.75, 3.75), stem(0, -1, 1.25, 0.25, [0, 0, 0, 0.6]), stem(3.75, -1, 5, 0.25, [0, 0, 0.6, 0])],
  },
  Е: alias("E"),
  Ё: { base: "E", prims: [dot(1.25, 5.75), dot(3.75, 5.75)] },
  Ж: { adv: 7.5, prims: [cell(1, 1), cell(1, 0), cell(0, 1, ["bl"]), cell(0, 0, ["tl"]), cell(2, 1, ["br"]), cell(2, 0, ["tr"])] },
  З: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, ["tr"]), cell(0, 0, [], "h"), cell(1, 0, ["br"]), hs(3.375, -OUT, 3.25), hs(1.625, -OUT, 3.25)] },
  И: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(1.75, 1.5, 5 + OUT), vs(3.25, -OUT, 3.5)] },
  Й: { base: "И", prims: [bar(1.25, 5.5, 3.75, 6, [0.25, 0.25, 0.25, 0.25])] },
  К: alias("K"),
  Л: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1), cell(0, 0, ["br"]), cell(1, 0), vs(2.5, -OUT, 3.75)] },
  М: alias("M"),
  Н: alias("H"),
  О: alias("O"),
  П: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(2.5, -OUT, 3.75)] },
  Р: alias("P"),
  С: alias("C"),
  Т: alias("T"),
  У: { adv: 5, prims: [cell(0, 1, ["bl"]), cell(1, 1, ["br"]), P([2.5, 2.875], [4.5, 2.875], [2, 0], [0, 0]), vs(2.5, 3.25, 5 + OUT)] },
  Ф: { adv: 7.5, prims: [cell(0, 1, ["tl"]), cell(0, 0, ["bl"]), cell(1, 1), cell(1, 0), cell(2, 1, ["tr"]), cell(2, 0, ["br"]), vs(2.5, 1, 4), vs(5, 1, 4)] },
  Х: alias("X"),
  Ц: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(2.5, 1.25, 5 + OUT), stem(3.75, -1, 5, 0.25, [0, 0, 0.6, 0])] },
  Ч: { adv: 5, prims: [cell(0, 1, ["bl"]), cell(1, 1), cell(1, 0), vs(2.5, 3, 5 + OUT)] },
  Ш: { adv: 7.5, prims: [cell(0, 1), cell(1, 1), cell(2, 1), cell(0, 0), cell(1, 0), cell(2, 0), vs(2.5, 1.25, 5 + OUT), vs(5, 1.25, 5 + OUT)] },
  Щ: {
    adv: 7.5,
    prims: [cell(0, 1), cell(1, 1), cell(2, 1), cell(0, 0), cell(1, 0), cell(2, 0), vs(2.5, 1.25, 5 + OUT), vs(5, 1.25, 5 + OUT), stem(6.25, -1, 7.5, 0.25, [0, 0, 0.6, 0])],
  },
  Ъ: { adv: 7.5, prims: [bar(0, 3.5, 2.5, 5, [1.5, 0, 0, 0]), cell(1, 1), cell(1, 0), cell(2, 0, ["br"]), vs(5, 0.625, 1.875)] },
  Ы: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), cell(1, 0, ["br"]), vs(2.5, 0.625, 1.875), cell(2, 1), cell(2, 0), { ...stem(5 - T / 2, -OUT, 5 + T / 2, 5 + OUT), neg: true }] },
  Ь: { adv: 5, prims: [cell(0, 1), cell(0, 0), cell(1, 0, ["br"]), vs(2.5, 0.625, 1.875)] },
  Э: { adv: 5, prims: [...disc(), hs(2.5, -OUT, 2.5), vs(2.5, 1, 4)] },
  Ю: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), bar(2.25, 2, 3.25, 3), ...disc(1), vs(5, 1.25, 3.75)] },
  Я: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1), cell(0, 0, ["tl"]), cell(1, 0), vs(2.5, 3, 4.5), hs(2.5, -OUT, 2.5)] },
}

/** Pattern tiles: single cells to build grids and rosettes with cloners. */
export const geoTiles: Alphabet = {
  "■": { adv: 2.5, prims: [cell(0, 0, [], "h")] },
  "◜": { adv: 2.5, prims: [cell(0, 0, ["tl"])] },
  "◠": { adv: 2.5, prims: [bar(0, 0, 2.5, 2.5, [1.25, 1.25, 0, 0])] },
  "●": { adv: 2.5, prims: [bar(0, 0, 2.5, 2.5, [1.25, 1.25, 1.25, 1.25])] },
  "◆": { adv: 2.5, prims: [cell(0, 0, ["tl", "br"])] },
  "◉": { adv: 2.5, prims: [{ kind: "sector", c: [1.25, 1.25], r: 1.25, r0: 0.55, a0: 0, a1: 360, dir: "arc" } satisfies SectorDef] },
  "◢": { adv: 2.5, prims: [P([0, 0], [2.5, 0], [2.5, 2.5])] },
  "▤": { adv: 2.5, prims: [{ ...cell(0, 0, [], "h"), mode: "lines" }] },
}
export const geoTileOrder = Object.keys(geoTiles).join("")

export const geoAlphabet: Alphabet = { ...geoLatin, ...geoCyrillic, ...geoTiles }

/** Look the set suggests: four lines per cell in the «lines» look. */
export const geoLook = { stripes: 1.6, stripeFill: 0.5 }
