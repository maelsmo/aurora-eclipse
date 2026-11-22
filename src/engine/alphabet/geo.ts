// «Геометрия» — the built-in geometric set. Every capital is a slab of big
// square cells, 2 × 2 (3 × 2 for M W Ж Ф Ш Щ Ъ Ы Ю), cell C = 2.5 modules,
// so the cap height is two cells — and the letter is what is left of the slab
// after shadows pass over it. The construction rules:
// - Ink is cells only: a square, a quarter disc (one corner rounded by C) or
//   a bowl (corners rounded by C/2). A missing cell is real white space
//   (J P Ь), and the cells are the same tiles the set offers for patterns.
// - Counters are shadows, one module wide like the stroke of the main set:
//   a pupil (a round hole), a bay (a slot entering from an edge and ending in
//   a half disc) or a wedge (a straight 45° cut). Round and straight letters
//   take pupils and bays, diagonal letters take wedges: U is round, V is its
//   angular twin; S has bays, Z has wedges.
// - The moon letters C G Э are a disc eclipsed by a bigger shadow: a crescent.
// - Each cell carries its stripe direction: stems vertical, bars horizontal,
//   rounded cells concentric arcs — the «lines» look draws the letter as
//   bundles of parallel lines, five to a cell. Shadows keep to the half-module
//   grid, so a bay or a pupil takes out whole lines and never splits one.
// - The inset opens gaps between cells (a mosaic), the terminal axis turns
//   everything round into 45° facets at 0, the outline leaves the contour.
import type { Alphabet, BoxDef, PolyDef, PrimDir, SectorDef, Vec } from "../types"

const C = 2.5 // cell
const H = C / 2 // bowl radius
const CAP = 2 * C
const R = 0.5 // shadow radius: pupils and bays are one module wide
const OUT = 0.25 // cut-outs run past the edge they open

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
/** Square cell. */
const sq = (i: number, j: number, dir: PrimDir = "v") => cell(i, j, [], dir)
/** Cell with bowl-radius corners; its lines follow its own contour and ring the pupil in its middle. */
const bowl = (i: number, j: number, round: Corner[]): BoxDef => ({ ...cell(i, j, round, "arc", H), dir: "contour" })
/** Bar (horizontal stripes) or stem (vertical stripes) of any size; they overlap the cells they join. */
const bar = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "h", ...(r ? { r } : {}) })
const stem = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], dir: "v", ...(r ? { r } : {}) })
/** 2 × 2 slab of square cells: top-left, top-right, bottom-left, bottom-right stripe directions. */
const slab = (tl: PrimDir = "v", tr: PrimDir = "v", bl: PrimDir = "v", br: PrimDir = "v") => [sq(0, 1, tl), sq(1, 1, tr), sq(0, 0, bl), sq(1, 0, br)]
/** 3 × 2 slab. */
const wide = (dir: PrimDir = "v") => [sq(0, 1, dir), sq(1, 1, dir), sq(2, 1, dir), sq(0, 0, dir), sq(1, 0, dir), sq(2, 0, dir)]
/** Full disc of four quarter cells, columns i and i + 1. */
const disc = (i = 0) => [cell(i, 1, ["tl"]), cell(i + 1, 1, ["tr"]), cell(i, 0, ["bl"]), cell(i + 1, 0, ["br"])]

/* Shadows (cut-outs). */
/** Pupil: a round hole. */
const eye = (cx: number, cy: number, r = R): BoxDef => ({ kind: "box", a: [cx - r, cy - r], b: [cx + r, cy + r], r: [r, r, r, r], neg: true })
/** Bays: slots from an edge to a half disc centred at the given point. */
const fromTop = (x: number, yc: number): BoxDef => ({ kind: "box", a: [x - R, yc - R], b: [x + R, CAP + OUT], r: [0, 0, R, R], neg: true })
const fromBottom = (x: number, yc: number): BoxDef => ({ kind: "box", a: [x - R, -OUT], b: [x + R, yc + R], r: [R, R, 0, 0], neg: true })
const fromLeft = (y: number, xc: number): BoxDef => ({ kind: "box", a: [-OUT, y - R], b: [xc + R, y + R], r: [0, R, R, 0], neg: true })
const fromRight = (y: number, xc: number, w = CAP): BoxDef => ({ kind: "box", a: [xc - R, y - R], b: [w + OUT, y + R], r: [R, 0, 0, R], neg: true })
/** Wedge: a straight cut (diagonal letters). */
const wedge = (...pts: Vec[]): PolyDef => ({ kind: "poly", pts, neg: true })
/** Missing part of a cell (`r` rounds the end of a short bay). */
const gap = (x0: number, y0: number, x1: number, y1: number, r?: BoxDef["r"]): BoxDef => ({ kind: "box", a: [x0, y0], b: [x1, y1], ...(r ? { r } : {}), neg: true })
/** The big shadow of the moon letters C G Э, and its upper half. */
const MOON = 1.5
const halfMoon = (cx: number, cy: number): BoxDef => ({ kind: "box", a: [cx - MOON, cy], b: [cx + MOON, cy + MOON], r: [MOON, MOON, 0, 0], neg: true })

/** Roof: the two top corners cut at 45° down to the middle line (A Д Л). */
const roof = () => [wedge([-OUT, C - OUT], [C + OUT, CAP + OUT], [-OUT, CAP + OUT]), wedge([CAP + OUT, C - OUT], [C - OUT, CAP + OUT], [CAP + OUT, CAP + OUT])]
/** Round accent (Ё). */
const dot = (cx: number, cy: number, r = R): BoxDef => ({ kind: "box", a: [cx - r, cy - r], b: [cx + r, cy + r], r: [r, r, r, r], dir: "arc" })
/** Descender (Д Ц Щ): three lines wide, one module deep, overlapping the cell above. */
const TAIL = 1.5
const tail = (x0: number) => stem(x0, -1, x0 + TAIL, OUT)
const alias = (base: string) => ({ base, prims: [] })

export const geoLatin: Alphabet = {
  // A roof on a slab: the pupil under the ridge, the bay between the legs.
  A: { adv: 5, prims: [...slab(), ...roof(), eye(C, 3.5), fromBottom(C, 1.5)] },
  // Stem and two bowls, a pupil in the middle of each.
  B: { adv: 5, prims: [sq(0, 1), bowl(1, 1, ["tr", "br"]), sq(0, 0), bowl(1, 0, ["tr", "br"]), eye(C + H, C + H), eye(C + H, H)] },
  // A disc eclipsed from the right.
  C: { adv: 5, prims: [...disc(), eye(3.875, C, MOON)] },
  D: { adv: 5, prims: [sq(0, 1), cell(1, 1, ["tr"]), sq(0, 0), cell(1, 0, ["br"]), eye(C, C, 1)] },
  // Stem and three arms: two bays enter from the right.
  E: { adv: 5, prims: [sq(0, 1), sq(1, 1, "h"), sq(0, 0), sq(1, 0, "h"), fromRight(3.5, C), fromRight(1.5, C)] },
  F: { adv: 5, prims: [sq(0, 1), sq(1, 1, "h"), sq(0, 0), sq(1, 0, "h"), fromRight(3.5, C), gap(C, -OUT, CAP + OUT, 2)] },
  // The upper half of the shadow only: the square chin keeps a flat bar.
  G: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0, ["bl"]), sq(1, 0, "h"), halfMoon(3.875, C)] },
  H: { adv: 5, prims: [...slab(), fromTop(C, 3.5), fromBottom(C, 1.5)] },
  I: { adv: 2.5, prims: [sq(0, 1), sq(0, 0)] },
  // The top-left cell is missing; a short bay curls the hook.
  J: { adv: 5, prims: [sq(1, 1), cell(1, 0, ["br"]), cell(0, 0, ["bl"]), gap(1.5, 1.5, C, C, [0, 0, R, R])] },
  // Three wedges: between the stem and each arm, and between the arms.
  K: { adv: 5, prims: [...slab(), wedge([2, 3.5], [3.75, 5.25], [2, 5.25]), wedge([2, 1.5], [3.75, -0.25], [2, -0.25]), wedge([3.5, 2.5], [5.25, 4.25], [5.25, 0.75])] },
  L: { adv: 5, prims: [...slab("v", "v", "v", "h"), gap(C, 2, CAP + OUT, CAP + OUT)] },
  M: { adv: 7.5, prims: [...wide(), wedge([1.75, 5.25], [5.75, 5.25], [3.75, 3.25]), wedge([2, -0.25], [4, -0.25], [2, 1.75]), wedge([5.5, -0.25], [3.5, -0.25], [5.5, 1.75])] },
  N: { adv: 5, prims: [...slab(), wedge([1.25, 5.25], [3.5, 5.25], [3.5, 3]), wedge([1.5, -0.25], [3.75, -0.25], [1.5, 2])] },
  // A ring: the shadow sits in the middle of the disc.
  O: { adv: 5, prims: [...disc(), eye(C, C, 1)] },
  P: { adv: 5, prims: [sq(0, 1), bowl(1, 1, ["tr", "br"]), sq(0, 0), eye(C + H, C + H)] },
  // O with a square corner for the tail.
  Q: { adv: 5, prims: [cell(0, 1, ["tl"]), cell(1, 1, ["tr"]), cell(0, 0, ["bl"]), sq(1, 0, "h"), eye(C, C, 1)] },
  // P on two legs: a bay between them, a wedge kicks the right one out.
  R: { adv: 5, prims: [sq(0, 1), bowl(1, 1, ["tr", "br"]), sq(0, 0), sq(1, 0), eye(C + H, C + H), fromBottom(C, 1), wedge([3.75, 2.5], [5.25, 2.5], [5.25, 1])] },
  // A leaf (two quarters) with a bay from each side.
  S: { adv: 5, prims: [cell(0, 1, ["tl"]), sq(1, 1, "h"), sq(0, 0, "h"), cell(1, 0, ["br"]), fromRight(3.5, 2.5), fromLeft(1.5, 2.5)] },
  T: { adv: 5, prims: [...slab("h", "h", "v", "v"), gap(-OUT, -OUT, 1.5, 3), gap(3.5, -OUT, CAP + OUT, 3)] },
  U: { adv: 5, prims: [sq(0, 1), sq(1, 1), cell(0, 0, ["bl"]), cell(1, 0, ["br"]), fromTop(C, 2.5)] },
  // The angular twin of U: the sides taper, the bay ends in a point.
  V: { adv: 5, prims: [...slab(), wedge([-OUT, -OUT], [2.125, -OUT], [-OUT, 4.5]), wedge([CAP + OUT, -OUT], [2.875, -OUT], [CAP + OUT, 4.5]), wedge([1.5, 5.25], [3.5, 5.25], [2.5, 2.25])] },
  W: { adv: 7.5, prims: [...wide(), wedge([1.75, -0.25], [5.75, -0.25], [3.75, 1.75]), wedge([2, 5.25], [4, 5.25], [2, 3.25]), wedge([5.5, 5.25], [3.5, 5.25], [5.5, 3.25])] },
  // Four wedges point at the centre.
  X: { adv: 5, prims: [...slab(), wedge([0.75, 5.25], [4.25, 5.25], [2.5, 3.5]), wedge([0.75, -0.25], [4.25, -0.25], [2.5, 1.5]), wedge([-0.25, 0.75], [-0.25, 4.25], [1.5, 2.5]), wedge([5.25, 0.75], [5.25, 4.25], [3.5, 2.5])] },
  Y: { adv: 5, prims: [...slab(), wedge([0.75, 5.25], [4.25, 5.25], [2.5, 3.5]), wedge([-OUT, -OUT], [1.5, -OUT], [1.5, 1.5], [-OUT, 3.25]), wedge([CAP + OUT, -OUT], [3.5, -OUT], [3.5, 1.5], [CAP + OUT, 3.25])] },
  // The angular twin of S.
  Z: { adv: 5, prims: [...slab("h", "h", "h", "h"), wedge([-OUT, 4], [2, 4], [-OUT, 1.75]), wedge([CAP + OUT, 1], [3, 1], [CAP + OUT, 3.25])] },
}

export const geoCyrillic: Alphabet = {
  А: alias("A"),
  Б: { adv: 5, prims: [sq(0, 1), sq(1, 1, "h"), sq(0, 0), bowl(1, 0, ["tr", "br"]), fromRight(3, C), eye(C + H, H)] },
  В: alias("B"),
  Г: { adv: 5, prims: [...slab("v", "h", "v", "v"), gap(C, -OUT, CAP + OUT, 3)] },
  Д: { adv: 5, prims: [...slab(), ...roof(), eye(C, 3), tail(0), tail(CAP - TAIL)] },
  Е: alias("E"),
  Ё: { base: "E", prims: [dot(1.5, 5.75), dot(3.5, 5.75)] },
  Ж: {
    adv: 7.5,
    prims: [
      ...wide(),
      wedge([-0.25, 0.75], [-0.25, 4.25], [1.5, 2.5]),
      wedge([7.75, 0.75], [7.75, 4.25], [6, 2.5]),
      wedge([2.75, 3.5], [1, 5.25], [2.75, 5.25]),
      wedge([4.75, 3.5], [6.5, 5.25], [4.75, 5.25]),
      wedge([2.75, 1.5], [1, -0.25], [2.75, -0.25]),
      wedge([4.75, 1.5], [6.5, -0.25], [4.75, -0.25]),
    ],
  },
  З: { adv: 5, prims: [sq(0, 1, "h"), bowl(1, 1, ["tr", "br"]), sq(0, 0, "h"), bowl(1, 0, ["tr", "br"]), fromLeft(3.5, 2.5), fromLeft(1.5, 2.5)] },
  И: { adv: 5, prims: [...slab(), wedge([3.75, 5.25], [1.5, 5.25], [1.5, 3]), wedge([3.5, -0.25], [1.25, -0.25], [3.5, 2])] },
  // The breve is a half disc hanging over the letter.
  Й: { base: "И", prims: [{ kind: "sector", c: [C, 6.25], r: 1, a0: 180, a1: 360, dir: "arc" } satisfies SectorDef] },
  К: alias("K"),
  Л: { adv: 5, prims: [...slab(), ...roof(), fromBottom(C, 3)] },
  М: alias("M"),
  Н: alias("H"),
  О: alias("O"),
  П: { adv: 5, prims: [...slab(), fromBottom(C, 3.5)] },
  Р: alias("P"),
  С: alias("C"),
  Т: alias("T"),
  У: alias("Y"),
  // A wide disc with two pupils: the stem is what stays between them.
  Ф: { adv: 7.5, prims: [cell(0, 1, ["tl"]), sq(1, 1), cell(2, 1, ["tr"]), cell(0, 0, ["bl"]), sq(1, 0), cell(2, 0, ["br"]), eye(2, C, 1), eye(5.5, C, 1)] },
  Х: alias("X"),
  Ц: { adv: 5, prims: [...slab(), fromTop(C, 1.5), tail(CAP - TAIL)] },
  Ч: { adv: 5, prims: [...slab(), gap(-OUT, -OUT, 3, 2), fromTop(C, 3.5)] },
  Ш: { adv: 7.5, prims: [...wide(), fromTop(C, 1.5), fromTop(2 * C, 1.5)] },
  Щ: { adv: 7.5, prims: [...wide(), fromTop(C, 1.5), fromTop(2 * C, 1.5), tail(3 * C - TAIL)] },
  Ъ: { adv: 7.5, prims: [sq(0, 1, "h"), sq(1, 1), sq(1, 0), bowl(2, 0, ["tr", "br"]), eye(2 * C + H, H), gap(-OUT, C - OUT, C, 3)] },
  // Ь and a separate stem.
  Ы: { adv: 7.5, prims: [sq(0, 1), sq(0, 0), bowl(1, 0, ["tr", "br"]), eye(C + H, H), stem(5.5, 0, 7.5, 5)] },
  Ь: { adv: 5, prims: [sq(0, 1), sq(0, 0), bowl(1, 0, ["tr", "br"]), eye(C + H, H)] },
  // C turned over, with a tongue left in the shadow.
  Э: { adv: 5, prims: [...disc(), eye(1.125, C, MOON), bar(1.5, 2, 3.5, 3, [R, 0, 0, R])] },
  // Stem and ring joined by a bridge.
  Ю: { adv: 7.5, prims: [sq(0, 1), sq(0, 0), ...disc(1), eye(2 * C, C, 1), bar(2, 2, 3.5, 3)] },
  Я: { adv: 5, prims: [bowl(0, 1, ["tl", "bl"]), sq(1, 1), sq(0, 0), sq(1, 0), eye(H, C + H), fromBottom(C, 1), wedge([1.25, 2.5], [-0.25, 2.5], [-0.25, 1])] },
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
  "◢": { adv: 2.5, anchor: TILE_C, prims: [{ kind: "poly", pts: [[0, 0], [2.5, 0], [2.5, 2.5]], dir: "contour" } satisfies PolyDef] },
  "▤": { adv: 2.5, anchor: TILE_C, prims: [{ ...cell(0, 0, [], "h"), mode: "lines" }] },
}
export const geoTileOrder = Object.keys(geoTiles).join("")

export const geoAlphabet: Alphabet = { ...geoLatin, ...geoCyrillic, ...geoTiles }

/** Look the set suggests: five lines per cell in the «lines» look, so shadows on the half-module grid cut whole lines. */
export const geoLook = { stripes: 2, stripeFill: 0.5 }
