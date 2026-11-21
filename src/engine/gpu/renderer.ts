// WebGL2 instanced renderer. Passes:
// clear → corona (halo instances, MAX blending gives the corona of the union)
// → background underneath → shadows (over) → bodies in z-order (over)
// → grain as a post pass (two halves with add / reverse subtract).
// The world point comes from gl_FragCoord, so rasters, aurora and grain
// line up across instances.
import { clusterFragment, haloFragment, instanceVertex, postFragment, postVertex, soloFragment } from "./glsl/programs"
import {
  createPacked,
  packFrame,
  INSTANCE_FLOATS,
  LAYER_TEXELS,
  LOOK_TEXELS,
  MAX_INSTANCES,
  MAX_LAYERS,
  MAX_LOOKS,
  PRIM_TEX_H,
  PRIM_TEX_W,
  PRIMS_PER_ROW,
  INSTANCE,
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

type Program = { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }

const envUniforms = ["uRes", "uView", "uTime", "uPointer", "uWave", "uFlow", "uPull", "uPad", "uShift"]

/**
 * Resolution divisor of a halo pass: soft halos (many pixels of blur) are
 * smooth enough to draw at 1/2…1/4 and magnify; a few objects never need it.
 */
export function haloFactor(blurPx: number, instances: number) {
  if (instances < 24) return 1
  return Math.max(1, Math.min(4, Math.floor(blurPx / 4)))
}

export class GlyphRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private cluster!: Program
  private solo!: Program
  private halo!: Program
  private post!: Program
  private vao!: WebGLVertexArrayObject
  private postVao!: WebGLVertexArrayObject
  private instanceBuffer!: WebGLBuffer
  private primTex!: WebGLTexture
  private layerTex!: WebGLTexture
  private lookTex!: WebGLTexture
  /** Reduced-resolution target of the corona and shadow passes. */
  private haloTex: WebGLTexture | null = null
  private haloFbo: WebGLFramebuffer | null = null
  private haloSize: [number, number] = [0, 0]
  private packed = createPacked()
  /** Set when textures were recreated and every upload must happen again. */
  private fresh = true
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

  private shader(kind: number, src: string) {
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

  private program(vs: string, fs: string, uniforms: string[]): Program {
    const gl = this.gl
    const v = this.shader(gl.VERTEX_SHADER, vs)
    const f = this.shader(gl.FRAGMENT_SHADER, fs)
    const prog = gl.createProgram()!
    gl.attachShader(prog, v)
    gl.attachShader(prog, f)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Program: " + gl.getProgramInfoLog(prog))
    gl.deleteShader(v)
    gl.deleteShader(f)
    const loc = new Map<string, WebGLUniformLocation | null>()
    for (const n of uniforms) loc.set(n, gl.getUniformLocation(prog, n))
    gl.useProgram(prog)
    gl.uniform1i(gl.getUniformLocation(prog, "uPrims"), 0)
    gl.uniform1i(gl.getUniformLocation(prog, "uLayers"), 1)
    gl.uniform1i(gl.getUniformLocation(prog, "uLooks"), 2)
    return { prog, loc }
  }

  private makeTexture(unit: number, width: number, height: number) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null)
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  private init() {
    const gl = this.gl
    this.cluster = this.program(instanceVertex, clusterFragment, [
      ...envUniforms,
      "uAur0", "uAur1", "uAur2", "uAurora", "uDepthColor", "uDepth", "uOverlapColor", "uOverlap",
    ])
    this.solo = this.program(instanceVertex, soloFragment, [
      ...envUniforms,
      "uAur0", "uAur1", "uAur2", "uAurora", "uDepthColor", "uDepth", "uOverlapColor", "uOverlap",
    ])
    this.halo = this.program(instanceVertex, haloFragment, [
      ...envUniforms,
      "uHaloMode", "uGlowColor", "uGlow", "uShadowColor", "uShadow",
    ])
    this.post = this.program(postVertex, postFragment, ["uPostMode", "uBg", "uGrain", "uTime", "uRes", "uHaloSize", "uHaloF"])
    gl.uniform1i(gl.getUniformLocation(this.post.prog, "uHalo"), 3)
    this.haloTex = null
    this.haloFbo = null
    this.haloSize = [0, 0]

    this.instanceBuffer = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW)
    for (let a = 0; a < 5; a++) {
      gl.enableVertexAttribArray(a)
      gl.vertexAttribDivisor(a, 1)
    }
    this.bindInstances(0)
    // The post pass needs no vertex data, but keep one enabled attribute for old drivers.
    this.postVao = gl.createVertexArray()!
    gl.bindVertexArray(this.postVao)
    const dummy = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, dummy)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.primTex = this.makeTexture(0, PRIM_TEX_W, PRIM_TEX_H)
    this.layerTex = this.makeTexture(1, LAYER_TEXELS, MAX_LAYERS)
    this.lookTex = this.makeTexture(2, LOOK_TEXELS, MAX_LOOKS)
    this.fresh = true
  }

  /** Points the instance attributes at instance `first` (WebGL2 has no base instance). */
  private bindInstances(first: number) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    for (let a = 0; a < 5; a++) gl.vertexAttribPointer(a, 4, gl.FLOAT, false, INSTANCE_FLOATS * 4, first * INSTANCE_FLOATS * 4 + a * 16)
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

  private upload(frame: Frame) {
    const gl = this.gl
    const p = packFrame(frame, this.packed)
    if ((p.primsDirty || this.fresh) && p.primCount > 0) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.primTex)
      const rows = Math.ceil(p.primCount / PRIMS_PER_ROW)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PRIM_TEX_W, rows, gl.RGBA, gl.FLOAT, p.prims.subarray(0, rows * PRIM_TEX_W * 4))
    }
    this.fresh = false
    if (p.layerCount > 0) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.layerTex)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LAYER_TEXELS, p.layerCount, gl.RGBA, gl.FLOAT, p.layers.subarray(0, p.layerCount * LAYER_TEXELS * 4))
    }
    if (p.lookCount > 0) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, this.lookTex)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LOOK_TEXELS, p.lookCount, gl.RGBA, gl.FLOAT, p.looks.subarray(0, p.lookCount * LOOK_TEXELS * 4))
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.instances.subarray(0, p.instanceCount * INSTANCE_FLOATS))
    return p
  }

  private setEnv(pr: Program, frame: Frame, view: View, pad: number, shift: [number, number], res: [number, number] = [this.canvas.width, this.canvas.height]) {
    const gl = this.gl,
      L = pr.loc,
      w = frame.warp
    gl.useProgram(pr.prog)
    gl.uniform2f(L.get("uRes")!, res[0], res[1])
    gl.uniform3f(L.get("uView")!, view.cx, view.cy, view.scale)
    gl.uniform1f(L.get("uTime")!, frame.time)
    gl.uniform2f(L.get("uPointer")!, frame.pointer[0], frame.pointer[1])
    gl.uniform3f(L.get("uWave")!, w.wave, w.waveFreq, w.waveSpeed)
    gl.uniform3f(L.get("uFlow")!, w.flow, w.flowScale, w.flowSpeed)
    gl.uniform2f(L.get("uPull")!, w.pointer, w.pointerRadius)
    gl.uniform1f(L.get("uPad")!, pad)
    gl.uniform2f(L.get("uShift")!, shift[0], shift[1])
  }

  /** Binds a cleared reduced-resolution target (1/f of the canvas) for a halo pass; returns its size. */
  private beginHalo(f: number): [number, number] {
    const gl = this.gl
    const w = Math.max(1, Math.ceil(this.canvas.width / f)),
      h = Math.max(1, Math.ceil(this.canvas.height / f))
    if (!this.haloTex || this.haloSize[0] !== w || this.haloSize[1] !== h) {
      if (this.haloTex) gl.deleteTexture(this.haloTex)
      this.haloFbo ??= gl.createFramebuffer()
      gl.activeTexture(gl.TEXTURE3)
      this.haloTex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, this.haloTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.haloFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.haloTex, 0)
      this.haloSize = [w, h]
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.haloFbo)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return [w, h]
  }

  /** Back to the canvas; draws the halo target over it, magnified with bilinear filtering. */
  private endHalo(over: boolean, f: number) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.post.prog)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.haloTex)
    gl.uniform1i(this.post.loc.get("uPostMode")!, 3)
    gl.uniform2f(this.post.loc.get("uRes")!, this.canvas.width, this.canvas.height)
    // The target is centred on the view like the canvas but rounded up in size: map pixels by centre.
    gl.uniform2f(this.post.loc.get("uHaloSize")!, this.haloSize[0], this.haloSize[1])
    gl.uniform1f(this.post.loc.get("uHaloF")!, f)
    gl.blendEquation(gl.FUNC_ADD)
    if (over) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    else gl.blendFunc(gl.ONE, gl.ZERO)
    gl.bindVertexArray(this.postVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  render(frame: Frame, material: Material, view: View, opts: { transparent?: boolean } = {}) {
    if (this.lost) return
    const gl = this.gl
    const m = material
    const p = this.upload(frame)
    const { width, height } = this.canvas
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    const n = p.instanceCount
    const transparent = opts.transparent ?? m.transparent

    // 1. Corona: the strongest glow of any instance wins (MAX), i.e. the glow of the union.
    // Every instance pads its quad by the whole reach, so with many objects the
    // pass is drawn at a reduced resolution matched to the glow's softness.
    if (m.glow > 1 / 510 && n > 0) {
      const reach = m.glowSize * Math.log(510 * m.glow)
      const f = haloFactor(m.glowSize * view.scale, n)
      const res = f > 1 ? this.beginHalo(f) : undefined
      this.setEnv(this.halo, frame, f > 1 ? { ...view, scale: view.scale / f } : view, reach, [0, 0], res)
      const L = this.halo.loc
      gl.uniform1i(L.get("uHaloMode")!, 0)
      gl.uniform3fv(L.get("uGlowColor")!, hexToRgb(m.glowColor))
      gl.uniform2f(L.get("uGlow")!, m.glow, m.glowSize)
      gl.blendEquation(gl.MAX)
      gl.bindVertexArray(this.vao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
      if (f > 1) this.endHalo(false, f)
    }

    // 2. Background underneath everything drawn so far.
    gl.blendEquation(gl.FUNC_ADD)
    gl.bindVertexArray(this.postVao)
    if (!transparent) {
      gl.useProgram(this.post.prog)
      const bg = hexToRgb(m.background)
      gl.uniform1i(this.post.loc.get("uPostMode")!, 0)
      gl.uniform4f(this.post.loc.get("uBg")!, bg[0], bg[1], bg[2], 1)
      gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(this.vao)
    // 3. Shadows: the field sampled at world − offset, quads shifted by the offset.
    if (m.shadow > 0 && n > 0) {
      const f = haloFactor(m.shadowSoft * view.scale, n)
      const res = f > 1 ? this.beginHalo(f) : undefined
      this.setEnv(this.halo, frame, f > 1 ? { ...view, scale: view.scale / f } : view, m.shadowSoft + (3 * f) / view.scale, [m.shadowX, m.shadowY], res)
      const L = this.halo.loc
      gl.uniform1i(L.get("uHaloMode")!, 1)
      gl.uniform3fv(L.get("uShadowColor")!, hexToRgb(m.shadowColor))
      gl.uniform2f(L.get("uShadow")!, m.shadow, m.shadowSoft)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.bindVertexArray(this.vao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n)
      if (f > 1) {
        this.endHalo(true, f)
        gl.bindVertexArray(this.vao)
      }
    }

    // 4. Bodies in z-order: runs of one instance kind share a program.
    if (n > 0) {
      for (const pr of [this.cluster, this.solo]) {
        this.setEnv(pr, frame, view, 0, [0, 0])
        const L = pr.loc
        gl.uniform3fv(L.get("uAur0")!, hexToRgb(m.aurora[0]))
        gl.uniform3fv(L.get("uAur1")!, hexToRgb(m.aurora[1]))
        gl.uniform3fv(L.get("uAur2")!, hexToRgb(m.aurora[2]))
        gl.uniform2f(L.get("uAurora")!, m.auroraScale, m.auroraSpeed)
        gl.uniform3fv(L.get("uDepthColor")!, hexToRgb(m.depthColor))
        gl.uniform1f(L.get("uDepth")!, m.depth)
        gl.uniform3fv(L.get("uOverlapColor")!, hexToRgb(m.overlapColor))
        gl.uniform1f(L.get("uOverlap")!, m.overlap)
      }
      const I = p.instances
      let start = 0
      while (start < n) {
        const kind = I[start * INSTANCE_FLOATS + 10]
        let end = start + 1
        while (end < n && I[end * INSTANCE_FLOATS + 10] === kind) end++
        gl.useProgram((kind === INSTANCE.solo ? this.solo : this.cluster).prog)
        this.bindInstances(start)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, end - start)
        start = end
      }
      this.bindInstances(0)
    }

    // 5. Grain: rgb ± noise × alpha, alpha untouched.
    if (m.grain > 0) {
      gl.useProgram(this.post.prog)
      gl.bindVertexArray(this.postVao)
      gl.uniform1f(this.post.loc.get("uGrain")!, m.grain)
      gl.uniform1f(this.post.loc.get("uTime")!, frame.time)
      gl.blendFuncSeparate(gl.DST_ALPHA, gl.ONE, gl.ZERO, gl.ONE)
      gl.uniform1i(this.post.loc.get("uPostMode")!, 1)
      gl.blendEquation(gl.FUNC_ADD)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.uniform1i(this.post.loc.get("uPostMode")!, 2)
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.blendEquation(gl.FUNC_ADD)
    }
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    this.canvas.removeEventListener("webglcontextlost", this.onLost)
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
    gl.deleteTexture(this.primTex)
    gl.deleteTexture(this.layerTex)
    gl.deleteTexture(this.lookTex)
    if (this.haloTex) gl.deleteTexture(this.haloTex)
    if (this.haloFbo) gl.deleteFramebuffer(this.haloFbo)
    this.haloTex = null
    this.haloFbo = null
    gl.deleteBuffer(this.instanceBuffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteVertexArray(this.postVao)
    for (const p of [this.cluster, this.solo, this.halo, this.post]) gl.deleteProgram(p.prog)
    // The context is not force-lost: React StrictMode remounts on the same canvas.
  }
}
