import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  Grid3x3,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { GlyphRenderer, type View } from "@/engine/gpu/renderer"
import { rasterize } from "@/engine/cpu"
import { buildFrame, frameBounds, frameLayers, pickLayer, type Frame } from "@/engine/frame"
import { fitView, materialReach, sceneFrame } from "@/engine/view"
import { snap } from "@/engine/grid"
import { CAP } from "@/engine/grid"
import type { Scene } from "@/engine/scene"
import { useStore } from "@/state/store"
import { runtime, isAnimated } from "@/state/runtime"
import { MicButton } from "./MicButton"

const FAR: [number, number] = [1e4, 1e4]

function usesPointer(s: Scene) {
  return (
    s.warp.pointer !== 0 ||
    s.routes.some((r) => r.source.startsWith("pointer")) ||
    s.layers.some((l) => l.motion.type === "follow" || l.motion.type === "avoid")
  )
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: View,
  frame: Frame,
  selectedId: string | null,
  hoverId: string | null,
  grid: boolean,
  dark: boolean,
) {
  ctx.clearRect(0, 0, w, h)
  const s = view.scale
  const X = (x: number) => (x - view.cx) * s + w / 2
  const Y = (y: number) => h / 2 - (y - view.cy) * s
  const ink = dark ? "255,255,255" : "20,20,20"
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (grid && s > 6) {
    const x0 = Math.floor(view.cx - w / 2 / s),
      x1 = Math.ceil(view.cx + w / 2 / s)
    const y0 = Math.floor(view.cy - h / 2 / s),
      y1 = Math.ceil(view.cy + h / 2 / s)
    ctx.lineWidth = dpr
    for (let x = x0; x <= x1; x++) {
      ctx.strokeStyle = `rgba(${ink},${x % 5 === 0 ? 0.14 : 0.06})`
      ctx.beginPath()
      ctx.moveTo(Math.round(X(x)) + 0.5, 0)
      ctx.lineTo(Math.round(X(x)) + 0.5, h)
      ctx.stroke()
    }
    for (let y = y0; y <= y1; y++) {
      ctx.strokeStyle = `rgba(${ink},${y % 5 === 0 ? 0.14 : 0.06})`
      ctx.beginPath()
      ctx.moveTo(0, Math.round(Y(y)) + 0.5)
      ctx.lineTo(w, Math.round(Y(y)) + 0.5)
      ctx.stroke()
    }
  }
  const layers = frameLayers(frame)
  const box = (id: string | null, style: string, lw: number, metrics: boolean) => {
    const l = layers.find((x) => x.id === id)
    if (!l) return
    const g = l.glyph.box
    const pt = (gx: number, gy: number) => {
      const lx = (gx - l.ax) * l.scale,
        ly = (gy - l.ay) * l.scale
      return [X(l.x + l.cos * lx - l.sin * ly), Y(l.y + l.sin * lx + l.cos * ly)]
    }
    ctx.strokeStyle = style
    ctx.lineWidth = lw * dpr
    ctx.beginPath()
    const corners = [pt(g.x0, g.y0), pt(g.x1, g.y0), pt(g.x1, g.y1), pt(g.x0, g.y1)]
    corners.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.stroke()
    if (metrics) {
      ctx.setLineDash([4 * dpr, 4 * dpr])
      for (const y of [0, CAP / 2, CAP]) {
        const [ax, ay] = pt(g.x0 - 0.5, y),
          [bx, by] = pt(g.x1 + 0.5, y)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
  }
  if (grid) layers.forEach((l) => box(l.id, `rgba(${ink},0.18)`, 1, true))
  if (hoverId && hoverId !== selectedId) box(hoverId, `rgba(${ink},0.35)`, 1, false)
  if (selectedId) box(selectedId, "rgba(91,60,245,0.95)", 1.5, false)
}

export function StudioCanvas() {
  const host = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const cpuCanvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const zoom = useRef(40)
  const center = useRef<[number, number]>([0, 0])
  const schedule = useRef<() => void>(() => {})
  const fitRef = useRef<() => void>(() => {})
  const hover = useRef<string | null>(null)
  const drag = useRef<
    | { kind: "layer"; id: string; start: [number, number]; origin: [number, number] }
    | { kind: "pan"; start: [number, number]; origin: [number, number] }
    | null
  >(null)
  const [zoomLabel, setZoomLabel] = useState(100)
  const [backend, setBackend] = useState<"gpu" | "cpu">("gpu")
  const [fps, setFps] = useState(0)

  const playing = useStore((s) => s.playing)
  const showGrid = useStore((s) => s.showGrid)
  const snapOn = useStore((s) => s.snap)
  const pointerOn = useStore((s) => s.pointerOn)
  const set = useStore((s) => s.set)

  useLayoutEffect(() => {
    const el = host.current!
    let renderer: GlyphRenderer | null = null
    try {
      renderer = new GlyphRenderer(glCanvas.current!)
    } catch (e) {
      console.warn(e)
      renderer = null
    }
    setBackend(renderer ? "gpu" : "cpu")
    let raf = 0,
      last = performance.now(),
      alive = true,
      quality = 1,
      slow = 0,
      fast = 0,
      frames = 0,
      fpsTime = last
    const dark = () => document.documentElement.classList.contains("dark")

    let fitted = false
    const fit = () => {
      if (!el.clientWidth || !el.clientHeight) return
      fitted = true
      const st = useStore.getState()
      const f = sceneFrame(st.scene, st.alphabet, st.revision)
      const v = fitView(frameBounds(f, 1), el.clientWidth, el.clientHeight, 0.08)
      zoom.current = Math.min(v.scale, 160)
      center.current = [v.cx, v.cy]
      setZoomLabel(Math.round((zoom.current / 40) * 100))
      schedule.current()
    }
    fitRef.current = fit

    const draw = (now: number) => {
      raf = 0
      if (!alive) return
      const st = useStore.getState()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const micOn = st.mic === "on"
      const animated = st.playing && isAnimated(st.scene, st.pointerOn, micOn)
      const eff = runtime.step(st.scene, dt, st.playing, st.pointerOn)
      const pointer = st.pointerOn && runtime.pointerWorld ? runtime.pointerWorld : FAR
      const frame = buildFrame(eff, st.alphabet, st.revision, runtime.time, pointer, materialReach(eff.material))
      runtime.frame = frame
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = el.clientWidth,
        ch = el.clientHeight
      const res = renderer ? dpr * quality : Math.min(1, 520 / Math.max(cw, 1))
      const W = Math.max(1, Math.round(cw * res)),
        H = Math.max(1, Math.round(ch * res))
      const view: View = { cx: center.current[0], cy: center.current[1], scale: zoom.current * res }
      if (renderer) {
        renderer.resize(W, H)
        renderer.render(frame, eff.material, view)
      } else {
        const c = cpuCanvas.current!
        if (c.width !== W) c.width = W
        if (c.height !== H) c.height = H
        rasterize(c.getContext("2d")!, W, H, frame, eff.material, view)
      }
      const o = overlay.current!
      const OW = Math.round(cw * dpr),
        OH = Math.round(ch * dpr)
      if (o.width !== OW) o.width = OW
      if (o.height !== OH) o.height = OH
      drawOverlay(
        o.getContext("2d")!,
        OW,
        OH,
        { ...view, scale: zoom.current * dpr },
        frame,
        st.selected,
        hover.current,
        st.showGrid,
        dark(),
      )
      // Dynamic resolution: drop quality while frames are slow.
      if (animated) {
        if (dt > 0.026) slow++
        else slow = 0
        if (dt < 0.015) fast++
        else fast = 0
        if (slow > 20 && quality > 0.5) {
          quality = Math.max(0.5, quality - 0.25)
          slow = 0
        }
        if (fast > 120 && quality < 1) {
          quality = Math.min(1, quality + 0.25)
          fast = 0
        }
      }
      frames++
      if (now - fpsTime > 500) {
        setFps(Math.round((frames * 1000) / (now - fpsTime)))
        frames = 0
        fpsTime = now
      }
      if (animated || drag.current || runtime.keepAlive) request()
    }
    const request = () => {
      if (!raf && alive) raf = requestAnimationFrame(draw)
    }
    schedule.current = () => {
      last = performance.now() - 16
      request()
    }
    runtime.kick = () => schedule.current()
    const unsub = useStore.subscribe((s, p) => {
      if (
        s.scene !== p.scene ||
        s.revision !== p.revision ||
        s.selected !== p.selected ||
        s.showGrid !== p.showGrid ||
        s.playing !== p.playing ||
        s.pointerOn !== p.pointerOn ||
        s.mic !== p.mic
      )
        schedule.current()
    })
    const ro = new ResizeObserver(() => {
      if (!fitted) fit()
      schedule.current()
    })
    ro.observe(el)
    fit()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      unsub()
      ro.disconnect()
      renderer?.dispose()
    }
  }, [])

  // Fit once when a different composition is loaded (preset, collection, variation).
  const layerKey = useStore((s) => s.scene.layers.length + ":" + (s.scene.layers[0]?.id ?? ""))
  const lastKey = useRef(layerKey)
  useEffect(() => {
    const st = useStore.getState()
    const prevIds = lastKey.current
    lastKey.current = layerKey
    if (prevIds.split(":")[1] !== layerKey.split(":")[1] && !drag.current && st.scene.layers.length) fitRef.current()
  }, [layerKey])

  function toWorld(e: { clientX: number; clientY: number }): [number, number] {
    const r = host.current!.getBoundingClientRect()
    const x = (e.clientX - r.left - r.width / 2) / zoom.current + center.current[0]
    const y = -(e.clientY - r.top - r.height / 2) / zoom.current + center.current[1]
    return [x, y]
  }

  function onPointerDown(e: React.PointerEvent) {
    host.current!.focus()
    const st = useStore.getState()
    const w = toWorld(e)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    runtime.pointerDown = true
    const id = runtime.frame ? pickLayer(runtime.frame, w[0], w[1], 0.15) : null
    if (id && e.button === 0 && !e.shiftKey) {
      const layer = st.scene.layers.find((l) => l.id === id)
      if (layer) {
        st.select(id)
        drag.current = { kind: "layer", id, start: w, origin: [layer.x, layer.y] }
        return
      }
    }
    if (!id) st.select(null)
    drag.current = { kind: "pan", start: [e.clientX, e.clientY], origin: [...center.current] }
  }

  function onPointerMove(e: React.PointerEvent) {
    const w = toWorld(e)
    const r = host.current!.getBoundingClientRect()
    runtime.setPointer(w, [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2])
    const st = useStore.getState()
    const d = drag.current
    if (d?.kind === "layer") {
      let x = d.origin[0] + w[0] - d.start[0],
        y = d.origin[1] + w[1] - d.start[1]
      if (st.snap && !e.altKey) {
        x = snap(x, 0.25)
        y = snap(y, 0.25)
      }
      st.updateLayer(d.id, { x, y }, "drag:" + d.id)
    } else if (d?.kind === "pan") {
      center.current = [
        d.origin[0] - (e.clientX - d.start[0]) / zoom.current,
        d.origin[1] + (e.clientY - d.start[1]) / zoom.current,
      ]
      schedule.current()
    } else {
      const id = runtime.frame ? pickLayer(runtime.frame, w[0], w[1], 0.15) : null
      if (id !== hover.current) {
        hover.current = id
        schedule.current()
      }
      if (st.pointerOn && usesPointer(st.scene)) schedule.current()
    }
  }

  function onPointerUp() {
    drag.current = null
    runtime.pointerDown = false
    schedule.current()
  }

  function zoomBy(f: number, at?: [number, number]) {
    const next = Math.max(4, Math.min(400, zoom.current * f))
    if (at) {
      const k = 1 - zoom.current / next
      center.current = [
        center.current[0] + (at[0] - center.current[0]) * k,
        center.current[1] + (at[1] - center.current[1]) * k,
      ]
    }
    zoom.current = next
    setZoomLabel(Math.round((next / 40) * 100))
    schedule.current()
  }

  useEffect(() => {
    const el = host.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), toWorld(e))
      else {
        center.current = [
          center.current[0] + e.deltaX / zoom.current,
          center.current[1] - e.deltaY / zoom.current,
        ]
        schedule.current()
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    const st = useStore.getState()
    const sel = st.scene.layers.find((l) => l.id === st.selected)
    const step = e.shiftKey ? 0.1 : 0.5
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (sel && moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      st.updateLayer(sel.id, { x: sel.x + dx, y: sel.y + dy }, "nudge:" + sel.id)
    } else if (sel && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault()
      st.setScene((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== sel.id) }))
      st.select(null)
    } else if (e.key === "Escape") st.select(null)
  }

  const bg = useStore((s) => (s.scene.material.transparent ? null : s.scene.material.background))

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30">
      <div
        ref={host}
        tabIndex={0}
        role="application"
        aria-label="Холст композиции. Перетаскивайте буквы, стрелки сдвигают выбранную букву, Delete удаляет её."
        className="relative min-h-0 flex-1 cursor-crosshair touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={
          bg
            ? { background: bg }
            : {
                backgroundImage:
                  "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
                backgroundSize: "16px 16px",
              }
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          runtime.setPointer(null, [0, 0])
          if (hover.current !== null) {
            hover.current = null
            schedule.current()
          }
        }}
        onDoubleClick={(e) => {
          const w = toWorld(e)
          if (runtime.frame && !pickLayer(runtime.frame, w[0], w[1], 0.15)) fitRef.current()
        }}
        onKeyDown={onKeyDown}
      >
        <canvas ref={glCanvas} data-studio-canvas className="absolute inset-0 size-full" hidden={backend !== "gpu"} />
        <canvas ref={cpuCanvas} data-studio-canvas-cpu className="absolute inset-0 size-full [image-rendering:auto]" hidden={backend !== "cpu"} />
        <canvas ref={overlay} className="pointer-events-none absolute inset-0 size-full" />
      </div>

      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-xs backdrop-blur">
          <ButtonGroup>
            <Button variant="ghost" size="icon-sm" aria-label="Уменьшить" onClick={() => zoomBy(1 / 1.25)}>
              <Minus />
            </Button>
            <Button variant="ghost" size="sm" className="w-14 tabular-nums" aria-label="Масштаб 100%" onClick={() => zoomBy(40 / zoom.current)}>
              {zoomLabel}%
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Увеличить" onClick={() => zoomBy(1.25)}>
              <Plus />
            </Button>
          </ButtonGroup>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Вписать композицию" onClick={() => fitRef.current()} />}>
              <Maximize2 />
            </TooltipTrigger>
            <TooltipContent>Вписать композицию (двойной клик по пустому месту)</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Tooltip>
            <TooltipTrigger render={<Toggle size="sm" pressed={showGrid} onPressedChange={(v) => set({ showGrid: v })} aria-label="Сетка и метрики" />}>
              <Grid3x3 />
            </TooltipTrigger>
            <TooltipContent>Сетка модулей и метрики букв</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Toggle size="sm" pressed={snapOn} onPressedChange={(v) => set({ snap: v })} aria-label="Привязка к сетке" />}>
              <Magnet />
            </TooltipTrigger>
            <TooltipContent>Привязка к сетке 0,25 m (Alt — без привязки)</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={playing ? "Пауза" : "Воспроизвести"} onClick={() => set({ playing: !playing })} />}>
              {playing ? <Pause /> : <Play />}
            </TooltipTrigger>
            <TooltipContent>{playing ? "Остановить время" : "Запустить время"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger render={<Toggle size="sm" pressed={pointerOn} onPressedChange={(v) => set({ pointerOn: v })} aria-label="Реакция на курсор" />}>
              <MousePointer2 />
            </TooltipTrigger>
            <TooltipContent>Курсор как сигнал среды</TooltipContent>
          </Tooltip>
          <MicButton />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1.5">
        <Badge variant="outline" className="bg-background/80 backdrop-blur">
          {backend === "gpu" ? "WebGL2" : "CPU"}
        </Badge>
        {import.meta.env.DEV && (
          <Badge variant="outline" className="bg-background/80 tabular-nums backdrop-blur">
            {fps} fps
          </Badge>
        )}
      </div>
      {backend === "cpu" && (
        <Alert className="absolute right-2 bottom-2 max-w-80 bg-background/95">
          <AlertTitle>WebGL2 недоступен</AlertTitle>
          <AlertDescription>
            Превью считается на процессоре с пониженным разрешением. Материалы показаны упрощённо, экспорт SVG работает полностью.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
