import { useEffect, useRef } from "react"
import { drawScene, type ThumbOptions } from "@/engine/gpu/thumbs"
import { makeLayer, makeScene, type Scene } from "@/engine/scene"
import type { Axes } from "@/engine/axes"
import { useStore } from "@/state/store"
import { cn } from "@/lib/utils"

/** Device-pixel canvas that redraws when `deps` change. */
function useCanvasDraw(
  draw: (c: HTMLCanvasElement) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(c.clientWidth * dpr),
      h = Math.round(c.clientHeight * dpr)
    if (!w || !h) return
    if (c.width !== w) c.width = w
    if (c.height !== h) c.height = h
    draw(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

export function SceneThumb({
  scene,
  className,
  options,
  label,
}: {
  scene: Scene
  className?: string
  options?: ThumbOptions
  label?: string
}) {
  const alphabet = useStore((s) => s.alphabet)
  const revision = useStore((s) => s.revision)
  const ref = useCanvasDraw(
    (c) => drawScene(c, scene, alphabet, revision, options),
    [scene, alphabet, revision, JSON.stringify(options ?? {})],
  )
  return <canvas ref={ref} role="img" aria-label={label} className={cn("block size-full", className)} />
}

const glyphScenes = new Map<string, Scene>()

export function GlyphThumb({
  char,
  axes,
  color = "#161616",
  className,
}: {
  char: string
  axes?: Axes
  color?: string
  className?: string
}) {
  const globalAxes = useStore((s) => s.scene.axes)
  const ax = axes ?? globalAxes
  const key = char + color + JSON.stringify(ax)
  let scene = glyphScenes.get(key)
  if (!scene) {
    scene = makeScene({
      axes: ax,
      layers: [makeLayer(char, { color })],
      material: { ...makeScene().material, transparent: true },
    })
    if (glyphScenes.size > 600) glyphScenes.clear()
    glyphScenes.set(key, scene)
  }
  return (
    <SceneThumb
      scene={scene}
      className={className}
      label={char}
      options={{ transparent: true, fitHeight: 8.5 }}
    />
  )
}
