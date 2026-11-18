// Scene model: font axes, a stack of letter layers, material, deformations
// and modulation routes.
import { defaultAxes, axisKeys, type Axes } from "./axes"
import { ops, type Op } from "./operators"
import { DEFAULT_TRACKING, CAP } from "./grid"
import type { Alphabet } from "./types"
import { compileGlyph } from "./compile"

export type MotionType =
  | "none"
  | "orbit"
  | "drift"
  | "pendulum"
  | "breathe"
  | "follow"
  | "avoid"

export type Motion = {
  type: MotionType
  amount: number
  speed: number
  phase: number
  /** Layer to orbit around (defaults to the layer below). */
  target?: string
}

export type Layer = {
  id: string
  char: string
  x: number
  y: number
  scale: number
  rotation: number
  op: Op
  k: number
  gap: number
  t: number
  color: string
  axes?: Partial<Axes>
  motion: Motion
  visible: boolean
}

export type FillMode = "fill" | "outline" | "isolines" | "halftone"
export type ColorMode = "layer" | "aurora" | "depth"

export type Material = {
  fill: FillMode
  line: number
  spacing: number
  rings: number
  dot: number
  colorMode: ColorMode
  aurora: [string, string, string]
  auroraScale: number
  auroraSpeed: number
  depthColor: string
  depth: number
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

export type LfoShape = "sine" | "triangle" | "noise" | "pulse"
export type Lfo = { shape: LfoShape; rate: number; phase: number }

export const signalIds = [
  "lfo1",
  "lfo2",
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
  /** "axes.weight", "warp.wave", "material.glow" or "layer:<id>.x" */
  target: string
  amount: number
}

export type Scene = {
  v: 2
  axes: Axes
  layers: Layer[]
  material: Material
  warp: Warp
  lfo: [Lfo, Lfo]
  routes: Route[]
  speed: number
  tracking: number
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export const defaultMotion: Motion = { type: "none", amount: 0.5, speed: 0.3, phase: 0 }

export const defaultMaterial: Material = {
  fill: "fill",
  line: 0.12,
  spacing: 0.35,
  rings: 6,
  dot: 0.28,
  colorMode: "layer",
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

export const defaultLfo: [Lfo, Lfo] = [
  { shape: "sine", rate: 0.2, phase: 0 },
  { shape: "noise", rate: 0.35, phase: 0 },
]

export const inks = ["#161616", "#5B3CF5", "#F2542D", "#1E8C6E", "#2F80ED", "#E9B824"]

export function makeLayer(char: string, over: Partial<Layer> = {}): Layer {
  return {
    id: uid(),
    char,
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
    visible: true,
    ...over,
  }
}

export function makeScene(over: Partial<Scene> = {}): Scene {
  return {
    v: 2,
    axes: { ...defaultAxes },
    layers: [],
    material: { ...defaultMaterial },
    warp: { ...defaultWarp },
    lfo: [{ ...defaultLfo[0] }, { ...defaultLfo[1] }],
    routes: [],
    speed: 1,
    tracking: DEFAULT_TRACKING,
    ...over,
  }
}

/** Horizontal anchor of a glyph: centre of its tight bounds; vertical: mid-cap. */
export function glyphAnchor(
  char: string,
  alphabet: Alphabet,
  axes: Axes,
  revision = 0,
): [number, number] {
  const g = compileGlyph(char, alphabet, axes, revision)
  return [(g.box.x0 + g.box.x1) / 2, CAP / 2]
}

/** Lays text out as layers. Lines are 7 modules apart; spaces are 2 modules. */
export function layoutText(
  text: string,
  alphabet: Alphabet,
  axes: Axes,
  tracking: number,
  base: Partial<Layer> = {},
  revision = 0,
): Layer[] {
  const lines = text.split("\n")
  const out: Layer[] = []
  const lineHeight = CAP + 2
  lines.forEach((line, li) => {
    const row: Layer[] = []
    let pen = 0
    for (const raw of line) {
      const c = raw.toLocaleUpperCase("ru")
      if (c === " ") {
        pen += 2
        continue
      }
      if (!(c in alphabet)) continue
      const g = compileGlyph(c, alphabet, axes, revision)
      const w = g.box.x1 - g.box.x0
      row.push(makeLayer(c, { ...base, x: pen + w / 2 }))
      pen += w + tracking
    }
    const total = pen - tracking
    const y = ((lines.length - 1) / 2 - li) * lineHeight
    for (const l of row) out.push({ ...l, x: l.x - total / 2, y })
  })
  return out
}

/* ---------- validation of stored / imported scenes ---------- */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)

function pick<T extends object>(base: T, raw: unknown): T {
  if (!raw || typeof raw !== "object") return { ...base }
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(base)) {
    const r = (raw as Record<string, unknown>)[k]
    if (r === undefined) continue
    if (typeof v === "number" && isNum(r)) out[k] = r
    else if (typeof v === "string" && typeof r === "string")
      out[k] = v.startsWith("#") ? (isColor(r) ? r : v) : r
    else if (typeof v === "boolean" && typeof r === "boolean") out[k] = r
    else if (Array.isArray(v) && Array.isArray(r) && r.length === v.length)
      out[k] = r.every(isColor) ? [...r] : v
  }
  return out as T
}

export function sanitizeScene(raw: unknown, alphabet: Alphabet): Scene | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Record<string, unknown>
  if (!Array.isArray(s.layers)) return null
  const scene = makeScene()
  scene.axes = pick(defaultAxes, s.axes)
  scene.material = pick(defaultMaterial, s.material)
  scene.warp = pick(defaultWarp, s.warp)
  if (Array.isArray(s.lfo) && s.lfo.length === 2)
    scene.lfo = [pick(defaultLfo[0], s.lfo[0]), pick(defaultLfo[1], s.lfo[1])]
  if (isNum(s.speed)) scene.speed = s.speed
  if (isNum(s.tracking)) scene.tracking = s.tracking
  scene.layers = s.layers
    .filter(
      (l): l is Record<string, unknown> =>
        !!l && typeof l === "object" && typeof l.char === "string" && l.char in alphabet,
    )
    .slice(0, 32)
    .map((l) => {
      const layer = pick(makeLayer(l.char as string), l)
      layer.id = typeof l.id === "string" ? l.id : uid()
      if (!ops.includes(layer.op)) layer.op = "union"
      layer.motion = pick(defaultMotion, l.motion)
      if (typeof (l.motion as Motion | undefined)?.target === "string")
        layer.motion.target = (l.motion as Motion).target
      if (l.axes && typeof l.axes === "object") {
        const ax: Partial<Axes> = {}
        for (const k of axisKeys) {
          const v = (l.axes as Record<string, unknown>)[k]
          if (isNum(v)) ax[k] = v
        }
        if (Object.keys(ax).length) layer.axes = ax
      }
      return layer
    })
  if (Array.isArray(s.routes))
    scene.routes = s.routes
      .filter(
        (r): r is Route =>
          !!r &&
          typeof r === "object" &&
          (signalIds as readonly string[]).includes((r as Route).source) &&
          typeof (r as Route).target === "string" &&
          isNum((r as Route).amount),
      )
      .map((r) => ({ id: typeof r.id === "string" ? r.id : uid(), source: r.source, target: r.target, amount: r.amount }))
  return scene
}
