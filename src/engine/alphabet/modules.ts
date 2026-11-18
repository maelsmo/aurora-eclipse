// Shorthands for writing constructions on the grid.
import type { ArcDef, DotDef, EndMode, HoleDef, SlotDef, StrokeDef } from "../types"

/** Stroke between two nodes. */
export const S = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: { w?: number; ends?: [EndMode, EndMode] } = {},
): StrokeDef => ({ kind: "stroke", a: [ax, ay], b: [bx, by], ...opts })

/** Arc around a node, angles in degrees CCW from +x. */
export const A = (
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  w?: number,
): ArcDef => ({ kind: "arc", c: [cx, cy], r, a0, a1, ...(w ? { w } : {}) })

/** Satellite. */
export const D = (cx: number, cy: number, s?: number): DotDef => ({
  kind: "dot",
  c: [cx, cy],
  ...(s ? { s } : {}),
})

/** Pupil (round counter). */
export const H = (cx: number, cy: number, s?: number): HoleDef => ({
  kind: "hole",
  c: [cx, cy],
  ...(s ? { s } : {}),
})

/** Slot. */
export const L = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  s?: number,
): SlotDef => ({ kind: "slot", a: [ax, ay], b: [bx, by], ...(s ? { s } : {}) })
