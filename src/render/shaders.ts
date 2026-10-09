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
uniform sampler2D uRamp;
uniform vec2 uTexOrigin;
uniform float uTexSize;
uniform vec2 uBioOrigin;
uniform float uBioSize;

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

float hSmooth(vec2 w) {
  vec2 t = w - uTexOrigin - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec4 wx = bspline(f.x);
  vec4 wy = bspline(f.y);
  ivec2 p = ivec2(clamp(i, vec2(1.0), vec2(uTexSize - 3.0)));
  float s = 0.0;
  for (int y = 0; y < 4; y++) {
    float row = 0.0;
    for (int x = 0; x < 4; x++) {
      row += wx[x] * texelFetch(uHeight, p + ivec2(x - 1, y - 1), 0).r;
    }
    s += wy[y] * row;
  }
  return s;
}

vec3 ramp(float row, float t) {
  return texture(uRamp, vec2(clamp(t, 0.0, 1.0) * (254.0 / 256.0) + 1.0 / 256.0, (row + 0.5) / 4.0)).rgb;
}
vec3 biomeColor(float i) {
  return texture(uRamp, vec2((i + 0.5) / 8.0, 3.5 / 4.0)).rgb;
}

// painted tree crowns on a lattice of P cells around the planet; rgb + coverage
vec4 trees(vec2 p, float P, float density, vec3 base) {
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
  if (best.a < 1.0) {
    vec3 ground = base * (0.62 - 0.22 * shadow);
    best = vec4(mix(ground, best.rgb, best.a), 1.0);
  }
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

// symbols kept at a readable screen size: blend two power-of-two densities
float lodLevel(float targetPx) {
  return log2(max(uZoom, 1e-3) / targetPx);
}

void main() {
  vec2 w = vWorld;
  float W = uWorldSize.x;
  float px = 1.0 / uZoom; // cells per screen pixel

  // gradient (m per cell) for hillshade and coast detail
  float e = clamp(px, 0.75, 3.0);
  float hx = hAt(w + vec2(e, 0.0)) - hAt(w - vec2(e, 0.0));
  float hy = hAt(w + vec2(0.0, e)) - hAt(w - vec2(0.0, e));
  vec2 grad = vec2(hx, hy) / (2.0 * e);
  float gmag = length(grad);

  // zoomed out (several cells per pixel): box-filter the height so coasts don't alias
  float h;
  if (px > 0.7) {
    float o = 0.35 * px;
    h = 0.25 * (hAt(w + vec2(-o, -o * 0.4)) + hAt(w + vec2(o, o * 0.4)) + hAt(w + vec2(-o * 0.4, o)) + hAt(w + vec2(o * 0.4, -o)));
  } else {
    h = hSmooth(w);
  }
  // fractal detail so coastlines and contours stay crisp & organic when zoomed in
  float hD = h + coastDetail(w) * min(gmag, 3000.0) * 1.3;

  float s = hD - uSea;
  float fw = max(fwidth(s), 1e-4);
  float distPx = s / fw;
  float landA = smoothstep(-0.5, 0.5, distPx);

  // micro-relief bump: finite differences of a procedural height
  float elev0 = max(s, 0.0) / uMaxElev;
  float mtn = smoothstep(0.08, 0.45, elev0);
  if (uZoom > 0.6) {
    float amp = (40.0 + 700.0 * mtn) * smoothstep(-20.0, 60.0, s);
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

  // ---------- land ----------
  float elev = max(s, 0.0) / uMaxElev;
  vec3 land = ramp(0.0, elev);
  land *= 0.96 + 0.08 * vn(w, 0.35, 3.0);

  // biome weights are stored at half resolution
  vec2 bioUV = (w * 0.5 - uBioOrigin) / uBioSize;
  vec4 bA = texture(uBiomeA, bioUV);
  vec4 bB = texture(uBiomeB, bioUV);
  float edgeN = fbmW(w, 1.3, 41.0, 3) - 0.5;
  bA = clamp(bA + edgeN * 0.9 * bA * (1.0 - bA) * 2.0, 0.0, 1.0) * uBiomeOpacity;
  bB = clamp(bB + edgeN * 0.9 * bB * (1.0 - bB) * 2.0, 0.0, 1.0) * uBiomeOpacity;

  float lod = uBiomePattern;
  float lodFine = smoothstep(7.0, 22.0, uZoom) * uBiomePattern;

  // grassland
  vec3 grass = biomeColor(0.0) * (0.9 + 0.2 * fbmW(w, 2.3, 0.0, 3));
  grass *= 1.0 - 0.12 * lodFine * step(0.82, hashP(floor(w * 6.0), W * 6.0));
  land = mix(land, grass, bA.r);
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
    float dens = smoothstep(0.05, 0.75, fd + (fbmW(w, 0.9, 0.0, 3) - 0.5) * 0.3);
    float tl = lodLevel(9.0);
    float t0 = floor(tl);
    float sa = exp2(t0);
    vec4 ta = trees(w * sa, W * sa, dens, fbase);
    vec4 tb = trees(w * sa * 2.0 + vec2(0.0, 0.37), W * sa * 2.0, dens, fbase);
    vec4 tr = mix(ta, tb, smoothstep(0.3, 0.7, tl - t0));
    vec3 forestFlat = fbase * (0.82 + 0.25 * fbmW(w, 2.0, 0.0, 3));
    vec3 fcol = mix(forestFlat, tr.rgb, lod);
    land = mix(land, fcol, smoothstep(0.0, 0.35, fd));
  }

  // shading
  float sh = shade * uHillshade;
  sh = sh / (1.0 + abs(sh) * 0.9);
  land *= 1.0 + sh * (sh < 0.0 ? 0.62 : 0.38);
  land = mix(land, uShadowTint, clamp(-sh, 0.0, 1.0) * 0.22);

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
  water = mix(water, uRippleColor, rip * uRippleAlpha * uRipples);

  vec3 col = mix(water, land, landA);

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
    col = mix(col, uContourColor, a);
  }

  // ---------- coast ink ----------
  float coast = 1.0 - smoothstep(uCoastWidth * 0.5 - 0.35, uCoastWidth * 0.5 + 0.6, abs(distPx));
  col = mix(col, uCoastInk, coast * 0.92);

  // ---------- height overlay ----------
  if (uOverlay > 0.0) {
    float t = (hD - uMinElev) / (uSea + uMaxElev - uMinElev);
    vec3 hyp = ramp(2.0, t) * (1.0 + shade * 0.45);
    col = mix(col, hyp, uOverlay);
  }

  // ---------- graticule ----------
  if (uGraticule > 0.5) {
    vec2 g = vec2(w.x / (uWorldSize.x / 24.0), w.y / (uWorldSize.y / 12.0));
    vec2 gw = max(fwidth(g), vec2(1e-5));
    vec2 gd = abs(fract(g + 0.5) - 0.5) / gw;
    float l = 1.0 - smoothstep(0.3, 1.1, min(gd.x, gd.y));
    float eq = 1.0 - smoothstep(0.5, 1.6, abs(w.y - uWorldSize.y * 0.5) / (px));
    col = mix(col, uCoastInk, max(l * 0.28, eq * 0.45));
  }

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
