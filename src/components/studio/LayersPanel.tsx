import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Combine,
  Copy,
  Eye,
  EyeOff,
  Folder,
  Plus,
  Shapes,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { GlyphPicker } from "@/components/shared/GlyphPicker"
import { GlyphThumb } from "@/components/shared/Thumbs"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { opIcons } from "@/components/shared/icons"
import { nodeLabel, shapeNames } from "@/components/shared/labels"
import { ShapeIcon } from "@/components/shared/ShapeIcon"
import { opInfo, ops, type Op } from "@/engine/operators"
import {
  ancestors,
  childrenOf,
  deleteNodes,
  duplicateNodes,
  groupNodes,
  inks,
  isGroup,
  layoutText,
  LIMITS,
  makeLayer,
  makeShape,
  mergeParent,
  shapeKinds,
  type ShapeKind,
  moveNode,
  shiftNode,
  ungroup,
  type Layer,
  type Scene,
} from "@/engine/scene"
import { sceneParams } from "@/engine/params"
import { sceneAlphabet, selectedIds, useStore } from "@/state/store"
import { cn } from "@/lib/utils"
import { useShallow } from "zustand/react/shallow"

const opItems = ops.map((o) => ({ value: o, label: opInfo[o].name }))

/** Where a new object goes: inside the selected group, or next to the selected object. */
function insertionPoint(scene: Scene, selected: string[]): { parent?: string; index: number } {
  const sel = scene.layers.find((l) => l.id === selected[selected.length - 1])
  if (!sel) return { index: childrenOf(scene.layers, undefined).length }
  if (isGroup(sel)) return { parent: sel.id, index: childrenOf(scene.layers, sel.id).length }
  const sibs = childrenOf(scene.layers, sel.parent)
  return { parent: sel.parent, index: sibs.findIndex((s) => s.id === sel.id) + 1 }
}

export function LayersPanel() {
  const scene = useStore((s) => s.scene)
  const selected = useStore(useShallow(selectedIds))
  const alphabet = useStore(sceneAlphabet)
  const library = useStore((s) => s.library)
  const { setScene, select, updateLayer } = useStore.getState()
  const [text, setText] = useState("")
  const [op, setOp] = useState<Op>("fuse")
  const [adding, setAdding] = useState(false)
  const [pickSet, setPickSet] = useState<string | null>(null)
  const [typeSet, setTypeSet] = useState<string | null>(null)
  const sets = useStore((s) => s.sets)
  const textSet = typeSet && library.sets[typeSet] ? typeSet : scene.set

  function typeText(e: React.FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    const entry = library.sets[textSet]
    const textAlphabet = entry?.alphabet ?? alphabet
    const missing = [...new Set([...value.toLocaleUpperCase("ru")].filter((c) => c !== " " && c !== "\n" && !(c in textAlphabet)))]
    const color = scene.layers.find((l) => l.type === "letter")?.color ?? inks[0]
    const letters = layoutText(value, textAlphabet, scene.axes, scene.tracking, { op, color, ...(textSet !== scene.set ? { set: textSet } : {}) }, entry?.version ?? 0)
    if (!letters.length) {
      toast.error("В сете нет этих знаков.")
      return
    }
    if (scene.layers.length + letters.length + 1 > LIMITS.nodes) {
      toast.error(`В сцене не больше ${LIMITS.nodes} объектов.`)
      return
    }
    // The text becomes a new merge group on top: the first letter is its base.
    setScene((s) => {
      const withLetters = { ...s, layers: [...s.layers, ...letters.map((l, i) => (i === 0 ? { ...l, op: "union" as Op } : l))] }
      return groupNodes(withLetters, letters.map((l) => l.id), "merge", { name: value.slice(0, 24) }).scene
    })
    select(null)
    setText("")
    if (missing.length) toast("Пропущены знаки вне сета: " + missing.join(" "))
  }

  function addLetter(c: string, set = pickSet ?? scene.set) {
    const { parent, index } = insertionPoint(scene, selected)
    const sibs = childrenOf(scene.layers, parent)
    const ref = sibs[Math.max(0, index - 1)]
    const inMerge = parent ? scene.layers.find((l) => l.id === parent && isGroup(l) && l.mode === "merge") : undefined
    const layer = makeLayer(c, {
      x: ref ? ref.x + 3 : 0,
      y: ref?.y ?? 0,
      op: inMerge && sibs.length ? "fuse" : "union",
      color: ref?.color ?? inks[0],
      ...(set !== scene.set ? { set } : {}),
    })
    setScene((s) => moveNode({ ...s, layers: [...s.layers, layer] }, layer.id, parent, index))
    select(layer.id)
    setAdding(false)
  }

  function addShape(kind: ShapeKind) {
    const { parent, index } = insertionPoint(scene, selected)
    const sibs = childrenOf(scene.layers, parent)
    const ref = sibs[Math.max(0, index - 1)]
    const dims: Record<ShapeKind, [number, number]> = { rect: [4, 4], ellipse: [4, 4], polygon: [4, 4], star: [4, 4], line: [6, 0.5] }
    const shape = makeShape(
      { kind, w: dims[kind][0], h: dims[kind][1], sides: kind === "star" ? 5 : 6 },
      { x: ref ? ref.x + 3 : 0, y: ref?.y ?? 2.5, color: ref?.color ?? inks[1] },
    )
    setScene((s) => moveNode({ ...s, layers: [...s.layers, shape] }, shape.id, parent, index))
    select(shape.id)
  }

  function group(mode: "stack" | "merge") {
    const ids = selected.filter((id) => {
      const n = scene.layers.find((l) => l.id === id)
      return n && (mode === "stack" || !isGroup(n))
    })
    if (!ids.length) return
    const { scene: next, id } = groupNodes(scene, ids, mode)
    setScene(next)
    if (id) select(id)
  }

  const rows: { node: Layer; depth: number }[] = []
  const hidden = new Set<string>()
  // Top of the list = top of the z-order: walk siblings in reverse, children right after their group.
  const walk = (parent: string | undefined, depth: number) => {
    const kids = childrenOf(scene.layers, parent)
    for (let i = kids.length - 1; i >= 0; i--) {
      const n = kids[i]
      rows.push({ node: n, depth })
      if (isGroup(n) && !n.collapsed) walk(n.id, depth + 1)
      else if (isGroup(n)) hidden.add(n.id)
    }
  }
  walk(undefined, 0)

  const primary = scene.layers.find((l) => l.id === selected[selected.length - 1])
  const canMerge = selected.some((id) => !isGroup(scene.layers.find((l) => l.id === id)))

  return (
    <aside className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-64 lg:shrink-0" aria-label="Слои">
      <form onSubmit={typeText} className="flex flex-col gap-2 border-b p-3">
        <label htmlFor="type-text" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Набрать
        </label>
        <div className="flex gap-1.5">
          <Input id="type-text" value={text} maxLength={40} placeholder="Слово или фраза" onChange={(e) => setText(e.target.value)} />
          <Tooltip>
            <TooltipTrigger render={<Button type="submit" size="icon" aria-label="Набрать сплавом" disabled={!text.trim()} />}>
              <Type />
            </TooltipTrigger>
            <TooltipContent>Добавить текст новым сплавом</TooltipContent>
          </Tooltip>
        </div>
        <Select items={sets.map((s) => ({ value: s.id, label: s.name }))} value={textSet} onValueChange={(v) => v && setTypeSet(v)}>
          <SelectTrigger size="sm" className="w-full" aria-label="Сет для текста">
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
        <ParamSlider def={sceneParams.tracking} value={scene.tracking} onChange={(v) => setScene((s) => ({ ...s, tracking: v }), "tracking")} />
      </form>

      <div className="flex items-center justify-between gap-1 px-3 pt-3 pb-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Слои <span className="tabular-nums">· {scene.layers.length}</span>
        </h2>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Сгруппировать" disabled={!selected.length} onClick={() => group("stack")} />}>
              <Folder />
            </TooltipTrigger>
            <TooltipContent>Группа: объекты рисуются независимо</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Объединить в сплав" disabled={!canMerge} onClick={() => group("merge")} />}>
              <Combine />
            </TooltipTrigger>
            <TooltipContent>Сплав: буквы сливаются операторами</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Разгруппировать"
                  disabled={!isGroup(primary)}
                  onClick={() => primary && setScene((s) => ungroup(s, primary.id))}
                />
              }
            >
              <Ungroup />
            </TooltipTrigger>
            <TooltipContent>Разгруппировать</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Добавить фигуру" disabled={scene.layers.length >= LIMITS.nodes} />} />}>
                <Shapes />
              </TooltipTrigger>
              <TooltipContent>Фигура</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {shapeKinds.map((k) => (
                <DropdownMenuItem key={k} onClick={() => addShape(k)}>
                  <ShapeIcon kind={k} />
                  {shapeNames[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={adding} onOpenChange={setAdding}>
            <PopoverTrigger render={<Button variant="outline" size="sm" disabled={scene.layers.length >= LIMITS.nodes} />}>
              <Plus data-icon="inline-start" />
              Буква
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <GlyphPicker set={pickSet ?? scene.set} onSet={setPickSet} onPick={(c) => addLetter(c)} />
            </PopoverContent>
          </Popover>
        </div>
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
          <ul className="flex flex-col gap-0.5 p-2" role="tree" aria-multiselectable>
            {rows.map(({ node: l, depth }) => {
              const sibs = childrenOf(scene.layers, l.parent)
              const k = sibs.findIndex((s) => s.id === l.id)
              const host = mergeParent(scene.layers, l.id)
              const base = !!host && k === 0
              const Icon = opIcons[l.op]
              const active = selected.includes(l.id)
              const dim = !l.visible || ancestors(scene.layers, l.id).some((g) => !g.visible)
              return (
                <li key={l.id} role="treeitem" aria-selected={active} aria-level={depth + 1}>
                  <div
                    className={cn(
                      "group flex items-center gap-1.5 rounded-lg py-1 pr-1.5 transition-colors hover:bg-muted",
                      active && "bg-muted ring-1 ring-primary/40",
                      dim && "opacity-55",
                    )}
                    style={{ paddingLeft: 6 + depth * 14 }}
                  >
                    {isGroup(l) ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={l.collapsed ? "Развернуть" : "Свернуть"}
                        onClick={() => updateLayer(l.id, { collapsed: !l.collapsed })}
                      >
                        {l.collapsed ? <ChevronRight /> : <ChevronDown />}
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-pressed={active}
                      aria-label={`${nodeLabel(l)}${host ? ", " + (base ? "основа" : opInfo[l.op].name) : ""}`}
                      onClick={(e) => select(l.id, e.shiftKey || e.metaKey || e.ctrlKey ? "toggle" : "replace")}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background p-0.5">
                        {l.type === "letter" ? (
                          <GlyphThumb char={l.char} set={l.set} color={l.color} axes={l.axes ? { ...scene.axes, ...l.axes } : undefined} />
                        ) : l.type === "shape" ? (
                          <ShapeIcon kind={l.shape.kind} className="size-4" style={{ color: l.color }} />
                        ) : l.type === "group" ? (
                          l.mode === "merge" ? <Combine className="size-4 text-muted-foreground" /> : <Folder className="size-4 text-muted-foreground" />
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm leading-tight font-medium">{nodeLabel(l)}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {host && !base && <Icon className="size-3" />}
                          {isGroup(l)
                            ? `${childrenOf(scene.layers, l.id).length} · ${l.mode === "merge" ? "сплав" : "группа"}`
                            : host
                              ? base
                                ? "Основа"
                                : opInfo[l.op].name
                              : "Объект"}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center opacity-70 group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button variant="ghost" size="icon-xs" aria-label="Выше" disabled={k === sibs.length - 1} onClick={() => setScene((s) => shiftNode(s, l.id, 1))}>
                        <ChevronUp />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Ниже" disabled={k === 0} onClick={() => setScene((s) => shiftNode(s, l.id, -1))}>
                        <ChevronDown />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={l.visible ? "Скрыть" : "Показать"} onClick={() => updateLayer(l.id, { visible: !l.visible })}>
                        {l.visible ? <Eye /> : <EyeOff />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Дублировать"
                        disabled={scene.layers.length >= LIMITS.nodes}
                        onClick={() => {
                          const res = duplicateNodes(scene, [l.id])
                          setScene(res.scene)
                          select(res.ids[0] ?? null)
                        }}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Удалить слой"
                        onClick={() => {
                          setScene((s) => deleteNodes(s, [l.id]))
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
