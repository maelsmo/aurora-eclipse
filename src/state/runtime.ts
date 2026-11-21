// Live, non-React state: time, pointer, microphone, motion physics and the
// effective (modulated) scene of the current frame.
import { applyMotion, applyRoutes, type MotionState, type RouteState } from "@/engine/modulation"
import { emptySignals, lfoValue, MicInput, type Signals } from "@/engine/signals"
import { nearestDistance, type Frame } from "@/engine/frame"
import type { Scene } from "@/engine/scene"
import { clamp } from "@/engine/sdf"

class Runtime {
  /** Scene time in seconds (scaled by the tempo, frozen on pause). */
  time = 0
  pointerWorld: [number, number] | null = null
  pointerNorm: [number, number] = [0, 0]
  pointerDown = false
  pointerSpeed = 0
  private lastPointer: [number, number] | null = null
  mic = new MicInput()
  motion: MotionState = new Map()
  routes: RouteState = new Map()
  signals: Signals = emptySignals()
  effective: Scene | null = null
  /** Frame of the last draw (picking uses it so clicks hit what is visible). */
  frame: Frame | null = null
  private listeners = new Set<() => void>()
  /** Keeps the studio canvas drawing every frame (video recording). */
  keepAlive = false
  /** Requests a studio frame; set by the canvas. */
  kick: () => void = () => {}

  setPointer(world: [number, number] | null, norm: [number, number]) {
    if (world && this.lastPointer) {
      const d = Math.hypot(world[0] - this.lastPointer[0], world[1] - this.lastPointer[1])
      this.pointerSpeed = Math.min(1, this.pointerSpeed + d * 0.08)
    }
    this.lastPointer = world
    this.pointerWorld = world
    this.pointerNorm = norm
  }

  /** Advances time and resolves the effective scene. */
  step(scene: Scene, dt: number, playing: boolean, pointerOn: boolean): Scene {
    if (playing) this.time += dt * scene.speed
    this.pointerSpeed *= Math.exp(-dt * 4)
    this.mic.read(dt)
    const s = this.signals
    s.lfo1 = lfoValue(scene.lfo[0], this.time, 1)
    s.lfo2 = lfoValue(scene.lfo[1], this.time, 2)
    s.lfo3 = lfoValue(scene.lfo[2], this.time, 3)
    s.lfo4 = lfoValue(scene.lfo[3], this.time, 4)
    const p = pointerOn ? this.pointerWorld : null
    s.pointerX = p ? this.pointerNorm[0] : s.pointerX * Math.exp(-dt * 3)
    s.pointerY = p ? this.pointerNorm[1] : s.pointerY * Math.exp(-dt * 3)
    s.pointerDown = p && this.pointerDown ? 1 : 0
    s.pointerSpeed = p ? this.pointerSpeed : 0
    s.pointerNear = p && this.frame ? this.nearness(this.frame, p) : s.pointerNear * Math.exp(-dt * 3)
    s.micLevel = this.mic.level
    s.micLow = this.mic.low
    s.micHigh = this.mic.high
    let eff = applyRoutes(scene, s, this.routes)
    eff = applyMotion(eff, this.time, playing ? dt : 0, p, this.motion)
    this.effective = eff
    this.listeners.forEach((f) => f())
    return eff
  }

  private nearness(frame: Frame, p: [number, number]) {
    const d = nearestDistance(frame, p[0], p[1])
    return clamp(1 - Math.max(d, 0) / 4, 0, 1)
  }

  subscribe(f: () => void) {
    this.listeners.add(f)
    return () => {
      this.listeners.delete(f)
    }
  }
}

export const runtime = new Runtime()

/** Does the scene need continuous frames? */
export function isAnimated(scene: Scene, pointerOn: boolean, micOn: boolean) {
  const m = scene.material,
    w = scene.warp
  const aurora = scene.look.colorMode === "aurora" || scene.layers.some((l) => l.look?.colorMode === "aurora")
  return (
    scene.routes.length > 0 ||
    scene.layers.some((l) => l.motion.type !== "none") ||
    w.wave > 0 ||
    w.flow > 0 ||
    (pointerOn && w.pointer !== 0) ||
    (aurora && m.auroraSpeed > 0) ||
    m.grain > 0 ||
    micOn
  )
}
