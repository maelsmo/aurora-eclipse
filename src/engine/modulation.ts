// Turns the stored scene into the effective scene of one frame:
// modulation routes first, then layer motion.
import { paramDef, type LayerNumKey, type MaterialNumKey, type WarpKey } from "./params"
import type { AxisKey } from "./axes"
import type { Layer, Scene } from "./scene"
import type { Signals } from "./signals"
import { noise2 } from "./frame"
import { clamp } from "./sdf"

/** Base value + amount × range × signal, clamped to the parameter range. */
export function modulate(base: number, amount: number, signal: number, min: number, max: number) {
  return clamp(base + amount * (max - min) * signal, min, max)
}

export function applyRoutes(scene: Scene, signals: Signals): Scene {
  if (!scene.routes.length) return scene
  const s: Scene = {
    ...scene,
    axes: { ...scene.axes },
    warp: { ...scene.warp },
    material: { ...scene.material },
    layers: scene.layers.map((l) => ({ ...l, axes: l.axes ? { ...l.axes } : undefined })),
  }
  for (const r of scene.routes) {
    const def = paramDef(r.target)
    if (!def) continue
    const v = signals[r.source] ?? 0
    const [head, key] = r.target.split(".")
    if (head === "axes") {
      const k = key as AxisKey
      s.axes[k] = modulate(scene.axes[k], r.amount, v, def.min, def.max)
      // Layer overrides of the same axis move together with the global value.
      for (const l of s.layers)
        if (l.axes?.[k] !== undefined)
          l.axes[k] = modulate(l.axes[k]!, r.amount, v, def.min, def.max)
    } else if (head === "warp") {
      const k = key as WarpKey
      s.warp[k] = modulate(scene.warp[k], r.amount, v, def.min, def.max)
    } else if (head === "material") {
      const k = key as MaterialNumKey
      s.material[k] = modulate(scene.material[k], r.amount, v, def.min, def.max)
    } else if (head === "scene" && (key === "speed" || key === "tracking")) {
      s[key] = modulate(scene[key], r.amount, v, def.min, def.max)
    } else if (head.startsWith("layer:")) {
      const id = head.slice(6)
      const l = s.layers.find((x) => x.id === id)
      if (!l) continue
      const k = key as LayerNumKey
      // Position and rotation are offsets: they are not clamped to a range.
      if (k === "x" || k === "y" || k === "rotation")
        l[k] = l[k] + r.amount * (def.max - def.min) * 0.25 * v
      else l[k] = modulate(l[k], r.amount, v, def.min, def.max)
    }
  }
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

/** Per-layer physical state for pointer-driven motion. */
export type MotionState = Map<string, { x: number; y: number; vx: number; vy: number }>

export function applyMotion(
  scene: Scene,
  time: number,
  dt: number,
  pointer: [number, number] | null,
  state: MotionState,
): Scene {
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
        // Transit around another layer: an ellipse flattened by `amount`.
        const target = (m.target && base.get(m.target)) || scene.layers[i - 1]
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
          const px = pointer[0] - (l.x + st.x),
            py = pointer[1] - (l.y + st.y)
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
