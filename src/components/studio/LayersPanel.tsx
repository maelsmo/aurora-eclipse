import { useState } from "react"
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Plus, Trash2, Type } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { GlyphPicker } from "@/components/shared/GlyphPicker"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { opIcons } from "@/components/shared/icons"
import { opInfo, ops, type Op } from "@/engine/operators"
import { layoutText, makeLayer, uid, inks } from "@/engine/scene"
import { sceneParams } from "@/engine/params"
import { useStore } from "@/state/store"
import { cn } from "@/lib/utils"

const opItems = ops.map((o) => ({ value: o, label: opInfo[o].name }))

export function LayersPanel() {
  const scene = useStore((s) => s.scene)
  const selected = useStore((s) => s.selected)
  const alphabet = useStore((s) => s.alphabet)
  const revision = useStore((s) => s.revision)
  const { setScene, select, updateLayer } = useStore.getState()
  const [text, setText] = useState("")
  const [op, setOp] = useState<Op>("fuse")
  const [adding, setAdding] = useState(false)

  function typeText(e: React.FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    const missing = [...new Set([...value.toLocaleUpperCase("ru")].filter((c) => c !== " " && c !== "\n" && !(c in alphabet)))]
    const color = scene.layers[0]?.color ?? inks[0]
    const layers = layoutText(value, alphabet, scene.axes, scene.tracking, { op, color }, revision)
    if (!layers.length) {
      toast.error("В алфавите нет этих знаков. Доступны прописные латиница и кириллица.")
      return
    }
    setScene((s) => ({ ...s, layers, routes: s.routes.filter((r) => !r.target.startsWith("layer:")) }))
    select(null)
    if (missing.length) toast("Пропущены знаки вне алфавита: " + missing.join(" "))
  }

  function addLetter(c: string) {
    const top = scene.layers.at(-1)
    const layer = makeLayer(c, {
      x: top ? top.x + 3 : 0,
      y: top?.y ?? 0,
      op: scene.layers.length ? "fuse" : "union",
      color: top?.color ?? inks[0],
    })
    setScene((s) => ({ ...s, layers: [...s.layers, layer] }))
    select(layer.id)
    setAdding(false)
  }

  function move(id: string, dir: 1 | -1) {
    setScene((s) => {
      const i = s.layers.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= s.layers.length) return s
      const layers = [...s.layers]
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
      return { ...s, layers }
    })
  }

  const rows = [...scene.layers].reverse()

  return (
    <aside className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-64 lg:shrink-0" aria-label="Слои">
      <form onSubmit={typeText} className="flex flex-col gap-2 border-b p-3">
        <label htmlFor="type-text" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Набрать
        </label>
        <div className="flex gap-1.5">
          <Input
            id="type-text"
            value={text}
            maxLength={40}
            placeholder="Слово или фраза"
            onChange={(e) => setText(e.target.value)}
          />
          <Tooltip>
            <TooltipTrigger render={<Button type="submit" size="icon" aria-label="Набрать слоями" disabled={!text.trim()} />}>
              <Type />
            </TooltipTrigger>
            <TooltipContent>Разложить текст на слои</TooltipContent>
          </Tooltip>
        </div>
        <Select items={opItems} value={op} onValueChange={(v) => v && setOp(v as Op)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Оператор между буквами">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ops.map((o) => {
              const I = opIcons[o]
              return (
                <SelectItem key={o} value={o}>
                  <I />
                  {opInfo[o].name}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        <ParamSlider
          def={sceneParams.tracking}
          value={scene.tracking}
          onChange={(v) => setScene((s) => ({ ...s, tracking: v }), "tracking")}
        />
      </form>

      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Слои <span className="tabular-nums">· {scene.layers.length}</span>
        </h2>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger render={<Button variant="outline" size="sm" disabled={scene.layers.length >= 32} />}>
            <Plus data-icon="inline-start" />
            Буква
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <GlyphPicker onPick={addLetter} />
          </PopoverContent>
        </Popover>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Empty className="p-6">
            <EmptyHeader>
              <EmptyTitle>Слоёв пока нет</EmptyTitle>
              <EmptyDescription>Наберите слово или добавьте букву.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-0.5 p-2">
            {rows.map((l) => {
              const index = scene.layers.indexOf(l)
              const base = index === 0
              const Icon = opIcons[l.op]
              const active = l.id === selected
              return (
                <li key={l.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted",
                      active && "bg-muted ring-1 ring-primary/40",
                      !l.visible && "opacity-55",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-pressed={active}
                      aria-label={`Слой ${l.char}, ${base ? "основа" : opInfo[l.op].name}`}
                      onClick={() => select(active ? null : l.id)}
                    >
                      <span className="size-8 shrink-0 rounded-md border bg-background p-0.5">
                        <GlyphThumb char={l.char} color={l.color} axes={l.axes ? { ...scene.axes, ...l.axes } : undefined} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm leading-tight font-medium">{l.char}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {!base && <Icon className="size-3" />}
                          {base ? "Основа" : opInfo[l.op].name}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center opacity-70 group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button variant="ghost" size="icon-xs" aria-label="Выше" disabled={index === scene.layers.length - 1} onClick={() => move(l.id, 1)}>
                        <ChevronUp />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Ниже" disabled={index === 0} onClick={() => move(l.id, -1)}>
                        <ChevronDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={l.visible ? "Скрыть" : "Показать"}
                        onClick={() => updateLayer(l.id, { visible: !l.visible })}
                      >
                        {l.visible ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Дублировать"
                        disabled={scene.layers.length >= 32}
                        onClick={() => {
                          const copy = { ...l, id: uid(), x: l.x + 1, y: l.y - 1 }
                          setScene((s) => {
                            const layers = [...s.layers]
                            layers.splice(index + 1, 0, copy)
                            return { ...s, layers }
                          })
                          select(copy.id)
                        }}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Удалить слой"
                        onClick={() => {
                          setScene((s) => ({
                            ...s,
                            layers: s.layers.filter((x) => x.id !== l.id),
                            routes: s.routes.filter((r) => !r.target.startsWith("layer:" + l.id)),
                          }))
                          if (active) select(null)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}
