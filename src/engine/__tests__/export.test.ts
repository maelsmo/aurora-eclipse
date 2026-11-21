import { describe, expect, it } from "vitest"
import { traceField } from "../export/trace"
import { cubicPoint } from "../export/fit"
import { buildRegions, foldFronts, regionAt } from "../export/regions"
import { frameToSVG } from "../export/svg"
import { sdStroke } from "../sdf"
import { buildFrame, sampleFrame } from "../frame"
import { makeLayer, mergeScene } from "../scene"
import { defaultLibrary } from "../alphabet/sets"
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
    const s = mergeScene([
      makeLayer("O", { color: "#161616" }),
      makeLayer("X", { x: 1.6, op: "inlay", gap: 0.2, color: "#F2542D" }),
      makeLayer("I", { x: -0.8, op: "union", color: "#5B3CF5" }),
      makeLayer("H", { x: 0.4, y: 1, op: "intersect", color: "#1E8C6E", scale: 2.4 }),
      makeLayer("E", { x: 3.5, op: "eclipse", gap: 0.15, color: "#E9B824" }),
    ])
    return buildFrame(s, defaultLibrary(), 0, [1e4, 1e4])
  }

  it("region colour equals sampleFrame().color away from the borders", () => {
    const f = scene()
    const it = f.items[0]
    const regions = buildRegions(f, it)
    const fronts = new Float64Array(it.layers.length)
    let checked = 0
    for (let x = -3; x <= 6; x += 0.13)
      for (let y = -1; y <= 6; y += 0.13) {
        const d = foldFronts(f, it, x, y, fronts)
        if (d > -0.03) continue
        if (it.layers.some((l, i) => i > 0 && opRole(l.op) === "capture" && Math.abs(fronts[i]) < 0.03)) continue
        const k = regionAt(f, it, regions, x, y)
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
    const f = buildFrame(s, defaultLibrary(), 0, [1e4, 1e4])
    expect(buildRegions(f, f.items[0])).toHaveLength(1)
  })

  it("builds a finite SVG for every preset", () => {
    for (const p of presets.slice(0, 4)) {
      const s = p.make()
      const f = buildFrame(s, defaultLibrary(), 0, [1e4, 1e4])
      const svg = frameToSVG(f, s.material, { trace: { step: 0.08 } })
      expect(svg.startsWith("<svg")).toBe(true)
      expect(svg).toContain("<path")
      expect(svg).not.toMatch(/NaN|Infinity/)
    }
  })
})

describe("svg placement and native elements", () => {
  const lib = defaultLibrary()
  const box = { x0: -10, y0: -8, x1: 10, y1: 8 }
  const map = (p: Vec): Vec => [(p[0] - box.x0) * 100, (box.y1 - p[1]) * 100]

  it("places copies of a glyph with the matrix of their layer", async () => {
    const { makeScene } = await import("../scene")
    const { layerToWorld } = await import("../frame")
    const a = makeLayer("A", { x: 2, y: -1, rotation: 33, scale: 1.4, flipX: true })
    const b = makeLayer("A", { x: -5, y: 3, rotation: -70, scale: 0.7 })
    const s = makeScene({ layers: [a, b] })
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    const svg = frameToSVG(f, s.material, { box })
    // One traced glyph, two placements.
    expect(svg.match(/<use href="#[^"]+g\d+"/g)).toHaveLength(2)
    const ms = [...svg.matchAll(/transform="matrix\(([^)]+)\)"/g)].map((m) => m[1].split(" ").map(Number))
    f.items.forEach((it, i) => {
      const l = it.layers[0]
      const [ma, mb, mc, md, me, mf] = ms[i]
      for (const [gx, gy] of [
        [0.5, 0.5],
        [3, 4],
        [1.2, 2.5],
      ]) {
        const sx = gx * 100,
          sy = -gy * 100
        const [px, py] = map(layerToWorld(l, gx, gy))
        expect(ma * sx + mc * sy + me).toBeCloseTo(px, 1)
        expect(mb * sx + md * sy + mf).toBeCloseTo(py, 1)
      }
    })
    expect(svg).toContain('viewBox="0 0 2000 1600"')
  })

  it("keeps rectangles and ellipses native", async () => {
    const { makeScene, makeShape } = await import("../scene")
    const s = makeScene({ layers: [makeShape({ kind: "rect", w: 4, h: 2 }), makeShape({ kind: "ellipse", w: 3, h: 3 }, { x: 5 })] })
    const svg = frameToSVG(buildFrame(s, lib, 0, [1e4, 1e4]), s.material, { box })
    expect(svg).toContain("<rect x=")
    expect(svg).toContain("<ellipse ")
  })

  it("draws geometric lines as centre-line strokes with true arcs", async () => {
    const { makeScene, defaultLook } = await import("../scene")
    const s = makeScene({ set: "geo", layers: [makeLayer("O", { set: "geo" })], look: { ...defaultLook, mode: "lines", stripes: 1.6, stripeFill: 0.5 } })
    const svg = frameToSVG(buildFrame(s, lib, 0, [1e4, 1e4]), s.material, { box })
    expect(svg).toMatch(/fill="none" stroke-width="31.25"/)
    expect(svg).toMatch(/A\d/)
    expect(svg).toContain('stroke="#')
  })

  it("clips masked content", async () => {
    const { makeScene, makeShape, makeGroup, defaultCloner } = await import("../scene")
    const g = makeGroup("stack", { mask: true, cloner: { ...defaultCloner, cols: 4, rows: 4, dx: 2.5, dy: 2.5 } })
    const mask = { ...makeShape({ kind: "rect", w: 2, h: 2 }), parent: g.id }
    const tile = { ...makeLayer("■", { set: "geo" }), parent: g.id }
    const s = makeScene({ layers: [g, mask, tile] })
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    // Masked tiles are traced, not placed, and nothing outside the 2 × 2 mask survives.
    const svg = frameToSVG(f, s.material, { box })
    expect(svg).not.toContain("<use href")
    const xs = [...svg.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]) / 100 + box.x0)
    expect(Math.min(...xs)).toBeGreaterThan(-1.05)
    expect(Math.max(...xs)).toBeLessThan(1.05)
  })
})

describe("masks and fixed modules in export", () => {
  const lib = defaultLibrary()
  const box = { x0: -10, y0: -8, x1: 10, y1: 8 }

  it("clips outlines by the mask instead of outlining the mask edge", async () => {
    const { makeScene, makeShape, makeGroup, defaultLook } = await import("../scene")
    const { sampleItem } = await import("../frame")
    const g = makeGroup("stack", { mask: true })
    const mask = { ...makeShape({ kind: "rect", w: 2, h: 6 }), parent: g.id }
    const tile = { ...makeShape({ kind: "rect", w: 6, h: 2 }), parent: g.id }
    const s = makeScene({ layers: [g, mask, tile], look: { ...defaultLook, mode: "outline" } })
    const f = buildFrame(s, lib, 0, [1e4, 1e4])
    const it = f.items[0]
    // Inside the bar, on the mask edge: the bar's own field is still negative there.
    const smp = sampleItem(f, it, 1, 0)
    expect(smp.d).toBeLessThan(-0.5)
    expect(Math.abs(smp.mask!)).toBeLessThan(1e-6)
    const svg = frameToSVG(f, s.material, { box })
    expect(svg).toMatch(/clip-path="url\(#[^)]+mask-0\)"/)
  })

  it("keeps modules fixed as lines striped in a filled look", async () => {
    const { makeScene } = await import("../scene")
    const s = makeScene({ set: "geo", layers: [makeLayer("▤", { set: "geo" })] })
    const svg = frameToSVG(buildFrame(s, lib, 0, [1e4, 1e4]), s.material, { box })
    expect(svg).toMatch(/<path d="[^"]+" fill="none" stroke-width=/)
    expect(svg).toMatch(/<use [^>]*fill="#[0-9a-f]{6}" stroke="#[0-9a-f]{6}"/)
  })

  it("exports masked geometric lines as module stripes", async () => {
    const { makeScene, makeShape, makeGroup, defaultLook } = await import("../scene")
    const g = makeGroup("stack", { mask: true })
    const mask = { ...makeShape({ kind: "rect", w: 3, h: 3 }), parent: g.id }
    const letter = { ...makeLayer("O", { set: "geo" }), parent: g.id }
    const s = makeScene({ set: "geo", layers: [g, mask, letter], look: { ...defaultLook, mode: "lines", stripes: 1.6, stripeFill: 0.5 } })
    const svg = frameToSVG(buildFrame(s, lib, 0, [1e4, 1e4]), s.material, { box })
    expect(svg).toMatch(/A\d/)
    expect(svg).toContain("clip-path=")
  })
})
