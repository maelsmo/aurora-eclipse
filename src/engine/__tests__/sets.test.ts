import { describe, expect, it } from "vitest"
import { geoAlphabet, geoTiles } from "../alphabet/geo"
import { charset } from "../alphabet"
import { defaultLibrary, resolveGlyphSet } from "../alphabet/sets"
import { compileGlyph, glyphPrims } from "../compile"
import { defaultAxes } from "../axes"
import { arcCentre, isGeoPrim, onStripe, sdGlyph, sdPrim, sdRoundBox4, stripeCoord } from "../sdf"
import { primPoints, type CompiledGlyph, type CompiledPrim } from "../types"

/** Connected components of the inside on a grid (4-neighbourhood). */
function parts(g: CompiledGlyph, step = 0.05) {
  const x0 = g.box.x0 - 0.3,
    y0 = g.box.y0 - 0.3
  const w = Math.ceil((g.box.x1 - g.box.x0 + 0.6) / step),
    h = Math.ceil((g.box.y1 - g.box.y0 + 0.6) / step)
  const inside = new Uint8Array(w * h)
  let area = 0
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = sdGlyph(g, x0 + (i + 0.5) * step, y0 + (j + 0.5) * step) < 0
      inside[j * w + i] = v ? 1 : 0
      if (v) area++
    }
  const seen = new Uint8Array(w * h)
  let n = 0
  for (let k = 0; k < w * h; k++) {
    if (!inside[k] || seen[k]) continue
    n++
    const stack = [k]
    seen[k] = 1
    while (stack.length) {
      const q = stack.pop()!
      const i = q % w,
        j = (q - i) / w
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di,
          nj = j + dj
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
        const m = nj * w + ni
        if (inside[m] && !seen[m]) {
          seen[m] = 1
          stack.push(m)
        }
      }
    }
  }
  return { parts: n, area: area * step * step }
}

describe("geometric set", () => {
  it("covers the 59 letters plus pattern tiles", () => {
    for (const c of charset) expect(geoAlphabet[c], c).toBeDefined()
    expect(Object.keys(geoTiles).length).toBeGreaterThanOrEqual(6)
  })
  it("every node sits on the 1/8 module grid inside the metric zone", () => {
    for (const c of Object.keys(geoAlphabet))
      for (const p of glyphPrims(c, geoAlphabet)!)
        for (const [x, y] of primPoints(p)) {
          expect(Math.abs(x * 8 - Math.round(x * 8)), c).toBeLessThan(1e-9)
          expect(Math.abs(y * 8 - Math.round(y * 8)), c).toBeLessThan(1e-9)
          // Cut-outs may reach past the letter; ink stays in the metric zone.
          if ("neg" in p && p.neg) continue
          expect(y).toBeGreaterThanOrEqual(-1.25)
          expect(y).toBeLessThanOrEqual(6.25)
        }
  })
  it("letters are heavy single blocks; accents and descenders stay attached or apart as designed", () => {
    const wrong: string[] = []
    for (const c of charset) {
      const g = compileGlyph(c, geoAlphabet, defaultAxes, "geo-test")
      const t = parts(g)
      // Heavy blocks: at least a third of the 2-cell box is ink.
      expect(t.area, c).toBeGreaterThan(5 * 2.5 * 0.33)
      const expected = c === "Ё" ? 3 : c === "Й" || c === "Ы" ? 2 : c === "K" || c === "К" || c === "Ж" ? -1 : 1
      if (expected > 0 && t.parts !== expected) wrong.push(`${c}:${t.parts}`)
    }
    expect(wrong).toEqual([])
  })
  it("tiles sharing whole edges merge into one seamless field", () => {
    const g = compileGlyph("H", geoAlphabet, defaultAxes, "geo-test")
    expect(g.tiles!.filter((t) => isGeoPrim(t) && !t.neg)).toHaveLength(4)
    expect(g.prims.filter((p) => isGeoPrim(p) && !p.neg)).toHaveLength(1)
    // On the seam between two cells the field is negative, not zero.
    expect(sdGlyph(g, 1.25, 2.5)).toBeLessThan(-1)
    // With an inset the cells are taken one by one and a gap opens.
    expect(sdGlyph(g, 1.25, 2.5, 0.2)).toBeGreaterThan(0)
  })
  it("a corner radius of the full side makes a quarter disc", () => {
    // Cell 0…2.5 with the top-left corner rounded by 2.5: a disc around (2.5, 0).
    for (const [x, y] of [[0.3, 0.3], [1, 1], [2.4, 2.4], [0.2, 2.2], [1.25, 0.1]]) {
      const d = sdRoundBox4(x, y, 1.25, 1.25, 1.25, 1.25, [2.5, 0, 0, 0])
      const disc = Math.hypot(x - 2.5, y) - 2.5
      expect(Math.sign(d)).toBe(Math.sign(Math.max(disc, -Math.min(x, y, 2.5 - x, 2.5 - y))))
    }
    expect(sdRoundBox4(0.2, 2.3, 1.25, 1.25, 1.25, 1.25, [2.5, 0, 0, 0])).toBeCloseTo(Math.hypot(2.3, 2.3) - 2.5, 9)
  })
  it("the terminal axis cuts quarters straight at 0 (a quarter becomes a triangle)", () => {
    const round = compileGlyph("O", geoAlphabet, defaultAxes, "geo-test")
    const cut = compileGlyph("O", geoAlphabet, { ...defaultAxes, terminal: 0 }, "geo-test")
    // (0.8, 0.8) lies inside the bottom-left quarter disc, outside its chamfer x + y ≥ 2.5.
    expect(sdGlyph(round, 0.8, 0.8)).toBeLessThan(0)
    expect(sdGlyph(cut, 0.8, 0.8)).toBeGreaterThan(0)
    // On the chamfer line the cut field is zero; the corner stays empty in both.
    expect(Math.abs(sdGlyph(cut, 1.0, 1.5))).toBeLessThan(1e-6)
    expect(sdGlyph(round, 0.2, 0.2)).toBeGreaterThan(0)
    expect(sdGlyph(cut, 0.2, 0.2)).toBeGreaterThan(0)
  })
  it("at terminal 0 the confusable pairs differ in silhouette", () => {
    const axes = { ...defaultAxes, terminal: 0 }
    const ink = (c: string) => {
      const g = compileGlyph(c, geoAlphabet, axes, "geo-test")
      const out: boolean[] = []
      for (let y = 0.05; y < 5; y += 0.1) for (let x = 0.05; x < 5; x += 0.1) out.push(sdGlyph(g, x, y) < 0)
      return out
    }
    // Each letter is sampled once: sampling the second one inside the loop took seconds on a CI runner.
    const diff = (a: string, b: string) => {
      const ib = ink(b)
      return ink(a).reduce((n, v, i) => n + (v !== ib[i] ? 1 : 0), 0)
    }
    // Several percent of the 2 × 2 block, not just a slot.
    expect(diff("A", "H")).toBeGreaterThan(200)
    expect(diff("M", "U")).toBeGreaterThan(100)
  })
  it("stripes continue across the joint of a round cell and a stem", () => {
    // U: the stem cell (vertical stripes) stands on the quarter cell (arcs) along y = 2.5.
    const g = compileGlyph("U", geoAlphabet, defaultAxes, "geo-test")
    const tiles = g.tiles!.filter((t) => isGeoPrim(t) && !t.neg) as Extract<CompiledPrim, { neg: boolean }>[]
    const dome = tiles.find((t) => t.kind === "box" && t.c[0] < 2.5 && t.c[1] < 2.5)!
    const leg = tiles.find((t) => t.kind === "box" && t.c[0] < 2.5 && t.c[1] > 2.5)!
    expect(arcCentre(dome)).toEqual([2.5, 2.5])
    const n = 1.6,
      fill = 0.5
    let agree = 0,
      total = 0
    for (let x = 0.01; x < 2.45; x += 0.013) {
      const above = onStripe(stripeCoord(leg, x, 2.5 + 1e-6, 0), n, fill)
      const below = onStripe(stripeCoord(dome, x, 2.5 - 1e-6, 0), n, fill)
      total++
      if (above === below) agree++
    }
    expect(agree / total).toBeGreaterThan(0.99)
  })
  it("tiles that touch along a part of an edge are welded: no seam in the fill", () => {
    // J: the hook quarter meets the stem column along x = 2.5 below the bay; B: the stem meets
    // both bowls, and the bowls meet each other up to the waist notch.
    const j = compileGlyph("J", geoAlphabet, defaultAxes, "geo-test")
    for (const y of [0.4, 0.8, 1.2]) expect(sdGlyph(j, 2.5, y), `J ${y}`).toBeLessThan(-0.3)
    const b = compileGlyph("B", geoAlphabet, defaultAxes, "geo-test")
    for (const y of [0.5, 2.5, 4.5]) expect(sdGlyph(b, 2.5, y), `B stem ${y}`).toBeLessThan(-0.3)
    expect(sdGlyph(b, 3.2, 2.5)).toBeLessThan(-0.3)
    // The weld stops where the bowls part: the waist notch stays open.
    expect(sdGlyph(b, 4.7, 2.5)).toBeGreaterThan(0.1)
    // Welds never stick out of the letter: the ink is the union of the tiles, no more.
    for (const c of charset) {
      const g = compileGlyph(c, geoAlphabet, defaultAxes, "geo-test")
      const pos = g.tiles!.filter((t) => isGeoPrim(t) && !t.neg)
      for (let y = g.box.y0 - 0.2; y < g.box.y1 + 0.2; y += 0.11)
        for (let x = g.box.x0 - 0.2; x < g.box.x1 + 0.2; x += 0.11) {
          if (sdGlyph(g, x, y) >= -1e-3) continue
          const inTile = pos.some((t) => sdPrim(t, x, y) <= 1e-6)
          if (!inTile) throw new Error(`${c}: ink outside the tiles at ${x.toFixed(2)}, ${y.toFixed(2)}`)
        }
    }
  })
  it("no two letters share a silhouette, at round and at straight terminals", () => {
    const sample = (c: string, terminal: number) => {
      const g = compileGlyph(c, geoAlphabet, { ...defaultAxes, terminal }, "geo-test")
      const out: boolean[] = []
      for (let y = -1.2; y < 6.4; y += 0.125) for (let x = 0.0625; x < 7.5; x += 0.125) out.push(sdGlyph(g, x, y) < 0)
      return out
    }
    const same = (a: string, b: string) => {
      const base = (c: string): string => (geoAlphabet[c].base && !geoAlphabet[c].prims.length ? base(geoAlphabet[c].base!) : c)
      return base(a) === base(b)
    }
    const letters = [...charset]
    for (const terminal of [1, 0]) {
      const ink = new Map(letters.map((c) => [c, sample(c, terminal)]))
      const close: string[] = []
      for (let i = 0; i < letters.length; i++)
        for (let j = i + 1; j < letters.length; j++) {
          const a = letters[i],
            b = letters[j]
          if (same(a, b)) continue
          const ia = ink.get(a)!,
            ib = ink.get(b)!
          let d = 0
          for (let k = 0; k < ia.length; k++) if (ia[k] !== ib[k]) d++
          // 1/64 m² per sample: at least 0.75 m² of the 25 m² block differs.
          if (d < 48) close.push(`${a}${b}:${d}`)
        }
      expect(close, `terminal ${terminal}`).toEqual([])
    }
  })
  it("the library resolves letters through their own set, the scene set, the fallback", () => {
    const lib = defaultLibrary()
    expect(resolveGlyphSet(lib, "◜", undefined, "main")!.set.id).toBe("geo")
    expect(resolveGlyphSet(lib, "A", "geo", "main")!.set.id).toBe("geo")
    expect(resolveGlyphSet(lib, "A", "nope", "main")!.set.id).toBe("main")
    expect(resolveGlyphSet(lib, "@", undefined, "main")).toBeNull()
  })
})

describe("stored sets keep every field", () => {
  it("anchor, advance, base and look survive a save round trip", async () => {
    const { sanitizeSet } = await import("../../state/persist")
    const tile = geoTiles["◜"]
    const set = {
      id: "s1",
      name: "Плитки",
      kind: "shapes" as const,
      base: "geo" as const,
      glyphs: { "◜": { ...tile, prims: [...tile.prims] }, Ё: { base: "E", prims: [] }, A: { adv: 7.5, prims: geoAlphabet.A.prims } },
      look: { mode: "lines" as const, stripes: 1.6 },
      updated: 1,
    }
    const back = sanitizeSet(JSON.parse(JSON.stringify(set)))!
    expect(back.glyphs["◜"].anchor).toEqual([1.25, 1.25])
    expect(back.glyphs["Ё"].base).toBe("E")
    expect(back.glyphs.A.adv).toBe(7.5)
    expect(back.glyphs.A.prims).toHaveLength(geoAlphabet.A.prims.length)
    expect(back.look).toEqual({ mode: "lines", stripes: 1.6 })
    expect(back).toEqual(set)
  })

  it("drops broken anchors and unknown modules", async () => {
    const { sanitizeGlyphs } = await import("../../state/persist")
    const g = sanitizeGlyphs({ X: { anchor: [1, "a"], prims: [{ kind: "box", a: [0, 0], b: [1, 1] }, { kind: "laser" }] }, toolong: { prims: [] } })
    expect(Object.keys(g)).toEqual(["X"])
    expect(g.X.anchor).toBeUndefined()
    expect(g.X.prims).toHaveLength(1)
  })
})

describe("broken glyph data never reaches the compiler", () => {
  it("drops modules without their fields; a broken glyph compiles to nothing instead of throwing", async () => {
    const { sanitizePrim } = await import("../alphabet/sanitize")
    expect(sanitizePrim({ kind: "arc" })).toBeNull()
    expect(sanitizePrim({ kind: "box", a: [0, 0], b: [1, "x"] })).toBeNull()
    expect(sanitizePrim({ kind: "poly", pts: [[0, 0], [1, 1]] })).toBeNull()
    expect(sanitizePrim({ kind: "box", a: [0, 0], b: [2.5, 2.5], r: [2.5, 0, 0, 0], dir: "arc", junk: 1 })).toEqual({ kind: "box", a: [0, 0], b: [2.5, 2.5], r: [2.5, 0, 0, 0], dir: "arc" })
    const g = compileGlyph("Z", { Z: { prims: [{ kind: "arc" } as never] } }, defaultAxes, "broken-test")
    expect(g.prims).toHaveLength(0)
  })

  it("a recipe with broken modules loads and draws", async () => {
    const { readRecipe } = await import("../../state/recipe")
    const { buildFrame } = await import("../frame")
    const { makeLibrary, mainSet } = await import("../alphabet/sets")
    const { makeScene, makeLayer } = await import("../scene")
    const recipe = {
      format: "aurora-eclipse/scene",
      version: 3,
      scene: JSON.parse(JSON.stringify(makeScene({ set: "bad", layers: [makeLayer("A")] }))),
      sets: [{ id: "bad", name: "Битый", kind: "strokes", base: "default", glyphs: { A: { prims: [{ kind: "arc" }, { kind: "dot", c: [1, 1] }] } } }],
    }
    const res = readRecipe(recipe, [mainSet()])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sets[0].glyphs.A.prims).toEqual([{ kind: "dot", c: [1, 1] }])
    const lib = makeLibrary([mainSet(), ...res.sets], 1)
    expect(() => buildFrame(res.scene, lib, 0, [1e4, 1e4])).not.toThrow()
  })

  it("a v2 recipe brings its alphabet as a set", async () => {
    const { readRecipe } = await import("../../state/recipe")
    const { mainSet, geoSet } = await import("../alphabet/sets")
    const v2 = {
      format: "aurora-eclipse/scene",
      version: 2,
      scene: { v: 2, layers: [{ id: "a", char: "A", x: 0, y: 0, scale: 1, rotation: 0, color: "#161616", op: "union" }] },
      alphabet: { name: "Мой v2", glyphs: { A: { prims: [{ kind: "stroke", a: [0.5, 0.5], b: [0.5, 4.5] }] } } },
    }
    const res = readRecipe(v2, [mainSet(), geoSet()])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sets).toHaveLength(1)
    expect(res.sets[0].name).toBe("Мой v2")
    expect(res.scene.set).toBe(res.sets[0].id)
    // Loading it again into a library that now has it: reused, not copied.
    const again = readRecipe(v2, [mainSet(), geoSet(), res.sets[0]])
    expect(again.ok && again.sets).toEqual([])
    expect(again.ok && again.scene.set).toBe(res.sets[0].id)
  })

  it("an own recipe in the same session reuses the set whatever the key order; duplicate ids come in once", async () => {
    const { readRecipe } = await import("../../state/recipe")
    const { mainSet } = await import("../alphabet/sets")
    const { makeScene } = await import("../scene")
    // As the constructor stores an edited glyph: advance first, then modules.
    const mine = { ...mainSet(), id: "mine", glyphs: { A: { adv: 4, prims: [{ kind: "dot" as const, c: [1, 1] as [number, number] }] } } }
    const fileSet = { ...mine, glyphs: { A: { prims: [{ c: [1, 1], kind: "dot" }], adv: 4 } } }
    const recipe = { format: "aurora-eclipse/scene", version: 3, scene: JSON.parse(JSON.stringify(makeScene({ set: "mine" }))), sets: [fileSet, { ...fileSet, name: "copy" }] }
    const res = readRecipe(recipe, [mainSet(), mine])
    expect(res.ok && res.sets).toEqual([])
    const fresh = readRecipe(recipe, [mainSet()])
    expect(fresh.ok && fresh.sets.map((s) => s.id)).toEqual(["mine"])
  })
})
