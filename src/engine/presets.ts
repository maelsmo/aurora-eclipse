// Starting compositions and contexts (material + palette over any composition).
import { defaultAlphabet } from "./alphabet"
import { defaultAxes } from "./axes"
import {
  defaultMaterial,
  layoutText,
  makeLayer,
  makeScene,
  uid,
  type Material,
  type Scene,
} from "./scene"

export type Context = {
  id: string
  name: string
  material: Partial<Material>
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
      colorMode: "aurora",
      aurora: ["#7CF5C8", "#6C5CE7", "#FF6FB5"],
      glow: 0.35,
      glowSize: 1.4,
      glowColor: "#6C5CE7",
    },
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
    material: {
      ...defaultMaterial,
      fill: "isolines",
      line: 0.07,
      spacing: 0.3,
      rings: 8,
      background: "#F4F1EA",
    },
    palette: ["#161616", "#F2542D", "#5B3CF5"],
  },
  {
    id: "plotter",
    name: "Плоттер",
    material: { ...defaultMaterial, fill: "outline", line: 0.06, background: "#FFFFFF" },
    palette: ["#1A1A1A", "#1A1A1A", "#1A1A1A"],
  },
  {
    id: "halftone",
    name: "Полутон",
    material: { ...defaultMaterial, fill: "halftone", dot: 0.26, background: "#F4F1EA" },
    palette: ["#161616", "#2F80ED", "#F2542D"],
  },
]

export function applyContext(scene: Scene, ctx: Context): Scene {
  return {
    ...scene,
    material: { ...defaultMaterial, ...ctx.material },
    layers: scene.layers.map((l, i) => ({ ...l, color: ctx.palette[i % ctx.palette.length] })),
  }
}

export type Preset = { id: string; name: string; make: () => Scene }

const pair = (
  a: string,
  b: string,
  op: Scene["layers"][number]["op"],
  dx: number,
  over: Partial<Scene["layers"][number]> = {},
) => [
  makeLayer(a, { x: -dx / 2 }),
  makeLayer(b, { x: dx / 2, op, ...over }),
]

export const presets: Preset[] = [
  {
    id: "eclipse-ae",
    name: "Затмение AE",
    make: () =>
      makeScene({ layers: pair("A", "E", "eclipse", 3.5, { gap: 0.18, color: "#161616" }) }),
  },
  {
    id: "fuse",
    name: "Слияние",
    make: () =>
      makeScene({
        axes: { ...defaultAxes, fillet: 0.4 },
        layers: pair("O", "S", "fuse", 3.4, { k: 0.9, color: "#5B3CF5" }).map((l, i) =>
          i === 0 ? { ...l, color: "#161616" } : l,
        ),
      }),
  },
  {
    id: "inlay",
    name: "Врезка",
    make: () => {
      const s = makeScene({ layers: pair("R", "X", "inlay", 2.4, { gap: 0.2, color: "#F2542D" }) })
      return s
    },
  },
  {
    id: "cut",
    name: "Вырезание",
    make: () =>
      makeScene({
        layers: [
          makeLayer("Ж", { scale: 1.3 }),
          makeLayer("O", { op: "cut", gap: 0.15, k: 0.2, scale: 0.7 }),
        ],
      }),
  },
  {
    id: "morph",
    name: "Перетекание A→E",
    make: () => {
      const s = makeScene({
        layers: [makeLayer("A"), makeLayer("E", { op: "morph", t: 0.5, color: "#5B3CF5" })],
      })
      s.routes = [{ id: uid(), source: "lfo1", target: `layer:${s.layers[1].id}.t`, amount: 0.5 }]
      return s
    },
  },
  {
    id: "orbit",
    name: "Орбита",
    make: () => {
      const s = makeScene({
        layers: [
          makeLayer("O", { color: "#161616" }),
          makeLayer("O", {
            x: 3.2,
            op: "xor",
            k: 0.1,
            color: "#161616",
            motion: { type: "orbit", amount: 0.25, speed: 0.12, phase: 0 },
          }),
        ],
      })
      return s
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
      return makeScene({ axes, layers, tracking: 0.15 })
    },
  },
]

export const initialScene = () => presets[0].make()
