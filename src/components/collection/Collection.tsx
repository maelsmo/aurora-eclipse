import { useRef, useState } from "react"
import { Bookmark, Download, FolderOpen, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SceneThumb } from "@/components/shared/Thumbs"
import { makeRecipe, fileStem } from "@/engine/export"
import { download } from "@/engine/storage"
import { useStore, type SavedScene } from "@/state/store"
import { readRecipe } from "@/state/recipe"

const dateFmt = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

export function Collection() {
  const collection = useStore((s) => s.collection)
  const sets = useStore((s) => s.sets)
  const st = useStore.getState()
  const [deleting, setDeleting] = useState<SavedScene | null>(null)
  const [renaming, setRenaming] = useState<SavedScene | null>(null)
  const [name, setName] = useState("")

  const file = useRef<HTMLInputElement>(null)

  function open(item: SavedScene) {
    // The scene names its own glyph set: opening it never switches sets globally.
    st.replaceScene(item.scene)
    st.setTab("studio")
  }

  /** A recipe file goes into the collection; its glyph sets join the library. */
  async function loadRecipe(f: File) {
    let raw: unknown
    try {
      raw = JSON.parse(await f.text())
    } catch {
      return void toast.error("Файл не читается как JSON. Нужен рецепт, выгруженный через «Экспорт → JSON».")
    }
    const res = readRecipe(raw, useStore.getState().sets)
    if (!res.ok) return void toast.error(res.error)
    useStore.getState().importSets(res.sets)
    const name =
      f.name
        .replace(/\.json$/i, "")
        .replace(/^aurora-eclipse_/, "")
        .slice(0, 64) || "Рецепт"
    if (!useStore.getState().saveToCollection(name, res.scene)) return void toast.error("Хранилище браузера переполнено или недоступно.")
    const added = res.sets.length ? ` Добавлено сетов: ${res.sets.length}.` : ""
    toast.success(`Рецепт «${name}» в коллекции.${added}`, {
      action: {
        label: "Открыть",
        onClick: () => open(useStore.getState().collection[0]),
      },
    })
  }

  const upload = (
    <>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void loadRecipe(f)
          e.target.value = ""
        }}
      />
      <Button variant="outline" onClick={() => file.current?.click()}>
        <Upload data-icon="inline-start" />
        Загрузить рецепт
      </Button>
    </>
  )

  if (!collection.length)
    return (
      <Empty className="flex-1 rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bookmark />
          </EmptyMedia>
          <EmptyTitle>Коллекция пуста</EmptyTitle>
          <EmptyDescription>
            Соберите сочетание в студии и нажмите «Сохранить». Коллекция хранится в этом браузере, а JSON-рецепт можно выгрузить и перенести.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => st.setTab("studio")}>Открыть студию</Button>
            {upload}
          </div>
        </EmptyContent>
      </Empty>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Коллекция <span className="text-muted-foreground tabular-nums">· {collection.length}</span>
        </h2>
        {upload}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 pb-3">
          {collection.map((item) => {
            const version = sets.find((v) => v.id === item.scene.set)
            return (
              <li key={item.id}>
                <Card className="gap-0 overflow-hidden py-0">
                  <button
                    type="button"
                    onClick={() => open(item)}
                    aria-label={"Открыть «" + item.name + "»"}
                    className="block aspect-[4/3] w-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    style={{
                      background: item.scene.material.transparent ? undefined : item.scene.material.background,
                    }}
                  >
                    <SceneThumb scene={item.scene} options={{ pad: 0.12 }} />
                  </button>
                  <CardHeader className="border-t py-3">
                    <CardTitle className="truncate">{item.name}</CardTitle>
                    <CardDescription>
                      {dateFmt.format(item.created)} · {version ? version.name : "сет удалён"}
                    </CardDescription>
                    <CardAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={"Действия: " + item.name} />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => open(item)}>
                            <FolderOpen />
                            Открыть в студии
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setName(item.name)
                              setRenaming(item)
                            }}
                          >
                            <Pencil />
                            Переименовать
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              download(
                                new Blob([JSON.stringify(makeRecipe(item.scene, sets), null, 2)], {
                                  type: "application/json",
                                }),
                                fileStem(item.scene) + ".json",
                              )
                            }
                          >
                            <Download />
                            Выгрузить JSON
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(item)}>
                            <Trash2 />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardAction>
                  </CardHeader>
                </Card>
              </li>
            )
          })}
        </ul>

        <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Удалить «{deleting?.name}»?</DialogTitle>
              <DialogDescription>Сочетание исчезнет из коллекции этого браузера. Отменить удаление нельзя.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deleting) st.removeFromCollection(deleting.id)
                  setDeleting(null)
                }}
              >
                Удалить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (renaming && name.trim()) st.renameInCollection(renaming.id, name.trim().slice(0, 64))
                setRenaming(null)
              }}
            >
              <DialogHeader>
                <DialogTitle>Новое название</DialogTitle>
              </DialogHeader>
              <Input autoFocus value={name} maxLength={64} aria-label="Название" onChange={(e) => setName(e.target.value)} />
              <DialogFooter>
                <Button type="submit" disabled={!name.trim()}>
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </ScrollArea>
    </div>
  )
}
