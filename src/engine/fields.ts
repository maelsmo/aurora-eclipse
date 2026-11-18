import { getGlyph } from "./alphabet"

export const SIZE = 320
export const ORIGIN = -30
export const SPAN = 160
const fields = new Map<string, Uint8Array>()
const INF = 1e7

// Squared Euclidean distance transform, separable into rows and columns.
function distanceTransform(mask: Uint8ClampedArray, inside: boolean) {
  const grid = new Float32Array(SIZE * SIZE)
  const f = new Float32Array(SIZE),
    line = new Float32Array(SIZE)
  const sites = new Int32Array(SIZE),
    edges = new Float32Array(SIZE + 1)
  function transform() {
    let k = 0
    sites[0] = 0
    edges[0] = -Infinity
    edges[1] = Infinity
    for (let q = 1; q < SIZE; q++) {
      let s = 0
      while (true) {
        const p = sites[k]
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * (q - p))
        if (s > edges[k]) break
        k--
      }
      sites[++k] = q
      edges[k] = s
      edges[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < SIZE; q++) {
      while (edges[k + 1] < q) k++
      line[q] = (q - sites[k]) ** 2 + f[sites[k]]
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++)
      f[x] = mask[(y * SIZE + x) * 4 + 3] >= 128 === inside ? 0 : INF
    transform()
    grid.set(line, y * SIZE)
  }
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) f[y] = grid[y * SIZE + x]
    transform()
    for (let y = 0; y < SIZE; y++) grid[y * SIZE + x] = line[y]
  }
  return grid
}

export function fieldFor(letter: string) {
  const cached = fields.get(letter)
  if (cached) return cached
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.scale(SIZE / SPAN, SIZE / SPAN)
  ctx.translate(-ORIGIN, -ORIGIN)
  ctx.lineWidth = 22
  ctx.lineCap = ctx.lineJoin = "round"
  const glyph = getGlyph(letter)
  if (glyph.outline) ctx.fill(new Path2D(glyph.outline), "evenodd")
  if (glyph.stroke) ctx.stroke(new Path2D(glyph.stroke))
  for (const [x, y, r] of glyph.dots ?? []) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data
  const outer = distanceTransform(pixels, true),
    inner = distanceTransform(pixels, false)
  // Offset outwards, then offset back to round concave joins on every glyph.
  const radius = (2.5 * SIZE) / SPAN
  const expanded = new Uint8ClampedArray(pixels.length)
  for (let i = 0; i < outer.length; i++)
    expanded[i * 4 + 3] = outer[i] <= radius * radius ? 255 : 0
  const roundOuter = distanceTransform(expanded, true),
    roundInner = distanceTransform(expanded, false)
  const field = new Uint8Array(SIZE * SIZE * 2)
  for (let i = 0; i < outer.length; i++) {
    const dist = Math.sqrt(outer[i]) - Math.sqrt(inner[i])
    const cov = pixels[i * 4 + 3] / 255
    const signed =
      ((dist +
        (dist > 0 ? -0.5 : 0.5) +
        (cov > 0 && cov < 1 ? (cov >= 0.5 ? 1 - cov : -cov) : 0)) *
        SPAN) /
      SIZE
    field[i * 2] = Math.round(Math.max(0, Math.min(255, (signed + 24) * 4)))
    const roundDist =
      ((Math.sqrt(roundOuter[i]) - Math.sqrt(roundInner[i]) + radius) * SPAN) /
      SIZE
    field[i * 2 + 1] = Math.round(
      Math.max(0, Math.min(255, (Math.min(signed, roundDist) + 24) * 4)),
    )
  }
  fields.set(letter, field)
  return field
}
export function readDistance(
  field: Uint8Array,
  x: number,
  y: number,
  soft: number,
) {
  const u = ((x - ORIGIN) * SIZE) / SPAN - 0.5,
    v = ((y - ORIGIN) * SIZE) / SPAN - 0.5
  if (u < 0 || v < 0 || u >= SIZE - 1 || v >= SIZE - 1) return 39.75
  const ix = Math.floor(u),
    iy = Math.floor(v),
    dx = u - ix,
    dy = v - iy,
    i = iy * SIZE + ix
  const stride = SIZE * 2,
    offset = i * 2
  const a = field[offset] + soft * (field[offset + 1] - field[offset])
  const b = field[offset + 2] + soft * (field[offset + 3] - field[offset + 2])
  const c =
    field[offset + stride] +
    soft * (field[offset + stride + 1] - field[offset + stride])
  const d =
    field[offset + stride + 2] +
    soft * (field[offset + stride + 3] - field[offset + stride + 2])
  const top = a + dx * (b - a),
    bottom = c + dx * (d - c)
  return (top + dy * (bottom - top)) * 0.25 - 24
}
