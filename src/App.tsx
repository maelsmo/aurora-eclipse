import { useEffect, useMemo, useState } from "react"
import { Bookmark, Download, Info, Redo2, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Studio } from "@/components/studio/Studio"
import { Constructor } from "@/components/constructor/Constructor"
import { Collection } from "@/components/collection/Collection"
import { SceneThumb } from "@/components/shared/Thumbs"
import { SaveDialog, ExportDialog } from "@/components/shared/Dialogs"
import { AboutDialog } from "@/components/shared/AboutDialog"
import { presets } from "@/engine/presets"
import { useStore, type Tab } from "@/state/store"

function Brand() {
  const mark = useMemo(() => {
    const s = presets[0].make()
    return { ...s, material: { ...s.material, transparent: true } }
  }, [])
  return (
    <div className="flex items-center gap-2.5">
      <span className="size-9 shrink-0">
        <SceneThumb scene={mark} options={{ transparent: true, pad: 0.04 }} label="Знак Aurora Eclipse" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">Aurora Eclipse</span>
        <span className="text-xs text-muted-foreground">Type Lab</span>
      </div>
    </div>
  )
}

export default function App() {
  const tab = useStore((s) => s.tab)
  const canUndo = useStore((s) => (s.tab === "constructor" ? s.glyphPast.length > 0 : s.past.length > 0))
  const canRedo = useStore((s) => (s.tab === "constructor" ? s.glyphFuture.length > 0 : s.future.length > 0))
  const collectionCount = useStore((s) => s.collection.length)
  const storageError = useStore((s) => s.storageError)
  const [dialog, setDialog] = useState<"save" | "export" | "about" | null>(null)

  const undo = () => (useStore.getState().tab === "constructor" ? useStore.getState().glyphUndo() : useStore.getState().undo())
  const redo = () => (useStore.getState().tab === "constructor" ? useStore.getState().glyphRedo() : useStore.getState().redo())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = e.target as HTMLElement
      if (el.closest("input, textarea, [contenteditable]")) return
      const k = e.key.toLowerCase()
      if (k === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === "y") {
        e.preventDefault()
        redo()
      } else if (k === "s" && useStore.getState().tab === "studio") {
        e.preventDefault()
        setDialog("save")
      } else if (k === "e" && useStore.getState().tab === "studio") {
        e.preventDefault()
        setDialog("export")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (storageError)
      toast.error("Браузер не даёт сохранить данные. Работа продолжится, но выгрузите важное через экспорт JSON.", {
        id: "storage",
      })
  }, [storageError])

  return (
    <TooltipProvider delay={400}>
        <div className="flex min-h-dvh flex-col gap-3 p-3 lg:h-dvh">
          <header className="flex flex-wrap items-center gap-3">
            <Brand />
            <Tabs value={tab} onValueChange={(v) => useStore.getState().setTab(v as Tab)} className="sm:ml-6">
              <TabsList>
                <TabsTrigger value="studio">Студия</TabsTrigger>
                <TabsTrigger value="constructor">Конструктор</TabsTrigger>
                <TabsTrigger value="collection">
                  Коллекция
                  {collectionCount > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 tabular-nums">
                      {collectionCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto flex items-center gap-1.5">
              {tab !== "collection" && (
                <>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Отменить" disabled={!canUndo} onClick={undo} />}>
                      <Undo2 />
                    </TooltipTrigger>
                    <TooltipContent>Отменить (⌘Z)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Повторить" disabled={!canRedo} onClick={redo} />}>
                      <Redo2 />
                    </TooltipTrigger>
                    <TooltipContent>Повторить (⇧⌘Z)</TooltipContent>
                  </Tooltip>
                </>
              )}
              {tab === "studio" && (
                <>
                  <Button variant="outline" onClick={() => setDialog("save")}>
                    <Bookmark data-icon="inline-start" />
                    Сохранить
                  </Button>
                  <Button onClick={() => setDialog("export")}>
                    <Download data-icon="inline-start" />
                    Экспорт
                  </Button>
                </>
              )}
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="О системе построения" onClick={() => setDialog("about")} />}>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>Система построения</TooltipContent>
              </Tooltip>
            </div>
          </header>
          <main className="flex min-h-0 flex-1 flex-col">
            {tab === "studio" && <Studio />}
            {tab === "constructor" && <Constructor />}
            {tab === "collection" && <Collection />}
          </main>
        </div>
        <SaveDialog open={dialog === "save"} onOpenChange={(v) => setDialog(v ? "save" : null)} />
        <ExportDialog open={dialog === "export"} onOpenChange={(v) => setDialog(v ? "export" : null)} />
        <AboutDialog open={dialog === "about"} onOpenChange={(v) => setDialog(v ? "about" : null)} />
        <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
