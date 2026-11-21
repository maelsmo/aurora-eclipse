// One shared offscreen WebGL2 context for thumbnails, variations and PNG export,
// so lists of glyphs never exhaust the browser's context limit.
import { GlyphRenderer, type View } from "./renderer"
import { rasterize } from "../cpu"
import { fitView, sceneFrame } from "../view"
import { frameBounds } from "../frame"
import type { Scene } from "../scene/types"
import type { Library } from "../alphabet/sets"

let shared: GlyphRenderer | null | undefined

function renderer() {
  if (shared === undefined) {
    try {
      shared = new GlyphRenderer(document.createElement("canvas"), { preserve: true })
    } catch {
      shared = null
    }
  }
  return shared
}

export type ThumbOptions = {
  time?: number
  pad?: number
  transparent?: boolean
  view?: View
  /** Fit around the shapes only (true) or include the material reach. */
  tight?: boolean
  /** Keep a constant vertical scale: this many modules fit the height. */
  fitHeight?: number
}

/** Draws the scene into a 2D canvas of the given device size. */
export function drawScene(
  target: HTMLCanvasElement,
  scene: Scene,
  lib: Library,
  opts: ThumbOptions = {},
) {
  const w = target.width,
    h = target.height
  if (!w || !h) return
  const frame = sceneFrame(scene, lib, opts.time ?? 0)
  let view = opts.view
  if (!view && opts.fitHeight) {
    const b = frameBounds(frame, 0.3)
    const scale = Math.min(h / opts.fitHeight, w / Math.max(b.x1 - b.x0, 1))
    view = { cx: (b.x0 + b.x1) / 2, cy: 0, scale }
  }
  view ??= fitView(frameBounds(frame, opts.tight === false ? 1.2 : 0.4), w, h, opts.pad ?? 0.1)
  const ctx = target.getContext("2d")
  if (!ctx) return
  const r = renderer()
  if (r && !r.lost) {
    r.resize(w, h)
    r.render(frame, scene.material, view, { transparent: opts.transparent })
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(r.canvas, 0, 0)
  } else {
    rasterize(ctx, w, h, frame, scene.material, view, opts.transparent)
  }
}

/** Renders at an arbitrary size and returns a PNG blob. */
export async function renderPNG(
  scene: Scene,
  lib: Library,
  width: number,
  height: number,
  view: View,
  time: number,
  transparent: boolean,
): Promise<Blob> {
  const c = document.createElement("canvas")
  c.width = width
  c.height = height
  drawScene(c, scene, lib, { view, time, transparent })
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG"))), "image/png"),
  )
}

export const gpuAvailable = () => !!renderer()
