// WebGL2 renderer: one full-screen triangle running the glyph interpreter.
import { fragmentSource, vertexSource } from "./shader"
import {
  createPacked,
  packFrame,
  LAYER_TEXELS,
  MAX_LAYERS,
  MAX_PRIMS,
  PRIM_TEXELS,
} from "./pack"
import { hexToRgb, type Frame } from "../frame"
import type { Material } from "../scene"

export type View = {
  /** World point at the centre of the canvas. */
  cx: number
  cy: number
  /** Device pixels per module. */
  scale: number
}

const fills = { fill: 0, outline: 1, isolines: 2, halftone: 3 } as const
const colorModes = { layer: 0, aurora: 1, depth: 2 } as const

const uniformNames = [
  "uPrims", "uLayers", "uLayerCount", "uRes", "uView", "uTime", "uPointer",
  "uWave", "uFlow", "uPull", "uFill", "uLine", "uColorMode", "uAur0", "uAur1",
  "uAur2", "uAurora", "uDepthColor", "uDepth", "uOverlapColor", "uOverlap",
  "uGlowColor", "uGlow", "uShadowColor", "uShadow", "uGrain", "uBg",
] as const
type UniformName = (typeof uniformNames)[number]

export class GlyphRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program!: WebGLProgram
  private buffer!: WebGLBuffer
  private primTex!: WebGLTexture
  private layerTex!: WebGLTexture
  private loc = {} as Record<UniformName, WebGLUniformLocation | null>
  private packed = createPacked()
  lost = false

  static supported() {
    try {
      return !!document.createElement("canvas").getContext("webgl2")
    } catch {
      return false
    }
  }

  constructor(canvas: HTMLCanvasElement, opts: { preserve?: boolean } = {}) {
    this.canvas = canvas
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: !!opts.preserve,
    })
    if (!gl) throw new Error("WebGL2 недоступен")
    this.gl = gl
    canvas.addEventListener("webglcontextlost", this.onLost)
    canvas.addEventListener("webglcontextrestored", this.onRestored)
    this.init()
  }

  private onLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
  }
  private onRestored = () => {
    this.init()
    this.lost = false
  }

  private compile(kind: number, src: string) {
    const gl = this.gl
    const sh = gl.createShader(kind)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh)
      gl.deleteShader(sh)
      throw new Error("Shader: " + log)
    }
    return sh
  }

  private makeTexture(width: number, height: number) {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null)
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
      gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private init() {
    const gl = this.gl
    const vs = this.compile(gl.VERTEX_SHADER, vertexSource)
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, "position")
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Program: " + gl.getProgramInfoLog(program))
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.program = program
    gl.useProgram(program)
    this.buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    for (const n of uniformNames) this.loc[n] = gl.getUniformLocation(program, n)
    gl.activeTexture(gl.TEXTURE0)
    this.primTex = this.makeTexture(PRIM_TEXELS, MAX_PRIMS)
    gl.activeTexture(gl.TEXTURE1)
    this.layerTex = this.makeTexture(LAYER_TEXELS, MAX_LAYERS)
    gl.uniform1i(this.loc.uPrims, 0)
    gl.uniform1i(this.loc.uLayers, 1)
  }

  /** Resizes the drawing buffer; returns true when it changed. */
  resize(width: number, height: number) {
    const w = Math.max(1, Math.round(width)),
      h = Math.max(1, Math.round(height))
    if (this.canvas.width === w && this.canvas.height === h) return false
    this.canvas.width = w
    this.canvas.height = h
    return true
  }

  render(frame: Frame, material: Material, view: View, opts: { transparent?: boolean } = {}) {
    if (this.lost) return
    const gl = this.gl
    const p = packFrame(frame, this.packed)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.primTex)
    if (p.primCount > 0)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PRIM_TEXELS, p.primCount, gl.RGBA, gl.FLOAT,
        p.prims.subarray(0, p.primCount * PRIM_TEXELS * 4))
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex)
    if (p.layerCount > 0)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LAYER_TEXELS, p.layerCount, gl.RGBA, gl.FLOAT,
        p.layers.subarray(0, p.layerCount * LAYER_TEXELS * 4))

    const L = this.loc,
      m = material,
      w = frame.warp
    const { width, height } = this.canvas
    gl.viewport(0, 0, width, height)
    gl.uniform1i(L.uLayerCount, p.layerCount)
    gl.uniform2f(L.uRes, width, height)
    gl.uniform3f(L.uView, view.cx, view.cy, view.scale)
    gl.uniform1f(L.uTime, frame.time)
    gl.uniform2f(L.uPointer, frame.pointer[0], frame.pointer[1])
    gl.uniform3f(L.uWave, w.wave, w.waveFreq, w.waveSpeed)
    gl.uniform3f(L.uFlow, w.flow, w.flowScale, w.flowSpeed)
    gl.uniform2f(L.uPull, w.pointer, w.pointerRadius)
    gl.uniform1i(L.uFill, fills[m.fill])
    gl.uniform4f(L.uLine, m.line, m.spacing, m.rings, m.dot)
    gl.uniform1i(L.uColorMode, colorModes[m.colorMode])
    gl.uniform3fv(L.uAur0, hexToRgb(m.aurora[0]))
    gl.uniform3fv(L.uAur1, hexToRgb(m.aurora[1]))
    gl.uniform3fv(L.uAur2, hexToRgb(m.aurora[2]))
    gl.uniform2f(L.uAurora, m.auroraScale, m.auroraSpeed)
    gl.uniform3fv(L.uDepthColor, hexToRgb(m.depthColor))
    gl.uniform1f(L.uDepth, m.depth)
    gl.uniform3fv(L.uOverlapColor, hexToRgb(m.overlapColor))
    gl.uniform1f(L.uOverlap, m.overlap)
    gl.uniform3fv(L.uGlowColor, hexToRgb(m.glowColor))
    gl.uniform2f(L.uGlow, m.glow, m.glowSize)
    gl.uniform3fv(L.uShadowColor, hexToRgb(m.shadowColor))
    gl.uniform4f(L.uShadow, m.shadow, m.shadowX, m.shadowY, m.shadowSoft)
    gl.uniform1f(L.uGrain, m.grain)
    const bg = hexToRgb(m.background)
    const transparent = opts.transparent ?? m.transparent
    gl.uniform4f(L.uBg, bg[0], bg[1], bg[2], transparent ? 0 : 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    const gl = this.gl
    this.canvas.removeEventListener("webglcontextlost", this.onLost)
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
    gl.deleteTexture(this.primTex)
    gl.deleteTexture(this.layerTex)
    gl.deleteBuffer(this.buffer)
    gl.deleteProgram(this.program)
    // The context is not force-lost: React StrictMode remounts on the same canvas.
  }
}
