// Font axes: one set of numbers drives every glyph the same way.

export type Axes = {
  /** Stroke thickness, modules. */
  weight: number
  /** Thickness of horizontals relative to verticals. */
  contrast: number
  /** Horizontal scale of the skeleton. */
  width: number
  /** Radius of every concave joint, modules. */
  fillet: number
  /** How far a stroke end passes through the stroke it meets, × thickness. */
  overshoot: number
  /** 0 — flat cut, 1 — round terminal. */
  terminal: number
  /** Scale of counters (pupils and slots). */
  counter: number
  /** Scale of satellites. */
  satellite: number
  /** 0 — satellite stays apart, 1 — it reaches for the body. */
  attract: number
  /** Global offset of the contour, modules. */
  ink: number
  /** Slant, degrees. */
  slant: number
}

export type AxisKey = keyof Axes

export const defaultAxes: Axes = {
  weight: 1,
  contrast: 1,
  width: 1,
  fillet: 0.3,
  overshoot: 0.5,
  terminal: 1,
  counter: 1,
  satellite: 1,
  attract: 0,
  ink: 0,
  slant: 0,
}

export const axisKeys = Object.keys(defaultAxes) as AxisKey[]

export function resolveAxes(base: Axes, override?: Partial<Axes>): Axes {
  return override ? { ...base, ...override } : base
}
