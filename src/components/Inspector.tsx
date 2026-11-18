import { useState } from "react"
import {
  SlidersHorizontal,
  RotateCcw,
  Shuffle,
  ArrowLeftRight,
  ChevronDown,
  Blend,
  Layers,
  Scissors,
  Combine,
  CircleSlash,
  Check,
  Pipette,
} from "lucide-react"
import { Button } from "./ui/button"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Slider } from "./ui/slider"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectItem,
  SelectGroup,
  SelectValue,
} from "./ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group"
import { Separator } from "./ui/separator"
import { latin, cyrillic } from "@/engine/alphabet"
import { initial, modeNames, modes, palette, type Scene } from "@/engine/model"
import { GlyphIcon } from "./Specimen"

export const modeIcons = {
  eclipse: Blend,
  fusion: Combine,
  cut: Scissors,
  intersection: Layers,
  xor: CircleSlash,
}
const colorNames = ["Фиолетовый", "Графит", "Коралл", "Зелёный", "Синий"]
type Props = {
  scene: Scene
  update: (s: Partial<Scene>) => void
  reset: () => void
}
export function Inspector({ scene, update, reset }: Props) {
  const [slot, setSlot] = useState<"a" | "b" | null>(null),
    [script, setScript] = useState("latin")
  const solo = scene.b === "—",
    Icon = modeIcons[scene.mode]
  const open = (side: "a" | "b") => {
    setScript(cyrillic.includes(scene[side]) ? "cyr" : "latin")
    setSlot(side)
  }
  const pick = (letter: string) => {
    if (slot) update({ [slot]: letter })
    setSlot(null)
  }
  function shuffle() {
    const alphabet = latin + cyrillic
    const next = () => alphabet[Math.floor(Math.random() * alphabet.length)]
    let a = next(),
      b = next()
    if (a === scene.a && b === scene.b)
      a = alphabet[(alphabet.indexOf(a) + 1) % alphabet.length]
    update({ a, b, dx: 0, dy: 0 })
  }
  return (
    <aside className="panel inspector">
      <div className="panel-head">
        <h2>
          <SlidersHorizontal />
          Параметры
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Сбросить параметры"
          title="Сбросить параметры"
          onClick={reset}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="inspector-body">
        <div className="section-line">
          <h3>Пара глифов</h3>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Случайная пара"
            aria-label="Случайная пара"
            onClick={shuffle}
          >
            <Shuffle />
          </Button>
        </div>
        <div className="pair-row">
          <Button
            className="glyph-button"
            variant="outline"
            aria-label={"Первый глиф " + scene.a}
            onClick={() => open("a")}
          >
            <b>{scene.a}</b>
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={solo}
            aria-label="Поменять глифы местами"
            title="Поменять местами"
            onClick={() => update({ a: scene.b, b: scene.a, dy: -scene.dy })}
          >
            <ArrowLeftRight />
          </Button>
          <Button
            className="glyph-button"
            variant="outline"
            aria-label={"Второй глиф " + scene.b}
            onClick={() => open("b")}
          >
            <b>{scene.b}</b>
            <ChevronDown />
          </Button>
        </div>
        <Separator />
        <FieldGroup className="control-group">
          <Field className="mode-field">
            <FieldLabel htmlFor="blend-mode">Взаимодействие</FieldLabel>
            <Select
              value={scene.mode}
              disabled={solo}
              onValueChange={(v) => v && update({ mode: v })}
            >
              <SelectTrigger id="blend-mode" className="mode-trigger">
                <SelectValue>
                  <Icon />
                  {modeNames[scene.mode]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {modes.map((m) => {
                    const I = modeIcons[m]
                    return (
                      <SelectItem key={m} value={m}>
                        <I />
                        {modeNames[m]}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {(
            [
              ["proximity", "Сближение"],
              ["softness", "Смягчение"],
              ["weight", "Толщина"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} className="range-field">
              <div className="range-label">
                <span id={key}>{label}</span>
                <output>
                  {scene[key]}
                  <small>%</small>
                </output>
              </div>
              <Slider
                aria-labelledby={key}
                value={[scene[key]]}
                disabled={solo && key === "proximity"}
                onValueChange={(v) =>
                  update({ [key]: Array.isArray(v) ? v[0] : v })
                }
              />
            </Field>
          ))}
        </FieldGroup>
        <Separator />
        <div className="section-line">
          <h3>Цвет глифов</h3>
          <span className="hex">{scene.color}</span>
        </div>
        <div className="swatch-row">
          <ToggleGroup
            spacing={2}
            value={[scene.color]}
            aria-label="Цвет глифов"
            onValueChange={(v) => v[0] && update({ color: v[0] })}
          >
            {palette.map((color, i) => (
              <ToggleGroupItem
                className="swatch"
                value={color}
                key={color}
                title={colorNames[i]}
                aria-label={colorNames[i]}
              >
                <span style={{ background: color }}>
                  {scene.color === color && <Check />}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label className="custom-color" title="Свой цвет">
            <Pipette />
            <input
              type="color"
              aria-label="Свой цвет"
              value={scene.color || initial.color}
              onChange={(e) => update({ color: e.target.value.toUpperCase() })}
            />
          </label>
        </div>
      </div>
      <Dialog open={slot !== null} onOpenChange={(v) => !v && setSlot(null)}>
        <DialogContent className="glyph-dialog">
          <DialogHeader>
            <DialogTitle>{slot === "a" ? "Первый" : "Второй"} глиф</DialogTitle>
            <DialogDescription>
              Выберите форму из алфавита Aurora Eclipse.
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            value={[script]}
            variant="outline"
            spacing={0}
            onValueChange={(v) => v[0] && setScript(v[0])}
          >
            <ToggleGroupItem value="latin">Латиница</ToggleGroupItem>
            <ToggleGroupItem value="cyr">Кириллица</ToggleGroupItem>
          </ToggleGroup>
          <div className="alphabet">
            {(script === "latin" ? latin : cyrillic).split("").map((l) => (
              <button
                key={l}
                aria-label={"Выбрать " + l}
                className={slot && scene[slot] === l ? "chosen" : ""}
                onClick={() => pick(l)}
              >
                <GlyphIcon letter={l} />
                <span>{l}</span>
              </button>
            ))}
          </div>
          {slot === "b" && (
            <Button variant="outline" onClick={() => pick("—")}>
              Оставить один глиф
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  )
}
