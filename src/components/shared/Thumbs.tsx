import { useEffect, useRef, useState } from "react"
import { drawScene, type ThumbOptions } from "@/engine/gpu/thumbs"
import { fitView } from "@/engine/view"
import type { Frame } from "@/engine/frame"
import type { Box } from "@/engine/types"
import { defaultLook, makeLayer, makeScene, type LookPatch, type Scene } from "@/engine/scene"
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
  frame,
  box,
}: {
  scene: Scene
  className?: string
  options?: ThumbOptions
  label?: string
  /** A prebuilt frame (the live view with physics) instead of the scene's own. */
  frame?: Frame
  /** World box that fills the canvas exactly (the export frame). */
  box?: Box
}) {
  const library = useStore((s) => s.library)
  const ref = useCanvasDraw(
    (c) => drawScene(c, scene, library, { ...options, frame, view: box ? fitView(box, c.width, c.height, 0) : options?.view }),
    [scene, library, JSON.stringify(options ?? {}), frame, box && JSON.stringify(box)],
  )
  return <canvas ref={ref} role="img" aria-label={label} className={cn("block size-full", className)} />
}

const glyphScenes = new Map<string, Scene>()

/** Ink of glyphs drawn without a colour of their own: the theme's text colour. */
export function useThemeInk() {
  const read = () => (typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "#EDEDED" : "#161616")
  const [ink, setInk] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setInk(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => mo.disconnect()
  }, [])
  return ink
}

export function GlyphThumb({
  char,
  axes,
  set,
  look,
  color: own,
  className,
}: {
  char: string
  axes?: Axes
  /** Glyph set; defaults to the scene set. */
  set?: string
  look?: LookPatch
  color?: string
  className?: string
}) {
  const ink = useThemeInk()
  const color = own ?? ink
  const globalAxes = useStore((s) => s.scene.axes)
  const sceneSet = useStore((s) => s.scene.set)
  const ax = axes ?? globalAxes
  const key = char + color + (set ?? sceneSet) + JSON.stringify(ax) + JSON.stringify(look ?? {})
  let scene = glyphScenes.get(key)
  if (!scene) {
    scene = makeScene({
      axes: ax,
      set: set ?? sceneSet,
      look: { ...defaultLook, ...look },
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
