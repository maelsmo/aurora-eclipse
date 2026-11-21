import { useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SceneThumb } from "./Thumbs"
import { compileGlyph } from "@/engine/compile"
import { defaultAxes } from "@/engine/axes"
import { makeLayer, makeScene } from "@/engine/scene"
import { CAP } from "@/engine/grid"
import { useStore } from "@/state/store"

const geoRules = [
  ["Клетки", "Прописная — блок из клеток 2 × 2 (широкие — 3 × 2), клетка — 2,5 модуля, высота прописной — две клетки."],
  ["Четверти", "Клетка — квадрат или четверть круга: угол скруглён на всю сторону. Чаши и арки берут половинный радиус."],
  ["Листья и острия", "Руки E, F, K и Y — четверти, выросшие из угла клетки; острие V — две вогнутые четверти, диагональ N — две касающиеся."],
  ["Прорези", "Тонкие просветы лежат только на линиях сетки. Прорезь открывает край или останавливается в одной ширине от него."],
  ["Узлы", "Где две прорези встретились бы, они обрываются и оставляют перемычку — буква остаётся одним куском."],
  ["Полосы", "Каждая клетка помнит направление: стебли — вертикали, перекладины — горизонтали, скругления — дуги. Так рождается режим «Линии»."],
  ["Вариации", "Зазор модулей раскрывает мозаику, окончания 0 делают клетки квадратными, контур обводит силуэт."],
]

const rules = [
  ["Сетка", "Высота прописной — 5 модулей: штрих, просвет, штрих, просвет, штрих. Узлы стоят с шагом 0,5 модуля."],
  ["Пилюля", "Каждый штрих — отрезок с круглыми окончаниями. Ось «Окончания» превращает полукруг в прямой срез."],
  ["Выступ", "Горизонталь или вертикаль, упирающаяся в бок другого штриха, проходит его насквозь. Так рождаются волна E и голова A."],
  ["Вязкость", "Все вогнутые стыки скругляются одним радиусом — круговым плавным минимумом."],
  ["Просветы", "Внутренние просветы — круглые зрачки или прорези, их размер общий для алфавита."],
  ["Спутник", "Отдельный диск: нога A, хвост Q, точки Ё. Не сливается с телом, пока притяжение равно нулю."],
  ["Общие формы", "Одинаковые буквы латиницы и кириллицы строятся одной конструкцией."],
]

const W = 260,
  H = 230

function Figure({ char, set }: { char: string; set?: string }) {
  const entry = useStore((s) => s.library.sets[set && s.library.sets[set] ? set : s.library.fallback])
  const geo = entry.set.kind === "shapes"
  const g = compileGlyph(char, entry.alphabet, defaultAxes, entry.version)
  const ax = (g.box.x0 + g.box.x1) / 2
  const scene = useMemo(
    () =>
      makeScene({
        layers: [makeLayer(char, { x: ax, y: CAP / 2, color: "#C9C3EE", set: entry.set.id })],
        material: { ...makeScene().material, transparent: true },
      }),
    [char, ax, entry.set.id],
  )
  const s = Math.min(W / (g.box.x1 - g.box.x0 + 2.4), H / 7.4)
  const cx = ax,
    cy = CAP / 2
  const X = (x: number) => (x - cx) * s + W / 2
  const Y = (y: number) => H / 2 - (y - cy) * s
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return (
    <div className="relative shrink-0 rounded-lg border bg-background" style={{ width: W, height: H }}>
      <SceneThumb scene={scene} options={{ transparent: true, view: { cx, cy, scale: s * dpr } }} label={"Построение " + char} />
      <svg className="absolute inset-0" width={W} height={H} aria-hidden>
        {[0, CAP / 2, CAP].map((y) => (
          <line key={y} x1={0} x2={W} y1={Y(y)} y2={Y(y)} stroke="var(--foreground)" strokeOpacity={0.18} strokeDasharray="3 4" />
        ))}
        {geo &&
          Array.from({ length: Math.round((g.box.x1 - g.box.x0) / 2.5) + 1 }, (_, i) => g.box.x0 + i * 2.5).map((x) => (
            <line key={"c" + x} x1={X(x)} x2={X(x)} y1={Y(0)} y2={Y(CAP)} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="2 3" />
          ))}
        {geo && <rect x={X(g.box.x0)} y={Y(CAP)} width={X(g.box.x1) - X(g.box.x0)} height={Y(0) - Y(CAP)} fill="none" stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="2 3" />}
        {g.prims.map((p, i) => {
          if (p.kind === "stroke")
            return (
              <g key={i}>
                <line x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} stroke="var(--foreground)" strokeWidth={1.25} />
                <circle cx={X(p.a[0])} cy={Y(p.a[1])} r={3} fill="var(--background)" stroke="var(--foreground)" />
                <circle cx={X(p.b[0])} cy={Y(p.b[1])} r={3} fill="var(--background)" stroke="var(--foreground)" />
              </g>
            )
          if (p.kind === "dot" || p.kind === "hole")
            return <circle key={i} cx={X(p.c[0])} cy={Y(p.c[1])} r={p.r * s} fill="none" stroke="var(--foreground)" strokeDasharray={p.kind === "hole" ? "3 3" : undefined} />
          return null
        })}
      </svg>
    </div>
  )
}

function RuleBlock({ rules, figures, set }: { rules: string[][]; figures: string[]; set?: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="flex flex-row gap-3 md:flex-col">
        {figures.map((c) => (
          <Figure key={c} char={c} set={set} />
        ))}
      </div>
      <ol className="flex flex-col gap-3">
        {rules.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Система построения</DialogTitle>
          <DialogDescription>
            Каждая буква — набор модулей на сетке. Шейдер считает расстояние до них и до соседних объектов, поэтому одни и те
            же правила строят знак и его сочетания: слияние, затмение, врезку и вырезание. Два встроенных сета строятся по
            разным системам.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="strokes" className="gap-3">
          <TabsList>
            <TabsTrigger value="strokes">Основной сет</TabsTrigger>
            <TabsTrigger value="geo">Геометрия</TabsTrigger>
          </TabsList>
          <TabsContent value="strokes">
            <ScrollArea className="max-h-[64dvh]">
              <RuleBlock rules={rules} figures={["E", "A"]} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="geo">
            <ScrollArea className="max-h-[64dvh]">
              <RuleBlock rules={geoRules} figures={["E", "K"]} set="geo" />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
