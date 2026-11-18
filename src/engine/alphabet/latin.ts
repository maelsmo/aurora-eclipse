// Latin capitals on the 5-module grid. Horizontals sit on y = 0.5 / 2.5 / 4.5,
// stems on x = 0.5 and adv − 0.5, curves are arcs around grid nodes.
import type { Alphabet } from "../types"
import { A, D, H, S } from "./modules"

const stem = (x: number) => S(x, 0.5, x, 4.5)
/** Stadium: verticals plus two half circles of radius r. */
const stadium = (x0: number, x1: number, y0 = 0.5, y1 = 4.5) => {
  const r = (x1 - x0) / 2,
    cx = (x0 + x1) / 2
  return [
    S(x0, y0 + r, x0, y1 - r),
    S(x1, y0 + r, x1, y1 - r),
    A(cx, y1 - r, r, 0, 180),
    A(cx, y0 + r, r, 180, 360),
  ]
}

export const latin: Alphabet = {
  // Signature: a stem with a round head above the arms, a pupil at the
  // crossing and a satellite in place of the right leg.
  A: {
    adv: 4,
    prims: [
      S(1.5, 0.5, 1.5, 4.5),
      S(0.5, 3.5, 3.5, 3.5),
      S(1.5, 2, 3.5, 2),
      H(1.5, 3.5),
      D(3.5, 0.5, 1.1),
    ],
  },
  B: {
    adv: 4,
    prims: [
      stem(0.5),
      S(0.5, 4.5, 2.5, 4.5),
      S(0.5, 2.5, 2.5, 2.5),
      S(0.5, 0.5, 2.5, 0.5),
      A(2.5, 3.5, 1, -90, 90),
      A(2.5, 1.5, 1, -90, 90),
    ],
  },
  C: {
    adv: 4,
    prims: [S(0.5, 2, 0.5, 3), A(2, 3, 1.5, 40, 180), A(2, 2, 1.5, 180, 320)],
  },
  D: {
    adv: 4,
    prims: [
      stem(0.5),
      S(0.5, 4.5, 1.5, 4.5),
      S(0.5, 0.5, 1.5, 0.5),
      A(1.5, 2.5, 2, -90, 90),
    ],
  },
  // Signature: three pills pass through the stem and make the wave on the left.
  E: {
    adv: 4.5,
    prims: [
      stem(0.5),
      S(0.5, 4.5, 3.5, 4.5),
      S(0.5, 2.5, 3, 2.5),
      S(0.5, 0.5, 4, 0.5),
    ],
  },
  F: {
    adv: 4,
    prims: [stem(0.5), S(0.5, 4.5, 3.5, 4.5), S(0.5, 2.5, 3, 2.5)],
  },
  G: {
    adv: 4,
    prims: [
      S(0.5, 2, 0.5, 3),
      A(2, 3, 1.5, 40, 180),
      A(2, 2, 1.5, 180, 360),
      S(3.5, 2, 3.5, 2.5),
      S(2, 2.5, 3.5, 2.5),
    ],
  },
  H: { adv: 4, prims: [stem(0.5), stem(3.5), S(0.5, 2.5, 3.5, 2.5)] },
  I: { adv: 1, prims: [stem(0.5)] },
  J: {
    adv: 4,
    prims: [S(3.5, 2, 3.5, 4.5), S(1.5, 4.5, 3.5, 4.5), A(2, 2, 1.5, 180, 360)],
  },
  K: {
    adv: 4,
    prims: [stem(0.5), S(0.5, 1.5, 3.5, 4.5), S(1.5, 2.5, 3.5, 0.5)],
  },
  L: { adv: 3.5, prims: [stem(0.5), S(0.5, 0.5, 3, 0.5)] },
  M: {
    adv: 5,
    prims: [stem(0.5), stem(4.5), S(0.5, 4.5, 2.5, 1.5), S(2.5, 1.5, 4.5, 4.5)],
  },
  N: { adv: 4, prims: [stem(0.5), stem(3.5), S(0.5, 4.5, 3.5, 0.5)] },
  O: { adv: 4, prims: stadium(0.5, 3.5) },
  P: {
    adv: 4,
    prims: [
      stem(0.5),
      S(0.5, 4.5, 2.5, 4.5),
      S(0.5, 2.5, 2.5, 2.5),
      A(2.5, 3.5, 1, -90, 90),
    ],
  },
  // The tail of Q is a satellite, like the leg of A.
  Q: { adv: 4.5, prims: [...stadium(0.5, 3.5), D(3.75, -0.25, 0.8)] },
  R: {
    adv: 4,
    prims: [
      stem(0.5),
      S(0.5, 4.5, 2.5, 4.5),
      S(0.5, 2.5, 2.5, 2.5),
      A(2.5, 3.5, 1, -90, 90),
      S(2, 2.5, 3.5, 0.5),
    ],
  },
  S: {
    adv: 4,
    prims: [
      S(1.5, 4.5, 3, 4.5),
      A(1.5, 3.5, 1, 90, 270),
      S(1.5, 2.5, 2.5, 2.5),
      A(2.5, 1.5, 1, -90, 90),
      S(1, 0.5, 2.5, 0.5),
    ],
  },
  T: { adv: 4, prims: [S(0.5, 4.5, 3.5, 4.5), S(2, 0.5, 2, 4.5)] },
  U: {
    adv: 4,
    prims: [S(0.5, 2, 0.5, 4.5), S(3.5, 2, 3.5, 4.5), A(2, 2, 1.5, 180, 360)],
  },
  V: { adv: 4, prims: [S(0.5, 4.5, 2, 0.5), S(2, 0.5, 3.5, 4.5)] },
  W: {
    adv: 5,
    prims: [
      S(0.5, 4.5, 1.5, 0.5),
      S(1.5, 0.5, 2.5, 3.5),
      S(2.5, 3.5, 3.5, 0.5),
      S(3.5, 0.5, 4.5, 4.5),
    ],
  },
  X: { adv: 4, prims: [S(0.5, 4.5, 3.5, 0.5), S(0.5, 0.5, 3.5, 4.5)] },
  Y: {
    adv: 4,
    prims: [S(0.5, 4.5, 2, 2.5), S(3.5, 4.5, 2, 2.5), S(2, 0.5, 2, 2.5)],
  },
  Z: {
    adv: 4,
    prims: [S(0.5, 4.5, 3.5, 4.5), S(3.5, 4.5, 0.5, 0.5), S(0.5, 0.5, 3.5, 0.5)],
  },
}

export const latinOrder = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
export { stem, stadium }
