import { ScrollArea } from "@/components/ui/scroll-area"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { cyrillicOrder, latinOrder, sharedWith } from "@/engine/alphabet"
import { useStore } from "@/state/store"
import { cn } from "@/lib/utils"

const EMPTY = {}

export function GlyphList() {
  const editing = useStore((s) => s.editing)
  const alphabet = useStore((s) => s.alphabet)
  const overrides = useStore((s) => s.versions.find((v) => v.id === s.alphabetId)?.glyphs ?? EMPTY)
  const setEditing = useStore((s) => s.setEditing)

  const group = (title: string, chars: string) => (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="grid grid-cols-4 gap-1">
        {[...chars].map((c) => {
          const shared = sharedWith(c, alphabet)
          const changed = c in overrides || (!!shared && shared in overrides)
          const active = c === editing
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              aria-label={`${c}${shared ? ", общая конструкция с " + shared : ""}${changed ? ", изменена" : ""}`}
              onClick={() => setEditing(c)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg border border-transparent p-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "border-primary bg-muted",
              )}
            >
              <GlyphThumb char={c} className="pointer-events-none" />
              <span className="absolute bottom-0.5 left-1 text-[10px] text-muted-foreground">{c}</span>
              {shared && <span className="absolute top-0.5 right-1 text-[10px] text-muted-foreground">={shared}</span>}
              {changed && <span aria-hidden className="absolute top-1 left-1 size-1.5 rounded-full bg-primary" />}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <aside aria-label="Знаки" className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-60 lg:shrink-0">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {group("Латиница", latinOrder)}
          {group("Кириллица", cyrillicOrder)}
        </div>
      </ScrollArea>
    </aside>
  )
}
