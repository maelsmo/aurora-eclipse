import { fieldFor, readDistance, ORIGIN, SPAN, SIZE } from "./fields"
import {
  modes,
  formMotion,
  placement,
  viewSize,
  type Scene,
  type Motion,
} from "./model"

const smoothMin = (a: number, b: number, k: number) =>
  Math.min(a, b) - Math.max(k - Math.abs(a - b), 0) ** 2 / (4 * k)

export function sampler(s: Scene, m: Motion) {
  const f = fieldFor(s.a),
    g = s.b === "—" ? null : fieldFor(s.b)
  const shift = placement(s, m),
    weight = (s.weight - 50) * 0.11,
    k = 0.2 + s.softness * 0.19
  const { bend, stretch } = formMotion(s, m),
    soft = s.softness * 0.01
  return (x: number, y: number) => {
    x += bend * Math.max(0, 1 - (y / 52) ** 2)
    y *= stretch
    const a =
      readDistance(f, x + 48 + shift.x / 2, y + 50 + shift.y / 2, soft) - weight
    if (!g) return a
    const b =
      readDistance(g, x + 48 - shift.x / 2, y + 50 - shift.y / 2, soft) - weight
    switch (s.mode) {
      case "fusion":
        return smoothMin(a, b, k * 1.8)
      case "cut":
        return -smoothMin(-a, b, k)
      case "intersection":
        return -smoothMin(-a, -b, k)
      case "xor":
        return Math.max(smoothMin(a, b, k), smoothMin(-a, -b, k))
      default:
        return Math.min(a, -smoothMin(-b, a - (1.4 + k * 0.27), k))
    }
  }
}

const fragment = `
precision highp float;
uniform sampler2D uA, uB;
uniform vec2 uSize, uView, uShift, uDeform;
uniform float uRound;
uniform vec3 uColor;
uniform float uWeight, uSoft, uAA, uSolo;
uniform int uMode;
float sampleField(sampler2D glyph,vec2 point) {
  vec2 uv=(point-vec2(${ORIGIN.toFixed(1)}))/${SPAN.toFixed(1)};
  if(any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return 39.75;
  vec4 samples=texture2D(glyph,uv);
  return mix(samples.r,samples.a,uRound)*63.75-24.0;
}
float smin(float a,float b,float k) {
  float h=max(k-abs(a-b),0.0);
  return min(a,b)-h*h/(4.0*k);
}
void main() {
  vec2 p=(gl_FragCoord.xy/uSize-.5)*uView;
  p.y=-p.y;
  p.x+=uDeform.x*max(0.,1.-p.y*p.y/(52.*52.));
  p.y*=uDeform.y;
  float a=sampleField(uA,p+vec2(48.,50.)+uShift*.5)-uWeight;
  float b=sampleField(uB,p+vec2(48.,50.)-uShift*.5)-uWeight;
  float d=a;
  if(uSolo<.5) {
    if(uMode==0) d=min(a,-smin(-b,a-(1.4+uSoft*.27),uSoft));
    if(uMode==1) d=smin(a,b,uSoft*1.8);
    if(uMode==2) d=-smin(-a,b,uSoft);
    if(uMode==3) d=-smin(-a,-b,uSoft);
    if(uMode==4) d=max(smin(a,b,uSoft),smin(-a,-b,uSoft));
  }
  gl_FragColor=vec4(uColor,1.0-smoothstep(-uAA,uAA,d));
}`

export type Draw = (scene: Scene, motion: Motion, zoom: number) => void
export function openRenderer(
  canvas: HTMLCanvasElement,
): { draw: Draw; dispose: () => void } | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!gl) return null
  function compile(kind: number, source: string) {
    const shader = gl!.createShader(kind)!
    gl!.shaderSource(shader, source)
    gl!.compileShader(shader)
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS))
      throw new Error(
        gl!.getShaderInfoLog(shader) ?? "Shader compilation failed",
      )
    return shader
  }
  const vertex = compile(
    gl.VERTEX_SHADER,
    "attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}",
  )
  const frag = compile(gl.FRAGMENT_SHADER, fragment)
  const program = gl.createProgram()!
  gl.attachShader(program, vertex)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error("Shader link failed")
  gl.deleteShader(vertex)
  gl.deleteShader(frag)
  gl.useProgram(program)
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  )
  const pos = gl.getAttribLocation(program, "position")
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  const loc = Object.fromEntries(
    [
      "uA",
      "uB",
      "uSize",
      "uView",
      "uShift",
      "uColor",
      "uWeight",
      "uSoft",
      "uAA",
      "uSolo",
      "uMode",
      "uRound",
      "uDeform",
    ].map((n) => [n, gl.getUniformLocation(program, n)]),
  )
  const textures = [gl.createTexture()!, gl.createTexture()!],
    letters = ["", ""]
  function bindLetter(letter: string, index: number) {
    if (letters[index] === letter) return
    gl!.activeTexture(gl!.TEXTURE0 + index)
    gl!.bindTexture(gl!.TEXTURE_2D, textures[index])
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.LUMINANCE_ALPHA,
      SIZE,
      SIZE,
      0,
      gl!.LUMINANCE_ALPHA,
      gl!.UNSIGNED_BYTE,
      fieldFor(letter),
    )
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    letters[index] = letter
  }
  gl.uniform1i(loc.uA, 0)
  gl.uniform1i(loc.uB, 1)
  return {
    draw(s, m, zoom) {
      const { w, h, scale } = viewSize(canvas.width, canvas.height, zoom),
        shift = placement(s, m)
      bindLetter(s.a, 0)
      bindLetter(s.b === "—" ? s.a : s.b, 1)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(loc.uSize, canvas.width, canvas.height)
      gl.uniform2f(loc.uView, w, h)
      gl.uniform2f(loc.uShift, shift.x, shift.y)
      const { bend, stretch } = formMotion(s, m)
      gl.uniform2f(loc.uDeform, bend, stretch)
      gl.uniform1f(loc.uRound, s.softness * 0.01)
      const c = parseInt(s.color.slice(1), 16)
      gl.uniform3f(
        loc.uColor,
        (c >> 16) / 255,
        ((c >> 8) & 255) / 255,
        (c & 255) / 255,
      )
      gl.uniform1f(loc.uWeight, (s.weight - 50) * 0.11)
      gl.uniform1f(loc.uSoft, 0.2 + s.softness * 0.19)
      gl.uniform1f(loc.uAA, 0.7 / scale)
      gl.uniform1f(loc.uSolo, s.b === "—" ? 1 : 0)
      gl.uniform1i(loc.uMode, modes.indexOf(s.mode))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      textures.forEach((t) => gl.deleteTexture(t))
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}

export function rasterize(
  canvas: HTMLCanvasElement,
  s: Scene,
  m: Motion,
  zoom = 1,
) {
  const ctx = canvas.getContext("2d")!,
    { width, height } = canvas
  const field = sampler(s, m),
    { scale } = viewSize(width, height, zoom)
  const img = ctx.createImageData(width, height),
    rgb = parseInt(s.color.slice(1), 16)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const d = field(
        (x + 0.5 - width / 2) / scale,
        (y + 0.5 - height / 2) / scale,
      )
      if (d > 1 / scale) continue
      const i = (y * width + x) * 4
      img.data[i] = rgb >> 16
      img.data[i + 1] = (rgb >> 8) & 255
      img.data[i + 2] = rgb & 255
      img.data[i + 3] = 255 * Math.max(0, Math.min(1, 0.5 - d * scale))
    }
  ctx.putImageData(img, 0, 0)
}
