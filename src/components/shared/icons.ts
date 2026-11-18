import {
  Blend,
  Eclipse,
  Layers2,
  SquaresExclude,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  WavesHorizontal,
  type LucideIcon,
} from "lucide-react"
import type { Op } from "@/engine/operators"

export const opIcons: Record<Op, LucideIcon> = {
  union: SquaresUnite,
  fuse: Blend,
  eclipse: Eclipse,
  inlay: Layers2,
  cut: SquaresSubtract,
  intersect: SquaresIntersect,
  xor: SquaresExclude,
  morph: WavesHorizontal,
}
