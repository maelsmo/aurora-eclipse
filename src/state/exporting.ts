// What the export dialog needs from the live app: the frame on screen (with
// physics), the framing box and an offline video run on a runtime of its own.
import { buildFrame, frameBounds, type Frame } from "@/engine/frame"
import { sceneFrame, sceneReach, fitView } from "@/engine/view"
import { encodeMP4 } from "@/engine/export/video"
import { loadMatter } from "@/engine/physics"
import type { Library } from "@/engine/alphabet/sets"
import type { Scene } from "@/engine/scene"
import type { Box } from "@/engine/types"
import { Runtime, runtime } from "./runtime"

const FAR: [number, number] = [1e4, 1e4]

/**
 * The frame to export: the one on screen when physics moves the objects
 * (and that frame belongs to this scene), the scene's own otherwise.
 */
export function exportFrame(scene: Scene, lib: Library, time: number, source?: Scene): Frame {
  if (scene.physics?.enabled && runtime.frame && runtime.physics?.bodyCount && (!source || runtime.source === source)) return runtime.frame
  return sceneFrame(scene, lib, time)
}

/**
 * Starting options of the export dialog: the scene's own background stays
 * (images are often used as backgrounds elsewhere), the artboard frames the
 * file when it is shown.
 */
export function exportDefaults(scene: Scene) {
  return { transparent: scene.material.transparent, useArtboard: scene.artboard.enabled }
}

/** World box of the file: the artboard, or the content with the reach of its effects. */
export function exportBox(scene: Scene, frame: Frame, useArtboard: boolean): Box {
  const a = scene.artboard
  if (useArtboard) return { x0: a.x - a.w / 2, y0: a.y - a.h / 2, x1: a.x + a.w / 2, y1: a.y + a.h / 2 }
  return frameBounds(frame, sceneReach(scene) + 0.8)
}

/** Pixel size for a long side, keeping the box's aspect. */
export function sizeFor(box: Box, long: number): [number, number] {
  const w = Math.max(box.x1 - box.x0, 0.1),
    h = Math.max(box.y1 - box.y0, 0.1)
  return w >= h ? [long, Math.max(1, Math.round((long * h) / w))] : [Math.max(1, Math.round((long * w) / h)), long]
}

export type VideoRun = {
  scene: Scene
  lib: Library
  useArtboard: boolean
  long: number
  fps: number
  seconds: number
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

/**
 * Renders the scene from time 0 frame by frame on a separate runtime (its own
 * clock, rhythms, motion and physics), so the clip is identical on any
 * machine and the live view keeps running untouched.
 */
export async function exportVideo(o: VideoRun): Promise<Blob> {
  if (o.scene.physics?.enabled) await loadMatter()
  const rt = new Runtime()
  const first = buildFrame(o.scene, o.lib, 0, FAR)
  const box = exportBox(o.scene, first, o.useArtboard)
  const [w, h] = sizeFor(box, o.long)
  const view = fitView(box, w, h, 0)
  return encodeMP4(
    (_i, _t, dt) => {
      const eff = rt.step(o.scene, dt, true, false)
      const frame = buildFrame(eff, o.lib, rt.time, FAR)
      rt.physicsFrame(frame, o.scene, eff, dt, true)
      return { frame, material: eff.material }
    },
    { width: w, height: h, fps: o.fps, seconds: o.seconds, view, onProgress: o.onProgress, signal: o.signal },
  )
}
