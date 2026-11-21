// Starting compositions and contexts (material + palette over any composition).
import { defaultAlphabet } from "./alphabet"
import { geoAlphabet, geoLook } from "./alphabet/geo"
import { defaultAxes } from "./axes"
import {
  defaultArtboard,
  defaultCloner,
  defaultEffector,
  defaultLook,
  defaultMaterial,
  defaultPhysics,
  isLeaf,
  layoutText,
  makeGroup,
  makeLayer,
  makeScene,
  mergeScene,
  uid,
  type Cloner,
  type Layer,
  type LetterNode,
  type Look,
  type Material,
  type Scene,
} from "./scene"

export type Context = {
  id: string
  name: string
  material: Partial<Material>
  look?: Partial<Look>
  palette: string[]
}

export const contexts: Context[] = [
  {
    id: "paper",
    name: "Бумага",
    material: { ...defaultMaterial },
    palette: ["#161616", "#5B3CF5", "#F2542D"],
  },
  {
    id: "eclipse",
    name: "Затмение",
    material: {
      ...defaultMaterial,
      background: "#050506",
      glow: 1.1,
      glowSize: 0.9,
      glowColor: "#FFD29A",
      overlap: 0,
    },
    palette: ["#050506", "#050506", "#050506"],
  },
  {
    id: "aurora",
    name: "Аврора",
    material: {
      ...defaultMaterial,
      background: "#07090F",
      aurora: ["#7CF5C8", "#6C5CE7", "#FF6FB5"],
      glow: 0.35,
      glowSize: 1.4,
      glowColor: "#6C5CE7",
    },
    look: { colorMode: "aurora" },
    palette: ["#7CF5C8", "#6C5CE7", "#FF6FB5"],
  },
  {
    id: "negative",
    name: "Негатив",
    material: {
      ...defaultMaterial,
      background: "#161616",
      overlap: 1,
      overlapColor: "#F2542D",
    },
    palette: ["#F4F1EA", "#F4F1EA", "#F4F1EA"],
  },
  {
    id: "penumbra",
    name: "Полутень",
    material: {
      ...defaultMaterial,
      background: "#EDEAF7",
      overlap: 1,
      overlapColor: "#16121F",
    },
    palette: ["#5B3CF5", "#A99BF9", "#5B3CF5"],
  },
  {
    id: "rings",
    name: "Изолинии",
    material: { ...defaultMaterial, background: "#F4F1EA" },
    look: { mode: "isolines", line: 0.07, spacing: 0.3, rings: 8 },
    palette: ["#161616", "#F2542D", "#5B3CF5"],
  },
  {
    id: "plotter",
    name: "Плоттер",
    material: { ...defaultMaterial, background: "#FFFFFF" },
    look: { mode: "outline", line: 0.06 },
    palette: ["#1A1A1A", "#1A1A1A", "#1A1A1A"],
  },
  {
    id: "halftone",
    name: "Полутон",
    material: { ...defaultMaterial, background: "#F4F1EA" },
    look: { mode: "halftone", dot: 0.26 },
    palette: ["#161616", "#2F80ED", "#F2542D"],
  },
]

/** Applies a context: scene material and look, and the palette over the objects in order. */
export function applyContext(scene: Scene, ctx: Context): Scene {
  let i = 0
  return {
    ...scene,
    material: { ...defaultMaterial, ...ctx.material },
    look: { ...defaultLook, ...ctx.look },
    layers: scene.layers.map((l) => (isLeaf(l) ? { ...l, color: ctx.palette[i++ % ctx.palette.length] } : l)),
  }
}

export type Preset = { id: string; name: string; make: () => Scene }

const pair = (
  a: string,
  b: string,
  op: LetterNode["op"],
  dx: number,
  over: Partial<LetterNode> = {},
) => [
  makeLayer(a, { x: -dx / 2 }),
  makeLayer(b, { x: dx / 2, op, ...over }),
]

export const presets: Preset[] = [
  {
    id: "eclipse-ae",
    name: "Затмение AE",
    make: () =>
      mergeScene(pair("A", "E", "eclipse", 3.5, { gap: 0.18, color: "#161616" })),
  },
  {
    id: "fuse",
    name: "Слияние",
    make: () =>
      mergeScene(
        pair("O", "S", "fuse", 3.4, { k: 0.9, color: "#5B3CF5" }).map((l, i) => (i === 0 ? { ...l, color: "#161616" } : l)),
        { axes: { ...defaultAxes, fillet: 0.4 } },
      ),
  },
  {
    id: "inlay",
    name: "Врезка",
    make: () => {
      return mergeScene(pair("R", "X", "inlay", 2.4, { gap: 0.2, color: "#F2542D" }))
    },
  },
  {
    id: "cut",
    name: "Вырезание",
    make: () =>
      mergeScene([makeLayer("Ж", { scale: 1.3 }), makeLayer("O", { op: "cut", gap: 0.15, k: 0.2, scale: 0.7 })]),
  },
  {
    id: "morph",
    name: "Перетекание A→E",
    make: () => {
      const s = mergeScene([makeLayer("A"), makeLayer("E", { op: "morph", t: 0.5, color: "#5B3CF5" })])
      s.routes = [{ id: uid(), source: "lfo1", target: `layer:${s.layers[2].id}.t`, amount: 0.5 }]
      return s
    },
  },
  {
    id: "orbit",
    name: "Орбита",
    make: () => {
      return mergeScene([
        makeLayer("O", { color: "#161616" }),
        makeLayer("O", {
          x: 3.2,
          op: "xor",
          k: 0.1,
          color: "#161616",
          motion: { type: "orbit", amount: 0.25, speed: 0.12, phase: 0 },
        }),
      ])
    },
  },
  {
    id: "wordmark",
    name: "AURORA ECLIPSE",
    make: () => {
      const axes = { ...defaultAxes }
      const layers = layoutText("AURORA\nECLIPSE", defaultAlphabet, axes, 0.15, {
        op: "fuse",
        k: 0.35,
      })
      return mergeScene(layers, { axes, tracking: 0.15 })
    },
  },
]

/* ---------- patterns of the geometric set ---------- */

const geoWord = (text: string, over: Partial<LetterNode> = {}, tracking = 0.25) =>
  layoutText(text, geoAlphabet, defaultAxes, tracking, { set: "geo", color: "#161616", ...over }, "geo#preset")

/** A cloner group around its children (which sit at the origin). */
function cloner(c: Partial<Cloner>, children: Layer[], over: Partial<Layer> = {}): Layer[] {
  const g = makeGroup("stack", { name: "Клонер", cloner: { ...defaultCloner, ...c }, ...over } as never)
  return [g, ...children.map((k) => ({ ...k, parent: g.id }))]
}
const tile = (char: string, color = "#161616") => makeLayer(char, { set: "geo", color })
const frame = { ...defaultArtboard, enabled: true }

export const patternPresets: Preset[] = [
  {
    id: "geo-lines",
    name: "Геометрия · линии",
    make: () => makeScene({ set: "geo", layers: geoWord("ЛИНИИ\nAURORA"), look: { ...defaultLook, ...geoLook, mode: "lines" }, artboard: frame }),
  },
  {
    id: "rosette",
    name: "Розетка",
    make: () =>
      makeScene({
        set: "geo",
        layers: cloner({ cols: 8, rows: 8, symmetry: "rotate", pick: "rings", palette: ["#161616", "#F2542D", "#5B3CF5", "#E9B824"] }, [tile("◜")]),
        artboard: { ...frame, w: 24, h: 24 },
      }),
  },
  {
    id: "letter-mask",
    name: "Буква из плиток",
    make: () => {
      const g = makeGroup("stack", { name: "Маска", mask: true })
      const mask = { ...makeLayer("A", { set: "geo", scale: 3.4 }), parent: g.id }
      const inner = cloner({ cols: 9, rows: 9, symmetry: "mirror", pick: "checker", palette: ["#161616", "#F2542D"] }, [tile("◜"), tile("●")], { parent: g.id })
      return makeScene({ set: "geo", layers: [g, mask, ...inner], artboard: { ...frame, w: 24, h: 24 } })
    },
  },
  {
    id: "tile-wave",
    name: "Волна плиток",
    make: () =>
      makeScene({
        set: "geo",
        layers: cloner(
          {
            cols: 14,
            rows: 8,
            pick: "diagonal",
            palette: ["#161616", "#2F80ED"],
            effectors: [{ ...defaultEffector, id: uid(), kind: "wave", amount: 1, position: 0, rotation: 0.5, scale: 0.15, freq: 0.06, speed: 0.25 }],
          },
          [tile("◠")],
        ),
        artboard: { ...frame, w: 36, h: 21 },
      }),
  },
  {
    id: "mosaic",
    name: "Мозаика",
    make: () => makeScene({ set: "geo", layers: geoWord("МОЗАИКА", { color: "#1E8C6E" }), look: { ...defaultLook, inset: 0.18 }, artboard: frame }),
  },
  {
    id: "fall",
    name: "Падение",
    make: () =>
      makeScene({
        set: "geo",
        layers: geoWord("ПАДАЮ", { color: "#161616" }).map((l, i) => ({ ...l, y: 4 + (i % 2) * 3, rotation: (i - 2) * 9 })),
        physics: { ...defaultPhysics, bounce: 0.45 },
        artboard: frame,
      }),
  },
]

export const allPresets: Preset[] = [...presets, ...patternPresets]

export const initialScene = () => presets[0].make()
