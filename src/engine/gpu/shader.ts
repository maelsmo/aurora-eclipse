// GLSL ES 3.00 interpreter of the glyph construction. Mirrors sdf.ts,
// operators.ts and frame.ts; materials live only here.
import { LAYER_TEXELS, MAX_GLYPH_PRIMS, MAX_LAYERS, KIND } from "./pack"

export const vertexSource = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`

export const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define BIG 1e5
#define MAX_LAYERS ${MAX_LAYERS}
#define MAX_GLYPH_PRIMS ${MAX_GLYPH_PRIMS}
#define LAYER_TEXELS ${LAYER_TEXELS}

uniform sampler2D uPrims;
uniform sampler2D uLayers;
uniform int uLayerCount;
uniform vec2 uRes;
uniform vec3 uView;      // centre x, centre y, pixels per module
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uWave;      // amplitude, frequency, speed
uniform vec3 uFlow;      // amplitude, scale, speed
uniform vec2 uPull;      // strength, radius

uniform int uFill;       // 0 fill, 1 outline, 2 isolines, 3 halftone
uniform vec4 uLine;      // line, spacing, rings, dot
uniform int uColorMode;  // 0 layer, 1 aurora, 2 depth
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uAur2;
uniform vec2 uAurora;    // scale, speed
uniform vec3 uDepthColor;
uniform float uDepth;
uniform vec3 uOverlapColor;
uniform float uOverlap;
uniform vec3 uGlowColor;
uniform vec2 uGlow;      // intensity, size
uniform vec3 uShadowColor;
uniform vec4 uShadow;    // opacity, dx, dy, softness
uniform float uGrain;
uniform vec4 uBg;        // rgb, alpha

out vec4 outColor;

/* ---------- distance functions (sdf.ts) ---------- */

float smin(float a, float b, float k) {
  if (k < 1e-5) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - k * 0.5 * (1.0 + h - sqrt(1.0 - h * (h - 2.0)));
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

float sdStroke(vec2 p, vec2 a, vec2 b, float r, float rr) {
  vec2 ba = b - a;
  float l = length(ba);
  if (l < 1e-6) return length(p - a) - r;
  vec2 d = ba / l;
  vec2 q0 = p - (a + b) * 0.5;
  vec2 q = vec2(abs(dot(d, q0)), abs(-d.y * q0.x + d.x * q0.y)) - vec2(l * 0.5 + r - rr, r - rr);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float len = dot(ba, ba);
  float h = len > 0.0 ? clamp(dot(pa, ba) / len, 0.0, 1.0) : 0.0;
  return length(pa - ba * h) - r;
}

// t0: kind, cx, cy, half | t1: ra, sx, sy, round | t2: rotC, rotS, sinH, cosH | t3: end0, end1
float sdArc(vec2 p, vec4 t0, vec4 t1, vec4 t2, vec4 t3, bool full) {
  vec2 S = t1.yz;
  vec2 q = (p - t0.yz) / S;
  float len = max(length(q), 1e-6);
  float grad = length(q / S) / len;
  float ring = abs((len - t1.x) / max(grad, 1e-6)) - t0.w;
  if (full) return ring;
  float rx = t2.x * q.x - t2.y * q.y;
  float x = abs(rx), y = t2.y * q.x + t2.x * q.y;
  float capped = ring;
  if (t2.w * x > t2.z * y) capped = length(p - (rx >= 0.0 ? t3.xy : t3.zw)) - t0.w;
  if (t1.w >= 1.0) return capped;
  float flat_ = max(ring, (x * t2.w - y * t2.z) * min(S.x, S.y));
  return mix(flat_, capped, t1.w);
}

vec4 prim(int i, int slot) { return texelFetch(uPrims, ivec2(slot, i), 0); }
vec4 lay(int i, int slot) { return texelFetch(uLayers, ivec2(slot, i), 0); }

float glyphField(int start, int count, vec2 p, vec4 g, float shear) {
  // g: fillet, cutK, attract, ink
  p.x -= (p.y - 2.5) * shear;
  float body = BIG, cut = BIG, sat = BIG;
  for (int n = 0; n < MAX_GLYPH_PRIMS; n++) {
    if (n >= count) break;
    int i = start + n;
    vec4 t0 = prim(i, 0);
    int kind = int(t0.x + 0.5);
    if (kind == ${KIND.stroke}) {
      vec4 t1 = prim(i, 1);
      body = smin(body, sdStroke(p, t0.yz, t1.xy, t0.w, t0.w * t1.z), g.x);
    } else if (kind == ${KIND.arc} || kind == ${KIND.ring}) {
      float d = sdArc(p, t0, prim(i, 1), prim(i, 2), prim(i, 3), kind == ${KIND.ring});
      body = smin(body, d, g.x);
    } else if (kind == ${KIND.dot}) {
      sat = min(sat, length(p - t0.yz) - t0.w);
    } else if (kind == ${KIND.hole}) {
      cut = min(cut, length(p - t0.yz) - t0.w);
    } else {
      vec4 t1 = prim(i, 1);
      cut = min(cut, sdCapsule(p, t0.yz, t1.xy, t0.w));
    }
  }
  float d = smax(body, -cut, g.y);
  d = g.z > 0.0 ? smin(d, sat, g.z) : min(d, sat);
  return d - g.w;
}

float sdBox(vec2 p, vec4 b) {
  vec2 c = (b.xy + b.zw) * 0.5;
  vec2 q = abs(p - c) - (b.zw - b.xy) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

/* ---------- noise (frame.ts) ---------- */

float hash2(ivec2 i) {
  uint h = (uint(i.x) * 1597334673u) ^ (uint(i.y) * 3812015801u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return float(h) / 4294967295.0;
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 ii = ivec2(i);
  float a = hash2(ii), b = hash2(ii + ivec2(1, 0)), c = hash2(ii + ivec2(0, 1)), d = hash2(ii + ivec2(1, 1));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

vec2 warp(vec2 p) {
  if (uWave.x > 0.0) {
    float ph = uTime * uWave.z * 2.0;
    p.x += uWave.x * sin(p.y * uWave.y + ph);
    p.y += uWave.x * 0.5 * sin(p.x * uWave.y * 0.7 + ph * 1.3);
  }
  if (uFlow.x > 0.0) {
    float s = uFlow.y, tt = uTime * uFlow.z;
    float nx = noise2(vec2(p.x * s + tt, p.y * s)) - 0.5;
    float ny = noise2(vec2(p.x * s + 17.3, p.y * s - tt)) - 0.5;
    p += uFlow.x * 2.0 * vec2(nx, ny);
  }
  if (uPull.x != 0.0) {
    vec2 d = p - uPointer;
    float r = max(uPull.y, 0.1);
    float fall = exp(-dot(d, d) / (r * r));
    p -= d * uPull.x * fall;
  }
  return p;
}

/* ---------- fold (frame.ts / operators.ts) ---------- */

float layerField(int i, vec2 w) {
  vec4 L1 = lay(i, 1), L2 = lay(i, 2), L6 = lay(i, 6);
  vec2 d = w - L1.xy;
  vec2 lp = vec2(L1.z * d.x + L1.w * d.y, -L1.w * d.x + L1.z * d.y) / L2.x + L2.yz;
  float b = sdBox(lp, L6);
  if (b > 0.0) return (b + lay(i, 7).x) * L2.x;
  vec4 L0 = lay(i, 0);
  return glyphField(int(L0.x + 0.5), int(L0.y + 0.5), lp, lay(i, 3), L2.w) * L2.x;
}

float front(float acc, float b, float aa) { return clamp(0.5 + 0.5 * (acc - b) / aa, 0.0, 1.0); }

struct Sample { float d; vec3 col; float ov; };

Sample sampleScene(vec2 world, float px) {
  vec2 w = warp(world);
  float acc = BIG;
  vec3 col = vec3(0.0);
  float ov = 0.0;
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uLayerCount) break;
    float b = layerField(i, w);
    vec3 c = lay(i, 5).rgb;
    if (i == 0) { acc = b; col = c; continue; }
    ov = max(ov, clamp(0.5 - acc / px, 0.0, 1.0) * clamp(0.5 - b / px, 0.0, 1.0));
    int op = int(lay(i, 0).z + 0.5);
    vec4 P = lay(i, 4); // k, gap, t
    float d, wt;
    if (op == 0) { d = min(acc, b); wt = front(acc, b, px); }
    else if (op == 1) { d = smin(acc, b, P.x); wt = clamp(0.5 + 0.5 * (acc - b) / max(P.x, 1e-3), 0.0, 1.0); }
    else if (op == 2) { float b2 = max(b, P.y - acc); d = min(acc, b2); wt = front(acc, b2, px); }
    else if (op == 3) { float a2 = max(acc, P.y - b); d = min(a2, b); wt = front(a2, b, px); }
    else if (op == 4) { d = smax(acc, P.y - b, P.x); wt = 0.0; }
    else if (op == 5) { d = smax(acc, b, P.x); wt = 0.5; }
    else if (op == 6) { d = max(smin(acc, b, P.x), -smax(acc, b, P.x)); wt = front(acc, b, px); }
    else { float t = clamp(P.z, 0.0, 1.0); d = mix(acc, b, t); wt = t; }
    acc = d;
    col = mix(col, c, wt);
  }
  return Sample(acc, col, ov);
}

/* ---------- material ---------- */

vec3 aurora(vec2 p) {
  float t = uTime * uAurora.y;
  vec2 q = p * uAurora.x;
  float n1 = noise2(q + vec2(t, 0.3 * t));
  float n2 = noise2(q * 1.7 - vec2(0.2 * t, t) + n1 * 1.5);
  vec3 c = mix(uAur0, uAur1, smoothstep(0.2, 0.8, n1));
  return mix(c, uAur2, smoothstep(0.35, 0.9, n2));
}

vec4 over(vec4 dst, vec4 src) { return src + dst * (1.0 - src.a); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  float px = 1.0 / uView.z;
  vec2 world = uView.xy + (frag - 0.5 * uRes) * px;
  Sample s = sampleScene(world, px);
  float d = s.d;
  // fwidth jumps across early-exit borders; clamping keeps those seams invisible.
  float aa = clamp(fwidth(d), px * 0.5, px * 3.0);

  float a;
  if (uFill == 1) {
    a = clamp(0.5 - (abs(d) - uLine.x * 0.5) / aa, 0.0, 1.0);
  } else if (uFill == 2) {
    float sp = max(uLine.y, 0.02);
    float band = abs(fract(d / sp + 0.5) - 0.5) * sp;
    float ring = clamp(0.5 - (band - uLine.x * 0.5) / aa, 0.0, 1.0);
    float reach = uLine.z * sp;
    a = ring * (1.0 - smoothstep(reach - sp * 0.5, reach + sp * 0.5, abs(d)));
  } else if (uFill == 3) {
    float c = max(uLine.w, 0.02);
    vec2 g = world / c;
    vec2 f = (g - floor(g) - 0.5) * c;
    float depth = clamp(0.5 - d / (2.5 * c), 0.0, 1.0);
    float r = c * 0.58 * sqrt(depth);
    float l = length(f);
    a = clamp(0.5 - (l - r) / max(fwidth(l), px * 0.5), 0.0, 1.0) * step(0.001, depth);
  } else {
    a = clamp(0.5 - d / aa, 0.0, 1.0);
  }

  vec3 col = s.col;
  if (uColorMode == 1) col = aurora(world);
  else if (uColorMode == 2) col = mix(s.col, uDepthColor, smoothstep(0.0, max(uDepth, 0.01), -d));
  if (uOverlap > 0.0) col = mix(col, uOverlapColor, s.ov * uOverlap);

  vec4 o = vec4(uBg.rgb * uBg.a, uBg.a);
  if (uGlow.x > 0.0) {
    float g = clamp(uGlow.x * exp(-max(d, 0.0) / max(uGlow.y, 0.01)), 0.0, 1.0);
    o = over(o, vec4(uGlowColor * g, g));
  }
  if (uShadow.x > 0.0) {
    Sample sh = sampleScene(world - uShadow.yz, px);
    float soft = uShadow.w + aa;
    float sa = uShadow.x * (1.0 - smoothstep(-soft, soft, sh.d));
    o = over(o, vec4(uShadowColor * sa, sa));
  }
  o = over(o, vec4(col * a, a));
  if (uGrain > 0.0) {
    float n = hash2(ivec2(frag) + ivec2(int(floor(uTime * 24.0)) * 7919, 0)) - 0.5;
    o.rgb = clamp(o.rgb + n * uGrain * 0.3 * o.a, vec3(0.0), vec3(o.a));
  }
  outColor = o;
}`
