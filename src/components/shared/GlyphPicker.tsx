import { useState } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { charset, cyrillicOrder, latinOrder } from "@/engine/alphabet"
import { useStore } from "@/state/store"
import { GlyphThumb } from "./Thumbs"
import { cn } from "@/lib/utils"

/**
 * Grid of glyphs of a set, split by script; extra signs of the set (pattern
 * tiles, added glyphs) get their own tab. With `onSet` the set can be switched.
 */
export function GlyphPicker({
  value,
  set,
  onPick,
  onSet,
}: {
  value?: string
  /** Glyph set shown; defaults to the scene set. */
  set?: string
  onPick: (c: string) => void
  /** Lets the picker switch the set (the new set id comes back here). */
  onSet?: (id: string) => void
}) {
  const sceneSet = useStore((s) => s.scene.set)
  const sets = useStore((s) => s.sets)
  const library = useStore((s) => s.library)
  const id = set ?? sceneSet
  const alphabet = library.sets[id]?.alphabet ?? {}
  const extra = Object.keys(alphabet).filter((c) => !charset.includes(c)).join("")
  const [script, setScript] = useState(value && cyrillicOrder.includes(value) ? "cyr" : value && extra.includes(value) ? "extra" : "lat")
  const chars = (script === "lat" ? latinOrder : script === "cyr" ? cyrillicOrder : extra).split("").filter((c) => c in alphabet)
  return (
    <div className="flex flex-col gap-3">
      {onSet && (
        <Select items={sets.map((s) => ({ value: s.id, label: s.name }))} value={id} onValueChange={(v) => v && onSet(v)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Сет">
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
      )}
      <ToggleGroup variant="outline" size="sm" spacing={0} value={[script]} onValueChange={(v) => v[0] && setScript(v[0])} aria-label="Письменность">
        <ToggleGroupItem value="lat">Латиница</ToggleGroupItem>
        <ToggleGroupItem value="cyr">Кириллица</ToggleGroupItem>
        {extra && <ToggleGroupItem value="extra">Знаки и плитки</ToggleGroupItem>}
      </ToggleGroup>
      <div className="grid grid-cols-7 gap-1">
        {chars.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={"Знак " + c}
            aria-pressed={c === value}
            onClick={() => onPick(c)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-md border border-transparent p-1 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              c === value && "border-primary bg-muted",
            )}
          >
            <GlyphThumb char={c} set={id} className="pointer-events-none" />
          </button>
        ))}
      </div>
    </div>
  )
}
