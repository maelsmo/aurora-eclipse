// Portable noise: the same integer hash runs in GLSL (common.ts), so CPU and
// GPU agree bit for bit on random placements.

export function hash2(ix: number, iy: number) {
  let h = (Math.imul(ix | 0, 1597334673) ^ Math.imul(iy | 0, 3812015801)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967295
}

export function noise2(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y)
  const fx = x - ix,
    fy = y - iy
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy),
    b = hash2(ix + 1, iy),
    c = hash2(ix, iy + 1),
    d = hash2(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
