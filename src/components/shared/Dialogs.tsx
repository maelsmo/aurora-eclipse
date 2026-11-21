import { useEffect, useState } from "react"
import { Bookmark, Download, Loader2, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SceneThumb } from "./Thumbs"
import { exportSVG, makeRecipe, recordCanvas, fileStem, vectorWarnings } from "@/engine/export"
import { renderPNG } from "@/engine/gpu/thumbs"
import { frameBounds } from "@/engine/frame"
import { fitView, sceneFrame, sceneReach } from "@/engine/view"
import { download } from "@/engine/storage"
import type { Look, Scene } from "@/engine/scene"
import { sceneChars } from "./labels"
import { useStore } from "@/state/store"
import { runtime } from "@/state/runtime"

export function SaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const scene = useStore((s) => s.scene)
  const save = useStore((s) => s.saveToCollection)
  const [name, setName] = useState("")
  useEffect(() => {
    if (open) setName(sceneChars(scene.layers).slice(0, 24) || "Сочетание")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            if (save(name.trim().slice(0, 64), scene)) {
              toast.success("Сочетание сохранено в коллекцию")
              onOpenChange(false)
            } else toast.error("Хранилище браузера переполнено или недоступно. Выгрузите JSON через экспорт.")
          }}
        >
          <DialogHeader>
            <DialogTitle>Сохранить в коллекцию</DialogTitle>
            <DialogDescription>Сохраняются параметры, связи с сигналами и движение — сочетание останется живым.</DialogDescription>
          </DialogHeader>
          <div className="aspect-[16/9] overflow-hidden rounded-lg border" style={{ background: scene.material.transparent ? undefined : scene.material.background }}>
            <SceneThumb scene={scene} options={{ pad: 0.12 }} />
          </div>
          <Field>
            <FieldLabel htmlFor="save-name">Название</FieldLabel>
            <Input id="save-name" autoFocus value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              <Bookmark data-icon="inline-start" />
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Every look a scene can draw with (scene look plus object overrides). */
const sceneLooks = (s: Scene): Look[] => [s.look, ...s.layers.filter((l) => l.look).map((l) => ({ ...s.look, ...l.look }))]

type Format = "svg" | "png" | "video" | "json"
const sizes = [1024, 2048, 4096].map((v) => ({ value: String(v), label: `${v} px` }))

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const library = useStore((s) => s.library)
  const sets = useStore((s) => s.sets)
  const [format, setFormat] = useState<Format>("svg")
  const [size, setSize] = useState("2048")
  const [transparent, setTransparent] = useState(true)
  const [seconds, setSeconds] = useState("5")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [frozen, setFrozen] = useState<{ scene: Scene; time: number } | null>(null)

  useEffect(() => {
    if (open) {
      const st = useStore.getState()
      setFrozen({ scene: runtime.effective ?? st.scene, time: runtime.time })
      setTransparent(st.scene.material.transparent || format !== "png")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const scene = frozen?.scene ?? useStore.getState().scene

  async function run() {
    if (!frozen) return
    setBusy(true)
    try {
      await new Promise((r) => setTimeout(r, 20))
      const stem = fileStem(frozen.scene)
      if (format === "svg") {
        const frame = sceneFrame(frozen.scene, library, frozen.time)
        const svg = await exportSVG(frame, frozen.scene.material, { transparent }, setProgress)
        setProgress(0)
        download(new Blob([svg], { type: "image/svg+xml" }), stem + ".svg")
      } else if (format === "png") {
        const frame = sceneFrame(frozen.scene, library, frozen.time)
        const b = frameBounds(frame, sceneReach(frozen.scene) + 0.8)
        const long = Number(size)
        const aspect = (b.x1 - b.x0) / Math.max(b.y1 - b.y0, 0.1)
        const w = aspect >= 1 ? long : Math.round(long * aspect),
          h = aspect >= 1 ? Math.round(long / aspect) : long
        const view = fitView(b, w, h, 0.02)
        const blob = await renderPNG(frozen.scene, library, w, h, view, frozen.time, transparent)
        download(blob, stem + ".png")
      } else if (format === "json") {
        const recipe = makeRecipe(useStore.getState().scene, sets)
        download(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }), stem + ".json")
      } else {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-studio-canvas]")
        if (!canvas || canvas.hidden) throw new Error("no-gpu")
        runtime.keepAlive = true
        runtime.kick()
        try {
          const blob = await recordCanvas(canvas, Number(seconds), setProgress)
          download(blob, stem + ".webm")
        } finally {
          runtime.keepAlive = false
          setProgress(0)
        }
      }
      toast.success("Файл готов")
      onOpenChange(false)
    } catch (e) {
      const msg = (e as Error).message
      toast.error(
        msg === "no-gpu" || msg === "unsupported"
          ? "Запись видео недоступна в этом браузере или без WebGL2."
          : "Не удалось подготовить файл. Попробуйте ещё раз.",
      )
    } finally {
      setBusy(false)
    }
  }

  const notes: Record<Format, string> = {
    svg: "Точные контуры текущего кадра: прямые и кривые Безье, цвет каждой буквы — отдельной областью. 1 модуль = 10 мм. Контур и изолинии выгружаются обводкой — удобно для плоттера и лазера.",
    png: "Растр текущего кадра со всеми эффектами материала.",
    video: "Запись холста студии в WebM с текущим движением и сигналами. Не переключайте вкладку во время записи.",
    json: "Рецепт: сцена, связи, движение и изменённые знаки алфавита. Подходит для переноса и будущего 3D.",
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Экспорт</DialogTitle>
          <DialogDescription>Кадр зафиксирован в момент открытия окна.</DialogDescription>
        </DialogHeader>
        <div
          className="aspect-[16/9] overflow-hidden rounded-lg border"
          style={
            transparent && format !== "json"
              ? { backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)", backgroundSize: "14px 14px" }
              : { background: scene.material.background }
          }
        >
          <SceneThumb scene={scene} options={{ pad: 0.1, time: frozen?.time ?? 0, transparent, tight: false }} />
        </div>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[format]}
          onValueChange={(v) => {
            if (!v[0]) return
            setFormat(v[0] as Format)
            if (v[0] === "video") setTransparent(false)
          }}
          className="w-full"
          aria-label="Формат"
        >
          <ToggleGroupItem value="svg" className="flex-1">SVG</ToggleGroupItem>
          <ToggleGroupItem value="png" className="flex-1">PNG</ToggleGroupItem>
          <ToggleGroupItem value="video" className="flex-1">Видео</ToggleGroupItem>
          <ToggleGroupItem value="json" className="flex-1">JSON</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">{notes[format]}</p>
        {format === "svg" && vectorWarnings(scene.material, sceneLooks(scene)).length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Не войдёт в вектор</AlertTitle>
            <AlertDescription>{vectorWarnings(scene.material, sceneLooks(scene)).join(", ")}. Для них используйте PNG.</AlertDescription>
          </Alert>
        )}
        {(format === "svg" || format === "png") && (
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="exp-transparent" className="font-normal">
              Прозрачный фон
            </Label>
            <Switch id="exp-transparent" checked={transparent} onCheckedChange={setTransparent} />
          </div>
        )}
        {format === "png" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Длинная сторона</span>
            <Select items={sizes} value={size} onValueChange={(v) => v && setSize(v)}>
              <SelectTrigger className="w-32" aria-label="Размер PNG">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {format === "video" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Длительность</span>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[seconds]} onValueChange={(v) => v[0] && setSeconds(v[0])} aria-label="Длительность">
              <ToggleGroupItem value="5">5 с</ToggleGroupItem>
              <ToggleGroupItem value="10">10 с</ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
        <DialogFooter>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {busy ? (format === "video" ? `Запись… ${Math.round(progress * 100)}%` : format === "svg" ? `Контуры… ${Math.round(progress * 100)}%` : "Подготовка…") : "Скачать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
