import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRight,
  Bookmark,
  BookmarkPlus,
  Boxes,
  Check,
  CircleHelp,
  Download,
  Fingerprint,
  Folders,
  Grid2X2,
  Layers2,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Inspector } from "@/components/Inspector"
import { StudioCanvas, type Frame } from "@/components/StudioCanvas"
import { Specimen, GlyphIcon } from "@/components/Specimen"
import {
  initial,
  modeNames,
  effectiveMotion,
  presets,
  still,
  validScene,
  type Scene,
} from "@/engine/model"
import { exportFrame } from "@/engine/export"

type Study = { id: string; name: string; scene: Scene }
type Modal = "system" | "export" | "save" | null
const collectionKey = "aurora-eclipse:collection:v1",
  draftKey = "aurora-eclipse:scene:v1"
function readLocal(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null")
  } catch {
    return null
  }
}
function readStudies(): Study[] {
  const a: unknown = readLocal(collectionKey)
  return Array.isArray(a)
    ? a.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          validScene(s.scene),
      )
    : []
}
const pairName = (s: Scene) => s.a + (s.b === "—" ? "" : " × " + s.b)

function StudyCard({
  name,
  scene,
  paper,
  selected,
  onClick,
  remove,
}: {
  name: string
  scene: Scene
  paper: string
  selected?: boolean
  onClick: () => void
  remove?: () => void
}) {
  return (
    <div className="study-wrap">
      <button
        className="study-card"
        onClick={onClick}
        aria-label={"Открыть сочетание " + name}
      >
        <div className="study-paper" style={{ backgroundColor: paper }}>
          <span className="pair-id">{pairName(scene)}</span>
          <Specimen scene={scene} />
          {selected && (
            <span className="selected-mark" title="На холсте">
              <Check />
            </span>
          )}
        </div>
        <div className="study-label">
          <div>
            <h3>{name}</h3>
            <p>{modeNames[scene.mode]}</p>
          </div>
          <ArrowUpRight />
        </div>
      </button>
      {remove && (
        <Button
          className="remove-study"
          size="icon-xs"
          variant="outline"
          aria-label={"Удалить " + name}
          title="Удалить из коллекции"
          onClick={remove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

export default function App() {
  const [scene, setScene] = useState<Scene>(() => {
    const draft = readLocal(draftKey)
    return validScene(draft) ? draft : { ...initial }
  })
  const [tab, setTab] = useState<"studio" | "collection">("studio"),
    [modal, setModal] = useState<Modal>(null)
  const [studies, setStudies] = useState(readStudies),
    [name, setName] = useState(""),
    [version, setVersion] = useState(0)
  const [format, setFormat] = useState<"svg" | "png">("svg"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("")
  const [savedScene, setSavedScene] = useState<Scene>(scene)
  const [deleting, setDeleting] = useState<Study | null>(null)
  const canvas = useRef<(() => Frame) | null>(null),
    captured = useRef<Frame>({ motion: still, aspect: 1.8, zoom: 1 })
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(scene))
      } catch {
        /* A session remains editable when browser storage is full. */
      }
    }, 160)
    return () => clearTimeout(t)
  }, [scene])
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 3400)
      return () => clearTimeout(t)
    }
  }, [notice])
  useEffect(() => {
    const refresh = (e: StorageEvent) => {
      if (e.key === collectionKey) setStudies(readStudies())
    }
    window.addEventListener("storage", refresh)
    return () => window.removeEventListener("storage", refresh)
  }, [])
  function load(s: Scene) {
    setScene({ ...s })
    setVersion((v) => v + 1)
    setTab("studio")
  }
  function prepare(action: "save" | "export") {
    const frame = canvas.current?.() ?? captured.current
    captured.current = frame
    setSavedScene({ ...scene, pose: effectiveMotion(scene, frame.motion) })
    setName(pairName(scene) + " · " + modeNames[scene.mode])
    setModal(action)
  }
  function store(next: Study[]) {
    try {
      localStorage.setItem(collectionKey, JSON.stringify(next))
      setStudies(next)
      return true
    } catch {
      setNotice("Не удалось записать коллекцию в память браузера.")
      return false
    }
  }
  function save() {
    if (!name.trim()) return
    const next = {
      id: crypto.randomUUID(),
      name: name.trim(),
      scene: savedScene,
    }
    if (store([next, ...readStudies()])) {
      setModal(null)
      setNotice("Сочетание сохранено в коллекцию")
    }
  }
  async function download() {
    if (busy) return
    setBusy(true)
    try {
      await new Promise((r) => setTimeout(r, 30))
      await exportFrame(
        savedScene,
        still,
        captured.current.aspect,
        captured.current.zoom,
        format,
      )
      setModal(null)
      setNotice("Файл подготовлен к скачиванию")
    } catch {
      setNotice("Не удалось подготовить файл. Попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }
  const studio = tab === "studio"
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={() => setTab("studio")}
            aria-label="Aurora Eclipse — конфигуратор"
          >
            <img src="/eclipse.svg" alt="" />
            <span>Aurora Eclipse</span>
          </button>
          <span className="brand-rule" />
          <span className="lab-name">Type Lab</span>
          <nav aria-label="Разделы">
            <button
              className={studio ? "active" : ""}
              aria-current={studio ? "page" : undefined}
              onClick={() => setTab("studio")}
            >
              <SlidersHorizontal />
              Конфигуратор
            </button>
            <button
              className={!studio ? "active" : ""}
              aria-current={!studio ? "page" : undefined}
              onClick={() => {
                setStudies(readStudies())
                setTab("collection")
              }}
            >
              <Folders />
              Коллекция
              {studies.length > 0 && (
                <span className="count">{studies.length}</span>
              )}
            </button>
          </nav>
          <Button
            variant="ghost"
            className="system-button"
            onClick={() => setModal("system")}
          >
            <CircleHelp data-icon="inline-start" />
            <span>О системе</span>
          </Button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>{studio ? "Лаборатория глифов" : "Коллекция"}</h1>
            <p>
              {studio
                ? "Генератор динамических букв и их сочетаний."
                : "Ваши сохранённые эксперименты с формой."}
            </p>
          </div>
          <div className="page-actions">
            {studio ? (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => prepare("save")}
                >
                  <BookmarkPlus data-icon="inline-start" />
                  Сохранить
                </Button>
                <Button size="lg" onClick={() => prepare("export")}>
                  <Download data-icon="inline-start" />
                  Экспорт
                </Button>
              </>
            ) : (
              <Button size="lg" onClick={() => setTab("studio")}>
                <Plus data-icon="inline-start" />К эксперименту
              </Button>
            )}
          </div>
        </div>
        {studio ? (
          <>
            <div className="workspace">
              <StudioCanvas
                scene={scene}
                update={(s) => setScene((prev) => ({ ...prev, ...s }))}
                handle={canvas}
                resetVersion={version}
              />
              <Inspector
                scene={scene}
                update={(s) => setScene((prev) => ({ ...prev, ...s }))}
                reset={() => load(initial)}
              />
            </div>
            <section className="presets">
              <div className="shelf-heading">
                <h2>
                  <Layers2 />
                  Стартовые сочетания
                </h2>
                <span>4 пресета</span>
              </div>
              <div className="study-grid">
                {presets.map((p) => (
                  <StudyCard
                    key={p.name}
                    {...p}
                    selected={JSON.stringify(p.scene) === JSON.stringify(scene)}
                    onClick={() => load(p.scene)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : studies.length ? (
          <section className="study-grid">
            {studies.map((s) => (
              <StudyCard
                key={s.id}
                {...s}
                paper={"color-mix(in srgb," + s.scene.color + " 11%,white)"}
                onClick={() => load(s.scene)}
                remove={() => setDeleting(s)}
              />
            ))}
          </section>
        ) : (
          <section className="collection-empty">
            <Bookmark />
            <h2>Сохраните первое сочетание</h2>
            <p>
              Настройте глифы на холсте и нажмите «Сохранить». Коллекция
              хранится в этом браузере.
            </p>
            <Button variant="outline" onClick={() => setTab("studio")}>
              Открыть конфигуратор <ArrowUpRight data-icon="inline-end" />
            </Button>
          </section>
        )}
      </main>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setModal(null)
        }}
      >
        <DialogContent className={modal === "system" ? "system-dialog" : ""}>
          {modal === "system" ? (
            <>
              <DialogHeader>
                <DialogTitle>Как устроен шрифт</DialogTitle>
                <DialogDescription>
                  Система геометрии Aurora Eclipse
                </DialogDescription>
              </DialogHeader>
              <div className="system-example">
                <GlyphIcon letter="A" />
                <GlyphIcon letter="E" />
              </div>
              <div className="system-note">
                <Grid2X2 />
                <div>
                  <h3>Общая сетка</h3>
                  <p>
                    Каждый глиф занимает поле 100 × 100 единиц. Круглые
                    окончания, штрих базовой толщины 22 единицы и оптические
                    свесы связывают 26 латинских и 33 кириллические буквы.
                  </p>
                </div>
              </div>
              <div className="system-note">
                <Fingerprint />
                <div>
                  <h3>Граница формы</h3>
                  <p>
                    Шейдер вычисляет расстояние до двух контуров. В затмении он
                    оставляет просвет, в слиянии скругляет стык, а в вычитании
                    второй глиф вырезает часть первого.
                  </p>
                </div>
              </div>
              <div className="system-note">
                <Boxes />
                <div>
                  <h3>Работа с парой</h3>
                  <p>
                    Перетаскивайте буквы на холсте. Стрелки сдвигают пару
                    относительно друг друга, Shift увеличивает шаг. Кнопка сетки
                    показывает построение. SVG сохраняет контуры выбранного
                    кадра.
                  </p>
                </div>
              </div>
            </>
          ) : modal === "save" ? (
            <>
              <DialogHeader>
                <DialogTitle>Сохранить сочетание</DialogTitle>
                <DialogDescription>
                  Вернуться к этим параметрам можно в коллекции этого браузера.
                </DialogDescription>
              </DialogHeader>
              <div className="modal-preview">
                <Specimen scene={savedScene} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  save()
                }}
              >
                <Field>
                  <FieldLabel htmlFor="study-name">Название</FieldLabel>
                  <Input
                    id="study-name"
                    autoFocus
                    value={name}
                    maxLength={64}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <div className="form-actions">
                  <Button type="submit" disabled={!name.trim()}>
                    <Bookmark data-icon="inline-start" />
                    Сохранить в коллекцию
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Экспорт формы</DialogTitle>
                <DialogDescription>
                  Текущий кадр на прозрачном фоне.
                </DialogDescription>
              </DialogHeader>
              <div className="modal-preview transparent">
                <Specimen
                  scene={savedScene}
                  aspect={captured.current.aspect}
                  zoom={captured.current.zoom}
                />
              </div>
              <Field>
                <FieldLabel>Формат файла</FieldLabel>
                <ToggleGroup
                  value={[format]}
                  variant="outline"
                  spacing={0}
                  onValueChange={(v) => {
                    if (v[0] === "svg" || v[0] === "png") setFormat(v[0])
                  }}
                >
                  <ToggleGroupItem value="svg">SVG</ToggleGroupItem>
                  <ToggleGroupItem value="png">PNG</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <p className="export-hint">
                {format === "svg"
                  ? "Замкнутые векторные контуры для дальнейшей работы."
                  : "2048 пикселей по длинной стороне."}
              </p>
              <DialogFooter>
                <Button disabled={busy} onClick={download}>
                  <Download data-icon="inline-start" />
                  {busy ? "Подготовка…" : "Скачать " + format.toUpperCase()}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить сочетание?</DialogTitle>
            <DialogDescription>
              «{deleting?.name}» будет удалено из вашей коллекции.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (
                  deleting &&
                  store(readStudies().filter((s) => s.id !== deleting.id))
                )
                  setDeleting(null)
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </>
  )
}
