// SVG of one frame from exact contours: every draw item becomes a group;
// colour regions are filled paths, outline, isolines and lines are strokes
// along centre lines, halftone is circles. Letters, shapes and clones that
// repeat one glyph are traced once into <defs> and placed with <use>;
// rectangles and ellipses stay native elements.
import { frameBounds, layerBounds, layerField, sampleItem, warpPoint, warpReach, type Frame, type FrameItem, type FrameLayer, type RGB } from "../frame"
import { clamp, isGeoPrim, sdGlyph } from "../sdf"
import type { CompiledGlyph } from "../types"
import { moduleStripes, stripesPath } from "./stripes"
import type { Look, Material } from "../scene/types"
import type { Box, Vec } from "../types"
import { buildRegions, foldFronts, itemBounds, regionField, type Region } from "./regions"
import { contoursToPath, traceField, traceLevels, type Field, type TraceOptions } from "./trace"

/** SVG units per module; 1 module = 10 mm. */
export const UNIT = 100

export type SvgOptions = {
  transparent?: boolean
  trace?: TraceOptions
  /** Frame of the file in world units (the artboard); fitted to the content when absent. */
  box?: Box
}

export const hex = (c: readonly number[]) =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("")

/** Material features that a vector file cannot carry. */
export function vectorWarnings(m: Material, looks: Look[]): string[] {
  const out: string[] = []
  if (m.glow > 0) out.push("корона")
  if (m.shadow > 0) out.push("тень")
  if (m.grain > 0) out.push("зерно")
  if (looks.some((l) => l.colorMode === "aurora")) out.push("аврора (цвета слоёв вместо неё)")
  if (looks.some((l) => l.colorMode === "depth")) out.push("градиент глубины (цвета слоёв вместо него)")
  if (m.overlap > 0 && looks.some((l) => l.mode !== "fill")) out.push("полутень в линейных режимах")
  return out
}

const intersect = (a: Box, b: Box): Box => ({
  x0: Math.max(a.x0, b.x0),
  y0: Math.max(a.y0, b.y0),
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
})

function lookReach(it: FrameItem) {
  const l = it.look
  return l.mode === "isolines" ? l.rings * l.spacing + l.spacing : l.mode === "outline" ? l.line : l.mode === "halftone" ? l.dot * 1.3 : 0
}

function frontField(f: Frame, it: FrameItem, r: Region): Field | null {
  if (r.layers.includes(-1)) return null
  const fronts = new Float64Array(it.layers.length)
  return (x, y) => {
    foldFronts(f, it, x, y, fronts)
    let m = Infinity
    for (const i of r.layers) m = Math.min(m, fronts[i])
    return m
  }
}

/** Can this item be drawn as a placed copy of its glyph (no warp, mask or per-pixel colour)? */
function placeable(f: Frame, it: FrameItem) {
  return (
    it.kind === "solo" &&
    !it.mask &&
    warpReach(f.warp) === 0 &&
    it.look.colorMode === "layer" &&
    (it.look.mode === "fill" || (it.look.mode === "lines" && !!it.layers[0].glyph.tiles?.length))
  )
}

/** SVG matrix placing glyph units (y up, × UNIT, y flipped) of a layer on the page. */
function placement(l: FrameLayer, box: Box) {
  const s = l.scale,
    m = l.mirror
  const a = s * l.cos * m,
    b = -s * l.sin * m,
    c = s * l.sin,
    d = s * l.cos
  const e = UNIT * (l.x - box.x0) - UNIT * s * (l.cos * m * l.ax - l.sin * l.ay)
  const f = UNIT * (box.y1 - l.y) + UNIT * s * (l.sin * m * l.ax + l.cos * l.ay)
  const n = (v: number) => +v.toFixed(5)
  return `matrix(${n(a)} ${n(b)} ${n(c)} ${n(d)} ${+e.toFixed(2)} ${+f.toFixed(2)})`
}

/** A glyph that is one plain rectangle or ellipse: its native SVG element in glyph units. */
function nativeShape(g: CompiledGlyph, inset: number): string | null {
  if (g.prims.length !== 1 || g.shear !== 0 || g.fillet > 0 || g.ink !== 0 || inset > 0) return null
  const p = g.prims[0]
  if (!isGeoPrim(p) || p.neg || p.mode === 2 || p.mode === 3) return null
  const U = UNIT,
    n = (v: number) => +v.toFixed(2)
  if (p.kind === "box") {
    const r = p.r[0]
    if (!p.r.every((v) => Math.abs(v - r) < 1e-9) || r > Math.min(p.h[0], p.h[1]) + 1e-9) return null
    return `<rect x="${n((p.c[0] - p.h[0]) * U)}" y="${n(-(p.c[1] + p.h[1]) * U)}" width="${n(2 * p.h[0] * U)}" height="${n(2 * p.h[1] * U)}"${r > 0 ? ` rx="${n(r * U)}"` : ""}/>`
  }
  if (p.kind === "ellipse") return `<ellipse cx="${n(p.c[0] * U)}" cy="${n(-p.c[1] * U)}" rx="${n(p.rx * U)}" ry="${n(p.ry * U)}"/>`
  return null
}

/**
 * Builds the SVG. `onProgress` receives 0…1 while contours are traced.
 */
export function frameToSVG(frame: Frame, material: Material, opts: SvgOptions = {}, onProgress?: (p: number) => void): string {
  const m = material
  const transparent = opts.transparent ?? m.transparent
  const wr = warpReach(frame.warp)
  const reach = Math.max(0, ...frame.items.map(lookReach))
  const box = opts.box ?? frameBounds(frame, 0.6 + reach + wr)
  const W = +((box.x1 - box.x0) * UNIT).toFixed(2),
    H = +((box.y1 - box.y0) * UNIT).toFixed(2)
  const map = (p: Vec): Vec => [(p[0] - box.x0) * UNIT, (box.y1 - p[1]) * UNIT]
  const path = (f: Field, b: Box) => contoursToPath(traceField(f, intersect(b, box), opts.trace), map)
  // Ids stay unique when several exported files are inlined into one page.
  const uidPrefix = "ae" + Math.random().toString(36).slice(2, 7) + "-"
  const defs: string[] = []
  const groups: string[] = []
  // Traced glyphs and stripe bundles shared by every copy: glyph → look key → def id.
  const shared = new Map<CompiledGlyph, Map<string, string | null>>()
  const local = (p: Vec): Vec => [p[0] * UNIT, -p[1] * UNIT]
  /** Fill defs that also carry stripes (their copies need a stroke colour too). */
  const striped = new Set<string>()

  /** Def of a glyph drawn by a look in its own units, traced once; null when it draws nothing. */
  const glyphDef = (g: CompiledGlyph, look: Look): string | null => {
    const key = `${look.mode}|${look.inset}|${look.stripes}|${look.stripeFill}|${look.lineDir ?? ""}`
    let byLook = shared.get(g)
    if (!byLook) shared.set(g, (byLook = new Map()))
    if (byLook.has(key)) return byLook.get(key)!
    const id = `${uidPrefix}g${defs.length}`
    let body: string | null = null
    if (look.mode === "lines") {
      const st = moduleStripes(g, look.inset, look.lineDir, look.stripes)
      // Stripes in glyph units: a layer of scale 1 at the origin (world = glyph − anchor).
      const unitLayer = { x: 0, y: 0, cos: 1, sin: 0, scale: 1, mirror: 1, ax: 0, ay: 0, glyph: g } as FrameLayer
      const d = stripesPath(st, unitLayer, local, UNIT, contoursToPath)
      if (d) body = `<path d="${d}" fill="none" stroke-width="${+((look.stripeFill / Math.max(look.stripes, 0.1)) * UNIT).toFixed(2)}"/>`
    } else {
      body = nativeShape(g, look.inset)
      if (!body) {
        // Modules a set fixes as lines stay stripes in any look, as on screen.
        const forced = !!g.tiles?.some((t) => isGeoPrim(t) && !t.neg && t.mode === 2)
        const b = g.box
        const pad = 0.6 + Math.max(0, g.ink)
        const cs = traceField((x, y) => sdGlyph(g, x, y, look.inset, forced), { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, opts.trace)
        const d = contoursToPath(cs, local)
        const parts: string[] = []
        if (d) parts.push(forced ? `<path d="${d}" stroke="none"/>` : `<path d="${d}"/>`)
        if (forced) {
          const st = moduleStripes(g, look.inset, look.lineDir, look.stripes, true)
          const unitLayer = { x: 0, y: 0, cos: 1, sin: 0, scale: 1, mirror: 1, ax: 0, ay: 0, glyph: g } as FrameLayer
          const sd = stripesPath(st, unitLayer, local, UNIT, contoursToPath)
          if (sd) {
            parts.push(`<path d="${sd}" fill="none" stroke-width="${+((look.stripeFill / Math.max(look.stripes, 0.1)) * UNIT).toFixed(2)}"/>`)
            striped.add(id)
          }
        }
        if (parts.length) body = parts.join("")
      }
    }
    if (body) defs.push(`<g id="${id}">${body}</g>`)
    byLook.set(key, body ? id : null)
    return body ? id : null
  }

  const plan = frame.items.map((it) => ({ it, regions: placeable(frame, it) ? [] : buildRegions(frame, it) }))
  const total = Math.max(1, plan.reduce((n, p) => n + p.regions.length + 1 + (m.overlap > 0 ? 1 : 0), 0))
  let done = 0
  const tick = () => onProgress?.(Math.min(1, ++done / total))

  plan.forEach(({ it, regions }, ii) => {
    const look = it.look
    const parts: string[] = []
    const op = it.opacity < 1 ? ` opacity="${+it.opacity.toFixed(3)}"` : ""
    if (placeable(frame, it)) {
      const l = it.layers[0]
      const id = glyphDef(l.glyph, look)
      tick()
      if (id) {
        const paint = look.mode === "lines" ? `stroke="${hex(l.color)}"` : `fill="${hex(l.color)}"${striped.has(id) ? ` stroke="${hex(l.color)}"` : ""}`
        groups.push(`<use href="#${id}" transform="${placement(l, box)}" ${paint}${op}/>`)
      }
      return
    }
    // Looks other than fill are clipped by the mask afterwards (their own field stays whole).
    let clipAttr = ""
    if (it.mask && look.mode !== "fill") {
      const mk = it.mask
      const d = path((x, y) => {
        const [wx, wy] = warpPoint(frame, x, y)
        return layerField(mk, wx, wy)
      }, layerBounds(mk, 0.3 + wr))
      const id = `${uidPrefix}mask-${ii}`
      defs.push(`<clipPath id="${id}"><path d="${d || "M0 0"}"/></clipPath>`)
      clipAttr = ` clip-path="url(#${id})"`
    }
    const d0: Field = (x, y) => foldFronts(frame, it, x, y)
    const fuse = Math.max(0, ...it.layers.map((l) => (l.op === "fuse" ? l.k * 0.3 : 0)))
    const ibox = itemBounds(it, 0.6 + lookReach(it) + wr + fuse)
    if (look.mode === "fill") {
      for (const r of regions) {
        const d = path(regionField(frame, it, r), r.box)
        tick()
        if (d) parts.push(`<path d="${d}" fill="${hex(r.color)}"/>`)
      }
      if (m.overlap > 0 && it.layers.length > 1) {
        const d = path((x, y) => {
          const s = sampleItem(frame, it, x, y)
          return Math.max(s.d, s.overlapD)
        }, ibox)
        tick()
        if (d) parts.push(`<path d="${d}" fill="${m.overlapColor}" fill-opacity="${m.overlap.toFixed(3)}"/>`)
      }
    } else if (look.mode === "lines" && it.kind === "solo" && it.layers[0].glyph.tiles?.length) {
      // Geometric letters keep their module stripes (placed rigidly; warps are not followed).
      const l = it.layers[0]
      const st = moduleStripes(l.glyph, look.inset, look.lineDir, look.stripes)
      const d = stripesPath(st, l, map, UNIT, contoursToPath)
      tick()
      const w = (look.stripeFill / Math.max(look.stripes, 0.1)) * l.scale * UNIT
      if (d) parts.push(`<path d="${d}" fill="none" stroke="${hex(l.color)}" stroke-width="${+w.toFixed(2)}"/>`)
    } else if (look.mode === "outline" || look.mode === "isolines" || look.mode === "lines") {
      // Centre lines of the strokes, traced from one sampling of the field.
      // Lines follow the contour inwards: stripe k is centred (k + ½) / n inside
      // (glyph units of a single object, world units of a merge group).
      const sp = Math.max(look.spacing, 0.02)
      const n = Math.max(1, Math.round(look.rings))
      const unit = it.kind === "solo" ? it.layers[0].scale : 1
      const pitch = unit / Math.max(look.stripes, 0.1)
      const depth = Math.max(...it.layers.map((l) => (l.glyph.box.y1 - l.glyph.box.y0) * l.scale)) / 2
      const levels =
        look.mode === "outline"
          ? [0]
          : look.mode === "lines"
            ? Array.from({ length: Math.min(200, Math.ceil(depth / pitch)) }, (_, k) => -(k + 0.5) * pitch)
            : Array.from({ length: 2 * n + 1 }, (_, k) => (k - n) * sp)
      const width = look.mode === "lines" ? look.stripeFill * pitch : look.line
      const traced = traceLevels(d0, intersect(ibox, box), levels, opts.trace)
      const lines = traced
        .map((cs, k) => ({ d: contoursToPath(cs, map), opacity: look.mode === "isolines" && Math.abs(k - n) === n ? 0.5 : 1 }))
        .filter((l) => l.d)
      tick()
      if (!lines.length) return
      const linesId = `${uidPrefix}lines-${ii}`
      defs.push(
        `<g id="${linesId}" fill="none" stroke-width="${(width * UNIT).toFixed(2)}" stroke-linejoin="round">` +
          lines.map((l) => `<path d="${l.d}"${l.opacity < 1 ? ` stroke-opacity="${l.opacity}"` : ""}/>`).join("") +
          "</g>",
      )
      // Each colour region repaints the lines inside its own area (clip by its front).
      const band = lookReach(it) + width
      regions.forEach((r, i) => {
        const ff = frontField(frame, it, r)
        if (!ff) {
          parts.push(`<use href="#${linesId}" stroke="${hex(r.color)}"/>`)
          tick()
          return
        }
        const clip = path((x, y) => Math.max(ff(x, y), Math.abs(d0(x, y)) - band), {
          x0: r.box.x0 - band,
          y0: r.box.y0 - band,
          x1: r.box.x1 + band,
          y1: r.box.y1 + band,
        })
        tick()
        if (!clip) return
        const id = `${uidPrefix}region-${ii}-${i}`
        defs.push(`<clipPath id="${id}"><path d="${clip}"/></clipPath>`)
        parts.push(`<use href="#${linesId}" stroke="${hex(r.color)}" clip-path="url(#${id})"/>`)
      })
    } else {
      // Halftone: one circle per raster cell, radius from the depth at its centre.
      const c = Math.max(look.dot, 0.02)
      const b = intersect(ibox, box)
      const byColor = new Map<string, string[]>()
      for (let gy = Math.floor(b.y0 / c); gy <= Math.ceil(b.y1 / c); gy++)
        for (let gx = Math.floor(b.x0 / c); gx <= Math.ceil(b.x1 / c); gx++) {
          const x = (gx + 0.5) * c,
            y = (gy + 0.5) * c
          const s = sampleItem(frame, it, x, y)
          const depth = clamp(0.5 - s.d / (2.5 * c), 0, 1)
          if (depth < 0.001) continue
          const r = c * 0.58 * Math.sqrt(depth)
          const [px, py] = map([x, y])
          const key = hex(s.color as RGB)
          let list = byColor.get(key)
          if (!list) byColor.set(key, (list = []))
          list.push(`<circle cx="${+px.toFixed(2)}" cy="${+py.toFixed(2)}" r="${+(r * UNIT).toFixed(2)}"/>`)
        }
      for (const [color, list] of byColor) parts.push(`<g fill="${color}">${list.join("")}</g>`)
      tick()
    }
    if (parts.length) groups.push(`<g id="${uidPrefix}${it.id.replace(/#/g, "-")}"${op}${clipAttr}>${parts.join("")}</g>`)
  })
  onProgress?.(1)
  const bg = transparent ? "" : `<rect width="${W}" height="${H}" fill="${m.background}"/>`
  // With a fixed frame, copies placed past its edge are clipped like the traced shapes.
  const frameClip = opts.box ? `${uidPrefix}frame` : ""
  if (frameClip) defs.push(`<clipPath id="${frameClip}"><rect width="${W}" height="${H}"/></clipPath>`)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${+((W / UNIT) * 10).toFixed(2)}mm" height="${+((H / UNIT) * 10).toFixed(2)}mm">`
  return (
    head +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    bg +
    `<g id="composition"${frameClip ? ` clip-path="url(#${frameClip})"` : ""}>${groups.join("")}</g></svg>`
  )
}
