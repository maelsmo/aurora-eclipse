import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { GlyphRenderer } from "@/engine/gpu/renderer"
import { buildFrame } from "@/engine/frame"
import { compileGlyph, glyphAdvance, glyphPrims } from "@/engine/compile"
import { makeLayer, makeScene } from "@/engine/scene"
import { CAP, OVERHANG, snap } from "@/engine/grid"
import type { ArcDef, PrimDef, Vec } from "@/engine/types"
import { editingAlphabet, useStore } from "@/state/store"
import { editAxes, editTarget, withPrims, type Tool, movePrim, geoPath } from "./editing"

type Handle = "a" | "b" | "c" | "r" | "a0" | "a1" | "body" | "adv"
type Drag = { index: number; handle: Handle; start: Vec; prim: PrimDef }
type Draft = { kind: "stroke" | "slot" | "arc"; a: Vec; b: Vec }

const DEG = Math.PI / 180
const SKEL = "var(--foreground)"
const ACCENT = "#5B3CF5"

function arcPath(p: ArcDef, X: (x: number) => number, Y: (y: number) => number, s: number) {
  const span = p.a1 - p.a0
  if (span >= 359.9) {
    const r = p.r * s
    return `M ${X(p.c[0]) - r} ${Y(p.c[1])} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
  }
  const sx = X(p.c[0] + Math.cos(p.a0 * DEG) * p.r),
    sy = Y(p.c[1] + Math.sin(p.a0 * DEG) * p.r)
  const ex = X(p.c[0] + Math.cos(p.a1 * DEG) * p.r),
    ey = Y(p.c[1] + Math.sin(p.a1 * DEG) * p.r)
  // Screen y is flipped, so a CCW arc in design space is clockwise on screen (sweep 0).
  return `M ${sx} ${sy} A ${p.r * s} ${p.r * s} 0 ${span > 180 ? 1 : 0} 0 ${ex} ${ey}`
}

export function GlyphEditor({
  tool,
  fine,
  selected,
  onSelect,
}: {
  tool: Tool
  fine: boolean
  selected: number | null
  onSelect: (i: number | null) => void
}) {
  const editing = useStore((s) => s.editing)
  const alphabet = useStore(editingAlphabet)
  const library = useStore((s) => s.library)
  const editingSet = useStore((s) => s.editingSet)
  const studioAxes = useStore((s) => s.scene.axes)
  const setGlyph = useStore((s) => s.setGlyph)
  const { target, def } = editTarget(editing, alphabet)
  const own = def?.prims ?? []
  const basePrims = useMemo(() => (def?.base ? glyphPrims(def.base, alphabet) ?? [] : []), [def, alphabet])
  const adv = glyphAdvance(target, alphabet)
  const axes = useMemo(() => editAxes(studioAxes), [studioAxes])

  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<GlyphRenderer | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [hoverNode, setHoverNode] = useState<Vec | null>(null)
  const step = fine ? 0.25 : 0.5

  // View: the design box with the overhang zone around it.
  const bx0 = -1.5,
    bx1 = Math.max(adv, 3) + 1.5,
    by0 = -OVERHANG - 0.5,
    by1 = CAP + OVERHANG + 0.5
  const s = size.w ? Math.min(size.w / (bx1 - bx0), size.h / (by1 - by0)) : 40
  const offX = (size.w - (bx1 - bx0) * s) / 2,
    offY = (size.h - (by1 - by0) * s) / 2
  const X = (x: number) => (x - bx0) * s + offX
  const Y = (y: number) => (by1 - y) * s + offY
  const toDesign = (e: { clientX: number; clientY: number }): Vec => {
    const r = host.current!.getBoundingClientRect()
    return [(e.clientX - r.left - offX) / s + bx0, by1 - (e.clientY - r.top - offY) / s]
  }
  const snapV = (p: Vec): Vec => [snap(p[0], step), snap(p[1], step)]

  useLayoutEffect(() => {
    try {
      renderer.current = new GlyphRenderer(canvas.current!)
    } catch {
      renderer.current = null
    }
    const ro = new ResizeObserver(() => setSize({ w: host.current!.clientWidth, h: host.current!.clientHeight }))
    ro.observe(host.current!)
    return () => {
      ro.disconnect()
      renderer.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const r = renderer.current
    if (!r || !size.w) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    r.resize(size.w * dpr, size.h * dpr)
    const entry = library.sets[editingSet]
    const g = compileGlyph(editing, alphabet, axes, entry?.version ?? 0)
    const ax = (g.box.x0 + g.box.x1) / 2
    const scene = makeScene({
      axes,
      set: editingSet,
      layers: [makeLayer(editing, { x: ax, y: CAP / 2, color: "#C9C3EE" })],
    })
    const frame = buildFrame(scene, library, 0, [1e4, 1e4])
    const cx = bx0 + (size.w / 2 - offX) / s,
      cy = by1 - (size.h / 2 - offY) / s
    r.render(frame, { ...scene.material, transparent: true }, { cx, cy, scale: s * dpr })
  })

  const commit = (prims: PrimDef[], key?: string, nextAdv?: number) =>
    setGlyph(target, withPrims(def, prims, nextAdv), key)

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    host.current?.focus()
    const p = toDesign(e)
    const n = snapV(p)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const handleEl = (e.target as Element).closest("[data-handle]") as HTMLElement | null
    if (tool === "select") {
      if (handleEl) {
        const index = Number(handleEl.dataset.index),
          handle = handleEl.dataset.handle as Handle
        if (index === -1) {
          setDrag({ index: -1, handle, start: p, prim: own[0] })
          return
        }
        onSelect(index)
        setDrag({ index, handle, start: p, prim: own[index] })
      } else onSelect(null)
      return
    }
    if (tool === "dot" || tool === "hole") {
      commit([...own, { kind: tool, c: n }])
      onSelect(own.length)
      return
    }
    if (tool === "stroke" || tool === "arc" || tool === "slot") setDraft({ kind: tool, a: n, b: n })
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toDesign(e)
    const n = snapV(p)
    setHoverNode(tool === "select" && !drag ? null : n)
    if (draft) {
      setDraft({ ...draft, b: n })
      return
    }
    if (!drag) return
    const key = `edit:${target}:${drag.index}:${drag.handle}`
    if (drag.index === -1) {
      commit(own, key, Math.max(1, snap(p[0], 0.5)))
      return
    }
    const d: Vec = [snap(p[0] - drag.start[0], step), snap(p[1] - drag.start[1], step)]
    const q = drag.prim
    const next = [...own]
    if (q.kind === "stroke" || q.kind === "slot") {
      if (drag.handle === "a") next[drag.index] = { ...q, a: n }
      else if (drag.handle === "b") next[drag.index] = { ...q, b: n }
      else next[drag.index] = { ...q, a: [q.a[0] + d[0], q.a[1] + d[1]], b: [q.b[0] + d[0], q.b[1] + d[1]] }
    } else if (q.kind === "arc") {
      if (drag.handle === "r") next[drag.index] = { ...q, r: Math.max(0.5, snap(Math.hypot(p[0] - q.c[0], p[1] - q.c[1]), 0.5)) }
      else if (drag.handle === "a0" || drag.handle === "a1") {
        let a = snap(Math.atan2(p[1] - q.c[1], p[0] - q.c[0]) / DEG, 15)
        if (drag.handle === "a0") {
          while (a > q.a1 - 15) a -= 360
          while (a < q.a1 - 360) a += 360
          next[drag.index] = { ...q, a0: a }
        } else {
          while (a < q.a0 + 15) a += 360
          while (a > q.a0 + 360) a -= 360
          next[drag.index] = { ...q, a1: a }
        }
      } else next[drag.index] = { ...q, c: [q.c[0] + d[0], q.c[1] + d[1]] }
    } else if (q.kind === "dot" || q.kind === "hole") {
      next[drag.index] = { ...q, c: drag.handle === "c" ? n : [q.c[0] + d[0], q.c[1] + d[1]] }
    } else if (q.kind === "box" && (drag.handle === "a" || drag.handle === "b")) {
      next[drag.index] = { ...q, [drag.handle]: n }
    } else next[drag.index] = movePrim(q, d)
    commit(next, key)
  }

  function onPointerUp() {
    if (draft) {
      const { kind, a, b } = draft
      if (kind === "arc") {
        const r = Math.max(0.5, snap(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5))
        commit([...own, { kind: "arc", c: a, r, a0: 0, a1: 180 }])
        onSelect(own.length)
      } else if (a[0] !== b[0] || a[1] !== b[1]) {
        commit([...own, { kind, a, b }])
        onSelect(own.length)
      }
      setDraft(null)
    }
    setDrag(null)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (selected === null) return
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      commit(own.filter((_, i) => i !== selected))
      onSelect(null)
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault()
      const d: Vec = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      }[e.key] as Vec
      const next = [...own]
      next[selected] = movePrim(own[selected], d)
      commit(next, "nudge:" + target + selected)
    } else if (e.key === "Escape") onSelect(null)
  }

  // Grid lines.
  const lines: React.ReactNode[] = []
  if (size.w) {
    for (let x = Math.ceil(bx0 / step) * step; x <= bx1; x += step) {
      const major = Math.abs(x - Math.round(x)) < 1e-6
      lines.push(<line key={"x" + x} x1={X(x)} x2={X(x)} y1={Y(by0)} y2={Y(by1)} stroke={SKEL} strokeOpacity={major ? 0.12 : 0.05} />)
    }
    for (let y = Math.ceil(by0 / step) * step; y <= by1; y += step) {
      const major = Math.abs(y - Math.round(y)) < 1e-6
      lines.push(<line key={"y" + y} x1={X(bx0)} x2={X(bx1)} y1={Y(y)} y2={Y(y)} stroke={SKEL} strokeOpacity={major ? 0.12 : 0.05} />)
    }
  }
  const metricLines = [
    { y: 0, label: "База" },
    { y: CAP / 2, label: "Середина" },
    { y: CAP, label: "Прописная" },
    { y: -OVERHANG, label: "Вынос" },
    { y: CAP + OVERHANG, label: "Вынос" },
  ]

  const skeleton = (p: PrimDef, i: number, ghost: boolean) => {
    const sel = !ghost && i === selected
    const stroke = ghost ? SKEL : sel ? ACCENT : SKEL
    const op = ghost ? 0.3 : 0.9
    const w = sel ? 2 : 1.25
    const handle = (h: Handle, x: number, y: number, shape: "circle" | "square" = "circle") =>
      ghost ? null : shape === "circle" ? (
        <circle key={h} data-handle={h} data-index={i} cx={X(x)} cy={Y(y)} r={sel ? 5.5 : 4.5} fill="var(--background)" stroke={stroke} strokeWidth={1.5} className="cursor-grab" />
      ) : (
        <rect key={h} data-handle={h} data-index={i} x={X(x) - 4} y={Y(y) - 4} width={8} height={8} fill={stroke} className="cursor-grab" />
      )
    const body = { "data-handle": "body", "data-index": i, className: ghost ? "" : "cursor-move" } as const
    switch (p.kind) {
      case "stroke":
      case "slot":
        return (
          <g key={(ghost ? "g" : "p") + i} opacity={op}>
            {!ghost && <line {...body} x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} stroke="transparent" strokeWidth={14} />}
            <line x1={X(p.a[0])} y1={Y(p.a[1])} x2={X(p.b[0])} y2={Y(p.b[1])} stroke={stroke} strokeWidth={w} strokeDasharray={p.kind === "slot" || ghost ? "5 4" : undefined} pointerEvents="none" />
            {handle("a", p.a[0], p.a[1])}
            {handle("b", p.b[0], p.b[1])}
          </g>
        )
      case "arc": {
        const mid = ((p.a0 + p.a1) / 2) * DEG
        const d = arcPath(p, X, Y, s)
        return (
          <g key={(ghost ? "g" : "p") + i} opacity={op}>
            {!ghost && <path {...body} d={d} fill="none" stroke="transparent" strokeWidth={14} />}
            <path d={d} fill="none" stroke={stroke} strokeWidth={w} strokeDasharray={ghost ? "5 4" : undefined} pointerEvents="none" />
            {!ghost && sel && <line x1={X(p.c[0])} y1={Y(p.c[1])} x2={X(p.c[0] + Math.cos(mid) * p.r)} y2={Y(p.c[1] + Math.sin(mid) * p.r)} stroke={stroke} strokeDasharray="2 3" />}
            {handle("c", p.c[0], p.c[1], "square")}
            {sel && handle("r", p.c[0] + Math.cos(mid) * p.r, p.c[1] + Math.sin(mid) * p.r)}
            {sel && p.a1 - p.a0 < 359.9 && handle("a0", p.c[0] + Math.cos(p.a0 * DEG) * p.r, p.c[1] + Math.sin(p.a0 * DEG) * p.r)}
            {sel && p.a1 - p.a0 < 359.9 && handle("a1", p.c[0] + Math.cos(p.a1 * DEG) * p.r, p.c[1] + Math.sin(p.a1 * DEG) * p.r)}
          </g>
        )
      }
      case "box":
      case "ellipse":
      case "sector":
      case "poly": {
        const d = geoPath(p, (x, y) => [X(x), Y(y)], s)
        return (
          <g key={(ghost ? "g" : "p") + i} opacity={op}>
            <path {...(ghost ? {} : body)} d={d} fill={ghost ? "none" : "transparent"} stroke={stroke} strokeWidth={w} strokeDasharray={p.neg || ghost ? "5 4" : undefined} />
            {p.kind === "box" && sel && handle("a", p.a[0], p.a[1])}
            {p.kind === "box" && sel && handle("b", p.b[0], p.b[1])}
          </g>
        )
      }
      default: {
        const r = (p.kind === "dot" ? 0.5 : 0.3) * (p.s ?? 1) * s
        return (
          <g key={(ghost ? "g" : "p") + i} opacity={op}>
            <circle {...(ghost ? {} : body)} cx={X(p.c[0])} cy={Y(p.c[1])} r={r} fill={ghost ? "none" : "transparent"} stroke={stroke} strokeWidth={w} strokeDasharray={p.kind === "hole" ? "4 3" : undefined} />
            {handle("c", p.c[0], p.c[1])}
          </g>
        )
      }
    }
  }

  const cursor = tool === "select" ? "default" : "crosshair"

  return (
    <div
      ref={host}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={`Конструкция буквы ${editing}. Узлы привязаны к сетке ${step === 0.5 ? "0,5" : "0,25"} модуля.`}
      role="application"
    >
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" />
      {size.w > 0 && (
        <svg
          className="absolute inset-0 size-full touch-none select-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHoverNode(null)}
        >
          <g pointerEvents="none">{lines}</g>
          <g pointerEvents="none" fontSize={10} fill="var(--muted-foreground)">
            {metricLines.map((m, k) => (
              <g key={k}>
                <line x1={X(bx0)} x2={X(bx1)} y1={Y(m.y)} y2={Y(m.y)} stroke={SKEL} strokeOpacity={m.y === 0 || m.y === CAP ? 0.35 : 0.18} strokeDasharray={m.y < 0 || m.y > CAP ? "3 4" : undefined} />
                {k < 4 && (
                  <text x={X(bx0) + 6} y={Y(m.y) - 4}>
                    {m.label}
                  </text>
                )}
              </g>
            ))}
            <line x1={X(0)} x2={X(0)} y1={Y(by0)} y2={Y(by1)} stroke={SKEL} strokeOpacity={0.3} strokeDasharray="2 4" />
          </g>
          <g>
            <line x1={X(adv)} x2={X(adv)} y1={Y(by0)} y2={Y(by1)} stroke={ACCENT} strokeOpacity={0.5} strokeDasharray="2 4" pointerEvents="none" />
            {tool === "select" && !def?.base && (
              <rect data-handle="adv" data-index={-1} x={X(adv) - 5} y={Y(by0) - 1} width={10} height={14} rx={2} fill={ACCENT} className="cursor-ew-resize">
                <title>Ширина знака</title>
              </rect>
            )}
          </g>
          {basePrims.map((p, i) => skeleton(p, i, true))}
          {own.map((p, i) => skeleton(p, i, false))}
          {draft &&
            (draft.kind === "arc" ? (
              <circle cx={X(draft.a[0])} cy={Y(draft.a[1])} r={Math.max(0.5, snap(Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1]), 0.5)) * s} fill="none" stroke={ACCENT} strokeDasharray="4 3" pointerEvents="none" />
            ) : (
              <line x1={X(draft.a[0])} y1={Y(draft.a[1])} x2={X(draft.b[0])} y2={Y(draft.b[1])} stroke={ACCENT} strokeWidth={s} strokeOpacity={0.35} strokeLinecap="round" pointerEvents="none" />
            ))}
          {hoverNode && (
            <circle cx={X(hoverNode[0])} cy={Y(hoverNode[1])} r={3} fill={ACCENT} pointerEvents="none" />
          )}
        </svg>
      )}
    </div>
  )
}
