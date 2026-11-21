import { useMemo, useRef, useState } from "react"
import { Copy, Download, Pencil, RotateCcw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { Section, Hint } from "@/components/shared/Section"
import { SceneThumb, useThemeInk } from "@/components/shared/Thumbs"
import { defaultAlphabet, sharedBy } from "@/engine/alphabet"
import { glyphAdvance } from "@/engine/compile"
import { layoutText, makeScene } from "@/engine/scene"
import { download } from "@/engine/storage"
import type { GlyphDef, PrimDef } from "@/engine/types"
import { primPoints } from "@/engine/types"
import { editingAlphabet, useStore } from "@/state/store"
import { editTarget, primNames, withPrims } from "./editing"
import { GeoModuleControls, ModuleActions } from "./GeoModuleControls"
import { NewSetMenu, SetLookSection } from "./SetControls"
import { isGeo } from "@/engine/types"

const sizeDef = { label: "Размер", min: 0.5, max: 2, step: 0.05 }
const radiusDef = { label: "Радиус", min: 0.5, max: 4, step: 0.5, unit: "m" }
const angleDef = (label: string) => ({ label, min: -360, max: 720, step: 15, unit: "°" })
const advDef = { label: "Ширина знака", min: 1, max: 7, step: 0.5, unit: "m" }

function validGlyphs(raw: unknown): Record<string, GlyphDef> | null {
  if (!raw || typeof raw !== "object") return null
  const out: Record<string, GlyphDef> = {}
  for (const [c, g] of Object.entries(raw as Record<string, unknown>)) {
    if ([...c].length !== 1 || !g || typeof g !== "object") continue
    const prims = (g as GlyphDef).prims
    if (!Array.isArray(prims)) continue
    const ok = prims.every(
      (p: PrimDef) =>
        p &&
        ["stroke", "arc", "dot", "hole", "slot", "box", "ellipse", "sector", "poly"].includes(p.kind) &&
        ("c" in p ? Array.isArray(p.c) : "pts" in p ? Array.isArray(p.pts) : Array.isArray(p.a) && Array.isArray(p.b)),
    )
    if (ok) out[c] = g as GlyphDef
  }
  return out
}

export function GlyphPanel({ selected, onSelect }: { selected: number | null; onSelect: (i: number | null) => void }) {
  const editing = useStore((s) => s.editing)
  const alphabet = useStore(editingAlphabet)
  const library = useStore((s) => s.library)
  const axes = useStore((s) => s.scene.axes)
  const versions = useStore((s) => s.sets)
  const alphabetId = useStore((s) => s.editingSet)
  const st = useStore.getState()
  const version = versions.find((v) => v.id === alphabetId) ?? versions[0]
  const { target, shared, def } = editTarget(editing, alphabet)
  const own = def?.prims ?? []
  const prim = selected !== null ? own[selected] : undefined
  const users = sharedBy(target, alphabet).filter((c) => alphabet[c].prims.length === 0)
  const overridden = target in version.glyphs
  const fileInput = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ink = useThemeInk()
  const control = useMemo(
    () =>
      makeScene({
        axes,
        set: alphabetId,
        layers: layoutText(`H${editing}HO${editing}O`, alphabet, axes, 0.5, { color: ink }, library.sets[alphabetId]?.version ?? 0),
        material: { ...makeScene().material, transparent: true },
      }),
    [editing, alphabet, axes, library, alphabetId, ink],
  )

  const setPrim = (p: PrimDef, key: string) => {
    const next = [...own]
    next[selected!] = p
    st.setGlyph(target, withPrims(def, next), key)
  }

  function exportVersion() {
    const blob = new Blob(
      [JSON.stringify({ format: "aurora-eclipse/alphabet", version: 3, name: version.name, kind: version.kind, base: version.base, look: version.look, glyphs: version.glyphs }, null, 2)],
      { type: "application/json" },
    )
    download(blob, `aurora-eclipse_alphabet_${version.name}.json`)
  }

  async function importVersion(file: File) {
    try {
      const data = JSON.parse(await file.text())
      const glyphs = validGlyphs(data?.glyphs)
      if (!glyphs) throw new Error()
      st.addSet(typeof data.name === "string" ? data.name.slice(0, 40) : file.name, {
        glyphs,
        base: data.base === "geo" || data.base === "empty" ? data.base : "default",
        kind: data.kind === "shapes" ? "shapes" : "strokes",
      })
      toast.success(`Алфавит «${data.name ?? file.name}» загружен: ${Object.keys(glyphs).length} изменённых знаков`)
    } catch {
      toast.error("Файл не похож на алфавит Aurora Eclipse. Нужен JSON, выгруженный из конструктора.")
    }
  }

  return (
    <aside aria-label="Свойства знака" className="flex min-h-0 w-full flex-col rounded-xl border bg-card lg:w-80 lg:shrink-0">
      <ScrollArea className="min-h-0 flex-1">
        <Section title="Знак">
          <div className="flex items-start gap-3">
            <span className="text-4xl leading-none font-semibold">{editing}</span>
            <div className="flex flex-wrap gap-1">
              {shared && <Badge variant="secondary">Общая с {shared}</Badge>}
              {def?.base && <Badge variant="secondary">Основа из {def.base}</Badge>}
              {users.length > 0 && <Badge variant="outline">Её используют: {users.join(" ")}</Badge>}
              {overridden && <Badge>Изменена</Badge>}
            </div>
          </div>
          {shared && <Hint>Конструкция общая с латинской {shared}: правки меняют обе буквы.</Hint>}
          {!def?.base && (
            <ParamSlider
              def={advDef}
              value={glyphAdvance(target, alphabet)}
              onChange={(v) => st.setGlyph(target, withPrims(def, own, v), "adv:" + target)}
            />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!overridden}
              onClick={() => {
                st.setGlyph(target, undefined)
                onSelect(null)
              }}
            >
              <RotateCcw data-icon="inline-start" />
              Вернуть исходную
            </Button>
          </div>
        </Section>

        <Section title={prim ? `Модуль: ${primNames[prim.kind]}` : "Модуль"}>
          {!prim ? (
            <Hint>
              Выберите модуль на сетке или добавьте новый инструментом сверху. Стрелки сдвигают модуль, Delete удаляет.
            </Hint>
          ) : (
            <>
              {prim.kind === "stroke" && (
                <>
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-foreground/80">Толщина штриха</span>
                    <ToggleGroup
                      variant="outline"
                      size="sm"
                      spacing={0}
                      value={[String(prim.w ?? 1)]}
                      onValueChange={(v) => v[0] && setPrim({ ...prim, w: Number(v[0]) }, "w")}
                      aria-label="Множитель толщины"
                    >
                      {["0.5", "1", "1.5", "2"].map((w) => (
                        <ToggleGroupItem key={w} value={w}>
                          ×{w.replace(".", ",")}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  {(["Начало", "Конец"] as const).map((label, e) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground/80">{label} в стыке</span>
                      <ToggleGroup
                        variant="outline"
                        size="sm"
                        spacing={0}
                        value={[prim.ends?.[e] ?? "auto"]}
                        onValueChange={(v) => {
                          if (!v[0]) return
                          const ends: NonNullable<typeof prim.ends> = [...(prim.ends ?? ["auto", "auto"])]
                          ends[e] = v[0] as "auto" | "flush"
                          setPrim({ ...prim, ends }, "ends")
                        }}
                        aria-label={label + " в стыке"}
                      >
                        <ToggleGroupItem value="auto">По правилу</ToggleGroupItem>
                        <ToggleGroupItem value="flush">Скрыть</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  ))}
                </>
              )}
              {prim.kind === "arc" && (
                <>
                  <ParamSlider def={radiusDef} value={prim.r} onChange={(v) => setPrim({ ...prim, r: v }, "r")} />
                  <ParamSlider def={angleDef("Начальный угол")} value={prim.a0} onChange={(v) => setPrim({ ...prim, a0: Math.min(v, prim.a1 - 15) }, "a0")} />
                  <ParamSlider def={angleDef("Конечный угол")} value={prim.a1} onChange={(v) => setPrim({ ...prim, a1: Math.max(v, prim.a0 + 15) }, "a1")} />
                </>
              )}
              {(prim.kind === "dot" || prim.kind === "hole" || prim.kind === "slot") && (
                <ParamSlider def={sizeDef} value={prim.s ?? 1} onChange={(v) => setPrim({ ...prim, s: v }, "s")} />
              )}
              {isGeo(prim) && <GeoModuleControls prim={prim} onChange={(p, key) => setPrim(p, key)} />}
              <ModuleActions
                prim={prim}
                centre={[glyphAdvance(target, alphabet) / 2, 2.5]}
                onReplace={(p) => setPrim(p, "op")}
                onDuplicate={(p) => {
                  st.setGlyph(target, withPrims(def, [...own, p]))
                  onSelect(own.length)
                }}
              />
              <p className="font-mono text-xs text-muted-foreground">
                {"c" in prim ? `центр ${prim.c.join(", ")}` : primPoints(prim).map((q) => q.join(", ")).join(" → ")}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  st.setGlyph(target, withPrims(def, own.filter((_, i) => i !== selected)))
                  onSelect(null)
                }}
              >
                <Trash2 data-icon="inline-start" />
                Удалить модуль
              </Button>
            </>
          )}
        </Section>

        <Section title="Контрольная строка">
          <div className="h-16 rounded-lg border bg-background">
            <SceneThumb scene={control} options={{ transparent: true, fitHeight: 8 }} label={`H${editing}HO${editing}O`} />
          </div>
        </Section>

        <SetLookSection />

        <Section title="Сет">
          <Select
            items={versions.map((v) => ({ value: v.id, label: v.name }))}
            value={alphabetId}
            onValueChange={(v) => v && st.setEditingSet(v)}
          >
            <SelectTrigger className="w-full" aria-label="Сет">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name} · {v.kind === "shapes" ? "фигуры" : "штрихи"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NewSetMenu />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => st.addSet(version.name + " — копия", { from: version.id })}>
              <Copy data-icon="inline-start" />
              Дублировать
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setName(version.name)
                setRenaming(true)
              }}
            >
              <Pencil data-icon="inline-start" />
              Переименовать
            </Button>
            <Button variant="outline" size="sm" onClick={exportVersion}>
              <Download data-icon="inline-start" />
              Экспорт JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload data-icon="inline-start" />
              Импорт JSON
            </Button>
            <Button variant="outline" size="sm" className="col-span-2" disabled={versions.length < 2} onClick={() => setConfirmDelete(true)}>
              <Trash2 data-icon="inline-start" />
              Удалить сет
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importVersion(f)
              e.target.value = ""
            }}
          />
          <Hint>Сет хранит только изменённые знаки, остальные берёт из своей основы. Буквы сцены могут быть из разных сетов.</Hint>
        </Section>
      </ScrollArea>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              st.renameSet(alphabetId, name.trim().slice(0, 40))
              setRenaming(false)
            }}
          >
            <DialogHeader>
              <DialogTitle>Название сета</DialogTitle>
              <DialogDescription>Видно в списках сетов и в выгруженном JSON.</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Название сета" />
            <DialogFooter>
              <Button type="submit" disabled={!name.trim()}>
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить сет «{version.name}»?</DialogTitle>
            <DialogDescription>
              Изменённые в нём знаки ({Object.keys(version.glyphs).length}) пропадут, буквы сцен с этим сетом возьмут знаки из сета сцены. Перед удалением можно выгрузить JSON.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                st.deleteSet(alphabetId)
                setConfirmDelete(false)
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
