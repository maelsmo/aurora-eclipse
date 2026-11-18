// Combination operators. Each layer is combined with everything below it.
// The GLSL fold in gpu/shader.ts mirrors combine() exactly.
import { clamp, mix, smax, smin, blendWeight } from "./sdf"

export const ops = [
  "union",
  "fuse",
  "eclipse",
  "inlay",
  "cut",
  "intersect",
  "xor",
  "morph",
] as const
export type Op = (typeof ops)[number]

export const opInfo: Record<
  Op,
  { name: string; hint: string; params: ("k" | "gap" | "t")[] }
> = {
  union: {
    name: "Объединение",
    hint: "Формы складываются без перемычки.",
    params: [],
  },
  fuse: {
    name: "Слияние",
    hint: "Перемычка появляется, когда буквы сближаются.",
    params: ["k"],
  },
  eclipse: {
    name: "Затмение",
    hint: "Буква уходит за нижние и огибает их с просветом.",
    params: ["gap"],
  },
  inlay: {
    name: "Врезка",
    hint: "Буква ложится сверху и врезается в нижние с просветом.",
    params: ["gap"],
  },
  cut: {
    name: "Вырезание",
    hint: "Буква вырезает форму из нижних.",
    params: ["gap", "k"],
  },
  intersect: {
    name: "Пересечение",
    hint: "Остаётся только общая область.",
    params: ["k"],
  },
  xor: {
    name: "Исключение",
    hint: "Перекрытие становится просветом.",
    params: ["k"],
  },
  morph: {
    name: "Перетекание",
    hint: "Форма перетекает из нижних в эту букву.",
    params: ["t"],
  },
}

export const opIndex = (op: Op) => ops.indexOf(op)

/** Soft step for colour boundaries: share of `b` where it is the nearer field. */
const front = (acc: number, b: number, aa: number) =>
  clamp(0.5 + (0.5 * (acc - b)) / aa, 0, 1)

/**
 * Combines the accumulated field `acc` with the layer field `b`.
 * Returns the distance and the share of the layer colour at this point.
 * `aa` is the width of colour transitions (about one pixel).
 */
export function combine(
  op: Op,
  acc: number,
  b: number,
  k: number,
  gap: number,
  t: number,
  aa = 1e-3,
): [number, number] {
  switch (op) {
    case "union":
      return [Math.min(acc, b), front(acc, b, aa)]
    case "fuse":
      return [smin(acc, b, k), blendWeight(acc, b, k)]
    case "eclipse": {
      const b2 = Math.max(b, gap - acc)
      return [Math.min(acc, b2), front(acc, b2, aa)]
    }
    case "inlay": {
      const a2 = Math.max(acc, gap - b)
      return [Math.min(a2, b), front(a2, b, aa)]
    }
    case "cut":
      return [smax(acc, gap - b, k), 0]
    case "intersect":
      return [smax(acc, b, k), 0.5]
    case "xor":
      return [Math.max(smin(acc, b, k), -smax(acc, b, k)), front(acc, b, aa)]
    case "morph":
      return [mix(acc, b, clamp(t, 0, 1)), clamp(t, 0, 1)]
  }
}
