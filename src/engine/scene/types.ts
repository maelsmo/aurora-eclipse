// Scene v3: a tree of nodes (letters, shapes, groups) stored as a flat array
// in pre-order (every subtree is contiguous), so z-order is the array order.
// Coordinates are in modules (m), y up; children are local to their group.
import { defaultAxes, type Axes } from "../axes"
import type { Op } from "../operators"
import { DEFAULT_TRACKING } from "../grid"

export const SCENE_VERSION = 3

export type MotionType = "none" | "orbit" | "drift" | "pendulum" | "breathe" | "follow" | "avoid"

export type Motion = {
  type: MotionType
  amount: number
  speed: number
  phase: number
  /** Sibling to orbit around (defaults to the sibling below). */
  target?: string
}

/* ---------- look: how an object is drawn ---------- */

export type LookMode = "fill" | "outline" | "lines" | "isolines" | "halftone"
export type ColorMode = "layer" | "aurora" | "depth"

/**
 * The per-object part of the material. Units:
 * - `line`, `spacing`, `dot` are world modules (they do not scale with the object);
 * - `stripes`, `stripeFill`, `inset` are glyph design units (they scale with it).
 */
export type Look = {
  mode: LookMode
  /** Outline and isoline thickness, world m. */
  line: number
  /** Isoline step, world m. */
  spacing: number
  /** Number of isolines on each side. */
  rings: number
  /** Halftone cell, world m. */
  dot: number
  /** "lines": stripes per design module. */
  stripes: number
  /** "lines": share of the stripe period that is inked, 0…1. */
  stripeFill: number
  /** Gap between the modules of a geometric glyph, design m. */
  inset: number
  colorMode: ColorMode
  /** Overrides the colour of every leaf below (a group colour). */
  tint?: string
}
export type LookPatch = Partial<Look>
export type LookKey = keyof Look

export const defaultLook: Look = {
  mode: "fill",
  line: 0.12,
  spacing: 0.35,
  rings: 6,
  dot: 0.28,
  stripes: 3,
  stripeFill: 0.5,
  inset: 0,
  colorMode: "layer",
}

/* ---------- scene-wide material ---------- */

export type Material = {
  aurora: [string, string, string]
  auroraScale: number
  auroraSpeed: number
  depthColor: string
  depth: number
  /** Penumbra: colour of overlaps inside a merge group. */
  overlap: number
  overlapColor: string
  glow: number
  glowSize: number
  glowColor: string
  shadow: number
  shadowX: number
  shadowY: number
  shadowSoft: number
  shadowColor: string
  grain: number
  background: string
  transparent: boolean
}

export const defaultMaterial: Material = {
  aurora: ["#7CF5C8", "#6C5CE7", "#FF6FB5"],
  auroraScale: 0.25,
  auroraSpeed: 0.3,
  depthColor: "#F2542D",
  depth: 0.8,
  overlap: 0,
  overlapColor: "#F2542D",
  glow: 0,
  glowSize: 1.2,
  glowColor: "#FFD29A",
  shadow: 0,
  shadowX: 0.4,
  shadowY: -0.4,
  shadowSoft: 0.6,
  shadowColor: "#000000",
  grain: 0,
  background: "#F4F1EA",
  transparent: false,
}

export type Warp = {
  wave: number
  waveFreq: number
  waveSpeed: number
  flow: number
  flowScale: number
  flowSpeed: number
  pointer: number
  pointerRadius: number
}

export const defaultWarp: Warp = {
  wave: 0,
  waveFreq: 0.6,
  waveSpeed: 0.5,
  flow: 0,
  flowScale: 0.35,
  flowSpeed: 0.3,
  pointer: 0,
  pointerRadius: 3,
}

/* ---------- signals and routes ---------- */

export type LfoShape = "sine" | "triangle" | "noise" | "pulse"
export type Lfo = { shape: LfoShape; rate: number; phase: number }

export const signalIds = [
  "lfo1",
  "lfo2",
  "lfo3",
  "lfo4",
  "pointerX",
  "pointerY",
  "pointerNear",
  "pointerSpeed",
  "pointerDown",
  "micLevel",
  "micLow",
  "micHigh",
] as const
export type SignalId = (typeof signalIds)[number]

export type Route = {
  id: string
  source: SignalId
  /**
   * "axes.weight", "warp.wave", "material.glow", "look.line", "scene.speed"
   * or "layer:<id>.<path>" — a path into the node: "x", "look.line", "shape.w"…
   */
  target: string
  amount: number
  /** Use 1 − signal (or −signal for bipolar signals). */
  invert?: boolean
  /** Gate: the route is on only while the signal is above the threshold (with hysteresis). */
  threshold?: number
}

export const defaultLfo: [Lfo, Lfo, Lfo, Lfo] = [
  { shape: "sine", rate: 0.2, phase: 0 },
  { shape: "noise", rate: 0.35, phase: 0 },
  { shape: "triangle", rate: 0.1, phase: 0 },
  { shape: "pulse", rate: 0.5, phase: 0 },
]

/* ---------- shapes ---------- */

export type ShapeKind = "rect" | "ellipse" | "polygon" | "star" | "line"
export const shapeKinds: ShapeKind[] = ["rect", "ellipse", "polygon", "star", "line"]

export type ShapeDef = {
  kind: ShapeKind
  /** Width and height, m (line: length and thickness). */
  w: number
  h: number
  /** Corner radius, m (rect corners, polygon / star rounding). */
  r: number
  /** Independent corner radii of a rect: top-left, top-right, bottom-right, bottom-left. */
  corners?: [number, number, number, number]
  /** Polygon sides / star points. */
  sides: number
  /** Star: inner radius as a share of the outer one. */
  inner: number
  /** Ellipse: swept angle, degrees (360 = full). */
  sweep: number
  /** Ellipse: inner radius as a share of the outer one (a ring when > 0). */
  hole: number
}

export const defaultShape: ShapeDef = { kind: "rect", w: 4, h: 4, r: 0, sides: 6, inner: 0.5, sweep: 360, hole: 0 }

/* ---------- nodes ---------- */

type NodeBase = {
  id: string
  /** Parent group id; undefined for the root level. */
  parent?: string
  name?: string
  visible: boolean
  locked?: boolean
  /** 0…1, multiplies down the tree. */
  opacity?: number
  flipX?: boolean
  flipY?: boolean
  x: number
  y: number
  scale: number
  rotation: number
  /** Operator with everything below, inside a merge group. */
  op: Op
  k: number
  gap: number
  t: number
  color: string
  look?: LookPatch
  motion: Motion
}

export type LetterNode = NodeBase & {
  type: "letter"
  char: string
  /** Glyph set; defaults to the scene set. */
  set?: string
  axes?: Partial<Axes>
}

export type ShapeNode = NodeBase & {
  type: "shape"
  shape: ShapeDef
}

export type GroupMode = "stack" | "merge"

export type GroupNode = NodeBase & {
  type: "group"
  /** stack: children are drawn independently; merge: they fold into one form with operators. */
  mode: GroupMode
  collapsed?: boolean
}

export type Layer = LetterNode | ShapeNode | GroupNode
export type NodeType = Layer["type"]
export type Leaf = LetterNode | ShapeNode

export const isLetter = (n: Layer | undefined | null): n is LetterNode => n?.type === "letter"
export const isShape = (n: Layer | undefined | null): n is ShapeNode => n?.type === "shape"
export const isGroup = (n: Layer | undefined | null): n is GroupNode => n?.type === "group"
export const isLeaf = (n: Layer | undefined | null): n is Leaf => n?.type === "letter" || n?.type === "shape"

/* ---------- artboard ---------- */

export type Artboard = {
  /** Show the frame on the canvas and use it for export. */
  enabled: boolean
  /** Size in modules and centre. */
  w: number
  h: number
  x: number
  y: number
}

export const defaultArtboard: Artboard = { enabled: false, w: 32, h: 18, x: 0, y: 0 }

/* ---------- scene ---------- */

export type Scene = {
  v: 3
  /** Default glyph set of letters. */
  set: string
  axes: Axes
  look: Look
  layers: Layer[]
  material: Material
  warp: Warp
  lfo: [Lfo, Lfo, Lfo, Lfo]
  routes: Route[]
  speed: number
  tracking: number
  artboard: Artboard
}

export const LIMITS = {
  nodes: 256,
  depth: 6,
  mergeChildren: 32,
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export const defaultMotion: Motion = { type: "none", amount: 0.5, speed: 0.3, phase: 0 }

export const inks = ["#161616", "#5B3CF5", "#F2542D", "#1E8C6E", "#2F80ED", "#E9B824"]

const base = (): Omit<NodeBase, "id"> => ({
  visible: true,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  op: "union",
  k: 0.6,
  gap: 0.2,
  t: 0.5,
  color: inks[0],
  motion: { ...defaultMotion },
})

export function makeLayer(char: string, over: Partial<LetterNode> = {}): LetterNode {
  return { id: uid(), ...base(), type: "letter", char, ...over } as LetterNode
}

export function makeShape(shape: Partial<ShapeDef> = {}, over: Partial<ShapeNode> = {}): ShapeNode {
  return { id: uid(), ...base(), type: "shape", shape: { ...defaultShape, ...shape }, ...over } as ShapeNode
}

export function makeGroup(mode: GroupMode, over: Partial<GroupNode> = {}): GroupNode {
  return { id: uid(), ...base(), type: "group", mode, ...over } as GroupNode
}

export function makeScene(over: Partial<Scene> = {}): Scene {
  return {
    v: 3,
    set: "main",
    axes: { ...defaultAxes },
    look: { ...defaultLook },
    layers: [],
    material: { ...defaultMaterial },
    warp: { ...defaultWarp },
    lfo: [{ ...defaultLfo[0] }, { ...defaultLfo[1] }, { ...defaultLfo[2] }, { ...defaultLfo[3] }],
    routes: [],
    speed: 1,
    tracking: DEFAULT_TRACKING,
    artboard: { ...defaultArtboard },
    ...over,
  }
}

/** A scene whose letters fold together in one merge group (the classic eclipse composition). */
export function mergeScene(leaves: Layer[], over: Partial<Scene> = {}, group: Partial<GroupNode> = {}): Scene {
  const g = makeGroup("merge", { name: "Сплав", ...group })
  return makeScene({ ...over, layers: leaves.length ? [g, ...leaves.map((l) => ({ ...l, parent: g.id }))] : [] })
}
