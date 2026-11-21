// Frame-by-frame MP4: every frame is rendered offscreen at the exact time
// step and encoded with WebCodecs (H.264 High profile) through mediabunny,
// so the file never drops or repeats frames, whatever the speed of the
// machine. The producer supplies frames; this module only draws and encodes.
import type { Frame } from "../frame"
import type { Material } from "../scene/types"
import { GlyphRenderer, type View } from "../gpu/renderer"

export type VideoFrameSource = (index: number, time: number, dt: number) => Promise<{ frame: Frame; material: Material }> | { frame: Frame; material: Material }

export type VideoOptions = {
  width: number
  height: number
  fps: number
  seconds: number
  view: View
  /** Bits per second (12–16 Mbit/s by default by size). */
  bitrate?: number
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

/** H.264 needs even dimensions. */
export const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)

/** Bitrate for a size: 12 Mbit/s for 1080p, up to 16 for larger frames. */
export function defaultBitrate(width: number, height: number, fps: number) {
  const px = width * height * (fps / 30)
  return Math.round(Math.min(16e6, Math.max(12e6, (px / (1920 * 1080)) * 12e6)))
}

/**
 * High-profile AVC codec string with the smallest level that fits the frame
 * size and macroblock rate (avc1.640028 is level 4.0, enough for 1080p30).
 */
export function avcCodec(width: number, height: number, fps: number) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16)
  const rate = mbs * fps
  const levels: [number, number, number][] = [
    [0x28, 8192, 245760],
    [0x2a, 8704, 522240],
    [0x32, 22080, 589824],
    [0x33, 36864, 983040],
    [0x34, 36864, 2073600],
  ]
  const lv = levels.find(([, m, r]) => mbs <= m && rate <= r) ?? levels[levels.length - 1]
  return "avc1.6400" + lv[0].toString(16).padStart(2, "0")
}

/** Can this browser encode such a video? */
export async function mp4Supported(width: number, height: number, fps: number) {
  if (typeof VideoEncoder === "undefined") return false
  try {
    const { canEncodeVideo, Quality } = await import("mediabunny")
    return await canEncodeVideo("avc", { width: even(width), height: even(height), quality: new Quality(defaultBitrate(width, height, fps)) })
  } catch {
    return false
  }
}

/** Renders `seconds × fps` frames from `source` and returns the MP4. */
export async function encodeMP4(source: VideoFrameSource, opts: VideoOptions): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } = await import("mediabunny")
  const width = even(opts.width),
    height = even(opts.height)
  const fps = opts.fps
  const total = Math.max(1, Math.round(opts.seconds * fps))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const renderer = new GlyphRenderer(canvas, { preserve: true })
  renderer.resize(width, height)
  // The view was fitted to the requested size; keep its framing at the even one.
  const view: View = { ...opts.view, scale: opts.view.scale * Math.min(width / opts.width, height / opts.height) }
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() })
  const video = new CanvasSource(canvas, {
    codec: "avc",
    fullCodecString: avcCodec(width, height, fps),
    quality: new Quality(opts.bitrate ?? defaultBitrate(width, height, fps)),
    keyFrameInterval: 2,
    alpha: "discard",
  })
  output.addVideoTrack(video, { frameRate: fps })
  try {
    await output.start()
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError")
      const t = i / fps
      const { frame, material } = await source(i, t, i === 0 ? 0 : 1 / fps)
      renderer.render(frame, material, view, { transparent: false })
      // Resolves when the encoder queue has room: memory stays flat on long clips.
      await video.add(t, 1 / fps)
      opts.onProgress?.((i + 1) / total)
      // Let the page breathe (progress bar, cancel button) every few frames.
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0))
    }
    await output.finalize()
    const buf = output.target.buffer
    if (!buf) throw new Error("empty")
    return new Blob([buf], { type: "video/mp4" })
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  } finally {
    renderer.dispose()
  }
}
