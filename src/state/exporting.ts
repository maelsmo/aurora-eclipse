// What the export dialog needs from the live app: the frame on screen (with
// physics), the framing box and an offline video run on a runtime of its own.
import { buildFrame, frameBounds, type Frame } from "@/engine/frame"
import { sceneFrame, sceneReach, fitView } from "@/engine/view"
import { encodeMP4 } from "@/engine/export/video"
import { loadMatter, type PhysicsWorld } from "@/engine/physics"
import type { Library } from "@/engine/alphabet/sets"
import { parentXf, worldXf, xfCompose, xfInvert, xfToFields, type Scene } from "@/engine/scene"
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

/**
 * The scene with the bodies' placements written into its nodes. Locked nodes
 * stay; clones have no node of their own and keep following their cloner.
 */
export function bakeBodies(scene: Scene, world: PhysicsWorld): { scene: Scene; moved: number } {
  let moved = 0
  const layers = scene.layers.map((n) => {
    const d = world.delta(n.id)
    if (!d || n.locked) return n
    // New world placement = body motion ∘ old world placement, back in the parent's frame.
    const local = xfCompose(xfInvert(parentXf(scene.layers, n.id)), xfCompose(d, worldXf(scene.layers, n.id)))
    moved++
    return { ...n, ...xfToFields(local) }
  })
  return { scene: moved ? { ...scene, layers } : scene, moved }
}

/** Has the live simulation moved anything a video could start from? */
export const liveBodies = (scene: Scene) => (scene.physics?.enabled && runtime.source === scene && runtime.physics?.bodyCount && runtime.physics.time > 0 ? runtime.physics : null)

export type VideoRun = {
  scene: Scene
  lib: Library
  /** Start from the bodies' placements on screen and the current scene time instead of the scene's own start. */
  fromLive?: boolean
  useArtboard: boolean
  long: number
  fps: number
  seconds: number
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

/**
 * Renders the scene frame by frame on a separate runtime (its own clock,
 * rhythms, motion and physics), so the clip does not depend on the machine
 * and the live view keeps running untouched. It starts from time 0, or —
 * `fromLive` — from the moment on screen: the bodies where they lie now (at
 * rest: speeds are not carried over) and the rhythms at the current time.
 */
export async function exportVideo(o: VideoRun): Promise<Blob> {
  if (o.scene.physics?.enabled) await loadMatter()
  const live = o.fromLive ? liveBodies(o.scene) : null
  const scene = live ? bakeBodies(o.scene, live).scene : o.scene
  const rt = new Runtime()
  if (live) rt.time = runtime.time
  const first = buildFrame(scene, o.lib, rt.time, FAR)
  const box = exportBox(scene, first, o.useArtboard)
  const [w, h] = sizeFor(box, o.long)
  const view = fitView(box, w, h, 0)
  return encodeMP4(
    (_i, _t, dt) => {
      const eff = rt.step(scene, dt, true, false)
      const frame = buildFrame(eff, o.lib, rt.time, FAR)
      rt.physicsFrame(frame, scene, eff, dt, true)
      return { frame, material: eff.material }
    },
    { width: w, height: h, fps: o.fps, seconds: o.seconds, view, onProgress: o.onProgress, signal: o.signal },
  )
}
