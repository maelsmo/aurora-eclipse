// Web Worker: traces the SVG off the main thread and reports progress.
import { frameToSVG, type SvgOptions } from "./svg"
import type { Frame } from "../frame"
import type { Material } from "../scene"

export type SvgRequest = { id: number; frame: Frame; material: Material; opts: SvgOptions }
export type SvgResponse =
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "done"; svg: string }
  | { id: number; type: "error"; message: string }

self.onmessage = (e: MessageEvent<SvgRequest>) => {
  const { id, frame, material, opts } = e.data
  const post = (m: SvgResponse) => (self as unknown as Worker).postMessage(m)
  try {
    let last = 0
    const svg = frameToSVG(frame, material, opts, (value) => {
      const now = performance.now()
      if (now - last > 60 || value >= 1) {
        last = now
        post({ id, type: "progress", value })
      }
    })
    post({ id, type: "done", svg })
  } catch (err) {
    post({ id, type: "error", message: (err as Error).message })
  }
}
