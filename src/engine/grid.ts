// The construction grid. One module (m) equals the default stroke thickness.

/** Cap height: five horizontal bands — stroke, gap, stroke, gap, stroke. */
export const CAP = 5
/** Main centre lines of horizontals. */
export const ROWS = [0.5, 2.5, 4.5] as const
/** Secondary centre lines. */
export const SUB_ROWS = [1.5, 3.5] as const
/** Node step in the editor. */
export const STEP = 0.5
/** Fine node step (editor sub-grid). */
export const FINE_STEP = 0.25
/** Zone for diacritics, tails and satellites above the cap and below the baseline. */
export const OVERHANG = 1
/** Distance between glyph bounds in text layout. */
export const DEFAULT_TRACKING = 0.5

export const metrics = [
  { y: -OVERHANG, name: "Нижний вынос" },
  { y: 0, name: "Базовая линия" },
  { y: CAP / 2, name: "Середина" },
  { y: CAP, name: "Высота прописной" },
  { y: CAP + OVERHANG, name: "Верхний вынос" },
]

export const snap = (v: number, step = STEP) => Math.round(v / step) * step
