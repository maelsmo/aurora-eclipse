import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { charset, cyrillicOrder, latinOrder, sharedWith } from "@/engine/alphabet"
import { editingAlphabet, editingSetOf, useStore } from "@/state/store"
import { cn } from "@/lib/utils"

const EMPTY = {}

export function GlyphList() {
  const editing = useStore((s) => s.editing)
  const alphabet = useStore(editingAlphabet)
  const set = useStore(editingSetOf)
  const overrides = useStore((s) => s.sets.find((v) => v.id === s.editingSet)?.glyphs ?? EMPTY)
  const setEditing = useStore((s) => s.setEditing)
  const [adding, setAdding] = useState(false)
  const [char, setChar] = useState("")
  const extra = Object.keys(alphabet).filter((c) => !charset.includes(c)).join("")

  function addGlyph(e: React.FormEvent) {
    e.preventDefault()
    const c = [...char.trim()][0]
    if (!c) return
    if (c in alphabet) {
      setEditing(c)
      setAdding(false)
      return
    }
    useStore.getState().setGlyph(c, { adv: set.kind === "shapes" ? 5 : 4, prims: [] })
    setEditing(c)
    setAdding(false)
    setChar("")
    toast.success(`Знак «${c}» добавлен в сет «${set.name}». Соберите его инструментами сверху.`)
  }

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
              <GlyphThumb char={c} set={set.id} className="pointer-events-none" />
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
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium">{set.name}</span>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>
            <Plus data-icon="inline-start" />
            Знак
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <form onSubmit={addGlyph} className="flex flex-col gap-2">
              <label htmlFor="new-glyph" className="text-sm">
                Новый знак сета: цифра, символ, плитка паттерна
              </label>
              <div className="flex gap-1.5">
                <Input id="new-glyph" autoFocus maxLength={2} value={char} onChange={(e) => setChar(e.target.value)} placeholder="Например, 7 или ◇" />
                <Button type="submit" disabled={!char.trim()}>
                  Добавить
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {group("Латиница", latinOrder.split("").filter((c) => c in alphabet).join(""))}
          {group("Кириллица", cyrillicOrder.split("").filter((c) => c in alphabet).join(""))}
          {extra && group("Знаки и плитки", extra)}
        </div>
      </ScrollArea>
    </aside>
  )
}
