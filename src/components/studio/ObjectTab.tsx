import { useState } from "react"
import { Combine, FlipHorizontal2, FlipVertical2, Folder, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { GlyphPicker } from "@/components/shared/GlyphPicker"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { Section, Hint } from "@/components/shared/Section"
import { nodeLabel } from "@/components/shared/labels"
import { axisKeys, defaultAxes, type AxisKey } from "@/engine/axes"
import { axisParams, layerParams, layerTarget, type LayerNumKey } from "@/engine/params"
import { isGroup, isLeaf, LIMITS, normalize, type Artboard } from "@/engine/scene"
import { selectedIds, useStore } from "@/state/store"
import { ShapeControls } from "./ShapeControls"

const transformKeys: LayerNumKey[] = ["x", "y", "scale", "rotation"]

/** «Объект»: what the selected node is and where it sits. */
export function ObjectTab() {
  const scene = useStore((s) => s.scene)
  const ids = useStore(useShallow(selectedIds))
  const { updateLayer, updateLayers, setScene } = useStore.getState()
  const [picking, setPicking] = useState(false)
  const nodes = scene.layers.filter((l) => ids.includes(l.id))
  const layer = nodes.find((n) => n.id === ids[ids.length - 1])
  if (!layer) return null

  if (nodes.length > 1) {
    const leaves = nodes.filter(isLeaf)
    return (
      <Section title={`Выбрано: ${nodes.length}`}>
        <Hint>Изменения применяются ко всем выбранным. Перемещайте, масштабируйте и вращайте их вместе рамкой на холсте.</Hint>
        {leaves.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/80">Цвет</span>
            <ColorInput
              value={leaves[0].color}
              label="Цвет выбранных"
              showValue
              onChange={(c) => updateLayers(leaves.map((l) => ({ id: l.id, patch: { color: c } })), "color:" + ids.join(","))}
            />
          </div>
        )}
        <ParamSlider
          def={layerParams.opacity}
          value={layer.opacity ?? 1}
          onChange={(v) => updateLayers(nodes.map((n) => ({ id: n.id, patch: { opacity: v < 1 ? v : undefined } })), "opacity:" + ids.join(","))}
        />
      </Section>
    )
  }

  const letter = layer.type === "letter" ? layer : null
  const shape = layer.type === "shape" ? layer : null
  const group = isGroup(layer) ? layer : null
  const own = !!letter?.axes
  return (
    <>
      <Section title={nodeLabel(layer)}>
        {letter && (
          <div className="flex items-center gap-2">
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-12 w-12 p-1"
                    style={scene.material.transparent ? undefined : { background: scene.material.background }}
                    aria-label={"Буква " + letter.char + ", заменить"}
                  />
                }
              >
                <GlyphThumb char={letter.char} set={letter.set} color={letter.color} />
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <GlyphPicker
                  value={letter.char}
                  set={letter.set ?? scene.set}
                  onSet={(id) => updateLayer(letter.id, { set: id === scene.set ? undefined : id })}
                  onPick={(c) => {
                    updateLayer(letter.id, { char: c })
                    setPicking(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Цвет</span>
              <ColorInput value={letter.color} label="Цвет буквы" showValue onChange={(c) => updateLayer(letter.id, { color: c }, "color:" + letter.id)} />
            </div>
          </div>
        )}
        {shape && <ShapeControls node={shape} />}
        {group && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-foreground/80">Как рисуются объекты группы</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[group.mode]}
              onValueChange={(v) => {
                if (!v[0] || v[0] === group.mode) return
                const leaves = scene.layers.filter((l) => l.parent === group.id && !isGroup(l)).length
                if (v[0] === "merge" && leaves > LIMITS.mergeChildren)
                  return void toast.error(`В сплаве не больше ${LIMITS.mergeChildren} объектов, в группе ${leaves}. Разбейте её на несколько сплавов.`)
                const nested = scene.layers.some((l) => l.parent === group.id && isGroup(l))
                setScene((s) => ({ ...s, layers: normalize(s.layers.map((l) => (l.id === group.id ? { ...group, mode: v[0] as "stack" | "merge" } : l))) }))
                if (v[0] === "merge" && nested) toast("Вложенные группы вынесены из сплава: в сплаве только буквы и фигуры.")
              }}
              className="w-full"
              aria-label="Режим группы"
            >
              <ToggleGroupItem value="stack" className="flex-1">
                <Folder />
                Независимо
              </ToggleGroupItem>
              <ToggleGroupItem value="merge" className="flex-1">
                <Combine />
                Сплав
              </ToggleGroupItem>
            </ToggleGroup>
            <Hint>
              {group.mode === "merge"
                ? "Формы сливаются операторами вкладки «Сочетание»: нижняя — основа, каждая следующая сочетается со всем, что под ней."
                : "Каждый объект рисуется сам по себе, со своим видом; группа задаёт общий сдвиг, поворот, масштаб и вид."}
            </Hint>
            {group.mode === "stack" && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="group-mask" className="flex flex-col items-start gap-0.5 text-sm font-normal">
                  Маска
                  <span className="text-xs text-muted-foreground">Нижний объект обрезает остальные и сам не рисуется</span>
                </Label>
                <Switch id="group-mask" checked={!!group.mask} onCheckedChange={(v) => updateLayer(group.id, { mask: v || undefined })} />
              </div>
            )}
          </div>
        )}
      </Section>
      <Section title="Положение">
        {transformKeys.map((k) => (
          <ParamSlider key={k} def={layerParams[k]} value={layer[k] as number} target={layerTarget(layer.id, k)} onChange={(v) => updateLayer(layer.id, { [k]: v }, k + ":" + layer.id)} />
        ))}
        <ParamSlider
          def={layerParams.opacity}
          value={layer.opacity ?? 1}
          target={layerTarget(layer.id, "opacity")}
          onChange={(v) => updateLayer(layer.id, { opacity: v < 1 ? v : undefined }, "opacity:" + layer.id)}
        />
        <div className="flex items-center gap-1">
          <Toggle size="sm" variant="outline" pressed={!!layer.flipX} onPressedChange={(v) => updateLayer(layer.id, { flipX: v || undefined })} aria-label="Отразить по горизонтали">
            <FlipHorizontal2 />
            По горизонтали
          </Toggle>
          <Toggle size="sm" variant="outline" pressed={!!layer.flipY} onPressedChange={(v) => updateLayer(layer.id, { flipY: v || undefined })} aria-label="Отразить по вертикали">
            <FlipVertical2 />
            По вертикали
          </Toggle>
        </div>
      </Section>
      {letter && (
        <Section title="Свои оси буквы">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="own-axes" className="text-sm font-normal">
              Отличаться от сцены
            </Label>
            <Switch id="own-axes" checked={own} onCheckedChange={(v) => updateLayer(letter.id, { axes: v ? { weight: scene.axes.weight } : undefined })} />
          </div>
          {own &&
            axisKeys.map((k) => (
              <ParamSlider
                key={k}
                def={axisParams[k]}
                value={letter.axes?.[k] ?? scene.axes[k]}
                target={layerTarget(letter.id, "axes." + k)}
                onChange={(v) => updateLayer(letter.id, { axes: { ...letter.axes, [k]: v } }, "laxes." + k + letter.id)}
              />
            ))}
        </Section>
      )}
    </>
  )
}

const artboardPresets: { label: string; w: number; h: number }[] = [
  { label: "16:9", w: 32, h: 18 },
  { label: "1:1", w: 24, h: 24 },
  { label: "4:5", w: 24, h: 30 },
  { label: "9:16", w: 18, h: 32 },
  { label: "A4", w: 21, h: 29.7 },
]
const abDefs = {
  w: { label: "Ширина", min: 2, max: 200, step: 0.5, unit: "m" },
  h: { label: "Высота", min: 2, max: 200, step: 0.5, unit: "m" },
  x: { label: "Центр X", min: -100, max: 100, step: 0.25, unit: "m" },
  y: { label: "Центр Y", min: -100, max: 100, step: 0.25, unit: "m" },
}

/** «Сцена»: frame, default set and font axes. */
export function SceneTab() {
  const scene = useStore((s) => s.scene)
  const sets = useStore((s) => s.sets)
  const { setScene } = useStore.getState()
  const a = scene.artboard
  const setA = (p: Partial<Artboard>, key?: string) => setScene((s) => ({ ...s, artboard: { ...s.artboard, ...p } }), key)
  const setAxis = (k: AxisKey, v: number) => setScene((s) => ({ ...s, axes: { ...s.axes, [k]: v } }), "axes." + k)
  return (
    <>
      <Section
        title="Артборд"
        action={<Switch checked={a.enabled} onCheckedChange={(v) => setA({ enabled: v })} aria-label="Показывать артборд" />}
      >
        <Hint>Кадр композиции: по нему кадрируются экспорт PNG, SVG и видео. 1 модуль = 10 мм.</Hint>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[artboardPresets.find((p) => p.w === a.w && p.h === a.h)?.label ?? ""]}
          onValueChange={(v) => {
            const p = artboardPresets.find((x) => x.label === v[0])
            if (p) setA({ w: p.w, h: p.h, enabled: true })
          }}
          className="w-full"
          aria-label="Формат артборда"
        >
          {artboardPresets.map((p) => (
            <ToggleGroupItem key={p.label} value={p.label} className="flex-1 px-1">
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {(["w", "h", "x", "y"] as const).map((k) => (
          <ParamSlider key={k} def={abDefs[k]} value={a[k]} onChange={(v) => setA({ [k]: v }, "artboard." + k)} />
        ))}
      </Section>
      <Section title="Сет по умолчанию">
        <Select items={sets.map((s) => ({ value: s.id, label: s.name }))} value={scene.set} onValueChange={(v) => v && setScene((s) => ({ ...s, set: v }))}>
          <SelectTrigger className="w-full" aria-label="Сет по умолчанию">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sets.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Hint>Буквы без своего сета берутся отсюда. Сет конкретной буквы меняется во вкладке «Объект».</Hint>
      </Section>
      <Section
        title="Оси шрифта"
        action={
          <Button variant="ghost" size="icon-xs" aria-label="Сбросить оси" onClick={() => setScene((s) => ({ ...s, axes: { ...defaultAxes } }))}>
            <RotateCcw />
          </Button>
        }
      >
        <Hint>Одни и те же числа перестраивают все буквы по общим правилам сетки. «Окончания» у геометрического сета делают клетки квадратными.</Hint>
        {axisKeys.map((k) => (
          <ParamSlider key={k} def={axisParams[k]} value={scene.axes[k]} target={"axes." + k} onChange={(v) => setAxis(k, v)} />
        ))}
      </Section>
    </>
  )
}
