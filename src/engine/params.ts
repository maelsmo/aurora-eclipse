// Registry of every numeric parameter: labels, ranges and modulation targets.
import type { AxisKey } from "./axes"
import type { Material, Warp, Layer } from "./scene"

export type ParamDef = {
  label: string
  min: number
  max: number
  step: number
  unit?: string
  hint?: string
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

export type LayerNumKey = "x" | "y" | "scale" | "rotation" | "k" | "gap" | "t"
export const layerParams: Record<LayerNumKey, ParamDef> = {
  x: { label: "X", min: -30, max: 30, step: 0.05, unit: "m" },
  y: { label: "Y", min: -20, max: 20, step: 0.05, unit: "m" },
  scale: { label: "Масштаб", min: 0.2, max: 4, step: 0.01 },
  rotation: { label: "Поворот", min: -180, max: 180, step: 1, unit: "°" },
  k: { label: "Мягкость", min: 0, max: 3, step: 0.01, unit: "m", hint: "Радиус слияния или сглаживания" },
  gap: { label: "Просвет", min: -0.5, max: 1.5, step: 0.01, unit: "m", hint: "Зазор между буквами" },
  t: { label: "Доля", min: 0, max: 1, step: 0.01, hint: "Положение между нижними слоями и этой буквой" },
}

type NumKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T]
export type WarpKey = NumKeys<Warp>
export type MaterialNumKey = NumKeys<Material>

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

export const materialParams: Partial<Record<MaterialNumKey, ParamDef>> = {
  line: { label: "Толщина линии", min: 0.02, max: 0.8, step: 0.01, unit: "m" },
  spacing: { label: "Шаг колец", min: 0.08, max: 1.5, step: 0.01, unit: "m" },
  rings: { label: "Число колец", min: 1, max: 30, step: 1 },
  dot: { label: "Шаг растра", min: 0.08, max: 1, step: 0.01, unit: "m" },
  auroraScale: { label: "Масштаб авроры", min: 0.03, max: 1.5, step: 0.01 },
  auroraSpeed: { label: "Скорость авроры", min: 0, max: 2, step: 0.01 },
  depth: { label: "Глубина градиента", min: 0.05, max: 2, step: 0.01, unit: "m" },
  overlap: { label: "Полутень", min: 0, max: 1, step: 0.01, hint: "Цвет зоны наложения букв" },
  glow: { label: "Корона", min: 0, max: 2, step: 0.01 },
  glowSize: { label: "Размер короны", min: 0.1, max: 5, step: 0.01, unit: "m" },
  shadow: { label: "Тень", min: 0, max: 1, step: 0.01 },
  shadowX: { label: "Сдвиг тени X", min: -3, max: 3, step: 0.01, unit: "m" },
  shadowY: { label: "Сдвиг тени Y", min: -3, max: 3, step: 0.01, unit: "m" },
  shadowSoft: { label: "Мягкость тени", min: 0, max: 3, step: 0.01, unit: "m" },
  grain: { label: "Зерно", min: 0, max: 1, step: 0.01 },
}

export const sceneParams = {
  speed: { label: "Темп времени", min: 0, max: 3, step: 0.01 } as ParamDef,
  tracking: { label: "Трекинг", min: -3, max: 3, step: 0.05, unit: "m" } as ParamDef,
}

/** Resolves a modulation target path to its definition. */
export function paramDef(target: string): ParamDef | undefined {
  const [head, key] = target.split(".")
  if (head === "axes") return axisParams[key as AxisKey]
  if (head === "warp") return warpParams[key as WarpKey]
  if (head === "material") return materialParams[key as MaterialNumKey]
  if (head === "scene") return sceneParams[key as keyof typeof sceneParams]
  if (head.startsWith("layer:")) return layerParams[key as LayerNumKey]
  return undefined
}

export const layerTarget = (id: string, key: LayerNumKey) => `layer:${id}.${key}`

export type LayerNum = Pick<Layer, LayerNumKey>

/** Reads the current value of a modulation target from a scene. */
export function readParam(
  scene: { axes: object; warp: object; material: object; layers: Layer[]; speed: number; tracking: number },
  target: string,
): number | undefined {
  const [head, key] = target.split(".")
  if (head === "axes") return (scene.axes as Record<string, number>)[key]
  if (head === "warp") return (scene.warp as Record<string, number>)[key]
  if (head === "material") return (scene.material as Record<string, number>)[key]
  if (head === "scene") return key === "speed" ? scene.speed : scene.tracking
  if (head.startsWith("layer:")) {
    const l = scene.layers.find((x) => x.id === head.slice(6))
    return l ? (l[key as LayerNumKey] as number) : undefined
  }
  return undefined
}
