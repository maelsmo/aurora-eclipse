import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { Section } from "@/components/shared/Section"
import { SceneThumb } from "@/components/shared/Thumbs"
import { contexts, applyContext } from "@/engine/presets"
import { lookParams, materialParams, type LookNumKey, type MaterialNumKey } from "@/engine/params"
import { isLeaf, type ColorMode, type Look, type LookMode, type Material } from "@/engine/scene"
import { nodeLabel } from "@/components/shared/labels"
import { useStore } from "@/state/store"
import { cn } from "@/lib/utils"

const fills: { value: LookMode; label: string }[] = [
  { value: "fill", label: "Заливка" },
  { value: "outline", label: "Контур" },
  { value: "isolines", label: "Изолинии" },
  { value: "halftone", label: "Полутон" },
]
const colorModes: { value: ColorMode; label: string }[] = [
  { value: "layer", label: "Слои" },
  { value: "aurora", label: "Аврора" },
  { value: "depth", label: "Глубина" },
]
const fillParams: Record<LookMode, LookNumKey[]> = {
  fill: [],
  outline: ["line"],
  lines: ["stripes", "stripeFill"],
  isolines: ["line", "spacing", "rings"],
  halftone: ["dot"],
}

export function MaterialTab() {
  const scene = useStore((s) => s.scene)
  const m = scene.material
  const { setScene, updateLayer } = useStore.getState()
  const setM = (patch: Partial<Material>, key?: string) =>
    setScene((s) => ({ ...s, material: { ...s.material, ...patch } }), key)
  const look = scene.look
  const setL = (patch: Partial<Look>, key?: string) => setScene((s) => ({ ...s, look: { ...s.look, ...patch } }), key)
  const lookSlider = (k: LookNumKey) => (
    <ParamSlider key={k} def={lookParams[k]} value={look[k]} target={"look." + k} onChange={(v) => setL({ [k]: v }, "look." + k)} />
  )
  const slider = (k: MaterialNumKey) => (
    <ParamSlider key={k} def={materialParams[k]!} value={m[k]} target={"material." + k} onChange={(v) => setM({ [k]: v }, "material." + k)} />
  )

  return (
    <>
      <Section title="Контекст">
        <div className="grid grid-cols-2 gap-2">
          {contexts.map((c) => {
            const preview = applyContext(scene, c)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setScene((s) => applyContext(s, c))}
                className="group flex flex-col overflow-hidden rounded-lg border text-left outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="block aspect-[16/9] w-full" style={{ background: c.material.background }}>
                  <SceneThumb scene={preview} options={{ pad: 0.14 }} />
                </span>
                <span className="px-2 py-1.5 text-xs font-medium">{c.name}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Отрисовка">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[look.mode]}
          onValueChange={(v) => v[0] && setL({ mode: v[0] as LookMode })}
          className="w-full"
          aria-label="Способ отрисовки"
        >
          {fills.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="flex-1">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {fillParams[look.mode].map(lookSlider)}
      </Section>

      <Section title="Цвет">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[look.colorMode]}
          onValueChange={(v) => v[0] && setL({ colorMode: v[0] as ColorMode })}
          className="w-full"
          aria-label="Источник цвета"
        >
          {colorModes.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="flex-1">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {look.colorMode === "layer" && (
          <div className="flex flex-wrap gap-1.5">
            {scene.layers.filter(isLeaf).map((l) => (
              <div key={l.id} className="flex items-center gap-1 rounded-lg border py-0.5 pr-0.5 pl-2 text-xs">
                {nodeLabel(l)}
                <ColorInput value={l.color} label={"Цвет слоя " + nodeLabel(l)} className="h-7 w-7 border-0" onChange={(c) => updateLayer(l.id, { color: c }, "color:" + l.id)} />
              </div>
            ))}
          </div>
        )}
        {look.colorMode === "aurora" && (
          <>
            <div className="flex gap-1.5">
              {m.aurora.map((c, i) => (
                <ColorInput
                  key={i}
                  value={c}
                  label={"Цвет авроры " + (i + 1)}
                  onChange={(v) => {
                    const aurora = [...m.aurora] as Material["aurora"]
                    aurora[i] = v
                    setM({ aurora }, "aurora" + i)
                  }}
                />
              ))}
            </div>
            {slider("auroraScale")}
            {slider("auroraSpeed")}
          </>
        )}
        {look.colorMode === "depth" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground/80">Цвет глубины</span>
              <ColorInput value={m.depthColor} label="Цвет глубины" onChange={(v) => setM({ depthColor: v }, "depthColor")} />
            </div>
            {slider("depth")}
          </>
        )}
      </Section>

      <Section title="Полутень" action={<ColorInput value={m.overlapColor} label="Цвет полутени" onChange={(v) => setM({ overlapColor: v }, "overlapColor")} />}>
        {slider("overlap")}
      </Section>

      <Section title="Корона" action={<ColorInput value={m.glowColor} label="Цвет короны" onChange={(v) => setM({ glowColor: v }, "glowColor")} />}>
        {slider("glow")}
        {slider("glowSize")}
      </Section>

      <Section title="Тень" action={<ColorInput value={m.shadowColor} label="Цвет тени" onChange={(v) => setM({ shadowColor: v }, "shadowColor")} />}>
        {slider("shadow")}
        <div className={cn("flex flex-col gap-4", m.shadow === 0 && "opacity-60")}>
          {slider("shadowX")}
          {slider("shadowY")}
          {slider("shadowSoft")}
        </div>
      </Section>

      <Section title="Фон и зерно">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Фон</span>
          <ColorInput value={m.background} label="Цвет фона" showValue onChange={(v) => setM({ background: v }, "background")} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="transparent" className="text-sm font-normal">
            Прозрачный фон
          </Label>
          <Switch id="transparent" checked={m.transparent} onCheckedChange={(v) => setM({ transparent: v })} />
        </div>
        {slider("grain")}
      </Section>
    </>
  )
}
