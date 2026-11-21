// Effectors change clones: random (per clone), noise (smooth in space and
// time), wave (travelling across the layout) and field (around the pointer
// or the cloner centre). Each one moves, turns, scales, fades and tints by
// its weights; several effectors add up.
import type { Effector } from "./scene/types"
import { hash2, noise2 } from "./noise"

export type EffectorOut = { dx: number; dy: number; rotation: number; scale: number; opacity: number; tint: string | null; tintW: number }

export const noEffect = (): EffectorOut => ({ dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1, tint: null, tintW: 0 })

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Sums the effectors for one clone. `p` is the clone position in the group,
 * `world` its world position, `cell` the layout step (position weights are
 * in cells), `centre` the cloner centre in world, `pointer` the pointer in
 * world (null when absent).
 */
export function applyEffectors(
  effectors: Effector[],
  index: number,
  p: [number, number],
  world: [number, number],
  cell: number,
  time: number,
  centre: [number, number],
  pointer: [number, number] | null,
  out: EffectorOut = noEffect(),
): EffectorOut {
  for (const e of effectors) {
    if (!e.enabled || e.amount <= 0) continue
    let a: number, b: number, c: number, d: number // four signals in −1…1 (or 0…1 for the field)
    let ux = 0,
      uy = 0 // field push direction
    switch (e.kind) {
      case "random": {
        const r = (k: number) => hash2(index * 4 + k, e.seed * 131 + 7) * 2 - 1
        a = r(0)
        b = r(1)
        c = r(2)
        d = r(3)
        break
      }
      case "noise": {
        const t = time * e.speed
        const n = (k: number) => (noise2(p[0] * e.freq + k * 17.3 + t, p[1] * e.freq - k * 9.1 + e.seed) - 0.5) * 2
        a = n(0)
        b = n(1)
        c = n(2)
        d = n(3)
        break
      }
      case "wave": {
        const s = Math.sin((p[0] + p[1] * 0.5) * e.freq * Math.PI * 2 - time * e.speed * Math.PI * 2)
        a = 0
        b = s
        c = s
        d = s
        break
      }
      case "field": {
        const src = e.source === "pointer" ? pointer : centre
        if (!src) continue
        const dx = world[0] - src[0],
          dy = world[1] - src[1]
        const dist = Math.hypot(dx, dy)
        const f = 1 - smooth(0, e.radius, dist)
        if (f <= 0) continue
        ux = dist > 1e-6 ? dx / dist : 0
        uy = dist > 1e-6 ? dy / dist : 0
        a = b = c = d = f
        break
      }
    }
    const k = e.amount
    if (e.kind === "field") {
      out.dx += ux * a * e.position * cell * k
      out.dy += uy * a * e.position * cell * k
    } else {
      out.dx += a * e.position * cell * k
      out.dy += b * e.position * cell * k
    }
    out.rotation += c * e.rotation * 180 * k
    out.scale *= Math.max(0.02, 1 + d * e.scale * k)
    // Fading and tinting use the signal mapped to 0…1.
    const u = e.kind === "field" ? a : (d + 1) / 2
    out.opacity *= 1 - Math.max(0, Math.min(1, u * e.opacity * k))
    const w = Math.max(0, Math.min(1, u * e.color * k))
    if (w > 0) {
      out.tint = e.tint
      out.tintW = Math.max(out.tintW, w)
    }
  }
  return out
}
