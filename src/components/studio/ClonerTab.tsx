import { ChevronDown, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { ColorInput } from "@/components/shared/ColorInput"
import { Section, Hint } from "@/components/shared/Section"
import { effectorNames, pickNames } from "@/components/shared/labels"
import { clonerParams, effectorParams, layerTarget, type ClonerNumKey, type EffectorNumKey } from "@/engine/params"
import { cloneCount } from "@/engine/cloner"
import {
  CLONE_LIMITS,
  childrenOf,
  defaultCloner,
  defaultEffector,
  inks,
  isGroup,
  uid,
  type Cloner,
  type ClonerKind,
  type ClonerPick,
  type ClonerSymmetry,
  type Effector,
  type EffectorKind,
  type GroupNode,
} from "@/engine/scene"
import { selectedIds, useStore } from "@/state/store"

const kinds: { value: ClonerKind; label: string }[] = [
  { value: "grid", label: "Сетка" },
  { value: "radial", label: "Круг" },
  { value: "linear", label: "Линия" },
  { value: "scatter", label: "Россыпь" },
]
const kindParams: Record<ClonerKind, ClonerNumKey[]> = {
  grid: ["cols", "rows", "dx", "dy"],
  radial: ["count", "radius", "rings", "ringStep"],
  linear: ["count", "dx", "dy", "stepRotation", "stepScale"],
  scatter: ["count", "width", "height", "seed"],
}
const pickItems = (Object.keys(pickNames) as ClonerPick[]).map((value) => ({ value, label: pickNames[value] }))
const symmetries: { value: ClonerSymmetry; label: string }[] = [
  { value: "none", label: "Нет" },
  { value: "mirror", label: "Зеркало" },
  { value: "rotate", label: "Поворот" },
]
const effectorHints: Record<EffectorKind, string> = {
  random: "Свой случайный сдвиг, поворот и масштаб у каждого клона.",
  noise: "Плавный шум по пространству и во времени: соседние клоны меняются похоже.",
  wave: "Волна бежит по раскладке: поворот, масштаб и цвет пульсируют.",
  field: "Действует вокруг курсора или центра клонера и затухает к радиусу.",
}
const effectorKeys: Record<EffectorKind, EffectorNumKey[]> = {
  random: ["amount", "position", "rotation", "scale", "opacity", "color", "seed"],
  noise: ["amount", "position", "rotation", "scale", "opacity", "color", "freq", "speed"],
  wave: ["amount", "position", "rotation", "scale", "opacity", "color", "freq", "speed"],
  field: ["amount", "position", "rotation", "scale", "opacity", "color", "radius"],
}

/** «Клонер» of a stack group: layout, distribution by zones, palette and effectors. */
export function ClonerTab() {
  const ids = useStore(useShallow(selectedIds))
  const group = useStore((s) => s.scene.layers.find((l) => l.id === ids[ids.length - 1]))
  const layers = useStore((s) => s.scene.layers)
  const { updateLayer, setScene } = useStore.getState()
  if (!isGroup(group) || group.mode !== "stack") return null
  const g: GroupNode = group
  const c = g.cloner
  const children = childrenOf(layers, g.id).slice(g.mask ? 1 : 0)
  const set = (p: Partial<Cloner>, key?: string) => updateLayer(g.id, { cloner: { ...(g.cloner ?? defaultCloner), ...p } }, key ? "cloner." + key + ":" + g.id : undefined)

  if (!c)
    return (
      <Section title="Клонер">
        <Hint>Клонер повторяет объекты группы сеткой, по кругу, по линии или россыпью. Объекты чередуются по зонам раскладки, эффекторы двигают, поворачивают и перекрашивают клоны.</Hint>
        <Button onClick={() => set({ ...defaultCloner })} disabled={!children.length}>
          <Plus data-icon="inline-start" />
          Сделать группу клонером
        </Button>
        {!children.length && <Hint>Сначала положите в группу хотя бы один объект.</Hint>}
      </Section>
    )

  const n = cloneCount(c)
  const offset = children.some((k) => k.x !== 0 || k.y !== 0)
  const setFx = (id: string, p: Partial<Effector>, key?: string) => set({ effectors: c.effectors.map((e) => (e.id === id ? { ...e, ...p } : e)) }, key ? "fx." + id + "." + key : undefined)
  const addFx = (kind: EffectorKind) => {
    const e: Effector = {
      ...defaultEffector,
      id: uid(),
      kind,
      seed: c.effectors.length + 1,
      ...(kind === "field" ? { position: 0.6, rotation: 0, scale: 0.4, radius: 6 } : {}),
      ...(kind === "wave" ? { position: 0, rotation: 0.25, scale: 0.3 } : {}),
      ...(kind === "random" ? { position: 0.2, rotation: 0.5, scale: 0 } : {}),
    }
    set({ effectors: [...c.effectors, e] })
  }

  return (
    <>
      <Section title="Клонер" action={<Switch checked={c.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Клонер включён" />}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Раскладка</span>
          <Badge variant={n > CLONE_LIMITS.perCloner ? "destructive" : "secondary"}>
            {Math.min(n, CLONE_LIMITS.maxPerCloner)} клонов
          </Badge>
        </div>
        <ToggleGroup variant="outline" size="sm" spacing={0} value={[c.kind]} onValueChange={(v) => v[0] && set({ kind: v[0] as ClonerKind })} className="w-full" aria-label="Раскладка">
          {kinds.map((k) => (
            <ToggleGroupItem key={k.value} value={k.value} className="flex-1 px-1">
              {k.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {kindParams[c.kind].map((k) => (
          <ParamSlider key={k} def={clonerParams[k]} value={c[k]} target={layerTarget(g.id, "cloner." + k)} onChange={(v) => set({ [k]: v }, k)} />
        ))}
        {c.kind === "radial" && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="cl-align" className="text-sm font-normal">
              Разворачивать от центра
            </Label>
            <Switch id="cl-align" checked={c.align} onCheckedChange={(v) => set({ align: v })} />
          </div>
        )}
        {n > CLONE_LIMITS.perCloner && (
          <Hint>
            Больше {CLONE_LIMITS.perCloner} клонов замедляют отрисовку
            {n > CLONE_LIMITS.maxPerCloner ? `; показаны первые ${CLONE_LIMITS.maxPerCloner}` : ""}.
          </Hint>
        )}
        {offset && (
          <div className="flex items-start justify-between gap-2">
            <Hint>Положение объектов внутри клонера добавляется к раскладке как сдвиг.</Hint>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScene((s) => ({ ...s, layers: s.layers.map((l) => (children.some((k) => k.id === l.id) ? { ...l, x: 0, y: 0 } : l)) }))}
            >
              <RotateCcw data-icon="inline-start" />
              Обнулить
            </Button>
          </div>
        )}
      </Section>

      <Section title="Чередование">
        <Hint>
          {children.length > 1
            ? `${children.length} объекта группы чередуются по зонам раскладки; палитра перекрашивает клоны по тем же зонам.`
            : "Зоны раскладки задают цвета палитры. Добавьте в группу ещё объекты — они будут чередоваться по тем же зонам."}
        </Hint>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Зоны</span>
          <Select items={pickItems} value={c.pick} onValueChange={(v) => v && set({ pick: v as ClonerPick })}>
            <SelectTrigger size="sm" className="w-40" aria-label="Зоны чередования">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pickItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {c.pick === "random" && c.kind !== "scatter" && (
          <ParamSlider def={clonerParams.seed} value={c.seed} target={layerTarget(g.id, "cloner.seed")} onChange={(v) => set({ seed: v }, "seed")} />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground/80">Симметрия по четвертям</span>
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[c.symmetry]} onValueChange={(v) => v[0] && set({ symmetry: v[0] as ClonerSymmetry })} className="w-full" aria-label="Симметрия">
            {symmetries.map((k) => (
              <ToggleGroupItem key={k.value} value={k.value} className="flex-1 px-1">
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Hint>Зеркало отражает клоны в левой и нижней половинах, поворот разворачивает каждую четверть на 90° — из плиток складываются розетки.</Hint>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-foreground/80">Палитра зон</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Добавить цвет"
              disabled={c.palette.length >= 8}
              onClick={() => set({ palette: [...c.palette, inks[c.palette.length % inks.length]] })}
            >
              <Plus />
            </Button>
          </div>
          {c.palette.length === 0 ? (
            <Hint>Без палитры клоны берут цвет своих объектов.</Hint>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {c.palette.map((col, i) => (
                <div key={i} className="flex items-center rounded-md border p-0.5">
                  <ColorInput value={col} label={"Цвет зоны " + (i + 1)} onChange={(v) => set({ palette: c.palette.map((x, j) => (j === i ? v : x)) }, "palette" + i)} />
                  <Button variant="ghost" size="icon-xs" aria-label={"Убрать цвет " + (i + 1)} onClick={() => set({ palette: c.palette.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section
        title={`Эффекторы · ${c.effectors.length}`}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Добавить эффектор" disabled={c.effectors.length >= 8} />}>
              <Plus />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(effectorNames) as EffectorKind[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => addFx(k)}>
                  {effectorNames[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        {c.effectors.length === 0 && <Hint>Эффекторы меняют клоны по правилу: случайно, шумом, волной или полем вокруг курсора. Каждый параметр можно связать с сигналом.</Hint>}
        {c.effectors.map((e) => (
          <Collapsible key={e.id} defaultOpen className="rounded-lg border">
            <div className="flex items-center gap-1 p-1.5">
              <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group/fx flex-1 justify-start" />}>
                <ChevronDown className="-rotate-90 transition-transform group-data-panel-open/fx:rotate-0" />
                {effectorNames[e.kind]}
              </CollapsibleTrigger>
              <Switch checked={e.enabled} onCheckedChange={(v) => setFx(e.id, { enabled: v })} aria-label={"Эффектор «" + effectorNames[e.kind] + "» включён"} />
              <Button variant="ghost" size="icon-xs" aria-label="Удалить эффектор" onClick={() => set({ effectors: c.effectors.filter((x) => x.id !== e.id) })}>
                <Trash2 />
              </Button>
            </div>
            <CollapsibleContent className="flex flex-col gap-3 border-t p-3">
              <Hint>{effectorHints[e.kind]}</Hint>
              {e.kind === "field" && (
                <ToggleGroup variant="outline" size="sm" spacing={0} value={[e.source]} onValueChange={(v) => v[0] && setFx(e.id, { source: v[0] as Effector["source"] })} className="w-full" aria-label="Источник поля">
                  <ToggleGroupItem value="pointer" className="flex-1">
                    Курсор
                  </ToggleGroupItem>
                  <ToggleGroupItem value="centre" className="flex-1">
                    Центр
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              {effectorKeys[e.kind].map((k) => (
                <ParamSlider key={k} def={effectorParams[k]} value={e[k]} target={layerTarget(g.id, `cloner.effectors.${e.id}.${k}`)} onChange={(v) => setFx(e.id, { [k]: v }, k)} />
              ))}
              {e.color > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground/80">Цвет перекраски</span>
                  <ColorInput value={e.tint} label="Цвет перекраски" showValue onChange={(v) => setFx(e.id, { tint: v }, "tint")} />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </Section>
    </>
  )
}
