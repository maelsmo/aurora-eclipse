import type { ClonerPick, EffectorKind, Layer, ShapeKind } from "@/engine/scene"

export const shapeNames: Record<ShapeKind, string> = {
  rect: "Прямоугольник",
  ellipse: "Эллипс",
  polygon: "Многоугольник",
  star: "Звезда",
  line: "Линия",
}

/** Short human name of a node. */
export function nodeLabel(n: Layer | null | undefined): string {
  if (!n) return "Удалённый слой"
  if (n.name) return n.name
  if (n.type === "letter") return n.char
  if (n.type === "shape") return shapeNames[n.shape.kind]
  return n.mode === "merge" ? "Сплав" : "Группа"
}

/** Letters of a scene as a string (file names, default titles). */
export const sceneChars = (layers: Layer[]) => layers.map((l) => (l.type === "letter" ? l.char : "")).join("")

/** Zone rules of cloners. */
export const pickNames: Record<ClonerPick, string> = {
  cycle: "По порядку",
  random: "Случайно",
  rows: "По рядам",
  cols: "По колонкам",
  rings: "Кольцами",
  diamond: "Ромбами",
  diagonal: "Диагоналями",
  checker: "Шахматкой",
}

/** Effector kinds. */
export const effectorNames: Record<EffectorKind, string> = { random: "Случайность", noise: "Шум", wave: "Волна", field: "Поле" }
