import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defaultAlphabet } from "../alphabet"
import { defaultLibrary } from "../alphabet/sets"
import {
  deleteNodes,
  duplicateNodes,
  groupNodes,
  isGroup,
  isLetter,
  layoutText,
  makeGroup,
  makeLayer,
  makeScene,
  mergeScene,
  moveNode,
  normalize,
  sanitizeScene,
  shiftNode,
  subtreeEnd,
  ungroup,
  worldXf,
  type Layer,
} from "../scene"
import { applyMotion, applyRoutes, modulate, routeSignal } from "../modulation"
import { emptySignals, lfoValue } from "../signals"
import { presets } from "../presets"
import { mutateScene, randomScene, noLocks } from "../variations"
import { defaultAxes } from "../axes"
import { buildFrame, frameLayers, sampleFrame } from "../frame"
import { readParam, writePath } from "../params"

const ctx = { sets: ["main"], fallbackSet: "main" }
const lib = defaultLibrary()
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/v2-storage.json", import.meta.url)), "utf8"))

/** Pre-order + contiguous subtrees + parents exist. */
function validTree(layers: Layer[]) {
  const ids = new Set(layers.map((l) => l.id))
  layers.forEach((l, i) => {
    if (l.parent) {
      expect(ids.has(l.parent)).toBe(true)
      const p = layers.findIndex((x) => x.id === l.parent)
      expect(p).toBeLessThan(i)
      expect(i).toBeLessThan(subtreeEnd(layers, p))
    }
  })
}

describe("scene", () => {
  it("lays text out centred on one baseline", () => {
    const layers = layoutText("AE", defaultAlphabet, defaultAxes, 0.5)
    expect(layers.map((l) => l.char)).toEqual(["A", "E"])
    expect(layers[0].x).toBeLessThan(0)
    expect(layers[1].x).toBeGreaterThan(0)
    expect(layers.every((l) => l.y === 0)).toBe(true)
    expect(layoutText("Aё", defaultAlphabet, defaultAxes, 0.5).map((l) => l.char)).toEqual(["A", "Ё"])
  })
  it("survives a JSON round trip, sanitize is idempotent", () => {
    for (const p of presets) {
      const s = p.make()
      const once = sanitizeScene(JSON.parse(JSON.stringify(s)), ctx)!
      expect(once).toEqual(s)
      expect(sanitizeScene(JSON.parse(JSON.stringify(once)), ctx)).toEqual(once)
    }
  })
  it("rejects junk and clamps ranges without dropping objects", () => {
    expect(sanitizeScene(null, ctx)).toBeNull()
    const bad = sanitizeScene(
      {
        v: 3,
        set: "nope",
        layers: [
          { type: "letter", char: "A", op: "boom", color: "red", x: "1", scale: 1e9, set: "ghost" },
          { type: "letter", char: "@" },
          { type: "letter", char: 42 },
          { type: "shape", shape: { kind: "blob", w: -5, sides: 99 } },
          { type: "group", mode: "weird", parent: "missing" },
          "junk",
        ],
        axes: { weight: "x" },
      },
      ctx,
    )!
    expect(bad.set).toBe("main")
    expect(bad.layers).toHaveLength(5)
    const [a, at, junk, shape, group] = bad.layers
    expect(a.op).toBe("union")
    expect(a.color).toBe("#161616")
    expect(a.scale).toBe(20)
    expect(isLetter(a) && a.set).toBeFalsy()
    expect(isLetter(at) && at.char).toBe("@")
    expect(isLetter(junk) && junk.char).toBe("A")
    expect(shape.type === "shape" && shape.shape).toMatchObject({ kind: "rect", w: 0.05, sides: 24 })
    expect(isGroup(group) && group.mode).toBe("stack")
    expect(group.parent).toBeUndefined()
    expect(bad.axes.weight).toBe(1)
  })
})

describe("migration v2 → v3", () => {
  const v2 = fixture["ae:v2:collection"][0].scene

  it("puts every v2 layer into one merge group and keeps the data", () => {
    const s = sanitizeScene(v2, { sets: ["main", "x"], fallbackSet: "x" })!
    expect(s.v).toBe(3)
    expect(s.set).toBe("x")
    const [g, ...rest] = s.layers
    expect(isGroup(g) && g.mode).toBe("merge")
    expect(rest).toHaveLength(4)
    expect(rest.every((l) => l.parent === g.id)).toBe(true)
    expect(rest.map((l) => (isLetter(l) ? l.char : ""))).toEqual(["А", "Н", "Н", "А"])
    expect(rest.map((l) => l.color)).toEqual(["#161616", "#F2542D", "#5B3CF5", "#161616"])
    expect(rest[3].motion.type).toBe("orbit")
    expect(s.look).toMatchObject({ mode: "isolines", line: 0.07, spacing: 0.3, rings: 8 })
    expect(s.warp).toMatchObject({ wave: 0.47, flow: 1.17 })
    expect(s.lfo).toHaveLength(4)
    expect(s.speed).toBe(1.19)
    validTree(s.layers)
  })
  it("draws the same field as the flat v2 fold", () => {
    const s = sanitizeScene(v2, ctx)!
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    expect(f.items).toHaveLength(1)
    expect(frameLayers(f).map((l) => l.id)).toEqual(v2.layers.map((l: { id: string }) => l.id))
    // Identity group transform: world placement equals the stored v2 coordinates.
    frameLayers(f).forEach((l, i) => {
      expect(l.x).toBeCloseTo(v2.layers[i].x, 9)
      expect(l.y).toBeCloseTo(v2.layers[i].y, 9)
    })
  })
  it("moves routes to renamed parameters", () => {
    const s = sanitizeScene(
      { ...v2, routes: [{ id: "r", source: "lfo1", target: "material.spacing", amount: 0.3 }, { id: "q", source: "lfo2", target: "material.glow", amount: 0.1 }] },
      ctx,
    )!
    expect(s.routes.map((r) => r.target)).toEqual(["look.spacing", "material.glow"])
  })
  it("migrates a v3 scene idempotently", () => {
    const once = sanitizeScene(v2, ctx)!
    expect(sanitizeScene(JSON.parse(JSON.stringify(once)), ctx)).toEqual(once)
  })
})

describe("tree", () => {
  const scene = () => {
    const a = makeLayer("A", { x: 2, y: 1 })
    const b = makeLayer("B", { x: -2, y: 0 })
    const c = makeLayer("C", { x: 4, y: -3, rotation: 30 })
    return makeScene({ layers: [a, b, c] })
  }

  it("normalize repairs cycles, dangling parents and merge nesting", () => {
    const g1 = makeGroup("stack", { id: "g1", parent: "g2" })
    const g2 = makeGroup("stack", { id: "g2", parent: "g1" })
    const m = makeGroup("merge", { id: "m" })
    const inner = makeGroup("stack", { id: "inner", parent: "m" })
    const leaf = makeLayer("A", { id: "leaf", parent: "inner" })
    const lost = makeLayer("B", { id: "lost", parent: "nowhere" })
    const out = normalize([leaf, g1, g2, m, inner, lost])
    validTree(out)
    expect(out.find((l) => l.id === "lost")!.parent).toBeUndefined()
    expect(out.find((l) => l.id === "inner")!.parent).toBeUndefined()
    expect(out.find((l) => l.id === "leaf")!.parent).toBe("inner")
  })

  it("grouping keeps world placement; ungrouping restores it", () => {
    const s = scene()
    const before = s.layers.map((l) => worldXf(s.layers, l.id))
    const { scene: g, id } = groupNodes(s, [s.layers[0].id, s.layers[2].id], "stack")
    validTree(g.layers)
    expect(g.layers.find((l) => l.id === id)).toBeTruthy()
    for (const [k, l] of s.layers.entries()) {
      const w = worldXf(g.layers, l.id)
      expect(w.x).toBeCloseTo(before[k].x, 9)
      expect(w.y).toBeCloseTo(before[k].y, 9)
      expect(Math.atan2(w.sin, w.cos)).toBeCloseTo(Math.atan2(before[k].sin, before[k].cos), 9)
    }
    // Rotate and scale the group, then ungroup: children keep the new world placement.
    const turned = { ...g, layers: g.layers.map((l) => (l.id === id ? { ...l, rotation: 90, scale: 2, flipX: true } : l)) }
    const mid = turned.layers.filter((l) => l.parent === id).map((l) => worldXf(turned.layers, l.id))
    const u = ungroup(turned, id!)
    validTree(u.layers)
    turned.layers
      .filter((l) => l.parent === id)
      .forEach((l, k) => {
        const w = worldXf(u.layers, l.id)
        expect(w.x).toBeCloseTo(mid[k].x, 9)
        expect(w.y).toBeCloseTo(mid[k].y, 9)
        expect(w.s).toBeCloseTo(mid[k].s, 9)
        expect(w.m).toBe(mid[k].m)
        expect(w.cos).toBeCloseTo(mid[k].cos, 9)
      })
  })

  it("moves keep world placement and z-order follows the array", () => {
    const s = scene()
    const { scene: g, id } = groupNodes(s, [s.layers[1].id], "stack")
    const moved = moveNode(g, s.layers[0].id, id!, 0)
    validTree(moved.layers)
    const w = worldXf(moved.layers, s.layers[0].id)
    expect(w.x).toBeCloseTo(2, 9)
    expect(w.y).toBeCloseTo(1, 9)
    const up = shiftNode(s, s.layers[0].id, 1)
    expect(up.layers.map((l) => l.id)).toEqual([s.layers[1].id, s.layers[0].id, s.layers[2].id])
  })

  it("delete and duplicate carry routes with the nodes", () => {
    const s = scene()
    const id = s.layers[0].id
    s.routes = [
      { id: "1", source: "lfo1", target: `layer:${id}.x`, amount: 0.2 },
      { id: "2", source: "lfo1", target: `layer:${id}x.x`, amount: 0.2 },
      { id: "3", source: "lfo2", target: "axes.weight", amount: 0.1 },
    ]
    const dup = duplicateNodes(s, [id])
    expect(dup.scene.layers).toHaveLength(4)
    expect(dup.scene.routes.filter((r) => r.target === `layer:${dup.ids[0]}.x`)).toHaveLength(1)
    const del = deleteNodes(s, [id])
    // Only the route of the deleted node goes (not the one whose id merely shares a prefix).
    expect(del.routes.map((r) => r.id)).toEqual(["2", "3"])
  })

  it("composes group transforms into frame layers", () => {
    const leaf = makeLayer("O", { x: 1, y: 0 })
    const s = mergeScene([leaf], {}, { x: 10, y: 5, rotation: 90, scale: 2 })
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    const l = frameLayers(f)[0]
    expect(l.x).toBeCloseTo(10, 9)
    expect(l.y).toBeCloseTo(7, 9)
    expect(l.scale).toBeCloseTo(2, 9)
    // The rotated, scaled O is still sampled correctly at its world centre.
    expect(sampleFrame(f, 10, 7).d).toBeGreaterThan(0)
    expect(sampleFrame(f, 10, 7 + 2 * 1.5).d).toBeLessThan(0.3)
  })
})

describe("modulation", () => {
  it("adds amount × range × signal and clamps", () => {
    expect(modulate(1, 0.5, 1, 0.4, 1.6)).toBeCloseTo(1.6)
    expect(modulate(1, 0.25, -1, 0.4, 1.6)).toBeCloseTo(0.7)
  })
  it("routes signals into axes, looks and node paths", () => {
    const s = mergeScene([makeLayer("A")])
    const id = s.layers[1].id
    s.routes = [
      { id: "1", source: "micLevel", target: "axes.weight", amount: 0.25 },
      { id: "2", source: "lfo1", target: `layer:${id}.k`, amount: 0.1 },
      { id: "3", source: "lfo2", target: `layer:${id}.look.line`, amount: 0.5 },
      { id: "4", source: "lfo2", target: "look.spacing", amount: 0.1 },
    ]
    const sig = { ...emptySignals(), micLevel: 1, lfo1: -1, lfo2: 1 }
    const e = applyRoutes(s, sig)
    expect(e.axes.weight).toBeCloseTo(1.3)
    expect(e.layers[1].k).toBeCloseTo(0.3)
    expect(e.layers[1].look?.line).toBeCloseTo(0.12 + 0.5 * 0.78, 6)
    expect(e.look.spacing).toBeCloseTo(0.35 + 0.142, 6)
    expect(s.axes.weight).toBe(1) // the stored scene is untouched
    expect(s.layers[1].look).toBeUndefined()
    expect(readParam(e, `layer:${id}.look.line`)).toBeCloseTo(0.51, 6)
  })
  it("writes by path without mutating", () => {
    const o = { a: { b: 1, c: [1] }, d: 2 }
    const n = writePath(o, ["a", "b"], 5)
    expect(n.a.b).toBe(5)
    expect(o.a.b).toBe(1)
    expect(n.a.c).toBe(o.a.c)
  })
  it("threshold gates switch with hysteresis; invert flips", () => {
    const st = new Map<string, boolean>()
    const r = { id: "g", source: "micLevel" as const, target: "axes.weight", amount: 1, threshold: 0.5 }
    const at = (v: number) => routeSignal(r, { ...emptySignals(), micLevel: v }, st)
    expect([at(0.52), at(0.6), at(0.52), at(0.44), at(0.52)]).toEqual([0, 1, 1, 0, 0])
    expect(routeSignal({ ...r, threshold: undefined, invert: true }, { ...emptySignals(), micLevel: 0.2 })).toBeCloseTo(0.8)
  })
  it("orbit circles a sibling, not a node of another group", () => {
    const a = makeLayer("A", { x: 0, y: 0 })
    const b = makeLayer("B", { x: 3, y: 0, motion: { type: "orbit", amount: 1, speed: 0.25, phase: 0 } })
    const s = mergeScene([a, b])
    const e = applyMotion(s, 1, 0, null, new Map())
    expect(e.layers[2].x).toBeCloseTo(0, 6)
    expect(e.layers[2].y).toBeCloseTo(3, 6)
  })
  it("oscillators stay within −1…1", () => {
    for (const shape of ["sine", "triangle", "noise", "pulse"] as const)
      for (let t = 0; t < 20; t += 0.37) {
        const v = lfoValue({ shape, rate: 0.7, phase: 0 }, t, 1)
        expect(v).toBeGreaterThanOrEqual(-1.0001)
        expect(v).toBeLessThanOrEqual(1.0001)
      }
  })
})

describe("variations", () => {
  const letters = (s: ReturnType<typeof presets[0]["make"]>) => s.layers.filter(isLetter)
  it("are deterministic for a seed and keep locked parts", () => {
    const base = presets[0].make()
    const a = randomScene(42, "AEOS", base, noLocks)
    const b = randomScene(42, "AEOS", base, noLocks)
    expect(letters(a).map((l) => [l.char, l.op, l.x])).toEqual(letters(b).map((l) => [l.char, l.op, l.x]))
    validTree(a.layers)
    const m = mutateScene(7, "AEOS", base, 1, { letters: true, combine: true, form: true, material: true })
    expect(letters(m).map((l) => [l.char, l.op, l.x, l.y])).toEqual(letters(base).map((l) => [l.char, l.op, l.x, l.y]))
    expect(m.axes).toEqual(base.axes)
    validTree(m.layers)
  })
  it("mutations keep routes pointing at the new ids", () => {
    const base = presets.find((p) => p.id === "morph")!.make()
    const m = mutateScene(3, "AE", base, 0.5, noLocks)
    const id = m.routes[0].target.match(/^layer:([^.]+)\./)![1]
    expect(m.layers.some((l) => l.id === id)).toBe(true)
  })
})

describe("composition", () => {
  it("eclipse keeps a gap between the letters of the AE preset", () => {
    const s = presets[0].make()
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    // Sample a horizontal line through the middle: inside → gap → inside again.
    let transitions = 0,
      prev = false
    for (let x = -4; x <= 4; x += 0.02) {
      const inside = sampleFrame(f, x, 0.8).d < 0
      if (inside !== prev) transitions++
      prev = inside
    }
    expect(transitions).toBeGreaterThanOrEqual(4)
  })
  it("objects outside merge groups become separate items in z-order", () => {
    const a = makeLayer("A", { x: -3 })
    const b = makeLayer("B", { x: 3 })
    const s = makeScene({ layers: [a, b] })
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    expect(f.items.map((it) => it.id)).toEqual([a.id, b.id])
  })
})

describe("limits never drop objects silently", () => {
  const phrase = "AURORA ECLIPSE DYNAMIC TYPE SYSTEM LABORATORY"

  it("splits long text into merges between words and keeps every letter", async () => {
    const { chunkByWords, groupText, LIMITS: L } = await import("../scene")
    const letters = layoutText(phrase, defaultAlphabet, defaultAxes, 0.15)
    expect(letters).toHaveLength(40)
    const chunks = chunkByWords(phrase, defaultAlphabet, L.mergeChildren)
    expect(chunks.flat()).toEqual(letters.map((_, i) => i))
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(L.mergeChildren)
    // Breaks fall between words: AURORA ECLIPSE DYNAMIC TYPE SYSTEM | LABORATORY.
    expect(chunks.map((c) => c.length)).toEqual([30, 10])
    const res = groupText(makeScene(), letters, chunks, phrase)
    const kept = res.scene.layers.filter(isLetter)
    expect(kept).toHaveLength(40)
    expect(res.scene.layers.filter((l) => isGroup(l) && l.mode === "merge")).toHaveLength(2)
    // The old single merge lost everything past 32 letters.
    const single = groupNodes({ ...makeScene(), layers: letters }, letters.map((l) => l.id), "merge")
    expect(single.scene.layers.filter(isLetter).length).toBe(32)
  })

  it("cuts a word longer than a merge", async () => {
    const { chunkByWords } = await import("../scene")
    const word = "A".repeat(70)
    expect(chunkByWords(word, defaultAlphabet, 32).map((c) => c.length)).toEqual([32, 32, 6])
  })

  it("reports a full merge or a full scene before any edit", async () => {
    const { addIssue, LIMITS: L } = await import("../scene")
    const full = mergeScene(Array.from({ length: L.mergeChildren }, () => makeLayer("A")))
    const g = full.layers[0]
    expect(addIssue(full.layers, g.id, 1, 1)).toMatch(/В сплаве не больше 32/)
    expect(addIssue(full.layers, undefined, 0, 1)).toBeNull()
    const crowd = makeScene({ layers: Array.from({ length: L.nodes - 1 }, () => makeLayer("A")) })
    expect(addIssue(crowd.layers, undefined, 0, 1)).toBeNull()
    expect(addIssue(crowd.layers, undefined, 0, 2)).toMatch(/не больше 256/)
  })
})

describe("moving nodes up keeps them in place", () => {
  it("grouping letters inside a shifted merge does not move them", async () => {
    const { worldXf: w } = await import("../scene")
    const letters = layoutText("HELLO", defaultAlphabet, defaultAxes, 0.15)
    const s0 = mergeScene(letters)
    const merge = s0.layers[0]
    const s = { ...s0, layers: s0.layers.map((l) => (l.id === merge.id ? { ...l, x: 78, y: 40, rotation: 15 } : l)) }
    const ids = s.layers.filter((l) => isLetter(l) && (l.char === "L" || l.char === "E")).map((l) => l.id)
    const before = ids.map((id) => w(s.layers, id))
    const res = groupNodes(s, ids, "stack")
    // The group cannot live in a merge: it moves next to it, its letters stay where they were drawn.
    const g = res.scene.layers.find((l) => l.id === res.id)!
    expect(g.parent).toBe(merge.parent)
    ids.forEach((id, i) => {
      const a = before[i],
        b = w(res.scene.layers, id)
      expect(b.x).toBeCloseTo(a.x, 6)
      expect(b.y).toBeCloseTo(a.y, 6)
      expect(b.cos).toBeCloseTo(a.cos, 6)
    })
  })

  it("too deep nesting is refused up front, and repaired without moving anything", async () => {
    const { depthIssue, normalize: norm, worldXf: w, LIMITS: L } = await import("../scene")
    // A letter inside LIMITS.depth turned groups.
    const groups = Array.from({ length: L.depth }, (_, i) => makeGroup("stack", { rotation: 20, x: 1 }))
    groups.forEach((g, i) => i && (g.parent = groups[i - 1].id))
    const leaf = { ...makeLayer("A", { rotation: 10 }), parent: groups[L.depth - 1].id }
    const layers = norm([...groups, leaf])
    expect(depthIssue(layers, [leaf.id])).toMatch(/не больше 6/)
    // A group with a letter dropped into the deepest group would need a seventh level.
    const box = makeGroup("stack")
    const withBox = norm([...layers, box, { ...makeLayer("B"), parent: box.id }])
    expect(depthIssue(withBox, [box.id], groups[L.depth - 1].id)).toMatch(/не больше 6/)
    expect(depthIssue(withBox, [box.id], groups[L.depth - 2].id)).toBeNull()
    // One more level forced in (as imported data could be): the leaf moves up and keeps its world placement.
    const extra = makeGroup("stack", { rotation: 20, x: 1, parent: groups[L.depth - 1].id })
    const deep = [...layers.slice(0, -1), extra, { ...leaf, parent: extra.id }]
    const before = w(deep, leaf.id)
    const fixed = norm(deep)
    const after = w(fixed, leaf.id)
    expect(fixed.find((l) => l.id === leaf.id)!.parent).not.toBe(extra.id)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(after.cos).toBeCloseTo(before.cos, 6)
    expect(after.sin).toBeCloseTo(before.sin, 6)
  })
})
