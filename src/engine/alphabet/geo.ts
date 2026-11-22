// «Геометрия» — the built-in geometric set, in the spirit of the AQA family
// (amuki): every capital is a block of big square cells, 2 × 2 (3 × 2 for
// Ж Ш Щ Ф Ю Ы Ъ N И Й), cell C = 2.5 modules, so the cap height is two cells.
// The construction rules:
// - A cell is a square or a quarter disc (one corner rounded by C); bowls of
//   B P R S Z З Я and the arches of M W use the half radius C/2.
// - Arms, leaves and points are quarters grown from a cell corner (E F K Y Г
//   Ж) or concave quarters (V); diagonals are two quarters touching (N И),
//   never straight slants — except X, which keeps two crossing bands.
// - Counters are hairline slots (T = 0.1 C) lying on the grid lines between
//   cells. A slot either opens a side or stops one slot width short of the
//   edge; where two slots would cross they stop and leave a node, so every
//   letter stays one piece.
// - Each cell carries its stripe direction: stems vertical, bars horizontal,
//   rounded cells concentric arcs — the «lines» look draws the letter as
//   bundles of parallel lines (AQA 003), the inset opens gaps between cells
//   (a mosaic of the cells), the terminal axis cuts quarters and bowls
//   straight at 0 (a quarter becomes a triangle, a dome a roof; AQA 002), outlines give AQA 004–005.
// The construction system follows the reference; the letter solutions are
// our own.
import type { Alphabet, BoxDef, PolyDef, PrimDir, SectorDef, Vec } from "../types"

const C = 2.5 // cell
const H = C / 2 // half radius
const T = 0.25 // slot width

type Corner = "tl" | "tr" | "br" | "bl"
const ORDER: Corner[] = ["tl", "tr", "br", "bl"]

/** Cell (i, j) — column, row from the bottom — with corners rounded by `r` (C or C/2). */
const cell = (i: number, j: number, round: Corner[] = [], dir: PrimDir = "v", r = C): BoxDef => ({
  kind: "box",
  a: [i * C, j * C],
  b: [(i + 1) * C, (j + 1) * C],
  ...(round.length ? { r: ORDER.map((k) => (round.includes(k) ? r : 0)) as BoxDef["r"] } : {}),
  dir: round.length ? "arc" : dir,
})
/** Cell with half-radius corners (bowls, arches). */
const half = (i: number, j: number, round: Corner[]) => cell(i, j, round, "arc", H)
/** Bar (horizontal stripes) or stem (vertical stripes) of any size. */
const bar = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "h", ...(r ? { r } : {}) })
const stem = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "v", ...(r ? { r } : {}) })
/**
 * Sector of radius C around (cx, cy) cut out of the cells from a0 to a1
 * degrees: concave quarters and the points where they meet. A sector, not a
 * disc, so it never bites accents outside the letter.
 */
const cave = (cx: number, cy: number, a0: number, a1: number): SectorDef => ({ kind: "sector", c: [cx, cy], r: C, a0, a1, neg: true })
/** Vertical / horizontal slot counters (cut-outs with round ends) between y0…y1 / x0…x1. */
const vs = (x: number, y0: number, y1: number): BoxDef => ({ kind: "box", a: [x - T / 2, y0], b: [x + T / 2, y1], r: [T / 2, T / 2, T / 2, T / 2], neg: true })
const hs = (y: number, x0: number, x1: number): BoxDef => ({ kind: "box", a: [x0, y - T / 2], b: [x1, y + T / 2], r: [T / 2, T / 2, T / 2, T / 2], neg: true })
/** Quarter-ring slot (curved counter of G) around (cx, cy) on the radius H, from a0 to a1 degrees. */
const arcSlot = (cx: number, cy: number, a0: number, a1: number): SectorDef => ({ kind: "sector", c: [cx, cy], r: H + T / 2, r0: H - T / 2, a0, a1, neg: true })
/** Solid polygon (X only), stripes follow its contour. */
const P = (...pts: Vec[]): PolyDef => ({ kind: "poly", pts, dir: "contour" })
/** Round accent (Ё, Й). */
const dot = (cx: number, cy: number, r = 0.5): BoxDef => ({ kind: "box", a: [cx - r, cy - r], b: [cx + r, cy + r], r: [r, r, r, r], dir: "arc" })
/** Full disc of four quarter cells, columns i and i + 1. */
const disc = (i = 0) => [cell(i, 1, ["tl"]), cell(i + 1, 1, ["tr"]), cell(i, 0, ["bl"]), cell(i + 1, 0, ["br"])]
const alias = (base: string) => ({ base, prims: [] })

/* Slot ends: open past the edge, closed one slot width inside it, and the
   two sides of a node around the middle line (or a slot it meets). */
const OUT = 0.25
const TOP = 2 * C + OUT,
  BOT = -OUT
const TOPc = 2 * C - T,
  BOTc = T
const UP = C + 1.5 * T,
  DN = C - 1.5 * T
/** Same as UP / DN around the line x = k · C. */
const up = (k: number) => k * C + 1.5 * T
const dn = (k: number) => k * C - 1.5 * T
/** Descender tails (Д Ц Щ): half a cell wide, one half cell deep. */
const tail = (x0: number, round: "bl" | "br") => stem(x0, -H, x0 + H, T, round === "bl" ? [0, 0, 0, H] : [0, 0, H, 0])

export const geoLatin: Alphabet = {
  // Dome on square legs; the slot runs down the middle, opens the legs and leaves a node.
  A: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0), vs(C, UP, TOPc), vs(C, BOT, DN)] },
  // Stem and two half-radius bowls; the waist slot opens to the right.
  B: { adv: 5, prims: [cell(0, 1), half(1, 1, ["tr", "br"]), cell(0, 0), half(1, 0, ["tr", "br"]), vs(C, UP, TOPc), vs(C, BOTc, DN), hs(C, UP, TOP)] },
  C: { adv: 5, prims: [...disc(), vs(C, UP, TOPc), vs(C, BOTc, DN), hs(C, UP, TOP)] },
  D: { adv: 5, prims: [cell(0, 1), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0, ["br"]), vs(C, BOTc, TOPc)] },
  // Half disc and two quarters grown from the right corners; the slots cross in the middle arm.
  E: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0, ["bl"]), cell(1, 1, ["bl"]), cell(1, 0, ["tl"]), vs(C, BOTc, TOPc), hs(C, DN, C + 2 * T)] },
  F: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), cell(1, 1, ["bl"]), vs(C, DN, TOPc), hs(C, DN, C + 2 * T)] },
  // Round back and a curved counter turning from the foot into the open bar.
  G: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, [], "h"), cell(0, 0, ["bl"]), cell(1, 0, [], "h"), vs(C, BOTc, C - H), arcSlot(C + H, C - H, 90, 180), hs(C, C + H, TOP)] },
  H: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(C, UP, TOP), vs(C, BOT, DN)] },
  I: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, [], "h"), cell(0, 0, [], "h"), cell(1, 0, [], "h"), hs(C, BOT, DN), hs(C, UP, TOP)] },
  J: { adv: 5, prims: [cell(1, 1), cell(1, 0, ["br"]), cell(0, 0, ["bl"]), vs(C, BOTc, TOP)] },
  // Two leaves grow from the middle of the stem.
  K: { adv: 5, prims: [cell(0, 1), cell(0, 0), cell(1, 1, ["br"]), cell(1, 0, ["tr"]), vs(C, UP, TOP), vs(C, BOT, DN)] },
  L: { adv: 5, prims: [cell(0, 1), cell(0, 0), cell(1, 0, ["tl"]), vs(C, BOTc, C + OUT)] },
  // Two half-radius arches; W turns them over.
  M: { adv: 5, prims: [half(0, 1, ["tl", "tr"]), half(1, 1, ["tl", "tr"]), cell(0, 0), cell(1, 0), vs(C, BOTc, TOP)] },
  // The diagonal is two quarters touching in the middle column.
  N: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), cell(1, 1, ["tr"]), cell(1, 0, ["bl"]), cell(2, 1), cell(2, 0), vs(C, BOT, DN), vs(2 * C, UP, TOP)] },
  O: { adv: 5, prims: [...disc(), vs(C, BOTc, TOPc)] },
  P: { adv: 5, prims: [cell(0, 1), half(1, 1, ["tr", "br"]), cell(0, 0), vs(C, C - OUT, TOPc)] },
  // O with a square foot and a tail slot.
  Q: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0, ["bl"]), cell(1, 0, [], "h"), vs(C, BOTc, TOPc), hs(H, C + 1.5 * T, TOP)] },
  R: { adv: 5, prims: [cell(0, 1), half(1, 1, ["tr", "br"]), cell(0, 0), cell(1, 0, ["tr"]), vs(C, UP, TOPc), vs(C, BOT, DN), hs(C, UP, TOP)] },
  S: { adv: 5, prims: [cell(0, 1, ["tl", "bl"], "h", H), cell(1, 1, [], "h"), cell(0, 0, [], "h"), cell(1, 0, ["tr", "br"], "h", H), hs(C, C - 2 * T, TOP), hs(C, BOT, H - 2 * T)] },
  // Bar and a dome touching it in the middle.
  T: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, [], "h"), cell(0, 0, ["tl"]), cell(1, 0, ["tr"]), vs(C, UP, TOPc)] },
  U: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0, ["bl"]), cell(1, 0, ["br"]), vs(C, BOTc, TOP)] },
  // Concave quarters meet in the bottom point.
  V: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), cave(0, 0, 0, 90), cave(2 * C, 0, 90, 180), vs(C, 1.5, TOP)] },
  W: { adv: 5, prims: [cell(0, 1), cell(1, 1), half(0, 0, ["bl", "br"]), half(1, 0, ["bl", "br"]), vs(C, H + 1.5 * T, TOP)] },
  X: { adv: 5, prims: [P([0, 5], [1.75, 5], [5, 0], [3.25, 0]), P([3.25, 5], [5, 5], [1.75, 0], [0, 0])] },
  // Two leaves meet the stem in the middle; the tail curls into the bottom.
  Y: { adv: 5, prims: [cell(0, 1, ["bl"]), cell(0, 0, ["tl"]), cell(1, 1), cell(1, 0, ["br"]), vs(C, UP, TOP)] },
  Z: { adv: 5, prims: [cell(0, 1, [], "h"), cell(1, 1, ["tr"], "h", H), cell(0, 0, ["tl"], "h", H), cell(1, 0, [], "h"), hs(C, BOT, DN), hs(C, UP, TOP)] },
}

export const geoCyrillic: Alphabet = {
  А: alias("A"),
  Б: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), cell(1, 1, ["bl"]), half(1, 0, ["tr", "br"]), vs(C, BOTc, TOPc)] },
  В: alias("B"),
  Г: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(0, 0), cell(1, 1, ["bl"]), vs(C, DN, TOPc)] },
  Д: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0), cell(1, 0), vs(C, BOTc, TOPc), tail(0, "bl"), tail(2 * C - H, "br")] },
  Е: alias("E"),
  Ё: { base: "E", prims: [dot(H, 2 * C + 0.75), dot(C + H, 2 * C + 0.75)] },
  Ж: {
    adv: 7.5,
    prims: [cell(1, 1), cell(1, 0), cell(0, 1, ["bl"]), cell(0, 0, ["tl"]), cell(2, 1, ["br"]), cell(2, 0, ["tr"]), vs(C, up(1), TOP), vs(C, BOT, dn(1)), vs(2 * C, up(1), TOP), vs(2 * C, BOT, dn(1))],
  },
  З: { adv: 5, prims: [cell(0, 1, ["tl"], "h", H), half(1, 1, ["tr", "br"]), cell(0, 0, ["bl"], "h", H), half(1, 0, ["tr", "br"]), hs(C, BOT, DN), hs(C, UP, TOP)] },
  И: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), cell(1, 1, ["tl"]), cell(1, 0, ["br"]), cell(2, 1), cell(2, 0), vs(C, UP, TOP), vs(2 * C, BOT, DN)] },
  Й: { base: "И", prims: [bar(C, 2 * C + 0.5, 2 * C, 2 * C + 1, [T, T, T, T])] },
  К: alias("K"),
  Л: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1), cell(0, 0, ["br"]), cell(1, 0), vs(C, BOT, TOPc)] },
  М: alias("M"),
  Н: alias("H"),
  О: alias("O"),
  П: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(C, BOT, TOPc)] },
  Р: alias("P"),
  С: alias("C"),
  Т: alias("T"),
  У: alias("Y"),
  Ф: {
    adv: 7.5,
    prims: [cell(0, 1, ["tl"]), cell(0, 0, ["bl"]), cell(1, 1), cell(1, 0), cell(2, 1, ["tr"]), cell(2, 0, ["br"]), vs(C, up(1), TOP), vs(C, BOT, dn(1)), vs(2 * C, up(1), TOP), vs(2 * C, BOT, dn(1))],
  },
  Х: alias("X"),
  Ц: { adv: 5, prims: [cell(0, 1), cell(1, 1), cell(0, 0), cell(1, 0), vs(C, BOTc, TOP), tail(2 * C - H, "br")] },
  Ч: { adv: 5, prims: [cell(0, 1, ["bl"]), cell(1, 1), cell(1, 0), vs(C, UP, TOP)] },
  Ш: { adv: 7.5, prims: [cell(0, 1), cell(1, 1), cell(2, 1), cell(0, 0), cell(1, 0), cell(2, 0), vs(C, BOTc, TOP), vs(2 * C, BOTc, TOP)] },
  Щ: { adv: 7.5, prims: [cell(0, 1), cell(1, 1), cell(2, 1), cell(0, 0), cell(1, 0), cell(2, 0), vs(C, BOTc, TOP), vs(2 * C, BOTc, TOP), tail(3 * C - H, "br")] },
  Ъ: { adv: 7.5, prims: [cell(0, 1, ["br"]), cell(1, 1), cell(1, 0), half(2, 0, ["tr", "br"]), vs(C, DN, TOPc), vs(2 * C, BOTc, C + OUT)] },
  Ы: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), half(1, 0, ["tr", "br"]), vs(C, BOTc, C + OUT), cell(2, 1), cell(2, 0), vs(2 * C, BOT, TOP)] },
  Ь: { adv: 5, prims: [cell(0, 1), cell(0, 0), half(1, 0, ["tr", "br"]), vs(C, BOTc, C + OUT)] },
  Э: { adv: 5, prims: [...disc(), vs(C, UP, TOPc), vs(C, BOTc, DN), hs(C, BOT, DN)] },
  // Stem joined to a disc at the node.
  Ю: { adv: 7.5, prims: [cell(0, 1), cell(0, 0), ...disc(1), vs(C, up(1), TOP), vs(C, BOT, dn(1)), vs(2 * C, BOTc, TOPc)] },
  Я: { adv: 5, prims: [half(0, 1, ["tl", "bl"]), cell(1, 1), cell(0, 0, ["tl"]), cell(1, 0), vs(C, UP, TOPc), vs(C, BOT, DN), hs(C, BOT, DN)] },
}

/** Tiles turn and mirror about their own centre, so rosettes stay seamless. */
const TILE_C: [number, number] = [1.25, 1.25]

/** Pattern tiles: single cells to build grids and rosettes with cloners. */
export const geoTiles: Alphabet = {
  "■": { adv: 2.5, anchor: TILE_C, prims: [cell(0, 0, [], "h")] },
  "◜": { adv: 2.5, anchor: TILE_C, prims: [cell(0, 0, ["tl"])] },
  "◠": { adv: 2.5, anchor: TILE_C, prims: [bar(0, 0, 2.5, 2.5, [1.25, 1.25, 0, 0])] },
  "●": { adv: 2.5, anchor: TILE_C, prims: [bar(0, 0, 2.5, 2.5, [1.25, 1.25, 1.25, 1.25])] },
  "◆": { adv: 2.5, anchor: TILE_C, prims: [cell(0, 0, ["tl", "br"])] },
  "◉": { adv: 2.5, anchor: TILE_C, prims: [{ kind: "sector", c: [1.25, 1.25], r: 1.25, r0: 0.55, a0: 0, a1: 360, dir: "arc" } satisfies SectorDef] },
  "◢": { adv: 2.5, anchor: TILE_C, prims: [P([0, 0], [2.5, 0], [2.5, 2.5])] },
  "▤": { adv: 2.5, anchor: TILE_C, prims: [{ ...cell(0, 0, [], "h"), mode: "lines" }] },
}
export const geoTileOrder = Object.keys(geoTiles).join("")

export const geoAlphabet: Alphabet = { ...geoLatin, ...geoCyrillic, ...geoTiles }

/** Look the set suggests: four lines per cell in the «lines» look. */
export const geoLook = { stripes: 1.6, stripeFill: 0.5 }
