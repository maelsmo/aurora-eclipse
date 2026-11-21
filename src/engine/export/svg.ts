// SVG of one frame from exact contours: every draw item becomes a group;
// colour regions are filled paths, outline and isolines are strokes,
// halftone is circles.
import { frameBounds, sampleItem, warpReach, type Frame, type FrameItem, type RGB } from "../frame"
import { clamp } from "../sdf"
import type { Look, Material } from "../scene/types"
import type { Box, Vec } from "../types"
import { buildRegions, foldFronts, itemBounds, regionField, type Region } from "./regions"
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

/**
 * Builds the SVG. `onProgress` receives 0…1 while contours are traced.
 */
export function frameToSVG(frame: Frame, material: Material, opts: SvgOptions = {}, onProgress?: (p: number) => void): string {
  const m = material
  const transparent = opts.transparent ?? m.transparent
  const wr = warpReach(frame.warp)
  const reach = Math.max(0, ...frame.items.map(lookReach))
  const box = frameBounds(frame, 0.6 + reach + wr)
  const W = +((box.x1 - box.x0) * UNIT).toFixed(2),
    H = +((box.y1 - box.y0) * UNIT).toFixed(2)
  const map = (p: Vec): Vec => [(p[0] - box.x0) * UNIT, (box.y1 - p[1]) * UNIT]
  const path = (f: Field, b: Box) => contoursToPath(traceField(f, intersect(b, box), opts.trace), map)
  // Ids stay unique when several exported files are inlined into one page.
  const uidPrefix = "ae" + Math.random().toString(36).slice(2, 7) + "-"
  const defs: string[] = []
  const groups: string[] = []

  const plan = frame.items.map((it) => ({ it, regions: buildRegions(frame, it) }))
  const total = Math.max(1, plan.reduce((n, p) => n + p.regions.length + 1 + (m.overlap > 0 ? 1 : 0), 0))
  let done = 0
  const tick = () => onProgress?.(Math.min(1, ++done / total))

  plan.forEach(({ it, regions }, ii) => {
    const look = it.look
    const parts: string[] = []
    const d0: Field = (x, y) => foldFronts(frame, it, x, y)
    const fuse = Math.max(0, ...it.layers.map((l) => (l.op === "fuse" ? l.k * 0.3 : 0)))
    const ibox = itemBounds(it, 0.6 + lookReach(it) + wr + fuse)
    if (look.mode === "fill" || look.mode === "lines") {
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
    } else if (look.mode === "outline" || look.mode === "isolines") {
      // Centre lines of the strokes, traced from one sampling of the field.
      const sp = Math.max(look.spacing, 0.02)
      const n = Math.max(1, Math.round(look.rings))
      const levels = look.mode === "outline" ? [0] : Array.from({ length: 2 * n + 1 }, (_, k) => (k - n) * sp)
      const traced = traceLevels(d0, intersect(ibox, box), levels, opts.trace)
      const lines = traced
        .map((cs, k) => ({ d: contoursToPath(cs, map), opacity: look.mode === "isolines" && Math.abs(k - n) === n ? 0.5 : 1 }))
        .filter((l) => l.d)
      tick()
      const linesId = `${uidPrefix}lines-${ii}`
      defs.push(
        `<g id="${linesId}" fill="none" stroke-width="${(look.line * UNIT).toFixed(2)}" stroke-linejoin="round">` +
          lines.map((l) => `<path d="${l.d}"${l.opacity < 1 ? ` stroke-opacity="${l.opacity}"` : ""}/>`).join("") +
          "</g>",
      )
      // Each colour region repaints the lines inside its own area (clip by its front).
      const band = lookReach(it) + look.line
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
    if (parts.length) {
      const op = it.opacity < 1 ? ` opacity="${+it.opacity.toFixed(3)}"` : ""
      groups.push(`<g id="${uidPrefix}${it.id}"${op}>${parts.join("")}</g>`)
    }
  })
  onProgress?.(1)
  const bg = transparent ? "" : `<rect width="${W}" height="${H}" fill="${m.background}"/>`
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${+((W / UNIT) * 10).toFixed(2)}mm" height="${+((H / UNIT) * 10).toFixed(2)}mm">`
  return head + (defs.length ? `<defs>${defs.join("")}</defs>` : "") + bg + `<g id="composition">${groups.join("")}</g></svg>`
}
