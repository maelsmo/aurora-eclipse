import type { Layer, ShapeKind } from "@/engine/scene"

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
