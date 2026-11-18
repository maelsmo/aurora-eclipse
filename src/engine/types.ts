// Shared geometry types. All coordinates are in modules (m), y grows upwards,
// the baseline is y = 0 and the cap height is y = 5.

export type Vec = [number, number]

/** How a stroke end behaves at a junction. "auto" applies the overshoot rule. */
export type EndMode = "auto" | "flush"

export type StrokeDef = {
  kind: "stroke"
  a: Vec
  b: Vec
  /** Thickness multiplier relative to the weight axis. */
  w?: number
  ends?: [EndMode, EndMode]
}
export type ArcDef = {
  kind: "arc"
  c: Vec
  /** Centre-line radius in modules. */
  r: number
  /** Start and end angles in degrees, counter-clockwise from +x. */
  a0: number
  a1: number
  w?: number
}
/** A detached positive disc: the "satellite". */
export type DotDef = { kind: "dot"; c: Vec; s?: number }
/** A negative disc: the round counter ("pupil"). */
export type HoleDef = { kind: "hole"; c: Vec; s?: number }
/** A negative capsule: a slot cut out of the body. */
export type SlotDef = { kind: "slot"; a: Vec; b: Vec; s?: number }

export type PrimDef = StrokeDef | ArcDef | DotDef | HoleDef | SlotDef
export type PrimKind = PrimDef["kind"]

export type GlyphDef = {
  /**
   * Design width of the glyph box in modules (stroke centres sit 0.5 inside).
   * Omitted for aliases, which inherit it from the base glyph.
   */
  adv?: number
  prims: PrimDef[]
  /** Optional base glyph whose modules are drawn first (Ё = E + satellites). */
  base?: string
}

export type Alphabet = Record<string, GlyphDef>

/** A primitive after compilation: absolute geometry for one set of axes. */
export type CompiledPrim =
  | { kind: "stroke"; a: Vec; b: Vec; r: number; round: number }
  | {
      kind: "arc"
      c: Vec
      r: number
      /** Stretch of the arc along x and y (ellipse from axes width / height). */
      sx: number
      sy: number
      /** Radians, CCW. */
      a0: number
      a1: number
      half: number
      round: number
    }
  | { kind: "dot"; c: Vec; r: number }
  | { kind: "hole"; c: Vec; r: number }
  | { kind: "slot"; a: Vec; b: Vec; r: number }

export type Box = { x0: number; y0: number; x1: number; y1: number }

export type CompiledGlyph = {
  prims: CompiledPrim[]
  /** Tight bounds of the positive shape (before ink offset). */
  box: Box
  fillet: number
  cutK: number
  attract: number
  ink: number
  /** tan(slant): the domain is sheared around the middle line. */
  shear: number
}
