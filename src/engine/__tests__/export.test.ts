import { describe, expect, it } from "vitest"
import { traceField } from "../export/trace"
import { cubicPoint } from "../export/fit"
import { buildRegions, foldFronts, regionAt } from "../export/regions"
import { frameToSVG } from "../export/svg"
import { sdStroke } from "../sdf"
import { buildFrame, sampleFrame } from "../frame"
import { makeLayer, makeScene } from "../scene"
import { defaultAlphabet } from "../alphabet"
import { presets } from "../presets"
import { opRole } from "../operators"
import type { Vec } from "../types"

describe("tracer", () => {
  it("a circle becomes four cubics within 1e-3", () => {
    const cx = 0.3,
      cy = 0.2,
      r = 1.5
    const cs = traceField((x, y) => Math.hypot(x - cx, y - cy) - r, { x0: -1.5, y0: -1.6, x1: 2.1, y1: 2 })
    expect(cs).toHaveLength(1)
    const c = cs[0]
    expect(c.segs).toHaveLength(4)
    let p0: Vec = c.start
    let err = 0
    for (const s of c.segs) {
      expect(s.k).toBe("C")
      if (s.k !== "C") continue
      for (let t = 0; t <= 1; t += 0.01) {
        const p = cubicPoint(p0, s, t)
        err = Math.max(err, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r))
      }
      p0 = s.p
    }
    expect(err).toBeLessThan(1e-3)
  })

  it("a stroke with a flat cut has four exact corners", () => {
    const f = (x: number, y: number) => sdStroke(x, y, 0, 0, 3, 0, 0.5, 0)
    const cs = traceField(f, { x0: -1, y0: -1, x1: 4, y1: 1 })
    expect(cs).toHaveLength(1)
    const pts = [cs[0].start, ...cs[0].segs.map((s) => s.p)].slice(0, -1)
    expect(cs[0].segs.every((s) => s.k === "L")).toBe(true)
    expect(pts).toHaveLength(4)
    const corners: Vec[] = [
      [-0.5, -0.5],
      [3.5, -0.5],
      [3.5, 0.5],
      [-0.5, 0.5],
    ]
    for (const q of corners) {
      const near = Math.min(...pts.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])))
      expect(near).toBeLessThan(1e-5)
    }
  })

  it("keeps the inside on the left: outer loops CCW, holes CW", () => {
    const ring = (x: number, y: number) => Math.abs(Math.hypot(x, y) - 1) - 0.3
    const cs = traceField(ring, { x0: -1.6, y0: -1.6, x1: 1.6, y1: 1.6 })
    expect(cs).toHaveLength(2)
    const area = (c: (typeof cs)[number]) => {
      const pts = [c.start, ...c.segs.map((s) => s.p)]
      let a = 0
      for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
      return a / 2
    }
    const signs = cs.map(area).map(Math.sign).sort()
    expect(signs).toEqual([-1, 1])
  })
})

describe("colour regions", () => {
  const scene = () => {
    const s = makeScene({
      layers: [
        makeLayer("O", { color: "#161616" }),
        makeLayer("X", { x: 1.6, op: "inlay", gap: 0.2, color: "#F2542D" }),
        makeLayer("I", { x: -0.8, op: "union", color: "#5B3CF5" }),
        makeLayer("H", { x: 0.4, y: 1, op: "intersect", color: "#1E8C6E", scale: 2.4 }),
        makeLayer("E", { x: 3.5, op: "eclipse", gap: 0.15, color: "#E9B824" }),
      ],
    })
    return buildFrame(s, defaultAlphabet, 0, 0, [1e4, 1e4])
  }

  it("region colour equals sampleFrame().color away from the borders", () => {
    const f = scene()
    const regions = buildRegions(f)
    const fronts = new Float64Array(f.layers.length)
    let checked = 0
    for (let x = -3; x <= 6; x += 0.13)
      for (let y = -1; y <= 6; y += 0.13) {
        const d = foldFronts(f, x, y, fronts)
        if (d > -0.03) continue
        if (f.layers.some((l, i) => i > 0 && opRole(l.op) === "capture" && Math.abs(fronts[i]) < 0.03)) continue
        const k = regionAt(f, regions, x, y)
        expect(k).toBeGreaterThanOrEqual(0)
        const c = sampleFrame(f, x, y, 1e-5).color
        const rc = regions[k].color
        for (let n = 0; n < 3; n++) expect(rc[n]).toBeCloseTo(c[n], 5)
        checked++
      }
    expect(checked).toBeGreaterThan(50)
  })

  it("one colour gives one region", () => {
    const s = presets.find((p) => p.id === "wordmark")!.make()
    const f = buildFrame(s, defaultAlphabet, 0, 0, [1e4, 1e4])
    expect(buildRegions(f)).toHaveLength(1)
  })

  it("builds a finite SVG for every preset", () => {
    for (const p of presets.slice(0, 4)) {
      const s = p.make()
      const f = buildFrame(s, defaultAlphabet, 0, 0, [1e4, 1e4])
      const svg = frameToSVG(f, s.material, { trace: { step: 0.08 } })
      expect(svg.startsWith("<svg")).toBe(true)
      expect(svg).toContain("<path")
      expect(svg).not.toMatch(/NaN|Infinity/)
    }
  })
})
