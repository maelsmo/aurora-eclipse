import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from "react"
import {
  Focus,
  Grid2X2,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Play,
  Pause,
  MousePointer2,
} from "lucide-react"
import { Button } from "./ui/button"
import { Switch } from "./ui/switch"
import { openRenderer, rasterize } from "@/engine/render"
import {
  clamp,
  placement,
  viewSize,
  still,
  type Motion,
  type Scene,
} from "@/engine/model"

export type Frame = { motion: Motion; aspect: number; zoom: number }
type Props = {
  scene: Scene
  update: (v: Partial<Scene>) => void
  handle: RefObject<(() => Frame) | null>
  resetVersion: number
}
function guides(
  canvas: HTMLCanvasElement,
  s: Scene,
  m: Motion,
  zoom: number,
  dpr: number,
) {
  const ctx = canvas.getContext("2d")!,
    { width: w, height: h } = canvas
  const { scale } = viewSize(w, h, zoom),
    shift = placement(s, m)
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(scale, scale)
  for (const side of s.b === "—" ? [-1] : [-1, 1]) {
    const x = -48 + (side * shift.x) / 2,
      y = -50 + (side * shift.y) / 2
    ctx.beginPath()
    for (let i = 0; i <= 100; i += 10) {
      ctx.moveTo(x + i, y)
      ctx.lineTo(x + i, y + 100)
      ctx.moveTo(x, y + i)
      ctx.lineTo(x + 100, y + i)
    }
    ctx.lineWidth = (0.65 * dpr) / scale
    ctx.strokeStyle = "rgba(44,33,64,.25)"
    ctx.stroke()
    ctx.strokeStyle = "rgba(44,33,64,.65)"
    ctx.strokeRect(x, y, 100, 100)
  }
  ctx.restore()
}
export function StudioCanvas({ scene, update, handle, resetVersion }: Props) {
  const panel = useRef<HTMLElement>(null),
    surface = useRef<HTMLDivElement>(null)
  const gpu = useRef<HTMLCanvasElement>(null),
    cpu = useRef<HTMLCanvasElement>(null),
    grid = useRef<HTMLCanvasElement>(null)
  const motion = useRef<Motion>({ ...still }),
    invalidate = useRef<() => void>(() => {})
  const drag = useRef<{
    x: number
    y: number
    dx: number
    dy: number
    sign: number
  } | null>(null)
  const [construction, setConstruction] = useState(false),
    [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1),
    [full, setFull] = useState(false),
    [backend, setBackend] = useState("WebGL")
  const current = useRef({ scene, zoom, playing, construction })
  useLayoutEffect(() => {
    current.current = { scene, zoom, playing, construction }
    invalidate.current()
  }, [scene, zoom, playing, construction])
  useLayoutEffect(() => {
    motion.current = { ...still }
    setPlaying(false)
    setZoom(1)
    invalidate.current()
  }, [resetVersion])
  useLayoutEffect(() => {
    const host = surface.current!,
      target = gpu.current!,
      fallback = cpu.current!,
      overlay = grid.current!
    let renderer: ReturnType<typeof openRenderer> = null
    let frame = 0,
      last = 0,
      alive = true
    function connect() {
      try {
        renderer = openRenderer(target)
      } catch {
        renderer = null
      }
      fallback.hidden = !!renderer
      target.hidden = !renderer
      setBackend(renderer ? "WebGL" : "CPU")
    }
    function schedule() {
      if (alive && !frame) frame = requestAnimationFrame(draw)
    }
    function draw(now: number) {
      frame = 0
      const {
        scene: s,
        zoom: z,
        playing: run,
        construction: show,
      } = current.current
      const ratio = renderer
        ? Math.min(window.devicePixelRatio || 1, 2)
        : Math.min(1, 720 / Math.max(1, host.clientWidth))
      const w = Math.max(1, Math.round(host.clientWidth * ratio)),
        h = Math.max(1, Math.round(host.clientHeight * ratio))
      for (const c of [renderer ? target : fallback, overlay])
        if (c.width !== w || c.height !== h) {
          c.width = w
          c.height = h
        }
      if (run && last)
        motion.current.time += Math.min((now - last) / 1000, 0.08) * 0.95
      last = run ? now : 0
      if (renderer) renderer.draw(s, motion.current, z)
      else rasterize(fallback, s, motion.current, z)
      overlay.hidden = !show
      if (show) guides(overlay, s, motion.current, z, ratio)
      if (run) schedule()
    }
    function lost(e: Event) {
      e.preventDefault()
      renderer = null
      target.hidden = true
      fallback.hidden = false
      setBackend("CPU")
      schedule()
    }
    function restored() {
      connect()
      schedule()
    }
    connect()
    invalidate.current = schedule
    const ro = new ResizeObserver(schedule)
    ro.observe(host)
    handle.current = () => ({
      motion: { ...motion.current },
      aspect: host.clientWidth / host.clientHeight,
      zoom: current.current.zoom,
    })
    target.addEventListener("webglcontextlost", lost)
    target.addEventListener("webglcontextrestored", restored)
    schedule()
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      ro.disconnect()
      renderer?.dispose()
      target.removeEventListener("webglcontextlost", lost)
      target.removeEventListener("webglcontextrestored", restored)
      handle.current = null
    }
  }, [handle])
  useEffect(() => {
    function sync() {
      setFull(document.fullscreenElement === panel.current)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setFull(false)
    }
    document.addEventListener("fullscreenchange", sync)
    window.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      window.removeEventListener("keydown", escape)
    }
  }, [])
  function toggleFull() {
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen()
      setFull(false)
    } else {
      setFull(true)
      void panel.current?.requestFullscreen?.().catch(() => {})
    }
  }
  const pair = scene.b !== "—"
  return (
    <section
      className={"panel preview-panel" + (full ? " expanded" : "")}
      ref={panel}
      aria-label="Рабочий холст"
    >
      <div className="panel-head">
        <h2>
          <Focus />
          Холст
        </h2>
        <div className="head-tools">
          <span className="backend">
            <i />
            {backend}
          </span>
          <span className="tool-divider" />
          <Button
            variant={construction ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Сетка построения"
            aria-pressed={construction}
            title="Сетка построения"
            onClick={() => setConstruction(!construction)}
          >
            <Grid2X2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={full ? "Свернуть холст" : "Развернуть холст"}
            title={full ? "Свернуть холст" : "Развернуть холст"}
            onClick={toggleFull}
          >
            {full ? <Minimize /> : <Maximize />}
          </Button>
        </div>
      </div>
      <div
        className="artboard"
        style={{ "--ink": scene.color } as CSSProperties}
        ref={surface}
        tabIndex={0}
        role="group"
        aria-label="Композиция глифов. Перетаскивайте буквы или используйте стрелки для смещения."
        onKeyDown={(e) => {
          if (
            !pair ||
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          )
            return
          e.preventDefault()
          const n = e.shiftKey ? 10 : 2
          update({
            dx: clamp(
              scene.dx +
                (e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0),
              -78,
              78,
            ),
            dy: clamp(
              scene.dy +
                (e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0),
              -70,
              70,
            ),
          })
        }}
        onPointerDown={(e) => {
          if (!pair || e.button !== 0) return
          const r = e.currentTarget.getBoundingClientRect()
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            dx: scene.dx,
            dy: scene.dy,
            sign: e.clientX < r.left + r.width / 2 ? -1 : 1,
          }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            d = drag.current
          if (d) {
            const { scale } = viewSize(r.width, r.height, zoom)
            update({
              dx: clamp(
                d.dx + ((e.clientX - d.x) * d.sign * 2) / scale,
                -78,
                78,
              ),
              dy: clamp(
                d.dy + ((e.clientY - d.y) * d.sign * 2) / scale,
                -70,
                70,
              ),
            })
          } else if (scene.reactive) {
            motion.current.x = clamp(
              (2 * (e.clientX - r.left)) / r.width - 1,
              -1,
              1,
            )
            motion.current.y = clamp(
              (2 * (e.clientY - r.top)) / r.height - 1,
              -1,
              1,
            )
            invalidate.current()
          }
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onLostPointerCapture={() => {
          drag.current = null
        }}
        onPointerLeave={() => {
          if (!drag.current) {
            motion.current.x = 0
            motion.current.y = 0
            invalidate.current()
          }
        }}
      >
        <canvas
          ref={gpu}
          aria-label={"Глифы " + scene.a + (pair ? " и " + scene.b : "")}
        />
        <canvas ref={cpu} hidden />
        <canvas className="guides" ref={grid} hidden />
        <div className="registers" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="canvas-caption">
          <span>
            {scene.a}
            {pair ? " × " + scene.b : ""}
          </span>
          <span>{construction ? "10 × 10 u" : "SDF / 2D"}</span>
        </div>
      </div>
      <div className="canvas-bar">
        <div className="motion-tools">
          <Button
            size="sm"
            variant={playing ? "secondary" : "outline"}
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? (
              <Pause data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {playing ? "Пауза" : "Анимация"}
          </Button>
          <span className="tool-divider" />
          <label
            className="pointer-label"
            title="Перемещайте курсор над холстом"
          >
            <MousePointer2 />
            Курсор{" "}
            <Switch
              size="sm"
              aria-label="Реакция на курсор"
              checked={scene.reactive}
              onCheckedChange={(reactive) => update({ reactive })}
            />
          </label>
        </div>
        <div className="zoom-controls">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Уменьшить масштаб"
            disabled={zoom <= 0.5}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <Minus />
          </Button>
          <button
            className="zoom-value"
            title="Сбросить масштаб"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Увеличить масштаб"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </section>
  )
}
