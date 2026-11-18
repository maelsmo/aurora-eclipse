import { describe, expect, it } from "vitest"
import { defaultAlphabet } from "../alphabet"
import { layoutText, makeLayer, makeScene, sanitizeScene } from "../scene"
import { applyRoutes, modulate } from "../modulation"
import { emptySignals, lfoValue } from "../signals"
import { presets } from "../presets"
import { mutateScene, randomScene, noLocks } from "../variations"
import { defaultAxes } from "../axes"
import { buildFrame, sampleFrame } from "../frame"

describe("scene", () => {
  it("lays text out centred on one baseline", () => {
    const layers = layoutText("AE", defaultAlphabet, defaultAxes, 0.5)
    expect(layers.map((l) => l.char)).toEqual(["A", "E"])
    expect(layers[0].x).toBeLessThan(0)
    expect(layers[1].x).toBeGreaterThan(0)
    expect(layers.every((l) => l.y === 0)).toBe(true)
    expect(layoutText("Aё", defaultAlphabet, defaultAxes, 0.5).map((l) => l.char)).toEqual(["A", "Ё"])
  })
  it("survives a JSON round trip and rejects junk", () => {
    for (const p of presets) {
      const s = p.make()
      expect(sanitizeScene(JSON.parse(JSON.stringify(s)), defaultAlphabet)).toEqual(s)
    }
    expect(sanitizeScene(null, defaultAlphabet)).toBeNull()
    const bad = sanitizeScene(
      { layers: [{ char: "A", op: "boom", color: "red", x: "1" }, { char: "@" }], axes: { weight: "x" } },
      defaultAlphabet,
    )!
    expect(bad.layers).toHaveLength(1)
    expect(bad.layers[0].op).toBe("union")
    expect(bad.layers[0].color).toBe("#161616")
    expect(bad.axes.weight).toBe(1)
  })
})

describe("modulation", () => {
  it("adds amount × range × signal and clamps", () => {
    expect(modulate(1, 0.5, 1, 0.4, 1.6)).toBeCloseTo(1.6)
    expect(modulate(1, 0.25, -1, 0.4, 1.6)).toBeCloseTo(0.7)
  })
  it("routes signals into axes and layers", () => {
    const s = makeScene({ layers: [makeLayer("A")] })
    const id = s.layers[0].id
    s.routes = [
      { id: "1", source: "micLevel", target: "axes.weight", amount: 0.25 },
      { id: "2", source: "lfo1", target: `layer:${id}.k`, amount: 0.1 },
    ]
    const sig = { ...emptySignals(), micLevel: 1, lfo1: -1 }
    const e = applyRoutes(s, sig)
    expect(e.axes.weight).toBeCloseTo(1.3)
    expect(e.layers[0].k).toBeCloseTo(0.3)
    expect(s.axes.weight).toBe(1) // the stored scene is untouched
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
  it("are deterministic for a seed and keep locked parts", () => {
    const base = presets[0].make()
    const a = randomScene(42, "AEOS", base, noLocks)
    const b = randomScene(42, "AEOS", base, noLocks)
    expect(a.layers.map((l) => [l.char, l.op, l.x])).toEqual(b.layers.map((l) => [l.char, l.op, l.x]))
    const m = mutateScene(7, "AEOS", base, 1, { letters: true, combine: true, form: true, material: true })
    expect(m.layers.map((l) => [l.char, l.op, l.x, l.y])).toEqual(base.layers.map((l) => [l.char, l.op, l.x, l.y]))
    expect(m.axes).toEqual(base.axes)
  })
})

describe("composition", () => {
  it("eclipse keeps a gap between the letters of the AE preset", () => {
    const s = presets[0].make()
    const f = buildFrame(s, defaultAlphabet, 0, 0, [1e4, 1e4])
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
})
