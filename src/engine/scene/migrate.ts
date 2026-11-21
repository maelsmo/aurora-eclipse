// Migration of stored scenes. v2 scenes become v3 one to one: every layer
// goes into one merge group with an identity transform (the same fold, the
// same picture), the drawing part of the material becomes the scene look,
// two oscillators become four, routes to moved parameters are renamed.
import { defaultLfo } from "./types"

type Raw = Record<string, unknown>

const LOOK_FROM_MATERIAL: Record<string, string> = {
  fill: "mode",
  line: "line",
  spacing: "spacing",
  rings: "rings",
  dot: "dot",
  colorMode: "colorMode",
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v)

export function sceneVersion(raw: unknown): number {
  if (!isObj(raw)) return 0
  return typeof raw.v === "number" ? raw.v : 2
}

/** Converts a raw v2 scene into a raw v3 scene (validation happens afterwards). */
export function migrateV2(raw: Raw, set: string): Raw {
  const material = isObj(raw.material) ? { ...raw.material } : {}
  const look: Raw = {}
  for (const [from, to] of Object.entries(LOOK_FROM_MATERIAL))
    if (from in material) {
      look[to] = material[from]
      delete material[from]
    }
  const layers = Array.isArray(raw.layers) ? raw.layers.filter(isObj) : []
  const groupId = "merge-" + Math.random().toString(36).slice(2, 8)
  const nodes: Raw[] = layers.length
    ? [
        {
          id: groupId,
          type: "group",
          mode: "merge",
          name: "Сплав",
          visible: true,
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          op: "union",
          k: 0.6,
          gap: 0.2,
          t: 0.5,
          color: "#161616",
          motion: { type: "none", amount: 0.5, speed: 0.3, phase: 0 },
        },
        ...layers.map((l) => ({ ...l, type: "letter", parent: groupId })),
      ]
    : []
  const lfo = Array.isArray(raw.lfo) ? [...raw.lfo] : []
  while (lfo.length < 4) lfo.push({ ...defaultLfo[lfo.length] })
  const routes = Array.isArray(raw.routes)
    ? raw.routes.filter(isObj).map((r) => {
        const t = typeof r.target === "string" ? r.target : ""
        const m = t.match(/^material\.(\w+)$/)
        if (m && LOOK_FROM_MATERIAL[m[1]]) return { ...r, target: "look." + LOOK_FROM_MATERIAL[m[1]] }
        return r
      })
    : []
  return { ...raw, v: 3, set, material, look, layers: nodes, lfo, routes }
}

/** Brings any stored scene to the raw v3 shape. */
export function migrateScene(raw: unknown, set: string): Raw | null {
  if (!isObj(raw)) return null
  const v = sceneVersion(raw)
  if (v >= 3) return raw
  if (!Array.isArray(raw.layers)) return null
  return migrateV2(raw, set)
}
