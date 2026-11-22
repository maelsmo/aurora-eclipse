// Cloners lay a group's children out in a grid, a ring, a line or a
// scatter. The zone of a clone (its ring, row, diagonal, checker colour…)
// picks which child it shows and its palette colour — the zone maps of the
// Tinkuy grid system; symmetry flips or turns clones by quadrant so tiles
// form rosettes. Effectors then move, turn, scale, fade and tint clones.
import type { Cloner, ClonerPick } from "./scene/types"
import { hash2 } from "./noise"

export type Clone = {
  /** Stable index: the clone id is `${childId}#${index}`. */
  index: number
  /** Which child (prototype) the clone shows. */
  child: number
  /** Placement in the group's coordinates. */
  x: number
  y: number
  rotation: number
  scale: number
  flipX: boolean
  flipY: boolean
  /** Zone value of the layout (for colours). */
  zone: number
}

const DEG = 180 / Math.PI

function zoneOf(pick: ClonerPick, i: number, col: number, row: number, cols: number, rows: number, seed: number): number {
  const cc = (cols - 1) / 2,
    rc = (rows - 1) / 2
  const dc = Math.abs(col - cc),
    dr = Math.abs(row - rc)
  switch (pick) {
    case "cycle":
      return i
    case "random":
      return Math.floor(hash2(i * 7919 + seed, seed * 31 + 7) * 1e6)
    case "rows":
      return row
    case "cols":
      return col
    case "rings":
      return Math.floor(Math.max(dc, dr))
    case "diamond":
      return Math.floor(dc + dr)
    case "diagonal":
      return col + row
    case "checker":
      return (col + row) % 2
  }
}

/**
 * Clones of a cloner (without effectors). `children` is the number of
 * prototypes. Never more than `limit` clones.
 */
export function layoutClones(c: Cloner, children: number, limit: number): Clone[] {
  const out: Clone[] = []
  const n = Math.max(1, children)
  const push = (i: number, x: number, y: number, rotation: number, scale: number, zone: number) => {
    let flipX = false,
      flipY = false
    let rot = rotation
    if (c.symmetry === "mirror") {
      flipX = x < -1e-9
      flipY = y < -1e-9
    } else if (c.symmetry === "rotate") {
      const q = x >= -1e-9 ? (y >= -1e-9 ? 0 : 3) : y >= -1e-9 ? 1 : 2
      rot += q * 90
    }
    out.push({ index: i, child: ((zone % n) + n) % n, x, y, rotation: rot, scale, flipX, flipY, zone })
  }
  switch (c.kind) {
    case "grid": {
      const cols = Math.max(1, Math.round(c.cols)),
        rows = Math.max(1, Math.round(c.rows))
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col
          if (out.length >= limit) return out
          push(i, (col - (cols - 1) / 2) * c.dx, (row - (rows - 1) / 2) * c.dy, 0, 1, zoneOf(c.pick, i, col, row, cols, rows, c.seed))
        }
      return out
    }
    case "radial": {
      const count = Math.max(1, Math.round(c.count))
      for (let r = 0; r < Math.max(1, Math.round(c.rings)); r++) {
        const radius = c.radius + r * c.ringStep
        for (let k = 0; k < count; k++) {
          const i = r * count + k
          if (out.length >= limit) return out
          const a = (k / count) * Math.PI * 2 + Math.PI / 2
          const zone = c.pick === "rings" || c.pick === "rows" ? r : c.pick === "checker" ? (k + r) % 2 : c.pick === "random" ? zoneOf("random", i, 0, 0, 1, 1, c.seed) : k
          // Aligned clones keep their "up" pointing away from the centre.
          push(i, Math.cos(a) * radius, Math.sin(a) * radius, c.align ? a * DEG - 90 : 0, 1, zone)
        }
      }
      return out
    }
    case "linear": {
      const count = Math.max(1, Math.round(c.count))
      for (let k = 0; k < count && out.length < limit; k++) {
        const t = k - (count - 1) / 2
        const zone = c.pick === "random" ? zoneOf("random", k, 0, 0, 1, 1, c.seed) : c.pick === "checker" ? k % 2 : k
        push(k, t * c.dx, t * c.dy, k * c.stepRotation, Math.pow(c.stepScale, k), zone)
      }
      return out
    }
    case "scatter": {
      const count = Math.max(1, Math.round(c.count))
      for (let k = 0; k < count && out.length < limit; k++) {
        const x = (hash2(k * 3 + 1, c.seed) - 0.5) * c.width,
          y = (hash2(k * 3 + 2, c.seed + 17) - 0.5) * c.height
        const zone = c.pick === "random" ? zoneOf("random", k, 0, 0, 1, 1, c.seed) : c.pick === "checker" ? k % 2 : k
        push(k, x, y, 0, 1, zone)
      }
      return out
    }
  }
}

/** How many clones a cloner makes (UI and limits). */
export function cloneCount(c: Cloner) {
  switch (c.kind) {
    case "grid":
      return Math.round(c.cols) * Math.round(c.rows)
    case "radial":
      return Math.round(c.count) * Math.max(1, Math.round(c.rings))
    default:
      return Math.round(c.count)
  }
}
