// CPU rasteriser on the reference field: fallback without WebGL2 and the
// ground truth for the GPU parity check. Items are composited in z-order;
// fill and outline only.
import { hexToRgb, sampleItem, type Frame } from "./frame"
import type { Material } from "./scene"
import type { View } from "./gpu/renderer"

export function rasterize(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  material: Material,
  view: View,
  transparent = material.transparent,
) {
  const img = ctx.createImageData(width, height)
  const px = 1 / view.scale
  const bg = hexToRgb(material.background)
  const bgA = transparent ? 0 : 1
  const ov = hexToRgb(material.overlapColor)
  for (let j = 0; j < height; j++) {
    // Canvas rows go down, world y goes up (gl_FragCoord has its origin at the bottom).
    const wy = view.cy + (height - j - 0.5 - height / 2) * px
    for (let i = 0; i < width; i++) {
      const wx = view.cx + (i + 0.5 - width / 2) * px
      // Premultiplied over-composite of the items onto the background.
      let r = bg[0] * bgA,
        g = bg[1] * bgA,
        b = bg[2] * bgA,
        A = bgA
      for (const it of frame.items) {
        const s = sampleItem(frame, it, wx, wy, px)
        const d = it.look.fill === "outline" ? Math.abs(s.d) - it.look.line / 2 : s.d
        const a = Math.max(0, Math.min(1, 0.5 - d / px)) * it.opacity
        if (a <= 0) continue
        let [cr, cg, cb] = s.color
        if (material.overlap > 0) {
          const t = s.overlap * material.overlap
          cr += (ov[0] - cr) * t
          cg += (ov[1] - cg) * t
          cb += (ov[2] - cb) * t
        }
        r = cr * a + r * (1 - a)
        g = cg * a + g * (1 - a)
        b = cb * a + b * (1 - a)
        A = a + A * (1 - a)
      }
      if (A <= 0) continue
      const k = (j * width + i) * 4
      img.data[k] = (r / A) * 255
      img.data[k + 1] = (g / A) * 255
      img.data[k + 2] = (b / A) * 255
      img.data[k + 3] = A * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
