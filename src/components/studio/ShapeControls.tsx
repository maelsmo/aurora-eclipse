import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { ShapeIcon } from "@/components/shared/ShapeIcon"
import { shapeNames } from "@/components/shared/labels"
import { layerTarget, shapeParams, type ParamDef, type ShapeNumKey } from "@/engine/params"
import { shapeKinds, type ShapeDef, type ShapeKind, type ShapeNode } from "@/engine/scene"
import { useStore } from "@/state/store"

const keysByKind: Record<ShapeKind, ShapeNumKey[]> = {
  rect: ["w", "h", "r"],
  ellipse: ["w", "h", "sweep", "hole"],
  polygon: ["w", "h", "sides", "r"],
  star: ["w", "h", "sides", "inner", "r"],
  line: ["w", "h"],
}

const lineLabels: Partial<Record<ShapeNumKey, ParamDef>> = {
  w: { ...shapeParams.w, label: "Длина" },
  h: { ...shapeParams.h, label: "Толщина", max: 4 },
}
const cornerNames = ["Левый верхний", "Правый верхний", "Правый нижний", "Левый нижний"]

/** Parameters of a canvas shape (Figma-like): kind, size, corners, sides, sweep… */
export function ShapeControls({ node }: { node: ShapeNode }) {
  const updateLayer = useStore((s) => s.updateLayer)
  const s = node.shape
  const set = (patch: Partial<ShapeDef>, key?: string) => updateLayer(node.id, { shape: { ...s, ...patch } }, key)
  const corners = s.kind === "rect" && !!s.corners
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[s.kind]}
          onValueChange={(v) => v[0] && set({ kind: v[0] as ShapeKind })}
          aria-label="Вид фигуры"
          className="flex-1"
        >
          {shapeKinds.map((k) => (
            <ToggleGroupItem key={k} value={k} aria-label={shapeNames[k]} className="flex-1">
              <ShapeIcon kind={k} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ColorInput value={node.color} label="Цвет фигуры" onChange={(c) => updateLayer(node.id, { color: c }, "color:" + node.id)} />
      </div>
      {keysByKind[s.kind]
        .filter((k) => !(k === "r" && corners))
        .map((k) => (
          <ParamSlider
            key={k}
            def={(s.kind === "line" && lineLabels[k]) || shapeParams[k]}
            value={s[k]}
            target={layerTarget(node.id, "shape." + k)}
            onChange={(v) => set({ [k]: k === "sides" ? Math.round(v) : v }, `shape.${k}:${node.id}`)}
          />
        ))}
      {s.kind === "line" && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="round-caps" className="text-sm font-normal">
            Круглые концы
          </Label>
          <Switch id="round-caps" checked={s.r > 0} onCheckedChange={(v) => set({ r: v ? 1 : 0 })} />
        </div>
      )}
      {s.kind === "rect" && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="own-corners" className="text-sm font-normal">
              Свой радиус у каждого угла
            </Label>
            <Switch id="own-corners" checked={corners} onCheckedChange={(v) => set({ corners: v ? [s.r, s.r, s.r, s.r] : undefined })} />
          </div>
          {corners &&
            s.corners!.map((r, i) => (
              <ParamSlider
                key={i}
                def={{ ...shapeParams.r, label: cornerNames[i] }}
                value={r}
                onChange={(v) => {
                  const c = [...s.corners!] as NonNullable<ShapeDef["corners"]>
                  c[i] = v
                  set({ corners: c }, `corner${i}:${node.id}`)
                }}
              />
            ))}
        </>
      )}
    </div>
  )
}
