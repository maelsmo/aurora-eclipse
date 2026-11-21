// Turns the stored scene into the effective scene of one frame:
// modulation routes first, then motion. Nothing in the stored scene is mutated.
import { paramDef, parseTarget, readNodeParam, readPath, writePath, type ParamDef } from "./params"
import type { AxisKey } from "./axes"
import type { Layer, Route, Scene } from "./scene/types"
import { parentXf, xfApply, xfInvert } from "./scene/tree"
import { signalInfo, type Signals } from "./signals"
import { noise2 } from "./frame"
import { clamp } from "./sdf"

/** Base value + amount × range × signal, clamped to the parameter range. */
export function modulate(base: number, amount: number, signal: number, min: number, max: number) {
  return clamp(base + amount * (max - min) * signal, min, max)
}

/** Applies one route contribution according to the parameter mode. */
function apply(def: ParamDef, base: number, amount: number, v: number) {
  if (def.mode === "offset") return base + amount * (def.max - def.min) * 0.25 * v
  return modulate(base, amount, v, def.min, def.max)
}

/** Per-route memory: gates with hysteresis. */
export type RouteState = Map<string, boolean>

const HYSTERESIS = 0.05

/** Signal value of a route after inversion and the threshold gate. */
export function routeSignal(r: Route, signals: Signals, state?: RouteState) {
  let v = signals[r.source] ?? 0
  if (r.invert) v = signalInfo[r.source].bipolar ? -v : 1 - v
  if (r.threshold === undefined) return v
  const was = state?.get(r.id) ?? false
  const on = was ? v > r.threshold - HYSTERESIS : v > r.threshold + HYSTERESIS
  state?.set(r.id, on)
  return on ? 1 : 0
}

export function applyRoutes(scene: Scene, signals: Signals, state?: RouteState): Scene {
  if (!scene.routes.length) return scene
  const s: Scene = {
    ...scene,
    axes: { ...scene.axes },
    warp: { ...scene.warp },
    material: { ...scene.material },
    look: { ...scene.look },
  }
  let layers: Layer[] | null = null
  const index = new Map(scene.layers.map((l, i) => [l.id, i]))
  for (const r of scene.routes) {
    const def = paramDef(r.target)
    const t = parseTarget(r.target)
    if (!def || !t) continue
    const v = routeSignal(r, signals, state)
    if (t.scope === "node") {
      const i = index.get(t.id)
      if (i === undefined) continue
      layers ??= [...scene.layers]
      const n = layers[i]
      const base = readNodeParam(s, n, t.path)
      if (base === undefined) continue
      layers[i] = writePath(n, t.path, apply(def, base, r.amount, v))
      continue
    }
    if (t.scope === "scene") {
      const k = t.path[0]
      if (k === "speed" || k === "tracking") s[k] = apply(def, scene[k], r.amount, v)
      continue
    }
    const base = readPath(s[t.scope], t.path)
    if (base === undefined) continue
    const next = apply(def, base, r.amount, v)
    if (t.scope === "axes") {
      const k = t.path[0] as AxisKey
      s.axes[k] = next
      // Letter overrides of the same axis move together with the global value.
      layers ??= [...scene.layers]
      layers = layers.map((l) =>
        l.type === "letter" && l.axes?.[k] !== undefined ? { ...l, axes: { ...l.axes, [k]: apply(def, l.axes[k]!, r.amount, v) } } : l,
      )
    } else (s[t.scope] as Record<string, unknown>)[t.path[0]] = next
  }
  if (layers) s.layers = layers
  return s
}

export const motionNames: Record<Layer["motion"]["type"], string> = {
  none: "Без движения",
  orbit: "Орбита",
  drift: "Дрейф",
  pendulum: "Маятник",
  breathe: "Дыхание",
  follow: "За курсором",
  avoid: "Избегать курсора",
}

/** Per-node physical state for pointer-driven motion. */
export type MotionState = Map<string, { x: number; y: number; vx: number; vy: number }>

/**
 * Motion of every node in its parent's coordinates. Orbit circles a sibling
 * (the one below by default); follow / avoid see the pointer through the
 * inverse parent transform.
 */
export function applyMotion(scene: Scene, time: number, dt: number, pointer: [number, number] | null, state: MotionState): Scene {
  if (!scene.layers.some((l) => l.motion.type !== "none")) {
    state.clear()
    return scene
  }
  const base = new Map(scene.layers.map((l) => [l.id, l]))
  const layers = scene.layers.map((l, i) => {
    const m = l.motion
    if (m.type === "none") return l
    const w = time * m.speed * Math.PI * 2 + m.phase * Math.PI * 2
    const out = { ...l }
    switch (m.type) {
      case "orbit": {
        // Transit around a sibling: an ellipse flattened by `amount`.
        const t = m.target ? base.get(m.target) : undefined
        let target = t && t.parent === l.parent ? t : undefined
        if (!target)
          for (let j = i - 1; j >= 0; j--)
            if (scene.layers[j].parent === l.parent) {
              target = scene.layers[j]
              break
            }
        const cx = target ? target.x : l.x,
          cy = target ? target.y : l.y
        const rx = target ? Math.hypot(l.x - cx, l.y - cy) || 3 : 3
        const a0 = target ? Math.atan2(l.y - cy, l.x - cx) : 0
        const ca = Math.cos(a0),
          sa = Math.sin(a0)
        const ex = Math.cos(w) * rx,
          ey = Math.sin(w) * rx * m.amount
        out.x = cx + ca * ex - sa * ey
        out.y = cy + sa * ex + ca * ey
        break
      }
      case "drift": {
        const seed = i * 7.31
        out.x += (noise2(time * m.speed + seed, 1.7) - 0.5) * 4 * m.amount
        out.y += (noise2(time * m.speed + seed, 9.2) - 0.5) * 4 * m.amount
        out.rotation += (noise2(time * m.speed * 0.7 + seed, 4.4) - 0.5) * 40 * m.amount
        break
      }
      case "pendulum":
        out.rotation += Math.sin(w) * 35 * m.amount
        break
      case "breathe":
        out.scale *= 1 + Math.sin(w) * 0.25 * m.amount
        break
      case "follow":
      case "avoid": {
        let st = state.get(l.id)
        if (!st) {
          st = { x: 0, y: 0, vx: 0, vy: 0 }
          state.set(l.id, st)
        }
        let fx = -st.x * 8,
          fy = -st.y * 8
        if (pointer) {
          const local = l.parent ? xfApply(xfInvert(parentXf(scene.layers, l.id)), pointer[0], pointer[1]) : pointer
          const px = local[0] - (l.x + st.x),
            py = local[1] - (l.y + st.y)
          const dist = Math.hypot(px, py) || 1
          if (m.type === "follow") {
            fx += px * 6 * m.amount
            fy += py * 6 * m.amount
          } else if (dist < 6) {
            const push = ((6 - dist) / 6) * 60 * m.amount
            fx -= (px / dist) * push
            fy -= (py / dist) * push
          }
        }
        const k = Math.min(dt, 0.05)
        const speed = 0.5 + m.speed * 2
        st.vx = (st.vx + fx * k * speed) * Math.exp(-k * 6)
        st.vy = (st.vy + fy * k * speed) * Math.exp(-k * 6)
        st.x += st.vx * k
        st.y += st.vy * k
        out.x += st.x
        out.y += st.y
        break
      }
    }
    return out
  })
  return { ...scene, layers }
}
