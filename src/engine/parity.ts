// Dev check: the GPU renderer must draw the same shapes as the CPU reference.
import { GlyphRenderer } from "./gpu/renderer"
import { rasterize } from "./cpu"
import { frameBounds } from "./frame"
import { fitView, sceneFrame } from "./view"
import { presets } from "./presets"
import { defaultMaterial, type Scene } from "./scene"
import type { Alphabet } from "./types"

export type ParityResult = { name: string; edge: number; flipped: number; maxDelta: number }

function pixels(canvas: HTMLCanvasElement, w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!
  ctx.drawImage(canvas, 0, 0)
  return ctx.getImageData(0, 0, w, h).data
}

export function parityCheck(name: string, scene: Scene, alphabet: Alphabet, revision: number, w = 480, h = 300): ParityResult {
  const s: Scene = { ...scene, material: { ...defaultMaterial, transparent: true }, warp: { ...scene.warp, flow: 0, wave: 0, pointer: 0 } }
  const frame = sceneFrame(s, alphabet, revision, 0)
  const view = fitView(frameBounds(frame, 0.6), w, h, 0.05)
  const glCanvas = document.createElement("canvas")
  const r = new GlyphRenderer(glCanvas, { preserve: true })
  r.resize(w, h)
  r.render(frame, s.material, view)
  const gpu = pixels(glCanvas, w, h)
  r.dispose()
  const b = document.createElement("canvas")
  b.width = w
  b.height = h
  const bctx = b.getContext("2d")!
  rasterize(bctx, w, h, frame, s.material, view, true)
  const cpu = bctx.getImageData(0, 0, w, h).data
  let edge = 0,
    flipped = 0,
    maxDelta = 0
  for (let i = 3; i < gpu.length; i += 4) {
    const ga = gpu[i] / 255,
      ca = cpu[i] / 255
    if (ca > 0.02 && ca < 0.98) edge++
    const d = Math.abs(ga - ca)
    maxDelta = Math.max(maxDelta, d)
    if (d > 0.5) flipped++
  }
  return { name, edge, flipped, maxDelta: +maxDelta.toFixed(3) }
}

export function parityAll(alphabet: Alphabet, revision: number) {
  return presets.map((p) => parityCheck(p.name, p.make(), alphabet, revision))
}
