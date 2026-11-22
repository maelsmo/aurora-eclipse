import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Frame as FrameIcon, Grid3x3, Magnet, Maximize2, Minus, MousePointer2, Pause, Play, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { GlyphRenderer, type View } from "@/engine/gpu/renderer"
import { rasterize } from "@/engine/cpu"
import { buildFrame, frameBounds, frameLayers, layerToWorld, type Frame } from "@/engine/frame"
import { fitView, sceneFrame } from "@/engine/view"
import { CAP, snap } from "@/engine/grid"
import { childrenOf, parentXf, xfApply, xfInvert, type Layer, type Scene } from "@/engine/scene"
import type { Vec } from "@/engine/types"
import { selectedIds, useStore } from "@/state/store"
import { runtime, isAnimated } from "@/state/runtime"
import { MicButton } from "./MicButton"
import { selectionRoots } from "./actions"
import {
  captureStart,
  clickTarget,
  drillTarget,
  handlePoints,
  moveBy,
  nodeBounds,
  pickLeaf,
  resizeShape,
  rotateAround,
  scaleAround,
  selectionGizmo,
  type Gizmo,
  type Handle,
  type NodeStart,
} from "./gizmo"

const FAR: [number, number] = [1e4, 1e4]
const ACCENT = "91,60,245"

function usesPointer(s: Scene) {
  return (
    s.warp.pointer !== 0 ||
    s.routes.some((r) => r.source.startsWith("pointer")) ||
    s.layers.some((l) => l.motion.type === "follow" || l.motion.type === "avoid")
  )
}

type Overlay = {
  view: View
  frame: Frame
  layers: Layer[]
  gizmo: Gizmo | null
  hover: string | null
  marquee: [Vec, Vec] | null
  grid: boolean
  dark: boolean
  artboard: Scene["artboard"]
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, o: Overlay) {
  ctx.clearRect(0, 0, w, h)
  const { view } = o
  const s = view.scale
  const X = (x: number) => (x - view.cx) * s + w / 2
  const Y = (y: number) => h / 2 - (y - view.cy) * s
  const ink = o.dark ? "255,255,255" : "20,20,20"
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  // Artboard: dim what falls outside the frame.
  if (o.artboard.enabled) {
    const a = o.artboard
    const x0 = X(a.x - a.w / 2),
      x1 = X(a.x + a.w / 2),
      y0 = Y(a.y + a.h / 2),
      y1 = Y(a.y - a.h / 2)
    ctx.fillStyle = o.dark ? "rgba(0,0,0,0.45)" : "rgba(20,20,20,0.18)"
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.rect(x0, y0, x1 - x0, y1 - y0)
    ctx.fill("evenodd")
    ctx.strokeStyle = `rgba(${ink},0.55)`
    ctx.lineWidth = dpr
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0))
    ctx.fillStyle = `rgba(${ink},0.6)`
    ctx.font = `${11 * dpr}px system-ui, sans-serif`
    ctx.fillText(`${+a.w.toFixed(2)} × ${+a.h.toFixed(2)} m`, x0, y0 - 6 * dpr)
  }

  if (o.grid && s > 6) {
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
    // Letter metrics.
    ctx.setLineDash([4 * dpr, 4 * dpr])
    ctx.strokeStyle = `rgba(${ink},0.18)`
    for (const l of frameLayers(o.frame)) {
      if (l.glyph.anchor) continue
      const g = l.glyph.box
      for (const y of [0, CAP / 2, CAP]) {
        const [ax, ay] = layerToWorld(l, g.x0 - 0.5, y),
          [bx, by] = layerToWorld(l, g.x1 + 0.5, y)
        ctx.beginPath()
        ctx.moveTo(X(ax), Y(ay))
        ctx.lineTo(X(bx), Y(by))
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }

  const quad = (q: Vec[], style: string, lw: number) => {
    ctx.strokeStyle = style
    ctx.lineWidth = lw * dpr
    ctx.beginPath()
    q.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
    ctx.closePath()
    ctx.stroke()
  }

  if (o.hover && !o.gizmo?.ids.includes(o.hover)) {
    const b = nodeBounds(o.frame, o.layers, o.hover)
    if (b) quad([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], `rgba(${ACCENT},0.45)`, 1)
  }
  // Outlines of every selected node when several are selected.
  if (o.gizmo && o.gizmo.ids.length > 1)
    for (const id of o.gizmo.ids) {
      const b = nodeBounds(o.frame, o.layers, id)
      if (b) quad([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], `rgba(${ACCENT},0.5)`, 1)
    }
  if (o.gizmo) {
    quad(o.gizmo.quad, `rgba(${ACCENT},0.95)`, 1.5)
    const hs = handlePoints(o.gizmo, dpr / s)
    const top = hs.find((x) => x.h === "rotate")!
    const [c, d] = [o.gizmo.quad[2], o.gizmo.quad[3]]
    ctx.strokeStyle = `rgba(${ACCENT},0.7)`
    ctx.lineWidth = dpr
    ctx.beginPath()
    ctx.moveTo(X((c[0] + d[0]) / 2), Y((c[1] + d[1]) / 2))
    ctx.lineTo(X(top.p[0]), Y(top.p[1]))
    ctx.stroke()
    for (const { h, p } of hs) {
      const r = (h === "rotate" ? 4.5 : h.startsWith("scale") ? 4 : 3.5) * dpr
      ctx.fillStyle = h === "rotate" ? `rgb(${ACCENT})` : "#fff"
      ctx.strokeStyle = `rgb(${ACCENT})`
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      if (h === "rotate") ctx.arc(X(p[0]), Y(p[1]), r, 0, Math.PI * 2)
      else ctx.rect(X(p[0]) - r, Y(p[1]) - r, 2 * r, 2 * r)
      ctx.fill()
      ctx.stroke()
    }
  }
  if (o.marquee) {
    const [a, b] = o.marquee
    ctx.fillStyle = `rgba(${ACCENT},0.08)`
    ctx.strokeStyle = `rgba(${ACCENT},0.8)`
    ctx.lineWidth = dpr
    const x = Math.min(X(a[0]), X(b[0])),
      y = Math.min(Y(a[1]), Y(b[1]))
    ctx.fillRect(x, y, Math.abs(X(b[0]) - X(a[0])), Math.abs(Y(b[1]) - Y(a[1])))
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(X(b[0]) - X(a[0])), Math.abs(Y(b[1]) - Y(a[1])))
  }
}

type Drag =
  | { kind: "pan"; start: Vec; origin: Vec }
  | { kind: "move"; starts: NodeStart[]; from: Vec; anchor: Vec; moved: boolean }
  | { kind: "scale"; starts: NodeStart[]; pivot: Vec; from: Vec }
  | { kind: "rotate"; starts: NodeStart[]; pivot: Vec; from: Vec }
  | { kind: "resize"; start: NodeStart; handle: "w+" | "w-" | "h+" | "h-"; from: Vec }
  | { kind: "marquee"; from: Vec; to: Vec; base: string[]; additive: boolean }

/** Point inside a convex quad (world). */
function inQuad(q: Vec[], p: Vec) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i],
      b = q[(i + 1) % 4]
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if (c !== 0) {
      if (sign && Math.sign(c) !== sign) return false
      sign = Math.sign(c)
    }
  }
  return true
}

export function StudioCanvas() {
  const host = useRef<HTMLDivElement>(null)
  const glCanvas = useRef<HTMLCanvasElement>(null)
  const cpuCanvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const zoom = useRef(40)
  const center = useRef<Vec>([0, 0])
  const schedule = useRef<() => void>(() => {})
  const fitRef = useRef<(artboard?: boolean) => void>(() => {})
  const hover = useRef<string | null>(null)
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)
  const gizmoRef = useRef<Gizmo | null>(null)
  const [zoomLabel, setZoomLabel] = useState(100)
  const [backend, setBackend] = useState<"gpu" | "cpu">("gpu")
  const [fps, setFps] = useState(0)
  const [cursor, setCursor] = useState("default")

  const playing = useStore((s) => s.playing)
  const showGrid = useStore((s) => s.showGrid)
  const snapOn = useStore((s) => s.snap)
  const pointerOn = useStore((s) => s.pointerOn)
  const artboardOn = useStore((s) => s.scene.artboard.enabled)
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
    const fit = (artboard = false) => {
      if (!el.clientWidth || !el.clientHeight) return
      fitted = true
      const st = useStore.getState()
      const a = st.scene.artboard
      const box =
        artboard || (a.enabled && !st.scene.layers.length)
          ? { x0: a.x - a.w / 2, y0: a.y - a.h / 2, x1: a.x + a.w / 2, y1: a.y + a.h / 2 }
          : frameBounds(sceneFrame(st.scene, st.library), 1)
      const v = fitView(box, el.clientWidth, el.clientHeight, 0.08)
      zoom.current = Math.min(v.scale, 160)
      center.current = [v.cx, v.cy]
      setZoomLabel(Math.round((zoom.current / 40) * 100))
      schedule.current()
    }
    fitRef.current = fit
    runtime.focus = (box) => {
      if (!el.clientWidth || !el.clientHeight) return
      const v = fitView(box, el.clientWidth, el.clientHeight, 0.08)
      zoom.current = Math.min(v.scale, 160)
      center.current = [v.cx, v.cy]
      setZoomLabel(Math.round((zoom.current / 40) * 100))
      schedule.current()
    }

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
      const frame = buildFrame(eff, st.library, runtime.time, pointer)
      runtime.physicsFrame(frame, st.scene, eff, dt, st.playing)
      runtime.frame = frame
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = el.clientWidth,
        ch = el.clientHeight
      const res = renderer ? dpr * quality : Math.min(1, 520 / Math.max(cw, 1))
      const W = Math.max(1, Math.round(cw * res)),
        H = Math.max(1, Math.round(ch * res))
      const view: View = { cx: center.current[0], cy: center.current[1], scale: zoom.current * res }
      runtime.view = { cx: center.current[0], cy: center.current[1], w: cw / zoom.current, h: ch / zoom.current }
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
      const gizmo = selectionGizmo(frame, eff.layers, selectionRoots(st.scene, selectedIds(st)))
      gizmoRef.current = gizmo
      const d = drag.current
      drawOverlay(o.getContext("2d")!, OW, OH, {
        view: { ...view, scale: zoom.current * dpr },
        frame,
        layers: eff.layers,
        gizmo,
        hover: hover.current,
        marquee: d?.kind === "marquee" ? [d.from, d.to] : null,
        grid: st.showGrid,
        dark: dark(),
        artboard: st.scene.artboard,
      })
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
        s.library !== p.library ||
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

  // Space held: temporary hand tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input, textarea, button, [role=slider], [role=menuitem]")) {
        if (!space.current) setCursor("grab")
        space.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false
        setCursor("default")
      }
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  function toWorld(e: { clientX: number; clientY: number }): Vec {
    const r = host.current!.getBoundingClientRect()
    const x = (e.clientX - r.left - r.width / 2) / zoom.current + center.current[0]
    const y = -(e.clientY - r.top - r.height / 2) / zoom.current + center.current[1]
    return [x, y]
  }

  /** Gizmo handle under a world point (within 7 screen px). */
  function handleAt(w: Vec): Handle | null {
    const g = gizmoRef.current
    if (!g) return null
    const px = 1 / zoom.current
    for (const { h, p } of handlePoints(g, px)) if (Math.hypot(p[0] - w[0], p[1] - w[1]) < 7 * px) return h
    return null
  }

  function startMove(w: Vec) {
    const st = useStore.getState()
    const ids = selectionRoots(st.scene, selectedIds(st))
    const starts = captureStart(st.scene.layers, ids).filter((s) => !s.node.locked)
    if (!starts.length) return
    drag.current = { kind: "move", starts, from: w, anchor: [starts[0].world.x, starts[0].world.y], moved: false }
  }

  function onPointerDown(e: React.PointerEvent) {
    host.current!.focus()
    const st = useStore.getState()
    const w = toWorld(e)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    runtime.pointerDown = true
    if (e.button === 1 || space.current) {
      drag.current = { kind: "pan", start: [e.clientX, e.clientY], origin: [...center.current] as Vec }
      setCursor("grabbing")
      return
    }
    if (e.button !== 0) return
    const g = gizmoRef.current
    const h = handleAt(w)
    if (g && h) {
      const starts = captureStart(st.scene.layers, g.ids).filter((s) => !s.node.locked)
      if (!starts.length) return
      if (h === "rotate") drag.current = { kind: "rotate", starts, pivot: g.pivot, from: w }
      else if (h.startsWith("scale")) drag.current = { kind: "scale", starts, pivot: g.pivot, from: w }
      else if (starts[0].node.type === "shape") drag.current = { kind: "resize", start: starts[0], handle: h as "w+", from: w }
      return
    }
    const frame = runtime.frame
    const leaf = frame ? pickLeaf(frame, st.scene.layers, w[0], w[1]) : null
    const sel = selectedIds(st)
    // A press inside the current selection box drags the selection.
    if (g && inQuad(g.quad, w) && !e.shiftKey && !(e.metaKey || e.ctrlKey) && (!leaf || g.ids.includes(clickTarget(st.scene.layers, leaf, sel, false)) || sel.length > 1)) {
      startMove(w)
      return
    }
    if (leaf) {
      const target = clickTarget(st.scene.layers, leaf, sel, e.metaKey || e.ctrlKey)
      if (e.shiftKey) {
        st.select(target, "toggle")
        return
      }
      if (!sel.includes(target)) st.select(target)
      startMove(w)
      return
    }
    drag.current = { kind: "marquee", from: w, to: w, base: e.shiftKey ? sel : [], additive: e.shiftKey }
    schedule.current()
  }

  function onPointerMove(e: React.PointerEvent) {
    const w = toWorld(e)
    const r = host.current!.getBoundingClientRect()
    runtime.setPointer(w, [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2])
    const st = useStore.getState()
    const d = drag.current
    const snapping = st.snap && !e.altKey
    if (d?.kind === "move") {
      let dx = w[0] - d.from[0],
        dy = w[1] - d.from[1]
      if (!d.moved && Math.hypot(dx, dy) * zoom.current < 3) return
      d.moved = true
      if (snapping) {
        // Snap the primary node's origin to the 0.25 grid; the rest follow.
        dx = snap(d.anchor[0] + dx, 0.25) - d.anchor[0]
        dy = snap(d.anchor[1] + dy, 0.25) - d.anchor[1]
      }
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }
      st.updateLayers(moveBy(d.starts, dx, dy), "drag:" + d.starts.map((s) => s.id).join(","))
    } else if (d?.kind === "scale") {
      const r0 = Math.hypot(d.from[0] - d.pivot[0], d.from[1] - d.pivot[1]) || 1
      let f = Math.hypot(w[0] - d.pivot[0], w[1] - d.pivot[1]) / r0
      if (snapping) f = Math.max(0.05, Math.round(f * 20) / 20)
      st.updateLayers(scaleAround(d.starts, d.pivot, f), "scale:" + d.starts.map((s) => s.id).join(","))
    } else if (d?.kind === "rotate") {
      const a0 = Math.atan2(d.from[1] - d.pivot[1], d.from[0] - d.pivot[0])
      const a1 = Math.atan2(w[1] - d.pivot[1], w[0] - d.pivot[0])
      let deg = ((a1 - a0) * 180) / Math.PI
      const stepDeg = e.shiftKey ? 15 : snapping ? 1 : 0
      if (stepDeg) deg = Math.round(deg / stepDeg) * stepDeg
      st.updateLayers(rotateAround(d.starts, d.pivot, deg), "rotate:" + d.starts.map((s) => s.id).join(","))
    } else if (d?.kind === "resize") {
      const to: Vec = snapping ? [snap(w[0], 0.25), snap(w[1], 0.25)] : w
      const from: Vec = snapping ? [snap(d.from[0], 0.25), snap(d.from[1], 0.25)] : d.from
      st.updateLayers([resizeShape(d.start, d.handle, from, to)], "resize:" + d.start.id)
    } else if (d?.kind === "marquee") {
      d.to = w
      const x0 = Math.min(d.from[0], w[0]),
        x1 = Math.max(d.from[0], w[0]),
        y0 = Math.min(d.from[1], w[1]),
        y1 = Math.max(d.from[1], w[1])
      const frame = runtime.frame
      if (frame && (x1 - x0) * zoom.current > 3) {
        // Candidates: siblings of the current selection, or top-level nodes.
        const lvl = d.base.length ? st.scene.layers.find((l) => l.id === d.base[0])?.parent : undefined
        const hits = childrenOf(st.scene.layers, lvl)
          .filter((n) => !n.locked && n.visible)
          .filter((n) => {
            const b = nodeBounds(frame, st.scene.layers, n.id)
            return b && b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1
          })
          .map((n) => n.id)
        st.selectMany(d.additive ? [...new Set([...d.base, ...hits])] : hits)
      }
      schedule.current()
    } else if (d?.kind === "pan") {
      center.current = [d.origin[0] - (e.clientX - d.start[0]) / zoom.current, d.origin[1] + (e.clientY - d.start[1]) / zoom.current]
      schedule.current()
    } else {
      // Hover: the node a click would select, and handle cursors.
      const h = handleAt(w)
      setCursor(space.current ? "grab" : h === "rotate" ? "crosshair" : h?.startsWith("scale") ? "nwse-resize" : h ? (h[0] === "w" ? "ew-resize" : "ns-resize") : "default")
      const frame = runtime.frame
      const leaf = frame ? pickLeaf(frame, st.scene.layers, w[0], w[1]) : null
      const target = leaf ? clickTarget(st.scene.layers, leaf, selectedIds(st), e.metaKey || e.ctrlKey) : null
      if (target !== hover.current) {
        hover.current = target
        schedule.current()
      }
      if (st.pointerOn && usesPointer(st.scene)) schedule.current()
    }
  }

  function onPointerUp() {
    const d = drag.current
    if (d?.kind === "marquee" && Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) * zoom.current < 3 && !d.additive) useStore.getState().select(null)
    drag.current = null
    runtime.pointerDown = false
    setCursor(space.current ? "grab" : "default")
    schedule.current()
  }

  function zoomBy(f: number, at?: Vec) {
    const next = Math.max(4, Math.min(400, zoom.current * f))
    if (at) {
      const k = 1 - zoom.current / next
      center.current = [center.current[0] + (at[0] - center.current[0]) * k, center.current[1] + (at[1] - center.current[1]) * k]
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
        center.current = [center.current[0] + e.deltaX / zoom.current, center.current[1] - e.deltaY / zoom.current]
        schedule.current()
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  function onKeyDown(e: React.KeyboardEvent) {
    const st = useStore.getState()
    const roots = selectionRoots(st.scene, selectedIds(st))
    const sel = st.scene.layers.filter((l) => roots.includes(l.id) && !l.locked)
    const step = e.shiftKey ? 0.1 : 0.5
    const moves: Record<string, Vec> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (sel.length && moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      st.updateLayers(
        sel.map((n) => {
          const inv = xfInvert(parentXf(st.scene.layers, n.id))
          const [ax, ay] = xfApply(inv, 0, 0)
          const [bx, by] = xfApply(inv, dx, dy)
          return { id: n.id, patch: { x: n.x + bx - ax, y: n.y + by - ay } }
        }),
        "nudge:" + sel.map((n) => n.id).join(","),
      )
    }
  }

  const bg = useStore((s) => (s.scene.material.transparent ? null : s.scene.material.background))

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30">
      <div
        ref={host}
        tabIndex={0}
        role="application"
        aria-label="Холст композиции. Клик выбирает группу, двойной клик — объект внутри, ⌘-клик — сам объект; рамка — выбор нескольких; пробел или средняя кнопка — панорама; стрелки сдвигают выбор."
        className="relative min-h-0 flex-1 touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{
          cursor,
          ...(bg
            ? { background: bg }
            : {
                backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
                backgroundSize: "16px 16px",
              }),
        }}
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
          const st = useStore.getState()
          const w = toWorld(e)
          const leaf = runtime.frame ? pickLeaf(runtime.frame, st.scene.layers, w[0], w[1]) : null
          if (!leaf) return fitRef.current()
          st.select(drillTarget(st.scene.layers, leaf, selectedIds(st).at(-1)))
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
            <TooltipTrigger
              render={
                <Toggle
                  size="sm"
                  pressed={artboardOn}
                  onPressedChange={(v) => {
                    useStore.getState().setScene((s) => ({ ...s, artboard: { ...s.artboard, enabled: v } }))
                    if (v) fitRef.current(true)
                  }}
                  aria-label="Артборд"
                />
              }
            >
              <FrameIcon />
            </TooltipTrigger>
            <TooltipContent>Артборд: кадр для экспорта (размер — во вкладке «Сцена»)</TooltipContent>
          </Tooltip>
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
            <TooltipContent>Привязка к сетке 0,25 m (Alt — без привязки, Shift — по оси / шаг 15°)</TooltipContent>
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
