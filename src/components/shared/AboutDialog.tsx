import { useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SceneThumb } from "./Thumbs"
import { compileGlyph } from "@/engine/compile"
import { defaultAxes } from "@/engine/axes"
import { makeLayer, makeScene } from "@/engine/scene"
import { CAP } from "@/engine/grid"
import { useStore } from "@/state/store"

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

function Figure({ char }: { char: string }) {
  const entry = useStore((s) => s.library.sets[s.library.fallback])
  const g = compileGlyph(char, entry.alphabet, defaultAxes, entry.version)
  const ax = (g.box.x0 + g.box.x1) / 2
  const scene = useMemo(
    () =>
      makeScene({
        layers: [makeLayer(char, { x: ax, y: CAP / 2, color: "#C9C3EE" })],
        material: { ...makeScene().material, transparent: true },
      }),
    [char, ax],
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

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Система построения</DialogTitle>
          <DialogDescription>
            Каждая буква — набор модулей на сетке. Шейдер считает расстояние до них и до соседних букв, поэтому одни и те же
            правила строят знак и его сочетания: слияние, затмение, врезку и вырезание.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70dvh]">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex flex-row gap-3 md:flex-col">
              <Figure char="E" />
              <Figure char="A" />
            </div>
            <ol className="flex flex-col gap-3">
              {rules.map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-sm text-muted-foreground">{text}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
