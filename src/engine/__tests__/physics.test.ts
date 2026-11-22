import { describe, expect, it } from "vitest"
import Matter from "matter-js"
import { defaultLibrary } from "../alphabet/sets"
import { buildFrame, nearestItem, pickItem } from "../frame"
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

describe("dragging bodies", () => {
  it("a spring pulls a grabbed body to the pointer; released, it keeps moving", () => {
    const s = scene({ gravity: 0, bounds: "none" }, 1)
    const w = new PhysicsWorld(M)
    const input = { pointer: null, locked: new Set<string>() }
    const f0 = buildFrame(s, lib, 0, FAR)
    w.sync(f0, s.physics!, s.artboard, input)
    const id = f0.items[0].id
    const start = w.placement(id)!
    expect(w.grabAt(id, [start.x, start.y])).toBe(true)
    const target: [number, number] = [start.x + 6, start.y + 2]
    for (let i = 0; i < 90; i++) {
      w.moveGrab(target)
      w.sync(buildFrame(s, lib, i / 60, FAR), s.physics!, s.artboard, input)
      w.step(1 / 60, s.physics!, s.artboard, input)
    }
    const held = w.placement(id)!
    expect(Math.hypot(held.x - target[0], held.y - target[1])).toBeLessThan(0.5)
    // A fling, then let go: the body keeps going.
    for (let i = 0; i < 6; i++) {
      w.moveGrab([target[0] + (i + 1) * 1.5, target[1]])
      w.step(1 / 60, s.physics!, s.artboard, input)
    }
    w.releaseGrab()
    const a = w.placement(id)!
    w.step(1 / 60, s.physics!, s.artboard, input)
    w.step(1 / 60, s.physics!, s.artboard, input)
    expect(w.placement(id)!.x).toBeGreaterThan(a.x + 0.05)
    expect(w.bodyCount).toBe(1)
  })

  it("a press in a letter's slot still finds its body (picking tolerance), and only that node's items", () => {
    // П of the geometric set has a bay between its legs: a point just inside the bay is not ink.
    const s = makeScene({ set: "geo", layers: [makeLayer("П", { x: 0, y: 0 }), makeLayer("О", { x: 12, y: 0 })], artboard, physics: { ...defaultPhysics } })
    const f = buildFrame(s, lib, 0, FAR)
    const [p, o] = s.layers
    expect(pickItem(f, -0.4, 0)).toBeNull()
    expect(pickItem(f, -0.4, 0, 0.15)).toBe(p.id)
    expect(pickItem(f, -0.4, 0, 0.15, o.id)).toBeNull()
    // Off the ink entirely, the nearest accepted item is still found (a press inside the selection box).
    expect(nearestItem(f, 0, 4, (it) => it.layers.some((l) => l.id === p.id))).toBe(p.id)
    expect(nearestItem(f, 0, 4, () => false)).toBeNull()
  })

  it("static (locked) bodies cannot be grabbed", () => {
    const s = scene({}, 1)
    const w = new PhysicsWorld(M)
    const f = buildFrame(s, lib, 0, FAR)
    w.sync(f, s.physics!, s.artboard, { pointer: null, locked: new Set([s.layers[0].id]) })
    expect(w.grabAt(f.items[0].id, [0, 0])).toBe(false)
  })
})

describe("what restarts the live simulation", () => {
  it("folding, renaming and recolouring keep it going; moving an object restarts it", async () => {
    const { Runtime } = await import("../../state/runtime")
    const { loadMatter } = await import("../physics")
    await loadMatter()
    const rt = new Runtime()
    const s = scene({}, 3)
    const run = (sc: Scene, n: number) => {
      for (let i = 0; i < n; i++) rt.physicsFrame(buildFrame(sc, lib, i / 60, FAR), sc, sc, 1 / 60, true)
    }
    run(s, 30)
    const t = rt.physics!.time
    expect(t).toBeGreaterThan(0.4)
    const cosmetic = { ...s, layers: s.layers.map((l) => ({ ...l, name: "x", color: "#FF0000", collapsed: true })) }
    run(cosmetic, 1)
    expect(rt.physics!.time).toBeGreaterThan(t)
    const moved = { ...cosmetic, layers: cosmetic.layers.map((l, i) => (i === 0 ? { ...l, x: l.x + 3 } : l)) }
    run(moved, 1)
    expect(rt.physics!.time).toBeLessThan(0.05)
  })
})
