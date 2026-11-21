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

/** How a geometric module is drawn when its set fixes it (otherwise the look decides). */
export type PrimMode = "fill" | "lines" | "outline"
/**
 * Direction of stripes in "lines" mode: horizontal, vertical, arcs (concentric
 * around the module's round corner / centre) or contours (parallel to the edge).
 */
export type PrimDir = "h" | "v" | "arc" | "contour"

type GeoBase = {
  mode?: PrimMode
  dir?: PrimDir
  /** Cut-out: the module is subtracted from the glyph. */
  neg?: boolean
}

/**
 * Rectangle from corner `a` to corner `b` with a radius at every corner
 * (top-left, top-right, bottom-right, bottom-left): square, quarter or half
 * circle, full circle, leaf…
 */
export type BoxDef = GeoBase & { kind: "box"; a: Vec; b: Vec; r?: [number, number, number, number] }
export type EllipseDef = GeoBase & { kind: "ellipse"; c: Vec; rx: number; ry: number }
/** Disc sector or ring sector from a0 to a1 (degrees CCW); r0 > 0 makes a ring. */
export type SectorDef = GeoBase & { kind: "sector"; c: Vec; r: number; r0?: number; a0: number; a1: number }
/** Convex polygon of 3–4 points (triangles, wedges, parallelograms). */
export type PolyDef = GeoBase & { kind: "poly"; pts: Vec[] }

export type GeoDef = BoxDef | EllipseDef | SectorDef | PolyDef
export type PrimDef = StrokeDef | ArcDef | DotDef | HoleDef | SlotDef | GeoDef
export type PrimKind = PrimDef["kind"]
export const geoKinds = ["box", "ellipse", "sector", "poly"] as const
export const isGeo = (p: { kind: string }): p is GeoDef => (geoKinds as readonly string[]).includes(p.kind)

/** Construction points of a primitive (nodes the editor and the tests look at). */
export function primPoints(p: PrimDef): Vec[] {
  switch (p.kind) {
    case "stroke":
    case "slot":
    case "box":
      return [p.a, p.b]
    case "poly":
      return p.pts
    default:
      return [p.c]
  }
}

export function assertNever(x: never): never {
  throw new Error("Unexpected value: " + JSON.stringify(x))
}

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

/** Flags of a compiled geometric primitive. */
export type GeoFlags = {
  /** 0 = look decides, 1 fill, 2 lines, 3 outline. */
  mode: number
  /** 0 h, 1 v, 2 arc, 3 contour. */
  dir: number
  neg: boolean
}

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
  /** Centre, half size, corner radii (tl, tr, br, bl), stripe origin (design → deformed grid). */
  | ({ kind: "box"; c: Vec; h: Vec; r: [number, number, number, number] } & GeoFlags)
  | ({ kind: "ellipse"; c: Vec; rx: number; ry: number } & GeoFlags)
  /** Angles in radians; r0 = 0 for a disc sector. sx / sy stretch it with the width axis. */
  | ({ kind: "sector"; c: Vec; r: number; r0: number; a0: number; a1: number; sx: number; sy: number } & GeoFlags)
  | ({ kind: "poly"; pts: Vec[] } & GeoFlags)
  /** Regular polygon / star in a unit circle, stretched by (sx, sy), corners rounded by `round`. */
  | ({ kind: "ngon"; c: Vec; sides: number; inner: number; sx: number; sy: number; round: number } & GeoFlags)

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
  /** Rotation / scale centre; defaults to (box centre x, cap middle). Shapes use their own centre. */
  anchor?: Vec
}
