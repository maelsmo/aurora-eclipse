import { useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { GlyphPicker } from "@/components/shared/GlyphPicker"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { Section, Hint } from "@/components/shared/Section"
import { axisKeys, defaultAxes, type AxisKey } from "@/engine/axes"
import { axisParams, layerParams, layerTarget, type LayerNumKey } from "@/engine/params"
import { selectedLayer, useStore } from "@/state/store"
import { nodeLabel } from "@/components/shared/labels"

const transformKeys: LayerNumKey[] = ["x", "y", "scale", "rotation"]

export function FormTab() {
  const axes = useStore((s) => s.scene.axes)
  const layer = useStore(selectedLayer)
  const { setScene, updateLayer } = useStore.getState()
  const [picking, setPicking] = useState(false)
  const letter = layer?.type === "letter" ? layer : null
  const own = !!letter?.axes

  const setAxis = (k: AxisKey, v: number) =>
    setScene((s) => ({ ...s, axes: { ...s.axes, [k]: v } }), "axes." + k)

  return (
    <>
      {layer ? (
        <Section title={nodeLabel(layer)}>
          {letter && <div className="flex items-center gap-2">
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger
                render={<Button variant="outline" className="h-12 w-12 p-1" aria-label={"Буква " + letter.char + ", заменить"} />}
              >
                <GlyphThumb char={letter.char} set={letter.set} color={letter.color} />
              </PopoverTrigger>
              <PopoverContent className="w-80" align="start">
                <GlyphPicker
                  value={letter.char}
                  set={letter.set}
                  onPick={(c) => {
                    updateLayer(layer.id, { char: c })
                    setPicking(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Цвет</span>
              <ColorInput
                value={layer.color}
                label="Цвет слоя"
                showValue
                onChange={(c) => updateLayer(layer.id, { color: c }, "color:" + layer.id)}
              />
            </div>
          </div>}
          {transformKeys.map((k) => (
            <ParamSlider
              key={k}
              def={layerParams[k]}
              value={layer[k] ?? 1}
              target={layerTarget(layer.id, k)}
              onChange={(v) => updateLayer(layer.id, { [k]: v }, k + ":" + layer.id)}
            />
          ))}
          {letter && <div className="flex items-center justify-between gap-2">
            <Label htmlFor="own-axes" className="text-sm font-normal">
              Свои оси у слоя
            </Label>
            <Switch
              id="own-axes"
              checked={own}
              onCheckedChange={(v) => updateLayer(layer.id, { axes: v ? { weight: axes.weight } : undefined })}
            />
          </div>}
          {letter && own &&
            axisKeys.map((k) => (
              <ParamSlider
                key={k}
                def={axisParams[k]}
                value={letter.axes?.[k] ?? axes[k]}
                onChange={(v) => updateLayer(layer.id, { axes: { ...letter.axes, [k]: v } }, "laxes." + k + layer.id)}
              />
            ))}
        </Section>
      ) : (
        <Section title="Слой">
          <Hint>Выберите букву на холсте или в списке слоёв, чтобы менять её положение, цвет и собственные оси.</Hint>
        </Section>
      )}
      <Section
        title="Оси шрифта"
        action={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Сбросить оси"
            onClick={() => setScene((s) => ({ ...s, axes: { ...defaultAxes } }))}
          >
            <RotateCcw />
          </Button>
        }
      >
        <Hint>Одни и те же числа перестраивают все буквы по общим правилам сетки.</Hint>
        {axisKeys.map((k) => (
          <ParamSlider key={k} def={axisParams[k]} value={axes[k]} target={"axes." + k} onChange={(v) => setAxis(k, v)} />
        ))}
      </Section>
    </>
  )
}
