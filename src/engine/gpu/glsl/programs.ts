// Instance programs (cluster bodies, solo bodies, halo for corona and shadow)
// and the full-screen post program (background underlay, grain).
import { data, env, fold, header, layerFn, maskFn, noise, sdf, worldPoint } from "./common"
import { INSTANCE } from "../pack"

/**
 * Instance vertex shader. The quad corners come from gl_VertexID; the local
 * bbox is mapped by the instance matrix, padded by uPad (world modules) plus
 * 1.5 px for antialiasing, and shifted by uShift (shadow offset). The inverse
 * matrix goes to the fragment stage as flat varyings.
 */
export const instanceVertex = `${header}
${env}
layout(location = 0) in vec4 iA;     // matrix columns: m00, m10, m01, m11 (local → world)
layout(location = 1) in vec4 iB;     // tx, ty, opacity, look
layout(location = 2) in vec4 iC;     // layer start / glyph record, layer count, kind, scale
layout(location = 3) in vec4 iD;     // local bbox x0, y0, x1, y1
layout(location = 4) in vec4 iE;     // colour (solo instances)
uniform float uPad;
uniform vec2 uShift;
flat out ivec4 vRange;   // start, count, look, kind
flat out float vOpacity;
flat out vec4 vColor;
flat out vec4 vInv;      // inverse linear part (columns)
flat out vec3 vT;        // translation, scale
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float s = max(iC.w, 1e-6);
  float pad = (uPad + 1.5 / uView.z) / s;
  vec2 q = mix(iD.xy - pad, iD.zw + pad, corner);
  vec2 w = vec2(iA.x * q.x + iA.z * q.y, iA.y * q.x + iA.w * q.y) + iB.xy + uShift;
  gl_Position = vec4((w - uView.xy) * uView.z / (0.5 * uRes), 0.0, 1.0);
  vRange = ivec4(int(iC.x + 0.5), int(iC.y + 0.5), int(iB.w + 0.5), int(iC.z + 0.5));
  vOpacity = iB.z;
  vColor = iE;
  float det = iA.x * iA.w - iA.z * iA.y;
  vInv = vec4(iA.w, -iA.y, -iA.z, iA.x) / det;
  vT = vec3(iB.xy, s);
}`

const varyingsIn = `
flat in ivec4 vRange;
flat in float vOpacity;
flat in vec4 vColor;
flat in vec4 vInv;
flat in vec3 vT;
`

/** Look shading shared by bodies: alpha from the field, colour modes. */
const shading = `
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uAur2;
uniform vec2 uAurora;    // scale, speed
uniform vec3 uDepthColor;
uniform float uDepth;
uniform vec3 uOverlapColor;
uniform float uOverlap;

vec3 aurora(vec2 p) {
  float t = uTime * uAurora.y;
  vec2 q = p * uAurora.x;
  float n1 = noise2(q + vec2(t, 0.3 * t));
  float n2 = noise2(q * 1.7 - vec2(0.2 * t, t) + n1 * 1.5);
  vec3 c = mix(uAur0, uAur1, smoothstep(0.2, 0.8, n1));
  return mix(c, uAur2, smoothstep(0.35, 0.9, n2));
}

// K0: mode, line, spacing, rings | K1: dot, colour mode, inset, _ | K2: stripes, stripe fill
float lookAlpha(float d, float aa, float l, float aaL, float cell, vec4 K0, vec4 K2, float px) {
  int mode = int(K0.x + 0.5);
  // Lines on a merged form: stripes follow its contour, in world units.
  if (mode == 4) return clamp(0.5 - d / aa, 0.0, 1.0) * stripeCov(-d, K2.xy, px);
  if (mode == 1) return clamp(0.5 - (abs(d) - K0.y * 0.5) / aa, 0.0, 1.0);
  if (mode == 2) {
    float sp = max(K0.z, 0.02);
    float band = abs(fract(d / sp + 0.5) - 0.5) * sp;
    float ring = clamp(0.5 - (band - K0.y * 0.5) / aa, 0.0, 1.0);
    float reach = K0.w * sp;
    return ring * (1.0 - smoothstep(reach - sp * 0.5, reach + sp * 0.5, abs(d)));
  }
  if (mode == 3) {
    float depth = clamp(0.5 - d / (2.5 * cell), 0.0, 1.0);
    float r = cell * 0.58 * sqrt(depth);
    return clamp(0.5 - (l - r) / aaL, 0.0, 1.0) * step(0.001, depth);
  }
  return clamp(0.5 - d / aa, 0.0, 1.0);
}

vec3 lookColor(vec3 base, float d, vec2 world, float cm, float ov) {
  vec3 col = base;
  int m = int(cm + 0.5);
  if (m == 1) col = aurora(world);
  else if (m == 2) col = mix(base, uDepthColor, smoothstep(0.0, max(uDepth, 0.01), -d));
  if (uOverlap > 0.0) col = mix(col, uOverlapColor, ov * uOverlap);
  return col;
}
`

/** Bodies of merge clusters: the fold with colour plus the look. */
export const clusterFragment = `${header}
#define WANT_COLOR 1
${env}
${sdf}
${data}
${noise}
${fold}
${worldPoint}
${shading}
${varyingsIn}
${maskFn}
out vec4 outColor;
void main() {
  float px;
  vec2 world = worldAt(px);
  vec4 K0 = look(vRange.z, 0), K1 = look(vRange.z, 1), K2 = look(vRange.z, 2);
  Sample s = foldCluster(vRange.x, vRange.y, world, px, K1.z);
  float mask = clamp(0.5 - maskField(warp(world)) / px, 0.0, 1.0);
  float d = s.d;
  // Derivatives stay in uniform control flow: outside branches and loops.
  float aa = clamp(fwidth(d), px * 0.5, px * 3.0);
  float cell = max(K1.x, 0.02);
  vec2 g = world / cell;
  float l = length((g - floor(g) - 0.5) * cell);
  float aaL = max(fwidth(l), px * 0.5);
  // The mask clips like an intersection of fields (min of coverages), as on the CPU.
  float a = min(lookAlpha(d, aa, l, aaL, cell, K0, K2, px), mask) * vOpacity;
  vec3 col = lookColor(s.col, d, world, K1.y, s.ov);
  outColor = vec4(col * a, a);
}`

/**
 * One letter or shape: the glyph is evaluated in its own coordinates through
 * the inverse instance matrix; modules drawn as outlines add their contours.
 */
export const soloFragment = `${header}
${env}
${sdf}
${data}
${noise}
${worldPoint}
${shading}
${layerFn}
${varyingsIn}
${maskFn}
out vec4 outColor;
void main() {
  float px;
  vec2 world = worldAt(px);
  vec4 K0 = look(vRange.z, 0), K1 = look(vRange.z, 1), K2 = look(vRange.z, 2);
  vec2 wp = warp(world);
  vec2 q = mat2(vInv.xy, vInv.zw) * (wp - vT.xy);
  float mask = clamp(0.5 - maskField(wp) / px, 0.0, 1.0);
  int gi = vRange.x;
  vec4 G0 = lay(gi, 0), G7 = lay(gi, 7);
  float sc = vT.z;
  int mode = int(K0.x + 0.5);
  ivec4 R = ivec4(int(G0.x + 0.5), int(G0.y + 0.5), int(G7.y + 0.5), int(G7.z + 0.5));
  Parts P = glyphParts(R, q, lay(gi, 3), lay(gi, 2).w, K1.z, mode, true, px / sc, K2.xyz);
  float d = P.body * sc;
  float dOut = max(P.outl * sc - K0.y * 0.5, -P.cut * sc);
  float aa = clamp(fwidth(d), px * 0.5, px * 3.0);
  float aaO = clamp(fwidth(dOut), px * 0.5, px * 3.0);
  float cell = max(K1.x, 0.02);
  vec2 g = world / cell;
  float l = length((g - floor(g) - 0.5) * cell);
  float aaL = max(fwidth(l), px * 0.5);
  float a;
  // Lines: stroke bodies get inner contour stripes (design units), modules their own stripes.
  if (mode == 4) a = clamp(0.5 - d / aa, 0.0, 1.0) * stripeCov(-P.body, K2.xy, px / sc);
  else a = lookAlpha(d, aa, l, aaL, cell, K0, K2, px);
  float cutCov = clamp(0.5 + P.cut * sc / px, 0.0, 1.0);
  a = max(a, min(1.0, P.lines) * cutCov);
  a = min(max(a, clamp(0.5 - dOut / aaO, 0.0, 1.0)), mask) * vOpacity;
  vec3 col = lookColor(vColor.rgb, d, world, K1.y, 0.0);
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
${varyingsIn}
${maskFn}
out vec4 outColor;
void main() {
  float px;
  vec2 world = worldAt(px) - uShift;
  vec4 K0 = look(vRange.z, 0), K1 = look(vRange.z, 1);
  float d;
  if (vRange.w == ${INSTANCE.solo}) {
    vec2 q = mat2(vInv.xy, vInv.zw) * (warp(world) - vT.xy);
    vec4 G0 = lay(vRange.x, 0), G7 = lay(vRange.x, 7);
    ivec4 R = ivec4(int(G0.x + 0.5), int(G0.y + 0.5), int(G7.y + 0.5), int(G7.z + 0.5));
    // The halo of a solo object surrounds its filled shape (stripes and contours included).
    Parts P = glyphParts(R, q, lay(vRange.x, 3), lay(vRange.x, 2).w, K1.z, 0, false, px / vT.z, vec3(1.0, 0.5, 0.0));
    d = P.body * vT.z;
  } else {
    d = foldCluster(vRange.x, vRange.y, world, px, K1.z).d;
  }
  // Masked content glows and casts shadows as its visible part.
  d = max(d, maskField(warp(world)));
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

/** uPostMode 0: background colour; 1 / 2: positive / negative half of the grain; 3: magnified halo target. */
export const postFragment = `${header}
${noise.split("vec2 warp(")[0]}
uniform int uPostMode;
uniform vec4 uBg;
uniform float uGrain;
uniform float uTime;
uniform vec2 uRes;
uniform sampler2D uHalo;
out vec4 outColor;
void main() {
  if (uPostMode == 0) { outColor = vec4(uBg.rgb * uBg.a, uBg.a); return; }
  if (uPostMode == 3) { outColor = texture(uHalo, gl_FragCoord.xy / uRes); return; }
  float n = hash2(ivec2(gl_FragCoord.xy) + ivec2(int(floor(uTime * 24.0)) * 7919, 0)) - 0.5;
  float v = (uPostMode == 1 ? max(n, 0.0) : max(-n, 0.0)) * uGrain * 0.3;
  outColor = vec4(vec3(v), 0.0);
}`
