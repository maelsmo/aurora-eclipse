import { ParamSlider } from "@/components/shared/ParamSlider"
import { Section, Hint } from "@/components/shared/Section"
import { opIcons } from "@/components/shared/icons"
import { opInfo, ops } from "@/engine/operators"
import { layerParams, layerTarget } from "@/engine/params"
import { selectedLayer, useStore } from "@/state/store"
import { cn } from "@/lib/utils"

export function CombineTab() {
  const layer = useStore(selectedLayer)
  const isBase = useStore((s) => s.scene.layers[0]?.id === s.selected)
  const updateLayer = useStore((s) => s.updateLayer)

  if (!layer)
    return (
      <Section title="Сочетание">
        <Hint>
          Каждый слой сочетается со всем, что лежит под ним. Выберите букву, чтобы задать, как она сливается, затмевает,
          врезается или вырезает.
        </Hint>
      </Section>
    )
  if (isBase)
    return (
      <Section title={`Слой ${layer.char}`}>
        <Hint>Нижний слой — основа сочетания. Оператор задаётся у слоёв над ним.</Hint>
      </Section>
    )

  return (
    <>
      <Section title={`Слой ${layer.char}: оператор`}>
        <div role="radiogroup" aria-label="Оператор сочетания" className="grid grid-cols-2 gap-1.5">
          {ops.map((o) => {
            const I = opIcons[o]
            const on = layer.op === o
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => updateLayer(layer.id, { op: o })}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  on && "border-primary bg-muted font-medium",
                )}
              >
                <I className="size-4 shrink-0" />
                {opInfo[o].name}
              </button>
            )
          })}
        </div>
        <Hint>{opInfo[layer.op].hint}</Hint>
      </Section>
      {opInfo[layer.op].params.length > 0 && (
        <Section title="Параметры">
          {opInfo[layer.op].params.map((k) => (
            <ParamSlider
              key={k}
              def={layerParams[k]}
              value={layer[k]}
              target={layerTarget(layer.id, k)}
              onChange={(v) => updateLayer(layer.id, { [k]: v }, k + ":" + layer.id)}
            />
          ))}
        </Section>
      )}
    </>
  )
}
