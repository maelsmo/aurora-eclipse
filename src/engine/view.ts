import { buildFrame, frameBounds, type Frame } from "./frame"
import type { View } from "./gpu/renderer"
import type { Material, Scene } from "./scene"
import type { Alphabet, Box } from "./types"

/** How far the material reaches beyond the shapes (glow, shadow). */
export function materialReach(m: Material) {
  let r = 0
  if (m.glow > 0) r = Math.max(r, m.glowSize * 6)
  if (m.shadow > 0) r = Math.max(r, Math.hypot(m.shadowX, m.shadowY) + m.shadowSoft + 0.5)
  if (m.fill === "isolines") r = Math.max(r, m.rings * m.spacing + m.spacing)
  if (m.fill === "halftone") r = Math.max(r, m.dot * 2)
  return r
}

export function fitView(box: Box, width: number, height: number, pad = 0.12): View {
  const w = Math.max(box.x1 - box.x0, 1),
    h = Math.max(box.y1 - box.y0, 1)
  const scale = Math.min((width * (1 - pad * 2)) / w, (height * (1 - pad * 2)) / h)
  return { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, scale: Math.max(scale, 0.5) }
}

export function sceneFrame(
  scene: Scene,
  alphabet: Alphabet,
  revision: number,
  time = 0,
  pointer: [number, number] = [1e4, 1e4],
): Frame {
  return buildFrame(scene, alphabet, revision, time, pointer, materialReach(scene.material))
}

export function sceneBounds(scene: Scene, alphabet: Alphabet, revision: number, pad = 0.6) {
  return frameBounds(sceneFrame(scene, alphabet, revision), pad)
}
