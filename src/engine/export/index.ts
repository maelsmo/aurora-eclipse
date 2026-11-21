// Export: vector contours (SVG), raster (PNG), motion (WebM) and the recipe (JSON).
import type { Frame } from "../frame"
import type { Material, Scene } from "../scene/types"
import type { GlyphSet } from "../alphabet/sets"
import { frameToSVG, type SvgOptions } from "./svg"
import type { SvgRequest, SvgResponse } from "./worker"

export { frameToSVG, vectorWarnings } from "./svg"

let seq = 0

/** Traces the SVG in a Web Worker (falls back to the main thread). */
export function exportSVG(frame: Frame, material: Material, opts: SvgOptions = {}, onProgress?: (p: number) => void): Promise<string> {
  if (typeof Worker === "undefined") return Promise.resolve(frameToSVG(frame, material, opts, onProgress))
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    } catch {
      resolve(frameToSVG(frame, material, opts, onProgress))
      return
    }
    const id = ++seq
    worker.onmessage = (e: MessageEvent<SvgResponse>) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === "progress") onProgress?.(m.value)
      else {
        worker.terminate()
        if (m.type === "done") resolve(m.svg)
        else reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || "worker"))
    }
    const req: SvgRequest = { id, frame, material, opts }
    worker.postMessage(req)
  })
}

export type Recipe = {
  format: "aurora-eclipse/scene"
  version: 3
  created: string
  scene: Scene
  /** Glyph sets the scene uses (only their edited glyphs). */
  sets: GlyphSet[]
}

/** The JSON recipe: the scene and every glyph set it refers to. */
export function makeRecipe(scene: Scene, sets: GlyphSet[]): Recipe {
  const used = new Set<string>([scene.set])
  for (const l of scene.layers) if (l.type === "letter" && l.set) used.add(l.set)
  return {
    format: "aurora-eclipse/scene",
    version: 3,
    created: new Date().toISOString(),
    scene,
    sets: sets.filter((s) => used.has(s.id)),
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
  "aurora-eclipse_" + (scene.layers.map((l) => (l.type === "letter" ? l.char : "")).join("") || "scene").slice(0, 24)
