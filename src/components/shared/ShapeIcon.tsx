import { Circle, Hexagon, Minus, Square, Star } from "lucide-react"
import type { ShapeKind } from "@/engine/scene"

const icons = { rect: Square, ellipse: Circle, polygon: Hexagon, star: Star, line: Minus }

export function ShapeIcon({ kind, ...props }: { kind: ShapeKind } & React.ComponentProps<typeof Square>) {
  const I = icons[kind]
  return <I {...props} />
}
