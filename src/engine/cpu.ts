// CPU rasteriser on the reference field: fallback without WebGL2 and the
// ground truth for the GPU parity check. Fill and outline only.
import { hexToRgb, sampleFrame, type Frame } from "./frame"
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
      const s = sampleFrame(frame, wx, wy, px)
      const d = material.fill === "outline" ? Math.abs(s.d) - material.line / 2 : s.d
      const a = Math.max(0, Math.min(1, 0.5 - d / px))
      let [r, g, b] = s.color
      if (material.overlap > 0) {
        const t = s.overlap * material.overlap
        r += (ov[0] - r) * t
        g += (ov[1] - g) * t
        b += (ov[2] - b) * t
      }
      const outA = a + bgA * (1 - a)
      const k = (j * width + i) * 4
      if (outA <= 0) continue
      img.data[k] = ((r * a + bg[0] * bgA * (1 - a)) / outA) * 255
      img.data[k + 1] = ((g * a + bg[1] * bgA * (1 - a)) / outA) * 255
      img.data[k + 2] = ((b * a + bg[2] * bgA * (1 - a)) / outA) * 255
      img.data[k + 3] = outA * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}
