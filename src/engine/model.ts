import { latin, cyrillic } from "./alphabet"

export const modes = [
  "eclipse",
  "fusion",
  "cut",
  "intersection",
  "xor",
] as const
export type Mode = (typeof modes)[number]
export const modeNames: Record<Mode, string> = {
  eclipse: "Затмение",
  fusion: "Слияние",
  cut: "Вычитание",
  intersection: "Пересечение",
  xor: "Исключение",
}
export type Scene = {
  a: string
  b: string
  mode: Mode
  proximity: number
  softness: number
  weight: number
  color: string
  dx: number
  dy: number
  reactive: boolean
  pose?: Motion
}
export const palette = ["#6538E8", "#242326", "#F16B45", "#398B72", "#338AC1"]
export const initial: Scene = {
  a: "A",
  b: "E",
  mode: "eclipse",
  proximity: 44,
  softness: 55,
  weight: 50,
  color: palette[0],
  dx: 0,
  dy: 0,
  reactive: false,
}
export const presets: { name: string; scene: Scene; paper: string }[] = [
  { name: "Полутень", scene: { ...initial }, paper: "#efebfc" },
  {
    name: "Касание",
    scene: {
      ...initial,
      a: "O",
      b: "S",
      mode: "fusion",
      color: "#207B61",
      proximity: 47,
      weight: 62,
      dy: 8,
    },
    paper: "#e0eee5",
  },
  {
    name: "Орбита",
    scene: {
      ...initial,
      a: "O",
      b: "O",
      mode: "xor",
      color: "#DF593C",
      proximity: 76,
      dy: -13,
    },
    paper: "#fae6dc",
  },
  {
    name: "Разрез",
    scene: {
      ...initial,
      a: "R",
      b: "X",
      mode: "cut",
      color: "#3658BA",
      proximity: 68,
      dy: 7,
    },
    paper: "#e4eaf9",
  },
]
export function validScene(s: unknown): s is Scene {
  if (!s || typeof s !== "object") return false
  const v = s as Scene,
    letters = (latin + cyrillic).split("")
  return (
    letters.includes(v.a) &&
    (letters.includes(v.b) || v.b === "—") &&
    modes.includes(v.mode) &&
    /^#[0-9a-f]{6}$/i.test(v.color) &&
    [v.proximity, v.softness, v.weight].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 100,
    ) &&
    [v.dx, v.dy].every((n) => Number.isFinite(n) && Math.abs(n) <= 100) &&
    typeof v.reactive === "boolean" &&
    (!v.pose || [v.pose.time, v.pose.x, v.pose.y].every(Number.isFinite))
  )
}
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v))
export type Motion = { time: number; x: number; y: number }
export const still: Motion = { time: 0, x: 0, y: 0 }
export function effectiveMotion(s: Scene, m: Motion): Motion {
  return {
    time: (s.pose?.time ?? 0) + m.time,
    x: clamp((s.pose?.x ?? 0) + m.x, -1, 1),
    y: clamp((s.pose?.y ?? 0) + m.y, -1, 1),
  }
}
export function formMotion(s: Scene, m: Motion) {
  const p = effectiveMotion(s, m)
  return {
    bend: 4 * Math.sin(p.time * 0.67) + (s.reactive ? p.x * 8 : 0),
    stretch:
      1 + 0.055 * Math.sin(p.time * 0.85) + (s.reactive ? p.y * 0.085 : 0),
  }
}
export function placement(s: Scene, motion: Motion) {
  const m = effectiveMotion(s, motion)
  const x =
    s.b === "—"
      ? 0
      : 118 -
        s.proximity * 0.85 +
        s.dx +
        9 * Math.sin(m.time) +
        (s.reactive ? m.x * 13 : 0)
  const y = s.dy + 5 * Math.sin(m.time * 0.5) + (s.reactive ? m.y * 11 : 0)
  return { x, y: s.b === "—" ? 0 : y }
}
export function viewSize(width: number, height: number, zoom: number) {
  const scale = Math.min(width / 246, height / 135) * zoom
  return { w: width / scale, h: height / scale, scale }
}
