// Validation of stored and imported scenes: per-type validators with ranges.
// Nothing valid is dropped silently: an unknown set falls back to the scene
// set, a letter missing from its set stays (and is drawn from a fallback set
// if possible), a broken tree is repaired. sanitize(sanitize(x)) = sanitize(x).
import { axisKeys, defaultAxes, type Axes } from "../axes"
import { ops, type Op } from "../operators"
import { axisParams } from "../params"
import { migrateScene } from "./migrate"
import { normalize } from "./tree"
import {
  defaultArtboard,
  defaultLfo,
  defaultLook,
  defaultMaterial,
  defaultMotion,
  defaultShape,
  defaultWarp,
  inks,
  LIMITS,
  makeScene,
  shapeKinds,
  signalIds,
  uid,
  type Artboard,
  type Layer,
  type Lfo,
  type Look,
  type LookPatch,
  type Material,
  type Motion,
  type Route,
  type Scene,
  type ShapeDef,
  type Warp,
} from "./types"

type Raw = Record<string, unknown>

export type SanitizeContext = {
  /** Ids of the glyph sets that exist. */
  sets: readonly string[]
  /** Set used when a scene names none or an unknown one. */
  fallbackSet: string
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
export const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)

const num = (v: unknown, def: number, min: number, max: number) => (isNum(v) ? Math.min(max, Math.max(min, v)) : def)
const color = (v: unknown, def: string) => (isColor(v) ? v : def)
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def)

/* ---------- ranges ---------- */

const R = {
  pos: [-1000, 1000],
  scale: [0.05, 20],
  rotation: [-3600, 3600],
  k: [0, 3],
  gap: [-0.5, 1.5],
  t: [0, 1],
  opacity: [0, 1],
} as const

const lookRanges: Record<Exclude<keyof Look, "mode" | "colorMode" | "tint">, [number, number]> = {
  line: [0.005, 2],
  spacing: [0.02, 3],
  rings: [1, 40],
  dot: [0.02, 2],
  stripes: [0.5, 12],
  stripeFill: [0.05, 0.95],
  inset: [0, 0.5],
}
const lookModes = ["fill", "outline", "lines", "isolines", "halftone"] as const
const colorModes = ["layer", "aurora", "depth"] as const

export function sanitizeLook(raw: unknown): Look {
  return { ...defaultLook, ...sanitizeLookPatch(raw) }
}

export function sanitizeLookPatch(raw: unknown): LookPatch {
  if (!isObj(raw)) return {}
  const out: LookPatch = {}
  if (raw.mode !== undefined) out.mode = oneOf(raw.mode, lookModes, "fill")
  if (raw.colorMode !== undefined) out.colorMode = oneOf(raw.colorMode, colorModes, "layer")
  if (isColor(raw.tint)) out.tint = raw.tint
  for (const [k, [min, max]] of Object.entries(lookRanges))
    if (isNum(raw[k])) (out as Record<string, number>)[k] = Math.min(max, Math.max(min, raw[k] as number))
  return out
}

const materialRanges: Partial<Record<keyof Material, [number, number]>> = {
  auroraScale: [0.01, 5],
  auroraSpeed: [0, 5],
  depth: [0.01, 5],
  overlap: [0, 1],
  glow: [0, 3],
  glowSize: [0.05, 10],
  shadow: [0, 1],
  shadowX: [-10, 10],
  shadowY: [-10, 10],
  shadowSoft: [0, 5],
  grain: [0, 1],
}

function sanitizeMaterial(raw: unknown): Material {
  const m = { ...defaultMaterial, aurora: [...defaultMaterial.aurora] as Material["aurora"] }
  if (!isObj(raw)) return m
  const mm = m as unknown as Record<string, number>
  for (const [k, [min, max]] of Object.entries(materialRanges)) mm[k] = num(raw[k], mm[k], min, max)
  for (const k of ["depthColor", "overlapColor", "glowColor", "shadowColor", "background"] as const) m[k] = color(raw[k], m[k])
  if (Array.isArray(raw.aurora) && raw.aurora.length === 3 && raw.aurora.every(isColor)) m.aurora = [...raw.aurora] as Material["aurora"]
  if (typeof raw.transparent === "boolean") m.transparent = raw.transparent
  return m
}

const warpRanges: Record<keyof Warp, [number, number]> = {
  wave: [0, 5],
  waveFreq: [0.01, 10],
  waveSpeed: [0, 10],
  flow: [0, 5],
  flowScale: [0.01, 5],
  flowSpeed: [0, 10],
  pointer: [-0.95, 0.95],
  pointerRadius: [0.1, 40],
}

function sanitizeWarp(raw: unknown): Warp {
  const w = { ...defaultWarp }
  if (!isObj(raw)) return w
  for (const [k, [min, max]] of Object.entries(warpRanges)) (w as Record<string, number>)[k] = num(raw[k], w[k as keyof Warp], min, max)
  return w
}

function sanitizeAxes(raw: unknown, partial: true): Partial<Axes> | undefined
function sanitizeAxes(raw: unknown, partial: false): Axes
function sanitizeAxes(raw: unknown, partial: boolean): Partial<Axes> | Axes | undefined {
  const out: Partial<Axes> = partial ? {} : { ...defaultAxes }
  if (isObj(raw))
    for (const k of axisKeys) {
      const d = axisParams[k]
      // Generous bounds: routes and older files may sit slightly outside the slider range.
      const span = d.max - d.min
      if (isNum(raw[k])) out[k] = Math.min(d.max + span, Math.max(d.min - span, raw[k] as number))
    }
  if (partial) return Object.keys(out).length ? out : undefined
  return out as Axes
}

function sanitizeMotion(raw: unknown): Motion {
  const m = { ...defaultMotion }
  if (!isObj(raw)) return m
  m.type = oneOf(raw.type, ["none", "orbit", "drift", "pendulum", "breathe", "follow", "avoid"] as const, "none")
  m.amount = num(raw.amount, m.amount, 0, 1)
  m.speed = num(raw.speed, m.speed, 0, 10)
  m.phase = num(raw.phase, m.phase, 0, 1)
  if (typeof raw.target === "string") m.target = raw.target
  return m
}

export function sanitizeShape(raw: unknown): ShapeDef {
  const s = { ...defaultShape }
  if (!isObj(raw)) return s
  s.kind = oneOf(raw.kind, shapeKinds, "rect")
  s.w = num(raw.w, s.w, 0.05, 400)
  s.h = num(raw.h, s.h, 0.02, 400)
  s.r = num(raw.r, s.r, 0, 200)
  s.sides = Math.round(num(raw.sides, s.sides, 3, 24))
  s.inner = num(raw.inner, s.inner, 0.05, 1)
  s.sweep = num(raw.sweep, s.sweep, 1, 360)
  s.hole = num(raw.hole, s.hole, 0, 0.98)
  if (Array.isArray(raw.corners) && raw.corners.length === 4 && raw.corners.every(isNum))
    s.corners = raw.corners.map((v) => Math.min(200, Math.max(0, v as number))) as ShapeDef["corners"]
  return s
}

function sanitizeArtboard(raw: unknown): Artboard {
  const a = { ...defaultArtboard }
  if (!isObj(raw)) return a
  if (typeof raw.enabled === "boolean") a.enabled = raw.enabled
  a.w = num(raw.w, a.w, 1, 1000)
  a.h = num(raw.h, a.h, 1, 1000)
  a.x = num(raw.x, a.x, ...R.pos)
  a.y = num(raw.y, a.y, ...R.pos)
  return a
}

/** One node; null when it is not a node at all. */
function sanitizeNode(raw: unknown, ctx: SanitizeContext): Layer | null {
  if (!isObj(raw)) return null
  const type = raw.type === "group" || raw.type === "shape" ? raw.type : raw.type === undefined || raw.type === "letter" ? "letter" : null
  if (!type) return null
  const base = {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 64) : uid(),
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    x: num(raw.x, 0, ...R.pos),
    y: num(raw.y, 0, ...R.pos),
    scale: num(raw.scale, 1, ...R.scale),
    rotation: num(raw.rotation, 0, ...R.rotation),
    op: oneOf<Op>(raw.op, ops, "union"),
    k: num(raw.k, 0.6, ...R.k),
    gap: num(raw.gap, 0.2, ...R.gap),
    t: num(raw.t, 0.5, ...R.t),
    color: color(raw.color, inks[0]),
    motion: sanitizeMotion(raw.motion),
  } as Layer
  if (typeof raw.parent === "string") base.parent = raw.parent
  if (typeof raw.name === "string" && raw.name.trim()) base.name = raw.name.slice(0, 64)
  if (raw.locked === true) base.locked = true
  if (isNum(raw.opacity) && raw.opacity < 1) base.opacity = num(raw.opacity, 1, ...R.opacity)
  if (raw.flipX === true) base.flipX = true
  if (raw.flipY === true) base.flipY = true
  const look = sanitizeLookPatch(raw.look)
  if (Object.keys(look).length) base.look = look
  if (type === "letter") {
    const n = base as Extract<Layer, { type: "letter" }>
    n.type = "letter"
    // A single code point; junk becomes the fallback letter.
    n.char = typeof raw.char === "string" && [...raw.char].length === 1 ? raw.char : "A"
    if (typeof raw.set === "string" && ctx.sets.includes(raw.set)) n.set = raw.set
    const axes = sanitizeAxes(raw.axes, true)
    if (axes) n.axes = axes
    return n
  }
  if (type === "shape") {
    const n = base as Extract<Layer, { type: "shape" }>
    n.type = "shape"
    n.shape = sanitizeShape(raw.shape)
    return n
  }
  const g = base as Extract<Layer, { type: "group" }>
  g.type = "group"
  g.mode = raw.mode === "merge" ? "merge" : "stack"
  if (raw.collapsed === true) g.collapsed = true
  return g
}

function sanitizeRoute(raw: unknown): Route | null {
  if (!isObj(raw)) return null
  if (!(signalIds as readonly string[]).includes(raw.source as string)) return null
  if (typeof raw.target !== "string" || !raw.target) return null
  if (!isNum(raw.amount)) return null
  const r: Route = {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    source: raw.source as Route["source"],
    target: raw.target,
    amount: Math.min(4, Math.max(-4, raw.amount)),
  }
  if (raw.invert === true) r.invert = true
  if (isNum(raw.threshold)) r.threshold = Math.min(1, Math.max(-1, raw.threshold))
  return r
}

function sanitizeLfo(raw: unknown, def: Lfo): Lfo {
  if (!isObj(raw)) return { ...def }
  return {
    shape: oneOf(raw.shape, ["sine", "triangle", "noise", "pulse"] as const, def.shape),
    rate: num(raw.rate, def.rate, 0, 20),
    phase: num(raw.phase, def.phase, 0, 1),
  }
}

/**
 * Validates any stored scene (v2 or v3) into a v3 scene, or null when the
 * input is not a scene.
 */
export function sanitizeScene(input: unknown, ctx: SanitizeContext): Scene | null {
  const raw = migrateScene(input, ctx.fallbackSet)
  if (!raw || !Array.isArray(raw.layers)) return null
  const scene = makeScene()
  scene.set = typeof raw.set === "string" && ctx.sets.includes(raw.set) ? raw.set : ctx.fallbackSet
  scene.axes = sanitizeAxes(raw.axes, false)
  scene.look = sanitizeLook(raw.look)
  scene.material = sanitizeMaterial(raw.material)
  scene.warp = sanitizeWarp(raw.warp)
  if (Array.isArray(raw.lfo)) scene.lfo = defaultLfo.map((d, i) => sanitizeLfo((raw.lfo as unknown[])[i], d)) as Scene["lfo"]
  scene.speed = num(raw.speed, 1, 0, 10)
  scene.tracking = num(raw.tracking, scene.tracking, -10, 10)
  scene.artboard = sanitizeArtboard(raw.artboard)
  const nodes = raw.layers
    .slice(0, LIMITS.nodes * 2)
    .map((n) => sanitizeNode(n, ctx))
    .filter((n): n is Layer => !!n)
  scene.layers = normalize(nodes)
  if (Array.isArray(raw.routes)) scene.routes = raw.routes.map(sanitizeRoute).filter((r): r is Route => !!r).slice(0, 512)
  return scene
}
