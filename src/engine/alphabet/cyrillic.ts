// Cyrillic capitals. Letters that share a form with Latin reuse its
// construction through `base`; tails and diacritics are satellites.
import type { Alphabet } from "../types"
import { A, D, S } from "./modules"
import { stadium, stem } from "./latin"

const alias = (base: string) => ({ base, prims: [] })
/** Soft-sign bowl on the right of a stem at x. */
const bowl = (x: number, right: number) => [
  S(x, 2.5, right - 1, 2.5),
  A(right - 1, 1.5, 1, -90, 90),
  S(x, 0.5, right - 1, 0.5),
]

export const cyrillic: Alphabet = {
  А: alias("A"),
  Б: {
    adv: 4,
    prims: [stem(0.5), S(0.5, 4.5, 3.5, 4.5), ...bowl(0.5, 3.5)],
  },
  В: alias("B"),
  Г: { adv: 3.5, prims: [stem(0.5), S(0.5, 4.5, 3, 4.5)] },
  Д: {
    adv: 5,
    prims: [
      S(0.5, 0.5, 4.5, 0.5),
      S(1.5, 0.5, 1.5, 4.5),
      stem(3.5),
      S(1.5, 4.5, 3.5, 4.5),
      D(0.5, -0.75, 0.7),
      D(4.5, -0.75, 0.7),
    ],
  },
  Е: alias("E"),
  Ё: { base: "E", prims: [D(1.5, 5.75, 0.7), D(3, 5.75, 0.7)] },
  Ж: {
    adv: 5,
    prims: [
      stem(2.5),
      S(2.5, 2.5, 0.5, 4.5),
      S(2.5, 2.5, 4.5, 4.5),
      S(2.5, 2.5, 0.5, 0.5),
      S(2.5, 2.5, 4.5, 0.5),
    ],
  },
  З: {
    adv: 4,
    prims: [
      S(0.5, 4.5, 2.5, 4.5),
      A(2.5, 3.5, 1, -90, 90),
      S(1.5, 2.5, 2.5, 2.5),
      A(2.5, 1.5, 1, -90, 90),
      S(0.5, 0.5, 2.5, 0.5),
    ],
  },
  И: { adv: 4, prims: [stem(0.5), stem(3.5), S(0.5, 0.5, 3.5, 4.5)] },
  Й: { base: "И", prims: [D(2, 5.75, 0.8)] },
  К: alias("K"),
  Л: { adv: 4, prims: [stem(3.5), S(1.5, 4.5, 3.5, 4.5), S(1.5, 4.5, 0.5, 0.5)] },
  М: alias("M"),
  Н: alias("H"),
  О: alias("O"),
  П: { adv: 4, prims: [stem(0.5), stem(3.5), S(0.5, 4.5, 3.5, 4.5)] },
  Р: alias("P"),
  С: alias("C"),
  Т: alias("T"),
  У: { adv: 4, prims: [S(0.5, 4.5, 2, 2.5), S(3.5, 4.5, 0.5, 0.5)] },
  Ф: { adv: 5, prims: [stem(2.5), A(2.5, 2.5, 1.5, 0, 360)] },
  Х: alias("X"),
  Ц: {
    adv: 4.5,
    prims: [stem(0.5), stem(3.5), S(0.5, 0.5, 3.5, 0.5), D(4, -0.75, 0.7)],
  },
  Ч: {
    adv: 4,
    prims: [
      stem(3.5),
      S(0.5, 3.5, 0.5, 4.5),
      A(1.5, 3.5, 1, 180, 270),
      S(1.5, 2.5, 3.5, 2.5),
    ],
  },
  Ш: {
    adv: 5,
    prims: [stem(0.5), stem(2.5), stem(4.5), S(0.5, 0.5, 4.5, 0.5)],
  },
  Щ: {
    adv: 5.5,
    prims: [
      stem(0.5),
      stem(2.5),
      stem(4.5),
      S(0.5, 0.5, 4.5, 0.5),
      D(5, -0.75, 0.7),
    ],
  },
  Ъ: {
    adv: 4.5,
    prims: [S(0.5, 4.5, 1.5, 4.5), stem(1.5), ...bowl(1.5, 4)],
  },
  Ы: { adv: 5, prims: [stem(0.5), ...bowl(0.5, 3), stem(4.5)] },
  Ь: { adv: 3.5, prims: [stem(0.5), ...bowl(0.5, 3)] },
  Э: {
    adv: 4,
    prims: [
      A(2, 3, 1.5, 0, 140),
      A(2, 2, 1.5, 220, 360),
      S(3.5, 2, 3.5, 3),
      S(1.5, 2.5, 3.5, 2.5),
    ],
  },
  Ю: {
    adv: 4.5,
    prims: [
      stem(0.5),
      S(0.5, 2.5, 2, 2.5, { ends: ["auto", "flush"] }),
      ...stadium(2, 4),
    ],
  },
  Я: {
    adv: 4,
    prims: [
      stem(3.5),
      S(1.5, 4.5, 3.5, 4.5),
      S(1.5, 2.5, 3.5, 2.5),
      A(1.5, 3.5, 1, 90, 270),
      S(2, 2.5, 0.5, 0.5),
    ],
  },
}

export const cyrillicOrder = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
