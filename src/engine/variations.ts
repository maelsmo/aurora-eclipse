// Generator of unexpected combinations: random scenes and mutations (seeded).
import { axisKeys, type Axes } from "./axes"
import type { Op } from "./operators"
import { axisParams } from "./params"
import { contexts, applyContext } from "./presets"
import { makeLayer, makeScene, uid, type Scene } from "./scene"
import { clamp } from "./sdf"

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Locks = { letters: boolean; combine: boolean; form: boolean; material: boolean }
export const noLocks: Locks = { letters: false, combine: false, form: false, material: false }

const comboOps: Op[] = ["fuse", "eclipse", "inlay", "cut", "xor", "intersect", "morph", "eclipse", "fuse"]

function gauss(r: () => number) {
  return (r() + r() + r() - 1.5) / 1.5
}

/** Random axes around the defaults. */
function jitterAxes(base: Axes, r: () => number, strength: number): Axes {
  const out = { ...base }
  for (const k of axisKeys) {
    if (k === "slant" && r() > 0.25) continue
    const d = axisParams[k]
    out[k] = clamp(base[k] + gauss(r) * (d.max - d.min) * 0.35 * strength, d.min, d.max)
  }
  return out
}

/** A fresh combination of 2–4 letters that actually interact. */
export function randomScene(seed: number, chars: string, current: Scene, locks: Locks): Scene {
  const r = rng(seed)
  const pick = <T,>(xs: readonly T[] | string) => xs[Math.floor(r() * xs.length)] as T
  const count = locks.letters ? current.layers.length : 2 + Math.floor(r() * r() * 3)
  const layers = Array.from({ length: Math.max(count, 1) }, (_, i) => {
    const prev = current.layers[i]
    const char = locks.letters && prev ? prev.char : pick<string>(chars)
    const x = (i - (count - 1) / 2) * (1.8 + r() * 2.2)
    const y = gauss(r) * 1.2
    const op: Op = locks.combine && prev ? prev.op : i === 0 ? "union" : pick(comboOps)
    return makeLayer(char, {
      x: locks.letters && prev ? prev.x : x,
      y: locks.letters && prev ? prev.y : y,
      rotation: !locks.letters && r() < 0.2 ? pick([90, -90, 180, 15, -15]) : prev?.rotation ?? 0,
      scale: !locks.letters && r() < 0.25 ? 0.6 + r() * 0.9 : prev?.scale ?? 1,
      op,
      k: locks.combine && prev ? prev.k : 0.2 + r() * 1.2,
      gap: locks.combine && prev ? prev.gap : 0.08 + r() * 0.35,
      t: locks.combine && prev ? prev.t : 0.3 + r() * 0.4,
      color: prev?.color ?? current.layers[0]?.color ?? "#161616",
    })
  })
  let scene = makeScene({
    ...current,
    layers,
    routes: [],
    axes: locks.form ? current.axes : jitterAxes(current.axes, r, 0.8),
  })
  if (!locks.material && r() < 0.5) scene = applyContext(scene, pick(contexts))
  else scene = { ...scene, material: current.material, layers: scene.layers.map((l, i) => ({ ...l, color: current.layers[i % Math.max(current.layers.length, 1)]?.color ?? l.color })) }
  return scene
}

/** Nudges the current scene: numbers move by `strength`, letters and ops sometimes swap. */
export function mutateScene(seed: number, chars: string, scene: Scene, strength: number, locks: Locks): Scene {
  const r = rng(seed)
  const s = strength
  const layers = scene.layers.map((l, i) => {
    const out = { ...l, id: uid() }
    if (!locks.letters) {
      if (r() < 0.3 * s) out.char = chars[Math.floor(r() * chars.length)]
      out.x += gauss(r) * 1.5 * s
      out.y += gauss(r) * 1.0 * s
      if (r() < 0.15 * s) out.rotation += gauss(r) * 45
    }
    if (!locks.combine && i > 0) {
      if (r() < 0.25 * s) out.op = comboOps[Math.floor(r() * comboOps.length)]
      out.k = clamp(out.k + gauss(r) * 0.6 * s, 0, 3)
      out.gap = clamp(out.gap + gauss(r) * 0.2 * s, -0.5, 1.5)
      out.t = clamp(out.t + gauss(r) * 0.3 * s, 0, 1)
    }
    return out
  })
  // Routes point at layer ids: carry them over to the new ids.
  const idMap = new Map(scene.layers.map((l, i) => [l.id, layers[i].id]))
  const routes = scene.routes.map((rt) => {
    const m = rt.target.match(/^layer:([^.]+)\.(.+)$/)
    return m && idMap.has(m[1]) ? { ...rt, target: `layer:${idMap.get(m[1])}.${m[2]}` } : rt
  })
  let next: Scene = {
    ...scene,
    layers,
    routes,
    axes: locks.form ? scene.axes : jitterAxes(scene.axes, r, s * 0.6),
  }
  if (!locks.material && r() < 0.2 * s) next = applyContext(next, contexts[Math.floor(r() * contexts.length)])
  return next
}
