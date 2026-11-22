import { useEffect, useRef, useState } from "react"
import { Bookmark, Download, Loader2, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SceneThumb } from "./Thumbs"
import { Progress } from "@/components/ui/progress"
import { exportSVG, makeRecipe, recordCanvas, fileStem, vectorWarnings } from "@/engine/export"
import { even, mp4Supported } from "@/engine/export/video"
import { renderPNG } from "@/engine/gpu/thumbs"
import type { Frame } from "@/engine/frame"
import { fitView } from "@/engine/view"
import { exportBox, exportDefaults, exportFrame, exportVideo, sizeFor } from "@/state/exporting"
import { download } from "@/engine/storage"
import type { Look, Scene } from "@/engine/scene"
import { sceneChars } from "./labels"
import { useStore } from "@/state/store"
import { liveScene, runtime } from "@/state/runtime"

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
type VideoKind = "mp4" | "webm"
const scales = [1, 2, 4] as const
const PNG_BASE = 1920
const videoSizes = [
  { value: "1280", label: "720p" },
  { value: "1920", label: "1080p" },
  { value: "3840", label: "4K" },
]

type Frozen = { scene: Scene; time: number; frame: Frame }

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const library = useStore((s) => s.library)
  const sets = useStore((s) => s.sets)
  const [format, setFormat] = useState<Format>("svg")
  const [useArtboard, setUseArtboard] = useState(true)
  const [scale, setScale] = useState<(typeof scales)[number]>(1)
  const [transparent, setTransparent] = useState(true)
  const [videoKind, setVideoKind] = useState<VideoKind>("mp4")
  const [videoLong, setVideoLong] = useState("1920")
  const [fps, setFps] = useState("30")
  const [seconds, setSeconds] = useState("5")
  const [mp4, setMp4] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [frozen, setFrozen] = useState<Frozen | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const st = useStore.getState()
    // The live scene only if it was resolved from the current one (the canvas may not have drawn yet).
    const scene = liveScene(st.scene)
    setFrozen({ scene, time: runtime.time, frame: exportFrame(scene, st.library, runtime.time, st.scene) })
    const d = exportDefaults(st.scene)
    setUseArtboard(d.useArtboard)
    setTransparent(d.transparent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const scene = frozen?.scene ?? useStore.getState().scene
  const box = frozen ? exportBox(scene, frozen.frame, useArtboard) : null
  const pngSize = box ? sizeFor(box, Math.min(8192, PNG_BASE * scale)) : [0, 0]
  const videoSize = box ? sizeFor(box, Number(videoLong)).map(even) : [0, 0]

  useEffect(() => {
    if (!open || format !== "video") return
    let alive = true
    setMp4(null)
    void mp4Supported(videoSize[0], videoSize[1], Number(fps)).then((ok) => {
      if (!alive) return
      setMp4(ok)
      if (!ok) setVideoKind("webm")
    })
    return () => {
      alive = false
    }
  }, [open, format, videoSize[0], videoSize[1], fps])

  async function run() {
    if (!frozen || !box) return
    setBusy(true)
    setProgress(0)
    try {
      await new Promise((r) => setTimeout(r, 20))
      const stem = fileStem(frozen.scene)
      if (format === "svg") {
        const svg = await exportSVG(frozen.frame, frozen.scene.material, { transparent, box: useArtboard ? box : undefined }, setProgress)
        download(new Blob([svg], { type: "image/svg+xml" }), stem + ".svg")
      } else if (format === "png") {
        const [w, h] = pngSize
        const view = fitView(box, w, h, 0)
        const blob = await renderPNG(frozen.scene, library, w, h, view, frozen.time, transparent, frozen.frame)
        download(blob, `${stem}@${scale}x.png`)
      } else if (format === "json") {
        const recipe = makeRecipe(useStore.getState().scene, sets)
        download(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }), stem + ".json")
      } else if (videoKind === "mp4") {
        abort.current = new AbortController()
        const blob = await exportVideo({
          scene: useStore.getState().scene,
          lib: library,
          useArtboard,
          long: Number(videoLong),
          fps: Number(fps),
          seconds: Number(seconds),
          onProgress: setProgress,
          signal: abort.current.signal,
        })
        download(blob, stem + ".mp4")
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
        }
      }
      toast.success("Файл готов")
      onOpenChange(false)
    } catch (e) {
      const err = e as Error
      if (err.name === "AbortError") toast("Экспорт видео отменён")
      else
        toast.error(
          err.message === "no-gpu" || err.message === "unsupported"
            ? "Запись видео недоступна в этом браузере или без WebGL2."
            : "Не удалось подготовить файл. Попробуйте ещё раз.",
        )
    } finally {
      abort.current = null
      setBusy(false)
      setProgress(0)
    }
  }

  const notes: Record<Format, string> = {
    svg: "Точные контуры текущего кадра: прямые и кривые Безье, цвет каждой буквы — отдельной областью. Повторяющиеся знаки и клоны — одно описание и ссылки на него, прямоугольники и эллипсы — родными элементами. Контур, изолинии и линии выгружаются осевыми штрихами — удобно для плоттера и лазера. 1 модуль = 10 мм.",
    png: "Растр текущего кадра со всеми эффектами материала.",
    video:
      videoKind === "mp4"
        ? "MP4 (H.264) покадрово с начала сцены: ритмы, движение, клоны и физика просчитываются для каждого кадра, файл не теряет кадров на медленной машине."
        : "Запись холста студии в WebM в реальном времени, с курсором и микрофоном. Не переключайте вкладку во время записи.",
    json: "Рецепт: сцена, связи, движение и изменённые знаки алфавита. Подходит для переноса и будущего 3D.",
  }
  const aspect = box ? Math.min(3, Math.max(1 / 3, (box.x1 - box.x0) / Math.max(box.y1 - box.y0, 0.1))) : 16 / 9
  const label = busy
    ? format === "video"
      ? `${videoKind === "mp4" ? "Кодирование" : "Запись"}… ${Math.round(progress * 100)}%`
      : format === "svg"
        ? `Контуры… ${Math.round(progress * 100)}%`
        : "Подготовка…"
    : "Скачать"

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Экспорт</DialogTitle>
          <DialogDescription>{format === "video" && videoKind === "mp4" ? "Видео считается заново с начала сцены." : "Кадр зафиксирован в момент открытия окна."}</DialogDescription>
        </DialogHeader>
        <div
          className="mx-auto max-h-64 w-full overflow-hidden rounded-lg border"
          style={{
            aspectRatio: String(aspect),
            maxWidth: `${16 * aspect}rem`,
            ...(transparent && (format === "svg" || format === "png")
              ? { backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)", backgroundSize: "14px 14px" }
              : { background: scene.material.background }),
          }}
        >
          {frozen && box && (
            <SceneThumb scene={scene} frame={frozen.frame} box={box} options={{ time: frozen.time, transparent: transparent && (format === "svg" || format === "png") }} />
          )}
        </div>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[format]}
          onValueChange={(v) => {
            if (!v[0]) return
            setFormat(v[0] as Format)
          }}
          className="w-full"
          aria-label="Формат"
        >
          <ToggleGroupItem value="svg" className="flex-1">
            SVG
          </ToggleGroupItem>
          <ToggleGroupItem value="png" className="flex-1">
            PNG
          </ToggleGroupItem>
          <ToggleGroupItem value="video" className="flex-1">
            Видео
          </ToggleGroupItem>
          <ToggleGroupItem value="json" className="flex-1">
            JSON
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">{notes[format]}</p>
        {format === "svg" && vectorWarnings(scene.material, sceneLooks(scene)).length > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Не войдёт в вектор</AlertTitle>
            <AlertDescription>{vectorWarnings(scene.material, sceneLooks(scene)).join(", ")}. Для них используйте PNG.</AlertDescription>
          </Alert>
        )}
        {format !== "json" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Кадр</span>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[useArtboard ? "artboard" : "content"]} onValueChange={(v) => v[0] && setUseArtboard(v[0] === "artboard")} aria-label="Кадр">
              <ToggleGroupItem value="artboard">Артборд {`${+scene.artboard.w.toFixed(1)}×${+scene.artboard.h.toFixed(1)}`}</ToggleGroupItem>
              <ToggleGroupItem value="content">По содержимому</ToggleGroupItem>
            </ToggleGroup>
          </div>
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
            <span className="text-sm">
              Размер <span className="text-muted-foreground tabular-nums">{`${pngSize[0]} × ${pngSize[1]} px`}</span>
            </span>
            <ToggleGroup variant="outline" size="sm" spacing={0} value={[String(scale)]} onValueChange={(v) => v[0] && setScale(Number(v[0]) as (typeof scales)[number])} aria-label="Масштаб PNG">
              {scales.map((k) => (
                <ToggleGroupItem key={k} value={String(k)}>
                  ×{k}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        {format === "video" && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Способ</span>
              <ToggleGroup variant="outline" size="sm" spacing={0} value={[videoKind]} onValueChange={(v) => v[0] && setVideoKind(v[0] as VideoKind)} aria-label="Способ записи">
                <ToggleGroupItem value="mp4" disabled={mp4 === false}>
                  MP4 покадрово
                </ToggleGroupItem>
                <ToggleGroupItem value="webm">WebM с экрана</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {mp4 === false && <p className="text-sm text-muted-foreground">Браузер не умеет кодировать H.264 такого размера — доступна запись WebM.</p>}
            {videoKind === "mp4" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    Размер <span className="text-muted-foreground tabular-nums">{`${videoSize[0]} × ${videoSize[1]}`}</span>
                  </span>
                  <ToggleGroup variant="outline" size="sm" spacing={0} value={[videoLong]} onValueChange={(v) => v[0] && setVideoLong(v[0])} aria-label="Размер видео">
                    {videoSizes.map((s) => (
                      <ToggleGroupItem key={s.value} value={s.value}>
                        {s.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">Кадров в секунду</span>
                  <ToggleGroup variant="outline" size="sm" spacing={0} value={[fps]} onValueChange={(v) => v[0] && setFps(v[0])} aria-label="Кадров в секунду">
                    <ToggleGroupItem value="30">30</ToggleGroupItem>
                    <ToggleGroupItem value="60">60</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Длительность</span>
              <ToggleGroup variant="outline" size="sm" spacing={0} value={[seconds]} onValueChange={(v) => v[0] && setSeconds(v[0])} aria-label="Длительность">
                <ToggleGroupItem value="5">5 с</ToggleGroupItem>
                <ToggleGroupItem value="10">10 с</ToggleGroupItem>
                <ToggleGroupItem value="15">15 с</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </>
        )}
        {busy && format === "video" && <Progress value={Math.round(progress * 100)} aria-label="Готовность видео" />}
        <DialogFooter>
          {busy && format === "video" && videoKind === "mp4" && (
            <Button variant="outline" onClick={() => abort.current?.abort()}>
              Отменить
            </Button>
          )}
          <Button onClick={run} disabled={busy || !frozen}>
            {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
