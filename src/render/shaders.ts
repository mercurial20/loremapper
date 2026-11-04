/** Shared vertex shader: quads positioned in world cell units. */
export const TILE_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}
`;

/**
 * Noise library. Every world-anchored noise lattice wraps exactly once
 * around the planet (its frequency is snapped so the circumference holds an
 * integer number of cells), so nothing shows a seam at the antimeridian.
 * Requires uniform vec2 uWorldSize.
 */
const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// lattice hashes that repeat every P cells horizontally
float hashP(vec2 c, float P) {
  return hash12(vec2(mod(c.x, P), c.y));
}
vec2 hash2P(vec2 c, float P) {
  return hash22(vec2(mod(c.x, P), c.y));
}
float vnoiseP(vec2 p, float P) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hashP(i, P);
  float b = hashP(i + vec2(1.0, 0.0), P);
  float c = hashP(i + vec2(0.0, 1.0), P);
  float d = hashP(i + vec2(1.0, 1.0), P);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float gnoiseP(vec2 p, float P) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hash2P(i, P) * 2.0 - 1.0;
  vec2 gb = hash2P(i + vec2(1.0, 0.0), P) * 2.0 - 1.0;
  vec2 gc = hash2P(i + vec2(0.0, 1.0), P) * 2.0 - 1.0;
  vec2 gd = hash2P(i + vec2(1.0, 1.0), P) * 2.0 - 1.0;
  float a = dot(ga, f);
  float b = dot(gb, f - vec2(1.0, 0.0));
  float c = dot(gc, f - vec2(0.0, 1.0));
  float d = dot(gd, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
}
// lattice cells per world width for a requested frequency (cycles per map cell)
float periodFor(float k) {
  return max(1.0, floor(uWorldSize.x * k + 0.5));
}
// value noise in [0,1] at ~k cycles per cell, seamless around the planet
float vn(vec2 w, float k, float off) {
  float P = periodFor(k);
  return vnoiseP(w * (P / uWorldSize.x) + off, P);
}
// gradient noise in [-1,1], seamless around the planet
float gn(vec2 w, float k, float off) {
  float P = periodFor(k);
  return gnoiseP(w * (P / uWorldSize.x) + off, P);
}
float fbmW(vec2 w, float k, float off, int octaves) {
  float s = 0.0;
  float a = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * vn(w, k, off + float(i) * 17.1);
    norm += a;
    k *= 2.0;
    a *= 0.5;
  }
  return s / norm;
}
`;

/**
 * Terrain fragment shader. Heights come from an r32float texture fetched
 * manually (float textures are not always filterable); biome weights from two
 * RGBA8 textures; colours from a palette ramp texture built per style.
 */
export const TERRAIN_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uHeight;
uniform sampler2D uBiomeA;
uniform sampler2D uBiomeB;
uniform sampler2D uWater;
// lakes: the level of the water's surface (metres, datum), or below -20000 where there is none
uniform sampler2D uLake;
// whether this tile has any lake near it
uniform float uLakeOn;
// rivers: per cell, for the nearest river (uRiver) and the next nearest (uRiver2), a piece of it:
// its point's offset from the cell's middle with how far its arcs reach ahead and behind, and the
// width slope's bits; half width and the curvature ahead; direction and the curvature behind, all
// packed (see RiverField); whether this tile has any; how visible rivers are
uniform sampler2D uRiver;
uniform sampler2D uRiver2;
uniform float uRiverOn;
uniform float uRiverVis;
// the selected lake: its level, and its bounds (world cells)
uniform float uLakeSelLevel;
uniform vec4 uLakeSel;
uniform sampler2D uRamp;
uniform vec2 uTexOrigin;
uniform float uTexSize;
uniform vec2 uBioOrigin;
uniform float uBioSize;
uniform vec2 uWatOrigin;
uniform float uWatSize;

uniform float uSea;
uniform float uMaxElev;
uniform float uMinElev;
uniform float uZoom;
uniform float uHillshade;
uniform float uExaggeration;
uniform float uCellKm;
uniform float uContours;
uniform float uContourInterval;
uniform float uOverlay;
uniform float uGraticule;
uniform float uFlat;
uniform float uGridStep;
uniform float uRipples;
uniform float uBiomeOpacity;
uniform float uBiomePattern;
uniform vec3 uPaper;
uniform float uPaperAmount;
uniform float uGrain;
uniform float uStains;
uniform vec3 uCoastInk;
uniform float uCoastWidth;
uniform vec3 uRippleColor;
uniform float uRippleAlpha;
uniform vec3 uContourColor;
uniform vec3 uShadowTint;
uniform vec2 uWorldSize;
uniform float uSeed;
// stylisation: cel-shaded light bands, colour levels, screen-pixel blocks, engraved hatching
uniform float uCel;
uniform float uPosterize;
uniform float uPixel;
uniform float uHatch;
// painted water: shown with the Rivers & roads layer (its opacity, 0 when hidden)
uniform float uWaterVis;
// biome edges: 0 crisp … 1 soft, wide fringes
uniform float uBiomeSoft;
// the fine relief of real land (see reliefGPU.ts)
uniform sampler2D uDetailAtlas;
uniform sampler2D uDetailInfo;
uniform sampler2D uDetailField;
uniform float uDetailOn;
uniform vec2 uDetailScale;
uniform float uDetailPatch;
uniform vec2 uFieldSize;
uniform vec4 uDetailRuns0;
uniform vec4 uDetailRuns1;
uniform vec4 uDetailRuns2;

${NOISE}

float hAt(vec2 w) {
  vec2 t = w - uTexOrigin - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  ivec2 p = ivec2(clamp(i, vec2(0.0), vec2(uTexSize - 2.0)));
  float a = texelFetch(uHeight, p, 0).r;
  float b = texelFetch(uHeight, p + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, p + ivec2(0, 1), 0).r;
  float d = texelFetch(uHeight, p + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// cubic B-spline weights
vec4 bspline(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(
    (1.0 - 3.0 * t + 3.0 * t2 - t3) / 6.0,
    (4.0 - 6.0 * t2 + 3.0 * t3) / 6.0,
    (1.0 + 3.0 * t + 3.0 * t2 - 3.0 * t3) / 6.0,
    t3 / 6.0);
}

// height and its gradient (m per cell) from the same B-spline, so close-up
// shading is smooth instead of faceted along cell edges
vec3 hSmoothGrad(vec2 w) {
  vec2 t = w - uTexOrigin - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec4 wx = bspline(f.x);
  vec4 wy = bspline(f.y);
  vec4 dx = vec4(-0.5 * (1.0 - f.x) * (1.0 - f.x), 1.5 * f.x * f.x - 2.0 * f.x, 0.5 + f.x - 1.5 * f.x * f.x, 0.5 * f.x * f.x);
  vec4 dy = vec4(-0.5 * (1.0 - f.y) * (1.0 - f.y), 1.5 * f.y * f.y - 2.0 * f.y, 0.5 + f.y - 1.5 * f.y * f.y, 0.5 * f.y * f.y);
  ivec2 p = ivec2(clamp(i, vec2(1.0), vec2(uTexSize - 3.0)));
  vec3 s = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    float row = 0.0;
    float drow = 0.0;
    for (int x = 0; x < 4; x++) {
      float v = texelFetch(uHeight, p + ivec2(x - 1, y - 1), 0).r;
      row += wx[x] * v;
      drow += dx[x] * v;
    }
    s += vec3(wy[y] * row, wy[y] * drow, dy[y] * row);
  }
  return s;
}

vec3 ramp(float row, float t) {
  return texture(uRamp, vec2(clamp(t, 0.0, 1.0) * (254.0 / 256.0) + 1.0 / 256.0, (row + 0.5) / 4.0)).rgb;
}
vec3 biomeColor(float i) {
  return texture(uRamp, vec2((i + 0.5) / 8.0, 3.5 / 4.0)).rgb;
}

// painted tree crowns on a lattice of P cells around the planet: crown colour + coverage,
// and how much the crowns shade the ground between them
vec4 trees(vec2 p, float P, float density, vec3 base, out float groundShadow) {
  vec2 cell = floor(p);
  vec4 best = vec4(0.0);
  float bestY = -1e9;
  float shadow = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      vec2 h = hash2P(c + vec2(0.0, uSeed), P);
      if (hashP(c + vec2(0.0, 3.1), P) > density) continue;
      vec2 ctr = c + 0.5 + (h - 0.5) * 0.75;
      float r = 0.46 + 0.14 * h.x;
      vec2 d = p - ctr;
      // cast shadow (down-right)
      float sd = length(d - vec2(0.16, 0.2) * r) / r;
      shadow = max(shadow, 1.0 - smoothstep(0.75, 1.05, sd));
      float dist = length(d * vec2(1.0, 1.08)) / r;
      if (dist < 1.0 && ctr.y > bestY) {
        bestY = ctr.y;
        float lit = 1.0 - length(d + vec2(0.28, 0.34) * r) / (r * 1.5);
        vec3 col = base * (0.72 + 0.55 * clamp(lit, 0.0, 1.0)) * (0.92 + 0.16 * h.y);
        float rim = smoothstep(0.78, 0.98, dist);
        col = mix(col, base * 0.38, rim * 0.85);
        best = vec4(col, 1.0 - smoothstep(0.96, 1.0, dist));
      }
    }
  }
  groundShadow = shadow;
  return best;
}

// patchwork fields; p is in lattice units with P lattice cells per world width
vec3 fields(vec2 p, float P, vec3 base, float lod) {
  vec2 macro = floor(p / 3.0);
  float ang = hashP(macro + vec2(0.0, 7.0), max(1.0, floor(P / 3.0))) * 3.14159;
  vec2 local = p - macro * 3.0;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 q = R * local * 1.6 + vec2(mod(macro.x, max(1.0, floor(P / 3.0))), macro.y) * 5.0;
  vec2 fc = floor(q);
  float hv = hash12(fc + 11.0 + uSeed);
  vec3 tint = hv < 0.33 ? base * vec3(1.05, 1.02, 0.85) : hv < 0.66 ? base * vec3(0.85, 0.98, 0.78) : base * vec3(1.0, 0.9, 0.75);
  vec2 fq = fract(q);
  float furrow = 0.5 + 0.5 * sin((hv < 0.5 ? fq.x : fq.y) * 40.0);
  tint *= mix(1.0, 0.9 + 0.1 * furrow, lod);
  float edge = min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y));
  float hedge = 1.0 - smoothstep(0.0, 0.06, edge);
  return mix(mix(base, tint, lod), base * 0.55, hedge * 0.7 * lod);
}

// fractal coast detail; octaves finer than a few screen pixels are dropped
float coastDetail(vec2 w) {
  float s = 0.0;
  float a = 0.75;
  float f = 0.45;
  for (int i = 0; i < 9; i++) {
    float periodPx = uZoom / f;
    float fade = smoothstep(2.5, 7.0, periodPx);
    if (fade <= 0.0) break;
    s += a * fade * (vn(w, f, float(i) * 17.31 + uSeed) - 0.5);
    f *= 2.0;
    a *= 0.52;
  }
  return s;
}

// sub-cell relief for close-ups: gentle in lowlands, ridged in mountains
float reliefDetail(vec2 w, float mountain) {
  float s = 0.0;
  float a = 1.0;
  float f = 1.2;
  for (int i = 0; i < 6; i++) {
    float periodPx = uZoom / f;
    float fade = smoothstep(3.0, 10.0, periodPx);
    if (fade <= 0.0) break;
    float n = gn(w, f, float(i) * 13.7 + uSeed);
    float r = 1.0 - abs(n);
    s += a * fade * mix(n * 0.5, r * r - 0.45, mountain);
    f *= 2.0;
    a *= 0.5;
  }
  return s;
}

// ---------- the fine relief of real land ----------
/** How much the hillshade exaggerates the detail's slopes, next to the map's broad ones. */
const float DETAIL_SHADE = 0.12;
uint hashU(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v.x ^ v.y ^ v.z;
}
float hashN(ivec2 n, int k) {
  return float(hashU(uvec3(uvec2(n + 1000000), uint(k))) & 0xffffffu) / 16777216.0;
}
/** The run of the atlas holding the patches of a scale and a kind (0 alpine, 1 hills, 2 plateau): start, count. */
vec2 detailRun(int s, int kind) {
  int i = s * 3 + kind;
  vec4 r = i < 2 ? uDetailRuns0 : (i < 4 ? uDetailRuns1 : uDetailRuns2);
  return (i % 2 == 0) ? r.xy : r.zw;
}
/**
 * The relief detail (m) of scale s at world point w: patches of real land laid on a jittered
 * lattice, each of the kind of land where it lies, turned to fall the way the land falls, as
 * strong next to the land's relief as it was next to its own; blended keeping its strength.
 */
float realRelief(vec2 w, int s, float pc, float reliefK, int salt, float cellMy) {
  float sideM = uDetailPatch * pc;
  float spacing = 0.5 * sideM / cellMy;
  // planets: a cell is narrower than it is tall away from the equator
  float xs = uFlat > 0.5 ? 1.0 : max(0.05, cos((0.5 - w.y / uWorldSize.y) * 3.14159265));
  ivec2 b = ivec2(floor(w / spacing));
  float sumWV = 0.0;
  float sumW2 = 0.0;
  float atlasSide = 16.0 * uDetailPatch;
  for (int dj = -1; dj <= 1; dj++)
    for (int di = -1; di <= 1; di++) {
      ivec2 n = b + ivec2(di, dj);
      vec2 c = (vec2(n) + 0.5 + (vec2(hashN(n, salt + 1), hashN(n, salt + 2)) - 0.5) * 0.6) * spacing;
      vec2 d = w - c;
      if (uFlat < 0.5) d.x -= uWorldSize.x * floor(d.x / uWorldSize.x + 0.5);
      vec2 dm = vec2(d.x * xs, d.y) * cellMy;
      float dist = length(dm) / (0.5 * sideM);
      if (dist >= 1.0) continue;
      vec2 fc = floor(c / 4.0);
      if (uFlat < 0.5) fc.x = mod(fc.x, uFieldSize.x);
      vec4 f = texelFetch(uDetailField, ivec2(clamp(fc, vec2(0.0), uFieldSize - 1.0)), 0);
      float relief = (s == 0 ? f.g : f.b) * reliefK;
      float e = f.a;
      if (e <= 0.0) continue;
      float alpine = smoothstep(700.0, 2200.0, e) * smoothstep(120.0, 450.0, relief);
      float plateau = smoothstep(400.0, 1400.0, e) * (1.0 - smoothstep(60.0, 220.0, relief)) * (1.0 - alpine);
      float u = hashN(n, salt + 3);
      int kind = u < alpine ? 0 : (u < alpine + plateau ? 2 : 1);
      vec2 run = detailRun(s, kind);
      if (run.y < 0.5) run = detailRun(s, 1);
      if (run.y < 0.5) continue;
      float pi = run.x + min(run.y - 1.0, floor(hashN(n, salt + 4) * run.y));
      vec4 inf = texelFetch(uDetailInfo, ivec2(int(pi), 0), 0);
      bool mirror = hashN(n, salt + 5) < 0.5;
      float own = mirror ? -inf.x : inf.x;
      float ang = f.r - own + (hashN(n, salt + 7) - 0.5) * 0.6;
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 pm = dm / pc;
      float lx = pm.x * ca + pm.y * sa;
      float ly = -pm.x * sa + pm.y * ca;
      if (mirror) lx = -lx;
      vec2 lp = clamp(vec2(lx, ly) + 0.5 * uDetailPatch, vec2(0.5), vec2(uDetailPatch - 0.5));
      vec2 tile = vec2(mod(pi, 16.0), floor(pi / 16.0));
      float v = texture(uDetailAtlas, (tile * uDetailPatch + lp) / atlasSide).r * 255.0 - 128.0;
      float cw = cos(dist * 1.5707963);
      float wt = cw * cw;
      // (plains, of little relief, keep only a little of it: their swells, not a texture of hills)
      float calm = 0.25 + 0.75 * smoothstep(40.0 * reliefK, 300.0 * reliefK, relief);
      sumWV += wt * v / 40.0 * inf.y * max(relief, 15.0 * reliefK) * calm;
      sumW2 += wt * wt;
    }
  return sumW2 > 0.0 ? sumWV / sqrt(sumW2) : 0.0;
}

// symbols kept at a readable screen size: blend two power-of-two densities
float lodLevel(float targetPx) {
  return log2(max(uZoom, 1e-3) / targetPx);
}

void main() {
  vec2 w = vWorld;
  if (uPixel > 0.0) {
    // pixel art: the whole map is sampled in blocks of uPixel screen pixels
    float cell = uPixel / uZoom;
    w = (floor(w / cell) + 0.5) * cell;
  }
  float W = uWorldSize.x;
  float px = 1.0 / uZoom; // cells per screen pixel

  // height and gradient (m per cell) for hillshade and coast detail
  float h;
  vec2 grad;
  if (px > 0.7) {
    // zoomed out (several cells per pixel): wide differences and a box-filtered
    // height so coasts don't alias
    float e = clamp(px, 0.75, 3.0);
    float hx = hAt(w + vec2(e, 0.0)) - hAt(w - vec2(e, 0.0));
    float hy = hAt(w + vec2(0.0, e)) - hAt(w - vec2(0.0, e));
    grad = vec2(hx, hy) / (2.0 * e);
    float o = 0.35 * px;
    h = 0.25 * (hAt(w + vec2(-o, -o * 0.4)) + hAt(w + vec2(o, o * 0.4)) + hAt(w + vec2(-o * 0.4, o)) + hAt(w + vec2(o * 0.4, -o)));
  } else {
    vec3 hg = hSmoothGrad(w);
    h = hg.x;
    grad = hg.yz;
  }
  // the fine relief of real land, where the screen shows finer than the map's cells hold (it
  // fades in as each scale's cells grow larger than a pixel); not at the coast or under water
  if (uDetailOn > 0.5 && uPixel <= 0.0) {
    float cellMy = uCellKm * 1000.0;
    float pxm = px * cellMy;
    float ed = 0.5 * px;
    float r0 = 0.0;
    float rx = 0.0;
    float ry = 0.0;
    // octaves: the library's 2 km and 250 m patches, then the 250 m patches again at a quarter
    // and a sixteenth of their size (real relief is self-affine: a hillside's gullies look like a
    // range's valleys, a quarter the size about a third as deep, H ≈ 0.8)
    for (int o = 0; o < 4; o++) {
      int sc = o == 0 ? 1 : 0;
      float pc = o == 0 ? uDetailScale.y : uDetailScale.x * pow(0.25, float(max(0, o - 1)));
      float k = pow(0.25, 0.8 * float(max(0, o - 1)));
      // only what is finer than the map's own cells (coarser, its heights hold it), and only once
      // a pixel shows it (no shimmer)
      float fade = (1.0 - smoothstep(pc * 1.5, pc * 4.0, pxm)) * (1.0 - smoothstep(cellMy * 0.5, cellMy * 1.0, pc));
      if (fade <= 0.0) continue;
      r0 += fade * realRelief(w, sc, pc, k, o * 16, cellMy);
      rx += fade * realRelief(w + vec2(ed, 0.0), sc, pc, k, o * 16, cellMy);
      ry += fade * realRelief(w + vec2(0.0, ed), sc, pc, k, o * 16, cellMy);
    }
    // light and shade only (the coast and the colours of height stay the map's own); the hillshade
    // exaggerates the map's broad slopes many times over, the real slopes of the detail it must not
    float onLand = smoothstep(5.0, 60.0, h - uSea);
    grad += vec2(rx - r0, ry - r0) / ed * onLand * DETAIL_SHADE;
  }
  float gmag = length(grad);
  // fractal detail so coastlines and contours stay crisp & organic when zoomed in;
  // it fades out in deeper water so steep undersea slopes never sprout phantom coasts
  float nearSurface = h < uSea ? 1.0 - smoothstep(15.0, 150.0, uSea - h) : 1.0;
  float hD = h + coastDetail(w) * min(gmag, 3000.0) * 1.3 * nearSurface;

  float s = hD - uSea;
  // in pixel art the height is constant inside a block, so measure the coast in blocks from the gradient
  float fw = uPixel > 0.0 ? max(gmag * px * uPixel, 1e-3) : max(fwidth(s), 1e-4);
  float distPx = s / fw;
  float landA = uPixel > 0.0 ? step(0.0, s) : smoothstep(-0.5, 0.5, distPx);

  // micro-relief bump: finite differences of a procedural height.
  // TODO: off until real fine detail comes from the heights themselves (a detail pyramid): this
  // texture draws bumps that are not in the terrain, strongest on high ground however flat it is.
  float elev0 = max(s, 0.0) / uMaxElev;
  float mtn = smoothstep(0.08, 0.45, elev0);
  const bool RELIEF_DETAIL = false;
  if (RELIEF_DETAIL && uZoom > 0.6) {
    // only where the terrain is actually uneven: flat plains stay flat
    float uneven = smoothstep(4.0, 60.0, gmag);
    float amp = (40.0 * uneven + 700.0 * mtn) * smoothstep(-20.0, 60.0, s);
    float ed = 0.5 * px;
    float dxp = reliefDetail(w + vec2(ed, 0.0), mtn);
    float dxm = reliefDetail(w - vec2(ed, 0.0), mtn);
    float dyp = reliefDetail(w + vec2(0.0, ed), mtn);
    float dym = reliefDetail(w - vec2(0.0, ed), mtn);
    grad += vec2(dxp - dxm, dyp - dym) / (2.0 * ed) * amp;
  }

  // ---------- hillshade ----------
  vec3 n = normalize(vec3(-grad * uExaggeration / uCellKm * 0.0035, 1.0));
  vec3 L = normalize(vec3(-0.62, -0.72, 0.6));
  float lambert = dot(n, L);
  float shade = (lambert - L.z) / (1.0 - L.z);
  if (uCel > 0.0) {
    // cel shading: three flat bands of light, as in hand-painted animation backgrounds
    float q = shade < -0.16 ? -0.55 : (shade > 0.2 ? 0.32 : 0.0);
    shade = mix(shade, q, uCel);
  }

  // ---------- land ----------
  float elev = max(s, 0.0) / uMaxElev;
  vec3 land = ramp(0.0, elev);
  land *= 0.96 + 0.08 * vn(w, 0.35, 3.0);

  // biome weights are stored at half resolution
  vec2 bioUV = (w * 0.5 - uBioOrigin) / uBioSize;
  vec4 bA = texture(uBiomeA, bioUV);
  vec4 bB = texture(uBiomeB, bioUV);
  // ragged noise along biome edges; softer edges keep less of it
  float edgeN = fbmW(w, 1.3, 41.0, 3) - 0.5;
  float edgeK = 0.9 * (1.0 - 0.75 * uBiomeSoft);
  bA = clamp(bA + edgeN * edgeK * bA * (1.0 - bA) * 2.0, 0.0, 1.0) * uBiomeOpacity;
  bB = clamp(bB + edgeN * edgeK * bB * (1.0 - bB) * 2.0, 0.0, 1.0) * uBiomeOpacity;

  float lod = uBiomePattern;
  float lodFine = smoothstep(7.0, 22.0, uZoom) * uBiomePattern;

  // grassland
  vec3 grass = biomeColor(0.0) * (0.9 + 0.2 * fbmW(w, 2.3, 0.0, 3));
  grass *= 1.0 - 0.12 * lodFine * step(0.82, hashP(floor(w * 6.0), W * 6.0));
  land = mix(land, grass, bA.r);
  // steppe: dry, pale grass with wind-combed streaks and sparse tufts
  if (bB.a > 0.003) {
    vec3 steppe = biomeColor(7.0) * (0.92 + 0.14 * fbmW(w * vec2(0.35, 1.6), 1.4, 23.0, 3));
    float tuft = step(0.9, hashP(floor(w * 5.0), W * 5.0)) * lodFine;
    steppe = mix(steppe, steppe * 0.78, tuft);
    land = mix(land, steppe, bB.a);
  }
  // farmland
  if (bA.b > 0.003) {
    float fl = lodLevel(26.0);
    float f0 = floor(fl);
    float s0 = exp2(f0);
    vec3 fa = fields(w * s0, W * s0, biomeColor(2.0), lod);
    vec3 fb = fields(w * s0 * 2.0, W * s0 * 2.0, biomeColor(2.0), lod);
    land = mix(land, mix(fa, fb, smoothstep(0.25, 0.75, fl - f0)), bA.b);
  }
  // desert with dune ridges
  vec3 sand = biomeColor(3.0);
  float dl = exp2(floor(lodLevel(14.0)));
  float dune = sin(fbmW(w, 0.08 * dl, 5.0, 2) * 40.0 + fbmW(w, 0.8 * dl, 9.0, 3) * 6.0);
  sand *= 1.0 + lod * (0.08 * smoothstep(0.6, 1.0, dune) - 0.07 * smoothstep(0.2, -0.6, dune));
  land = mix(land, sand, bA.a);
  // swamp: muddy greens, pools and reeds
  vec3 swamp = biomeColor(4.0) * (0.85 + 0.25 * fbmW(w, 3.0, 0.0, 3));
  float pool = smoothstep(0.62, 0.66, fbmW(w, 2.2, 9.0, 3));
  swamp = mix(swamp, ramp(1.0, 0.08) * 0.85, pool * (0.4 + 0.5 * lod));
  float reed = step(0.86, hashP(floor(w * 7.0), W * 7.0)) * lodFine;
  swamp = mix(swamp, swamp * 0.55, reed);
  land = mix(land, swamp, bB.r);
  // rock
  vec3 rock = biomeColor(6.0) * (0.8 + 0.35 * fbmW(w, 2.7, 2.0, 5));
  float crack = 1.0 - smoothstep(0.0, 0.05, abs(fbmW(w, 1.6, 70.0, 3) - 0.5));
  rock *= 1.0 - 0.25 * crack * lod;
  land = mix(land, rock, bB.b);
  // snow & ice
  vec3 snow = biomeColor(5.0) * (0.97 + 0.04 * vn(w, 5.0, 0.0));
  land = mix(land, snow, bB.g);
  // forest: painted crowns at a readable screen size
  float fd = bA.g;
  if (fd > 0.01) {
    vec3 fbase = biomeColor(1.0);
    // trees thin out towards the edge; how far the fringe reaches depends on the edge softness
    float fringe = mix(0.35, 0.85, uBiomeSoft);
    float dens = smoothstep(0.03, fringe, fd + (fbmW(w, 0.9, 0.0, 3) - 0.5) * 0.3);
    float tl = lodLevel(9.0);
    float t0 = floor(tl);
    float sa = exp2(t0);
    float sha;
    float shb;
    vec4 ta = trees(w * sa, W * sa, dens, fbase, sha);
    vec4 tb = trees(w * sa * 2.0 + vec2(0.0, 0.37), W * sa * 2.0, dens, fbase, shb);
    float tm = smoothstep(0.3, 0.7, tl - t0);
    vec4 tr = mix(ta, tb, tm);
    float tsh = mix(sha, shb, tm);
    // the forest floor darkens gently and only where the forest is dense; at the edge the trees stand on the open land
    float floorAmt = smoothstep(0.1, mix(0.5, 0.95, uBiomeSoft), fd);
    vec3 floorCol = mix(land, fbase * (0.74 - 0.16 * tsh), floorAmt);
    vec3 withTrees = mix(floorCol, tr.rgb, tr.a);
    vec3 forestFlat = mix(land, fbase * (0.84 + 0.22 * fbmW(w, 2.0, 0.0, 3)), smoothstep(0.05, fringe, fd));
    vec3 fcol = mix(forestFlat, withTrees, lod);
    land = mix(land, fcol, smoothstep(0.0, mix(0.35, 0.6, uBiomeSoft), fd));
  }

  // shading
  float sh = shade * uHillshade;
  sh = sh / (1.0 + abs(sh) * 0.9);
  if (uHatch > 0.0) {
    // engraving: shadows drawn as diagonal hatching, crossed where darkest; lines are tied to the map
    vec2 fc = w * uZoom;
    float S = 5.0;
    float dark = clamp(-sh * 1.7 + 0.12 * mtn, 0.0, 1.0);
    float d1 = abs(fract((fc.x + fc.y) / S) - 0.5) * S;
    float d2 = abs(fract((fc.x - fc.y) / S) - 0.5) * S;
    float w1 = dark * S * 0.42;
    float w2 = max(0.0, dark - 0.55) * S * 0.6;
    float ink = max(1.0 - smoothstep(w1 - 0.5, w1 + 0.5, d1), 1.0 - smoothstep(w2 - 0.5, w2 + 0.5, d2)) * step(0.04, dark);
    land *= 1.0 + max(sh, 0.0) * 0.25 * uHatch;
    land = mix(land, uShadowTint, ink * 0.8 * uHatch);
    sh *= 1.0 - uHatch;
  }
  land *= 1.0 + sh * (sh < 0.0 ? 0.62 : 0.38);
  land = mix(land, uShadowTint, clamp(-sh, 0.0, 1.0) * 0.22);

  // ---------- rivers: the same water as the sea and lakes ----------
  float riverA = 0.0;
  vec3 rcol = vec3(0.0);
  float riverPx = 1e6;
  float riverHwPx = 0.0;
  if (uRiverOn > 0.5 && uRiverVis > 0.0) {
    // the nearest bank among the cells around: each holds a piece of a river (two arcs from a point
    // of it, as far as they stay on it); the distance is to the nearest point of the arcs, found by
    // a few Newton steps, or to their ends; estimates near the nearest are blended (over about the
    // arcs' tolerance), never adding water. The same as riverDistance in riverField.ts.
    vec2 rc = floor(w - uTexOrigin);
    float sds[18];
    float wts[18];
    float hws[18];
    float sd = 1e6;
    float rhw = 0.0;
    // never thinner than a fine line when zoomed out
    float minHw = 0.7 * px * (uPixel > 0.0 ? uPixel : 1.0);
    for (int k = 0; k < 18; k++) {
      sds[k] = 1e6;
      wts[k] = 0.0;
      hws[k] = 0.0;
      int cellK = k / 2;
      ivec2 p = ivec2(clamp(rc + vec2(float(cellK % 3 - 1), float(cellK / 3 - 1)), vec2(0.0), vec2(uTexSize - 1.0)));
      vec4 v = (k % 2 == 0) ? texelFetch(uRiver, p, 0) : texelFetch(uRiver2, p, 0);
      if (v.z == 0.0) continue;
      // offsets with the arcs' reach and the slope's bits (see packOffset)
      float ax = floor((v.x + 0.5) / 8.0);
      float bx = v.x - ax * 8.0;
      float ox = floor((ax + 0.5) / 32.0);
      float ahead = (ax - ox * 32.0) / 31.0;
      float ay = floor((v.y + 0.5) / 8.0);
      float by = v.y - ay * 8.0;
      float oy = floor((ay + 0.5) / 32.0);
      float behind = (ay - oy * 32.0) / 31.0;
      vec2 off = (vec2(ox, oy) - 32768.0) / 1024.0;
      // half width (log scale) and the curvature ahead (see packWidth)
      float pw = v.z - 1.0;
      float hq = floor((pw + 0.5) / 4096.0);
      float hw0 = exp2(hq / 128.0) / 1024.0;
      float kA = (pw - hq * 4096.0) / 4094.0 * 32.0 - 16.0;
      // direction and the curvature behind (see packDirKappa)
      float aq = floor((v.w + 0.5) / 2048.0);
      float a = aq / 1000.0 - 3.14159265;
      float kB = (v.w - aq * 2048.0) / 2046.0 * 32.0 - 16.0;
      // the width slope (see slopeOf)
      float sq = (min(bx * 8.0 + by, 62.0) - 31.0) / 31.0;
      float slope = 8.0 * sq * sq * sq * hw0;
      vec2 cc = uTexOrigin + vec2(p) + 0.5;
      vec2 d = w - cc - off;
      vec2 t = vec2(cos(a), sin(a));
      float x = dot(d, t);
      float y = dot(d, vec2(-t.y, t.x));
      float u = clamp(x, -behind, ahead);
      for (int i = 0; i < 3; i++) {
        float kk = u >= 0.0 ? kA : kB;
        float e = 0.5 * kk * u * u - y;
        float g = u - x + e * kk * u;
        float hh = 1.0 + kk * kk * u * u + e * kk;
        u = clamp(u - g / max(hh, 0.3), -behind, ahead);
      }
      float kk = u >= 0.0 ? kA : kB;
      sds[k] = length(vec2(x - u, y - 0.5 * kk * u * u)) - max(hw0 + slope * u, minHw);
      hws[k] = hw0;
      vec2 o = abs(w - cc);
      float r = max(0.0, 1.0 - max(o.x, o.y) / 1.5);
      wts[k] = r * r;
      if (sds[k] < sd) {
        sd = sds[k];
        rhw = hw0;
      }
    }
    float acc = 0.0;
    float wsum = 0.0;
    for (int k = 0; k < 18; k++) {
      if (wts[k] <= 0.0) continue;
      float fade = clamp(0.1 * min(rhw, hws[k]), 0.003, 0.05);
      float wk = wts[k] * exp(-max(0.0, sds[k] - sd) / fade);
      acc += min(sds[k], sd + 8.0 * fade) * wk;
      wsum += wk;
    }
    if (wsum > 1e-5) sd = acc / wsum;
    riverPx = sd / max(px * (uPixel > 0.0 ? uPixel : 1.0), 1e-4);
    riverHwPx = rhw / max(px * (uPixel > 0.0 ? uPixel : 1.0), 1e-4);
    riverA = (uPixel > 0.0 ? step(riverPx, 0.0) : 1.0 - smoothstep(-0.5, 0.5, riverPx)) * uRiverVis;
    // a thread of a river (a few pixels wide, without banks) is drawn in deeper water, so it reads
    rcol = ramp(1.0, 0.04 + 0.1 * clamp(rhw / 6.0, 0.0, 1.0) + 0.45 * (1.0 - smoothstep(1.2, 3.0, riverHwPx)));
    rcol *= 1.0 + shade * 0.05 * uHillshade;
    rcol *= 0.99 + 0.02 * fbmW(w, 0.3, 100.0, 3);
  }

  // ---------- water ----------
  float depth = max(-s, 0.0) / 6000.0;
  vec3 water = ramp(1.0, pow(depth, 0.55));
  water *= 1.0 + shade * 0.12 * uHillshade;
  water *= 0.99 + 0.02 * fbmW(w, 0.3, 100.0, 3);
  // coastline ripples
  float rip = 0.0;
  if (distPx < 0.0 && uRipples > 0.0) {
    float dp = -distPx;
    float k = (dp - 5.0) / 6.5;
    if (k > 0.0 && k < 4.0) {
      float band = abs(fract(k) - 0.5) * 6.5;
      rip = (1.0 - smoothstep(0.35, 1.0, band)) * (1.0 - k / 4.0);
    }
  }
  // (none across a river's mouth)
  water = mix(water, uRippleColor, rip * uRippleAlpha * uRipples * (1.0 - riverA));

  vec3 col = mix(water, land, landA);

  // ---------- painted water (rivers, streams, lakes) ----------
  if (uWaterVis > 0.0) {
    // the water grid is WATER_DETAIL (4) times finer than the terrain's
    vec2 ww = w * 4.0;
    float wv = texture(uWater, (ww - uWatOrigin) / uWatSize).r;
    if (wv > 0.02) {
      // slightly ragged banks
      wv += (vn(ww, 1.7, 33.0) - 0.5) * 0.16;
      float fwv = max(fwidth(wv), 1e-4);
      float wdist = (wv - 0.5) / fwv;
      float wa = uPixel > 0.0 ? step(0.5, wv) : smoothstep(-0.6, 0.6, wdist);
      vec3 rc = ramp(1.0, 0.1) * (0.97 + 0.05 * fbmW(w, 0.6, 77.0, 2));
      col = mix(col, rc, wa * uWaterVis * landA);
      float bank = 1.0 - smoothstep(uCoastWidth * 0.4 - 0.35, uCoastWidth * 0.4 + 0.6, abs(wdist));
      col = mix(col, uCoastInk, bank * 0.7 * uWaterVis * landA);
    }
  }

  // rivers, on land only: in the sea it is the sea
  col = mix(col, rcol, riverA * landA);

  // ---------- lakes: water with its own level ----------
  float lakeA = 0.0;
  // pixels from the lake's smooth shore (no fractal detail), positive in the water
  float lakePx0 = -1e6;
  if (uLakeOn > 0.5) {
    // Cells under a lake hold its level. The water's edge is where phi, the depth of water over
    // the ground, crosses zero; phi is smoothed like the ground (the same cubic B-spline), so the
    // shore is the ground's own curve at the level, wherever the lake's cells end. Dry ground below
    // the level that is not part of the lake (past its outlet, a hollow beside it, a part rubbed
    // out) counts as standing as far above the water as it is below it, so no stray water shows.
    vec2 lt = w - uTexOrigin - 0.5;
    vec2 li = floor(lt);
    vec2 lf = lt - li;
    ivec2 lp = ivec2(clamp(li, vec2(1.0), vec2(uTexSize - 3.0)));
    float lvs[16];
    float lv = -30000.0;
    for (int k = 0; k < 16; k++) {
      float v = texelFetch(uLake, lp + ivec2(k % 4 - 1, k / 4 - 1), 0).r;
      lvs[k] = v;
      if (v > -20000.0 && v < 25000.0) lv = max(lv, v);
    }
    if (lv > -20000.0) {
      vec4 wx = bspline(lf.x);
      vec4 wy = bspline(lf.y);
      vec4 dx = vec4(-0.5 * (1.0 - lf.x) * (1.0 - lf.x), 1.5 * lf.x * lf.x - 2.0 * lf.x, 0.5 + lf.x - 1.5 * lf.x * lf.x, 0.5 * lf.x * lf.x);
      vec4 dy = vec4(-0.5 * (1.0 - lf.y) * (1.0 - lf.y), 1.5 * lf.y * lf.y - 2.0 * lf.y, 0.5 + lf.y - 1.5 * lf.y * lf.y, 0.5 * lf.y * lf.y);
      vec3 ph = vec3(0.0);
      // the level of the cell with the most weight here, for the selection
      float own = -30000.0;
      float ownW = 0.0;
      for (int y = 0; y < 4; y++) {
        float row = 0.0;
        float drow = 0.0;
        for (int x = 0; x < 4; x++) {
          float v = lvs[y * 4 + x];
          float gh = texelFetch(uHeight, lp + ivec2(x - 1, y - 1), 0).r;
          bool wet = v > -20000.0 && v < 25000.0;
          float c = wet ? v - gh : min(-abs(lv - gh), -0.5);
          row += wx[x] * c;
          drow += dx[x] * c;
          float cw = wx[x] * wy[y];
          if (wet && cw > ownW) {
            ownW = cw;
            own = v;
          }
        }
        ph += vec3(wy[y] * row, wy[y] * drow, dy[y] * row);
      }
      float pg = length(ph.yz);
      // the same fractal detail as the sea's coasts, a little calmer on a lake's gentle shelf
      float phiD = ph.x - coastDetail(w) * min(pg, 3000.0) * 0.9;
      // measured from phi's own slope: fwidth is not defined inside a branch only some pixels take
      float lfw = max(pg * px * (uPixel > 0.0 ? uPixel : 1.0), 1e-3);
      float lpx = phiD / lfw;
      lakePx0 = ph.x / lfw;
      lakeA = uPixel > 0.0 ? step(0.0, phiD) : smoothstep(-0.5, 0.5, lpx);
      // deeper water is darker, as in the sea
      vec3 lc = ramp(1.0, 0.03 + 0.55 * pow(clamp(ph.x / 400.0, 0.0, 1.0), 0.6));
      lc *= 1.0 + shade * 0.05 * uHillshade;
      lc *= 0.99 + 0.02 * fbmW(w, 0.3, 100.0, 3);
      // ripples along the shore, as at sea
      if (lpx > 0.0 && uRipples > 0.0) {
        float k = (lpx - 5.0) / 6.5;
        if (k > 0.0 && k < 4.0) {
          float band = abs(fract(k) - 0.5) * 6.5;
          lc = mix(lc, uRippleColor, (1.0 - smoothstep(0.35, 1.0, band)) * (1.0 - k / 4.0) * uRippleAlpha * uRipples * (1.0 - riverA));
        }
      }
      // the selected lake glows a little
      bool sel = own == uLakeSelLevel && w.x >= uLakeSel.x && w.y >= uLakeSel.y && w.x <= uLakeSel.z && w.y <= uLakeSel.w;
      if (sel) lc = mix(lc, vec3(1.0, 0.92, 0.55), 0.22);
      col = mix(col, lc, lakeA);
      // no shore line across the mouth of a river running in
      float lbank = (1.0 - smoothstep(uCoastWidth * 0.5 - 0.35, uCoastWidth * 0.5 + 0.6, abs(lpx))) * (1.0 - riverA);
      col = mix(col, sel ? vec3(0.95, 0.7, 0.15) : uCoastInk, lbank * 0.92);
      if (sel) col = mix(col, vec3(0.95, 0.7, 0.15), (1.0 - smoothstep(uCoastWidth * 0.5 + 1.5, uCoastWidth * 0.5 + 3.5, abs(lpx))) * 0.35);
    }
  }

  // ---------- contours ----------
  if (uContours > 0.5) {
    float c = s / uContourInterval;
    float cw = max(fwidth(c), 1e-5);
    float d = abs(fract(c + 0.5) - 0.5) / cw;
    float idx = floor(c + 0.5);
    bool major = mod(idx, 5.0) < 0.5;
    float lw = major ? 1.15 : 0.6;
    float a = (1.0 - smoothstep(lw - 0.5, lw + 0.6, d)) * (1.0 - smoothstep(0.12, 0.45, cw));
    a *= s > 0.0 ? (major ? 0.75 : 0.5) : 0.22;
    // lakes and rivers hide the land's contours under them
    a *= (1.0 - lakeA) * (1.0 - riverA);
    col = mix(col, uContourColor, a);
  }

  // ---------- coast ink ----------
  // (none across a river's mouth: the river and the sea are one water)
  float coast = (1.0 - smoothstep(uCoastWidth * 0.5 - 0.35, uCoastWidth * 0.5 + 0.6, abs(distPx))) * (1.0 - riverA);
  col = mix(col, uCoastInk, coast * 0.92);
  // a river's banks, where it runs over land (its mouth opens into the sea or a lake without one)
  if (riverPx < 1e5) {
    float rbank = 1.0 - smoothstep(uCoastWidth * 0.5 - 0.35, uCoastWidth * 0.5 + 0.6, abs(riverPx));
    // a river a few pixels wide is a blue thread: its banks would swallow it
    rbank *= smoothstep(1.2, 3.0, riverHwPx);
    // it stops at the water's smooth edge (the fractal detail of a low shore flickers, and the
    // bank would break into dashes along it)
    float landPx0 = (h - uSea) / max(gmag * px * (uPixel > 0.0 ? uPixel : 1.0), 1e-3);
    float onLand = smoothstep(0.0, 1.5, landPx0) * (1.0 - smoothstep(-1.5, 0.0, lakePx0));
    col = mix(col, uCoastInk, rbank * 0.92 * onLand * uRiverVis);
  }

  // ---------- height overlay ----------
  if (uOverlay > 0.0) {
    float t = (hD - uMinElev) / (uSea + uMaxElev - uMinElev);
    vec3 hyp = ramp(2.0, t) * (1.0 + shade * 0.45);
    col = mix(col, hyp, uOverlay);
  }

  // ---------- graticule ----------
  if (uGraticule > 0.5) {
    // planets: meridians and parallels every 15° with a stronger equator; flat maps: a km grid
    vec2 g = uFlat > 0.5 ? w / uGridStep : vec2(w.x / (uWorldSize.x / 24.0), w.y / (uWorldSize.y / 12.0));
    vec2 gw = max(fwidth(g), vec2(1e-5));
    vec2 gd = abs(fract(g + 0.5) - 0.5) / gw;
    float l = 1.0 - smoothstep(0.3, 1.1, min(gd.x, gd.y));
    float eq = uFlat > 0.5 ? 0.0 : 1.0 - smoothstep(0.5, 1.6, abs(w.y - uWorldSize.y * 0.5) / (px));
    col = mix(col, uCoastInk, max(l * 0.28, eq * 0.45));
  }

  // ---------- flat colour levels ----------
  if (uPosterize > 0.5) col = floor(col * uPosterize + 0.5) / uPosterize;

  // ---------- paper ----------
  col = mix(col, uPaper, uPaperAmount);
  float stain = fbmW(w, 0.05, 11.0, 3);
  col *= 1.0 - uStains * smoothstep(0.45, 0.8, stain);
  float grain = hash12(floor(mod(w, 256.0) * max(uZoom, 1.0)) + 0.5) - 0.5;
  col *= 1.0 + grain * uGrain;

  finalColor = vec4(col, 1.0);
}
`;

export const FOG_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uFog;
uniform vec2 uTexOrigin;
uniform float uTexSize;
uniform float uPreview;
uniform vec3 uFogColor;
uniform vec3 uFogShade;
uniform float uZoom;
uniform float uFogOpacity;
uniform vec2 uWorldSize;

${NOISE}

// soft cloud noise (gradient noise, octaves fade once finer than a few pixels)
float cloud(vec2 w, float seed) {
  float s = 0.0;
  float norm = 0.0;
  float a = 0.5;
  float f = 1.0 / 48.0;
  for (int i = 0; i < 8; i++) {
    float periodPx = uZoom / f;
    float fade = smoothstep(3.0, 12.0, periodPx);
    s += a * fade * gn(w, f, seed + float(i) * 7.13);
    norm += a * fade;
    f *= 2.0;
    a *= 0.52;
  }
  return norm > 0.0 ? 0.5 + 0.5 * s / norm : 0.5;
}

void main() {
  vec2 w = vWorld;
  // fog is stored at half resolution
  float f = texture(uFog, (w * 0.5 - uTexOrigin) / uTexSize).r;
  if (f < 0.003) discard;
  // domain warp gives billowing, swirling mist
  vec2 q = vec2(cloud(w, 3.0), cloud(w, 7.0)) - 0.5;
  float n = cloud(w + q * 70.0, 13.0);
  float n2 = cloud(w + q * 40.0, 41.0);
  float edge = f * (1.0 - f) * 4.0;
  float a = clamp(f + (n - 0.5) * 1.1 * edge, 0.0, 1.0);
  a = smoothstep(0.02, 0.98, a);
  vec3 col = mix(uFogShade, uFogColor, smoothstep(0.2, 0.8, n * 0.65 + n2 * 0.45));
  // soft highlights on cloud tops
  col = mix(col, vec3(1.0), smoothstep(0.62, 0.9, n2) * 0.18);
  if (uPreview > 0.5) {
    float hatch = step(0.82, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0));
    col = mix(col, uFogShade * 0.6, hatch * 0.6);
    a *= 0.5;
  }
  a *= uFogOpacity;
  finalColor = vec4(col * a, a);
}
`;

/** Full-screen quad for the projected view: positions in CSS pixels. */
export const PROJECT_VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vScreen = aPosition;
}
`;

/**
 * The projected view: every screen pixel is taken back through the inverse
 * of the map projection to a longitude and latitude, and coloured from an
 * equirectangular render of that part of the planet (src/core/projections.ts
 * has the same formulas in TypeScript).
 */
export const PROJECT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vScreen;
out vec4 finalColor;

uniform sampler2D uSrc;
uniform float uProj;      // 0 equirect, 1 Mercator, 2 Mollweide, 3 Equal Earth, 4 globe, 5 azimuthal, 6 Gott
uniform float uLon0;
uniform float uSinP0;
uniform float uCosP0;
uniform float uReach;     // azimuthal: radius of the map in radians
uniform float uGottCx;    // Gott: distance of each disk's centre from the middle
uniform vec2 uView;       // canvas size, CSS px
uniform vec2 uPlane;      // plane point at the centre of the view
uniform float uScale;     // CSS px per plane unit
uniform vec4 uSrcRect;    // first longitude, longitude span, top latitude, latitude span (radians)
uniform vec3 uBg;
uniform vec3 uRim;

const float PI = 3.141592653589793;
const float HALF = 1.5707963267948966;

float eeY(float t) { float t2 = t * t; return t * (1.340264 - 0.081106 * t2 + t2 * t2 * t2 * (0.000893 + 0.003796 * t2)); }
float eeDY(float t) { float t2 = t * t; return 1.340264 - 3.0 * 0.081106 * t2 + t2 * t2 * t2 * (7.0 * 0.000893 + 9.0 * 0.003796 * t2); }

vec2 azInverse(vec2 p, float c) {
  float rho = length(p);
  if (rho < 1e-9) return vec2(uLon0, asin(uSinP0));
  float sc = sin(c);
  float cc = cos(c);
  float lat = asin(clamp(cc * uSinP0 + p.y * sc * uCosP0 / rho, -1.0, 1.0));
  float lon = uLon0 + atan(p.x * sc, rho * uCosP0 * cc - p.y * uSinP0 * sc);
  return vec2(lon, lat);
}

// longitude and latitude of a plane point; .z = 1 when it's on the map
vec3 unproject(vec2 p) {
  int id = int(uProj + 0.5);
  if (id == 1) {
    if (abs(p.x) > PI || abs(p.y) > PI) return vec3(0.0);
    return vec3(p.x + uLon0, 2.0 * atan(exp(p.y)) - HALF, 1.0);
  }
  if (id == 2) {
    float S2 = 1.4142135623730951;
    if (abs(p.y) > S2) return vec3(0.0);
    float t = asin(p.y / S2);
    float ct = cos(t);
    float l = ct < 1e-6 ? 0.0 : PI * p.x / (2.0 * S2 * ct);
    if (abs(l) > PI) return vec3(0.0);
    return vec3(l + uLon0, asin(clamp((2.0 * t + sin(2.0 * t)) / PI, -1.0, 1.0)), 1.0);
  }
  if (id == 3) {
    float M = 0.8660254037844386;
    float yMax = eeY(asin(M));
    if (abs(p.y) > yMax) return vec3(0.0);
    float t = p.y / 1.340264;
    for (int i = 0; i < 6; i++) t -= (eeY(t) - p.y) / eeDY(t);
    float l = M * p.x * eeDY(t) / cos(t);
    if (abs(l) > PI) return vec3(0.0);
    return vec3(l + uLon0, asin(clamp(sin(t) / M, -1.0, 1.0)), 1.0);
  }
  if (id == 4) {
    float rho = length(p);
    if (rho > 1.0) return vec3(0.0);
    return vec3(azInverse(p, asin(rho)), 1.0);
  }
  if (id == 5) {
    float rho = length(p);
    if (rho > uReach) return vec3(0.0);
    return vec3(azInverse(p, rho), 1.0);
  }
  if (id == 6) {
    bool south = p.x > 0.0;
    float dx = south ? p.x - uGottCx : p.x + uGottCx;
    float c = length(vec2(dx, p.y));
    if (c > HALF) return vec3(0.0);
    float l = south ? atan(-dx, -p.y) : atan(dx, -p.y);
    return vec3(l + uLon0, south ? c - HALF : HALF - c, 1.0);
  }
  if (abs(p.x) > PI || abs(p.y) > HALF) return vec3(0.0);
  return vec3(p.x + uLon0, p.y, 1.0);
}

void main() {
  vec2 p = uPlane + vec2(vScreen.x - uView.x * 0.5, uView.y * 0.5 - vScreen.y) / uScale;
  vec3 ll = unproject(p);
  if (ll.z < 0.5) {
    finalColor = vec4(uBg, 1.0);
    return;
  }
  float lonRel = mod(ll.x - uSrcRect.x, 2.0 * PI);
  vec2 uv = vec2(lonRel / uSrcRect.y, (uSrcRect.z - ll.y) / uSrcRect.w);
  vec3 col = texture(uSrc, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  int id = int(uProj + 0.5);
  if (id == 4) {
    // a globe darkens a little towards its rim, like a sphere lit from the front
    col *= 0.8 + 0.2 * sqrt(max(0.0, 1.0 - dot(p, p)));
  }
  // a fine ink rim along the map's edge
  float edge = 1e9;
  if (id == 4) edge = (1.0 - length(p)) * uScale;
  else if (id == 5) edge = (uReach - length(p)) * uScale;
  else if (id == 6) edge = (HALF - length(vec2(p.x > 0.0 ? p.x - uGottCx : p.x + uGottCx, p.y))) * uScale;
  col = mix(col, uRim, (1.0 - smoothstep(0.6, 1.6, edge)) * 0.8);
  finalColor = vec4(col, 1.0);
}
`;
