import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { Section, Hint } from "@/components/shared/Section"
import { lookParams } from "@/engine/params"
import type { LookMode, LookPatch } from "@/engine/scene"
import type { SetBase, SetKind } from "@/engine/alphabet/sets"
import { editingSetOf, useStore } from "@/state/store"

const bases: { base: SetBase; kind: SetKind; name: string; hint: string }[] = [
  { base: "geo", kind: "shapes", name: "Геометрический", hint: "Основа — сет «Геометрия»: клетки, четверти, прорези" },
  { base: "default", kind: "strokes", name: "Штриховой", hint: "Основа — штриховой алфавит с осями" },
  { base: "empty", kind: "shapes", name: "Пустой", hint: "Знаки рисуются с нуля" },
]

/** Creates a set from one of the bases. */
export function NewSetMenu() {
  const addSet = useStore((s) => s.addSet)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        <Plus data-icon="inline-start" />
        Новый сет
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {bases.map((b) => (
          <DropdownMenuItem key={b.base} onClick={() => addSet(b.name + " сет", { base: b.base, kind: b.kind })}>
            <div className="flex flex-col">
              <span>{b.name}</span>
              <span className="text-xs text-muted-foreground">{b.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const modes: { value: LookMode | "scene"; label: string }[] = [
  { value: "scene", label: "Как в сцене" },
  { value: "fill", label: "Заливка" },
  { value: "lines", label: "Линии" },
  { value: "outline", label: "Контур" },
]

/** The look every letter of the set inherits (letters and groups can override it). */
export function SetLookSection() {
  const set = useStore(editingSetOf)
  const setSetLook = useStore((s) => s.setSetLook)
  const look = set.look ?? {}
  const patch = (p: LookPatch) => {
    const next: LookPatch = { ...look, ...p }
    for (const k of Object.keys(next) as (keyof LookPatch)[]) if (next[k] === undefined) delete next[k]
    setSetLook(set.id, Object.keys(next).length ? next : undefined)
  }
  return (
    <Section title={`Вид сета «${set.name}»`}>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[look.mode ?? "scene"]}
        onValueChange={(v) => v[0] && patch({ mode: v[0] === "scene" ? undefined : (v[0] as LookMode) })}
        aria-label="Отрисовка букв сета"
        className="w-full"
      >
        {modes.map((m) => (
          <ToggleGroupItem key={m.value} value={m.value} className="flex-1">
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ParamSlider def={lookParams.stripes} value={look.stripes ?? 4} onChange={(v) => patch({ stripes: v })} />
      <ParamSlider def={lookParams.stripeFill} value={look.stripeFill ?? 0.5} onChange={(v) => patch({ stripeFill: v })} />
      <ParamSlider def={lookParams.inset} value={look.inset ?? 0} onChange={(v) => patch({ inset: v || undefined })} />
      <Hint>Буквы сета наследуют этот вид; группа или сама буква в студии могут его переопределить.</Hint>
    </Section>
  )
}
