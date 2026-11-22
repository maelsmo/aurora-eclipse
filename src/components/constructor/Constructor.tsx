import { useEffect, useState } from "react"
import {
  Circle,
  CircleDashed,
  Grid2x2,
  LayoutGrid,
  MousePointer2,
  Redo2,
  Spline,
  Minus,
  Undo2,
  CircleDot,
  Ellipse,
  RectangleHorizontal,
  Square,
  SquareRoundCorner,
  Triangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { charset } from "@/engine/alphabet"
import { editingAlphabet, useStore } from "@/state/store"
import { GlyphList } from "./GlyphList"
import { GlyphEditor } from "./GlyphEditor"
import { GlyphPanel } from "./GlyphPanel"
import type { Tool } from "./editing"
import { shortcutKey } from "@/lib/keys"

const tools: { value: Tool; label: string; hint: string; Icon: typeof Circle }[] = [
  { value: "select", label: "Выбор", hint: "Выбрать и двигать модули (V)", Icon: MousePointer2 },
  { value: "stroke", label: "Штрих", hint: "Протяните от узла к узлу (S)", Icon: Minus },
  { value: "arc", label: "Дуга", hint: "Нажмите в центре и протяните радиус (A)", Icon: Spline },
  { value: "dot", label: "Спутник", hint: "Отдельный диск (D)", Icon: Circle },
  { value: "hole", label: "Зрачок", hint: "Круглый просвет (H)", Icon: CircleDashed },
  { value: "slot", label: "Прорезь", hint: "Вычитаемая капсула (L)", Icon: RectangleHorizontal },
  { value: "box", label: "Клетка", hint: "Прямоугольник: протяните по сетке (B)", Icon: Square },
  { value: "quarter", label: "Четверть", hint: "Четверть круга: угол в конце протяжки скругляется (Q)", Icon: SquareRoundCorner },
  { value: "ellipse", label: "Эллипс", hint: "Эллипс в протянутой рамке (E)", Icon: Ellipse },
  { value: "poly", label: "Клин", hint: "Прямоугольный треугольник с прямым углом в начале (T)", Icon: Triangle },
]
const keys: Record<string, Tool> = { v: "select", s: "stroke", a: "arc", d: "dot", h: "hole", l: "slot", b: "box", q: "quarter", e: "ellipse", t: "poly" }

function Specimen({ onOpen }: { onOpen: (c: string) => void }) {
  const alphabet = useStore(editingAlphabet)
  const set = useStore((s) => s.editingSet)
  const chars = [...charset, ...Object.keys(alphabet).filter((c) => !charset.includes(c))]
  return (
    <ScrollArea className="min-h-0 flex-1 rounded-xl border bg-background">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2 p-4">
        {chars.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onOpen(c)}
            className="flex aspect-[4/5] flex-col items-center gap-1 rounded-lg p-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={"Открыть " + c}
          >
            <GlyphThumb char={c} set={set} className="pointer-events-none flex-1" />
            <span className="text-xs text-muted-foreground">{c}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

export function Constructor() {
  const editing = useStore((s) => s.editing)
  const canUndo = useStore((s) => s.glyphPast.length > 0)
  const canRedo = useStore((s) => s.glyphFuture.length > 0)
  const { glyphUndo, glyphRedo } = useStore.getState()
  const [tool, setTool] = useState<Tool>("select")
  const [fine, setFine] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [specimen, setSpecimen] = useState(false)

  useEffect(() => setSelected(null), [editing])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, [contenteditable]")) return
      const t = keys[shortcutKey(e)]
      if (t) setTool(t)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="order-2 flex h-72 lg:order-1 lg:h-auto">
        <GlyphList />
      </div>
      <div className="order-1 flex min-h-[60dvh] min-w-0 flex-1 flex-col gap-2 lg:order-2 lg:min-h-0">
        {/* Labels show only when the toolbar itself is wide enough for all of them (container query). */}
        <div className="@container flex flex-wrap items-center gap-2 rounded-xl border bg-card p-1.5">
          <ToggleGroup
            spacing={1}
            size="sm"
            value={[tool]}
            onValueChange={(v) => v[0] && setTool(v[0] as Tool)}
            aria-label="Инструмент"
            disabled={specimen}
            className="flex-wrap"
          >
            {tools.map(({ value, label, hint, Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger render={<ToggleGroupItem value={value} aria-label={label} />}>
                  <Icon />
                  <span className="hidden @[72rem]:inline">{label}</span>
                </TooltipTrigger>
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          <Separator orientation="vertical" className="h-5" />
          <Tooltip>
            <TooltipTrigger render={<Toggle size="sm" pressed={fine} onPressedChange={setFine} aria-label="Подсетка 0,25" disabled={specimen} />}>
              <Grid2x2 />
            </TooltipTrigger>
            <TooltipContent>Подсетка 0,25 модуля</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Отменить" disabled={!canUndo} onClick={glyphUndo} />}>
              <Undo2 />
            </TooltipTrigger>
            <TooltipContent>Отменить (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Повторить" disabled={!canRedo} onClick={glyphRedo} />}>
              <Redo2 />
            </TooltipTrigger>
            <TooltipContent>Повторить (⇧⌘Z)</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-2">
            <Toggle size="sm" variant="outline" pressed={specimen} onPressedChange={setSpecimen} aria-label="Весь алфавит">
              <LayoutGrid />
              Весь алфавит
            </Toggle>
          </div>
        </div>
        {specimen ? (
          <Specimen
            onOpen={(c) => {
              useStore.getState().setEditing(c)
              setSpecimen(false)
            }}
          />
        ) : (
          <>
            <GlyphEditor tool={tool} fine={fine} selected={selected} onSelect={setSelected} />
            <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <CircleDot className="size-3" />
              Конструкция редактируется на сетке без деформаций осей. Толщина, ширина и наклон применяются в студии ко всем знакам
              одинаково.
            </p>
          </>
        )}
      </div>
      <div className="order-3 flex h-[32rem] lg:h-auto">
        <GlyphPanel selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}
