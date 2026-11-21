// SVG of one frame from exact contours: colour regions as filled paths,
// outline and isolines as strokes, halftone as circles.
import { frameBounds, sampleFrame, warpReach, type Frame, type RGB } from "../frame"
import { clamp } from "../sdf"
import type { Material } from "../scene"
import type { Box, Vec } from "../types"
import { buildRegions, foldFronts, regionField, type Region } from "./regions"
import { contoursToPath, traceField, traceLevels, type Field, type TraceOptions } from "./trace"

/** SVG units per module; 1 module = 10 mm. */
export const UNIT = 100

export type SvgOptions = {
  transparent?: boolean
  trace?: TraceOptions
}

export const hex = (c: readonly number[]) =>
  "#" + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0")).join("")

/** Material features that a vector file cannot carry. */
export function vectorWarnings(m: Material): string[] {
  const out: string[] = []
  if (m.glow > 0) out.push("корона")
  if (m.shadow > 0) out.push("тень")
  if (m.grain > 0) out.push("зерно")
  if (m.colorMode === "aurora") out.push("аврора (цвета слоёв вместо неё)")
  if (m.colorMode === "depth") out.push("градиент глубины (цвета слоёв вместо него)")
  if (m.overlap > 0 && m.fill !== "fill") out.push("полутень в линейных режимах")
  return out
}

const intersect = (a: Box, b: Box): Box => ({
  x0: Math.max(a.x0, b.x0),
  y0: Math.max(a.y0, b.y0),
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
})

function frontField(f: Frame, r: Region): Field | null {
  if (r.layers.includes(-1)) return null
  const fronts = new Float64Array(f.layers.length)
  return (x, y) => {
    foldFronts(f, x, y, fronts)
    let m = Infinity
    for (const i of r.layers) m = Math.min(m, fronts[i])
    return m
  }
}

/**
 * Builds the SVG. `onProgress` receives 0…1 while contours are traced.
 */
export function frameToSVG(frame: Frame, material: Material, opts: SvgOptions = {}, onProgress?: (p: number) => void): string {
  const m = material
  const transparent = opts.transparent ?? m.transparent
  const reach =
    m.fill === "isolines" ? m.rings * m.spacing + m.spacing : m.fill === "outline" ? m.line : m.fill === "halftone" ? m.dot : 0
  const box = frameBounds(frame, 0.6 + reach + warpReach(frame.warp))
  const W = +((box.x1 - box.x0) * UNIT).toFixed(2),
    H = +((box.y1 - box.y0) * UNIT).toFixed(2)
  const map = (p: Vec): Vec => [(p[0] - box.x0) * UNIT, (box.y1 - p[1]) * UNIT]
  const path = (f: Field, b: Box) => contoursToPath(traceField(f, intersect(b, box), opts.trace), map)
  const d0: Field = (x, y) => foldFronts(frame, x, y)
  const parts: string[] = []
  const defs: string[] = []
  const bg = transparent ? "" : `<rect width="${W}" height="${H}" fill="${m.background}"/>`

  const regions = frame.layers.length ? buildRegions(frame) : []
  const lw = (m.line * UNIT).toFixed(2)
  const total = Math.max(1, regions.length + 1 + (m.overlap > 0 ? 1 : 0))
  // Ids stay unique when several exported files are inlined into one page.
  const uidPrefix = "ae" + Math.random().toString(36).slice(2, 7) + "-"
  let done = 0
  const tick = () => onProgress?.(Math.min(1, ++done / total))

  if (m.fill === "fill") {
    for (const r of regions) {
      const d = path(regionField(frame, r), r.box)
      tick()
      if (d) parts.push(`<path d="${d}" fill="${hex(r.color)}"/>`)
    }
    if (m.overlap > 0 && frame.layers.length > 1) {
      const d = path((x, y) => {
        const s = sampleFrame(frame, x, y)
        return Math.max(s.d, s.overlapD)
      }, box)
      tick()
      if (d) parts.push(`<path d="${d}" fill="${m.overlapColor}" fill-opacity="${m.overlap.toFixed(3)}"/>`)
    }
  } else if (m.fill === "outline" || m.fill === "isolines") {
    // Centre lines of the strokes, traced from one sampling of the field.
    const sp = Math.max(m.spacing, 0.02)
    const n = Math.max(1, Math.round(m.rings))
    const levels = m.fill === "outline" ? [0] : Array.from({ length: 2 * n + 1 }, (_, k) => (k - n) * sp)
    const traced = traceLevels(d0, box, levels, opts.trace)
    const lines = traced
      .map((cs, k) => ({ d: contoursToPath(cs, map), opacity: m.fill === "isolines" && Math.abs(k - n) === n ? 0.5 : 1 }))
      .filter((l) => l.d)
    tick()
    const linesId = uidPrefix + "lines"
    defs.push(
      `<g id="${linesId}" fill="none" stroke-width="${lw}" stroke-linejoin="round">` +
        lines.map((l) => `<path d="${l.d}"${l.opacity < 1 ? ` stroke-opacity="${l.opacity}"` : ""}/>`).join("") +
        "</g>",
    )
    // Each colour region repaints the lines inside its own area (clip by its front).
    const band = reach + m.line
    regions.forEach((r, i) => {
      const ff = frontField(frame, r)
      if (!ff) {
        parts.push(`<use href="#${linesId}" stroke="${hex(r.color)}"/>`)
        tick()
        return
      }
      const clip = path((x, y) => Math.max(ff(x, y), Math.abs(d0(x, y)) - band), { ...r.box, x0: r.box.x0 - band, y0: r.box.y0 - band, x1: r.box.x1 + band, y1: r.box.y1 + band })
      tick()
      if (!clip) return
      const id = uidPrefix + "region-" + i
      defs.push(`<clipPath id="${id}"><path d="${clip}"/></clipPath>`)
      parts.push(`<use href="#${linesId}" stroke="${hex(r.color)}" clip-path="url(#${id})"/>`)
    })
  } else {
    // Halftone: one circle per raster cell, radius from the depth at its centre.
    const c = Math.max(m.dot, 0.02)
    const byColor = new Map<string, string[]>()
    for (let gy = Math.floor(box.y0 / c); gy <= Math.ceil(box.y1 / c); gy++)
      for (let gx = Math.floor(box.x0 / c); gx <= Math.ceil(box.x1 / c); gx++) {
        const x = (gx + 0.5) * c,
          y = (gy + 0.5) * c
        const s = sampleFrame(frame, x, y)
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
  onProgress?.(1)
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${+((W / UNIT) * 10).toFixed(2)}mm" height="${+((H / UNIT) * 10).toFixed(2)}mm">`
  return head + (defs.length ? `<defs>${defs.join("")}</defs>` : "") + bg + `<g id="composition">${parts.join("")}</g></svg>`
}
