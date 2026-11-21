// The three instance programs (cluster bodies, halo for corona and shadow)
// and the full-screen post program (background underlay, grain).
import { data, env, fold, header, noise, sdf, worldPoint } from "./common"

/**
 * Instance vertex shader. The quad corners come from gl_VertexID; the local
 * bbox is mapped by the instance matrix, padded by uPad (modules) plus 1.5 px
 * for antialiasing, and shifted by uShift (shadow offset).
 */
export const instanceVertex = `${header}
${env}
layout(location = 0) in vec4 iA;     // matrix columns: m00, m10, m01, m11
layout(location = 1) in vec4 iB;     // tx, ty, opacity, look
layout(location = 2) in vec4 iC;     // layer start, layer count, kind, 0
layout(location = 3) in vec4 iD;     // local bbox x0, y0, x1, y1
layout(location = 4) in vec4 iE;     // colour (solo instances)
uniform float uPad;
uniform vec2 uShift;
flat out ivec4 vRange;
flat out float vOpacity;
flat out vec4 vColor;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float s = max(length(iA.xy), 1e-6);
  float pad = (uPad + 1.5 / uView.z) / s;
  vec2 q = mix(iD.xy - pad, iD.zw + pad, corner);
  vec2 w = vec2(iA.x * q.x + iA.z * q.y, iA.y * q.x + iA.w * q.y) + iB.xy + uShift;
  gl_Position = vec4((w - uView.xy) * uView.z / (0.5 * uRes), 0.0, 1.0);
  vRange = ivec4(int(iC.x + 0.5), int(iC.y + 0.5), int(iB.w + 0.5), int(iC.z + 0.5));
  vOpacity = iB.z;
  vColor = iE;
}`

/** Bodies of merge clusters: the fold with colour plus the look. */
export const clusterFragment = `${header}
#define WANT_COLOR 1
${env}
${sdf}
${data}
${noise}
${fold}
${worldPoint}
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uAur2;
uniform vec2 uAurora;    // scale, speed
uniform vec3 uDepthColor;
uniform float uDepth;
uniform vec3 uOverlapColor;
uniform float uOverlap;
flat in ivec4 vRange;
flat in float vOpacity;
flat in vec4 vColor;
out vec4 outColor;

vec3 aurora(vec2 p) {
  float t = uTime * uAurora.y;
  vec2 q = p * uAurora.x;
  float n1 = noise2(q + vec2(t, 0.3 * t));
  float n2 = noise2(q * 1.7 - vec2(0.2 * t, t) + n1 * 1.5);
  vec3 c = mix(uAur0, uAur1, smoothstep(0.2, 0.8, n1));
  return mix(c, uAur2, smoothstep(0.35, 0.9, n2));
}

void main() {
  float px;
  vec2 world = worldAt(px);
  Sample s = foldCluster(vRange.x, vRange.y, world, px);
  float d = s.d;
  // Derivatives stay in uniform control flow: outside branches and loops.
  float aa = clamp(fwidth(d), px * 0.5, px * 3.0);
  vec4 K0 = look(vRange.z, 0), K1 = look(vRange.z, 1);
  int mode = int(K0.x + 0.5);
  float cell = max(K1.x, 0.02);
  vec2 g = world / cell;
  float l = length((g - floor(g) - 0.5) * cell);
  float aaL = max(fwidth(l), px * 0.5);

  float a;
  if (mode == 1) {
    a = clamp(0.5 - (abs(d) - K0.y * 0.5) / aa, 0.0, 1.0);
  } else if (mode == 2) {
    float sp = max(K0.z, 0.02);
    float band = abs(fract(d / sp + 0.5) - 0.5) * sp;
    float ring = clamp(0.5 - (band - K0.y * 0.5) / aa, 0.0, 1.0);
    float reach = K0.w * sp;
    a = ring * (1.0 - smoothstep(reach - sp * 0.5, reach + sp * 0.5, abs(d)));
  } else if (mode == 3) {
    float depth = clamp(0.5 - d / (2.5 * cell), 0.0, 1.0);
    float r = cell * 0.58 * sqrt(depth);
    a = clamp(0.5 - (l - r) / aaL, 0.0, 1.0) * step(0.001, depth);
  } else {
    a = clamp(0.5 - d / aa, 0.0, 1.0);
  }

  int cm = int(K1.y + 0.5);
  vec3 col = s.col;
  if (cm == 1) col = aurora(world);
  else if (cm == 2) col = mix(s.col, uDepthColor, smoothstep(0.0, max(uDepth, 0.01), -d));
  if (uOverlap > 0.0) col = mix(col, uOverlapColor, s.ov * uOverlap);
  a *= vOpacity;
  outColor = vec4(col * a, a);
}`

/** Field-only pass: corona (uHaloMode 0, MAX blending) or shadow (1, over). */
export const haloFragment = `${header}
${env}
${sdf}
${data}
${noise}
${fold}
${worldPoint}
uniform int uHaloMode;
uniform vec2 uShift;
uniform vec3 uGlowColor;
uniform vec2 uGlow;      // intensity, size
uniform vec3 uShadowColor;
uniform vec2 uShadow;    // opacity, softness
flat in ivec4 vRange;
flat in float vOpacity;
flat in vec4 vColor;
out vec4 outColor;
void main() {
  float px;
  vec2 world = worldAt(px);
  float d = foldCluster(vRange.x, vRange.y, world - uShift, px).d;
  float aa = clamp(fwidth(d), px * 0.5, px * 3.0);
  if (uHaloMode == 0) {
    float g = clamp(uGlow.x * exp(-max(d, 0.0) / max(uGlow.y, 0.01)), 0.0, 1.0) * vOpacity;
    outColor = vec4(uGlowColor * g, g);
  } else {
    float soft = uShadow.y + aa;
    float sa = uShadow.x * (1.0 - smoothstep(-soft, soft, d)) * vOpacity;
    outColor = vec4(uShadowColor * sa, sa);
  }
}`

export const postVertex = `${header}
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID >> 1) * 4 - 1));
  gl_Position = vec4(p, 0.0, 1.0);
}`

/** uPostMode 0: background colour; 1 / 2: positive / negative half of the grain. */
export const postFragment = `${header}
${noise.split("vec2 warp(")[0]}
uniform int uPostMode;
uniform vec4 uBg;
uniform float uGrain;
uniform float uTime;
out vec4 outColor;
void main() {
  if (uPostMode == 0) { outColor = vec4(uBg.rgb * uBg.a, uBg.a); return; }
  float n = hash2(ivec2(gl_FragCoord.xy) + ivec2(int(floor(uTime * 24.0)) * 7919, 0)) - 0.5;
  float v = (uPostMode == 1 ? max(n, 0.0) : max(-n, 0.0)) * uGrain * 0.3;
  outColor = vec4(vec3(v), 0.0);
}`
