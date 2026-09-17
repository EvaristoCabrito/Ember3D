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
};

const VERSION = "#version 300 es\n";
const PRECISION = "precision highp float;\n";

// ---------------------------------------------------------------------------
// Vertex shaders
// ---------------------------------------------------------------------------

/** Positions a billboard quad at a pixel-space center with a (possibly non-uniform) pixel
 * radius. v_local is the -1..1 shape space; v_uv is screen-space 0..1 for sampling the scene. */
export const VERT_QUAD = `${VERSION}
layout(location = 0) in vec2 a_pos;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform vec2 u_radius;
uniform float u_rotation;
out vec2 v_local;
out vec2 v_uv;
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

// ---------------------------------------------------------------------------
// Master elemental "visual quad" shader — handles all 7 elements.
// ---------------------------------------------------------------------------

export const FRAG_ELEMENTAL = `${VERSION}${PRECISION}
in vec2 v_local;
in vec2 v_uv;
out vec4 fragColor;

uniform int u_element;
uniform float u_time;
uniform float u_frameSeed;
uniform float u_seed;
uniform float u_noiseScale;
uniform float u_scrollSpeed;
uniform float u_intensity;
uniform vec3 u_color;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
${NOISE_SAMPLE}
${SHADING}
${HEX_SHAPE}
${ICE_CELLS}

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

void main() {
  vec2 uv = v_local * 0.5 + 0.5;
  // Hex-shaped for every silhouette/falloff below (ice's crystal bounds, water's pond edge,
  // acid's pool, darkness's void, fire's ground glow); rad is the true Euclidean length,
  // kept separately for the one thing that actually needs a real direction vector (darkness's
  // pull toward its origin) rather than a shape mask.
  float d = hexDist(v_local);
  float rad = length(v_local);

  if (u_element == FIRE) {
    // Domain-warped turbulence (warp the sample point with a second noise fetch) instead of
    // a single flat lookup — this is what makes it read as roiling gas instead of a static
    // gradient. The result doubles as a height field for relief() below.
    vec2 warp = vec2(sampleFbm(uv * u_noiseScale * 0.6 + vec2(0.0, -u_time * u_scrollSpeed * 0.5)),
                      sampleFbm(uv * u_noiseScale * 0.6 + 19.3 - u_time * u_scrollSpeed * 0.3));
    float h = sampleFbm(uv * u_noiseScale + (warp - 0.5) * 0.9 + vec2(0.0, -u_time * u_scrollSpeed));
    // uv.y runs 0 (top of the quad, the flame's tip) to 1 (bottom, anchored at the hex) — the
    // taper has to be narrow at 0 and wide at 1, not the other way, or it draws an ice-cream
    // cone standing on its point instead of a flame sitting on the ground. A perfectly smooth
    // taper curve reads as a geometric cone no matter which way it points, though — real flame
    // edges are jagged and lean, so the centerline sways and the width itself is perturbed by
    // noise per height band instead of following one clean deterministic curve.
    float sway = (sampleFbm(vec2(uv.y * 2.2 + u_seed, u_time * u_scrollSpeed * 1.1)) - 0.5) * 0.4 * (1.0 - uv.y * 0.5);
    float edgeNoise = sampleFbm(vec2(uv.y * 7.0 + u_seed * 3.1, u_time * u_scrollSpeed * 2.2 + 4.0));
    float widthTaper = mix(0.04, 0.6, pow(clamp(uv.y, 0.0, 1.0), 0.8)) * (0.55 + 0.7 * edgeNoise);
    float xOff = v_local.x - sway;
    // Only fades at the tip (uv.y near 0) — the base (uv.y near 1) is the anchor itself and
    // stays fully wide, it never needs to taper back down.
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
    float alpha = clamp(mask * u_intensity + pool * 0.4 * u_intensity, 0.0, 1.0);
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
    // Same plain refraction as Shore's water half (see SHORE below) — no separate tuning,
    // no glint, no foam ring. Shore's water is the reference; this matches it exactly.
    //
    // The noise is sampled in absolute screen space (v_uv * u_resolution) instead of this
    // quad's own local uv, and carries no per-instance u_seed offset — every Water placement
    // reads the SAME underlying wave field at its actual position, so two adjacent hexes'
    // patterns line up continuously across the shared edge instead of each one restarting
    // its own pattern at its own tile boundary. Only the hex mask (d) stays per-instance;
    // the water itself reads as one continuous body wherever tiles touch.
    if (d > 1.0) discard;
    vec2 worldUv = v_uv * u_resolution * 0.008 * u_noiseScale;
    float h = sampleFbm(worldUv + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
    vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
    vec3 scene = texture(u_scene, v_uv + disp).rgb;
    vec3 col = scene * u_color * 1.15;
    // A fixed-percentage fade band leaves BOTH of two touching hexes fading toward
    // transparent right at their shared edge — neither one opaque there — which shows as a
    // hairline of bare terrain between them no matter how well the pattern lines up. A
    // fwidth-sized (~1px, adapts to zoom) edge stays alias-free without leaving a gap.
    float aa = fwidth(d) * 1.5;
    float atten = smoothstep(1.0 + aa, 1.0 - aa, d);
    float alpha = clamp(atten * u_intensity, 0.0, 1.0);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == LIGHTNING) {
    float t = uv.y;
    float flick = fract(sin((u_frameSeed + u_seed) * 91.71) * 43758.5453);
    if (flick < 0.08) { fragColor = vec4(0.0); return; }
    float n = sampleFbm(vec2(t * u_noiseScale + u_seed, u_frameSeed));
    float boltX = (n - 0.5) * 1.5;
    float dist = abs(v_local.x - boltX);
    float core = smoothstep(0.1, 0.0, dist);
    float glow = smoothstep(0.4, 0.0, dist) * 0.45;
    float fade = smoothstep(1.05, 0.85, abs(v_local.y));
    float alpha = clamp((core + glow) * u_intensity * fade, 0.0, 1.0);
    vec3 col = u_color + vec3(core * 0.6);
    fragColor = vec4(col * alpha, alpha);
    return;
  }

  if (u_element == ACID) {
    if (d > 1.0) discard;
    vec2 warped = uv + vec2(0.0, sin(u_time * 1.4 + uv.x * 9.0) * 0.015 * u_intensity - u_time * 0.02);
    float h = sampleFbm(warped * u_noiseScale - vec2(0.0, u_time * u_scrollSpeed)) + 0.1 * sin(u_time * 3.1 + uv.x * 21.0 + uv.y * 15.0);
    float bubble = smoothstep(0.5, 0.95, h);
    vec3 base = mix(u_color * 0.4, u_color * 1.4, bubble);
    // Glossy bubble-skin relief: same trick as fire/water, higher shininess for a wet look.
    vec3 lit = relief(h * 4.0, 6.0, base, 34.0, 0.9, 0.45);
    float atten = smoothstep(1.0, 0.12, d);
    float alpha = clamp((0.35 + 0.65 * bubble) * atten * u_intensity, 0.0, 1.0);
    fragColor = vec4(lit * alpha, alpha);
    return;
  }

  if (u_element == HOLY) {
    // A bright core column plus two angled streaks (cheap fixed "god rays") instead of one
    // flat vertical gradient, with a hot white center fading into the tint at the edges.
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
      float h = sampleFbm(v_uv * u_resolution * 0.008 * u_noiseScale + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
      vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
      vec3 scene = texture(u_scene, v_uv + disp).rgb;
      vec3 col = scene * u_color * 1.15;
      float aa = fwidth(d) * 1.5;
      float atten = smoothstep(1.0 + aa, 1.0 - aa, d);
      float alpha = clamp(atten * u_intensity, 0.0, 1.0);
      fragColor = vec4(col, alpha);
      return;
    }
    float tide = 0.5 + 0.28 * sin(u_time * u_scrollSpeed * 0.6 + u_seed * 5.0);
    float front = v_local.y - tide;
    float h = sampleFbm(v_uv * u_resolution * 0.008 * u_noiseScale + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
    vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
    vec3 scene = texture(u_scene, v_uv + disp).rgb;
    float foamNoise = sampleFbm(uv * u_noiseScale * 4.0 - vec2(0.0, u_time * u_scrollSpeed * 1.5));
    float foamBand = smoothstep(0.1, 0.0, abs(front)) * smoothstep(0.35, 0.55, foamNoise + 0.3);
    float wetSand = smoothstep(0.3, -0.05, front) * 0.4;
    float waterMask = smoothstep(0.05, -0.35, front);
    vec3 sand = vec3(0.78, 0.68, 0.5);
    vec3 col = mix(sand, scene * u_color * 1.15, clamp(waterMask + wetSand, 0.0, 1.0));
    col = mix(col, vec3(1.0), foamBand);
    float atten = smoothstep(1.0, 0.4, d);
    float alpha = clamp((waterMask * 0.85 + wetSand + foamBand) * atten * u_intensity, 0.0, 1.0);
    fragColor = vec4(col, alpha);
    return;
  }

  if (u_element == SHORE2) {
    // The exact mirror of SHORE: beach on v_local.y < 0, open water on v_local.y > 0. A
    // separate selectable element rather than a rotation control, so the opposite bank of a
    // river is one click away instead of needing an orientation UI.
    if (d > 1.0) discard;
    if (v_local.y > 0.0) {
      float h = sampleFbm(v_uv * u_resolution * 0.008 * u_noiseScale + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
      vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
      vec3 scene = texture(u_scene, v_uv + disp).rgb;
      vec3 col = scene * u_color * 1.15;
      float aa = fwidth(d) * 1.5;
      float atten = smoothstep(1.0 + aa, 1.0 - aa, d);
      float alpha = clamp(atten * u_intensity, 0.0, 1.0);
      fragColor = vec4(col, alpha);
      return;
    }
    float tide2 = 0.5 + 0.28 * sin(u_time * u_scrollSpeed * 0.6 + u_seed * 5.0);
    float front2 = -v_local.y - tide2;
    float h2 = sampleFbm(v_uv * u_resolution * 0.008 * u_noiseScale + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
    vec2 disp2 = vec2(dFdx(h2), dFdy(h2)) * 0.35;
    vec3 scene2 = texture(u_scene, v_uv + disp2).rgb;
    float foamNoise2 = sampleFbm(uv * u_noiseScale * 4.0 - vec2(0.0, u_time * u_scrollSpeed * 1.5));
    float foamBand2 = smoothstep(0.1, 0.0, abs(front2)) * smoothstep(0.35, 0.55, foamNoise2 + 0.3);
    float wetSand2 = smoothstep(0.3, -0.05, front2) * 0.4;
    float waterMask2 = smoothstep(0.05, -0.35, front2);
    vec3 sand2 = vec3(0.78, 0.68, 0.5);
    vec3 col2 = mix(sand2, scene2 * u_color * 1.15, clamp(waterMask2 + wetSand2, 0.0, 1.0));
    col2 = mix(col2, vec3(1.0), foamBand2);
    float atten2 = smoothstep(1.0, 0.4, d);
    float alpha2 = clamp((waterMask2 * 0.85 + wetSand2 + foamBand2) * atten2 * u_intensity, 0.0, 1.0);
    fragColor = vec4(col2, alpha2);
    return;
  }

  // WATER2 — the exact same water as WATER, but square instead of hex-shaped and meant to be
  // placed larger (see DEFAULT_RADIUS_TILES). The quad itself is already a square in
  // v_local space, so there's no hex mask at all here, just a soft fade right at its own
  // edge — dropped over a cluster of Water hexes it papers over any seam between them.
  float h = sampleFbm(v_uv * u_resolution * 0.008 * u_noiseScale + vec2(u_time * u_scrollSpeed * 0.4, 0.0));
  vec2 disp = vec2(dFdx(h), dFdy(h)) * 0.35;
  vec3 scene = texture(u_scene, v_uv + disp).rgb;
  vec3 col = scene * u_color * 1.15;
  float sq = max(abs(v_local.x), abs(v_local.y));
  float aaSq = fwidth(sq) * 1.5;
  float atten = smoothstep(1.0 + aaSq, 1.0 - aaSq, sq);
  float alpha = clamp(atten * u_intensity, 0.0, 1.0);
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
