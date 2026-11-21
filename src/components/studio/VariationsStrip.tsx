import { useMemo, useState } from "react"
import { Dices, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SceneThumb } from "@/components/shared/Thumbs"
import { mutateScene, randomScene, type Locks } from "@/engine/variations"
import { presets } from "@/engine/presets"
import { charset } from "@/engine/alphabet"
import type { Scene } from "@/engine/scene"
import { useStore } from "@/state/store"

const lockItems: { value: keyof Locks; label: string }[] = [
  { value: "letters", label: "Буквы" },
  { value: "combine", label: "Сочетание" },
  { value: "form", label: "Форма" },
  { value: "material", label: "Материал" },
]
const presetItems = presets.map((p) => ({ value: p.id, label: p.name }))

export function VariationsStrip() {
  const replaceScene = useStore((s) => s.replaceScene)
  const [mode, setMode] = useState<"random" | "mutate" | null>(null)
  const [seed, setSeed] = useState(1)
  const [strength, setStrength] = useState(0.5)
  const [locked, setLocked] = useState<string[]>([])
  const [base, setBase] = useState<Scene | null>(null)

  const locks: Locks = {
    letters: locked.includes("letters"),
    combine: locked.includes("combine"),
    form: locked.includes("form"),
    material: locked.includes("material"),
  }

  const variants = useMemo(() => {
    if (!mode || !base) return []
    return Array.from({ length: 8 }, (_, i) =>
      mode === "random"
        ? randomScene(seed * 97 + i * 7919, charset, base, locks)
        : mutateScene(seed * 97 + i * 7919, charset, base, strength, locks),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, seed, base, strength, locked.join()])

  function generate(next: "random" | "mutate") {
    setBase(useStore.getState().scene)
    setMode(next)
    setSeed((s) => s + 1)
  }

  return (
    <section aria-label="Варианты" className="flex flex-col gap-2 rounded-xl border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger render={<Button size="sm" onClick={() => generate("random")} />}>
            <Dices data-icon="inline-start" />
            Случайные
          </TooltipTrigger>
          <TooltipContent>Новые неожиданные сочетания букв и операторов</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button size="sm" variant="outline" onClick={() => generate("mutate")} />}>
            <Sparkles data-icon="inline-start" />
            Мутации
          </TooltipTrigger>
          <TooltipContent>Варианты рядом с текущей композицией</TooltipContent>
        </Tooltip>
        <div className="flex w-40 items-center gap-2" title="Сила мутации">
          <span className="text-xs text-muted-foreground">Сила</span>
          <Slider
            aria-label="Сила мутации"
            min={0.1}
            max={1}
            step={0.05}
            value={[strength]}
            onValueChange={(v) => setStrength(Array.isArray(v) ? v[0] : v)}
          />
        </div>
        <span className="text-xs text-muted-foreground">Не менять</span>
        <ToggleGroup
          multiple
          size="sm"
          variant="outline"
          spacing={0}
          value={locked}
          onValueChange={setLocked}
          aria-label="Не менять"
        >
          {lockItems.map((l) => (
            <ToggleGroupItem key={l.value} value={l.value} aria-label={"Не менять: " + l.label}>
              {l.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto">
          <Select items={presetItems} value={null} onValueChange={(v) => {
            const p = presets.find((x) => x.id === v)
            if (p) replaceScene(p.make())
          }}>
            <SelectTrigger size="sm" className="w-48" aria-label="Стартовые сочетания">
              <SelectValue placeholder="Стартовые сочетания" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {variants.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 xl:grid-cols-8">
          {variants.map((v, i) => (
            <li key={seed + ":" + i}>
              <button
                type="button"
                aria-label={`Применить вариант ${i + 1}: ${v.layers.map((l) => (l.type === "letter" ? l.char : "")).join(" ")}`}
                onClick={() => replaceScene(v)}
                className="block aspect-[4/3] w-full overflow-hidden rounded-lg border outline-none transition hover:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                style={{ background: v.material.transparent ? undefined : v.material.background }}
              >
                <SceneThumb scene={v} options={{ pad: 0.12, time: 0 }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
