import { buildFrame, frameBounds, materialReach, lookMargin, type Frame } from "./frame"
import type { View } from "./gpu/renderer"
import type { Scene } from "./scene/types"
import type { Box } from "./types"
import type { Library } from "./alphabet/sets"

export { materialReach }

/** Reach of the scene's material and looks beyond the shapes (fit margins). */
export function sceneReach(s: Scene) {
  let r = Math.max(materialReach(s.material), lookMargin(s.look))
  for (const l of s.layers) if (l.look) r = Math.max(r, lookMargin({ ...s.look, ...l.look }))
  return r
}

export function fitView(box: Box, width: number, height: number, pad = 0.12): View {
  const w = Math.max(box.x1 - box.x0, 1),
    h = Math.max(box.y1 - box.y0, 1)
  const scale = Math.min((width * (1 - pad * 2)) / w, (height * (1 - pad * 2)) / h)
  return { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, scale: Math.max(scale, 0.5) }
}

export function sceneFrame(scene: Scene, lib: Library, time = 0, pointer: [number, number] = [1e4, 1e4]): Frame {
  return buildFrame(scene, lib, time, pointer)
}

export function sceneBounds(scene: Scene, lib: Library, pad = 0.6) {
  return frameBounds(sceneFrame(scene, lib), pad)
}
