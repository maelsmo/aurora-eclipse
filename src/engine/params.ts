// Registry of every numeric parameter: labels, ranges and modulation targets.
// A target is a path: "axes.weight", "look.line", "layer:<id>.x",
// "layer:<id>.look.line", "layer:<id>.shape.w"… parseTarget() splits it.
import type { AxisKey } from "./axes"
import type { Layer, Look, Material, Scene, ShapeDef, Warp } from "./scene/types"

export type ParamDef = {
  label: string
  min: number
  max: number
  step: number
  unit?: string
  hint?: string
  /** clamp: modulation stays inside [min, max]; offset: it adds freely (positions, angles). */
  mode?: "clamp" | "offset"
}

export const axisParams: Record<AxisKey, ParamDef> = {
  weight: { label: "Толщина", min: 0.4, max: 1.6, step: 0.01, unit: "m", hint: "Толщина штриха в модулях" },
  contrast: { label: "Контраст", min: 0.5, max: 1.5, step: 0.01, hint: "Толщина горизонталей относительно вертикалей" },
  width: { label: "Ширина", min: 0.75, max: 1.35, step: 0.01, hint: "Горизонтальный масштаб скелета" },
  fillet: { label: "Вязкость", min: 0, max: 1, step: 0.01, unit: "m", hint: "Радиус скругления всех вогнутых стыков" },
  overshoot: { label: "Выступ", min: 0, max: 1, step: 0.01, hint: "Насколько конец штриха проходит сквозь соседний" },
  terminal: { label: "Окончания", min: 0, max: 1, step: 0.01, hint: "0 — прямой срез, 1 — полукруг" },
  counter: { label: "Зрачок", min: 0.3, max: 1.6, step: 0.01, hint: "Размер круглых просветов и прорезей" },
  satellite: { label: "Спутник", min: 0.5, max: 1.6, step: 0.01, hint: "Размер отдельных точек" },
  attract: { label: "Притяжение спутника", min: 0, max: 1, step: 0.01, hint: "Спутник тянется к телу буквы" },
  ink: { label: "Разлив", min: -0.3, max: 0.3, step: 0.01, unit: "m", hint: "Общее смещение контура" },
  slant: { label: "Наклон", min: -20, max: 20, step: 0.5, unit: "°" },
}

export type LayerNumKey = "x" | "y" | "scale" | "rotation" | "k" | "gap" | "t" | "opacity"
export const layerParams: Record<LayerNumKey, ParamDef> = {
  x: { label: "X", min: -30, max: 30, step: 0.05, unit: "m", mode: "offset" },
  y: { label: "Y", min: -20, max: 20, step: 0.05, unit: "m", mode: "offset" },
  scale: { label: "Масштаб", min: 0.2, max: 4, step: 0.01 },
  rotation: { label: "Поворот", min: -180, max: 180, step: 1, unit: "°", mode: "offset" },
  k: { label: "Мягкость", min: 0, max: 3, step: 0.01, unit: "m", hint: "Радиус слияния или сглаживания" },
  gap: { label: "Просвет", min: -0.5, max: 1.5, step: 0.01, unit: "m", hint: "Зазор между буквами" },
  t: { label: "Доля", min: 0, max: 1, step: 0.01, hint: "Положение между нижними слоями и этой буквой" },
  opacity: { label: "Прозрачность", min: 0, max: 1, step: 0.01 },
}

type NumKeys<T> = { [K in keyof T]-?: T[K] extends number ? K : never }[keyof T]
export type WarpKey = NumKeys<Warp>
export type MaterialNumKey = NumKeys<Material>
export type LookNumKey = NumKeys<Look>
export type ShapeNumKey = NumKeys<ShapeDef>

export const warpParams: Record<WarpKey, ParamDef> = {
  wave: { label: "Волна", min: 0, max: 1.5, step: 0.01, unit: "m" },
  waveFreq: { label: "Частота волны", min: 0.1, max: 3, step: 0.01 },
  waveSpeed: { label: "Скорость волны", min: 0, max: 3, step: 0.01 },
  flow: { label: "Текучесть", min: 0, max: 1.5, step: 0.01, unit: "m" },
  flowScale: { label: "Масштаб течения", min: 0.05, max: 2, step: 0.01 },
  flowSpeed: { label: "Скорость течения", min: 0, max: 3, step: 0.01 },
  pointer: { label: "Линза курсора", min: -0.9, max: 0.9, step: 0.01, hint: "Плюс увеличивает форму под курсором, минус стягивает" },
  pointerRadius: { label: "Радиус линзы", min: 0.5, max: 10, step: 0.1, unit: "m" },
}

export const lookParams: Record<LookNumKey, ParamDef> = {
  line: { label: "Толщина линии", min: 0.02, max: 0.8, step: 0.01, unit: "m" },
  spacing: { label: "Шаг колец", min: 0.08, max: 1.5, step: 0.01, unit: "m" },
  rings: { label: "Число колец", min: 1, max: 30, step: 1 },
  dot: { label: "Шаг растра", min: 0.08, max: 1, step: 0.01, unit: "m" },
  stripes: { label: "Полос на модуль", min: 1, max: 8, step: 0.5, hint: "Частота полос в модулях буквы" },
  stripeFill: { label: "Заполнение полос", min: 0.1, max: 0.9, step: 0.01, hint: "Доля полосы в её шаге" },
  inset: { label: "Зазор модулей", min: 0, max: 0.4, step: 0.01, unit: "m", hint: "Просвет между фигурами геометрической буквы" },
}

export const materialParams: Partial<Record<MaterialNumKey, ParamDef>> = {
  auroraScale: { label: "Масштаб авроры", min: 0.03, max: 1.5, step: 0.01 },
  auroraSpeed: { label: "Скорость авроры", min: 0, max: 2, step: 0.01 },
  depth: { label: "Глубина градиента", min: 0.05, max: 2, step: 0.01, unit: "m" },
  overlap: { label: "Полутень", min: 0, max: 1, step: 0.01, hint: "Цвет зоны наложения букв внутри сплава" },
  glow: { label: "Корона", min: 0, max: 2, step: 0.01 },
  glowSize: { label: "Размер короны", min: 0.1, max: 5, step: 0.01, unit: "m" },
  shadow: { label: "Тень", min: 0, max: 1, step: 0.01 },
  shadowX: { label: "Сдвиг тени X", min: -3, max: 3, step: 0.01, unit: "m" },
  shadowY: { label: "Сдвиг тени Y", min: -3, max: 3, step: 0.01, unit: "m" },
  shadowSoft: { label: "Мягкость тени", min: 0, max: 3, step: 0.01, unit: "m" },
  grain: { label: "Зерно", min: 0, max: 1, step: 0.01 },
}

export const shapeParams: Record<ShapeNumKey, ParamDef> = {
  w: { label: "Ширина", min: 0.1, max: 40, step: 0.05, unit: "m" },
  h: { label: "Высота", min: 0.05, max: 40, step: 0.05, unit: "m" },
  r: { label: "Скругление", min: 0, max: 10, step: 0.05, unit: "m" },
  sides: { label: "Стороны", min: 3, max: 16, step: 1 },
  inner: { label: "Глубина лучей", min: 0.1, max: 1, step: 0.01 },
  sweep: { label: "Сектор", min: 1, max: 360, step: 1, unit: "°" },
  hole: { label: "Отверстие", min: 0, max: 0.95, step: 0.01 },
}

export const sceneParams = {
  speed: { label: "Темп времени", min: 0, max: 3, step: 0.01 } as ParamDef,
  tracking: { label: "Трекинг", min: -3, max: 3, step: 0.05, unit: "m" } as ParamDef,
}

/* ---------- targets ---------- */

export type Target =
  | { scope: "axes" | "warp" | "material" | "look" | "scene"; path: string[] }
  | { scope: "node"; id: string; path: string[] }

export function parseTarget(target: string): Target | null {
  const m = target.match(/^layer:([^.]+)\.(.+)$/)
  if (m) return { scope: "node", id: m[1], path: m[2].split(".") }
  const [head, ...path] = target.split(".")
  if (!path.length) return null
  if (head === "axes" || head === "warp" || head === "material" || head === "look" || head === "scene") return { scope: head, path }
  return null
}

export const layerTarget = (id: string, key: string) => `layer:${id}.${key}`

/** Definition of a target path. */
export function paramDef(target: string): ParamDef | undefined {
  const t = parseTarget(target)
  if (!t) return undefined
  const [a, b] = t.path
  switch (t.scope) {
    case "axes":
      return axisParams[a as AxisKey]
    case "warp":
      return warpParams[a as WarpKey]
    case "material":
      return materialParams[a as MaterialNumKey]
    case "look":
      return lookParams[a as LookNumKey]
    case "scene":
      return sceneParams[a as keyof typeof sceneParams]
    case "node":
      if (t.path.length === 1) return layerParams[a as LayerNumKey]
      if (a === "look") return lookParams[b as LookNumKey]
      if (a === "shape") return shapeParams[b as ShapeNumKey]
      if (a === "axes") return axisParams[b as AxisKey]
      return undefined
  }
}

/** Reads a nested number; undefined when the path does not lead to one. */
export function readPath(obj: unknown, path: string[]): number | undefined {
  let v: unknown = obj
  for (const k of path) {
    if (!v || typeof v !== "object") return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return typeof v === "number" ? v : undefined
}

/** Returns a copy of `obj` with the number at `path` replaced (copies only along the path). */
export function writePath<T>(obj: T, path: string[], value: number): T {
  if (!path.length) return obj
  const [k, ...rest] = path
  const src = (obj ?? {}) as Record<string, unknown>
  return { ...src, [k]: rest.length ? writePath(src[k], rest, value) : value } as T
}

/** Value a node path falls back to when the node does not set it (looks and axes inherit). */
function nodeFallback(scene: Pick<Scene, "look" | "axes">, path: string[]): number | undefined {
  if (path[0] === "look") return readPath(scene.look, path.slice(1))
  if (path[0] === "axes") return readPath(scene.axes, path.slice(1))
  if (path[0] === "opacity") return 1
  return undefined
}

/** Reads the current value of a modulation target from a scene. */
export function readParam(scene: Pick<Scene, "axes" | "warp" | "material" | "look" | "layers" | "speed" | "tracking">, target: string): number | undefined {
  const t = parseTarget(target)
  if (!t) return undefined
  if (t.scope === "node") {
    const n = scene.layers.find((x) => x.id === t.id)
    if (!n) return undefined
    return readPath(n, t.path) ?? nodeFallback(scene, t.path)
  }
  if (t.scope === "scene") return t.path[0] === "speed" ? scene.speed : t.path[0] === "tracking" ? scene.tracking : undefined
  return readPath(scene[t.scope], t.path)
}

/** Base value of a node path, including inherited ones. */
export function readNodeParam(scene: Pick<Scene, "look" | "axes">, n: Layer, path: string[]) {
  return readPath(n, path) ?? nodeFallback(scene, path)
}
