// Rigid-body physics of a frame (matter-js, loaded on demand). Every draw
// item — a letter, a shape, a clone or a merge group — becomes one body; the
// simulation owns their placement and writes it back into the frame layers
// after every build. 1 module = 40 matter units; fixed 1/60 s steps in two
// substeps, so a given scene always plays the same.
import type MatterNS from "matter-js"
import type { Frame, FrameItem, FrameLayer } from "./frame"
import { layerBounds, layerToWorld } from "./frame"
import { noise2 } from "./noise"
import type { Artboard, Physics } from "./scene/types"
import type { Xf } from "./scene/tree"

export type MatterLib = typeof MatterNS

export const UNIT = 40
export const STEP = 1000 / 60
export const SUBSTEPS = 2

let lib: MatterLib | null = null
let loading: Promise<MatterLib> | null = null

/** matter-js, imported on first use (it stays out of the main bundle). */
export function loadMatter(): Promise<MatterLib> {
  if (lib) return Promise.resolve(lib)
  loading ??= import("matter-js").then((m) => (lib = ((m as { default?: MatterLib }).default ?? m) as MatterLib))
  return loading
}
export const matterLoaded = () => lib

/** A layer pinned to its body: offset and turn in the body's frame. */
type Pin = { rx: number; ry: number; cos: number; sin: number }
type Entry = { body: MatterNS.Body; pins: Pin[]; seen: number; static: boolean; x0: number; y0: number; a0: number }

const toM = (x: number, y: number) => ({ x: x * UNIT, y: -y * UNIT })

/** World box and angle of an item's body: the glyph box of a single layer, the union box otherwise. */
function itemShape(item: FrameItem) {
  if (item.layers.length === 1) {
    const l = item.layers[0]
    const g = l.glyph.box
    const [cx, cy] = layerToWorld(l, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2)
    return { cx, cy, w: (g.x1 - g.x0) * l.scale, h: (g.y1 - g.y0) * l.scale, angle: Math.atan2(l.sin, l.cos) }
  }
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const l of item.layers) {
    const b = layerBounds(l)
    x0 = Math.min(x0, b.x0)
    y0 = Math.min(y0, b.y0)
    x1 = Math.max(x1, b.x1)
    y1 = Math.max(y1, b.y1)
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, angle: 0 }
}

export type PhysicsInput = {
  /** Pointer in world units, or null outside the canvas. */
  pointer: [number, number] | null
  /** Ids of locked nodes: their items become static supports. */
  locked: Set<string>
}

export class PhysicsWorld {
  readonly M: MatterLib
  readonly engine: MatterNS.Engine
  private entries = new Map<string, Entry>()
  private walls: MatterNS.Body[] = []
  private wallKey = ""
  private acc = 0
  private tick = 0
  /** Simulated time, seconds. */
  time = 0

  constructor(M: MatterLib) {
    this.M = M
    this.engine = M.Engine.create({ enableSleeping: false })
    this.engine.positionIterations = 8
    this.engine.velocityIterations = 6
  }

  get bodyCount() {
    return this.entries.size
  }

  /** Forgets every body: the next sync starts from the frame as built. */
  reset() {
    const { Composite } = this.M
    for (const e of this.entries.values()) Composite.remove(this.engine.world, e.body)
    this.entries.clear()
    this.acc = 0
    this.time = 0
  }

  private syncWalls(p: Physics, a: Artboard) {
    const key = `${p.bounds}|${a.x}|${a.y}|${a.w}|${a.h}|${p.bounce}|${p.friction}`
    if (key === this.wallKey) return
    this.wallKey = key
    const { Bodies, Composite } = this.M
    for (const w of this.walls) Composite.remove(this.engine.world, w)
    this.walls = []
    if (p.bounds === "none") return
    const t = 40 // wall thickness, modules
    const opts = { isStatic: true, restitution: p.bounce, friction: p.friction }
    const rect = (cx: number, cy: number, w: number, h: number) => {
      const c = toM(cx, cy)
      return Bodies.rectangle(c.x, c.y, w * UNIT, h * UNIT, opts)
    }
    const { x, y, w, h } = a
    this.walls.push(rect(x, y - h / 2 - t / 2, w + 2 * t, t))
    if (p.bounds === "box") {
      this.walls.push(rect(x, y + h / 2 + t / 2, w + 2 * t, t))
      this.walls.push(rect(x - w / 2 - t / 2, y, t, h + 2 * t))
      this.walls.push(rect(x + w / 2 + t / 2, y, t, h + 2 * t))
    }
    Composite.add(this.engine.world, this.walls)
  }

  /**
   * Matches bodies to the items of a freshly built frame: new items get a
   * body where they are drawn, vanished ones lose theirs. Items past the body
   * limit, and masks, stay as built.
   */
  sync(frame: Frame, p: Physics, artboard: Artboard, input: PhysicsInput) {
    const { Bodies, Body, Composite } = this.M
    this.syncWalls(p, artboard)
    this.tick++
    let n = 0
    for (const item of frame.items) {
      const e = this.entries.get(item.id)
      if (e) {
        e.seen = this.tick
        e.body.restitution = p.bounce
        e.body.friction = p.friction
        e.body.frictionAir = p.air
        n++
        continue
      }
      if (n >= p.maxBodies) continue
      const s = itemShape(item)
      if (!(s.w > 0 && s.h > 0)) continue
      const c = toM(s.cx, s.cy)
      const isStatic = item.layers.some((l) => input.locked.has(l.id)) || input.locked.has(item.id.split("#")[0])
      const opts = { restitution: p.bounce, friction: p.friction, frictionAir: p.air, isStatic, angle: -s.angle }
      const body =
        p.shape === "circle"
          ? Bodies.circle(c.x, c.y, (Math.max(s.w, s.h) / 2) * UNIT * 0.92, opts)
          : Bodies.rectangle(c.x, c.y, Math.max(s.w, 0.1) * UNIT, Math.max(s.h, 0.1) * UNIT, { ...opts, chamfer: { radius: Math.min(s.w, s.h) * UNIT * 0.08 } })
      if (p.shape === "circle") Body.setAngle(body, -s.angle)
      // Pins: every layer relative to the body centre, in the body's own frame.
      const cos = Math.cos(s.angle),
        sin = Math.sin(s.angle)
      const pins = item.layers.map((l: FrameLayer) => {
        const dx = l.x - s.cx,
          dy = l.y - s.cy
        const la = Math.atan2(l.sin, l.cos) - s.angle
        return { rx: cos * dx + sin * dy, ry: -sin * dx + cos * dy, cos: Math.cos(la), sin: Math.sin(la) }
      })
      Composite.add(this.engine.world, body)
      this.entries.set(item.id, { body, pins, seen: this.tick, static: isStatic, x0: s.cx, y0: s.cy, a0: s.angle })
      n++
    }
    for (const [id, e] of this.entries)
      if (e.seen !== this.tick) {
        Composite.remove(this.engine.world, e.body)
        this.entries.delete(id)
      }
  }

  private forces(p: Physics, artboard: Artboard, pointer: [number, number] | null) {
    const { Body } = this.M
    const t = this.time
    const k = 0.00004 // force per unit mass at strength 1
    for (const e of this.entries.values()) {
      if (e.static) continue
      const b = e.body
      const x = b.position.x / UNIT,
        y = -b.position.y / UNIT
      let fx = 0,
        fy = 0
      if (pointer && p.pointer !== "none" && p.pointerForce > 0) {
        const dx = x - pointer[0],
          dy = y - pointer[1]
        const d = Math.hypot(dx, dy)
        if (d < p.pointerRadius && d > 1e-4) {
          const f = (1 - d / p.pointerRadius) * p.pointerForce * 4
          // Unit vector away from the pointer, or around it for the vortex.
          const [ux, uy] = p.pointer === "vortex" ? [-dy / d, dx / d] : [dx / d, dy / d]
          const sign = p.pointer === "attract" ? -1 : 1
          fx += ux * f * sign
          fy += uy * f * sign
        }
      }
      if (p.field !== "none" && p.fieldForce > 0) {
        const dx = x - artboard.x,
          dy = y - artboard.y
        const d = Math.max(Math.hypot(dx, dy), 1e-3)
        const f = p.fieldForce
        switch (p.field) {
          case "attract":
            fx -= (dx / d) * f
            fy -= (dy / d) * f
            break
          case "repel":
            fx += (dx / d) * f
            fy += (dy / d) * f
            break
          case "vortex":
            fx += (-dy / d) * f - (dx / d) * f * 0.3
            fy += (dx / d) * f - (dy / d) * f * 0.3
            break
          case "wind":
            fx += (noise2(y * 0.15, t * 0.3) - 0.35) * f * 2
            fy += (noise2(x * 0.15 + 9, t * 0.3) - 0.5) * f * 0.6
            break
          case "pulse": {
            const beat = Math.max(0, Math.sin(t * Math.PI)) ** 8
            fx += (dx / d) * f * beat * 6
            fy += (dy / d) * f * beat * 6
            break
          }
        }
      }
      if (fx !== 0 || fy !== 0) Body.applyForce(b, b.position, { x: fx * k * b.mass * UNIT, y: -fy * k * b.mass * UNIT })
    }
  }

  /**
   * Advances the simulation by `dt` seconds in fixed steps (at most four per
   * call, so a slow frame never snowballs).
   */
  step(dt: number, p: Physics, artboard: Artboard, input: PhysicsInput) {
    const g = this.engine.gravity
    const a = (p.gravityAngle * Math.PI) / 180
    g.x = Math.cos(a) * p.gravity
    g.y = -Math.sin(a) * p.gravity
    g.scale = 0.001
    this.acc = Math.min(this.acc + dt * 1000, STEP * 4)
    while (this.acc >= STEP) {
      for (let s = 0; s < SUBSTEPS; s++) {
        this.forces(p, artboard, input.pointer)
        this.M.Engine.update(this.engine, STEP / SUBSTEPS)
      }
      this.acc -= STEP
      this.time += STEP / 1000
    }
  }

  /** Writes body placements into the frame layers (items without a body stay as built). */
  apply(frame: Frame) {
    for (const item of frame.items) {
      const e = this.entries.get(item.id)
      if (!e) continue
      const b = e.body
      const cx = b.position.x / UNIT,
        cy = -b.position.y / UNIT
      const ang = -b.angle
      const cos = Math.cos(ang),
        sin = Math.sin(ang)
      item.layers.forEach((l, i) => {
        const pin = e.pins[i]
        if (!pin) return
        l.x = cx + cos * pin.rx - sin * pin.ry
        l.y = cy + sin * pin.rx + cos * pin.ry
        l.cos = cos * pin.cos - sin * pin.sin
        l.sin = sin * pin.cos + cos * pin.sin
      })
    }
  }

  /** World placement of a body: centre and angle (for baking and tests). */
  placement(id: string): { x: number; y: number; angle: number } | null {
    const e = this.entries.get(id)
    if (!e) return null
    return { x: e.body.position.x / UNIT, y: -e.body.position.y / UNIT, angle: -e.body.angle }
  }

  /**
   * How a body moved since it was created, as a rigid transform of the world
   * (baking positions back into the scene composes it with the node's own).
   */
  delta(id: string): Xf | null {
    const e = this.entries.get(id)
    if (!e) return null
    const da = -e.body.angle - e.a0
    const cos = Math.cos(da),
      sin = Math.sin(da)
    const cx = e.body.position.x / UNIT,
      cy = -e.body.position.y / UNIT
    return { x: cx - (cos * e.x0 - sin * e.y0), y: cy - (sin * e.x0 + cos * e.y0), cos, sin, s: 1, m: 1 }
  }

  /** Ids of the items that have a body. */
  ids() {
    return [...this.entries.keys()]
  }

  /** Gives every free body a random kick (deterministic by `seed`). */
  shake(seed = 1, strength = 1) {
    const { Body } = this.M
    let i = 0
    for (const e of this.entries.values()) {
      if (e.static) continue
      i++
      const a = noise2(i * 1.7, seed) * Math.PI * 4
      const v = (4 + noise2(seed, i * 2.3) * 8) * strength
      Body.setVelocity(e.body, { x: Math.cos(a) * v, y: -Math.abs(Math.sin(a)) * v })
      Body.setAngularVelocity(e.body, (noise2(i, seed + 5) - 0.5) * 0.3 * strength)
    }
  }
}
