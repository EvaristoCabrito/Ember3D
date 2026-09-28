/** MILESTONE 1 (done) — terrain, ground/behind-layer decorations, and animated unit sprites all
 * render through a real Three.js scene instead of the Canvas2D-shim WebGL renderer, as the first
 * slice of migrating the battlefield to a genuine spatial rendering environment (see the
 * architecture note below). "Front"-layer/foreground props still render through the existing
 * Canvas2D-shim units canvas, unchanged, stacked on top — this renderer replaces the
 * ground/terrain canvas and everything meant to draw under a unit, never anything meant to draw
 * in front of one (see BattleCanvas.tsx).
 *
 * MILESTONE 2 (done) — real DirectionalLight + AmbientLight-ish HemisphereLight, and real cast
 * shadows from invisible per-unit/per-decoration boxes with a synthetic elevation (see
 * shadowCasterMaterial/updateSun and THREEJS_MILESTONE2_HANDOFF.md).
 *
 * MILESTONE 3 (in progress) — real world-space ground mist + GPU-instanced drift particles (see
 * ThreeAtmosphere.ts, which owns this entirely — this file only constructs it, syncs it once per
 * frame, and disposes it). No bloom/post-processing yet, that's Milestone 4.
 *
 * ARCHITECTURE: every tile mesh is built ONCE at its fixed WORLD position (the same formula
 * BattleEngine.effectAnchor already uses for worldX/worldY) and never moves again. Camera
 * panning moves the CAMERA, not the tiles — a real spatial scene, not screen-space coordinates
 * recomputed every frame. This is what makes later milestones (real DirectionalLight/shadows,
 * world-space fog, depth-sorted particles) possible without another rewrite: every tile has an
 * actual, stable position in a 3D world a light or a fog volume can reason about.
 *
 * COORDINATE CONVENTION: the orthographic camera's frustum is a STANDARD (left=0, right=cssW,
 * top=cssH, bottom=0) one — top > bottom, the normal orientation. An orthographic camera with
 * an inverted frustum (top < bottom), which is what a naive "world Y increases down the screen"
 * port of BattleEngine's cx/cy convention would want, renders nothing at all in this Three.js
 * version (confirmed empirically: identical scene/camera/mesh renders correctly with a standard
 * frustum and renders nothing with an inverted one, regardless of camera or mesh position —
 * some part of the projection/clipping pipeline silently assumes top > bottom). So the Y-flip
 * BattleEngine's convention needs happens elsewhere instead: every mesh is placed at Y = -wy
 * (see hexWorld) rather than +wy, and the camera's own Y position is offset by -camY - cssH to
 * match. Both are derived once, together, in render()/ensureBuilt() — verified numerically
 * against BattleEngine's own cx/cy formula, not just visually. This still lets every other
 * system (mouse picking via BattleEngine.cellAt, hover/selection highlighting, unit sprites on
 * the Canvas2D-shim units canvas, panBy/zoom) keep working completely unchanged: they all
 * operate in CSS-pixel space, which this renderer's on-screen RESULT still matches exactly —
 * only the intermediate Three.js coordinates carry the flip, nothing outside this file does. */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { WEB_SHOT_TRAVEL, type BattleEngine, type MagicMissileV2VfxRequest } from "../../engine";
import { BIG_HOUSE_DECOR_IDS, BLESS, CHEST_DECOR_IDS, DECOR_ART_SCALE, DECORATIONS, HOUSE_ART_SCALE, HOUSE_DECOR_IDS, SOLID_HOUSE_DECOR_IDS, TERRAIN, decorationFacing, decorationImage, decorationImageRetryWebp, placedFootprint } from "../../data";
import { footprint, hexNeighbors, tileAt } from "../../pathfinding";
import type { DecorationDef, DecorationPlacement, MapTimeOfDay, TerrainId } from "../../types";
import { GroundAO, type AoOccluder } from "./ThreeGroundAO";
import { FOG_EXPLORED, FOG_UNSEEN, FOG_VISIBLE, FogMask } from "./ThreeFogMask";
import { LIGHT_DECAY, LIGHT_DEFS, LIGHT_RADIUS_MUL, UNIT_LIGHT_DEFS, flickerAt, type EnvLight, type LightDef } from "../../lighting";
import { ThreeAtmosphere } from "./ThreeAtmosphere";
import { decorationAnchor } from "../decorationAnchor";
import { FireballVFX } from "./FireballVFX";
import { getActivePhantasmalForceSettings, PhantasmalForceVFX } from "./PhantasmalForceVFX";
import { BlessVFX, getActiveBlessVfxSettings } from "./BlessVFX";
import { getActiveMagicMissileV2Settings, MagicMissileV2VFX } from "./MagicMissileV2VFX";
import { OldFireBall } from "./OldFireBall";
import { getDevGfx } from "./devGfx";

const SQRT3 = Math.sqrt(3);
/** Must match BattleEngine's private boardPad() (tile * 2.4) — duplicated here rather than
 * exposed because it's one number, not worth widening engine.ts's public surface for. */
const BOARD_PAD_MUL = 2.4;

/** Fraction of a unit/decoration's drawn height used as its invisible shadow-casting elevation.
 * The visible art stays flat billboards (see module comment) — this is a synthetic "how tall
 * would this actually stand" number for the light alone, not a real 3D height. Kept modest on
 * purpose (see the AtmosphereFX caution in THREEJS_MILESTONE2_HANDOFF.md) — tune after checking
 * screenshots, not blindly. */
const UNIT_SHADOW_HEIGHT_SCALE = 0.85;
const DECOR_SHADOW_HEIGHT_SCALE = 0.9;

/** renderOrder floor for a decoration drawn in front of the ground-mist atmosphere sheets
 * (GroundMist2/3 use renderOrder 10-12, GroundMist4 uses 10 flat — see ThreeAtmosphere.ts).
 * Those materials render with depthTest disabled, so they paint over anything behind them by
 * draw order alone; a prop that must read through the mist (any LIGHT_DEFS light source, or a
 * DecorationDef.aboveGroundMist prop) needs a renderOrder safely above that range instead. */
const ABOVE_GROUND_MIST_ORDER = 15;

/** How far BELOW the ground plane (z=0) every standing shadow-caster's base now extends, world
 * units. The caster's base sits exactly AT z=0 — coplanar with the ground mesh it casts onto —
 * which is the textbook cause of peter-panning (the shadow test can't reliably tell which surface
 * is in front right at that shared boundary, so the shadow reads as detached from the caster's own
 * base). This was already solved once for the old box caster (see git history) by sinking its base
 * slightly below ground instead of touching it exactly, then removed when the caster became a
 * standing silhouette plane on the (wrong) assumption a flat plane wouldn't have the same
 * coplanarity problem — it does, since its base still touches z=0 either way. Only the caster's
 * own base moves; its top (what actually governs the shadow's shape/reach) stays exactly where it
 * was. Not a bias fix — this is geometry-only, per direct instruction to leave `bias`/`normalBias`
 * alone. Units and decorations get their OWN value each (not one shared constant) — sharing one
 * and bumping it for units visibly broke decorations, since they don't have the same proportions. */
const UNIT_SHADOW_GROUND_INSET = 3;
const DECOR_SHADOW_GROUND_INSET = 3;

/** Direction the sun travels (not where it sits) — X/Y chosen so a shadow cast from height H
 * lands at world offset (0.6H, -0.8H), i.e. the exact same (0.6, 0.8) screen-space direction
 * (down-right; world Y is negated, see module comment) the old fake Canvas2D ellipse shadow
 * already used (see engine.ts's shadowDirX/shadowDirY) — so the sun's on-screen angle doesn't
 * visibly change when the fake shadow is eventually retired. Z=-1 (travelling toward -Z, i.e.
 * from the elevated shadow-caster boxes down onto the z=0 ground plane) derived alongside that:
 * a point at height H casts onto z=0 at (x - H*dir.x/dir.z, y - H*dir.y/dir.z) — solving for the
 * desired (0.6H, -0.8H) offset with dir.z=-1 gives dir.x=0.6, dir.y=-0.8 exactly. */
const SUN_DIRECTION = new THREE.Vector3(0.6, -0.8, -1).normalize();
const SUN_DISTANCE = 2000;
/** Per-map time of day (Mission.timeOfDay, picked in the Map Editor's "Iluminação"): which sky
 * light is the key light (Sun or Moon), the default key/ambient intensities the editor's sliders
 * snap to when the time is picked, the key light and sky-fill colors, and for dawn/dusk a low sun
 * elevation (long shadows) in place of Dev Controls' "Sol — altura". Dark night is the old Dev
 * Controls "Noite" (Moon 0.9, sky fill 12% of the daytime 2). */
export const TIME_OF_DAY_LIGHT: Record<MapTimeOfDay, { label: string; moon: boolean; key: number; ambient: number; keyColor: number; skyColor: number; elevation?: number }> = {
  day: { label: "Dia", moon: false, key: 3.5, ambient: 1.4, keyColor: 0xfff0d6, skyColor: 0xfff2df },
  noon: { label: "Meio-dia", moon: false, key: 5, ambient: 2, keyColor: 0xfff0d6, skyColor: 0xfff2df },
  dawn: { label: "Amanhecer", moon: false, key: 3.2, ambient: 1.3, keyColor: 0xffc8a8, skyColor: 0xf2d8d4, elevation: 20 },
  dusk: { label: "Entardecer", moon: false, key: 2.8, ambient: 1.1, keyColor: 0xffca9f, skyColor: 0xf7ddc3, elevation: 15 },
  brightNight: { label: "Noite clara", moon: true, key: 1.8, ambient: 0.6, keyColor: 0x9fb4ff, skyColor: 0xb4c0e4 },
  darkNight: { label: "Noite escura", moon: true, key: 0.9, ambient: 0.24, keyColor: 0x9fb4ff, skyColor: 0xb4c0e4 },
};

/** Default sun/ambient intensities, used whenever a mission doesn't set its own
 * `sunIntensity`/`ambientIntensity` (see types.ts) — also what the Map Editor's "Iluminação"
 * sliders default a new/untouched map to (see GameApp.tsx), so the editor's default and the
 * renderer's fallback can never drift apart. Set to match the exact values the user tuned by
 * hand on "O Vau" (saved as vau016.json). Those previous noon values stay available through
 * TIME_OF_DAY_LIGHT.noon; the everyday daytime default is intentionally softer. */
export const DEFAULT_SUN_INTENSITY = 3.5;
export const DEFAULT_AMBIENT_INTENSITY = 1.4;
/** "indoor" environment preset (see Mission.environment): a raking outdoor sun makes no sense
 * inside a building, so indoor missions get a much weaker directional light and a much stronger
 * ambient fill instead — flatter, but not fully unlit. Only applied when the mission doesn't
 * also set an explicit sunIntensity/ambientIntensity of its own. */
const INDOOR_SUN_INTENSITY = 0.35;
const INDOOR_AMBIENT_INTENSITY = 0.65;

/** MILESTONE 4 — real post-processing (UnrealBloomPass on the actual rendered scene, via
 * EffectComposer), not a CSS/canvas filter pretending to be one. Matches the user's own tuned
 * "O Vau" setup (vau016.json), the standard daytime default — see DEFAULT_SUN_INTENSITY's
 * comment. Bloom now applies to the whole scene (see render()'s own comment), not just wisp
 * embers, so a high intensity CAN wash out bright ground art too — that's expected now. */
export const DEFAULT_BLOOM_INTENSITY = 0.9;

/** An overlay fill with its alpha scaled by `fade`, quantized to 0.02 so the per-fill material
 * cache (overlayMaterialFor) only ever sees a small, bounded set of fade steps. */
function fadedFill(fill: string, fade: number): string {
  const m = /rgba?\(([^,]+),([^,]+),([^,)]+)(?:,([^)]+))?\)/.exec(fill);
  if (!m) return fill;
  const a = (m[4] !== undefined ? Number(m[4]) : 1) * fade;
  return `rgba(${m[1]},${m[2]},${m[3]},${(Math.round(a * 50) / 50).toFixed(2)})`;
}
const BLOOM_RADIUS = 0.4;
/** Full-scene bloom (see render()'s own comment) needs a threshold well above the old
 * selective-only 0.2 — that value only ever had to separate wisp embers from a pass that was
 * otherwise pure black. Against the REAL rendered scene, 0.2 would catch huge swaths of
 * ordinary lit ground art and wash the whole board out in a permanent haze. 0.75 keeps it to
 * genuine highlights: sun glints, the active-turn glow, bright embers/holy/fire FX. */
const BLOOM_THRESHOLD = 0.75;

/** Same formula as BattleEngine.effectAnchor's worldX/worldY — a hex's position independent of
 * camera pan. Duplicated (not imported) because effectAnchor is keyed to the engine's live
 * layout.tile, whereas this renderer needs it before/without going through a render call. */
function hexWorld(col: number, row: number, tile: number): { wx: number; wy: number } {
  return {
    wx: tile * SQRT3 * (col + 0.5 * (row & 1) + 0.5),
    wy: tile * BOARD_PAD_MUL + tile * (1.5 * row + 1),
  };
}

/** Pointy-top hex fan (center + 6 rim vertices + 6 triangles), radius 0.5 so scaling by
 * tile*2 matches Canvas2D's hexPath(ctx, cx, cy, tile*1.0) exactly — same vertex angles
 * (60*i-30 degrees), Y negated to compensate for local Y=+0.5 landing at the screen TOP in
 * this renderer (Canvas2D's Y-down convention has that same vertex angle read as "below
 * center"; see the module comment on the Y-flip). UVs use the same 0..1 mapping a plain
 * PlaneGeometry uses (localX+0.5, localY+0.5, on the SAME already-flipped local Y), so a
 * texture drawn as if filling the full tile*2 square shows through only inside the hex
 * outline — identical to Canvas2D's clip()-then-drawImage. */
function buildHexGeometry(): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = Math.cos(a) * 0.5;
    const y = -Math.sin(a) * 0.5;
    positions.push(x, y, 0);
    uvs.push(x + 0.5, y + 0.5);
  }
  // Winding order matters: (0, i, i%6+1) comes out clockwise-from-+Z here (culled by the
  // default FrontSide material, since this camera looks down -Z from +Z) — reversed to
  // (0, i%6+1, i) so the hex actually faces the camera.
  const indices: number[] = [];
  for (let i = 1; i <= 6; i++) indices.push(0, (i % 6) + 1, i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  // Needed for MILESTONE 2's MeshLambertMaterial (unlit MeshBasicMaterial never reads normals) —
  // every vertex lies in the same z=0 plane facing the camera, so this is just (0,0,1) everywhere.
  geo.computeVertexNormals();
  return geo;
}

interface TileMeshEntry {
  mesh: THREE.Mesh;
  id: TerrainId;
  variant: number;
  rot: number;
}

/** Ported verbatim from BattleEngine.drawDecorations' sizing math (see that method's own
 * comments for the reasoning behind each special case) — pure numbers, no canvas calls, so
 * there was nothing renderer-specific to translate. Kept in exact sync with engine.ts by hand;
 * a mismatch here means a prop is sized differently on the two renderers, not a crash, so it
 * won't show up as a type error — check against drawDecorations if a prop looks off. */
function decorSize(id: string, def: DecorationDef, tile: number): { w: number; h: number; dy: number } {
  let minDx = 0;
  let maxDx = 0;
  let minDy = 0;
  let maxDy = 0;
  for (const { dx, dy } of def.footprint) {
    minDx = Math.min(minDx, dx);
    maxDx = Math.max(maxDx, dx);
    minDy = Math.min(minDy, dy);
    maxDy = Math.max(maxDy, dy);
  }
  const one = def.footprint.length === 1;
  const item = CHEST_DECOR_IDS.has(id);
  const tree = id === "dead-tree";
  const log = id === "fallen-log";
  const wall = id === "barricade";
  const waypoint = !!def.exitKind;
  const anyHouse = HOUSE_DECOR_IDS.has(id) || BIG_HOUSE_DECOR_IDS.has(id);
  const w = tree
    ? tile * 1.28
    : log
      ? tile * SQRT3 * 2.05
      : wall
        ? tile * 1.42
        : anyHouse
          ? tile * 1.45 * 3
          : waypoint
            ? tile * SQRT3 * (one ? 1 : 2)
            : item
              ? tile * 0.92
              : one
                ? tile * 1.55
                : tile * SQRT3 * (maxDx - minDx + 1.7);
  const baseH = tree
    ? tile * 2.55
    : log
      ? tile * 0.82
      : wall
        ? tile * 1.18
        : anyHouse
          ? tile * 1.58 * 3
          : waypoint
            ? tile * 2
            : item
              ? tile * 0.72
              : one
                ? tile * 1.65
                : tile * (1.5 * (maxDy - minDy) + 2.3);
  const h = baseH * (def.heightScale ?? 1);
  const dy = waypoint ? 0 : (tree ? -tile * 0.55 : wall ? -tile * 0.12 : anyHouse ? -tile * 0.28 * 3 : item ? tile * 0.08 : 0) - (h - baseH) * 0.42;
  // Global art scale (see DECOR_ART_SCALE), grown from the bottom edge so the base stays put.
  const s = waypoint ? 1 : (anyHouse ? HOUSE_ART_SCALE : DECOR_ART_SCALE) * (def.artScale ?? 1);
  return { w: w * s, h: h * s, dy: dy - (h * (s - 1)) / 2 };
}

/** PCF filter radius (shadow-map texels) — 1 is Three's default hard-ish edge; the Dev Controls
 * "soft shadows" toggle raises it. This Three.js version's PCF path samples a 5-tap Vogel disk
 * scaled by this radius (see shadowmap_pars_fragment), so it softens without costing more taps. */
const SHADOW_RADIUS_HARD = 1;
const SHADOW_RADIUS_SOFT = 4;

/** Contact shadow = short-range grounding only, never a second cast shadow. The scene is flat
 * orthographic billboards (no depth relationship between sprite and ground to sample), so this
 * is a per-object ground decal sized from the art's own opaque base (see artBase) — transparent
 * sprite pixels never count as contact, and one object's decal can never darken another object
 * (decals sit at z=0.51, under every sprite/prop).
 * W: decal width as a multiple of the measured opaque base width (a little spill past the edge).
 * H: decal height as a fraction of its width (ground seen at the board's 3/4 angle).
 * OPACITY: peak darkening at the contact point — a multiply, so 0.75 keeps 25% of the ground's
 * own light; never black. MAX_W caps the decal against the sprite's drawn width. */
const CONTACT_SHADOW_W = 1.4;
const CONTACT_SHADOW_H = 0.5;
const CONTACT_SHADOW_OPACITY = 0.75;
const CONTACT_SHADOW_MAX_W = 0.6;
/** Absolute cap on decal height, in hex radii — keeps a wide base (wall, log) from growing a
 * deep oval that reaches far in front of/behind the contact line. */
const CONTACT_SHADOW_MAX_H = 0.5;
/** Shifts the decal toward the viewer by this fraction of its height, so more of it lies on the
 * ground visible in front of the base instead of under the sprite. The first pass (0.2 tile cap,
 * 0.4 peak, no shift) measured as a ~2px line at normal battle zoom — invisible in real play. */
const CONTACT_SHADOW_FORWARD = 0.2;

/** Real THREE.PointLights for map light sources (see syncLights). The minimum pool size — the
 * pool grows at load to cover every light the map carries, then never changes (Three compiles
 * the light count into every lit shader); unused ones sit at intensity 0. No castShadow yet —
 * shadows are a separate, later decision. */
const POINT_LIGHT_POOL = 8;
/** Rim-glow canvas size relative to the sprite (room for the blur to spread). */
const GLOW_PAD = 1.7;
/** How much brighter than its own art a sprite (character or decoration, light props included)
 * may get from map lights. Without a cap anything beside a candle/fire — the candle itself
 * too — blew out to white and read as translucent. */
const SPRITE_LIGHT_CAP = 1.35;
/** Shared cap for every decoration material; units each carry their own (hit flash lifts it). */
const DECOR_LIGHT_CAP = { value: SPRITE_LIGHT_CAP };

/** 2.5D perspective between characters and props: whoever stands on the nearer row (lower on
 * screen) covers whoever stands further back, whatever layer either is drawn in. Each sprite
 * sits at a depth from its ground line, and an invisible alpha-tested copy of its art (an
 * "occluder", opaque pass, so it lands before every sprite's color) writes that depth; a sprite
 * further back then fails the depth test wherever something nearer stands over it. */
const DEPTH_Z_BASE = 1;
/** Depth per tile-radius of ground Y — one hex row (1.5 radii) is 0.006, far above precision. */
const DEPTH_Z_PER_TILE = 0.004;
/** On the same row, the character stands in front of the prop. */
const UNIT_DEPTH_TIE = 0.001;
/** Explicit unitLayer "behind" props and flat Waypoints: always under every character. */
const DEPTH_Z_BEHIND = 0.95;
/** Explicit unitLayer "front"/foreground props: always over every character. */
const DEPTH_Z_FRONT = 1.9;
/** Only the solid body of an art occludes — soft glows and fringes baked into it do not. */
const OCCLUDER_ALPHA = 0.7;
function spriteDepthZ(groundWy: number, tile: number): number {
  return DEPTH_Z_BASE + (groundWy / tile) * DEPTH_Z_PER_TILE;
}
function occluderMaterial(map: THREE.Texture | null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, alphaTest: OCCLUDER_ALPHA, colorWrite: false, depthWrite: true });
}

/** Clamps a lit sprite's final color to `cap` times its own art — see SPRITE_LIGHT_CAP. */
function capSpriteLight(material: THREE.MeshLambertMaterial, cap: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.spriteLightCap = cap;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float spriteLightCap;")
      .replace("#include <envmap_fragment>", "outgoingLight = min(outgoingLight, sampledDiffuseColor.rgb * spriteLightCap);\n#include <envmap_fragment>");
  };
  material.customProgramCacheKey = () => "spriteLightCap";
}
/** How many of the pool (always the lights nearest the view) cast real cube-map shadows.
 * 0 per the user's pick: the fire's clean round light pool, without its own cube shadow. */
const POINT_SHADOW_LIGHTS = 0;
/** Render layer of the hidden 3D proxy volumes (a box per prop, an upright cylinder per
 * character): the physical shapes map lights hit and are blocked by. The main camera and the
 * sun's shadow camera never see this layer — the art stays what the player sees and the sun
 * keeps its silhouette shadows; only the point lights' shadow cameras render it. */
const PROXY_LAYER = 3;
/** The ground's normal sun + sky irradiance in this renderer (sun 5 x N.L 0.78 + hemi ~1):
 * a point light adding this much irradiance doubles the ground's brightness — the same scale
 * LightDef.intensity uses for sprites (1 = twice as bright). */
const GROUND_BASE_IRRADIANCE = 4.9;
/** Fraction of an image's height, measured up from its lowest opaque row, that counts as "the
 * base touching the ground" (feet, paws, trunk, wall foot). */

/** Falloff mask shared by every contact decal. Alpha only — the material (see
 * makeContactShadowMaterial) multiplies the ground by (1 - alpha), so the color channels are
 * irrelevant. (1 - r²)²: strongest at the contact, ~56% at half radius, ~26% at 70%, and exactly
 * zero with zero slope at the edge, so no ring marks where it stops. */
function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / (size / 2) - 1;
      const dy = (y + 0.5) / (size / 2) - 1;
      const k = Math.max(0, 1 - (dx * dx + dy * dy));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * k * k);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** dst * (1 - srcAlpha): can only darken what is already on the ground, never lighten or tint it.
 * The previous alpha-blended dark-grey gradient measured as LIGHTENING dark grass by up to +45
 * luminance (a grey film, not a shadow) — its "dark" color landed mid-grey after output encoding. */
function makeContactShadowMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    opacity: CONTACT_SHADOW_OPACITY,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}

/** Where an image's opaque art actually meets the ground, normalized to the image (u across,
 * v down): the alpha-weighted 5th–95th percentile span of opaque pixels within CONTACT_BASE_BAND
 * of the lowest opaque row. Percentiles (not min/max) so a stray sword tip or claw doesn't
 * stretch the decal. null = no opaque pixels / unreadable image. Cached per image. */
interface ArtBase {
  u0: number;
  u1: number;
  v: number;
}
const artBaseCache = new WeakMap<HTMLImageElement, ArtBase | null>();
function artBase(img: HTMLImageElement): ArtBase | null {
  if (artBaseCache.has(img)) return artBaseCache.get(img)!;
  const result = decorationAnchor(img);
  artBaseCache.set(img, result);
  return result;
}

/** Where a light prop's flame (or lit lantern glass) sits in its own art, normalized (u across,
 * v down): the centroid of its bright fire-coloured opaque pixels, weighted by brightness. The
 * light is placed there, not at the prop's ground pivot. Falls back to the top third's center.
 * Cached per image. */
const flameCache = new WeakMap<HTMLImageElement, { u: number; v: number }>();
function artFlame(img: HTMLImageElement): { u: number; v: number } {
  const hit = flameCache.get(img);
  if (hit) return hit;
  let result = { u: 0.5, v: 0.3 };
  try {
    const scale = Math.min(1, 192 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let sw = 0;
    let su = 0;
    let sv = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        if (d[i + 3]! < 128 || r < 190 || g < 90 || r < g || g < b + 20) continue;
        const wt = (r + g - b) / 255;
        sw += wt;
        su += wt * (x + 0.5);
        sv += wt * (y + 0.5);
      }
    }
    if (sw > 4) result = { u: su / sw / w, v: sv / sw / h };
  } catch {
    // unreadable image: keep the fallback
  }
  flameCache.set(img, result);
  return result;
}

interface DecorMeshEntry {
  mesh: THREE.Mesh;
  placement: DecorationPlacement;
  /** Same quadGeo + alpha-tested copy of the prop's own art (colorWrite off, see
   * decorShadowMaterialFor) that casts this prop's real shadow as its own silhouette, not a box.
   * Null for a DecorationDef.noShadow prop, which skips this entirely. */
  shadowMesh: THREE.Mesh | null;
  /** Contact decal at the prop's opaque base (see artBase); null when the art has no readable
   * base or the prop is a spun placeholder (facing fallback) with no meaningful "bottom". */
  contactMesh: THREE.Mesh | null;
  /** Hidden 3D volume (PROXY_LAYER) blocking point lights; null for light-source props. */
  proxy: THREE.Mesh | null;
  /** Environmental light this prop emits (LIGHT_DEFS), at its flame; world pixels, y-down. */
  light: { x: number; y: number; h: number; def: LightDef; seed: number } | null;
  /** Houses only: invisible depth-only copy of the art, drawn just before the fog-of-war sheet
   * so the fog skips the house's pixels — a house always shows at full strength. */
  fogCut: THREE.Mesh | null;
}

interface UnitMeshEntry {
  mesh: THREE.Mesh;
  /** Level-up / heal rim glow: a blurred white silhouette of the current frame behind the
   * sprite, tinted and faded like the Canvas2D shadowBlur pass (engine renderUnitsAndOverlays). */
  glowMesh: THREE.Mesh;
  glowMaterial: THREE.MeshBasicMaterial;
  /** Owned (not shared) per unit — see unitTexCache's comment on why opacity needs this. */
  material: THREE.MeshLambertMaterial;
  /** See SPRITE_LIGHT_CAP — per unit, so a hit flash can lift its own cap. */
  lightCap: { value: number };
  /** Depth-only cutout of the current frame, a child of `mesh` — see DEPTH_Z_BASE. */
  occluder: THREE.Mesh;
  img: HTMLImageElement | null;
  /** Same quadGeo + alpha-tested copy of the unit's own sprite (colorWrite off) that casts this
   * unit's real shadow as its own silhouette, not a box — see shadowMaterial's own comment. */
  shadowMesh: THREE.Mesh;
  /** Owned per unit, same reasoning as `material` — swapped in step with entry.img/material.map
   * whenever the unit's current sprite frame changes, so the shadow always matches the current
   * pose instead of freezing on whatever frame first built this entry. */
  shadowMaterial: THREE.MeshBasicMaterial;
  /** Dev Controls "contact shadows" footprint — owned per unit (its opacity tracks this unit's
   * own fade/lift); the gradient texture itself is shared (contactShadowTexture). */
  contactMesh: THREE.Mesh;
  contactMaterial: THREE.MeshBasicMaterial;
  /** Smoothed decal center/width in world units — the base is re-measured from each animation
   * frame, so this eases between frames instead of snapping (null until first placed). */
  contactFit: { dx: number; dy: number; w: number } | null;
  /** Hidden upright cylinder (PROXY_LAYER) standing at the character's feet. */
  proxy: THREE.Mesh;
  /** Same trick as a house's DecorMeshEntry.fogCut — an invisible depth-only copy of the unit's
   * own sprite, drawn just under the fog-of-war sheet, so the fog never blacks out a unit that
   * is actually standing there (a unit at the edge of sight was getting half-erased by the
   * unseen hex right next to it). */
  fogCut: THREE.Mesh;
}

export class ThreeBattleRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private fireballVfx: FireballVFX | null = null;
  private phantasmalForceVfx: PhantasmalForceVFX | null = null;
  private blessVfx: BlessVFX | null = null;
  private magicMissileV2Vfx: MagicMissileV2VFX | null = null;
  /** Keep one complete hero-missile effect per queued Magic Missile target. */
  private readonly pendingMagicMissileV2VfxRequests: MagicMissileV2VfxRequest[] = [];
  private activeMagicMissileV2VfxRequestId: string | null = null;
  /** The former tavern preview model, now reserved for the actual cast trajectory. */
  private readonly tavernFireball = new OldFireBall(LIGHT_DECAY);
  private disposed = false;
  private camera: THREE.OrthographicCamera;
  private tileGroup = new THREE.Group();
  private tileMeshes = new Map<number, TileMeshEntry>();
  // A camera-locked, cover-cropped copy of BattleEngine.renderGround's painted backdrop.
  // The legacy 2D path had this from day one; keeping it here prevents WebGL missions from
  // silently dropping any mission-specific background artwork.
  private backdropGeometry = new THREE.PlaneGeometry(1, 1);
  private backdropMaterial = new THREE.MeshBasicMaterial({ color: 0x949494, depthWrite: false, depthTest: false });
  private backdropMesh = new THREE.Mesh(this.backdropGeometry, this.backdropMaterial);
  private backdropTexture: THREE.Texture | null = null;
  private backdropImage: HTMLImageElement | null = null;
  // MeshLambertMaterial (not MeshBasicMaterial) — MILESTONE 2 terrain needs to actually receive
  // light/shadow. Decor and unit sprites deliberately stay MeshBasicMaterial (unlit) below, so
  // their art is untouched by this — only the ground gets the uniform lit tint (see the
  // architecture note in THREEJS_MILESTONE2_HANDOFF.md on why a flat scene can only tint, not
  // per-object shade).
  private materialCache = new Map<string, THREE.MeshLambertMaterial>();
  private fallbackMaterial = new THREE.MeshLambertMaterial({ color: 0x1e1b18 });
  /** Environmental AO in the terrain's lighting (see ThreeGroundAO.ts) — every terrain
   * material is patched to read it; aoTerrainVersion bumps whenever syncDirtyTiles swaps a
   * tile's terrain, so the field rebuilds only when the board actually reshapes. */
  private groundAO = new GroundAO();
  private aoTerrainVersion = 0;
  /** Fog-of-war overlay — one world-aligned quad (see ThreeFogMask.ts / syncFog). */
  private fogMask = new FogMask();
  /** Real point lights for map light sources (see POINT_LIGHT_POOL / syncLights). */
  private pointLights: THREE.PointLight[] = [];
  /** Shared proxy geometry: unit box and a Z-up unit cylinder, scaled per object. */
  private proxyBox = new THREE.BoxGeometry(1, 1, 1);
  private proxyCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).rotateX(Math.PI / 2);
  private proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  /** Every lit sprite material (decorations + unit billboards) — see syncSpriteExposure. */
  private litSpriteMats = new Set<THREE.MeshLambertMaterial>();
  private hexGeo = buildHexGeometry();
  private builtCols = -1;
  private builtRows = -1;
  private builtMissionId = "";
  private builtTile = -1;

  // MILESTONE 2 — lighting/shadows. hemiLight is a soft sky/ground fill so unlit-facing surfaces
  // don't go fully black (a single DirectionalLight alone would do that — see handoff doc);
  // sunLight is the one real shadow-casting light, aimed by updateSun() every frame to track the
  // camera (see SUN_DIRECTION's comment for why its direction is fixed). Shadow casters (units,
  // decorations) live on shadowCasterGroup — visible=true (required: WebGLShadowMap skips
  // object.visible===false entirely, so this can't be used to hide them). Each caster is now the
  // unit/prop's own alpha-tested art (colorWrite off — see decorShadowMaterialFor's/the per-unit
  // shadowMaterial's own comments for how invisibility in the normal pass is achieved) rather than
  // an invisible box, so the cast shadow matches the real silhouette instead of a rectangle.
  // Intensity args here are placeholders — the constructor immediately overrides both from
  // Mission.sunIntensity/ambientIntensity (or DEFAULT_SUN_INTENSITY/DEFAULT_AMBIENT_INTENSITY),
  // see that assignment's own comment.
  private hemiLight = new THREE.HemisphereLight(0xfff2df, 0x14110d, 0.45);
  private sunLight = new THREE.DirectionalLight(0xfff0d6, 1.8);
  /** The Moon: a second real DirectionalLight with its own shadow map (Dev Controls "Noite"). */
  private moonLight = new THREE.DirectionalLight(0x9fb4ff, 0);
  /** Current travel directions of sunlight/moonlight (see skyDirection). */
  private sunDir = SUN_DIRECTION.clone();
  private moonDir = SUN_DIRECTION.clone();
  /** The mission's own daytime sun/sky intensities — the reference the sprite exposure is
   * calibrated against, so night/sun-angle changes reach the sprites physically. */
  private baseSunIntensity = DEFAULT_SUN_INTENSITY;
  private baseHemiIntensity = DEFAULT_AMBIENT_INTENSITY;
  /** Mission.timeOfDay ("day" when unset). */
  private timeOfDay: MapTimeOfDay = "day";
  /** Daytime sun/sky the sprite exposure is calibrated against (see syncSpriteExposure) — the
   * mission's own values by day, the standard daytime defaults at any other time, so dawn/dusk/
   * night darken and tint the sprites like everything else instead of being compensated away. */
  private calibSunIntensity = DEFAULT_SUN_INTENSITY;
  private calibHemiIntensity = DEFAULT_AMBIENT_INTENSITY;
  private calibSunColor = new THREE.Color(TIME_OF_DAY_LIGHT.day.keyColor);
  private calibHemiColor = new THREE.Color(TIME_OF_DAY_LIGHT.day.skyColor);
  private shadowCasterGroup = new THREE.Group();
  private lastShadowFrustumW = -1;
  private lastShadowFrustumH = -1;

  // Ground/behind-layer decorations only (trees, houses, rubble, ...) — see ensureDecorBuilt's
  // comment for why "front"-layer/foreground props stay on the existing Canvas2D-shim units
  // canvas instead of moving here.
  private quadGeo = new THREE.PlaneGeometry(1, 1);
  private decorGroup = new THREE.Group();
  private decorMatCache = new Map<string, THREE.MeshLambertMaterial>();
  // Shadow-only twin of decorMatCache — same cached texture, but alphaTest instead of plain alpha
  // blending (shadow depth passes need a hard cutout, not a blend) and colorWrite/depthWrite off
  // (see decorShadowMaterialFor's own comment), so it can't just reuse the visible material.
  private decorShadowMatCache = new Map<string, THREE.MeshBasicMaterial>();
  private decorFogCutMatCache = new Map<string, THREE.MeshBasicMaterial>();
  private decorEntries: DecorMeshEntry[] = [];
  private builtDecorKey = "";

  // Movement/attack/spell-range highlight + the active-turn ring (see
  // BattleEngine.boardOverlayLayers/activeTurnHighlight) — real world-space hex meshes at
  // z=0.5, between flat terrain (z=0, opaque, drawn first) and decorations (z=1, transparent).
  // Three draws transparent objects back-to-front by camera distance regardless of draw order,
  // so this lands the highlight visually ABOVE terrain but BELOW decorations and units (z=2+)
  // for free, the same depth trick tiles/decor/units already rely on — a blocking house or a
  // unit standing on a highlighted hex always stays legible instead of the highlight's tint
  // painting over it. Pooled rather than rebuilt (see syncOverlay): the highlighted set rarely
  // changes frame to frame, only its glow pulse does, well below this — which skips the pulse
  // entirely and just uses each layer's flat fill alpha (see boardOverlayLayers' own comment on
  // why that's the part that matters, not the canvas-only shadowBlur halo).
  private overlayGroup = new THREE.Group();
  /** Dreaming Web's floor patch (engine.webZones) — the webfloor photo on each covered hex,
   * same as Canvas2D renderGround draws it (which this renderer replaces). Pooled meshes. */
  private webGroup = new THREE.Group();
  private webMeshes: THREE.Mesh[] = [];
  private webMat: THREE.MeshLambertMaterial | null = null;
  private webMatDim: THREE.MeshLambertMaterial | null = null;
  private overlayMatCache = new Map<string, THREE.MeshBasicMaterial>();
  private overlayMeshPool: THREE.Mesh[] = [];
  private overlayGlowGroup = new THREE.Group();
  private overlayGlowPool: THREE.Sprite[] = [];
  // The old 2D marker used Canvas shadowBlur, which has a broad soft falloff rather than a
  // flat, expanding polygon. This sprite is that same falloff in world space, so WebGL keeps
  // the familiar 2D read while still sitting under units and props.
  private activeTurnGlowTexture: THREE.CanvasTexture;
  private activeTurnGlowMaterial: THREE.SpriteMaterial;
  private activeTurnGlow: THREE.Sprite;

  // Animated units (see THREEJS_MILESTONE1_HANDOFF.md) — one persistent mesh per live unit id,
  // repositioned/retextured/rescaled every frame in syncUnits rather than rebuilt, since units
  // (unlike terrain/decor) change position, pose and art every frame. HP bars, hover/selection
  // highlight, and portal FX stay on the old Canvas2D-shim units canvas on purpose (see
  // BattleEngine.renderUnitsAndOverlays' skipUnitSprites param) — only the character sprite art
  // itself moves here.
  private unitGroup = new THREE.Group();
  /** Contact-shadow footprints (z=0.51 — above tiles/overlay, below decorations and units).
   * Deliberately NOT tied to unitGroup's visibility: BattleCanvas hides the Three unit sprites
   * (units draw on the Canvas2D top layer), but these are ground marks, so they stay here. */
  private contactShadowGroup = new THREE.Group();
  private contactShadowTexture = makeContactShadowTexture();
  /** Decoration contact decals — separate from contactShadowGroup because, unlike unit decals,
   * these must hide whenever decorGroup does (no decal left under a prop that isn't drawn). One
   * shared material: props don't fade individually (fog-of-war toggles mesh.visible instead). */
  private decorContactGroup = new THREE.Group();
  private decorContactMaterial = makeContactShadowMaterial(this.contactShadowTexture);
  // Textures are shared by image (same pattern as tiles/decor — cheap, no per-unit GPU upload),
  // but each unit gets its OWN material (see UnitMeshEntry) so u.fade can drive real per-unit
  // opacity: a shared material (the tile/decor pattern) would make every unit sharing one sprite
  // frame fade in/out together, which is wrong the instant two of them are mid-death at once.
  private unitTexCache = new Map<HTMLImageElement, THREE.Texture>();
  /** Blurred white silhouettes for the rim glow, built on first use per frame image. */
  private glowTexCache = new Map<HTMLImageElement, THREE.Texture>();
  private unitEntries = new Map<string, UnitMeshEntry>();

  /** The elemental-FX canvas is intentionally between the ground renderer and the visual
   * actors/props canvas. Keep Three's copies of sprites and decorations off the ground canvas
   * whenever that compositing path is active, otherwise an authored effect can cover them. */
  setSpritesAndDecorationsVisible(unitsVisible: boolean, decorationsVisible = unitsVisible): void {
    this.unitGroup.visible = unitsVisible;
    this.decorGroup.visible = decorationsVisible;
  }

  // MILESTONE 3 — real world-space ground mist + drift particles, owned end-to-end by
  // ThreeAtmosphere (see that file's header comment for why scene.fog isn't used and why this
  // sits at Z > 3, strictly above every mesh above). lastFrameTime is only for this: nothing
  // else in the file needs a real dt (render() takes cssW/cssH only, see its own comment).
  private atmosphere = new ThreeAtmosphere();
  private lastFrameTime = performance.now();

  // MILESTONE 4 — bloom applies to the whole scene, per direct instruction (previously
  // selective, wisps-only — see git history if that's ever wanted back). bloomComposer renders
  // the real scene through UnrealBloomPass (which extracts/blurs whatever clears
  // BLOOM_THRESHOLD on its own), finalComposer renders it again normally and additively mixes
  // that bloom texture back in via mixPass.
  private bloomComposer: EffectComposer;
  private finalComposer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  // Embers still mark themselves onto this layer (see ThreeAtmosphere.markBloomLayer) from
  // when bloom was selective — harmless now that bloom applies to everything regardless of
  // layer, kept only so that call site doesn't need its own removal too.
  private readonly bloomLayerIndex = 1;

  constructor(
    canvas: HTMLCanvasElement,
    private engine: BattleEngine,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed from this Three.js version (falls back to PCFShadowMap with a
    // console warning) — request PCFShadowMap directly instead.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, 0.1, 2000);
    this.camera.position.z = 100;
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 128;
    const glowCtx = glowCanvas.getContext("2d")!;
    const gradient = glowCtx.createRadialGradient(64, 64, 6, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.92)");
    gradient.addColorStop(0.32, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    glowCtx.fillStyle = gradient;
    glowCtx.fillRect(0, 0, 128, 128);
    this.activeTurnGlowTexture = new THREE.CanvasTexture(glowCanvas);
    this.activeTurnGlowMaterial = new THREE.SpriteMaterial({ map: this.activeTurnGlowTexture, transparent: true, depthWrite: false, opacity: 0 });
    this.activeTurnGlow = new THREE.Sprite(this.activeTurnGlowMaterial);
    this.activeTurnGlow.position.z = 0.45;
    this.activeTurnGlow.visible = false;
    // Author-controlled lighting (Mission.environment/sunIntensity/ambientIntensity, editable in
    // the Map Editor's "Iluminação" section — see GameApp.tsx) — an explicit sunIntensity/
    // ambientIntensity always wins; otherwise "indoor" gets its own flatter preset, and anything
    // else (including missing/"outdoor") gets the renderer's own default.
    const indoor = engine.mission.environment === "indoor";
    this.timeOfDay = engine.mission.timeOfDay ?? "day";
    const tod = TIME_OF_DAY_LIGHT[this.timeOfDay];
    const isDay = this.timeOfDay === "day" || this.timeOfDay === "noon";
    this.sunLight.intensity = engine.mission.sunIntensity ?? (indoor ? INDOOR_SUN_INTENSITY : isDay ? DEFAULT_SUN_INTENSITY : tod.key);
    this.hemiLight.intensity = engine.mission.ambientIntensity ?? (indoor ? INDOOR_AMBIENT_INTENSITY : isDay ? DEFAULT_AMBIENT_INTENSITY : tod.ambient);
    this.baseSunIntensity = this.sunLight.intensity;
    this.baseHemiIntensity = this.hemiLight.intensity;
    this.calibSunIntensity = isDay ? this.baseSunIntensity : DEFAULT_SUN_INTENSITY;
    this.calibHemiIntensity = isDay ? this.baseHemiIntensity : DEFAULT_AMBIENT_INTENSITY;
    this.calibSunColor.copy(this.sunLight.color);
    this.calibHemiColor.copy(this.hemiLight.color);
    if (!isDay) {
      (tod.moon ? this.moonLight : this.sunLight).color.setHex(tod.keyColor);
      this.hemiLight.color.setHex(tod.skyColor);
    }
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.0015;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
    this.sunLight.castShadow = true;
    // 2048, not 1024 — casters are small boxes (a fraction of a unit's own width), so a coarser
    // map under-resolves them into faint/noisy blobs even at full light intensity.
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0015;
    this.scene.add(this.hemiLight);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.scene.add(this.shadowCasterGroup);
    this.scene.add(this.backdropMesh);
    this.scene.add(this.tileGroup);
    this.scene.add(this.webGroup);
    this.scene.add(this.overlayGlowGroup);
    this.scene.add(this.overlayGroup);
    this.scene.add(this.activeTurnGlow);
    this.scene.add(this.contactShadowGroup);
    this.scene.add(this.decorContactGroup);
    this.scene.add(this.decorGroup);
    this.scene.add(this.unitGroup);
    this.scene.add(this.fogMask.mesh);
    // Sized to cover every light the map carries, so no torch goes dark just because the
    // camera is looking elsewhere; POINT_LIGHT_POOL stays the floor.
    const mapLights = engine.decorations.filter((p) => LIGHT_DEFS[p.id]).length + engine.units.filter((u) => UNIT_LIGHT_DEFS[u.classId]).length;
    const poolSize = Math.max(POINT_LIGHT_POOL, mapLights);
    for (let i = 0; i < poolSize; i++) {
      const pl = new THREE.PointLight(0xffffff, 0, 1, LIGHT_DECAY);
      if (i < POINT_SHADOW_LIGHTS) {
        pl.castShadow = true;
        pl.shadow.mapSize.set(1024, 1024);
        pl.shadow.bias = -0.003;
        pl.shadow.camera.near = 2;
        pl.shadow.camera.layers.set(PROXY_LAYER);
      }
      this.pointLights.push(pl);
      this.scene.add(pl);
    }
    this.scene.add(this.atmosphere.group);
    // Construct synchronously: every live Fireball impact particle is procedural, so no image
    // request can leave the spell without its flight or explosion when cast immediately.
    this.fireballVfx = new FireballVFX(this.scene, this.camera, "original", this.tavernFireball);
    this.engine.fireballVfxAvailable = true;
    this.phantasmalForceVfx = new PhantasmalForceVFX(this.scene);
    this.phantasmalForceVfx.setSettings(getActivePhantasmalForceSettings());
    this.engine.phantasmalForceVfxAvailable = true;
    this.blessVfx = new BlessVFX(this.scene);
    this.blessVfx.setSettings(getActiveBlessVfxSettings());
    this.engine.blessVfxAvailable = true;
    this.magicMissileV2Vfx = new MagicMissileV2VFX(this.scene);
    this.magicMissileV2Vfx.setSettings(getActiveMagicMissileV2Settings());
    this.engine.magicMissileV2VfxAvailable = true;

    // Only the wisp embers ever render into the bloom-only pass (everything else gets forced to
    // black during it, see render()) — a low fixed threshold is correct now, since there's
    // nothing else present that could wrongly cross it regardless of setting; the intensity
    // slider maps directly to strength, which alone gets dramatic at high values against a
    // black backdrop.
    this.atmosphere.markBloomLayer(this.bloomLayerIndex);

    // Built at (1,1) here; setSize() (always called at least once before the first real render,
    // same as the camera/renderer above) gives both composers real dimensions.
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), engine.mission.bloomIntensity ?? DEFAULT_BLOOM_INTENSITY, BLOOM_RADIUS, BLOOM_THRESHOLD);
    this.bloomComposer = new EffectComposer(this.renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomComposer.addPass(this.bloomPass);

    const mixPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D baseTexture;
          uniform sampler2D bloomTexture;
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv);
          }
        `,
        defines: {},
      }),
      "baseTexture",
    );
    mixPass.needsSwap = true;

    this.finalComposer = new EffectComposer(this.renderer);
    this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
    this.finalComposer.addPass(mixPass);
    // Combining two textures with raw shader math (above) bypasses the renderer's own automatic
    // output color-space encoding that a composer's LAST pass would normally apply when it
    // renders straight to the canvas — this pass restores it, matching the official Three.js
    // selective-bloom example's own pipeline exactly.
    this.finalComposer.addPass(new OutputPass());
  }

  /** Aims the sun so its fixed-direction shadow follows whatever's actually on screen (camera
   * pans; the shadow-caster geometry doesn't move relative to the world, so the light has to
   * instead) — same reasoning as why tiles are built once and only the camera moves (see module
   * comment). The shadow camera's frustum SIZE only depends on viewport size, so that part is
   * cached and skipped most frames; target/position are cheap vector math, recomputed every
   * frame unconditionally. */
  private updateSun(cssW: number, cssH: number, camX: number, camY: number): void {
    const centerX = camX + cssW / 2;
    const centerY = -camY - cssH / 2;
    this.sunLight.target.position.set(centerX, centerY, 0);
    this.sunLight.position.set(centerX, centerY, 0).addScaledVector(this.sunDir, -SUN_DISTANCE);
    this.moonLight.target.position.set(centerX, centerY, 0);
    this.moonLight.position.set(centerX, centerY, 0).addScaledVector(this.moonDir, -SUN_DISTANCE);
    if (cssW === this.lastShadowFrustumW && cssH === this.lastShadowFrustumH) return;
    this.lastShadowFrustumW = cssW;
    this.lastShadowFrustumH = cssH;
    // Half-diagonal (plus margin for shadow-caster elevation reach) rather than half-width/
    // height: the shadow camera looks along SUN_DIRECTION, not straight down -Z like the main
    // camera, so it needs to cover the visible box from an angle, not just match its footprint.
    const half = Math.hypot(cssW, cssH) * 0.65 + 250;
    for (const light of [this.sunLight, this.moonLight]) {
      const shadowCam = light.shadow.camera as THREE.OrthographicCamera;
      shadowCam.left = -half;
      shadowCam.right = half;
      shadowCam.top = half;
      shadowCam.bottom = -half;
      shadowCam.near = 10;
      shadowCam.far = SUN_DISTANCE * 2.2;
      shadowCam.updateProjectionMatrix();
    }
  }

  /** Travel direction of a sky light from its azimuth (screen direction its shadows fall, deg,
   * 0 = right, 90 = down) and elevation (deg above the horizon). The default sun (53.13°, 45°)
   * gives exactly SUN_DIRECTION. */
  private static skyDirection(out: THREE.Vector3, azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
    const az = (azimuthDeg * Math.PI) / 180;
    const el = (Math.max(3, Math.min(89, elevationDeg)) * Math.PI) / 180;
    return out.set(Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), -Math.sin(el)).normalize();
  }

  /** Per-frame Sun/Moon state: directions from Dev Controls, which one is up from the map's
   * time of day (see TIME_OF_DAY_LIGHT), and their shadows. Night: the Sun goes out and the Moon
   * (its own DirectionalLight + shadow map) lights the scene at the map's key intensity. The
   * silhouette shadow casters are vertical cards; they're turned about Z by the lit sky light's
   * azimuth change from the default so they stay broadside to it (the default sun leaves them
   * exactly as built). */
  private syncSky(): void {
    const gfx = getDevGfx();
    const tod = TIME_OF_DAY_LIGHT[this.timeOfDay];
    const night = tod.moon;
    ThreeBattleRenderer.skyDirection(this.sunDir, gfx.sunAzimuth, tod.elevation ?? gfx.sunElevation);
    ThreeBattleRenderer.skyDirection(this.moonDir, gfx.moonAzimuth, gfx.moonElevation);
    this.sunLight.intensity = night ? 0 : this.baseSunIntensity;
    this.moonLight.intensity = night ? this.baseSunIntensity : 0;
    this.hemiLight.intensity = this.baseHemiIntensity;
    this.sunLight.castShadow = !night && gfx.realShadows;
    this.moonLight.castShadow = night && gfx.realShadows;
    this.moonLight.shadow.radius = gfx.softShadows ? SHADOW_RADIUS_SOFT : SHADOW_RADIUS_HARD;
    const delta = (((night ? gfx.moonAzimuth : gfx.sunAzimuth) - 53.13) * Math.PI) / 180;
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -delta);
    for (const m of this.shadowCasterGroup.children) {
      if (!m.userData.baseQuat) m.userData.baseQuat = m.quaternion.clone();
      m.quaternion.copy(m.userData.baseQuat as THREE.Quaternion).premultiply(spin);
    }
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(Math.max(1, cssW), Math.max(1, cssH), false);
    this.camera.left = 0;
    this.camera.right = Math.max(1, cssW);
    this.camera.top = Math.max(1, cssH);
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    // MILESTONE 4 — EffectComposer captures the renderer's pixel ratio ONCE at construction
    // time and never re-reads it; without this explicit setPixelRatio() call, bloom would stay
    // locked to whatever dpr was active when the composer was built (effectively 1, since this
    // constructor runs before the first real setSize()), rendering at the wrong resolution on
    // any HiDPI display. setPixelRatio() also calls setSize() internally (with the CURRENT
    // this._width/_height, still 1x1 the very first time — composer.setSize() right after this
    // is what gives it real dimensions), which is why both calls are needed here, in this order,
    // on BOTH composers now (selective bloom uses two).
    this.bloomComposer.setPixelRatio(dpr);
    this.bloomComposer.setSize(Math.max(1, cssW), Math.max(1, cssH));
    this.finalComposer.setPixelRatio(dpr);
    this.finalComposer.setSize(Math.max(1, cssW), Math.max(1, cssH));
  }

  private materialFor(id: TerrainId, variant: number): THREE.MeshLambertMaterial {
    const key = `${id}:${variant}`;
    const hit = this.materialCache.get(key);
    if (hit) return hit;
    const variants = this.engine.art.tiles[id];
    const img = variants?.[variant] ?? variants?.[0];
    if (!img) return this.fallbackMaterial;
    const tex = new THREE.Texture(img);
    // Three's default flipY=true is what this needs: with the Y-negation in hexWorld/
    // render() (see module comment), a plane's local Y=-0.5 edge ends up at the screen
    // BOTTOM, and flipY=true samples the image's bottom row there — matching Canvas2D's
    // drawImage orientation. (Verified numerically, not just by eye — see module comment.)
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    this.groundAO.patch(mat);
    this.materialCache.set(key, mat);
    return mat;
  }

  /** (Re)builds every tile mesh at its fixed world position. Called once per map and again
   * whenever board dimensions or the mission itself changes — never on an ordinary camera
   * pan/zoom, which only ever moves the camera (see render()). */
  private ensureBuilt(tile: number): void {
    const engine = this.engine;
    // tile is part of the identity check (not just cols/rows/missionId) — every mesh's world
    // position and scale is baked in at build time from hexWorld(..., tile), so a zoom change
    // (which changes `tile` without touching cols/rows/missionId) has to trigger a full rebuild
    // too. Decorations already keyed on tile (see ensureDecorBuilt's builtDecorKey); terrain
    // didn't, so zooming left the ground grid frozen at its old scale/position while the camera,
    // decorations and units all repositioned themselves for the new tile size every frame —
    // reads as tiles vanishing/sliding out from under everything else on zoom.
    if (this.builtCols === engine.cols && this.builtRows === engine.rows && this.builtMissionId === engine.mission.id && this.builtTile === tile)
      return;
    for (const entry of this.tileMeshes.values()) this.tileGroup.remove(entry.mesh);
    this.tileMeshes.clear();
    this.builtCols = engine.cols;
    this.builtRows = engine.rows;
    this.builtMissionId = engine.mission.id;
    this.builtTile = tile;

    for (let row = 0; row < engine.rows; row++) {
      for (let col = 0; col < engine.cols; col++) {
        const key = row * engine.cols + col;
        const id = tileAt(engine.tiles, engine.cols, col, row);
        const variant = engine.tileVariants[key] ?? 0;
        const rot = engine.tileRots[key] ?? 0;
        const mat = this.materialFor(id, variant);
        const mesh = new THREE.Mesh(this.hexGeo, mat);
        const { wx, wy } = hexWorld(col, row, tile);
        mesh.scale.set(tile * 2, tile * 2, 1);
        // Y negated — see module comment on the frustum/Y-flip.
        mesh.position.set(wx, -wy, 0);
        // A turned hex spins about its own center — see Canvas2D renderGround's identical
        // rot*PI/3 comment. Negated: a mesh's own local rotation isn't touched by the
        // position negation above, so Three's standard (non-inverted-frustum) CCW-positive
        // Z-rotation would appear CCW on screen — the opposite of ctx.rotate()'s CW-positive
        // screen convention — unless flipped here.
        if (rot) mesh.rotation.z = (-rot * Math.PI) / 3;
        // MILESTONE 2 — the ground is the one surface real shadows land on (see handoff doc);
        // it never casts (stays flat, castShadow defaults to false).
        mesh.receiveShadow = true;
        // Void is an eraser, not a tile: nothing is drawn, so the mission backdrop shows through
        // and a map's outline doesn't have to be a full rows x cols rectangle. Kept as a hidden
        // mesh (not skipped) so syncDirtyTiles can reveal it if the cell ever stops being void.
        mesh.visible = id !== "void";
        this.tileGroup.add(mesh);
        this.tileMeshes.set(key, { mesh, id, variant, rot });
      }
    }
  }

  /** Repositions/retextures only the tiles that actually changed since the last build (a chest
   * opened, a terrain-changing effect fired, ...) — cheap, since most frames change nothing. */
  private syncDirtyTiles(): void {
    const engine = this.engine;
    for (const [key, entry] of this.tileMeshes) {
      const row = Math.floor(key / engine.cols);
      const col = key % engine.cols;
      const id = tileAt(engine.tiles, engine.cols, col, row);
      const variant = engine.tileVariants[key] ?? 0;
      const rot = engine.tileRots[key] ?? 0;
      if (id !== entry.id || variant !== entry.variant) {
        if (id !== entry.id) this.aoTerrainVersion++;
        entry.mesh.visible = id !== "void";
        entry.mesh.material = this.materialFor(id, variant);
        entry.id = id;
        entry.variant = variant;
      }
      if (rot !== entry.rot) {
        entry.mesh.rotation.z = (-rot * Math.PI) / 3;
        entry.rot = rot;
      }
    }
  }

  /** Lazily loads a decoration's art file the same way BattleEngine.decorArtReady does — a prop
   * whose art hasn't finished loading yet just doesn't get a mesh (see ensureDecorBuilt) rather
   * than falling back to a placeholder, since ensureDecorBuilt reruns on the next dirty check
   * and a loading placeholder box would be more visually wrong than a prop appearing a frame
   * late. Shares `engine.art.decorations` with the existing Canvas2D renderer's own cache —
   * one image, loaded once, however many renderers end up reading it this milestone. */
  private decorImageReady(fileId: string): HTMLImageElement | null {
    let img = this.engine.art.decorations[fileId];
    if (!img) {
      img = new Image();
      img.src = decorationImage(fileId);
      decorationImageRetryWebp(img, fileId);
      this.engine.art.decorations[fileId] = img;
    }
    return img.naturalWidth > 0 ? img : null;
  }

  private decorMaterialFor(fileId: string, img: HTMLImageElement): THREE.MeshLambertMaterial {
    const hit = this.decorMatCache.get(fileId);
    if (hit) return hit;
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // Decoration art is cut-out PNGs (alpha, not opaque like terrain tiles) — transparent:true
    // is required or the alpha channel is ignored and every prop draws as an opaque rectangle.
    // Lit (MeshLambertMaterial), so real scene lights — map PointLights included — illuminate
    // the prop; see syncSpriteExposure for how its look under the existing sun/sky is kept.
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
    capSpriteLight(mat, DECOR_LIGHT_CAP);
    this.litSpriteMats.add(mat);
    this.decorMatCache.set(fileId, mat);
    return mat;
  }

  /** Shadow-only twin of decorMaterialFor, for true-silhouette shadow casting instead of the old
   * invisible-box caster: same cached texture (never re-decoded), but alphaTest instead of alpha
   * blending — Three's shadow depth pass respects alphaTest (hard cutout at that texture-alpha
   * threshold), giving a shadow shaped like the prop's actual cutout art, not a box. colorWrite
   * false keeps it invisible in the normal color pass (same trick the old box caster used) since
   * this mesh exists purely to cast into the shadow map. */
  private decorShadowMaterialFor(fileId: string, colorMat: THREE.MeshLambertMaterial): THREE.MeshBasicMaterial {
    const hit = this.decorShadowMatCache.get(fileId);
    if (hit) return hit;
    // side: DoubleSide is required for a flat plane to cast any shadow at all — Three's shadow
    // pass renders back-faces by default (to reduce self-shadow acne on closed volumes), and a
    // single flat PlaneGeometry has no back face for that pass to find, so without this the whole
    // caster silently draws nothing into the shadow map.
    const mat = new THREE.MeshBasicMaterial({ map: colorMat.map, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
    this.decorShadowMatCache.set(fileId, mat);
    return mat;
  }

  /** Depth-only twin of decorMaterialFor for a house's fogCut mesh: no color, writes depth
   * where the art is solid (alphaTest). `transparent` keeps it in the transparent pass so its
   * renderOrder (99, just under the fog's 100) puts it after everything else visible. */
  private decorFogCutMaterialFor(fileId: string, colorMat: THREE.MeshLambertMaterial): THREE.MeshBasicMaterial {
    const hit = this.decorFogCutMatCache.get(fileId);
    if (hit) return hit;
    const mat = new THREE.MeshBasicMaterial({ map: colorMat.map, alphaTest: 0.5, colorWrite: false, depthWrite: true, transparent: true });
    this.decorFogCutMatCache.set(fileId, mat);
    return mat;
  }

  /** (Re)builds every ground/behind-layer decoration mesh at its fixed world position — same
   * "built once, camera moves instead" philosophy as tiles (see ensureBuilt). Skips "front"-
   * layer and foreground=true props on purpose: those are meant to occlude character sprites,
   * which still live on the separate units canvas STACKED ABOVE this one — moving them here
   * would put them permanently behind every unit instead. They keep rendering through
   * BattleEngine.renderUnitsAndOverlays exactly as before, unchanged, until units themselves
   * move onto this renderer and a real depth order between the two exists. */
  private ensureDecorBuilt(tile: number): void {
    const engine = this.engine;
    const key = `${engine.mission.id}:${engine.decorations.length}:${tile}`;
    if (key === this.builtDecorKey) return;
    for (const entry of this.decorEntries) {
      this.decorGroup.remove(entry.mesh);
      if (entry.shadowMesh) this.shadowCasterGroup.remove(entry.shadowMesh);
      if (entry.contactMesh) this.decorContactGroup.remove(entry.contactMesh);
      if (entry.proxy) this.shadowCasterGroup.remove(entry.proxy);
      if (entry.fogCut) this.decorGroup.remove(entry.fogCut);
    }
    this.decorEntries = [];
    this.builtDecorKey = key;

    for (const p of engine.decorations) {
      const def = DECORATIONS[p.id];
      if (!def) continue;
      const decorLayer = def.unitLayer ?? (def.foreground ? "front" : "ground");
      // Fog 2 deliberately sits above every decoration but below units. Front props therefore
      // belong in this same Three layer too; keeping them on the top 2D unit canvas would make
      // them unavoidably render over the fog regardless of their world Z.

      const facing = decorationFacing(p.id, p.rot ?? 0, (file) => this.decorImageReady(file) !== null);
      const fileId = facing.own ? facing.file : p.id;
      const img = this.decorImageReady(fileId);
      if (!img) continue; // art still loading — picked up on the next ensureDecorBuilt (see decorImageReady)

      let sumWx = 0;
      let sumWy = 0;
      let frontWy = -Infinity;
      for (const { dx, dy } of placedFootprint(p)) {
        const { wx, wy } = hexWorld(p.x + dx, p.y + dy, tile);
        sumWx += wx;
        sumWy += wy;
        frontWy = Math.max(frontWy, wy);
      }
      const n = def.footprint.length;
      const { w, h, dy: liftY } = decorSize(p.id, def, tile);
      const wx = sumWx / n;
      const groundWy = sumWy / n; // ground contact, before decorSize's liftY visual offset
      const wy = groundWy + liftY;
      const alphaBase = artBase(img);
      let offsetX = (alphaBase ? (0.5 - (alphaBase.u0 + alphaBase.u1) / 2) : 0) * w + (def.artOffsetX ?? 0) * w;
      let offsetY = alphaBase ? (1 - alphaBase.v) * h : 0;
      if (facing.own && facing.mirror) offsetX = -offsetX;
      else if (!facing.own && facing.step) {
        const angle = (facing.step * Math.PI) / 3;
        [offsetX, offsetY] = [offsetX * Math.cos(angle) - offsetY * Math.sin(angle), offsetX * Math.sin(angle) + offsetY * Math.cos(angle)];
      }

      // Hoisted above the mesh so its renderOrder can already account for it — see
      // ABOVE_GROUND_MIST_ORDER's own comment.
      const lightDef = LIGHT_DEFS[p.id];
      const mat = this.decorMaterialFor(fileId, img);
      const mesh = new THREE.Mesh(this.quadGeo, mat);
      // Front-layer props render after character billboards (order 2), matching the Canvas
      // renderer; their per-decoration priority resolves overlaps with other foreground props.
      // A light prop explicitly placed behind the characters (the fireplace) stays in the base
      // decoration layer like any other background prop, instead of lifting above them.
      const mistOrder = def.aboveGroundMist || (lightDef && decorLayer !== "behind") ? ABOVE_GROUND_MIST_ORDER : 0;
      const tacticalOverlayOrder = def.aboveTacticalOverlays ? ABOVE_GROUND_MIST_ORDER + 1 : 0;
      mesh.renderOrder = Math.max(tacticalOverlayOrder, mistOrder + (decorLayer === "front" ? 3 : 0) + (def.decorRenderOrder ?? 0) * 0.01);
      // Y negated to match the tile/camera convention (see module comment). Z is the prop's
      // 2.5D depth (see DEPTH_Z_BASE): from its front-most row, so a character on a nearer row
      // covers it and one further back is covered — except explicit layers and flat Waypoints.
      const pinnedBehind = decorLayer === "behind" || !!def.exitKind;
      const depthZ = pinnedBehind ? DEPTH_Z_BEHIND : decorLayer === "front" ? DEPTH_Z_FRONT : spriteDepthZ(frontWy, tile);
      mesh.position.set(wx + offsetX, -wy - offsetY, depthZ);
      if (!pinnedBehind && decorLayer !== "front") mesh.add(new THREE.Mesh(this.quadGeo, this.decorOccluderMaterialFor(fileId, mat)));
      if (facing.step === 0) {
        mesh.scale.set(w, h, 1);
      } else if (facing.own) {
        // A prop with its own per-side art mirrors instead of rotating — see
        // decorationFacing's own comment for why (a mirrored drawing still faces outward
        // correctly; a rotated one would tilt the art instead of turning which side faces
        // the viewer).
        mesh.scale.set(facing.mirror ? -w : w, h, 1);
      } else {
        // No dedicated side art: fall back to spinning the bitmap (a placeholder, same as
        // Canvas2D's own fallback) — negated for the same reason tile rotation is (see
        // ensureBuilt's comment).
        mesh.scale.set(w, h, 1);
        mesh.rotation.z = (-facing.step * Math.PI) / 3;
      }
      this.decorGroup.add(mesh);

      // True-silhouette shadow caster (see decorShadowMaterialFor's own comment): the prop's own
      // cutout art, positioned at ground contact (not wy, which already includes decorSize's
      // liftY visual nudge) so the shadow lands where the prop actually stands. Same width/mirror/
      // facing-spin branches as the visible mesh above so the cast silhouette matches what's on
      // screen — but standing vertically (rotation.x), NOT flat like the visible mesh: a flat
      // plane has no depth, so it sits entirely at one fixed height with nothing touching the
      // ground, making its whole shadow float free of the prop (confirmed empirically — "mega
      // Peter Pan" on the equivalent unit version of this bug). Rotating it up turns local Y
      // (image-space up/down) into world Z, so scale.y=elevation + position.z=elevation/2 puts its
      // BASE exactly at the ground (z=0) at the prop's contact point and its top at `elevation`,
      // same span the old box caster used. Skipped entirely for a DecorationDef.noShadow prop —
      // e.g. Parapeito, where a thin tall railing's cast shadow read as a wrong dark stripe
      // across the board rather than grounding the prop.
      const elevation = Math.max(1, h * DECOR_SHADOW_HEIGHT_SCALE);
      let shadowMesh: THREE.Mesh | null = null;
      if (!def.noShadow) {
        const shadowMat = this.decorShadowMaterialFor(fileId, mat);
        shadowMesh = new THREE.Mesh(this.quadGeo, shadowMat);
        shadowMesh.castShadow = true;
        shadowMesh.position.set(wx + offsetX, -(groundWy + offsetY), elevation / 2 - DECOR_SHADOW_GROUND_INSET / 2);
        if (facing.step === 0) {
          shadowMesh.rotation.x = Math.PI / 2;
          shadowMesh.scale.set(w, elevation + DECOR_SHADOW_GROUND_INSET, 1);
        } else if (facing.own) {
          shadowMesh.rotation.x = Math.PI / 2;
          shadowMesh.scale.set(facing.mirror ? -w : w, elevation + DECOR_SHADOW_GROUND_INSET, 1);
        } else {
          shadowMesh.rotation.set(Math.PI / 2, 0, (-facing.step * Math.PI) / 3);
          shadowMesh.scale.set(w, elevation + DECOR_SHADOW_GROUND_INSET, 1);
        }
        this.shadowCasterGroup.add(shadowMesh);
      }

      // Contact decal at the art's own opaque base (visible-mesh space: centered at wx,wy,
      // spanning w x h). Skipped for the spun-bitmap facing fallback — its "bottom" isn't the
      // ground side any more.
      let contactMesh: THREE.Mesh | null = null;
      const base = facing.step !== 0 && !facing.own ? null : artBase(img);
      if (base) {
        const sign = facing.own && facing.mirror ? -1 : 1;
        const cw = (base.u1 - base.u0) * w * CONTACT_SHADOW_W;
        contactMesh = new THREE.Mesh(this.quadGeo, this.decorContactMaterial);
        const ch = Math.min(cw * CONTACT_SHADOW_H, tile * CONTACT_SHADOW_MAX_H);
        contactMesh.position.set(wx + offsetX + sign * ((base.u0 + base.u1) / 2 - 0.5) * w, -(wy + offsetY - h / 2 + base.v * h + ch * CONTACT_SHADOW_FORWARD), 0.51);
        contactMesh.scale.set(cw, ch, 1);
        this.decorContactGroup.add(contactMesh);
      }

      // Light-emitting prop: the light sits at the flame in its art, projected to the ground
      // under it (x, groundWy) with the flame's real height above that ground.
      let light: DecorMeshEntry["light"] = null;
      if (lightDef) {
        const f = artFlame(img);
        const sign = facing.own && facing.mirror ? -1 : 1;
        const flameY = wy + offsetY - h / 2 + f.v * h;
        light = { x: wx + offsetX + sign * (f.u - 0.5) * w, y: groundWy + offsetY, h: Math.max(0, groundWy + offsetY - flameY), def: lightDef, seed: (p.x * 7.31 + p.y * 3.17) % 6.28 };
      }

      // Hidden physical volume: a box standing on the prop's ground spot, as wide as its
      // opaque base, as tall as the shadow elevation, reaching back ("north", +Y) from the
      // contact line. Light-source props get none — their flame sits inside their own volume.
      // A noShadow prop gets none either — this volume exists only to cast/block shadows.
      let proxy: THREE.Mesh | null = null;
      if (!lightDef && !def.noShadow) {
        const pb = artBase(img);
        const sign = facing.own && facing.mirror ? -1 : 1;
        const bw = pb ? Math.max(tile * 0.3, (pb.u1 - pb.u0) * w) : w * 0.6;
        const depth = Math.min(bw, tile * 1.6) * 0.6;
        const bx = pb ? wx + offsetX + sign * ((pb.u0 + pb.u1) / 2 - 0.5) * w : wx + offsetX;
        proxy = new THREE.Mesh(this.proxyBox, this.proxyMaterial);
        proxy.layers.set(PROXY_LAYER);
        proxy.castShadow = true;
        proxy.scale.set(bw, depth, elevation);
        proxy.position.set(bx, -(groundWy + offsetY) + depth / 2, elevation / 2);
        this.shadowCasterGroup.add(proxy);
      }

      // Same art, position and facing as the visible mesh, but writes depth only (see
      // decorFogCutMaterialFor); the fog sheet depth-tests against it (ThreeFogMask).
      let fogCut: THREE.Mesh | null = null;
      if (HOUSE_DECOR_IDS.has(p.id) || BIG_HOUSE_DECOR_IDS.has(p.id) || SOLID_HOUSE_DECOR_IDS.has(p.id)) {
        fogCut = new THREE.Mesh(this.quadGeo, this.decorFogCutMaterialFor(fileId, mat));
        fogCut.renderOrder = 99;
        fogCut.position.set(wx + offsetX, -wy - offsetY, 60);
        fogCut.scale.copy(mesh.scale);
        fogCut.rotation.copy(mesh.rotation);
        this.decorGroup.add(fogCut);
      }

      this.decorEntries.push({ mesh, placement: p, shadowMesh, contactMesh, light, proxy, fogCut });
    }
  }

  private unitTextureFor(img: HTMLImageElement): THREE.Texture {
    const hit = this.unitTexCache.get(img);
    if (hit) return hit;
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.unitTexCache.set(img, tex);
    return tex;
  }

  /** The sprite's silhouette in white, blurred, on a canvas GLOW_PAD times the image's size
   * (same center) — at half resolution, since it's a soft halo. */
  private glowTextureFor(img: HTMLImageElement): THREE.Texture {
    const hit = this.glowTexCache.get(img);
    if (hit) return hit;
    const w = Math.max(1, Math.round(img.naturalWidth * 0.5));
    const h = Math.max(1, Math.round(img.naturalHeight * 0.5));
    const sil = document.createElement("canvas");
    sil.width = w;
    sil.height = h;
    const sc = sil.getContext("2d")!;
    sc.drawImage(img, 0, 0, w, h);
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = "#fff";
    sc.fillRect(0, 0, w, h);
    const out = document.createElement("canvas");
    out.width = Math.round(w * GLOW_PAD);
    out.height = Math.round(h * GLOW_PAD);
    const oc = out.getContext("2d")!;
    oc.filter = `blur(${Math.max(2, w * 0.12)}px)`;
    oc.drawImage(sil, (out.width - w) / 2, (out.height - h) / 2);
    oc.drawImage(sil, (out.width - w) / 2, (out.height - h) / 2);
    const tex = new THREE.CanvasTexture(out);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glowTexCache.set(img, tex);
    return tex;
  }

  /** Full pose/animation parity with BattleEngine's own Canvas2D draw loop — walk/attack/cast/
   * counter poses, every pose-specific size correction, live idle motion (bob/sway/breath) and
   * high-ground lift, all computed once by BattleEngine.unitVisual (see that method's own
   * comment) so this renderer can never drift out of sync with the Canvas2D-shim path it
   * replaces. Position comes from unitAnchor, the public world-space twin of the private
   * unitPixel/footprintCentroid the Canvas2D path actually draws with — including their
   * front-row-footprint averaging for boss/multi-hex units and their mid-move easing, so this
   * renderer's units track the exact same position the hit boxes and combat math use, not an
   * approximation. */
  private syncUnits(tile: number): void {
    const engine = this.engine;
    const seen = new Set<string>();

    for (const u of engine.units) {
      if (u.fade <= 0 || engine.unitHidden(u)) continue;
      const v = engine.unitVisual(u, tile);
      const img = v.img;
      if (!img || img.naturalWidth === 0) continue; // art still loading — picked up next frame

      seen.add(u.id);
      let entry = this.unitEntries.get(u.id);
      if (!entry) {
        // Lit, like decorations — real scene lights illuminate the character (see
        // syncSpriteExposure).
        const material = new THREE.MeshLambertMaterial({ map: this.unitTextureFor(img), transparent: true, depthWrite: false });
        const lightCap = { value: SPRITE_LIGHT_CAP };
        capSpriteLight(material, lightCap);
        this.litSpriteMats.add(material);
        const mesh = new THREE.Mesh(this.quadGeo, material);
        // Atmosphere's Fog 2 sheets use renderOrder 1: units must remain the final visible
        // sprite layer (2), while decorations remain the base layer (0).
        mesh.renderOrder = 2;
        this.unitGroup.add(mesh);
        // True-silhouette shadow caster: the unit's own sprite art, alpha-tested instead of
        // alpha-blended (colorWrite off — invisible in the normal color pass, same trick the old
        // box caster used) so the shadow map sees this unit's real cutout shape, not a box.
        // Real elevation (see UNIT_SHADOW_HEIGHT_SCALE's comment), repositioned every frame below
        // alongside the visible sprite, same scale as it so the cast silhouette actually matches.
        // side: DoubleSide — see decorShadowMaterialFor's identical comment: a flat plane needs
        // this to cast any shadow at all, since Three's shadow pass renders back-faces by default.
        const shadowMaterial = new THREE.MeshBasicMaterial({ map: this.unitTextureFor(img), alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
        const shadowMesh = new THREE.Mesh(this.quadGeo, shadowMaterial);
        shadowMesh.castShadow = true;
        this.shadowCasterGroup.add(shadowMesh);
        const contactMaterial = makeContactShadowMaterial(this.contactShadowTexture);
        const contactMesh = new THREE.Mesh(this.quadGeo, contactMaterial);
        this.contactShadowGroup.add(contactMesh);
        const proxy = new THREE.Mesh(this.proxyCylinder, this.proxyMaterial);
        proxy.layers.set(PROXY_LAYER);
        proxy.castShadow = true;
        this.shadowCasterGroup.add(proxy);
        const glowMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const glowMesh = new THREE.Mesh(this.quadGeo, glowMaterial);
        glowMesh.renderOrder = 2;
        glowMesh.visible = false;
        this.unitGroup.add(glowMesh);
        const occluder = new THREE.Mesh(this.quadGeo, this.unitOccluderMaterialFor(this.unitTextureFor(img)));
        mesh.add(occluder);
        const fogCut = new THREE.Mesh(this.quadGeo, this.unitFogCutMaterialFor(this.unitTextureFor(img)));
        fogCut.renderOrder = 99;
        this.unitGroup.add(fogCut);
        entry = { mesh, glowMesh, glowMaterial, material, lightCap, occluder, img: null, shadowMesh, shadowMaterial, contactMesh, contactMaterial, contactFit: null, proxy, fogCut };
        this.unitEntries.set(u.id, entry);
      }
      entry.mesh.visible = true;
      if (entry.img !== img) {
        entry.material.map = this.unitTextureFor(img);
        entry.material.needsUpdate = true;
        entry.shadowMaterial.map = this.unitTextureFor(img);
        entry.shadowMaterial.needsUpdate = true;
        entry.occluder.material = this.unitOccluderMaterialFor(this.unitTextureFor(img));
        entry.fogCut.material = this.unitFogCutMaterialFor(this.unitTextureFor(img));
        entry.img = img;
      }
      // Same fade-in/out and post-action player-unit dimming as
      // renderUnitsAndOverlays' ctx.globalAlpha — real per-unit opacity, not shared, since
      // entry.material is this unit's own instance (see unitTexCache's comment).
      entry.material.opacity = u.fade * (u.moved && u.side === "player" && engine.phase === "player" && !engine.isAnimating() ? 0.8 : 1);

      const anchor = engine.unitAnchor(u);
      // Canvas2D draws the image at local Y in [-h+footOffset, footOffset] (Y-down, relative
      // to the translated anchor+sway/footY/bob/lift origin), then ctx.scale(scaleX, scaleY)
      // stretches that box AWAY FROM the origin (y=0), not around its own center — so the
      // quad's center has to be repositioned by the same scale, not just resized, to land in
      // the same place a plain "scale the mesh in place" would miss. Horizontal is symmetric
      // (image spans -w/2..w/2) so scaleX only ever needs to flip its sign for mirroring, same
      // pattern ensureDecorBuilt already uses for a decoration's own-art facing.
      const centerYLocal = (v.footOffset - v.h / 2) * v.scaleY;
      const wx = anchor.worldX + v.sway;
      const wy = anchor.worldY + v.footY + v.bob - v.lift + centerYLocal;
      // Y negated and Z derived from row — see module comment on the Y-flip and
      // ensureDecorBuilt's own comment on z ordering vs decorations (z=1) and tiles (z=0).
      // 2.5D depth from the ground line (see DEPTH_Z_BASE) — bob/lift are visual only.
      entry.mesh.position.set(wx, -wy, spriteDepthZ(anchor.worldY + v.footY, tile) + UNIT_DEPTH_TIE);
      // A unit fading in/out is see-through, so it must not blot out what stands behind it.
      entry.occluder.visible = u.fade >= 0.999;
      entry.mesh.scale.set(v.scaleX * v.w, v.scaleY * v.h, 1);
      // Fixed z=60: above the fog sheet's z=50 (see FogMask), same height as a house's fogCut,
      // so the fog-of-war sheet always fails its depth test over this unit, whatever row it's on.
      entry.fogCut.position.set(wx, -wy, 60);
      entry.fogCut.scale.copy(entry.mesh.scale);
      entry.fogCut.visible = u.fade >= 0.999;

      // Hit flash: Canvas2D's ctx.filter brightness(1.8 + flash) on the sprite, as a multiplier
      // on this unit's lit material (on top of syncSpriteExposure's base color, set earlier this
      // frame). brightness() works on gamma-encoded color; the material color is linear, hence
      // the 2.2 power.
      const flashMul = u.flash > 0 ? Math.pow(1.8 + u.flash, 2.2) : 1;
      if (u.flash > 0) entry.material.color.multiplyScalar(flashMul);
      entry.lightCap.value = SPRITE_LIGHT_CAP * flashMul;
      // Level-up / heal rim glow (Canvas2D: a shadowBlur pass of the sprite in the glow color).
      let glowRgb: string | null = null;
      let glowK = 0;
      if (u.levelGlow > 0) {
        glowRgb = "255,208,110";
        glowK = 0.95 * u.levelGlow * (0.75 + Math.sin(engine.time * 7) * 0.25);
      }
      if (u.healGlow > 0) {
        const k = 0.88 * u.healGlow * (0.8 + Math.sin(engine.time * 5) * 0.2);
        if (k > glowK) {
          glowRgb = engine.healHaloRgb(u.healGlowKind).core;
          glowK = k;
        }
      }
      if (glowRgb && glowK > 0.01) {
        const [r, g, b] = glowRgb.split(",").map((c) => Number(c) / 255);
        const glowTex = this.glowTextureFor(img);
        if (entry.glowMaterial.map !== glowTex) {
          entry.glowMaterial.map = glowTex;
          entry.glowMaterial.needsUpdate = true;
        }
        entry.glowMaterial.color.setRGB(r!, g!, b!, THREE.SRGBColorSpace);
        entry.glowMaterial.opacity = Math.min(1, glowK * 1.3) * u.fade;
        entry.glowMesh.position.set(wx, -wy, entry.mesh.position.z - 0.0005);
        entry.glowMesh.scale.set(v.scaleX * v.w * GLOW_PAD, v.scaleY * v.h * GLOW_PAD, 1);
        entry.glowMesh.visible = true;
      } else entry.glowMesh.visible = false;

      // Shadow caster tracks the sprite's ground-contact point (anchor + footY, ignoring bob/lift
      // so a mid-step/high-ground unit's shadow stays anchored to the real ground instead of
      // floating with the visual lift trick — see decorSize's groundWy for the same idea applied
      // to props). Elevation grows a little with lift, echoing the fake shadow's own "raised =
      // slightly longer shadow" stretch (see engine.ts's shadowDirX/Y block) without trying to
      // match it exactly.
      // Standing vertically (rotation.x), NOT flat like the visible mesh — a flat plane has no
      // depth, so it would sit entirely at one fixed height with nothing touching the ground,
      // making its whole shadow float free of the character (confirmed: this was tried first and
      // looked badly detached, "mega Peter Pan"). Rotating it up turns local Y (image-space
      // up/down) into world Z, so scale.y=elevation + position.z=elevation/2 puts its BASE
      // exactly at the ground (z=0) at the foot anchor and its top at `elevation`, same span the
      // old box caster used — except the caster is now the real silhouette, not a box.
      const elevation = Math.max(1, v.h * UNIT_SHADOW_HEIGHT_SCALE + v.lift * 0.6);
      entry.shadowMesh.rotation.x = Math.PI / 2;
      entry.shadowMesh.scale.set(v.scaleX * v.w, elevation + UNIT_SHADOW_GROUND_INSET, 1);
      entry.shadowMesh.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY), elevation / 2 - UNIT_SHADOW_GROUND_INSET / 2);
      entry.shadowMesh.visible = true;
      // Hidden upright cylinder at the feet: the character's physical body for point lights.
      const bodyR = Math.max(tile * 0.18, Math.abs(v.scaleX) * v.w * 0.22);
      entry.proxy.scale.set(bodyR * 2, bodyR * 2, elevation);
      entry.proxy.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY) + bodyR * 0.5, elevation / 2);
      entry.proxy.visible = true;

      // Contact shadow: at this frame's opaque base (feet/paws — see artBase), in the same
      // local frame the sprite is drawn in (image spans y in [-h+footOffset, footOffset] before
      // scale), but from the ground origin (ignores bob/lift so it stays on the ground), fading
      // and shrinking as the unit lifts off it.
      const liftFade = Math.max(0, 1 - v.lift / Math.max(1, tile * 0.6));
      const footW = Math.abs(v.scaleX) * v.w;
      const base = artBase(img);
      const target = base
        ? {
            dx: ((base.u0 + base.u1) / 2 - 0.5) * v.w * v.scaleX,
            dy: (-v.h + v.footOffset + base.v * v.h) * v.scaleY,
            w: Math.min(footW * CONTACT_SHADOW_MAX_W, (base.u1 - base.u0) * footW * CONTACT_SHADOW_W),
          }
        : { dx: 0, dy: 0, w: footW * 0.35 };
      const fit = entry.contactFit;
      if (!fit) entry.contactFit = target;
      else {
        // Width and sideways offset ease slowly: a walk cycle alternates feet-apart and
        // feet-together frames (measured: 20–42px on Neera, jumping 7px/frame at a 0.3 rate),
        // which read as the shadow pulsing. It follows the average stance instead; position
        // itself still tracks the unit exactly (anchor + fit, above).
        fit.dx += (target.dx - fit.dx) * 0.08;
        fit.dy += (target.dy - fit.dy) * 0.3;
        fit.w += (target.w - fit.w) * 0.08;
      }
      const cf = entry.contactFit!;
      const cw = cf.w * (0.7 + 0.3 * liftFade);
      const ch = Math.min(cw * CONTACT_SHADOW_H, tile * CONTACT_SHADOW_MAX_H);
      entry.contactMesh.position.set(anchor.worldX + v.sway + cf.dx, -(anchor.worldY + v.footY + cf.dy + ch * CONTACT_SHADOW_FORWARD), 0.51);
      entry.contactMesh.scale.set(cw, ch, 1);
      entry.contactMaterial.opacity = CONTACT_SHADOW_OPACITY * u.fade * liftFade;
      entry.contactMesh.visible = liftFade > 0;
    }

    for (const [id, entry] of this.unitEntries) {
      if (seen.has(id)) continue;
      if (engine.units.some((u) => u.id === id)) {
        // Still exists (just off-screen/out of sight/faded this frame) — hide, don't discard,
        // so it doesn't need rebuilding the instant it's visible again.
        entry.mesh.visible = false;
        entry.glowMesh.visible = false;
        entry.shadowMesh.visible = false;
        entry.contactMesh.visible = false;
        entry.proxy.visible = false;
        entry.fogCut.visible = false;
      } else {
        this.unitGroup.remove(entry.mesh);
        this.unitGroup.remove(entry.glowMesh);
        this.unitGroup.remove(entry.fogCut);
        entry.glowMaterial.dispose();
        this.shadowCasterGroup.remove(entry.shadowMesh);
        this.contactShadowGroup.remove(entry.contactMesh);
        this.shadowCasterGroup.remove(entry.proxy);
        entry.material.dispose(); // owned per-unit — see unitTexCache's comment; the texture itself is shared, kept
        entry.shadowMaterial.dispose(); // same reasoning, shadowMaterial is this unit's own instance too
        entry.contactMaterial.dispose();
        this.unitEntries.delete(id);
      }
    }
  }

  /** Fog-of-war visibility, rechecked every frame without touching geometry — cheap, and most
   * missions have `fog` off entirely (see Mission.fog), in which case this is a no-op loop that
   * only ever sets `visible = true`. */
  private syncDecorVisibility(): void {
    const engine = this.engine;
    if (!engine.fogged) {
      for (const entry of this.decorEntries) {
        entry.mesh.visible = true;
        if (entry.shadowMesh) entry.shadowMesh.visible = true;
        if (entry.contactMesh) entry.contactMesh.visible = true;
        if (entry.proxy) entry.proxy.visible = true;
        if (entry.fogCut) entry.fogCut.visible = true;
      }
      return;
    }
    for (const entry of this.decorEntries) {
      const p = entry.placement;
      const visible = placedFootprint(p).some((f) => engine.explored(p.x + f.dx, p.y + f.dy));
      entry.mesh.visible = visible;
      if (entry.shadowMesh) entry.shadowMesh.visible = visible;
      if (entry.contactMesh) entry.contactMesh.visible = visible;
      if (entry.proxy) entry.proxy.visible = visible;
      if (entry.fogCut) entry.fogCut.visible = visible;
    }
  }

  /** rgba(r,g,b[,a]) -> a cached, unlit, transparent material — one per exact fill string
   * (color AND alpha both baked into the cache key, since neither animates once resolved: see
   * overlayGroup's own comment on why the canvas-only glow pulse is skipped here). */
  private overlayMaterialFor(fill: string): THREE.MeshBasicMaterial {
    const hit = this.overlayMatCache.get(fill);
    if (hit) return hit;
    const m = /rgba?\(([^,]+),([^,]+),([^,]+)(?:,([^)]+))?\)/.exec(fill);
    const r = m ? Number(m[1]) / 255 : 1;
    const g = m ? Number(m[2]) / 255 : 1;
    const b = m ? Number(m[3]) / 255 : 1;
    const a = m && m[4] !== undefined ? Number(m[4]) : 1;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: true, opacity: a, depthWrite: false });
    this.overlayMatCache.set(fill, mat);
    return mat;
  }

  /** Mirrors the 2D renderer's `drawImage(..., cover)` plus its 42% black wash. Most scenes
   * remain camera-backed, while O Vau's artwork is pinned to its terrain so the painted river
   * continues the river made from map hexes as the camera pans. */
  private syncBackdrop(cssW: number, cssH: number, tile: number): void {
    const image = this.engine.art.backdrops[this.engine.mission.id] ?? null;
    if (image !== this.backdropImage) {
      this.backdropTexture?.dispose();
      this.backdropImage = image;
      this.backdropTexture = image ? new THREE.Texture(image) : null;
      if (this.backdropTexture) {
        this.backdropTexture.needsUpdate = true;
        this.backdropTexture.colorSpace = THREE.SRGBColorSpace;
      }
      this.backdropMaterial.map = this.backdropTexture;
      this.backdropMaterial.needsUpdate = true;
    }
    this.backdropMesh.visible = !!image;
    if (!image) return;
    const imageRatio = image.width / Math.max(1, image.height);
    if (this.engine.mission.id === "vau") {
      // O Vau's river occupies rows 5–6 (with shore rows 4 and 7). The supplied panorama's
      // water band sits at ~56% down the frame. Anchor those two centers together in world
      // space; unlike a decorative screen background, it now moves exactly with the map.
      const boardWidth = tile * SQRT3 * this.engine.cols;
      const width = Math.max(boardWidth * 1.35, cssW, cssH * imageRatio);
      const height = width / imageRatio;
      const mapRiverY = tile * (2.4 + 1.5 * 5.5 + 1);
      const panoramaRiverY = 0.56;
      const centerY = mapRiverY - (panoramaRiverY - 0.5) * height;
      this.backdropMesh.position.set(boardWidth / 2, -centerY, -2);
      this.backdropMesh.scale.set(width, height, 1);
      return;
    }
    const viewRatio = cssW / Math.max(1, cssH);
    const width = imageRatio > viewRatio ? cssH * imageRatio : cssW;
    const height = imageRatio > viewRatio ? cssH : cssW / imageRatio;
    this.backdropMesh.position.set(this.engine.camX + cssW / 2, -this.engine.camY - cssH / 2, -2);
    this.backdropMesh.scale.set(width, height, 1);
  }

  /** A faint, pooled halo restores the depth that the 2D renderer's shadowBlur gave blue
   * movement/range cells. Only blue tactical overlays receive it; spell and danger colors stay
   * deliberately flat so the board remains calm and readable. */
  private placeBlueOverlayGlow(x: number, y: number, tile: number, index: number, fade = 1): void {
    let glow = this.overlayGlowPool[index];
    if (!glow) {
      glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.activeTurnGlowTexture, color: 0x8cc8f5, transparent: true, depthWrite: false, opacity: 0.15 }),
      );
      this.overlayGlowGroup.add(glow);
      this.overlayGlowPool.push(glow);
    }
    const { wx, wy } = hexWorld(x, y, tile);
    const pulse = 0.5 + 0.5 * Math.sin(this.engine.time * 3.8);
    glow.position.set(wx, -wy, 0.42);
    glow.scale.setScalar(tile * (2.08 + pulse * 0.24));
    (glow.material as THREE.SpriteMaterial).opacity = (0.1 + pulse * 0.1) * fade;
    glow.visible = true;
  }

  /** Movement/attack/spell-range highlight + the active-turn ring, from the same cell/color
   * data renderBoardOverlays (Canvas2D path) draws from — see overlayGroup's own comment for
   * why this renders as real geometry instead of a 2D fill. Pool index reused across frames
   * (see overlayMeshPool): cheaper than tearing down and rebuilding a THREE.Mesh per cell every
   * single frame for what is usually the same handful of cells frame to frame. */
  private syncOverlay(tile: number): void {
    const engine = this.engine;
    let idx = 0;
    let glowIdx = 0;
    const place = (x: number, y: number, fill: string) => {
      let mesh = this.overlayMeshPool[idx];
      if (!mesh) {
        mesh = new THREE.Mesh(this.hexGeo, this.overlayMaterialFor(fill));
        this.overlayGroup.add(mesh);
        this.overlayMeshPool.push(mesh);
      } else {
        mesh.material = this.overlayMaterialFor(fill);
        mesh.visible = true;
      }
      const { wx, wy } = hexWorld(x, y, tile);
      // 1.84 = 2 * 0.92, matching the Canvas2D path's hexPath(ctx, cx, cy, tile * 0.92) radius
      // (see buildHexGeometry's comment on why *2 turns this geometry's own radius-0.5 shape
      // into a `tile`-radius hex).
      mesh.scale.set(tile * 1.84, tile * 1.84, 1);
      // Y negated, z=0.5 — see module comment on the Y-flip and overlayGroup's own comment on
      // why this sits between tiles (z=0) and decorations (z=1).
      mesh.position.set(wx, -wy, 0.5);
      idx++;
    };
    // Hidden while anything is playing, fading back in afterwards — see BattleEngine.overlayFade.
    const fade = engine.overlayFade;
    for (const layer of fade > 0.001 ? engine.boardOverlayLayers() : []) {
      const rgb = /rgba?\(([^,]+),([^,]+),([^,]+)/.exec(layer.fill);
      const isBlue = !!rgb && Number(rgb[3]) > Number(rgb[1]) && Number(rgb[3]) > Number(rgb[2]);
      const fill = fade >= 1 ? layer.fill : fadedFill(layer.fill, fade);
      for (const c of layer.cells) {
        place(c.x, c.y, fill);
        if (isBlue) this.placeBlueOverlayGlow(c.x, c.y, tile, glowIdx++, fade);
      }
    }
    const active = engine.activeTurnHighlight();
    if (active) {
      place(active.x, active.y, active.fill);
      const pulse = 0.72 + Math.sin(engine.time * 5.5) * 0.28;
      const { wx, wy } = hexWorld(active.x, active.y, tile);
      this.activeTurnGlow.visible = true;
      this.activeTurnGlow.position.set(wx, -wy, 0.45);
      this.activeTurnGlow.scale.setScalar(tile * (2.45 + pulse * 0.32));
      this.activeTurnGlowMaterial.color.set(active.player ? 0xd6a12a : 0xd25436);
      this.activeTurnGlowMaterial.opacity = active.player ? Math.min(1, (0.32 + pulse * 0.18) * 1.5) : 0.72;
    } else {
      this.activeTurnGlow.visible = false;
    }
    // The mouse-selection hex, drawn here instead of on the Canvas2D units shim (see
    // BattleEngine.renderUnitsAndOverlays' skipCursorHex) so it lands at this same z=0.5 —
    // genuinely behind decorations/units instead of on a canvas stacked above them.
    const cur = engine.hover ?? engine.cursor;
    const curId = tileAt(engine.tiles, engine.cols, cur.x, cur.y);
    // No cursor hex floating over erased (void) ground — there is no tile there to point at.
    if (curId !== "void") place(cur.x, cur.y, !TERRAIN[curId].passable ? "rgba(255,90,72,0.28)" : "rgba(240,235,227,0.16)");
    for (; idx < this.overlayMeshPool.length; idx++) this.overlayMeshPool[idx]!.visible = false;
    for (; glowIdx < this.overlayGlowPool.length; glowIdx++) this.overlayGlowPool[glowIdx]!.visible = false;
  }

  /** Call once per frame in place of BattleEngine.renderGround — updateCameraLayout runs the
   * exact same camera/visibility bookkeeping renderGround always did (see that method's own
   * comment), just without drawing through the Canvas2D shim afterward. */
  render(cssW: number, cssH: number): void {
    const tile = this.engine.updateCameraLayout(cssW, cssH);
    this.syncBackdrop(cssW, cssH, tile);
    this.ensureBuilt(tile);
    this.syncDirtyTiles();
    this.ensureDecorBuilt(tile);
    this.syncGroundAO(tile);
    this.syncFog(tile);
    this.syncLights(tile, cssW, cssH);
    this.syncSpriteExposure();
    this.syncDecorVisibility();
    this.syncWebZones(tile);
    this.syncOverlay(tile);
    this.syncUnits(tile);
    this.syncSky();
    this.applyDevGfx();
    // MILESTONE 3 — dt derived locally (render() itself only ever receives cssW/cssH, see this
    // method's own comment) since the mist noise drift and particle GPU animation are the only
    // things in this file that need real elapsed time rather than per-frame engine state.
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    // The camera moves; the tiles never do — see module comment. This is the one line that
    // has to run every frame for panning/zooming to work. Y is `-camY - cssH` to match the
    // mesh placement's own Y-negation (see module comment) — verified numerically to
    // reproduce BattleEngine's cx/cy screen-pixel formula exactly.
    this.camera.position.set(this.engine.camX, -this.engine.camY - cssH, 100);
    this.syncFireballVfx(dt, cssW, cssH, tile);
    this.syncPhantasmalForceVfx(dt, tile);
    this.syncBlessVfx(dt, tile);
    this.syncMagicMissileV2Vfx(dt, tile);
    this.atmosphere.sync(
      this.engine,
      tile,
      dt,
      this.sunLight,
      this.hemiLight,
      { cssW, cssH, camX: this.engine.camX, camY: this.engine.camY },
      (x, y) => this.cellAtWorld(x, y),
    );
    // MILESTONE 2 — the sun has to re-aim every frame too, for the same reason the camera does:
    // the shadow-caster boxes are fixed in world space, only the view of them pans.
    this.updateSun(cssW, cssH, this.engine.camX, this.engine.camY);
    // Bloom samples the real 3D scene, except for authored light-source art. Their point
    // lights still illuminate everything normally, but the torch/candle/brazier sprite itself
    // must not turn into a blinding white halo when bloom is enabled.
    this.renderBloomWithoutLightSourceArt();
    this.finalComposer.render();
  }

  private syncFireballVfx(dt: number, cssW: number, cssH: number, tile: number): void {
    const system = this.fireballVfx;
    if (!system) return;
    const width = Math.max(1, this.renderer.domElement.width);
    const height = Math.max(1, this.renderer.domElement.height);
    const requests = this.engine.fireballVfxRequests.splice(0);
    if (!requests.length) system.update(dt, width, height, tile);
    for (const request of requests) {
      const caster = this.engine.units.find((unit) => unit.id === request.casterId);
      const destination = this.engine.effectAnchor(request.target.x, request.target.y);
      // Measure the damage footprint from the exact resolved hexes, not a guessed spell radius.
      const aoeRadius = request.tiles.reduce((radius, cell) => {
        const anchor = this.engine.effectAnchor(cell.x, cell.y);
        return Math.max(radius, Math.hypot(anchor.worldX - destination.worldX, anchor.worldY - destination.worldY) + tile);
      }, tile);
      // Hidden cells do not receive a luminous effect. Damage remains governed by combat's
      // precomputed AoE list and is intentionally unaffected by this visibility gate.
      if (!caster || (this.engine.fogged && !this.engine.visible(request.target.x, request.target.y))) {
        this.engine.fireballVfxEvents.push({ id: request.id, phase: "impact" }, { id: request.id, phase: "complete" });
        continue;
      }
      const visual = this.engine.unitVisual(caster, tile);
      const anchor = this.engine.unitAnchor(caster);
      const sign = caster.facing < 0 ? -1 : 1;
      const centerYLocal = (visual.footOffset - visual.h / 2) * visual.scaleY;
      const casterY = anchor.worldY + visual.footY + visual.bob - visual.lift + centerYLocal;
      const origin = new THREE.Vector3(
        anchor.worldX + visual.sway + sign * visual.w * visual.scaleX * 0.31,
        -casterY - visual.h * visual.scaleY * 0.13,
        1.08 + (anchor.worldY / tile) * 0.004,
      );
      const elevation = this.engine.hexElevated(request.target.x, request.target.y) ? destination.tile * 0.18 : 0;
      const target = new THREE.Vector3(destination.worldX, -(destination.worldY - elevation), 1.08 + (destination.worldY / tile) * 0.004);
      const unseenOrigin = this.engine.fogged && !this.engine.visible(caster.x, caster.y);
      const unseenTarget = this.engine.fogged && !this.engine.visible(request.target.x, request.target.y);
      if (unseenOrigin || unseenTarget) {
        this.engine.fireballVfxEvents.push({ id: request.id, phase: "impact" }, { id: request.id, phase: "complete" });
        continue;
      }
      system.cast({
        id: request.id,
        origin,
        target,
        worldScale: tile,
        aoeRadius,
        onLaunch: () => this.engine.fireballVfxEvents.push({ id: request.id, phase: "launch" }),
        onImpact: () => this.engine.fireballVfxEvents.push({ id: request.id, phase: "impact" }),
        onComplete: () => this.engine.fireballVfxEvents.push({ id: request.id, phase: "complete" }),
      });
    }
    if (requests.length) system.update(0, width, height, tile);
    void cssW;
    void cssH;
  }

  private syncPhantasmalForceVfx(dt: number, tile: number): void {
    const system = this.phantasmalForceVfx;
    if (!system) return;
    const requests = this.engine.phantasmalForceVfxRequests.splice(0);
    if (!requests.length) system.update(dt);
    for (const request of requests) {
      const targetUnit = this.engine.units.find((unit) => unit.id === request.targetUnitId && unit.alive);
      const destination = this.engine.effectAnchor(request.target.x, request.target.y);
      if (!targetUnit || (this.engine.fogged && !this.engine.visible(request.target.x, request.target.y))) {
        this.engine.phantasmalForceVfxEvents.push({ id: request.id, phase: "impact" }, { id: request.id, phase: "complete" });
        continue;
      }
      const visual = this.engine.unitVisual(targetUnit, tile);
      const anchor = this.engine.unitAnchor(targetUnit);
      const centerYLocal = (visual.footOffset - visual.h / 2) * visual.scaleY;
      const groundY = anchor.worldY + visual.footY;
      const target = new THREE.Vector3(
        anchor.worldX + visual.sway,
        -(groundY + visual.bob - visual.lift + centerYLocal),
        spriteDepthZ(groundY, tile) + UNIT_DEPTH_TIE,
      );
      const elevation = this.engine.hexElevated(request.target.x, request.target.y) ? destination.tile * 0.18 : 0;
      target.y += elevation;
      system.restartAt(target, tile, {
        onImpact: () => this.engine.phantasmalForceVfxEvents.push({ id: request.id, phase: "impact" }),
        onComplete: () => this.engine.phantasmalForceVfxEvents.push({ id: request.id, phase: "complete" }),
      });
    }
    if (requests.length) system.update(0);
  }

  private syncBlessVfx(dt: number, tile: number): void {
    const system = this.blessVfx;
    if (!system) return;
    const requests = this.engine.blessVfxRequests.splice(0);
    if (!requests.length) system.update(dt);
    for (const request of requests) {
      const centerAnchor = this.engine.effectAnchor(request.center.x, request.center.y);
      const center = new THREE.Vector3(centerAnchor.worldX, -centerAnchor.worldY + tile * 0.035, spriteDepthZ(centerAnchor.worldY, tile) + UNIT_DEPTH_TIE);
      const allies = request.allies.map((ally) => {
        const unit = this.engine.units.find((candidate) => candidate.id === ally.id && candidate.alive);
        if (!unit) return null;
        const anchor = this.engine.unitAnchor(unit);
        const visual = this.engine.unitVisual(unit, tile);
        const groundY = anchor.worldY + visual.footY;
        const y = -(groundY + visual.bob - visual.lift + (visual.footOffset - visual.h * 0.36) * visual.scaleY);
        return { id: unit.id, position: new THREE.Vector3(anchor.worldX + visual.sway, y, spriteDepthZ(groundY, tile) + UNIT_DEPTH_TIE), distanceHexes: ally.distanceHexes };
      }).filter((ally): ally is NonNullable<typeof ally> => !!ally);
      system.castSpell({
        id: request.id,
        center,
        radiusWorld: BLESS.radius * Math.sqrt(3) * tile,
        allies,
        onApply: (unitId) => this.engine.blessVfxEvents.push({ id: request.id, phase: "apply", unitId }),
        onComplete: () => this.engine.blessVfxEvents.push({ id: request.id, phase: "complete" }),
        onTimelineEvent: (event, unitId) => this.engine.blessTimelineEvents.push({ id: request.id, event, unitId }),
      });
    }
    if (requests.length) system.update(0);
  }

  private syncMagicMissileV2Vfx(dt: number, tile: number): void {
    const system = this.magicMissileV2Vfx;
    if (!system) return;
    this.pendingMagicMissileV2VfxRequests.push(...this.engine.magicMissileV2VfxRequests.splice(0));
    if (this.activeMagicMissileV2VfxRequestId) system.update(dt);

    // Multiple target shots can be emitted in one engine frame. Never call castSpell for each
    // request at once: castSpell reuses one pooled effect and the next call would erase the one
    // before it. Finish each hero missile (including its impact light) before starting the next.
    while (!this.activeMagicMissileV2VfxRequestId && this.pendingMagicMissileV2VfxRequests.length) {
      const request = this.pendingMagicMissileV2VfxRequests.shift()!;
      this.activeMagicMissileV2VfxRequestId = request.id;
      if (!this.startMagicMissileV2Vfx(system, request, tile)) continue;
      system.update(0);
    }
  }

  private startMagicMissileV2Vfx(system: MagicMissileV2VFX, request: MagicMissileV2VfxRequest, tile: number): boolean {
    const caster = this.engine.units.find((unit) => unit.id === request.casterId && unit.alive);
    const target = this.engine.units.find((unit) => unit.id === request.targetUnitId && unit.alive);
    if (!caster || !target || (this.engine.fogged && !this.engine.visible(target.x, target.y))) {
      this.engine.magicMissileV2VfxEvents.push({ id: request.id, phase: "impact", index: 0 }, { id: request.id, phase: "complete" });
      this.activeMagicMissileV2VfxRequestId = null;
      return false;
    }
    const casterAnchor = this.engine.unitAnchor(caster);
    const casterVisual = this.engine.unitVisual(caster, tile);
    const casterGroundY = casterAnchor.worldY + casterVisual.footY;
    const casterCenterY = (casterVisual.footOffset - casterVisual.h * 0.38) * casterVisual.scaleY;
    const origin = new THREE.Vector3(
      casterAnchor.worldX + casterVisual.sway,
      -(casterGroundY + casterVisual.bob - casterVisual.lift + casterCenterY),
      spriteDepthZ(casterGroundY, tile) + UNIT_DEPTH_TIE + tile * 0.08,
    );
    const targetAnchor = this.engine.unitAnchor(target);
    const targetVisual = this.engine.unitVisual(target, tile);
    const targetGroundY = targetAnchor.worldY + targetVisual.footY;
    const targetCenterY = (targetVisual.footOffset - targetVisual.h * 0.48) * targetVisual.scaleY;
    const destination = new THREE.Vector3(
      targetAnchor.worldX + targetVisual.sway,
      -(targetGroundY + targetVisual.bob - targetVisual.lift + targetCenterY),
      spriteDepthZ(targetGroundY, tile) + UNIT_DEPTH_TIE + tile * 0.08,
    );
    system.castSpell({
      id: request.id,
      origin,
      target: destination,
      // One complete hero missile belongs to each queued target shot; damage stays per shot.
      missileCount: 1,
      worldScale: tile,
      onImpact: (index) => this.engine.magicMissileV2VfxEvents.push({ id: request.id, phase: "impact", index }),
      onComplete: () => {
        this.engine.magicMissileV2VfxEvents.push({ id: request.id, phase: "complete" });
        if (this.activeMagicMissileV2VfxRequestId === request.id) this.activeMagicMissileV2VfxRequestId = null;
      },
      onTimelineEvent: (event, index) => this.engine.magicMissileV2TimelineEvents.push({ id: request.id, event, index }),
    });
    return true;
  }

  /** Render the bloom buffer while temporarily omitting the visible art of map light sources.
   * The lights themselves stay in the scene, so this changes post-processing only—not the
   * actual 3D illumination, shadows, or the normal final render. */
  private renderBloomWithoutLightSourceArt(): void {
    const hidden: THREE.Mesh[] = [];
    // Houses that burn (fogCut marks a house) are drawn black instead of hidden: hiding one let
    // the bloom buffer show the ground behind it, which the mix pass then added over the house,
    // making the whole building look see-through. Black still adds no bloom of its own.
    const blacked: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
    for (const entry of this.decorEntries) {
      if (!entry.light || !entry.mesh.visible) continue;
      if (entry.fogCut) {
        blacked.push({ mesh: entry.mesh, material: entry.mesh.material });
        entry.mesh.material = this.bloomBlackMaterialFor(entry.mesh.material as THREE.MeshLambertMaterial);
        continue;
      }
      entry.mesh.visible = false;
      hidden.push(entry.mesh);
    }
    // Map lights never feed bloom: the bloom buffer is rendered unlit by them, so a candle's
    // bright pool on the floor can't swell into a white disc over everyone standing near it.
    const intensities = this.pointLights.map((pl) => pl.intensity);
    for (const pl of this.pointLights) pl.intensity = 0;
    try {
      this.bloomComposer.render();
    } finally {
      for (const mesh of hidden) mesh.visible = true;
      for (const b of blacked) b.mesh.material = b.material;
      this.pointLights.forEach((pl, i) => (pl.intensity = intensities[i]!));
    }
  }

  private decorOccluderMatCache = new Map<string, THREE.MeshBasicMaterial>();
  /** Depth-only cutout of a prop's art — see DEPTH_Z_BASE. */
  private decorOccluderMaterialFor(fileId: string, colorMat: THREE.MeshLambertMaterial): THREE.MeshBasicMaterial {
    const hit = this.decorOccluderMatCache.get(fileId);
    if (hit) return hit;
    const mat = occluderMaterial(colorMat.map);
    this.decorOccluderMatCache.set(fileId, mat);
    return mat;
  }
  private unitOccluderMatCache = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  private unitOccluderMaterialFor(tex: THREE.Texture): THREE.MeshBasicMaterial {
    const hit = this.unitOccluderMatCache.get(tex);
    if (hit) return hit;
    const mat = occluderMaterial(tex);
    this.unitOccluderMatCache.set(tex, mat);
    return mat;
  }
  private unitFogCutMatCache = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  /** Depth-only twin of a unit's sprite for its fogCut — same recipe as decorFogCutMaterialFor. */
  private unitFogCutMaterialFor(tex: THREE.Texture): THREE.MeshBasicMaterial {
    const hit = this.unitFogCutMatCache.get(tex);
    if (hit) return hit;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, colorWrite: false, depthWrite: true, transparent: true });
    this.unitFogCutMatCache.set(tex, mat);
    return mat;
  }

  /** Black silhouette of a decoration's art (same texture alpha) for the bloom-only pass. */
  private bloomBlackMatCache = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private bloomBlackMaterialFor(colorMat: THREE.MeshLambertMaterial): THREE.MeshBasicMaterial {
    const hit = this.bloomBlackMatCache.get(colorMat);
    if (hit) return hit;
    const mat = new THREE.MeshBasicMaterial({ map: colorMat.map, color: 0x000000, transparent: true, depthWrite: false });
    this.bloomBlackMatCache.set(colorMat, mat);
    return mat;
  }

  /** Dreaming Web floor: mirrors Canvas2D renderGround's webZones block — each explored cell
   * of a live zone, once WEB_SHOT_TRAVEL has passed since the cast (the shot has landed), at
   * 0.38 opacity where the cell is explored but not currently in sight. */
  private syncWebZones(tile: number): void {
    const engine = this.engine;
    const img = engine.art.webfloor;
    let n = 0;
    if (img && img.naturalWidth > 0) {
      if (!this.webMat) {
        const tex = new THREE.Texture(img);
        tex.needsUpdate = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.webMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
        this.webMatDim = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.38 });
      }
      for (const zone of engine.webZones) {
        if (zone.createdAt != null && engine.time < zone.createdAt + WEB_SHOT_TRAVEL) continue;
        for (const k of zone.cells) {
          const comma = k.indexOf(",");
          const x = Number(k.slice(0, comma));
          const y = Number(k.slice(comma + 1));
          if (!Number.isFinite(x) || !Number.isFinite(y) || !engine.explored(x, y)) continue;
          let mesh = this.webMeshes[n];
          if (!mesh) {
            mesh = new THREE.Mesh(this.hexGeo, this.webMat);
            this.webMeshes.push(mesh);
            this.webGroup.add(mesh);
          }
          mesh.material = engine.visible(x, y) ? this.webMat : this.webMatDim!;
          const { wx, wy } = hexWorld(x, y, tile);
          mesh.scale.set(tile * 2, tile * 2, 1);
          // Above the ground (z 0), under the range highlights (0.42+).
          mesh.position.set(wx, -wy, 0.3);
          mesh.visible = true;
          n++;
        }
      }
    }
    for (let i = n; i < this.webMeshes.length; i++) this.webMeshes[i]!.visible = false;
  }

  /** Dev Controls toggles (see devGfx.ts) — read every frame so a flip applies immediately. */
  private applyDevGfx(): void {
    const gfx = getDevGfx();
    this.sunLight.shadow.radius = gfx.softShadows ? SHADOW_RADIUS_SOFT : SHADOW_RADIUS_HARD;
    this.contactShadowGroup.visible = gfx.contactShadows;
    this.decorContactGroup.visible = gfx.contactShadows && this.decorGroup.visible;
    this.groundAO.setEnabled(gfx.ambientOcclusion);
  }

  /** Occluders for the ground AO field: every decoration footprint cell, plus raised/blocking
   * terrain (hill, column, barricade, door — not water or the void edge trim, which are low or
   * empty, not surrounding geometry). Rebuilt only when the map/terrain/decoration set changes. */
  private syncGroundAO(tile: number): void {
    const engine = this.engine;
    const key = `${engine.mission.id}:${engine.cols}x${engine.rows}:${this.aoTerrainVersion}:${engine.decorations.length}`;
    this.groundAO.update(key, engine.cols, engine.rows, BOARD_PAD_MUL, tile, () => {
      const out: AoOccluder[] = [];
      for (let row = 0; row < engine.rows; row++) {
        for (let col = 0; col < engine.cols; col++) {
          const id = tileAt(engine.tiles, engine.cols, col, row);
          const t = TERRAIN[id];
          const { wx, wy } = hexWorld(col, row, 1);
          if (t.height) out.push({ x: wx, y: wy, weight: 0.7 });
          else if (!t.passable && t.blocksShot && id !== "void") out.push({ x: wx, y: wy, weight: 1 });
        }
      }
      for (const p of engine.decorations) {
        if (!DECORATIONS[p.id]) continue;
        for (const { dx, dy } of placedFootprint(p)) {
          const { wx, wy } = hexWorld(p.x + dx, p.y + dy, 1);
          out.push({ x: wx, y: wy, weight: 1 });
        }
      }
      return out;
    }, (x, y) => {
      const cell = this.cellAtWorld(x, y);
      if (cell < 0) return false;
      // Same set as the terrain occluders above: a hilltop or a pillar/barricade/door top
      // never occludes itself, only the ground around its foot.
      const cellId = engine.tiles[cell]!;
      const t = TERRAIN[cellId];
      return !!t.height || (!t.passable && !!t.blocksShot && cellId !== "void");
    });
  }

  /** Decorations and unit billboards are lit (MeshLambertMaterial) so real lights reach them.
   * Under the scene's sun + sky alone a lit camera-facing plane comes out brighter than the
   * unlit art it replaced, so each lit sprite's material color is set to the inverse of that
   * sun + sky lighting: with no map light nearby it looks exactly as before; next to a
   * PointLight it receives that light on top, computed by Three. Recomputed every frame since
   * sun/sky intensities are mission- and atmosphere-driven. */
  private syncSpriteExposure(): void {
    // Calibrated against the mission's standing daytime sun (default direction and intensity) —
    // not the live values — so night and sun-angle changes reach the sprites as real light.
    const sunNdotL = Math.max(0, -SUN_DIRECTION.z); // camera-facing plane: normal +Z
    const sky = this.calibHemiColor;
    const ground = this.hemiLight.groundColor;
    // Hemisphere light on a +Z normal (hemi axis is +Y): an even mix of sky and ground colors.
    const hemi = [(sky.r + ground.r) / 2, (sky.g + ground.g) / 2, (sky.b + ground.b) / 2];
    const sun = this.calibSunColor;
    const k = (i: 0 | 1 | 2, sunC: number) => (this.calibSunIntensity * sunNdotL * sunC + this.calibHemiIntensity * hemi[i]!) / Math.PI;
    const r = 1 / Math.max(0.05, k(0, sun.r));
    const g = 1 / Math.max(0.05, k(1, sun.g));
    const b = 1 / Math.max(0.05, k(2, sun.b));
    for (const m of this.litSpriteMats) m.color.setRGB(r, g, b);
  }

  /** Per-frame: every light prop's flame, flickered, drives one real THREE.PointLight (the
   * POINT_LIGHT_POOL nearest the view). Dev Controls "Luzes do mapa" turns them all off for an
   * A/B comparison. */
  private syncLights(tile: number, cssW: number, cssH: number): void {
    const engine = this.engine;
    const out: EnvLight[] = [];
    if (getDevGfx().localLights) {
      for (const e of this.decorEntries) {
        const L = e.light;
        if (!L) continue;
        const k = L.def.intensity * flickerAt(engine.time, L.seed, L.def.flicker);
        out.push({ x: L.x, y: L.y, h: L.h, r: L.def.radius * LIGHT_RADIUS_MUL * tile, rgb: [L.def.color[0] * k, L.def.color[1] * k, L.def.color[2] * k] });
      }
      // Units that carry their own light (UNIT_LIGHT_DEFS) — follows the unit's live anchor, so
      // the light walks with it; hidden (fog) or dead units give none, fading ones fade it.
      for (const u of engine.units) {
        const def = UNIT_LIGHT_DEFS[u.classId];
        if (!def || !u.alive || u.fade <= 0 || engine.unitHidden(u)) continue;
        const a = engine.unitAnchor(u);
        let seed = 0;
        for (let i = 0; i < u.id.length; i++) seed = (seed * 31 + u.id.charCodeAt(i)) % 628;
        const k = def.intensity * flickerAt(engine.time * 0.5, seed / 100, def.flicker) * Math.min(1, u.fade);
        out.push({ x: a.worldX, y: a.worldY, h: tile, r: def.radius * tile, rgb: [def.color[0] * k, def.color[1] * k, def.color[2] * k] });
      }
      // Nearest the view first: they win the pool.
      const cx = engine.camX + cssW / 2;
      const cy = engine.camY + cssH / 2;
      out.sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
    }
    // A real PointLight at each flame: X/Y = the flame's ground position (Y negated, the scene's
    // Y-flip), Z = the flame's height above the board (+Z is up toward the camera, the board is
    // the z=0 plane). Intensity is scaled so irradiance one hex radius away is
    // LightDef.intensity x the ground's normal sun + sky irradiance.
    this.pointLights.forEach((pl, i) => {
      const L = out[i];
      if (!L) {
        pl.intensity = 0;
        return;
      }
      const peak = Math.max(L.rgb[0], L.rgb[1], L.rgb[2], 1e-6);
      pl.color.setRGB(L.rgb[0] / peak, L.rgb[1] / peak, L.rgb[2] / peak);
      pl.intensity = peak * GROUND_BASE_IRRADIANCE * Math.pow(tile, LIGHT_DECAY);
      pl.position.set(L.x, -L.y, Math.max(L.h, tile * 0.35));
      // Range is measured in 3D from the flame, so it has to include the flame's height to still
      // reach L.r out along the ground. (Three also sets the point-shadow camera's far plane to
      // this distance — ground past it would read as shadowed.)
      pl.distance = Math.hypot(L.r, pl.position.z) * 1.05;
    });
  }

  /** The board cell (row-major index) a tile-normalized world point (hexWorld units, y-down)
   * lies in — nearest hex center, which is exactly the hex tiling — or -1 off the board. */
  private cellAtWorld(x: number, y: number): number {
    const engine = this.engine;
    const row0 = Math.round((y - BOARD_PAD_MUL - 1) / 1.5);
    let best = Infinity;
    let bc = -1;
    let br = -1;
    for (let row = row0 - 1; row <= row0 + 1; row++) {
      const col0 = Math.round(x / SQRT3 - 0.5 * (row & 1) - 0.5);
      for (let col = col0 - 1; col <= col0 + 1; col++) {
        const c = hexWorld(col, row, 1);
        const d = (c.wx - x) ** 2 + (c.wy - y) ** 2;
        if (d < best) {
          best = d;
          bc = col;
          br = row;
        }
      }
    }
    // Beyond one hex radius from the nearest center is off the board's outer edge.
    if (bc < 0 || br < 0 || bc >= engine.cols || br >= engine.rows || best > 1) return -1;
    return br * engine.cols + bc;
  }

  /** Fog of war overlay (see ThreeFogMask.ts) — rebuilt only when the engine's visibility
   * grid changes (visVersion), the debug view is toggled, the board changes, or a player unit
   * steps to a new hex (see clearAround/partyKey below). */
  private syncFog(tile: number): void {
    const engine = this.engine;
    if (!engine.fogged) {
      this.fogMask.hide();
      return;
    }
    const debug = getDevGfx().fogDebug;
    const cols = engine.cols;
    // No fog-of-war within one hex of any living player character, ever — not merely a unit
    // drawn in front of it (see the per-unit fogCut in syncUnits, a separate sprite-level fix):
    // the darkened fill itself must not exist right beside where the party actually is.
    const clearAround = new Set<number>();
    for (const u of engine.units) {
      if (u.side !== "player" || !u.alive) continue;
      for (const p of footprint(u)) {
        for (const n of [p, ...hexNeighbors(p.x, p.y)]) {
          if (n.x >= 0 && n.y >= 0 && n.x < cols && n.y < engine.rows) clearAround.add(n.y * cols + n.x);
        }
      }
    }
    const partyKey = engine.units
      .filter((u) => u.side === "player" && u.alive)
      .map((u) => `${u.x},${u.y}`)
      .join("|");
    const key = `${engine.mission.id}:${cols}x${engine.rows}:${engine.visVersion}:${debug ? 1 : 0}:${partyKey}`;
    this.fogMask.update(key, cols, engine.rows, BOARD_PAD_MUL, tile, debug, (x, y) => this.cellAtWorld(x, y), (i) => {
      if (clearAround.has(i)) return FOG_VISIBLE;
      const x = i % cols;
      const y = (i - x) / cols;
      return engine.visible(x, y) ? FOG_VISIBLE : engine.explored(x, y) ? FOG_EXPLORED : FOG_UNSEEN;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.pendingMagicMissileV2VfxRequests.length = 0;
    this.activeMagicMissileV2VfxRequestId = null;
    this.engine.fireballVfxAvailable = false;
    this.engine.phantasmalForceVfxAvailable = false;
    this.engine.blessVfxAvailable = false;
    this.engine.magicMissileV2VfxAvailable = false;
    this.fireballVfx?.dispose();
    this.fireballVfx = null;
    this.phantasmalForceVfx?.dispose();
    this.phantasmalForceVfx = null;
    this.blessVfx?.dispose();
    this.blessVfx = null;
    this.magicMissileV2Vfx?.dispose();
    this.magicMissileV2Vfx = null;
    // MILESTONE 4 — EffectComposer.dispose() only frees its own two ping-pong render targets and
    // internal copy pass, NOT the passes added to it — bloomPass owns several render targets of
    // its own (bright-pass + per-mip horizontal/vertical blur buffers) that leak without this.
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
    this.bloomPass.dispose();
    this.atmosphere.dispose();
    this.hexGeo.dispose();
    this.quadGeo.dispose();
    this.backdropGeometry.dispose();
    this.backdropMaterial.dispose();
    this.backdropTexture?.dispose();
    this.fallbackMaterial.dispose();
    this.groundAO.dispose();
    this.fogMask.dispose();
    this.proxyBox.dispose();
    this.proxyCylinder.dispose();
    this.proxyMaterial.dispose();
    for (const mat of this.materialCache.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    for (const mat of this.decorMatCache.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    // decorShadowMatCache/unit shadowMaterial share their texture with decorMatCache/unitTexCache
    // (see decorShadowMaterialFor's/the shadow-material creation's own comment) — the texture is
    // already disposed above/below, so only the material itself needs disposing here.
    for (const mat of this.decorShadowMatCache.values()) mat.dispose();
    for (const tex of this.unitTexCache.values()) tex.dispose();
    for (const tex of this.glowTexCache.values()) tex.dispose();
    this.webMat?.map?.dispose();
    this.webMat?.dispose();
    this.webMatDim?.dispose();
    for (const entry of this.unitEntries.values()) {
      entry.material.dispose();
      entry.glowMaterial.dispose();
      entry.shadowMaterial.dispose();
      entry.contactMaterial.dispose();
    }
    for (const mat of this.overlayMatCache.values()) mat.dispose();
    for (const glow of this.overlayGlowPool) (glow.material as THREE.SpriteMaterial).dispose();
    this.activeTurnGlowMaterial.dispose();
    this.activeTurnGlowTexture.dispose();
    this.contactShadowTexture.dispose();
    this.decorContactMaterial.dispose();
    this.renderer.dispose();
  }
}
