import { FlipHorizontal2, FlipVertical2, Copy, RotateCcwSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ParamSlider } from "@/components/shared/ParamSlider"
import type { GeoDef, PrimDef, PrimDir, PrimMode, Vec } from "@/engine/types"
import { mirrorPrim, movePrim, rotatePrim } from "./editing"

const modeItems: { value: PrimMode | "look"; label: string }[] = [
  { value: "look", label: "Как вид" },
  { value: "fill", label: "Заливка" },
  { value: "lines", label: "Линии" },
  { value: "outline", label: "Контур" },
]
const dirItems: { value: PrimDir; label: string }[] = [
  { value: "h", label: "Гориз." },
  { value: "v", label: "Верт." },
  { value: "arc", label: "Дуги" },
  { value: "contour", label: "Контуры" },
]
const cornerNames = ["Левый верхний", "Правый верхний", "Правый нижний", "Левый нижний"]

/** Properties of a geometric module: corners, radii, drawing mode, stripe direction, cut-out. */
export function GeoModuleControls({ prim, onChange }: { prim: GeoDef; onChange: (p: GeoDef, key: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {prim.kind === "box" && (
        <>
          {(prim.r ?? [0, 0, 0, 0]).map((r, i) => {
            const side = Math.min(Math.abs(prim.b[0] - prim.a[0]), Math.abs(prim.b[1] - prim.a[1]))
            return (
              <ParamSlider
                key={i}
                def={{ label: cornerNames[i], min: 0, max: Math.max(side, 0.25), step: 0.25, unit: "m", hint: "Радиус до полной стороны превращает клетку в четверть круга" }}
                value={r}
                onChange={(v) => {
                  const next = [...(prim.r ?? [0, 0, 0, 0])] as NonNullable<typeof prim.r>
                  next[i] = v
                  onChange({ ...prim, r: next }, "corner" + i)
                }}
              />
            )
          })}
        </>
      )}
      {prim.kind === "ellipse" && (
        <>
          <ParamSlider def={{ label: "Радиус X", min: 0.25, max: 5, step: 0.25, unit: "m" }} value={prim.rx} onChange={(v) => onChange({ ...prim, rx: v }, "rx")} />
          <ParamSlider def={{ label: "Радиус Y", min: 0.25, max: 5, step: 0.25, unit: "m" }} value={prim.ry} onChange={(v) => onChange({ ...prim, ry: v }, "ry")} />
        </>
      )}
      {prim.kind === "sector" && (
        <>
          <ParamSlider def={{ label: "Радиус", min: 0.25, max: 5, step: 0.25, unit: "m" }} value={prim.r} onChange={(v) => onChange({ ...prim, r: v }, "r")} />
          <ParamSlider def={{ label: "Внутренний радиус", min: 0, max: Math.max(prim.r - 0.25, 0), step: 0.25, unit: "m" }} value={prim.r0 ?? 0} onChange={(v) => onChange({ ...prim, r0: v || undefined }, "r0")} />
          <ParamSlider def={{ label: "Начальный угол", min: -360, max: 360, step: 15, unit: "°" }} value={prim.a0} onChange={(v) => onChange({ ...prim, a0: Math.min(v, prim.a1 - 15) }, "a0")} />
          <ParamSlider def={{ label: "Конечный угол", min: -360, max: 720, step: 15, unit: "°" }} value={prim.a1} onChange={(v) => onChange({ ...prim, a1: Math.max(v, prim.a0 + 15) }, "a1")} />
        </>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-foreground/80">Отрисовка модуля</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[prim.mode ?? "look"]}
          onValueChange={(v) => v[0] && onChange({ ...prim, mode: v[0] === "look" ? undefined : (v[0] as PrimMode) }, "mode")}
          aria-label="Отрисовка модуля"
        >
          {modeItems.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-foreground/80">Направление линий</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[prim.dir ?? "h"]}
          onValueChange={(v) => v[0] && onChange({ ...prim, dir: v[0] as PrimDir }, "dir")}
          aria-label="Направление линий"
        >
          {dirItems.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="module-neg" className="text-sm font-normal">
          Вырез из буквы
        </Label>
        <Switch id="module-neg" checked={!!prim.neg} onCheckedChange={(v) => onChange({ ...prim, neg: v || undefined }, "neg")} />
      </div>
    </div>
  )
}

/** Mirror, turn and duplicate a module around the glyph centre. */
export function ModuleActions({ prim, centre, onReplace, onDuplicate }: { prim: PrimDef; centre: Vec; onReplace: (p: PrimDef) => void; onDuplicate: (p: PrimDef) => void }) {
  const actions = [
    { label: "Отразить по горизонтали", Icon: FlipHorizontal2, run: () => onReplace(mirrorPrim(prim, "x", centre)) },
    { label: "Отразить по вертикали", Icon: FlipVertical2, run: () => onReplace(mirrorPrim(prim, "y", centre)) },
    { label: "Повернуть на 90°", Icon: RotateCcwSquare, run: () => onReplace(rotatePrim(prim, centre)) },
    { label: "Дублировать модуль", Icon: Copy, run: () => onDuplicate(movePrim(prim, [0.5, -0.5])) },
  ]
  return (
    <div className="flex gap-1">
      {actions.map(({ label, Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label={label} onClick={run} />}>
            <Icon />
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
