import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Combine,
  Copy,
  Eye,
  EyeOff,
  Folder,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
  groupNodes,
  inks,
  isGroup,
  layoutText,
  LIMITS,
  makeGroup,
  makeLayer,
  makeShape,
  moveNode,
  shapeKinds,
  type Layer,
  type Scene,
  type ShapeKind,
} from "@/engine/scene"
import { sceneParams } from "@/engine/params"
import { sceneAlphabet, selectedIds, useStore } from "@/state/store"
import { cn } from "@/lib/utils"
import {
  arrange,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  moveTo,
  nodeRole,
  selectChildren,
  toggleFlag,
  ungroupSelection,
  type DropTarget,
} from "./actions"

const opItems = ops.map((o) => ({ value: o, label: opInfo[o].name }))
export const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"

/** Where a new object goes: inside the selected group, or right above the selected object. */
export function insertionPoint(scene: Scene, selected: string[]): { parent?: string; index: number } {
  const sel = scene.layers.find((l) => l.id === selected[selected.length - 1])
  if (!sel) return { index: childrenOf(scene.layers, undefined).length }
  if (isGroup(sel)) return { parent: sel.id, index: childrenOf(scene.layers, sel.id).length }
  const sibs = childrenOf(scene.layers, sel.parent)
  return { parent: sel.parent, index: sibs.findIndex((s) => s.id === sel.id) + 1 }
}

/** Visible rows of the tree, top of the list = top of the z-order. */
function useRows(scene: Scene) {
  return useMemo(() => {
    const rows: { node: Layer; depth: number }[] = []
    const walk = (parent: string | undefined, depth: number) => {
      const kids = childrenOf(scene.layers, parent)
      for (let i = kids.length - 1; i >= 0; i--) {
        const n = kids[i]
        rows.push({ node: n, depth })
        if (isGroup(n) && !n.collapsed) walk(n.id, depth + 1)
      }
    }
    walk(undefined, 0)
    return rows
  }, [scene.layers])
}

function TextForm({ onDone }: { onDone: () => void }) {
  const scene = useStore((s) => s.scene)
  const library = useStore((s) => s.library)
  const sets = useStore((s) => s.sets)
  const alphabet = useStore(sceneAlphabet)
  const selected = useStore(useShallow(selectedIds))
  const [text, setText] = useState("")
  const [op, setOp] = useState<Op>("fuse")
  const [set, setSet] = useState(scene.set)
  const { setScene, select } = useStore.getState()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    const entry = library.sets[set]
    const abc = entry?.alphabet ?? alphabet
    const missing = [...new Set([...value.toLocaleUpperCase("ru")].filter((c) => c !== " " && c !== "\n" && !(c in abc)))]
    const color = scene.layers.find((l) => l.type === "letter")?.color ?? inks[0]
    const letters = layoutText(value, abc, scene.axes, scene.tracking, { op, color, ...(set !== scene.set ? { set } : {}) }, entry?.version ?? 0)
    if (!letters.length) return void toast.error("В сете нет этих знаков.")
    if (scene.layers.length + letters.length + 1 > LIMITS.nodes) return void toast.error(`В сцене не больше ${LIMITS.nodes} объектов.`)
    // The text becomes a new merge group (the first letter is its base) where a new object would go.
    const { parent, index } = insertionPoint(scene, selected)
    const withLetters = { ...scene, layers: [...scene.layers, ...letters.map((l, i) => (i === 0 ? { ...l, op: "union" as Op } : l))] }
    const res = groupNodes(withLetters, letters.map((l) => l.id), "merge", { name: value.slice(0, 24) })
    const host = parent ? scene.layers.find((l) => l.id === parent) : undefined
    const p = isGroup(host) && host.mode === "merge" ? host.parent : parent
    setScene(res.id ? moveNode(res.scene, res.id, p, p === parent ? index : childrenOf(res.scene.layers, p).length) : res.scene)
    if (res.id) select(res.id)
    if (missing.length) toast("Пропущены знаки вне сета: " + missing.join(" "))
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="type-text" className="text-sm font-medium">
        Текст сплавом
      </label>
      <Input id="type-text" autoFocus value={text} maxLength={60} placeholder="Слово или фраза" onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select items={sets.map((s) => ({ value: s.id, label: s.name }))} value={set} onValueChange={(v) => v && setSet(v)}>
          <SelectTrigger size="sm" aria-label="Сет">
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
          <SelectTrigger size="sm" aria-label="Оператор между буквами">
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
      </div>
      <ParamSlider def={sceneParams.tracking} value={scene.tracking} onChange={(v) => setScene((s) => ({ ...s, tracking: v }), "tracking")} />
      <Button type="submit" disabled={!text.trim()}>
        <Type data-icon="inline-start" />
        Добавить текст
      </Button>
    </form>
  )
}

function AddMenu() {
  const scene = useStore((s) => s.scene)
  const selected = useStore(useShallow(selectedIds))
  const [panel, setPanel] = useState<"letter" | "text" | null>(null)
  const [pickSet, setPickSet] = useState<string | null>(null)
  const { setScene, select } = useStore.getState()
  const full = scene.layers.length >= LIMITS.nodes

  function insert(node: Layer) {
    const { parent, index } = insertionPoint(scene, selected)
    const host = parent ? scene.layers.find((l) => l.id === parent) : undefined
    // A group cannot go into a merge group: it lands next to it.
    const p = isGroup(node) && isGroup(host) && host.mode === "merge" ? host.parent : parent
    const idx = p === parent ? index : childrenOf(scene.layers, p).length
    setScene((s) => moveNode({ ...s, layers: [...s.layers, node] }, node.id, p, idx))
    select(node.id)
  }
  const near = () => {
    const sel = scene.layers.find((l) => l.id === selected[selected.length - 1])
    return sel && !isGroup(sel) ? { x: sel.x + 3, y: sel.y, color: sel.color } : { x: 0, y: 0, color: inks[0] }
  }
  function addLetter(c: string) {
    const set = pickSet ?? scene.set
    insert(makeLayer(c, { ...near(), op: "fuse", ...(set !== scene.set ? { set } : {}) }))
    setPanel(null)
  }
  function addShape(kind: ShapeKind) {
    const n = near()
    const dims: Record<ShapeKind, [number, number]> = { rect: [4, 4], ellipse: [4, 4], polygon: [4, 4], star: [4, 4], line: [6, 0.5] }
    insert(makeShape({ kind, w: dims[kind][0], h: dims[kind][1], sides: kind === "star" ? 5 : 6 }, { ...n, color: n.color === inks[0] ? inks[1] : n.color }))
  }

  return (
    <Popover open={panel !== null} onOpenChange={(v) => !v && setPanel(null)}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" disabled={full} />}>
          <Plus data-icon="inline-start" />
          Добавить
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setPanel("letter")}>
            <Type />
            Буква…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPanel("text")}>
            <Type />
            Текст…
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ShapeIcon kind="rect" />
              Фигура
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {shapeKinds.map((k) => (
                <DropdownMenuItem key={k} onClick={() => addShape(k)}>
                  <ShapeIcon kind={k} />
                  {shapeNames[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => insert(makeGroup("stack", { name: "Группа" }))}>
            <Folder />
            Пустая группа
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insert(makeGroup("merge", { name: "Сплав" }))}>
            <Combine />
            Пустой сплав
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* The popover hangs from the header, under the add button. */}
      <PopoverTrigger render={<span aria-hidden className="pointer-events-none absolute top-11 right-3 size-0" />} />
      <PopoverContent className="w-80" align="end">
        {panel === "letter" && <GlyphPicker set={pickSet ?? scene.set} onSet={setPickSet} onPick={addLetter} />}
        {panel === "text" && <TextForm onDone={() => setPanel(null)} />}
      </PopoverContent>
    </Popover>
  )
}

type DragState = { ids: string[]; over: DropTarget | null }

function LayerRow({
  node: l,
  depth,
  scene,
  active,
  renaming,
  drag,
  setDrag,
  onPick,
}: {
  node: Layer
  depth: number
  scene: Scene
  active: boolean
  renaming: boolean
  drag: DragState | null
  setDrag: (d: DragState | null) => void
  onPick: (e: React.MouseEvent) => void
}) {
  const { updateLayer, set } = useStore.getState()
  const [name, setName] = useState(nodeLabel(l))
  const role = nodeRole(scene, l)
  const Icon = opIcons[l.op]
  const hiddenBy = !l.visible || ancestors(scene.layers, l.id).some((g) => !g.visible)
  const lockedBy = ancestors(scene.layers, l.id).some((g) => g.locked)
  const kids = isGroup(l) ? childrenOf(scene.layers, l.id).length : 0
  const over = drag?.over?.id === l.id ? drag.over.where : null
  const setLabel = useStore((s) => (l.type === "letter" && l.set && l.set !== s.scene.set ? s.sets.find((x) => x.id === l.set)?.name : undefined))
  useEffect(() => setName(nodeLabel(l)), [renaming, l])

  const sub =
    l.type === "group"
      ? `${l.mode === "merge" ? "Сплав" : "Группа"} · ${kids}`
      : role === "base"
        ? "Основа сплава"
        : role === "operand"
          ? opInfo[l.op].name
          : l.type === "letter"
            ? setLabel ?? "Буква"
            : "Фигура"

  function onDragOver(e: React.DragEvent) {
    if (!drag || drag.ids.includes(l.id)) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const t = (e.clientY - r.top) / r.height
    const where: DropTarget["where"] = isGroup(l) && t > 0.28 && t < 0.72 ? "inside" : t < 0.5 ? "above" : "below"
    if (drag.over?.id !== l.id || drag.over.where !== where) setDrag({ ...drag, over: { id: l.id, where } })
  }

  const rename = () => set({ renaming: l.id })

  return (
    <li role="treeitem" data-row={l.id} aria-selected={active} aria-level={depth + 1} aria-expanded={isGroup(l) ? !l.collapsed : undefined}>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              draggable={!renaming}
              onDragStart={(e) => {
                const ids = active ? selectedIds(useStore.getState()) : [l.id]
                if (!active) useStore.getState().select(l.id)
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", ids.join(","))
                setDrag({ ids, over: null })
              }}
              onDragOver={onDragOver}
              onDrop={(e) => {
                e.preventDefault()
                if (drag?.over) moveTo(drag.ids, drag.over)
                setDrag(null)
              }}
              onDragEnd={() => setDrag(null)}
              onClick={onPick}
              onContextMenu={() => {
                if (!active) useStore.getState().select(l.id)
              }}
              onDoubleClick={rename}
              className={cn(
                "group relative flex h-10 cursor-default items-center gap-1.5 rounded-lg pr-1 text-left transition-colors outline-none hover:bg-muted",
                active && "bg-muted ring-1 ring-primary/40",
                hiddenBy && "text-muted-foreground",
                over === "inside" && "bg-primary/10 ring-1 ring-primary",
              )}
              style={{ paddingLeft: 4 + depth * 14 }}
            />
          }
        >
          {over === "above" && <span aria-hidden className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-primary" />}
          {over === "below" && <span aria-hidden className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-primary" />}
          {isGroup(l) ? (
            <button
              type="button"
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background"
              aria-label={l.collapsed ? "Развернуть" : "Свернуть"}
              onClick={(e) => {
                e.stopPropagation()
                updateLayer(l.id, { collapsed: !l.collapsed })
              }}
            >
              {l.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border bg-background p-0.5", hiddenBy && "opacity-50")}>
            {l.type === "letter" ? (
              <GlyphThumb char={l.char} set={l.set} color={l.color} axes={l.axes ? { ...scene.axes, ...l.axes } : undefined} />
            ) : l.type === "shape" ? (
              <ShapeIcon kind={l.shape.kind} className="size-4" style={{ color: l.color }} />
            ) : l.mode === "merge" ? (
              <Combine className="size-4 text-muted-foreground" />
            ) : (
              <Folder className="size-4 text-muted-foreground" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            {renaming ? (
              <Input
                autoFocus
                value={name}
                maxLength={64}
                className="h-6 px-1 text-sm"
                aria-label="Название слоя"
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const v = name.trim()
                  updateLayer(l.id, { name: v && v !== nodeLabel({ ...l, name: undefined }) ? v : undefined })
                  set({ renaming: null })
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                  if (e.key === "Escape") set({ renaming: null })
                }}
              />
            ) : (
              <span className="truncate text-sm leading-tight font-medium">{nodeLabel(l)}</span>
            )}
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {role === "operand" && <Icon className="size-3 shrink-0" />}
              {sub}
            </span>
          </span>
          <span className="flex shrink-0 items-center">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={l.locked ? "Открепить" : "Закрепить"}
              className={cn(!l.locked && "opacity-0 group-hover:opacity-60 focus-visible:opacity-100", lockedBy && !l.locked && "opacity-30")}
              onClick={(e) => {
                e.stopPropagation()
                toggleFlag([l.id], "locked")
              }}
            >
              {l.locked || lockedBy ? <Lock /> : <LockOpen />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={l.visible ? "Скрыть" : "Показать"}
              className={cn(l.visible && "opacity-0 group-hover:opacity-60 focus-visible:opacity-100")}
              onClick={(e) => {
                e.stopPropagation()
                toggleFlag(active ? selectedIds(useStore.getState()) : [l.id], "visible")
              }}
            >
              {l.visible ? <Eye /> : <EyeOff />}
            </Button>
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuItem onClick={rename}>
            <Pencil />
            Переименовать
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={duplicateSelection}>
            <Copy />
            Дублировать
            <ContextMenuShortcut>{MOD}D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => groupSelection("stack")}>
            <Folder />
            Сгруппировать
            <ContextMenuShortcut>{MOD}G</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => groupSelection("merge")}>
            <Combine />
            Объединить в сплав
            <ContextMenuShortcut>⌥{MOD}G</ContextMenuShortcut>
          </ContextMenuItem>
          {isGroup(l) && (
            <>
              <ContextMenuItem onClick={ungroupSelection}>
                <Ungroup />
                Разгруппировать
                <ContextMenuShortcut>⇧{MOD}G</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={selectChildren}>Выделить содержимое</ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => arrange("front")}>
            <ArrowUpToLine />
            На передний план
            <ContextMenuShortcut>]</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => arrange("back")}>
            <ArrowDownToLine />
            На задний план
            <ContextMenuShortcut>[</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => toggleFlag(selectedIds(useStore.getState()), "visible")}>
            {l.visible ? <EyeOff /> : <Eye />}
            {l.visible ? "Скрыть" : "Показать"}
            <ContextMenuShortcut>⇧{MOD}H</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleFlag(selectedIds(useStore.getState()), "locked")}>
            {l.locked ? <LockOpen /> : <Lock />}
            {l.locked ? "Открепить" : "Закрепить"}
            <ContextMenuShortcut>⇧{MOD}L</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={deleteSelection}>
            <Trash2 />
            Удалить
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  )
}

export function LayersPanel() {
  const scene = useStore((s) => s.scene)
  const selected = useStore(useShallow(selectedIds))
  const renaming = useStore((s) => s.renaming)
  const rows = useRows(scene)
  const [drag, setDrag] = useState<DragState | null>(null)
  const anchor = useRef<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const { select, selectMany, set } = useStore.getState()
  const primary = scene.layers.find((l) => l.id === selected[selected.length - 1])
  const canMerge = selected.some((id) => !isGroup(scene.layers.find((l) => l.id === id)))

  // Keep the primary row in view when the selection changes from the canvas.
  useEffect(() => {
    if (!primary) return
    list.current?.querySelector(`[data-row="${primary.id}"]`)?.scrollIntoView({ block: "nearest" })
  }, [primary])

  function pick(id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (e.shiftKey && anchor.current) {
      // Range in list order.
      const a = rows.findIndex((r) => r.node.id === anchor.current),
        b = rows.findIndex((r) => r.node.id === id)
      if (a >= 0 && b >= 0) {
        selectMany(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.node.id))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) select(id, "toggle")
    else select(id)
    anchor.current = id
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest("input")) return
    const i = rows.findIndex((r) => r.node.id === primary?.id)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const j = Math.max(0, Math.min(rows.length - 1, (i < 0 ? -1 : i) + (e.key === "ArrowDown" ? 1 : -1)))
      if (rows[j]) pick(rows[j].node.id, { shiftKey: e.shiftKey, metaKey: false, ctrlKey: false })
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && isGroup(primary)) {
      e.preventDefault()
      useStore.getState().updateLayer(primary.id, { collapsed: e.key === "ArrowLeft" })
    } else if (e.key === "F2" || (e.key === "Enter" && primary)) {
      e.preventDefault()
      if (primary) set({ renaming: primary.id })
    }
  }

  return (
    <aside className="relative flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-72 lg:shrink-0" aria-label="Слои">
      <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
        <h2 className="text-sm font-medium">
          Слои <span className="text-muted-foreground tabular-nums">· {scene.layers.length}</span>
        </h2>
        <AddMenu />
      </div>
      <div className="flex items-center gap-0.5 border-b px-2 py-1">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Сгруппировать" disabled={!selected.length} onClick={() => groupSelection("stack")} />}>
            <Folder />
          </TooltipTrigger>
          <TooltipContent>Группа: объекты рисуются независимо ({MOD}G)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Объединить в сплав" disabled={!canMerge} onClick={() => groupSelection("merge")} />}>
            <Combine />
          </TooltipTrigger>
          <TooltipContent>Сплав: формы сливаются операторами (⌥{MOD}G)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Разгруппировать" disabled={!isGroup(primary)} onClick={ungroupSelection} />}>
            <Ungroup />
          </TooltipTrigger>
          <TooltipContent>Разгруппировать (⇧{MOD}G)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Дублировать" disabled={!selected.length} onClick={duplicateSelection} />}>
            <Copy />
          </TooltipTrigger>
          <TooltipContent>Дублировать ({MOD}D)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="На передний план" disabled={!selected.length} onClick={() => arrange("front")} />}>
            <ArrowUpToLine />
          </TooltipTrigger>
          <TooltipContent>На передний план (])</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="На задний план" disabled={!selected.length} onClick={() => arrange("back")} />}>
            <ArrowDownToLine />
          </TooltipTrigger>
          <TooltipContent>На задний план ([)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Удалить" disabled={!selected.length} onClick={deleteSelection} className="ml-auto" />}>
            <Trash2 />
          </TooltipTrigger>
          <TooltipContent>Удалить (Delete)</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <Empty className="p-6">
            <EmptyHeader>
              <EmptyTitle>Слоёв пока нет</EmptyTitle>
              <EmptyDescription>Нажмите «Добавить»: буква, текст, фигура или группа.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            ref={list}
            tabIndex={0}
            role="tree"
            aria-multiselectable
            aria-label="Дерево слоёв. Стрелки — выбор, Shift — диапазон, ⌘ — добавить к выбору, F2 — переименовать, перетаскивание — порядок и вложение в группы."
            className="flex flex-col gap-0.5 p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onKeyDown={onKeyDown}
            onDragLeave={(e) => {
              if (drag && !list.current?.contains(e.relatedTarget as Node)) setDrag({ ...drag, over: null })
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) select(null)
            }}
          >
            {rows.map(({ node, depth }) => (
              <LayerRow
                key={node.id}
                node={node}
                depth={depth}
                scene={scene}
                active={selected.includes(node.id)}
                renaming={renaming === node.id}
                drag={drag}
                setDrag={setDrag}
                onPick={(e) => pick(node.id, e)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Перетащите слой на группу, чтобы вложить. Двойной клик — переименовать, правая кнопка — действия.
      </p>
    </aside>
  )
}
