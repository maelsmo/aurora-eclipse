import { useEffect, useState } from "react"
import { Mic, MicOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStore } from "@/state/store"
import { runtime } from "@/state/runtime"

const messages = {
  denied: "Доступ к микрофону запрещён. Разрешите его в настройках сайта и попробуйте снова.",
  error: "Не удалось открыть микрофон. Проверьте, что он подключён и не занят другим приложением.",
  unsupported: "Этот браузер не даёт доступ к микрофону.",
} as const

export function MicButton() {
  const mic = useStore((s) => s.mic)
  const set = useStore((s) => s.set)
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (mic !== "on") {
      setLevel(0)
      return
    }
    let last = 0
    return runtime.subscribe(() => {
      const now = performance.now()
      if (now - last < 60) return
      last = now
      setLevel(runtime.mic.level)
    })
  }, [mic])

  useEffect(() => () => runtime.mic.stop(), [])

  async function toggle() {
    if (mic === "on") {
      runtime.mic.stop()
      set({ mic: "off" })
      return
    }
    set({ mic: "requesting" })
    const state = await runtime.mic.start()
    set({ mic: state })
    if (state === "on") toast.success("Микрофон включён. Звук анализируется только в браузере и не записывается.")
    else toast.error(messages[state as keyof typeof messages] ?? messages.error)
  }

  const on = mic === "on"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={on ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={on}
            aria-label={on ? "Выключить микрофон" : "Включить микрофон"}
            disabled={mic === "requesting"}
            onClick={toggle}
            className="relative overflow-hidden"
          />
        }
      >
        {on ? <Mic /> : <MicOff />}
        {on && (
          <span
            aria-hidden
            className="absolute inset-x-1 bottom-0.5 h-0.5 origin-left rounded-full bg-primary transition-transform duration-75"
            style={{ transform: `scaleX(${Math.max(0.04, level)})` }}
          />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {on ? "Микрофон: громкость и частоты доступны как сигналы" : "Микрофон как сигнал среды"}
      </TooltipContent>
    </Tooltip>
  )
}
