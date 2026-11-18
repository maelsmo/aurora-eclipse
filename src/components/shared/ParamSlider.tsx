import { useEffect, useId, useRef, useState } from "react"
import { AudioWaveform, Plus, Trash2 } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { readParam, type ParamDef } from "@/engine/params"
import { signalIds, uid, type SignalId } from "@/engine/scene"
import { signalInfo } from "@/engine/signals"
import { useStore } from "@/state/store"
import { useShallow } from "zustand/react/shallow"
import { runtime } from "@/state/runtime"
import { cn } from "@/lib/utils"

export function formatValue(v: number, def: ParamDef) {
  const digits = def.step >= 1 ? 0 : def.step >= 0.1 ? 1 : 2
  return v.toFixed(digits).replace("-", "−") + (def.unit ? (def.unit === "°" ? "°" : " " + def.unit) : "")
}

const signalItems = signalIds.map((id) => ({ value: id, label: signalInfo[id].name }))
const groups = ["Время", "Курсор", "Микрофон"]

/** Modulated value of a target, polled from the runtime while routes exist. */
function useLiveValue(target: string | undefined, active: boolean) {
  const [v, setV] = useState<number | undefined>()
  useEffect(() => {
    if (!target || !active) {
      setV(undefined)
      return
    }
    let last = 0
    return runtime.subscribe(() => {
      const now = performance.now()
      if (now - last < 66 || !runtime.effective) return
      last = now
      setV(readParam(runtime.effective, target))
    })
  }, [target, active])
  return v
}

export function RouteEditor({ target, label }: { target: string; label: string }) {
  const routes = useStore(useShallow((s) => s.scene.routes.filter((r) => r.target === target)))
  const setScene = useStore((s) => s.setScene)
  const update = (id: string, patch: Partial<{ source: SignalId; amount: number }>, key?: string) =>
    setScene((s) => ({ ...s, routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), key)
  return (
    <div className="flex flex-col gap-3">
      <PopoverHeader>
        <PopoverTitle>{label}: модуляция</PopoverTitle>
        <PopoverDescription>Сигнал среды сдвигает значение в пределах силы.</PopoverDescription>
      </PopoverHeader>
      {routes.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <Select items={signalItems} value={r.source} onValueChange={(v) => v && update(r.id, { source: v as SignalId })}>
              <SelectTrigger size="sm" className="flex-1" aria-label="Сигнал">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel>{g}</SelectLabel>
                    {signalIds
                      .filter((id) => signalInfo[id].group === g)
                      .map((id) => (
                        <SelectItem key={id} value={id}>
                          {signalInfo[id].name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить связь"
              onClick={() => setScene((s) => ({ ...s, routes: s.routes.filter((x) => x.id !== r.id) }))}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground">Сила</span>
            <Slider
              aria-label="Сила модуляции"
              min={-1}
              max={1}
              step={0.01}
              value={[r.amount]}
              onValueChange={(v) => update(r.id, { amount: Array.isArray(v) ? v[0] : v }, "route:" + r.id)}
            />
            <span className="w-10 text-right text-xs tabular-nums">{r.amount.toFixed(2)}</span>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setScene((s) => ({ ...s, routes: [...s.routes, { id: uid(), source: "lfo1", target, amount: 0.25 }] }))
        }
      >
        <Plus data-icon="inline-start" />
        Добавить сигнал
      </Button>
    </div>
  )
}

export function ParamSlider({
  label,
  def,
  value,
  onChange,
  target,
  className,
  disabled,
}: {
  label?: string
  def: ParamDef
  value: number
  onChange: (v: number) => void
  target?: string
  className?: string
  disabled?: boolean
}) {
  const id = useId()
  const routed = useStore((s) => (target ? s.scene.routes.some((r) => r.target === target) : false))
  const live = useLiveValue(target, routed)
  const track = useRef<HTMLDivElement>(null)
  const name = label ?? def.label
  const pct = live === undefined ? null : ((live - def.min) / (def.max - def.min)) * 100
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-h-6 items-center gap-1">
        {def.hint ? (
          <Tooltip>
            <TooltipTrigger render={<span id={id} className="text-sm text-foreground/80 decoration-dotted underline-offset-4 hover:underline" />}>
              {name}
            </TooltipTrigger>
            <TooltipContent className="max-w-56">{def.hint}</TooltipContent>
          </Tooltip>
        ) : (
          <span id={id} className="text-sm text-foreground/80">
            {name}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatValue(value, def)}</span>
        {target && (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant={routed ? "secondary" : "ghost"}
                  size="icon-xs"
                  aria-label={"Привязать «" + name + "» к сигналу"}
                />
              }
            >
              <AudioWaveform />
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <RouteEditor target={target} label={name} />
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="relative" ref={track}>
        <Slider
          aria-labelledby={id}
          min={def.min}
          max={def.max}
          step={def.step}
          value={[value]}
          disabled={disabled}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        />
        {pct !== null && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70"
            style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        )}
      </div>
    </div>
  )
}
