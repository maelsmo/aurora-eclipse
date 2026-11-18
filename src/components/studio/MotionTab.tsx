import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ParamSlider } from "@/components/shared/ParamSlider"
import { Section, Hint } from "@/components/shared/Section"
import { motionNames } from "@/engine/modulation"
import { lfoShapes, signalInfo } from "@/engine/signals"
import { paramDef, sceneParams, warpParams, type WarpKey } from "@/engine/params"
import type { Lfo, Motion, Scene } from "@/engine/scene"
import { selectedLayer, useStore } from "@/state/store"

const motionItems = (Object.keys(motionNames) as Motion["type"][]).map((v) => ({ value: v, label: motionNames[v] }))
const shapeItems = (Object.keys(lfoShapes) as Lfo["shape"][]).map((v) => ({ value: v, label: lfoShapes[v] }))
const warpKeys: WarpKey[] = ["wave", "waveFreq", "waveSpeed", "flow", "flowScale", "flowSpeed", "pointer", "pointerRadius"]

const motionDefs = {
  amount: { label: "Сила", min: 0, max: 1, step: 0.01 },
  speed: { label: "Скорость", min: 0, max: 2, step: 0.01, unit: "Гц" },
  phase: { label: "Фаза", min: 0, max: 1, step: 0.01 },
}
const lfoRate = { label: "Частота", min: 0.02, max: 4, step: 0.01, unit: "Гц" }

function targetLabel(scene: Scene, target: string) {
  const def = paramDef(target)
  if (target.startsWith("layer:")) {
    const id = target.slice(6).split(".")[0]
    const l = scene.layers.find((x) => x.id === id)
    return `${l ? "Слой " + l.char : "Удалённый слой"} · ${def?.label ?? ""}`
  }
  return def?.label ?? target
}

export function MotionTab() {
  const scene = useStore((s) => s.scene)
  const layer = useStore(selectedLayer)
  const { setScene, updateLayer } = useStore.getState()

  const setMotion = (patch: Partial<Motion>, key?: string) =>
    layer && updateLayer(layer.id, { motion: { ...layer.motion, ...patch } }, key)
  const setLfo = (i: 0 | 1, patch: Partial<Lfo>, key?: string) =>
    setScene((s) => {
      const lfo = [...s.lfo] as Scene["lfo"]
      lfo[i] = { ...lfo[i], ...patch }
      return { ...s, lfo }
    }, key)
  const others = layer ? scene.layers.filter((l) => l.id !== layer.id) : []

  return (
    <>
      <Section title="Время">
        <ParamSlider
          def={sceneParams.speed}
          value={scene.speed}
          onChange={(v) => setScene((s) => ({ ...s, speed: v }), "speed")}
        />
      </Section>

      <Section title={layer ? `Движение слоя ${layer.char}` : "Движение слоя"}>
        {layer ? (
          <>
            <Select items={motionItems} value={layer.motion.type} onValueChange={(v) => v && setMotion({ type: v as Motion["type"] })}>
              <SelectTrigger className="w-full" aria-label="Тип движения">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {motionItems.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {layer.motion.type === "orbit" && others.length > 0 && (
              <Select
                items={[{ value: "", label: "Слой ниже" }, ...others.map((o) => ({ value: o.id, label: "Вокруг " + o.char }))]}
                value={layer.motion.target ?? ""}
                onValueChange={(v) => setMotion({ target: v || undefined })}
              >
                <SelectTrigger className="w-full" aria-label="Центр орбиты">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Слой ниже</SelectItem>
                  {others.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      Вокруг {o.char}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {layer.motion.type !== "none" &&
              (["amount", "speed", "phase"] as const).map((k) => (
                <ParamSlider
                  key={k}
                  def={
                    k === "amount" && layer.motion.type === "orbit"
                      ? { ...motionDefs.amount, label: "Раскрытие орбиты", hint: "0 — транзит по прямой, 1 — круг" }
                      : motionDefs[k]
                  }
                  value={layer.motion[k]}
                  onChange={(v) => setMotion({ [k]: v }, "motion." + k + layer.id)}
                />
              ))}
          </>
        ) : (
          <Hint>Выберите слой: орбита, дрейф, маятник, дыхание или реакция на курсор.</Hint>
        )}
      </Section>

      <Section title="Ритмы">
        {([0, 1] as const).map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Ритм {i + 1}</span>
              <Select items={shapeItems} value={scene.lfo[i].shape} onValueChange={(v) => v && setLfo(i, { shape: v as Lfo["shape"] })}>
                <SelectTrigger size="sm" className="w-36" aria-label={`Форма ритма ${i + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shapeItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ParamSlider def={lfoRate} value={scene.lfo[i].rate} onChange={(v) => setLfo(i, { rate: v }, "lfo" + i)} />
          </div>
        ))}
      </Section>

      <Section title="Деформации">
        {warpKeys.map((k) => (
          <ParamSlider
            key={k}
            def={warpParams[k]}
            value={scene.warp[k]}
            target={"warp." + k}
            onChange={(v) => setScene((s) => ({ ...s, warp: { ...s.warp, [k]: v } }), "warp." + k)}
          />
        ))}
      </Section>

      <Section title={`Связи с сигналами · ${scene.routes.length}`}>
        {scene.routes.length === 0 ? (
          <Hint>
            Нажмите на значок волны рядом с любым параметром, чтобы привязать его ко времени, курсору или микрофону.
          </Hint>
        ) : (
          <ul className="flex flex-col gap-2">
            {scene.routes.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="text-muted-foreground">{signalInfo[r.source].name} → </span>
                    {targetLabel(scene, r.target)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Удалить связь"
                    onClick={() => setScene((s) => ({ ...s, routes: s.routes.filter((x) => x.id !== r.id) }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Slider
                  aria-label="Сила связи"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={[r.amount]}
                  onValueChange={(v) =>
                    setScene(
                      (s) => ({
                        ...s,
                        routes: s.routes.map((x) => (x.id === r.id ? { ...x, amount: Array.isArray(v) ? v[0] : v } : x)),
                      }),
                      "route:" + r.id,
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
