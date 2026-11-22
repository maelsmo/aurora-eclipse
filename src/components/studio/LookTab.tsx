import { RotateCcw } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { Section, Hint } from "@/components/shared/Section"
import { nodeLabel, plural } from "@/components/shared/labels"
import { lookParams, layerTarget, type LookNumKey } from "@/engine/params"
import { ancestors, mergeParent, type ColorMode, type Look, type LookKey, type LookMode, type LookPatch, type Layer, type Scene } from "@/engine/scene"
import type { Library } from "@/engine/alphabet/sets"
import { selectedIds, useStore } from "@/state/store"

const modes: { value: LookMode; label: string }[] = [
  { value: "fill", label: "Заливка" },
  { value: "lines", label: "Линии" },
  { value: "outline", label: "Контур" },
  { value: "isolines", label: "Изолинии" },
  { value: "halftone", label: "Растр" },
]
const colorModes: { value: ColorMode; label: string }[] = [
  { value: "layer", label: "Свой цвет" },
  { value: "aurora", label: "Аврора" },
  { value: "depth", label: "Глубина" },
]
const params: Record<LookMode, LookNumKey[]> = {
  fill: [],
  outline: ["line"],
  lines: ["stripes", "stripeFill"],
  isolines: ["line", "spacing", "rings"],
  halftone: ["dot"],
}

type Source = { value: Look[LookKey]; from: string }

/** Where each look value of a node comes from: own, a group, its set or the scene. */
export function lookSources(scene: Scene, lib: Library, n: Layer): Record<LookKey, Source> {
  const chain: { patch: LookPatch | undefined; from: string }[] = [{ patch: scene.look, from: "сцена" }]
  if (n.type === "letter") {
    const set = lib.sets[n.set ?? scene.set]?.set
    if (set) chain.push({ patch: set.look, from: "сет «" + set.name + "»" })
  }
  for (const g of ancestors(scene.layers, n.id).reverse()) chain.push({ patch: g.look, from: "«" + nodeLabel(g) + "»" })
  chain.push({ patch: n.look, from: "own" })
  const out = {} as Record<LookKey, Source>
  for (const { patch, from } of chain)
    if (patch) for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k as LookKey] = { value: v as never, from }
  return out
}

/**
 * Look controls. With `sources` the values are resolved and inherited ones
 * are marked (with a reset for own values); without, it edits the scene look.
 */
export function LookEditor({
  look,
  sources,
  onPatch,
  onReset,
  targetFor,
  allowTint,
}: {
  look: Look
  sources?: Record<LookKey, Source>
  onPatch: (p: LookPatch, key?: string) => void
  onReset?: (k: LookKey) => void
  targetFor?: (k: LookNumKey) => string
  allowTint?: boolean
}) {
  const mark = (k: LookKey) => {
    if (!sources) return null
    const s = sources[k]
    if (s?.from === "own")
      return (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Вернуть унаследованное значение" onClick={() => onReset?.(k)} />}>
            <RotateCcw />
          </TooltipTrigger>
          <TooltipContent>Своё значение. Нажмите, чтобы наследовать снова.</TooltipContent>
        </Tooltip>
      )
    return <span className="text-xs text-muted-foreground">от: {s?.from ?? "сцена"}</span>
  }
  const own = (k: LookKey) => sources?.[k]?.from === "own"
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Отрисовка</span>
          {mark("mode")}
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[look.mode]}
          onValueChange={(v) => v[0] && onPatch({ mode: v[0] as LookMode })}
          className="w-full"
          aria-label="Отрисовка"
        >
          {modes.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1 px-1">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {params[look.mode].map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <ParamSlider def={lookParams[k]} value={look[k]} target={targetFor?.(k)} onChange={(v) => onPatch({ [k]: v }, "look." + k)} />
          {sources && <div className="-mt-1 flex justify-end">{mark(k)}</div>}
        </div>
      ))}
      {look.mode === "lines" && (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <span className="text-sm text-foreground/80">Направление линий</span>
            {mark("lineDir")}
          </div>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[look.lineDir ?? "auto"]}
            onValueChange={(v) => v[0] && onPatch({ lineDir: v[0] === "auto" ? undefined : (v[0] as Look["lineDir"]) })}
            className="w-full"
            aria-label="Направление линий"
          >
            <ToggleGroupItem value="auto" className="flex-1 px-1">По модулям</ToggleGroupItem>
            <ToggleGroupItem value="contour" className="flex-1 px-1">Контуры</ToggleGroupItem>
            <ToggleGroupItem value="h" className="flex-1 px-1">Гориз.</ToggleGroupItem>
            <ToggleGroupItem value="v" className="flex-1 px-1">Верт.</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <ParamSlider def={lookParams.inset} value={look.inset} target={targetFor?.("inset")} onChange={(v) => onPatch({ inset: v }, "look.inset")} />
        {sources && <div className="-mt-1 flex justify-end">{mark("inset")}</div>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Цвет</span>
          {mark("colorMode")}
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[look.colorMode]}
          onValueChange={(v) => v[0] && onPatch({ colorMode: v[0] as ColorMode })}
          className="w-full"
          aria-label="Источник цвета"
        >
          {colorModes.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {allowTint && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="look-tint" className="text-sm font-normal">
            Перекрасить содержимое
          </Label>
          <div className="flex items-center gap-2">
            {look.tint && <ColorInput value={look.tint} label="Цвет группы" onChange={(c) => onPatch({ tint: c }, "look.tint")} />}
            <Switch id="look-tint" checked={!!look.tint} onCheckedChange={(v) => (v ? onPatch({ tint: "#F2542D" }) : onReset?.("tint"))} />
          </div>
        </div>
      )}
    </>
  )
}

/** «Вид» of the selection: look patches with inheritance; edits apply to every selected node. */
export function LookTab() {
  const scene = useStore((s) => s.scene)
  const library = useStore((s) => s.library)
  const ids = useStore(useShallow(selectedIds))
  const { updateLayers, setScene } = useStore.getState()
  const nodes = scene.layers.filter((l) => ids.includes(l.id))
  const primary = nodes.find((n) => n.id === ids[ids.length - 1])
  if (!primary) {
    return (
      <Section title="Вид сцены">
        <Hint>Базовый вид всех объектов. Сет, группа и сама буква могут переопределить любой параметр.</Hint>
        <LookEditor look={scene.look} onPatch={(p, key) => setScene((s) => ({ ...s, look: { ...s.look, ...p } }), key)} targetFor={(k) => "look." + k} />
      </Section>
    )
  }
  const sources = lookSources(scene, library, primary)
  const look = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.value])) as Look
  const host = mergeParent(scene.layers, primary.id)
  const patchAll = (p: LookPatch, key?: string) =>
    updateLayers(
      nodes.map((n) => ({ id: n.id, patch: { look: { ...n.look, ...p } } })),
      key ? key + ":" + ids.join(",") : undefined,
    )
  const reset = (k: LookKey) =>
    updateLayers(
      nodes.map((n) => {
        const next = { ...n.look }
        delete next[k]
        return { id: n.id, patch: { look: Object.keys(next).length ? next : undefined } }
      }),
    )
  return (
    <Section title={nodes.length > 1 ? `Вид · ${nodes.length} ${plural(nodes.length, "объект", "объекта", "объектов")}` : `Вид: ${nodeLabel(primary)}`}>
      {host && (
        <Hint>
          Объект внутри сплава «{nodeLabel(host)}»: форму и отрисовку задаёт сплав целиком, у буквы работают только цвет и
          перекраска.
        </Hint>
      )}
      <LookEditor
        look={look}
        sources={sources}
        onPatch={patchAll}
        onReset={reset}
        targetFor={nodes.length === 1 ? (k) => layerTarget(primary.id, "look." + k) : undefined}
        allowTint={primary.type === "group" || !!host}
      />
    </Section>
  )
}
