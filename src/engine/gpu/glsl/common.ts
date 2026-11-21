// Shared GLSL chunks: distance functions (mirror sdf.ts), data access with 2D
// addressing (mirror pack.ts), noise and warps (mirror frame.ts), the
// cluster fold (mirror frame.ts / operators.ts).
import { KIND, LAYER_TEXELS, LOOK_TEXELS, MAX_CLUSTER, MAX_GLYPH_PRIMS, PRIM_TEXELS } from "../pack"

export const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define BIG 1e5
#define MAX_CLUSTER ${MAX_CLUSTER}
#define MAX_GLYPH_PRIMS ${MAX_GLYPH_PRIMS}
`

/** Uniforms every program shares (view and environment). */
export const env = `
uniform vec2 uRes;
uniform vec3 uView;      // centre x, centre y, pixels per module
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uWave;      // amplitude, frequency, speed
uniform vec3 uFlow;      // amplitude, scale, speed
uniform vec2 uPull;      // strength, radius
`

export const sdf = `
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

float sdBox(vec2 p, vec4 b) {
  vec2 c = (b.xy + b.zw) * 0.5;
  vec2 q = abs(p - c) - (b.zw - b.xy) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// r: top-left, top-right, bottom-right, bottom-left
float sdRoundBox4(vec2 p, vec2 c, vec2 h, vec4 r) {
  vec2 q0 = p - c;
  float rr = q0.x > 0.0 ? (q0.y > 0.0 ? r.y : r.z) : (q0.y > 0.0 ? r.x : r.w);
  rr = min(rr, min(h.x, h.y));
  vec2 q = abs(q0) - h + rr;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rr;
}

float sdEllipse(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  float k0 = length(q);
  float k1 = length(q / r);
  if (k1 < 1e-9) return -min(r.x, r.y);
  return k0 * (k0 - 1.0) / k1;
}

float sdWedge(vec2 q, float sinH, float cosH) {
  float t = max(q.x * sinH + q.y * cosH, 0.0);
  float d = length(q - vec2(sinH, cosH) * t);
  return q.x * cosH - q.y * sinH < 0.0 ? -d : d;
}

// t0: kind, cx, cy, r | t1: r0, sx, sy, full | t3: rotC, rotS, sinH, cosH
float sdSector(vec2 p, vec4 t0, vec4 t1, vec4 t3) {
  vec2 S = t1.yz;
  vec2 q = (p - t0.yz) / S;
  float len = length(q);
  float radial = t1.x > 0.0 ? abs(len - (t0.w + t1.x) * 0.5) - (t0.w - t1.x) * 0.5 : len - t0.w;
  float d = radial;
  if (t1.w < 0.5) {
    vec2 r = vec2(abs(t3.x * q.x - t3.y * q.y), t3.y * q.x + t3.x * q.y);
    d = max(radial, sdWedge(r, t3.z, t3.w));
  }
  return d * min(S.x, S.y);
}

float sdPolygon4(vec2 p, vec2 a, vec2 b, vec2 c, vec2 e, int n) {
  vec2 v[4] = vec2[4](a, b, c, e);
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    int j = i == 0 ? n - 1 : i - 1;
    vec2 ed = v[j] - v[i], w = p - v[i];
    vec2 bb = w - ed * clamp(dot(w, ed) / max(dot(ed, ed), 1e-12), 0.0, 1.0);
    d = min(d, dot(bb, bb));
    bvec3 cc = bvec3(p.y >= v[i].y, p.y < v[j].y, ed.x * w.y > ed.y * w.x);
    if (all(cc) || all(not(cc))) s = -s;
  }
  return s * sqrt(d);
}

float sdStarUnit(vec2 p, float n, float k) {
  float an = 3.14159265 / n;
  float b = abs(mod(atan(p.x, p.y) + an, 2.0 * an) - an);
  vec2 q = length(p) * vec2(sin(b), cos(b));
  vec2 e = k * vec2(sin(an), cos(an)) - vec2(0.0, 1.0);
  vec2 qv = q - vec2(0.0, 1.0);
  float t = clamp(dot(qv, e) / dot(e, e), 0.0, 1.0);
  float d = length(qv - e * t);
  return e.x * qv.y - e.y * q.x < 0.0 ? -d : d;
}

// t0: kind, cx, cy, sides | t1: k, sx, sy, round
float ngonRaw(vec2 p, vec4 t0, vec4 t1) {
  float sh = 1.0 - t1.w;
  return sdStarUnit((p - t0.yz) / t1.yz / sh, t0.w, t1.x) * sh - t1.w;
}
float sdNgon(vec2 p, vec4 t0, vec4 t1) {
  float v = ngonRaw(p, t0, t1);
  float e = 1e-3 * min(t1.y, t1.z);
  vec2 g = vec2(ngonRaw(p + vec2(e, 0.0), t0, t1) - v, ngonRaw(p + vec2(0.0, e), t0, t1) - v) / e;
  float gl = length(g);
  return gl > 1e-6 ? v / gl : v * min(t1.y, t1.z);
}
`

export const data = `
uniform sampler2D uPrims;
uniform sampler2D uLayers;
uniform sampler2D uLooks;
vec4 prim(int i, int slot) { return texelFetch(uPrims, ivec2((i & 127) * ${PRIM_TEXELS} + slot, i >> 7), 0); }
vec4 lay(int i, int slot) { return texelFetch(uLayers, ivec2(slot, i), 0); }
vec4 look(int i, int slot) { return texelFetch(uLooks, ivec2(slot, i), 0); }
#define LAYER_TEXELS ${LAYER_TEXELS}
#define LOOK_TEXELS ${LOOK_TEXELS}

/** Field of a geometric module (box, ellipse, sector, poly, ngon). */
float geoField(int kind, int i, vec2 p, vec4 t0) {
  vec4 t1 = prim(i, 1);
  if (kind == ${KIND.box}) return sdRoundBox4(p, t0.yz, vec2(t0.w, t1.x), vec4(t1.yzw, prim(i, 2).x));
  if (kind == ${KIND.ellipse}) return sdEllipse(p, t0.yz, vec2(t0.w, t1.x));
  if (kind == ${KIND.sector}) return sdSector(p, t0, t1, prim(i, 3));
  if (kind == ${KIND.poly}) { vec4 a = prim(i, 3), b = prim(i, 4); return sdPolygon4(p, a.xy, a.zw, b.xy, b.zw, int(t0.y + 0.5)); }
  return sdNgon(p, t0, t1);
}

/**
 * Parts of a glyph in design units: the body (strokes, arcs, filled modules,
 * cuts, satellites), the distance to contours of modules drawn as outlines,
 * and the cut field. With solo = false every module joins the body (the fold
 * of a merge group sees one field). g: fillet, cutK, attract, ink.
 */
struct Parts { float body; float outl; float cut; float cov; };

/**
 * cov: summed coverage of filled modules (aa = one pixel in design units).
 * Modules that tile share edges where min() reads 0; adding their coverages
 * closes that hairline seam. Only used without fillet and inset.
 */
Parts glyphParts(int start, int count, vec2 p, vec4 g, float shear, float inset, bool solo, float aaD) {
  p.x -= (p.y - 2.5) * shear;
  float body = BIG, cut = BIG, sat = BIG, outl = BIG, cov = 0.0;
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
    } else if (kind == ${KIND.slot}) {
      vec4 t1 = prim(i, 1);
      cut = min(cut, sdCapsule(p, t0.yz, t1.xy, t0.w));
    } else {
      vec4 f = prim(i, 2); // _, mode, dir, neg
      float d = geoField(kind, i, p, t0);
      if (f.w > 0.5) cut = min(cut, d);
      else if (solo && int(f.y + 0.5) == 3) outl = min(outl, abs(d + inset * 0.5));
      else {
        body = inset > 0.0 ? min(body, d + inset * 0.5) : smin(body, d, g.x);
        cov += clamp(0.5 - (d - g.w) / aaD, 0.0, 1.0);
      }
    }
  }
  float d = smax(body, -cut, g.y);
  d = g.z > 0.0 ? smin(d, sat, g.z) : min(d, sat);
  return Parts(d - g.w, outl, cut, cov);
}

float glyphField(int start, int count, vec2 p, vec4 g, float shear, float inset) {
  return glyphParts(start, count, p, g, shear, inset, false, 1.0).body;
}
`

export const noise = `
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
`

/**
 * Fold of a cluster: layers [start, start + count) combined bottom-up.
 * Define WANT_COLOR before this chunk to also track colour and overlap.
 */
export const fold = `
float layerField(int i, vec2 w, float inset) {
  vec4 L0 = lay(i, 0), L1 = lay(i, 1), L2 = lay(i, 2), L6 = lay(i, 6);
  vec2 d = w - L1.xy;
  vec2 lp = vec2(L1.z * d.x + L1.w * d.y, -L1.w * d.x + L1.z * d.y) / L2.x;
  lp.x *= L0.w; // mirror
  lp += L2.yz;
  float b = sdBox(lp, L6);
  if (b > 0.0) return (b + lay(i, 7).x) * L2.x;
  return glyphField(int(L0.x + 0.5), int(L0.y + 0.5), lp, lay(i, 3), L2.w, inset) * L2.x;
}

float front(float acc, float b, float aa) { return clamp(0.5 + 0.5 * (acc - b) / aa, 0.0, 1.0); }

struct Sample { float d; vec3 col; float ov; };

Sample foldCluster(int start, int count, vec2 world, float px, float inset) {
  vec2 w = warp(world);
  float acc = BIG;
  vec3 col = vec3(0.0);
  float ov = 0.0;
  for (int n = 0; n < MAX_CLUSTER; n++) {
    if (n >= count) break;
    int i = start + n;
    float b = layerField(i, w, inset);
#ifdef WANT_COLOR
    vec3 c = lay(i, 5).rgb;
    if (n == 0) { acc = b; col = c; continue; }
    ov = max(ov, clamp(0.5 - acc / px, 0.0, 1.0) * clamp(0.5 - b / px, 0.0, 1.0));
#else
    if (n == 0) { acc = b; continue; }
#endif
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
#ifdef WANT_COLOR
    col = mix(col, lay(i, 5).rgb, wt);
#endif
  }
  return Sample(acc, col, ov);
}
`

/** World point of this fragment: identical for every instance. */
export const worldPoint = `
vec2 worldAt(out float px) {
  px = 1.0 / uView.z;
  return uView.xy + (gl_FragCoord.xy - 0.5 * uRes) * px;
}
`
