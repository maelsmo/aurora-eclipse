// Export: vector contours (SVG), raster (PNG), motion (WebM) and the recipe (JSON).
import fitCurve from "fit-curve"
import { contours } from "d3-contour"
import { frameBounds, sampleFrame, type Frame } from "../frame"
import type { Material, Scene } from "../scene"
import type { GlyphDef } from "../types"

const UNIT = 100 // SVG units per module

function ringPath(ring: number[][], toSvg: (p: number[]) => number[]) {
  const pts = ring.map(toSvg)
  if (pts.length < 4) return ""
  // Split each closed loop so the curve fitter sees two open runs.
  const mid = Math.floor((pts.length - 1) / 2)
  const curves = [...fitCurve(pts.slice(0, mid + 1), 0.25), ...fitCurve(pts.slice(mid), 0.25)]
  const f = (p: number[]) => p.map((n) => +n.toFixed(2)).join(" ")
  return "M" + f(pts[0]) + curves.map(([, a, b, e]) => "C" + [a, b, e].map(f).join(" ")).join("") + "Z"
}

type Grid = {
  w: number
  h: number
  step: number
  x0: number
  y1: number
}

function sampleGrid(frame: Frame, maxSamples: number, pad: number) {
  const b = frameBounds(frame, pad)
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0)
  const step = span / maxSamples
  const w = Math.ceil((b.x1 - b.x0) / step),
    h = Math.ceil((b.y1 - b.y0) / step)
  const d = new Float64Array(w * h),
    ov = new Float64Array(w * h)
  let r = 0,
    g = 0,
    bl = 0,
    n = 0
  for (let j = 0; j < h; j++) {
    const y = b.y1 - (j + 0.5) * step
    for (let i = 0; i < w; i++) {
      const s = sampleFrame(frame, b.x0 + (i + 0.5) * step, y, step)
      d[j * w + i] = s.d
      ov[j * w + i] = Math.max(s.d, s.overlapD)
      if (s.d < 0) {
        r += s.color[0]
        g += s.color[1]
        bl += s.color[2]
        n++
      }
    }
  }
  const grid: Grid = { w, h, step, x0: b.x0, y1: b.y1 }
  const avg = n ? [r / n, g / n, bl / n] : [0, 0, 0]
  return { grid, d, ov, avg }
}

function contourPath(values: Float64Array, grid: Grid, level: number) {
  const inv = Array.from(values, (v) => level - v)
  const shape = contours().size([grid.w, grid.h]).contour(inv, 0)
  const toSvg = (p: number[]) => [p[0] * grid.step * UNIT, p[1] * grid.step * UNIT]
  return shape.coordinates.flatMap((poly) => poly.map((ring) => ringPath(ring, toSvg))).join("")
}

const hex = (c: number[]) =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")

/** Builds an SVG of the frame: filled silhouette, or strokes for outline / isolines. */
export function frameToSVG(frame: Frame, material: Material, color?: string, maxSamples = 1400): string {
  const { grid, d, ov, avg } = sampleGrid(frame, maxSamples, Math.max(0.6, material.fill === "isolines" ? material.rings * material.spacing + 0.3 : 0.6))
  const W = +(grid.w * grid.step * UNIT).toFixed(2),
    H = +(grid.h * grid.step * UNIT).toFixed(2)
  const ink = color ?? hex(avg)
  const parts: string[] = []
  if (!material.transparent) parts.push(`<rect width="${W}" height="${H}" fill="${material.background}"/>`)
  if (material.fill === "outline") {
    parts.push(
      `<path d="${contourPath(d, grid, 0)}" fill="none" stroke="${ink}" stroke-width="${(material.line * UNIT).toFixed(2)}" stroke-linejoin="round"/>`,
    )
  } else if (material.fill === "isolines") {
    const rings: string[] = []
    for (let k = -material.rings; k <= material.rings; k++) {
      const path = contourPath(d, grid, k * material.spacing)
      if (path) rings.push(path)
    }
    parts.push(
      `<path d="${rings.join("")}" fill="none" stroke="${ink}" stroke-width="${(material.line * UNIT).toFixed(2)}" stroke-linejoin="round"/>`,
    )
  } else {
    parts.push(`<path d="${contourPath(d, grid, 0)}" fill="${ink}" fill-rule="nonzero"/>`)
    if (material.overlap > 0) {
      const p = contourPath(ov, grid, 0)
      if (p) parts.push(`<path d="${p}" fill="${material.overlapColor}" fill-opacity="${material.overlap.toFixed(2)}"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${(W / UNIT) * 10}mm" height="${(H / UNIT) * 10}mm">${parts.join("")}</svg>`
}

export type Recipe = {
  format: "aurora-eclipse/scene"
  version: 2
  created: string
  scene: Scene
  alphabet: { name: string; glyphs: Record<string, GlyphDef> }
}

export function makeRecipe(scene: Scene, alphabetName: string, glyphs: Record<string, GlyphDef>): Recipe {
  return {
    format: "aurora-eclipse/scene",
    version: 2,
    created: new Date().toISOString(),
    scene,
    alphabet: { name: alphabetName, glyphs },
  }
}

/** Records the studio canvas for `seconds` and resolves with a WebM blob. */
export function recordCanvas(canvas: HTMLCanvasElement, seconds: number, onProgress?: (p: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      reject(new Error("unsupported"))
      return
    }
    const stream = canvas.captureStream(60)
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t))
    if (!type) {
      reject(new Error("unsupported"))
      return
    }
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      resolve(new Blob(chunks, { type: "video/webm" }))
    }
    rec.onerror = () => reject(new Error("recorder"))
    rec.start(250)
    const t0 = performance.now()
    const tick = () => {
      const p = (performance.now() - t0) / (seconds * 1000)
      onProgress?.(Math.min(1, p))
      if (p >= 1) rec.stop()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export const fileStem = (scene: Scene) =>
  "aurora-eclipse_" + (scene.layers.map((l) => l.char).join("") || "scene").slice(0, 24)
