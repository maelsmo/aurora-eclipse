import fitCurve from "fit-curve"
import { contours } from "d3-contour"
import { rasterize, sampler } from "./render"
import { viewSize, type Motion, type Scene } from "./model"

function bezierLoop(ring: number[][]) {
  // Split each closed loop before fitting so the two endpoints are distinct.
  const middle = Math.floor((ring.length - 1) / 2)
  const curves = [
    ...fitCurve(ring.slice(0, middle + 1), 0.35 ** 2),
    ...fitCurve(ring.slice(middle), 0.35 ** 2),
  ]
  const coords = (point: number[]) => point.map((n) => n.toFixed(2)).join(" ")
  return (
    "M" +
    coords(ring[0]) +
    curves
      .map(([, a, b, end]) => "C" + [a, b, end].map(coords).join(" "))
      .join("") +
    "Z"
  )
}

// A level set of the same composed field as the fragment shader.
// Every ring is closed and counters use even-odd fill.
export function makeSVG(s: Scene, m: Motion, aspect: number, zoom: number) {
  const width = Math.round(1024 * Math.min(1, aspect)),
    height = Math.round(width / aspect)
  const { scale } = viewSize(width, height, zoom),
    field = sampler(s, m)
  const values = new Array<number>(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      values[y * width + x] = -field(
        (x + 0.5 - width / 2) / scale,
        (y + 0.5 - height / 2) / scale,
      )
  const shape = contours().size([width, height]).contour(values, 0)
  const d = shape.coordinates.flatMap((poly) => poly.map(bezierLoop)).join("")
  return new Blob(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
        width +
        " " +
        height +
        '"><path fill="' +
        s.color +
        '" fill-rule="evenodd" d="' +
        d +
        '"/></svg>',
    ],
    { type: "image/svg+xml" },
  )
}
export async function exportFrame(
  s: Scene,
  m: Motion,
  aspect: number,
  zoom: number,
  format: "svg" | "png",
) {
  let blob: Blob
  if (format === "svg") blob = makeSVG(s, m, aspect, zoom)
  else {
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(2048 * Math.min(1, aspect))
    canvas.height = Math.round(canvas.width / aspect)
    rasterize(canvas, s, m, zoom)
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
        "image/png",
      ),
    )
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a")
  a.download =
    "Aurora-Eclipse_" +
    s.a +
    (s.b === "—" ? "" : s.b) +
    "_" +
    s.mode +
    "." +
    format
  a.href = url
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
