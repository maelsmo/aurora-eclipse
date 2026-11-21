import { describe, expect, it } from "vitest"
import Matter from "matter-js"
import { defaultLibrary } from "../alphabet/sets"
import { buildFrame } from "../frame"
import { PhysicsWorld, type MatterLib } from "../physics"
import { defaultArtboard, defaultPhysics, makeLayer, makeScene, sanitizeScene, xfApply, type Physics, type Scene } from "../scene"

const lib = defaultLibrary()
const M = Matter as unknown as MatterLib
const FAR: [number, number] = [1e4, 1e4]
const artboard = { ...defaultArtboard, enabled: true, x: 0, y: 0, w: 32, h: 18 }

function scene(over: Partial<Physics> = {}, n = 6): Scene {
  const layers = Array.from({ length: n }, (_, i) => makeLayer("AБВГДЕЖЗ"[i % 8], { x: -10 + i * 4, y: 4 + (i % 2) * 2, rotation: i * 7 }))
  return makeScene({ layers, artboard, physics: { ...defaultPhysics, ...over } })
}

/** Runs a world for `steps` frames of 1/60 s; returns body placements. */
function run(s: Scene, steps: number, locked = new Set<string>()) {
  const w = new PhysicsWorld(M)
  const input = { pointer: null, locked }
  for (let i = 0; i < steps; i++) {
    const f = buildFrame(s, lib, i / 60, FAR)
    w.sync(f, s.physics!, s.artboard, input)
    w.step(1 / 60, s.physics!, s.artboard, input)
  }
  return { w, placements: w.ids().map((id) => w.placement(id)!) }
}

describe("physics", () => {
  it("is deterministic at a fixed step", () => {
    const s = scene({ field: "vortex", fieldForce: 1 })
    const a = run(s, 150).placements
    const b = run(s, 150).placements
    expect(a).toEqual(b)
  })

  it("lets bodies fall and rest on the artboard floor", () => {
    const s = scene()
    const before = run(s, 1).placements
    const after = run(s, 240).placements
    for (let i = 0; i < before.length; i++) expect(after[i].y).toBeLessThan(before[i].y - 1)
    // Nothing falls through the bottom edge of the artboard.
    for (const p of after) expect(p.y).toBeGreaterThan(artboard.y - artboard.h / 2)
  })

  it("keeps locked objects in place", () => {
    const s = scene({}, 2)
    const locked = new Set([s.layers[0].id])
    const before = run(s, 1, locked).placements
    const after = run(s, 120, locked).placements
    expect(after[0].x).toBeCloseTo(before[0].x, 6)
    expect(after[0].y).toBeCloseTo(before[0].y, 6)
    expect(after[1].y).toBeLessThan(before[1].y)
  })

  it("simulates at most maxBodies", () => {
    const s = scene({ maxBodies: 3 }, 6)
    expect(run(s, 1).w.bodyCount).toBe(3)
  })

  it("writes placements into the frame and bakes them back exactly", () => {
    const s = scene({}, 3)
    const { w } = run(s, 90)
    const f = buildFrame(s, lib, 0, FAR)
    const id = s.layers[1].id
    const built = f.items.find((it) => it.id === id)!.layers[0]
    const [bx, by] = [built.x, built.y]
    w.apply(f)
    const moved = f.items.find((it) => it.id === id)!.layers[0]
    expect(Math.hypot(moved.x - bx, moved.y - by)).toBeGreaterThan(0.5)
    // The body motion applied to the node's own placement lands where the frame draws it.
    const d = w.delta(id)!
    const [x, y] = xfApply(d, bx, by)
    expect(x).toBeCloseTo(moved.x, 6)
    expect(y).toBeCloseTo(moved.y, 6)
  })

  it("survives sanitizing", () => {
    const raw = JSON.parse(JSON.stringify(scene({ bounce: 9, maxBodies: 5000, field: "nope" as Physics["field"] })))
    const s = sanitizeScene(raw, { sets: ["main", "geo"], fallbackSet: "main" })!
    expect(s.physics!.bounce).toBe(1)
    expect(s.physics!.maxBodies).toBe(800)
    expect(s.physics!.field).toBe("none")
    const none = sanitizeScene(JSON.parse(JSON.stringify(makeScene())), { sets: ["main"], fallbackSet: "main" })!
    expect(none.physics).toBeUndefined()
  })
})
