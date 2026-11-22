import { describe, expect, it } from "vitest"
import { defaultLibrary } from "../alphabet/sets"
import { buildFrame, sampleItem } from "../frame"
import { cloneCount, layoutClones } from "../cloner"
import { applyEffectors } from "../effectors"
import { readParam, readPath, writePath } from "../params"
import { applyRoutes } from "../modulation"
import { emptySignals } from "../signals"
import {
  CLONE_LIMITS,
  defaultCloner,
  defaultEffector,
  makeGroup,
  makeLayer,
  makeScene,
  makeShape,
  sanitizeScene,
  type Cloner,
  type Effector,
  type Layer,
  type Scene,
} from "../scene"

const lib = defaultLibrary()
const FAR: [number, number] = [1e4, 1e4]

function clonerScene(c: Partial<Cloner>, children: Layer[] = [makeLayer("◜", { set: "geo" })], groupOver = {}): Scene {
  const g = makeGroup("stack", { cloner: { ...defaultCloner, ...c }, ...groupOver })
  return makeScene({ layers: [g, ...children.map((k) => ({ ...k, parent: g.id }))] })
}

const fx = (over: Partial<Effector>): Effector => ({ ...defaultEffector, id: "fx1", ...over })

describe("cloner layouts", () => {
  it("lays a centred grid", () => {
    const list = layoutClones({ ...defaultCloner, cols: 3, rows: 2, dx: 2, dy: 4 }, 1, 100)
    expect(list).toHaveLength(6)
    expect(list.map((c) => c.x)).toEqual([-2, 0, 2, -2, 0, 2])
    expect(list.map((c) => c.y)).toEqual([-2, -2, -2, 2, 2, 2])
    expect(cloneCount({ ...defaultCloner, cols: 3, rows: 2 })).toBe(6)
  })

  it("respects the limit", () => {
    expect(layoutClones({ ...defaultCloner, cols: 100, rows: 100 }, 1, 50)).toHaveLength(50)
    expect(layoutClones({ ...defaultCloner, kind: "scatter", count: 500 }, 1, 7)).toHaveLength(7)
  })

  it("places rings at their radius and turns aligned clones outwards", () => {
    const list = layoutClones({ ...defaultCloner, kind: "radial", count: 4, radius: 5, rings: 2, ringStep: 3 }, 1, 100)
    expect(list).toHaveLength(8)
    for (const c of list.slice(0, 4)) expect(Math.hypot(c.x, c.y)).toBeCloseTo(5)
    for (const c of list.slice(4)) expect(Math.hypot(c.x, c.y)).toBeCloseTo(8)
    // The first clone sits on top and keeps its rotation.
    expect(list[0].y).toBeCloseTo(5)
    expect(list[0].rotation).toBeCloseTo(0)
  })

  it("picks children by zones", () => {
    const rings = layoutClones({ ...defaultCloner, cols: 5, rows: 5, pick: "rings" }, 3, 100)
    // Centre is zone 0, the outer ring zone 2.
    expect(rings[12].zone).toBe(0)
    expect(rings[0].zone).toBe(2)
    expect(rings[0].child).toBe(2)
    const checker = layoutClones({ ...defaultCloner, cols: 2, rows: 2, pick: "checker" }, 2, 100)
    expect(checker.map((c) => c.child)).toEqual([0, 1, 1, 0])
  })

  it("turns quadrants for rosettes", () => {
    const list = layoutClones({ ...defaultCloner, cols: 2, rows: 2, symmetry: "rotate" }, 1, 100)
    // (−,−) (+,−) (−,+) (+,+)
    expect(list.map((c) => c.rotation)).toEqual([180, 270, 90, 0])
    const m = layoutClones({ ...defaultCloner, cols: 2, rows: 2, symmetry: "mirror" }, 1, 100)
    expect(m.map((c) => [c.flipX, c.flipY])).toEqual([
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ])
  })

  it("is deterministic by seed", () => {
    const a = layoutClones({ ...defaultCloner, kind: "scatter", count: 20, seed: 7 }, 1, 100)
    const b = layoutClones({ ...defaultCloner, kind: "scatter", count: 20, seed: 7 }, 1, 100)
    const c = layoutClones({ ...defaultCloner, kind: "scatter", count: 20, seed: 8 }, 1, 100)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe("effectors", () => {
  it("random is deterministic per seed and clone", () => {
    const e = fx({ kind: "random", position: 1, rotation: 1, scale: 0.5 })
    const one = applyEffectors([e], 3, [0, 0], 2, 0, null)
    const two = applyEffectors([e], 3, [0, 0], 2, 5, null)
    const other = applyEffectors([{ ...e, seed: 2 }], 3, [0, 0], 2, 0, null)
    expect(one).toEqual(two)
    expect(one).not.toEqual(other)
  })

  it("field pushes away from the pointer and fades with distance", () => {
    const e = fx({ kind: "field", position: 1, rotation: 0, scale: 0, radius: 4 })
    const near = applyEffectors([e], 0, [1, 0], 1, 0, [0, 0])
    const far = applyEffectors([e], 0, [9, 0], 1, 0, [0, 0])
    expect(near.dx).toBeGreaterThan(0)
    expect(near.dy).toBeCloseTo(0)
    expect(far.dx).toBe(0)
    // Without a pointer a pointer field does nothing.
    expect(applyEffectors([e], 0, [1, 0], 1, 0, null).dx).toBe(0)
  })

  it("a centre field pushes clones outwards in a turned or mirrored group", () => {
    for (const over of [{ rotation: 90 }, { rotation: 30, flipX: true }, { scale: 2 }]) {
      const c = { kind: "linear" as const, count: 2, dx: 10, dy: 0, effectors: [fx({ kind: "field", source: "centre", position: 1, rotation: 0, scale: 0, radius: 30 })] }
      const s = clonerScene(c, [makeLayer("◜", { set: "geo" })], over)
      const before = buildFrame(clonerScene({ ...c, effectors: [] }, [makeLayer("◜", { set: "geo" })], over), lib, 0, FAR)
      const after = buildFrame(s, lib, 0, FAR)
      const g = s.layers[0]
      after.items.forEach((it, i) => {
        const a = before.items[i].layers[0],
          b = it.layers[0]
        // Further from the group centre, along the same ray.
        const ra = Math.hypot(a.x - g.x, a.y - g.y),
          rb = Math.hypot(b.x - g.x, b.y - g.y)
        expect(rb, JSON.stringify(over)).toBeGreaterThan(ra + 1)
        const cross = (a.x - g.x) * (b.y - g.y) - (a.y - g.y) * (b.x - g.x)
        expect(Math.abs(cross) / (ra * rb), JSON.stringify(over)).toBeLessThan(1e-6)
      })
    }
  })

  it("disabled or zero-amount effectors do nothing", () => {
    const base = applyEffectors([], 0, [1, 1], 1, 0, null)
    expect(applyEffectors([fx({ enabled: false })], 0, [1, 1], 1, 0, null)).toEqual(base)
    expect(applyEffectors([fx({ amount: 0 })], 0, [1, 1], 1, 0, null)).toEqual(base)
  })
})

describe("cloners in frames", () => {
  it("expands children into clones with unique keys", () => {
    const s = clonerScene({ cols: 4, rows: 3 })
    const f = buildFrame(s, lib, 0, FAR)
    expect(f.items).toHaveLength(12)
    const keys = new Set(f.items.map((it) => it.layers[0].key))
    expect(keys.size).toBe(12)
    const ids = new Set(f.items.map((it) => it.id))
    expect(ids.size).toBe(12)
    // Every clone keeps the source id for picking.
    expect(new Set(f.items.map((it) => it.layers[0].id)).size).toBe(1)
  })

  it("draws the children once when the cloner is off", () => {
    const s = clonerScene({ enabled: false, cols: 4, rows: 3 })
    expect(buildFrame(s, lib, 0, FAR).items).toHaveLength(1)
  })

  it("alternates children and colours by zones", () => {
    const a = makeLayer("◜", { set: "geo", color: "#111111" })
    const b = makeShape({ kind: "rect", w: 2, h: 2 }, { color: "#222222" })
    const s = clonerScene({ cols: 2, rows: 1, pick: "cycle", palette: ["#FF0000", "#0000FF"] }, [a, b])
    const f = buildFrame(s, lib, 0, FAR)
    expect(f.items.map((it) => it.layers[0].id)).toEqual([a.id, b.id])
    expect(f.items[0].layers[0].color).toEqual([1, 0, 0])
    expect(f.items[1].layers[0].color).toEqual([0, 0, 1])
  })

  it("is deterministic with effectors", () => {
    const s = clonerScene({ cols: 6, rows: 6, effectors: [fx({ kind: "noise", position: 1, rotation: 1, speed: 1 })] })
    const p = (f: ReturnType<typeof buildFrame>) => f.items.map((it) => [it.layers[0].x, it.layers[0].y, it.layers[0].cos])
    expect(p(buildFrame(s, lib, 1.5, FAR))).toEqual(p(buildFrame(s, lib, 1.5, FAR)))
    expect(p(buildFrame(s, lib, 1.5, FAR))).not.toEqual(p(buildFrame(s, lib, 3, FAR)))
  })

  it("caps the clones of a scene", () => {
    const big = { cols: 64, rows: 64 }
    const g1 = makeGroup("stack", { cloner: { ...defaultCloner, ...big } })
    const g2 = makeGroup("stack", { cloner: { ...defaultCloner, ...big } })
    const tile = (parent: string) => ({ ...makeLayer("■", { set: "geo" }), parent })
    const s = makeScene({ layers: [g1, tile(g1.id), g2, tile(g2.id)] })
    const f = buildFrame(s, lib, 0, FAR)
    expect(f.items.length).toBe(CLONE_LIMITS.scene)
  })

  it("clips by the mask and never draws it", () => {
    const mask = makeShape({ kind: "rect", w: 4, h: 4 })
    const s = clonerScene({ cols: 8, rows: 8, dx: 2.5, dy: 2.5 }, [mask, makeLayer("■", { set: "geo" })], { mask: true })
    const f = buildFrame(s, lib, 0, FAR)
    expect(f.items).toHaveLength(64)
    expect(f.items.every((it) => it.mask?.id === mask.id)).toBe(true)
    // A tile far outside the 4 × 4 mask is cut away entirely.
    const corner = f.items[0]
    const [cx, cy] = [corner.layers[0].x, corner.layers[0].y]
    expect(sampleItem(f, corner, cx, cy).d).toBeGreaterThan(0)
    // The tile at the centre stays inside.
    const centre = f.items.find((it) => Math.hypot(it.layers[0].x, it.layers[0].y) < 2.5)!
    expect(sampleItem(f, centre, centre.layers[0].x, centre.layers[0].y).d).toBeLessThan(0)
  })
})

describe("cloner paths", () => {
  it("reads and writes effector values by id without mutation", () => {
    const g = makeGroup("stack", { cloner: { ...defaultCloner, effectors: [fx({ id: "a", amount: 0.2 }), fx({ id: "b", amount: 0.4 })] } })
    const path = ["cloner", "effectors", "b", "amount"]
    expect(readPath(g, path)).toBe(0.4)
    const next = writePath(g, path, 0.9)
    expect(readPath(next, path)).toBe(0.9)
    expect(readPath(g, path)).toBe(0.4)
    expect(next.cloner!.effectors[0]).toBe(g.cloner!.effectors[0])
    // An unknown effector leaves the node untouched.
    const same = writePath(g, ["cloner", "effectors", "zzz", "amount"], 1)
    expect(same.cloner!.effectors).toBe(g.cloner!.effectors)
  })

  it("routes modulate cloner parameters", () => {
    const s = clonerScene({ dx: 2 })
    const g = s.layers[0]
    const scene: Scene = { ...s, routes: [{ id: "r", source: "lfo1", target: `layer:${g.id}.cloner.dx`, amount: 1 }] }
    expect(readParam(scene, `layer:${g.id}.cloner.dx`)).toBe(2)
    const out = applyRoutes(scene, { ...emptySignals(), lfo1: 1 })
    expect(readParam(out, `layer:${g.id}.cloner.dx`)).not.toBe(2)
    expect(readParam(scene, `layer:${g.id}.cloner.dx`)).toBe(2)
  })

  it("sanitizes cloners and keeps them off merge groups", () => {
    const g = makeGroup("stack", { cloner: { ...defaultCloner, cols: 9999 as number, effectors: [fx({ amount: 7 })] } })
    const m = makeGroup("merge", { cloner: { ...defaultCloner } })
    const raw = JSON.parse(JSON.stringify(makeScene({ layers: [g, m] })))
    const s = sanitizeScene(raw, { sets: ["main", "geo"], fallbackSet: "main" })!
    const sg = s.layers.find((l) => l.id === g.id)
    const sm = s.layers.find((l) => l.id === m.id)
    expect(sg?.type === "group" && sg.cloner?.cols).toBe(128)
    expect(sg?.type === "group" && sg.cloner?.effectors[0].amount).toBe(1)
    expect(sm?.type === "group" && sm.cloner).toBeUndefined()
  })
})

describe("pattern presets", () => {
  it("build frames and survive a save round trip", async () => {
    const { patternPresets } = await import("../presets")
    for (const p of patternPresets) {
      const s = p.make()
      const f = buildFrame(s, lib, 0, FAR)
      expect(f.items.length, p.id).toBeGreaterThan(0)
      const back = sanitizeScene(JSON.parse(JSON.stringify(s)), { sets: ["main", "geo"], fallbackSet: "main" })!
      expect(buildFrame(back, lib, 0, FAR).items.length, p.id).toBe(f.items.length)
    }
  })
})

describe("variations of patterns", () => {
  it("mutate cloners without breaking the scene", async () => {
    const { patternPresets } = await import("../presets")
    const { mutateScene } = await import("../variations")
    const locks = { letters: false, combine: false, form: false, material: false }
    for (const p of patternPresets) {
      const s = p.make()
      for (let seed = 1; seed <= 6; seed++) {
        const m = mutateScene(seed, "АБВГД", s, 1, locks)
        expect(buildFrame(m, lib, 0, FAR).items.length, p.id).toBeGreaterThan(0)
        expect(sanitizeScene(JSON.parse(JSON.stringify(m)), { sets: ["main", "geo"], fallbackSet: "main" }), p.id).not.toBeNull()
      }
    }
  })
})

describe("pattern presets fit their artboards", () => {
  it("content (masked content by its mask) lies inside the artboard", async () => {
    const { patternPresets } = await import("../presets")
    const { layerBounds } = await import("../frame")
    const out: string[] = []
    for (const p of patternPresets) {
      const s = p.make()
      const a = s.artboard
      const f = buildFrame(s, lib, 0, FAR)
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity
      for (const it of f.items)
        for (const l of it.layers) {
          let b = layerBounds(l)
          if (it.mask) {
            const m = layerBounds(it.mask)
            b = { x0: Math.max(b.x0, m.x0), y0: Math.max(b.y0, m.y0), x1: Math.min(b.x1, m.x1), y1: Math.min(b.y1, m.y1) }
            if (b.x0 >= b.x1 || b.y0 >= b.y1) continue
          }
          x0 = Math.min(x0, b.x0)
          y0 = Math.min(y0, b.y0)
          x1 = Math.max(x1, b.x1)
          y1 = Math.max(y1, b.y1)
        }
      const e = 1e-6
      if (x0 < a.x - a.w / 2 - e || x1 > a.x + a.w / 2 + e || y0 < a.y - a.h / 2 - e || y1 > a.y + a.h / 2 + e)
        out.push(`${p.id}: content ${x0.toFixed(2)}…${x1.toFixed(2)} × ${y0.toFixed(2)}…${y1.toFixed(2)}, artboard ${a.w}×${a.h}`)
    }
    expect(out).toEqual([])
  })
})
