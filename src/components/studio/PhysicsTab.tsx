import { useEffect, useState } from "react"
import { Pin, RotateCcw, Wind } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { Section, Hint } from "@/components/shared/Section"
import { physicsParams, type PhysicsNumKey } from "@/engine/params"
import { defaultPhysics, type Physics, type PhysicsField, type PhysicsPointer } from "@/engine/scene"
import { useStore } from "@/state/store"
import { plural } from "@/components/shared/labels"
import { runtime } from "@/state/runtime"
import { bakeBodies } from "@/state/exporting"

const pointerItems: { value: PhysicsPointer; label: string }[] = [
  { value: "none", label: "Нет" },
  { value: "repel", label: "Отталкивает" },
  { value: "attract", label: "Притягивает" },
  { value: "vortex", label: "Закручивает" },
]
const fieldItems: { value: PhysicsField; label: string }[] = [
  { value: "none", label: "Нет" },
  { value: "attract", label: "Притяжение к центру" },
  { value: "repel", label: "Отталкивание от центра" },
  { value: "vortex", label: "Вихрь" },
  { value: "wind", label: "Ветер" },
  { value: "pulse", label: "Пульс" },
]
const bodyKeys: PhysicsNumKey[] = ["bounce", "friction", "air"]

/** Bodies in the live world, polled while the tab is open. */
function useBodyCount() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let last = 0
    return runtime.subscribe(() => {
      const now = performance.now()
      if (now - last < 250) return
      last = now
      setN(runtime.physics?.bodyCount ?? 0)
    })
  }, [])
  return n
}

/** «Физика»: the scene's objects as rigid bodies. */
export function PhysicsTab() {
  const physics = useStore((s) => s.scene.physics)
  const artboard = useStore((s) => s.scene.artboard)
  const { setScene } = useStore.getState()
  const bodies = useBodyCount()
  const set = (p: Partial<Physics>, key?: string) => setScene((s) => ({ ...s, physics: { ...(s.physics ?? defaultPhysics), ...p } }), key ? "physics." + key : undefined)

  if (!physics)
    return (
      <Section title="Физика">
        <Hint>Буквы, фигуры, клоны и сплавы становятся твёрдыми телами: падают, сталкиваются и отскакивают от краёв артборда. Курсор и поля толкают их. Объекты с замком остаются неподвижными опорами.</Hint>
        <Button
          onClick={() => {
            set({ ...defaultPhysics })
            if (!artboard.enabled) setScene((s) => ({ ...s, artboard: { ...s.artboard, enabled: true } }))
          }}
        >
          Включить физику
        </Button>
      </Section>
    )

  const bake = () => {
    const w = runtime.physics
    if (!w) return
    let moved = 0
    setScene((s) => {
      const baked = bakeBodies(s, w)
      moved = baked.moved
      return baked.scene
    })
    toast(moved ? `Положения ${moved} ${plural(moved, "объекта", "объектов", "объектов")} записаны в сцену.` : "Нечего записывать: клоны двигаются только в живом просмотре.")
  }

  return (
    <>
      <Section title="Физика" action={<Switch checked={physics.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Физика включена" />}>
        <Hint>
          Тел в мире: {bodies}. Пока симуляция идёт, тела можно тянуть мышью — сцена при этом не меняется. На паузе перетаскивание правит слои, а любая правка объектов запускает симуляцию заново. Объекты с замком — неподвижные опоры.
        </Hint>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => runtime.resetPhysics()}>
            <RotateCcw data-icon="inline-start" />
            Сначала
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              runtime.physics?.shake(Math.floor(runtime.time * 10) + 1)
              runtime.kick()
            }}
          >
            <Wind data-icon="inline-start" />
            Встряхнуть
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={bake} disabled={!bodies}>
          <Pin data-icon="inline-start" />
          Записать положения в сцену
        </Button>
      </Section>
      <Section title="Мир">
        <ParamSlider def={physicsParams.gravity} value={physics.gravity} target="physics.gravity" onChange={(v) => set({ gravity: v }, "gravity")} />
        <ParamSlider def={physicsParams.gravityAngle} value={physics.gravityAngle} target="physics.gravityAngle" onChange={(v) => set({ gravityAngle: v }, "gravityAngle")} />
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground/80">Границы артборда</span>
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[physics.bounds]} onValueChange={(v) => v[0] && set({ bounds: v[0] as Physics["bounds"] })} className="w-full" aria-label="Границы">
            <ToggleGroupItem value="box" className="flex-1">
              Рамка
            </ToggleGroupItem>
            <ToggleGroupItem value="floor" className="flex-1">
              Пол
            </ToggleGroupItem>
            <ToggleGroupItem value="none" className="flex-1">
              Нет
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Section>
      <Section title="Тела">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground/80">Форма столкновений</span>
          <ToggleGroup variant="outline" size="sm" spacing={0} value={[physics.shape]} onValueChange={(v) => v[0] && set({ shape: v[0] as Physics["shape"] })} className="w-full" aria-label="Форма тел">
            <ToggleGroupItem value="box" className="flex-1">
              Рамка буквы
            </ToggleGroupItem>
            <ToggleGroupItem value="circle" className="flex-1">
              Круг
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {bodyKeys.map((k) => (
          <ParamSlider key={k} def={physicsParams[k]} value={physics[k]} target={"physics." + k} onChange={(v) => set({ [k]: v }, k)} />
        ))}
        <ParamSlider def={physicsParams.maxBodies} value={physics.maxBodies} onChange={(v) => set({ maxBodies: Math.round(v) }, "maxBodies")} />
      </Section>
      <Section title="Силы">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Курсор</span>
          <Select items={pointerItems} value={physics.pointer} onValueChange={(v) => v && set({ pointer: v as PhysicsPointer })}>
            <SelectTrigger size="sm" className="w-40" aria-label="Курсор">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pointerItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {physics.pointer !== "none" && (
          <>
            <ParamSlider def={physicsParams.pointerForce} value={physics.pointerForce} target="physics.pointerForce" onChange={(v) => set({ pointerForce: v }, "pointerForce")} />
            <ParamSlider def={physicsParams.pointerRadius} value={physics.pointerRadius} target="physics.pointerRadius" onChange={(v) => set({ pointerRadius: v }, "pointerRadius")} />
          </>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground/80">Поле</span>
          <Select items={fieldItems} value={physics.field} onValueChange={(v) => v && set({ field: v as PhysicsField })}>
            <SelectTrigger size="sm" className="w-48" aria-label="Поле">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fieldItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {physics.field !== "none" && (
          <ParamSlider def={physicsParams.fieldForce} value={physics.fieldForce} target="physics.fieldForce" onChange={(v) => set({ fieldForce: v }, "fieldForce")} />
        )}
        <Hint>Поле действует вокруг центра артборда. Каждый параметр можно связать с сигналом — ритмом, курсором или микрофоном.</Hint>
      </Section>
    </>
  )
}

