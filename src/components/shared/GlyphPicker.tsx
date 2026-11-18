import { useState } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cyrillicOrder, latinOrder } from "@/engine/alphabet"
import { GlyphThumb } from "./Thumbs"
import { cn } from "@/lib/utils"

/** Grid of glyphs from the current alphabet, split by script. */
export function GlyphPicker({
  value,
  onPick,
}: {
  value?: string
  onPick: (c: string) => void
}) {
  const [script, setScript] = useState(value && cyrillicOrder.includes(value) ? "cyr" : "lat")
  const chars = script === "lat" ? latinOrder : cyrillicOrder
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[script]}
        onValueChange={(v) => v[0] && setScript(v[0])}
        aria-label="Письменность"
      >
        <ToggleGroupItem value="lat">Латиница</ToggleGroupItem>
        <ToggleGroupItem value="cyr">Кириллица</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid grid-cols-7 gap-1">
        {[...chars].map((c) => (
          <button
            key={c}
            type="button"
            aria-label={"Буква " + c}
            aria-pressed={c === value}
            onClick={() => onPick(c)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-md border border-transparent p-1 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              c === value && "border-primary bg-muted",
            )}
          >
            <GlyphThumb char={c} className="pointer-events-none" />
          </button>
        ))}
      </div>
    </div>
  )
}
