import { useLayoutEffect, useRef } from "react"
import { rasterize } from "@/engine/render"
import { still, type Scene } from "@/engine/model"
import { getGlyph } from "@/engine/alphabet"

export function Specimen({
  scene,
  aspect = 2.5,
  zoom = 1,
}: {
  scene: Scene
  aspect?: number
  zoom?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    rasterize(ref.current!, scene, still, zoom)
  }, [scene, aspect, zoom])
  return (
    <canvas
      className="specimen"
      width={Math.round(150 * aspect)}
      height={150}
      ref={ref}
      aria-hidden="true"
    />
  )
}
export function GlyphIcon({ letter }: { letter: string }) {
  const g = getGlyph(letter)
  return (
    <svg viewBox="-8 -14 115 124" aria-hidden="true" fill="currentColor">
      {g.outline && <path d={g.outline} fillRule="evenodd" />}
      {g.stroke && (
        <path
          d={g.stroke}
          fill="none"
          stroke="currentColor"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {g.dots?.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </svg>
  )
}
