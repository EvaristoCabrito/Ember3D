/** GLSL sources for the elemental FX pipeline.
 *
 * Everything noise-based samples the single pre-baked tileable texture (see noiseTexture.ts)
 * instead of running fbm/Voronoi loops per pixel — one or two texture fetches per element,
 * no loops, no per-pixel trig-heavy math. This follows directly from the perf notes: batch
 * offscreen passes, pre-bake noise, and keep the fragment shaders themselves cheap so the
 * FBO count/bind count is what governs cost, not what's inside any single shader.
 *
 * There are exactly three programs on the hot path — one "visual quad" shader and one "light
 * contribution" shader, each handling all 7 elements via a uniform branch (`u_element`) instead
 * of swapping programs per element, plus the composite/bloom chain — so per-frame program
 * switches stay fixed regardless of how many effect instances are active.
 */

export const ELEMENT_INDEX: Record<string, number> = {
  fire: 0,
  ice: 1,
  water: 2,
  lightning: 3,
  acid: 4,
  holy: 5,
  darkness: 6,
  shore: 7,
  shore2: 8,
  water2: 9,
  water3: 10,
  water4: 11,
  water5: 12,
};

const VERSION = "#version 300 es\n";
const PRECISION = "precision highp float;\n";

// ---------------------------------------------------------------------------
// Vertex shaders
// ---------------------------------------------------------------------------

/** Positions a billboard quad at a pixel-space center with a (possibly non-uniform) pixel
 * radius. v_local is the -1..1 shape space; v_uv is screen-space 0..1 for sampling the scene;
 * v_world is the same local offset applied to u_worldCenter instead of u_center — u_worldCenter
 * carries no camera-pan offset (see BattleEngine.effectAnchor), so v_world stays put under
 * panning the way v_uv/pixelPos deliberately do not. Not every fragment shader that pairs with
 * this vertex shader reads v_world (only FRAG_ELEMENTAL's water/river noise sampling does);
 * an unused `out` varying costs nothing. */
export const VERT_QUAD = `${VERSION}
layout(location = 0) in vec2 a_pos;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform vec2 u_radius;
uniform float u_rotation;
uniform vec2 u_worldCenter;
out vec2 v_local;
out vec2 v_uv;
out vec2 v_world;
void main() {
  v_local = a_pos;
  float c = cos(u_rotation);
  float s = sin(u_rotation);
  vec2 rotated = vec2(a_pos.x * c - a_pos.y * s, a_pos.x * s + a_pos.y * c);
  vec2 pixelPos = u_center + rotated * u_radius;
  vec2 zeroOne = pixelPos / u_resolution;
  vec2 clip = zeroOne * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = vec2(zeroOne.x, 1.0 - zeroOne.y);
  v_world = u_worldCenter + rotated * u_radius;
}
`;

/** One oversized triangle covering clip space, for full-screen passes. */
export const VERT_FULLSCREEN = `${VERSION}
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// A hex tile's board uses pointy-top hexagons (vertex straight up/down, flat left/right edges
// — see engine.ts hexPath). Every element used a circular length() for its silhouette, which
// reads as a foreign shape dropped onto a hex board. This is the same hexagon, not a rounded
// approximation of one: max(|y|, 0.866|x| + 0.5|y|) is exactly 1 at all six vertices and along
// every straight edge between them, for the price of an abs and a max.
const HEX_SHAPE = `
float hexDist(vec2 p) {
  vec2 q = abs(p);
  return max(q.y, q.x * 0.8660254 + q.y * 0.5);
}
`;

// A live 3x3 jittered-cell search (9 cheap hash taps, no texture fetch) instead of the
// pre-baked noise texture's edge channel — that channel's cell grid had nothing to do with
// the separate hash used for each facet's fake normal, so cracks and facets came from two
// unrelated partitions and never lined up. This returns both the crack-edge distance AND the
// winning cell's own random value from the same search, so a facet's shading and the crack
// around it are guaranteed to agree.
const ICE_CELLS = `
vec2 iceCell(vec2 p, out float edge) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  vec2 jitter = vec2(0.0);
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 n = vec2(float(ox), float(oy));
      vec2 id = i + n;
      vec2 h = fract(sin(vec2(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)))) * 43758.5453);
      vec2 diff = n + h - f;
      float dist = dot(diff, diff);
      if (dist < f1) { f2 = f1; f1 = dist; jitter = h; }
      else if (dist < f2) { f2 = dist; }
    }
  }
  edge = sqrt(f2) - sqrt(f1);
  return jitter;
}
`;

const LIGHTNING_TRACE = `
float boltX(float y, float seed, float retrig, float amp) {
  float n1 = sampleFbm(vec2(y * 6.4 + seed, retrig * 0.19));
  float n2 = sampleFbm(vec2(y * 17.0 + seed * 2.7, retrig * 0.37 + 3.1));
  float n3 = sampleFbm(vec2(y * 39.0 + seed * 5.2, retrig * 0.11 + 8.4));
  return (n1 - 0.5) * amp + (n2 - 0.5) * amp * 0.42 + (n3 - 0.5) * 0.07;
}
`;

const NOISE_SAMPLE = `
uniform sampler2D u_noiseTex;
// Combine the three baked octaves into one fbm-ish scalar from a single fetch.
float sampleFbm(vec2 uv) {
  vec3 n = texture(u_noiseTex, uv).rgb;
  return n.r * 0.55 + n.g * 0.3 + n.b * 0.15;
}
float sampleEdge(vec2 uv) {
  return texture(u_noiseTex, uv).a;
}
`;

// Fake-3D shading from a 2D scalar field. GLSL ES 300 gives dFdx/dFdy for free in a fragment
// shader (no extension needed), so a noise/height value turns into a real surface normal —
// diffuse + specular against a fixed light direction — for the cost of two derivative ops.
// This is what turns "flat blended blob" into something that reads as lit and dimensional.
const SHADING = `
const vec3 LIGHT_DIR = vec3(-0.42, 0.56, 0.71);
vec3 relief(float h, float steepness, vec3 baseColor, float shininess, float specStrength, float ambient) {
  vec3 n = normalize(vec3(-dFdx(h) * steepness, -dFdy(h) * steepness, 1.0));
  float ndotl = max(dot(n, LIGHT_DIR), 0.0) * (1.0 - ambient) + ambient;
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfV = normalize(LIGHT_DIR + viewDir);
  float spec = pow(max(dot(n, halfV), 0.0), shininess) * specStrength;
  return baseColor * ndotl + vec3(1.0) * spec;
}
`;

// Standard seamless-tiling fix applied to water: sample the shared noise field from a
// camera-independent world position (v_world, see VERT_QUAD) instead of this quad's own local
// uv — the "world-position UV mapping" technique, one level up from a texture's own UVs. Every
// Water/Shore/Water2 placement reads the SAME underlying wave value at its actual world
// position, so two adjacent hexes' colors agree exactly at their shared edge instead of
// drifting apart the way two independently-stamped tile photos always do (see engine.ts
// renderGround, which stops drawing those photos under a Water/Water2 placement so this is the
// only thing being drawn there at all). v_world specifically (not v_uv * u_resolution, which
// this used before) is what keeps the pattern from visibly sliding every time the camera pans —
// v_uv is screen space, so it changes on every pan/zoom even for a hex that hasn't moved on the
// map, which read as the whole water surface swimming in lockstep with the camera instead of
// just animating. Deliberately NOT using relief()'s specular highlight here — that read as a
// glaring hot spot, far punchier than every other tile around it. This is a gentle, mostly-flat
// tint with just enough noise-driven brightness ripple to not go dead-static, blended with a
// light touch of the refracted scene for a hint of nearby shore/decorations reflecting.
const WATER_SURFACE = `
vec3 waterSurface(vec2 vUv, out float h) {
  vec2 worldPos = v_world * 0.008 * u_noiseScale;
  h = sampleFbm(worldPos + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
  vec3 tint = u_color * (0.88 + 0.24 * h);
  vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
  vec3 sceneCol = texture(u_scene, vUv + disp).rgb;
  vec3 col = mix(tint, sceneCol * u_color * 1.15, 0.35);
  return col * u_intensity;
}
`;

// Shared natural-shoreline shape for Water3/4/5 — one function, three tunings (see the three
// call sites below), instead of three near-duplicate branches. This is Shore's own structure
// (one side open water, the rest a sand/wet-sand/foam fringe that fades to fully transparent,
// revealing the real land art underneath — same "half water, half transparency" contract as
// Shore, NOT a channel running through the tile), with one change: Shore's water/land boundary
// is a single horizontal line whose Y position only breathes over time (the tide sine), the
// same straight cut at every X. Here the boundary's Y position is ALSO a function of X, built
// from low-frequency noise (the smooth curve of the coastline) plus a finer, higher-frequency
// layer on top (the ragged, pixel-to-pixel roughness a perfectly smooth curve never has) — both
// sampled from v_world so the coastline is a real, continuous, camera-stable shape that keeps
// going from hex to hex instead of restarting at every tile. The three variants differ only in
// waveFreq/waveAmp/roughFreq/roughAmp (how broad the curve is, how rough its edge is), not in
// structure — see the three call sites for what each stands for.
const NATURAL_SHORE_SURFACE = `
vec3 naturalShoreSurface(float waveFreq, float waveAmp, float roughFreq, float roughAmp, float baseline, out float alpha) {
  float d = hexDist(v_local);
  if (d > 1.0) { alpha = 0.0; return vec3(0.0); }
  vec2 worldPos = v_world * 0.008;
  float wave = (sampleFbm(vec2(worldPos.x * waveFreq, u_seed * 0.013 + 2.0)) - 0.5) * waveAmp;
  float rough = (sampleFbm(vec2(worldPos.x * roughFreq, u_seed * 0.013 + 7.0)) - 0.5) * roughAmp;
  // A gentle breathing tide on top of the coastline's own fixed shape, same idea as Shore's.
  float tideBreath = 0.06 * sin(u_time * u_scrollSpeed * 0.5 + u_seed * 5.0);
  float boundary = baseline + wave + rough + tideBreath;
  float front = v_local.y - boundary;
  float h;
  vec3 waterCol = waterSurface(v_uv, h);
  float foamNoise = sampleFbm(v_local * 3.0 - vec2(0.0, u_time * u_scrollSpeed * 1.5));
  float foamBand = smoothstep(0.08, 0.0, abs(front)) * smoothstep(0.35, 0.55, foamNoise + 0.3);
  float wetSand = smoothstep(0.25, -0.05, front) * 0.4;
  float waterMask = smoothstep(0.05, -0.3, front);
  vec3 sand = vec3(0.78, 0.68, 0.5);
  vec3 col = mix(sand, waterCol, clamp(waterMask + wetSand, 0.0, 1.0));
  col = mix(col, vec3(1.0), foamBand);
  float aaHex = fwidth(d);
  float hexMask = smoothstep(1.0 + aaHex, 1.0 - aaHex, d);
  alpha = clamp(waterMask * 0.85 + wetSand + foamBand, 0.0, 1.0) * hexMask;
  return col;
}
`;

// ---------------------------------------------------------------------------
// Master elemental "visual quad" shader — handles all 7 elements.
// ---------------------------------------------------------------------------

export const FRAG_ELEMENTAL = `${VERSION}${PRECISION}
in vec2 v_local;
in vec2 v_uv;
in vec2 v_world;
out vec4 fragColor;

uniform int u_element;
uniform float u_time;
uniform float u_frameSeed;
uniform float u_seed;
uniform float u_noiseScale;
uniform float u_scrollSpeed;
uniform float u_intensity;
uniform float u_age;
uniform float u_duration;
uniform float u_variant;
uniform vec3 u_color;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
${NOISE_SAMPLE}
${SHADING}
${HEX_SHAPE}
${WATER_SURFACE}
${NATURAL_SHORE_SURFACE}
${ICE_CELLS}
${LIGHTNING_TRACE}

const int FIRE = 0;
const int ICE = 1;
const int WATER = 2;
const int LIGHTNING = 3;
const int ACID = 4;
const int HOLY = 5;
const int DARKNESS = 6;
const int SHORE = 7;
const int SHORE2 = 8;
const int WATER2 = 9;
const int WATER3 = 10;
const int WATER4 = 11;
const int WATER5 = 12;

void main() {
  vec2 uv = v_local * 0.5 + 0.5;
  // Hex-shaped for every silhouette/falloff below (ice's crystal bounds, water's pond edge,
  // acid's pool, darkness's void, fire's ground glow); rad is the true Euclidean length,
  // kept separately for the one thing that actually needs a real direction vector (darkness's
  // pull toward its origin) rather than a shape mask.
  float d = hexDist(v_local);
  float rad = length(v_local);

  if (u_element == FIRE) {
    // Combat blast: short-lived expanding fireball. Map-placed fire and leftover embers
    // fall through to the flame body below (u_duration == 0 or a longer linger).
    if (u_duration > 0.001 && u_duration < 0.6) {
      float t = clamp(u_age / max(u_duration, 0.001), 0.0, 1.0);
      float r = length(v_local);
      float expand = mix(0.04, 1.18, pow(t, 0.42));
      float ring = smoothstep(0.14, 0.0, abs(r - expand));
      float ball = smoothstep(expand, expand * 0.12, r) * (1.0 - smoothstep(0.15, 0.85, t));
      float flash = exp(-r * 2.8) * (1.0 - smoothstep(0.0, 0.28, t));
      float n = sampleFbm(uv * 5.2 + vec2(u_seed, u_time * 4.5));
      float tongues = smoothstep(0.32, 0.9, n) * smoothstep(expand + 0.2, 0.0, r) * (1.0 - t);
      vec3 hot = vec3(1.0, 0.97, 0.82);
      vec3 mid = u_color * vec3(1.15, 0.7, 0.18);
      vec3 dark = u_color * vec3(0.45, 0.12, 0.02);
      vec3 col = hot * (flash * 2.6 + ball * 1.8) + mix(mid, dark, t) * (ring * 1.7 + tongues * 1.1);
      float alpha = clamp((flash * 1.2 + ball + ring + tongues * 0.7) * u_intensity * (1.0 - t * 0.55), 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }

    vec2 warp = vec2(sampleFbm(uv * u_noiseScale * 0.6 + vec2(0.0, -u_time * u_scrollSpeed * 0.5)),
                      sampleFbm(uv * u_noiseScale * 0.6 + 19.3 - u_time * u_scrollSpeed * 0.3));
    float h = sampleFbm(uv * u_noiseScale + (warp - 0.5) * 0.9 + vec2(0.0, -u_time * u_scrollSpeed));
    float sway = (sampleFbm(vec2(uv.y * 2.2 + u_seed, u_time * u_scrollSpeed * 1.1)) - 0.5) * 0.4 * (1.0 - uv.y * 0.5);
    float edgeNoise = sampleFbm(vec2(uv.y * 7.0 + u_seed * 3.1, u_time * u_scrollSpeed * 2.2 + 4.0));
    float widthTaper = mix(0.04, 0.6, pow(clamp(uv.y, 0.0, 1.0), 0.8)) * (0.55 + 0.7 * edgeNoise);
    float xOff = v_local.x - sway;
    float body = smoothstep(1.1, 0.15, abs(xOff) / max(0.03, widthTaper)) * smoothstep(0.0, 0.08, uv.y);
    float flicker = smoothstep(0.3, 0.85, h + uv.y * 0.22);
    float mask = body * flicker;
    vec3 cool = u_color * 0.35;
    vec3 mid = u_color * 1.1;
    vec3 hot = vec3(1.0, 0.94, 0.72);
    vec3 base = mix(cool, mid, smoothstep(0.0, 0.55, h));
    base = mix(base, hot, smoothstep(0.55, 0.95, h) * smoothstep(0.0, 0.5, uv.y));
    vec3 lit = relief(h * 3.2, 5.0, base, 18.0, 0.5, 0.55);
    float pool = smoothstep(0.85, 0.0, d) * smoothstep(0.0, 0.3, uv.y) * 0.55;
    vec3 col = lit + u_color * pool;
    float fade = 1.0;
    if (u_duration > 0.001) {
      float k = clamp(u_age / u_duration, 0.0, 1.0);
      fade = k < 0.55 ? 1.0 : 1.0 - (k - 0.55) / 0.45;
    }
    float alpha = clamp((mask * u_intensity + pool * 0.4 * u_intensity) * fade, 0.0, 1.0);
    fragColor = vec4(col * alpha, alpha);
    return;
  }

  if (u_element == ICE) {
    if (d > 1.0) discard;
    // Faceted low-poly gem: crack lines and each facet's flat normal come from the SAME
    // voronoi cell (see iceCell), so a facet's flat shading always stops exactly at its own
    // crack line instead of two unrelated noise fields disagreeing with each other.
    float edge;
    vec2 jitter = iceCell(uv * u_noiseScale * 1.7 + u_seed, edge);
    float crack = 1.0 - smoothstep(0.0, 0.055, edge);
    vec3 facetN = normalize(vec3((jitter * 2.0 - 1.0) * 0.9, 1.0));
    float ndotl = max(dot(facetN, LIGHT_DIR), 0.0);
    vec3 halfV = normalize(LIGHT_DIR + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(facetN, halfV), 0.0), 60.0) * 2.0;
    vec3 facetColor = u_color * (0.3 + 0.9 * ndotl) + vec3(1.0) * spec;
    facetColor = mix(facetColor, vec3(0.015, 0.04, 0.07), crack);
    float atten = smoothstep(1.0, 0.25, d);
    float rim = smoothstep(0.65, 1.0, d);
    vec2 caOffset = v_local * rim * 0.008;
    vec3 sceneEdge = vec3(texture(u_scene, v_uv + caOffset).r, texture(u_scene, v_uv).g, texture(u_scene, v_uv - caOffset).b);
    vec3 col = mix(facetColor, sceneEdge, rim * 0.4);
    float alpha = clamp((0.5 + 0.5 * ndotl + spec * 0.5) * atten * u_intensity, 0.0, 1.0);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == WATER) {
    // Unconditional — the same waterSurface() + hard edge every water-family kind's water
    // side already uses (Shore/Shore2/Water2/Water3/4/5, see their own branches), so any two
    // adjacent water-FX tiles blend into one continuous body no matter which kinds they are.
    // No neighbor detection, no fringe: a hard, fixed ~1px edge instead of a wide fade is what
    // keeps two touching hexes from both fading toward transparent at their shared line and
    // leaving a hairline gap — see WATER_SURFACE's own comment for the fuller explanation.
    if (d > 1.0) discard;
    float h;
    vec3 col = waterSurface(v_uv, h);
    float aa = fwidth(d);
    float alpha = smoothstep(1.0 + aa, 1.0 - aa, d);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == LIGHTNING) {
    // Quad is centered on the targeted hex. v_local.y = -1 is sky, 0 is the hex, +y is below.
    // The filament runs sky → hex and dies there — it must not keep going down the screen.
    vec2 p = v_local;
    if (p.y > 0.22) { fragColor = vec4(0.0); return; }

    float y = clamp(p.y + 1.0, 0.0, 1.0);
    float front = clamp(u_age / 0.06, 0.0, 1.0);
    float head = smoothstep(front + 0.08, front - 0.02, y);
    if (head <= 0.001) { fragColor = vec4(0.0); return; }
    // Soft stop on the hex so the core doesn't punch through the tile into the floor.
    float groundStop = 1.0 - smoothstep(0.92, 1.02, y);

    float retrig = floor(u_time * 26.0 + u_seed * 3.0);
    float flick = fract(sin(retrig * 91.71 + u_seed) * 43758.5453);
    float live = mix(0.12, 1.0, step(0.14, flick));

    float amp = 0.42 * (0.75 + 0.25 * u_intensity);
    float xMain = boltX(y, u_seed, retrig, amp);
    float dMain = abs(p.x - xMain);

    float thick = mix(0.012, 0.034, y * y);
    float core = smoothstep(thick, 0.0, dMain);
    float filament = smoothstep(thick * 2.8, 0.0, dMain);
    float glow = smoothstep(0.22, 0.0, dMain) * 0.55;

    float xGhost = boltX(y, u_seed + 9.1, retrig - 1.0, amp * 0.85);
    float ghost = smoothstep(0.045, 0.0, abs(p.x - xGhost)) * 0.35;

    float fork = 0.0;
    for (int i = 0; i < 3; i++) {
      float y0 = 0.22 + float(i) * 0.23 + fract(u_seed * (0.13 + float(i) * 0.07)) * 0.08;
      if (y < y0 || y > 0.97) continue;
      float t = (y - y0) / max(0.08, 1.0 - y0);
      if (t > 0.72) continue;
      float side = (i == 1) ? -1.0 : 1.0;
      if (i == 2) side = (fract(u_seed * 4.7) > 0.5) ? 1.0 : -1.0;
      float xb = boltX(y, u_seed + 4.0 + float(i) * 5.3, retrig, 0.22);
      float xF = mix(xMain, xMain + side * (0.18 + t * 0.7) + xb, smoothstep(0.0, 0.12, t));
      float dF = abs(p.x - xF);
      float th = mix(0.02, 0.008, t);
      fork += smoothstep(th * 2.2, 0.0, dF) * (1.0 - t) * 0.85;
      fork += smoothstep(0.12, 0.0, dF) * (1.0 - t) * 0.2;
    }

    float hazeN = sampleFbm(vec2(p.x * 3.0 + u_seed, y * 4.0 + retrig * 0.05));
    float column = (1.0 - smoothstep(0.0, 0.55, abs(p.x))) * (0.12 + 0.2 * hazeN) * (0.25 + 0.75 * y);

    // Impact sits on the hex (p.y ≈ 0), not at the bottom of the quad.
    vec2 hit = vec2(p.x, p.y * 2.8);
    float impact = pow(max(0.0, 1.0 - length(hit)), 2.2);
    float shock = pow(max(0.0, 1.0 - length(vec2(p.x * 0.65, p.y * 3.2))), 1.4) * 0.65;

    float plasma = (core * 1.8 + filament * 0.9 + fork + ghost) * live * head * groundStop;
    float wash = (glow * groundStop + column * groundStop + impact * 1.4 + shock) * live * head;

    vec3 hot = vec3(0.92, 0.97, 1.0);
    vec3 ion = u_color * vec3(0.55, 0.75, 1.35);
    vec3 col = hot * plasma * 2.4 + ion * wash * 1.6;
    col += vec3(0.15, 0.0, 0.35) * filament * (1.0 - core) * 0.5 * live * groundStop;

    float alpha = clamp((plasma + wash * 0.7) * u_intensity, 0.0, 1.0);
    fragColor = vec4(col * alpha, alpha);
    return;
  }

  if (u_element == ACID) {
    // Combat glob (variant 1): a lumpy flying droplet. Splash (short duration): impact burst.
    // Map-placed acid and leftover pools use the bubbling hex below.
    if (u_variant > 0.5 && u_variant < 1.5) {
      float lump = sampleFbm(vec2(v_local.x * 4.0 + u_seed, u_time * 6.0));
      float yWob = (lump - 0.5) * 0.18;
      float head = exp(-length(v_local - vec2(0.5, yWob)) * 7.5);
      float body = exp(-length(v_local - vec2(0.1, yWob * 0.6)) * 4.2);
      float drip = smoothstep(0.22, 0.0, abs(v_local.y - yWob)) * smoothstep(-1.0, 0.4, v_local.x) * smoothstep(1.05, 0.2, v_local.x);
      vec3 hot = vec3(0.82, 1.0, 0.35);
      vec3 ion = u_color;
      vec3 col = hot * head * 2.2 + ion * (body * 1.3 + drip * 0.9);
      float alpha = clamp((head * 1.15 + body + drip * 0.7) * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_duration > 0.001 && u_duration < 0.6) {
      float t = clamp(u_age / max(u_duration, 0.001), 0.0, 1.0);
      float r = length(v_local);
      float expand = mix(0.05, 1.2, pow(t, 0.42));
      float ring = smoothstep(0.14, 0.0, abs(r - expand));
      float ball = smoothstep(expand, expand * 0.12, r) * (1.0 - smoothstep(0.12, 0.82, t));
      float flash = exp(-r * 2.6) * (1.0 - smoothstep(0.0, 0.28, t));
      float n = sampleFbm(uv * 5.4 + vec2(u_seed, u_time * 3.5));
      float spat = smoothstep(0.4, 0.9, n) * smoothstep(expand + 0.18, 0.0, r) * (1.0 - t);
      vec3 hot = vec3(0.85, 1.0, 0.4);
      vec3 mid = u_color;
      vec3 dark = u_color * vec3(0.15, 0.35, 0.08);
      vec3 col = hot * (flash * 2.2 + ball * 1.5) + mix(mid, dark, t) * (ring * 1.5 + spat * 1.1);
      float alpha = clamp((flash * 1.1 + ball + ring + spat * 0.7) * u_intensity * (1.0 - t * 0.5), 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (d > 1.0) discard;
    vec2 warped = uv + vec2(0.0, sin(u_time * 1.4 + uv.x * 9.0) * 0.015 * u_intensity - u_time * 0.02);
    float h = sampleFbm(warped * u_noiseScale - vec2(0.0, u_time * u_scrollSpeed)) + 0.1 * sin(u_time * 3.1 + uv.x * 21.0 + uv.y * 15.0);
    float bubble = smoothstep(0.5, 0.95, h);
    vec3 base = mix(u_color * 0.4, u_color * 1.4, bubble);
    vec3 lit = relief(h * 4.0, 6.0, base, 34.0, 0.9, 0.45);
    float atten = smoothstep(1.0, 0.12, d);
    float fade = 1.0;
    if (u_duration > 0.001) {
      float k = clamp(u_age / u_duration, 0.0, 1.0);
      fade = k < 0.5 ? 1.0 : 1.0 - (k - 0.5) / 0.5;
    }
    float alpha = clamp((0.35 + 0.65 * bubble) * atten * u_intensity * fade, 0.0, 1.0);
    fragColor = vec4(lit * alpha, alpha);
    return;
  }

  if (u_element == HOLY) {
    // Combat Magic Missile: a darting arcane comet (variant 1) or a hit burst (variant 2).
    // Map-placed holy keeps the original column.
    if (u_variant > 0.5 && u_variant < 1.5) {
      float head = exp(-length(v_local - vec2(0.55, 0.0)) * 9.0);
      float core = exp(-length(v_local - vec2(0.35, 0.0)) * 5.5);
      float trail = smoothstep(0.28, 0.0, abs(v_local.y)) * smoothstep(-1.05, 0.55, v_local.x) * smoothstep(1.0, 0.15, v_local.x);
      float n = sampleFbm(vec2(v_local.x * 3.0 + u_seed, u_time * 8.0 + u_seed));
      trail *= 0.65 + 0.55 * n;
      vec3 hot = vec3(0.95, 0.82, 1.0);
      vec3 ion = u_color;
      vec3 col = hot * head * 2.8 + ion * (core * 1.4 + trail * 1.1);
      float alpha = clamp((head * 1.3 + core + trail * 0.75) * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_variant > 1.5 && u_variant < 2.5) {
      float t = clamp(u_age / max(u_duration, 0.001), 0.0, 1.0);
      float r = length(v_local);
      float expand = mix(0.05, 1.12, pow(t, 0.4));
      float ring = smoothstep(0.12, 0.0, abs(r - expand));
      float ball = smoothstep(expand, expand * 0.1, r) * (1.0 - smoothstep(0.12, 0.8, t));
      float flash = exp(-r * 3.0) * (1.0 - smoothstep(0.0, 0.25, t));
      float rays = 0.0;
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.047 + u_seed;
        vec2 dir = vec2(cos(a), sin(a) * 0.72);
        float dRay = abs(dot(v_local, vec2(-dir.y, dir.x)));
        rays += smoothstep(0.08, 0.0, dRay) * smoothstep(expand + 0.15, 0.0, r) * (1.0 - t);
      }
      vec3 hot = vec3(1.0, 0.9, 1.0);
      vec3 ion = u_color;
      vec3 col = hot * (flash * 2.4 + ball * 1.6) + ion * (ring * 1.5 + rays * 0.7);
      float alpha = clamp((flash + ball + ring + rays * 0.5) * u_intensity * (1.0 - t * 0.5), 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_variant > 2.5 && u_variant < 3.5) {
      // Dream-web dart: three silk threads with a violet head.
      float silk = 0.0;
      for (int i = 0; i < 3; i++) {
        float yoff = (float(i) - 1.0) * 0.13;
        yoff += (sampleFbm(vec2(v_local.x * 2.4 + u_seed + float(i), u_time * 3.0)) - 0.5) * 0.1;
        silk += smoothstep(0.07, 0.0, abs(v_local.y - yoff)) * smoothstep(-1.05, 0.55, v_local.x) * smoothstep(1.05, 0.2, v_local.x);
      }
      float head = exp(-length(v_local - vec2(0.52, 0.0)) * 8.0);
      vec3 hot = vec3(0.95, 0.78, 1.0);
      vec3 ion = u_color;
      vec3 col = hot * head * 2.4 + ion * silk * 1.35;
      float alpha = clamp((head * 1.2 + silk * 0.85) * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_variant > 3.5 && u_variant < 4.5) {
      // Dream web on a hex: expanding silk mesh that settles and breathes.
      float t = u_duration > 0.001 ? clamp(u_age / u_duration, 0.0, 1.0) : 0.0;
      float grow = mix(0.12, 1.05, clamp(u_age / 0.28, 0.0, 1.0));
      float hd = hexDist(v_local);
      if (hd > grow) { fragColor = vec4(0.0); return; }
      float r = length(v_local);
      float spokes = 0.0;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398 + u_seed * 0.15;
        vec2 dir = vec2(cos(a), sin(a) * 0.55);
        float dRay = abs(v_local.x * dir.y - v_local.y * dir.x);
        spokes += smoothstep(0.045, 0.0, dRay) * smoothstep(grow, 0.05, r);
      }
      float rings = abs(sin(r * 10.0 - min(u_age * 6.0, 2.2)));
      rings = smoothstep(0.4, 0.0, rings) * smoothstep(grow, 0.12, r);
      float silkN = sampleFbm(v_local * 3.6 + vec2(u_seed, u_time * 0.18));
      float mesh = spokes * 1.1 + rings * 0.75 + silkN * 0.28 * (1.0 - hd);
      float fade = t < 0.35 ? 1.0 : 1.0 - (t - 0.35) / 0.65;
      vec3 hot = vec3(0.92, 0.72, 1.0);
      vec3 ion = u_color;
      vec3 col = mix(ion, hot, clamp(spokes, 0.0, 1.0)) * mesh;
      float alpha = clamp(mesh * 0.95 * fade * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_variant > 4.5 && u_variant < 5.5) {
      // Steel blade swoosh — a curved ribbon that wipes across the quad.
      float t = clamp(u_age / max(u_duration, 0.001), 0.0, 1.0);
      float curve = v_local.y - 0.2 * sin((v_local.x * 0.5 + 0.5) * 3.14159265);
      float dRibbon = abs(curve);
      float ribbon = smoothstep(0.2, 0.0, dRibbon);
      float coreS = smoothstep(0.055, 0.0, dRibbon);
      float along = v_local.x * 0.5 + 0.5;
      float reveal = smoothstep(along - 0.18, along + 0.02, t * 1.35);
      float fade = 1.0 - smoothstep(0.42, 1.0, t);
      vec3 hot = vec3(0.95, 0.97, 1.0);
      vec3 col = mix(u_color, hot, coreS);
      float alpha = clamp((ribbon * 0.65 + coreS) * reveal * fade * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    if (u_variant > 5.5) {
      float t = clamp(u_age / max(u_duration, 0.001), 0.0, 1.0);
      float r = length(vec2(v_local.x, v_local.y / 0.62));
      float rad = mix(0.12, 1.08, pow(t, 0.5));
      float ring = smoothstep(0.11, 0.0, abs(r - rad));
      float flash = exp(-r * 2.4) * (1.0 - smoothstep(0.0, 0.32, t));
      vec3 hot = vec3(0.93, 0.95, 1.0);
      vec3 col = hot * flash * 1.6 + u_color * ring * 1.3;
      float alpha = clamp((flash + ring) * (1.0 - t * 0.45) * u_intensity, 0.0, 1.0);
      fragColor = vec4(col * alpha, alpha);
      return;
    }
    float core = smoothstep(0.14, 0.0, abs(v_local.x));
    float wide = smoothstep(0.55, 0.05, abs(v_local.x)) * 0.45;
    float ray1 = smoothstep(0.32, 0.0, abs(v_local.x - v_local.y * 0.4)) * 0.22;
    float ray2 = smoothstep(0.32, 0.0, abs(v_local.x + v_local.y * 0.4)) * 0.22;
    float flicker = 0.85 + 0.15 * sin(u_time * 2.0 + u_seed * 6.0);
    float vfade = smoothstep(1.05, 0.05, abs(v_local.y));
    vec3 col = mix(u_color * 1.1, vec3(1.0, 0.98, 0.9), core * 0.8);
    float alpha = clamp((core + wide + ray1 + ray2) * flicker * vfade * u_intensity, 0.0, 1.0);
    fragColor = vec4(col * alpha, alpha);
    return;
  }

  if (u_element == DARKNESS) {
    // Roiling dark smoke, not a glowing ring: patchy noise-masked wisps that pull the
    // background inward and swallow its light, with only the faintest veins of the tint
    // showing deep inside the smoke instead of a bright halo announcing the edge.
    if (d > 1.0) discard;
    vec2 warpA = vec2(sampleFbm(uv * u_noiseScale * 0.7 + u_time * u_scrollSpeed * 0.25),
                       sampleFbm(uv * u_noiseScale * 0.7 - u_time * u_scrollSpeed * 0.2 + 9.1));
    float smoke = sampleFbm(uv * u_noiseScale * 1.3 + (warpA - 0.5) * 1.2 - vec2(0.0, u_time * u_scrollSpeed * 0.5));
    float wisp = smoothstep(0.26, 0.8, smoke) * smoothstep(1.0, 0.15, d);
    vec2 dir = rad > 0.001 ? v_local / rad : vec2(0.0);
    vec2 sampleUv = v_uv - dir * (1.0 - d) * u_intensity * 0.16;
    vec3 scene = texture(u_scene, sampleUv).rgb;
    vec3 smokeColor = mix(vec3(0.015, 0.015, 0.02), u_color * 0.4, smoke * 0.35);
    vec3 darkened = mix(scene, scene * 0.12 + smokeColor, wisp);
    // A thin threshold band through the same noise field reads as faint dark energy veins —
    // deep violet-black, barely brighter than the smoke around them, never a lit color.
    float veins = smoothstep(0.6, 0.64, smoke) - smoothstep(0.64, 0.68, smoke);
    vec3 col = darkened + u_color * veins * 0.4;
    float alpha = clamp((wisp * 0.9 + veins * 0.25) * u_intensity, 0.0, 1.0);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == SHORE) {
    // Waves lapping a beach on the sea-facing half of the hex (v_local.y > 0; u_rotation on
    // the spawn orients which edge that is); the other half is the exact same WATER formula
    // above, verbatim, so the two halves of the tile are the same water.
    if (d > 1.0) discard;
    if (v_local.y < 0.0) {
      float h;
      vec3 col = waterSurface(v_uv, h);
      float aa = fwidth(d);
      float alpha = smoothstep(1.0 + aa, 1.0 - aa, d);
      fragColor = vec4(col, alpha);
      return;
    }
    float tide = 0.5 + 0.28 * sin(u_time * u_scrollSpeed * 0.6 + u_seed * 5.0);
    float front = v_local.y - tide;
    float hTide;
    vec3 waterCol = waterSurface(v_uv, hTide);
    float foamNoise = sampleFbm(uv * u_noiseScale * 4.0 - vec2(0.0, u_time * u_scrollSpeed * 1.5));
    float foamBand = smoothstep(0.1, 0.0, abs(front)) * smoothstep(0.35, 0.55, foamNoise + 0.3);
    float wetSand = smoothstep(0.3, -0.05, front) * 0.4;
    float waterMask = smoothstep(0.05, -0.35, front);
    vec3 sand = vec3(0.78, 0.68, 0.5);
    vec3 col = mix(sand, waterCol, clamp(waterMask + wetSand, 0.0, 1.0));
    col = mix(col, vec3(1.0), foamBand);
    float atten = smoothstep(1.0, 0.4, d);
    float alpha = clamp((waterMask * 0.85 + wetSand + foamBand) * atten, 0.0, 1.0);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == SHORE2) {
    // The exact mirror of SHORE: beach on v_local.y < 0, open water on v_local.y > 0. A
    // separate selectable element rather than a rotation control, so the opposite bank of a
    // river is one click away instead of needing an orientation UI.
    if (d > 1.0) discard;
    if (v_local.y > 0.0) {
      float h;
      vec3 col = waterSurface(v_uv, h);
      float aa = fwidth(d);
      float alpha = smoothstep(1.0 + aa, 1.0 - aa, d);
      fragColor = vec4(col, alpha);
      return;
    }
    float tide2 = 0.5 + 0.28 * sin(u_time * u_scrollSpeed * 0.6 + u_seed * 5.0);
    float front2 = -v_local.y - tide2;
    float h2;
    vec3 waterCol2 = waterSurface(v_uv, h2);
    float foamNoise2 = sampleFbm(uv * u_noiseScale * 4.0 - vec2(0.0, u_time * u_scrollSpeed * 1.5));
    float foamBand2 = smoothstep(0.1, 0.0, abs(front2)) * smoothstep(0.35, 0.55, foamNoise2 + 0.3);
    float wetSand2 = smoothstep(0.3, -0.05, front2) * 0.4;
    float waterMask2 = smoothstep(0.05, -0.35, front2);
    vec3 sand2 = vec3(0.78, 0.68, 0.5);
    vec3 col2 = mix(sand2, waterCol2, clamp(waterMask2 + wetSand2, 0.0, 1.0));
    col2 = mix(col2, vec3(1.0), foamBand2);
    float atten2 = smoothstep(1.0, 0.4, d);
    float alpha2 = clamp((waterMask2 * 0.85 + wetSand2 + foamBand2) * atten2, 0.0, 1.0);
    fragColor = vec4(col2, alpha2);
    return;
  }

  if (u_element == WATER2) {
    // The exact same water as WATER, but square instead of hex-shaped and meant to be
    // placed larger (see DEFAULT_RADIUS_TILES). The quad itself is already a square in
    // v_local space, so there's no hex mask at all here, just a hard fade right at its own
    // edge — dropped over a cluster of Water hexes it papers over any seam between them.
    float h;
    vec3 col = waterSurface(v_uv, h);
    float sq = max(abs(v_local.x), abs(v_local.y));
    float aaSq = fwidth(sq);
    float alpha = smoothstep(1.0 + aaSq, 1.0 - aaSq, sq);
    fragColor = vec4(col, alpha);
    return;
  }

  // WATER3/4/5 — three natural-shoreline typologies: like Shore, half water and half a
  // transparent fringe that reveals the real land art underneath, NOT a channel through the
  // tile's middle. All three call the shared naturalShoreSurface() above with different
  // tunings; see that function's own comment for what each parameter does.
  if (u_element == WATER3) {
    // Natural Shore: a moderate, gently wandering coastline — the baseline typology.
    float alpha;
    vec3 col = naturalShoreSurface(0.10, 0.55, 0.6, 0.1, 0.05, alpha);
    fragColor = vec4(col, alpha);
    return;
  }
  if (u_element == WATER4) {
    // Rocky Shore: less of the broad smooth curve, much more of the ragged high-frequency
    // roughness layer — an irregular, jagged little coastline instead of a graceful one.
    float alpha;
    vec3 col = naturalShoreSurface(0.16, 0.35, 1.0, 0.22, 0.0, alpha);
    fragColor = vec4(col, alpha);
    return;
  }
  // WATER5 — Bay Shore: low frequency, large amplitude — big, slow, sweeping bay-scale
  // curves, almost no fine roughness.
  float alpha;
  vec3 col = naturalShoreSurface(0.05, 0.85, 0.3, 0.06, 0.08, alpha);
  fragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Master "light contribution" shader — writes into LightMapFBO.
// Fire/acid/holy add a glow (additive); darkness subtracts (FUNC_REVERSE_SUBTRACT blend
// equation is set by the caller around this draw call).
// ---------------------------------------------------------------------------

export const FRAG_LIGHT = `${VERSION}${PRECISION}
in vec2 v_local;
in vec2 v_uv;
out vec4 fragColor;

uniform int u_element;
uniform float u_time;
uniform float u_seed;
uniform float u_intensity;
uniform vec3 u_color;

void main() {
  float d = length(v_local);
  if (d > 1.0) discard;
  // Inverse-square-ish falloff (not a linear smoothstep) plus a hot white center fading to
  // the tint — reads as an actual light source instead of a flat colored disc.
  float atten = pow(smoothstep(1.0, 0.0, d), 1.8);
  vec3 hotCore = mix(u_color, vec3(1.0), smoothstep(0.55, 0.0, d) * 0.5);

  if (u_element == 0) { // fire: pulsing point light
    float pulse = 0.8 + 0.2 * sin(u_time * 6.0 + u_seed * 10.0);
    float alpha = atten * u_intensity * pulse;
    fragColor = vec4(hotCore * alpha, alpha);
    return;
  }
  if (u_element == 3) { // lightning: hard white-blue flash, staccato
    float retrig = floor(u_time * 26.0 + u_seed);
    float flick = fract(sin(retrig * 12.9898) * 43758.5453);
    float pulse = mix(0.25, 1.35, step(0.18, flick));
    float alpha = pow(atten, 0.7) * u_intensity * pulse;
    vec3 bolt = mix(u_color, vec3(0.85, 0.93, 1.0), 0.7);
    fragColor = vec4(bolt * alpha * 1.8, alpha);
    return;
  }
  if (u_element == 4) { // acid: steady neon emissive
    float alpha = atten * u_intensity * 0.85;
    fragColor = vec4(hotCore * alpha, alpha);
    return;
  }
  if (u_element == 5) { // holy: soft wide glow feeding the bloom pass
    float alpha = atten * u_intensity;
    fragColor = vec4(hotCore * alpha, alpha);
    return;
  }
  // darkness: drawn with reverse-subtract blending by the caller — this just supplies magnitude.
  float alpha = atten * u_intensity;
  fragColor = vec4(vec3(alpha), alpha);
}
`;

// ---------------------------------------------------------------------------
// Composite + bloom chain
// ---------------------------------------------------------------------------

export const FRAG_COMPOSITE = `${VERSION}${PRECISION}
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene;
uniform sampler2D u_light;
uniform sampler2D u_effects;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
void main() {
  vec3 scene = texture(u_scene, v_uv).rgb;
  vec3 light = texture(u_light, v_uv).rgb;
  vec4 fx = texture(u_effects, v_uv);
  vec3 bloom = texture(u_bloom, v_uv).rgb;
  vec3 base = scene * light; // multiplicative scene x lightmap
  vec3 withFx = base * (1.0 - fx.a) + fx.rgb; // alpha-blended ground effects mix in...
  vec3 hdr = withFx + bloom * u_bloomStrength; // ...additive spell glow blooms on top
  // Everything below the threshold (the whole ordinary frame) passes through unchanged; only
  // the part already blowing past it (hot fire/holy cores stacking with bloom) gets softly
  // compressed toward 1 instead of hard-clipping flat white the instant it crosses 1.0.
  const float T = 0.82;
  vec3 over = max(hdr - T, 0.0);
  vec3 mapped = min(hdr, T) + (1.0 - T) * over / (over + (1.0 - T));
  fragColor = vec4(mapped, 1.0);
}
`;

export const FRAG_BRIGHTPASS = `${VERSION}${PRECISION}
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform float u_threshold;
void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  float brightness = max(c.r, max(c.g, c.b));
  float k = clamp((brightness - u_threshold) / max(0.0001, 1.0 - u_threshold), 0.0, 1.0);
  fragColor = vec4(c * k, 1.0);
}
`;

/** Soft additive mote for fire embers / holy rising particles. u_stretch elongates the quad
 * along local X at the vertex stage (via u_radius), so this only needs a directional fade. */
export const FRAG_PARTICLE = `${VERSION}${PRECISION}
in vec2 v_local;
out vec4 fragColor;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  float d = length(v_local);
  if (d > 1.0) discard;
  float tailFade = smoothstep(1.0, -0.3, v_local.x);
  float core = smoothstep(1.0, 0.0, d);
  float alpha = core * tailFade * u_alpha;
  fragColor = vec4(u_color * alpha, alpha);
}
`;

export const FRAG_BLUR = `${VERSION}${PRECISION}
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform vec2 u_direction;
void main() {
  vec3 sum = texture(u_src, v_uv).rgb * 0.227027;
  vec2 step1 = u_direction * u_texel * 1.3846153846;
  vec2 step2 = u_direction * u_texel * 3.2307692308;
  sum += texture(u_src, v_uv + step1).rgb * 0.3162162162;
  sum += texture(u_src, v_uv - step1).rgb * 0.3162162162;
  sum += texture(u_src, v_uv + step2).rgb * 0.0702702703;
  sum += texture(u_src, v_uv - step2).rgb * 0.0702702703;
  fragColor = vec4(sum, 1.0);
}
`;
