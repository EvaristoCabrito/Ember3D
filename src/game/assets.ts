import { DECORATIONS, decorationImage, decorationImageWebp, decorationSideFile } from "./data";
import type { GameArt, SpriteId, TerrainId } from "./types";

// Number of art variants available per terrain, e.g. plains001.png / plains002.png.
// Index 0 (the "001" file) is what every mission renders with unless it names a
// different variant in Mission.tileVariants — keep it as the tile that's safe
// for existing maps.
export const TILE_VARIANT_COUNT: Record<TerrainId, number> = {
  plains: 43,
  woods: 10,
  ruins: 8,
  water: 23,
  ember: 6,
  hill: 5,
  flame: 4,
  column: 3,
  nave: 10,
  barricade: 1,
  door: 1,
  void: 1,
  // The Icelands section keeps legacy snow variants first, then the 12 supplied
  // cold-ground tiles (snow004–snow015) so saved maps retain their old indices.
  snow: 18,
};

/** Append-only terrain set: previous saved-map indices keep their exact artwork. */
export const HEX_GROUND_001: Partial<Record<TerrainId, { variant: number; file: string }>> = {
  water: { variant: 22, file: "hex-ground-001-agua" },
  woods: { variant: 9, file: "hex-ground-001-bosque" },
  ember: { variant: 5, file: "hex-ground-001-brasa" },
  flame: { variant: 3, file: "hex-ground-001-chama" },
  plains: { variant: 38, file: "hex-ground-001-city" },
  hill: { variant: 4, file: "hex-ground-001-colina" },
  column: { variant: 2, file: "hex-ground-001-coluna" },
  nave: { variant: 2, file: "hex-ground-001-laje" },
  ruins: { variant: 7, file: "hex-ground-001-ruinas" },
  snow: { variant: 15, file: "hex-ground-001-neve" },
};

/** The art file a tile variant paints with, without path or cache-buster — "woods002".
 * Two variants of the same terrain differ only in art, so this is the only way to tell
 * from a painted map which of them a cell is actually using. */
export function tileVariantName(id: TerrainId, variant: number): string {
  if (id === "nave" && variant === 9) return "hex-ground-002-cave-crystals";
  if (id === "nave" && variant >= 3 && variant <= 8) {
    return `hex-ground-001-${["temple-limestone", "temple-basalt", "dungeon-flagstone", "dungeon-brick", "cave", "cave-crystals"][variant - 3]}`;
  }
  if (id === "plains" && variant === 41) return "hex-ground-001-high-grass";
  if (id === "plains" && variant === 42) return "hex-ground-001-dark-plains";
  if (id === "snow" && variant === 16) return "hex-ground-001-tundra";
  if (id === "snow" && variant === 17) return "hex-ground-001-tundra-snow";
  if (id === "plains" && variant === 39) return "hex-ground-001-planicie";
  if (id === "plains" && variant === 40) return "hex-ground-001-madeira";
  const ground = HEX_GROUND_001[id];
  if (ground && variant === ground.variant) return ground.file;
  // New ground materials are inserted ahead of the legacy plains without renaming
  // their on-disk files, so saved maps keep their original art available.
  if (id === "plains") {
    if (variant === 0) return "plains016";
    if (variant === 1) return "plains015";
    if (variant === 2) return "plains001";
    if (variant === 15) return "plains018";
    // Keep the old saved-map index valid while retiring that City tile.
    if (variant === 22) return "plains024";
    // 16-20 are the five existing ground variants; 21-37 are the City indices, with 22 retired.
    // These ranges continue the numbered art files at plains019.
    if (variant >= 16 && variant <= 37) return `plains${String(variant + 3).padStart(3, "0")}`;
    return `plains${String(variant).padStart(3, "0")}`;
  }
  if (id === "water" && variant === 0) return "water023";
  if (id === "woods") {
    if (variant === 0) return "woods005";
    if (variant === 1) return "woods006";
    if (variant === 6) return "woods007";
    if (variant === 7) return "woods009";
    if (variant === 8) return "woods010";
    return `woods${String(variant - 1).padStart(3, "0")}`;
  }
  if (id === "hill") return `hill${String(variant + 4).padStart(3, "0")}`;
  if (id === "ruins") {
    if (variant === 0) return "ruins005";
    if (variant <= 4) return `ruins${String(variant).padStart(3, "0")}`;
    return `ruins${String(variant + 1).padStart(3, "0")}`;
  }
  return `${id}${String(variant + 1).padStart(3, "0")}`;
}

export function isHexGroundVariant(id: TerrainId, variant: number): boolean {
  return id !== "column" && (HEX_GROUND_001[id]?.variant === variant || (id === "plains" && variant >= 39 && variant <= 42) || (id === "snow" && (variant === 16 || variant === 17)) || (id === "nave" && variant >= 3 && variant <= 9));
}

export function tileVariantSrc(id: TerrainId, variant: number): string {
  return `/game/tiles/${tileVariantName(id, variant)}.png?v=66`;
}
/** Framed portrait art for the sprites that have one; every other sprite falls back to its
 * own first battle-frame, unframed. */
const HERO_PORTRAIT: Partial<Record<string, string>> = {
  defaultWarrior: "/game/portraits/kael.png?v=2",
  kaelFinal: "/game/portraits/kael-final-face-001.jpg?v=1",
  neera: "/game/portraits/neera-v2.jpg",
  voss: "/game/portraits/voss.png",
  salazar: "/game/portraits/salazar.png",
  aldric: "/game/portraits/aldric-profile-001.jpg?v=3",
  defaultLancer: "/game/portraits/aldric-profile-001.jpg?v=3",
  sandoval: "/game/portraits/sandoval-001.jpg?v=1",
  conjurer: "/game/portraits/conjurer-002.png?v=2",
  // Malrec is the named Conjurer hero: always use his face portrait, never a battle sprite frame.
  malrec: "/game/portraits/conjurer-002.png?v=2",
  theButcher: "/game/portraits/the-butcher-portrait-001.jpg?v=1",
  // Familiar Titã uses a direct crop of the player's supplied concept art; no art is generated.
  familiar3: "/game/portraits/familiar3-profile.jpeg?v=3",
  // Inn and village NPCs. Keyed by SPRITE, so every place a unit or dialog line shows a face
  // (dialogs, the unit inspect popup, the footer portrait, the map party list) picks the right
  // portrait from the NPC's sprite automatically; nothing per-NPC has to be wired again.
  // Files keep the names they were supplied with. Brue, Mudo and A Hóspede use the Adega photos.
  brue: "/game/portraits/brue.png",
  mudinho: "/game/portraits/mudo.png",
  crazyLady: "/game/portraits/porao.png",
  beberrao: "/game/portraits/c471772d-7d79-46bf-be64-77a6b662b929.jpg", // Regular
  shadyPatron: "/game/portraits/1beca9c9-789c-4b44-8930-c53b88c982ac.jpg", // O Encapuzado
  soupLady: "/game/portraits/101b6fe6-9fc2-4416-b8c7-642d3699c4f4.jpg", // A Velha
  peasant1: "/game/portraits/d8def2e7-59bb-42cc-8a8e-36c7df1c22fb.jpg", // Lavrador
  breadLady: "/game/portraits/738c99c0-0bfa-472c-ab94-d16b91d2b2d8.jpg", // Padeira
  oldHealer: "/game/portraits/29ef0f7e-4b87-4c0d-a55f-f16fb5a6a1ea.jpg", // Ancião
  woodsman: "/game/portraits/9c0b071f-d203-4ef3-9c46-e4dac49dd975.jpg", // Lenhador
  villagerF1: "/game/portraits/1d7928dc-3fec-4d11-92d3-bd7a2d1637fb.jpg", // Moça
};

/** The one place the portrait-or-sprite-frame fallback lives — used by the unit inspect
 * popup, the footer portrait button, and DialogOverlay. Every "framed" portrait renders in
 * the same fixed box via object-cover, so the frame is always the same size regardless of
 * the source image's own dimensions. */
export function portraitFor(sprite: SpriteId): { src: string; framed: boolean; position?: string } {
  const framed = HERO_PORTRAIT[sprite];
  return framed
    ? { src: framed, framed: true }
    : { src: `/game/sprites/${sprite}/1.png`, framed: false };
}

const TILES = Object.keys(TILE_VARIANT_COUNT) as TerrainId[];
const SPRITES: SpriteId[] = ["defaultWarrior", "neera", "voss", "salazar", "aldric", "malrec", "defaultLancer", "soldier", "brigand", "captain", "sorcerer", "horror", "Asherah", "pikeman", "wardog", "troll", "troll2", "RoccoTheBird", "morvenian-wolf", "mordavian-wolf", "mordavian-wolf-final", "punisher", "theButcher", "birolho", "birolho2", "birolho3", "BirolhoLegs", "BirolhoLegs2", "familiar", "familiar2", "familiar3", "familiar4", "zombie", "zombie2", "swamp-blue-calf", "ancient-golem", "lancer", "sandoval", "kaelFinal", "kaelEarly", "conjurer", "cultist-v2", "archerRecruit", "mageRecruit", "healerRecruit", "beberrao", "breadLady", "brue", "crazyLady", "mudinho", "oldHealer", "peasant1", "shadyPatron", "soupLady", "villagerF1", "woodsman"];

// Real load progress for the title screen's loading bar: every image request counts once when it
// is asked for and once when it settles (loaded or failed). loadGameArt requests its batches one
// after another, so "requested so far" alone would reach ~100% after the first batch; the ratio is
// taken against the whole expected total instead — the count the last full load actually made
// (remembered in localStorage), or ART_TOTAL_FALLBACK (measured) on a first-ever visit.
const ART_TOTAL_KEY = "ember.artLoadTotal";
const ART_TOTAL_FALLBACK = 409;
function rememberedArtTotal(): number {
  try {
    const n = Number(localStorage.getItem(ART_TOTAL_KEY));
    return Number.isFinite(n) && n > 0 ? n : ART_TOTAL_FALLBACK;
  } catch {
    return ART_TOTAL_FALLBACK;
  }
}
const artExpected = rememberedArtTotal();
let artRequested = 0;
let artSettled = 0;
const artListeners = new Set<() => void>();
function artChanged(): void {
  for (const listener of artListeners) listener();
}
export function subscribeArtProgress(listener: () => void): () => void {
  artListeners.add(listener);
  return () => {
    artListeners.delete(listener);
  };
}
/** 0..1 share of the whole expected image load that has settled so far. */
export function artProgress(): number {
  return artSettled / Math.max(artRequested, artExpected);
}

const LOAD_POOL = 8;
let loadActive = 0;
const loadWait: (() => void)[] = [];

function acquireLoad(): Promise<void> {
  if (loadActive < LOAD_POOL) {
    loadActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => loadWait.push(() => {
    loadActive++;
    resolve();
  }));
}

function releaseLoad(): void {
  loadActive--;
  const next = loadWait.shift();
  if (next) next();
}

function spriteFrameSrc(id: SpriteId, frame: string, cacheBust = ""): string {
  // Conjurer's active art is kept as a complete, source-preserved serial. Talk drives idle; the former Idle sheet drives casting.
  const directory = id === "conjurer" ? "conjurer/conjurer-complete-003" : id === "sandoval" ? "sandoval/sandoval-complete-001" : id === "kaelFinal" ? "Kael_Final/kael-final-002" : id === "kaelEarly" ? "kael" : id === "defaultWarrior" ? "kael-v2" : id;
  return `/game/sprites/${directory}/${frame}.png${cacheBust}`;
}
function loadImage(src: string): Promise<HTMLImageElement> {
  artRequested++;
  artChanged();
  return acquireLoad().then(
    () =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const fail = () => reject(new Error(`Falha ao carregar ${src}`));
        const t = window.setTimeout(() => {
          done();
          fail();
        }, 20000);
        const done = () => {
          window.clearTimeout(t);
          releaseLoad();
          artSettled++;
          artChanged();
        };
        img.onload = () => {
          done();
          resolve(img);
        };
        img.onerror = () => {
          done();
          fail();
        };
        img.src = src;
      }),
  );
}

// Sprites cut as a 12-frame idle rather than the 4-frame default — the heroes, the two
// big horrors, and the creatures cut from reference video (familiar, familiar2, ancient
// golem). loadGameArt rejects on any missing file, so this set and what is on disk have to
// move together.
const HERO_IDLE = new Set<SpriteId>(["defaultWarrior", "neera", "voss", "salazar", "aldric", "defaultLancer", "horror", "Asherah", "familiar", "familiar2", "ancient-golem", "lancer", "sandoval", "kaelFinal", "kaelEarly", "conjurer", "malrec", "archerRecruit", "mageRecruit", "healerRecruit"]);

/** arrow-002.png is a moody product photo shot on black with no alpha channel; it was
 * originally drawn with a screen/lighter blend to fake-hide that background, which only
 * works when composited straight onto opaque battlefield pixels. renderUnitsAndOverlays
 * draws projectiles onto their own transparent per-frame canvas (see BattleCanvas), so
 * blending against nothing just paints a solid near-black square. Bake real alpha from
 * the image's own luminance once at load time so it composites correctly on any layer. */
function deriveAlphaFromBlack(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const c = canvas.getContext("2d")!;
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    px[i + 3] = Math.max(px[i], px[i + 1], px[i + 2]);
  }
  c.putImageData(data, 0, 0);
  return canvas;
}
// Attack cuts, per sprite: how many atk-*.png frames are on disk, and the cache-bust the
// set was last republished under. attackPose spreads whatever count it finds across the
// lunge/hit/recover stages, so a set only has to be listed here to animate.
const ATTACK_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  // The generic/default warrior look (CLASSES.swordsman's own sprite), its own distinct
  // on-disk cut (kael-v2 — an old internal folder name, kept as-is on disk) — the MC
  // himself is a different unit entirely and plays as kaelFinal instead.
  defaultWarrior: { n: 12, bust: "?v=kael-v2" },
  kaelEarly: { n: 12, bust: "?v=kael-early" },
  neera: { n: 36, bust: "" },
  voss: { n: 4, bust: "" },
  salazar: { n: 4, bust: "" },
  // Generic-enemy "alter" sprites (see the SpriteId comment in types.ts) — same file
  // shape as the hero folder they started as a copy of, since they're literally that
  // copy for now.
  archerRecruit: { n: 4, bust: "" },
  mageRecruit: { n: 4, bust: "" },
  healerRecruit: { n: 4, bust: "" },
  aldric: { n: 36, bust: "?v=aldric-final-001" },
  // Malrec's own personally-named slot, seeded from a clean copy of the finished
  // conjurer 36-frame sheet (see HERO_SPRITE_BY_NAME in engine.ts) — never the old
  // broken "malrec" sheet, which was permanently deleted.
  malrec: { n: 36, bust: "" },
  defaultLancer: { n: 5, bust: "?v=sheet2" },
  familiar: { n: 8, bust: "?v=6" },
  // Familiar 2 — the crouch/lunge strike cut from reference video (see CAST_FRAMES and
  // WALK_FRAMES below for its casting and walk cuts).
  familiar2: { n: 12, bust: "" },
  "ancient-golem": { n: 32, bust: "" },
  "morvenian-wolf": { n: 6, bust: "" },
  // Mordavian Wolf — the bigger cousin, sliced from its own reference sheet; the row
  // labeled "8 frames" only actually has 7 distinct poses (two columns share the "07" tag,
  // none reads "02"-"05" — a defect in that sheet's own generation, not a slicing choice).
  "mordavian-wolf": { n: 7, bust: "" },
  birolho: { n: 4, bust: "" },
  birolho2: { n: 4, bust: "" },
  // BirolhoLegs has no ATT footage of its own — atk-*.png is a copy of its cast cut.
  BirolhoLegs: { n: 32, bust: "" },
  BirolhoLegs2: { n: 32, bust: "" },
  troll2: { n: 32, bust: "" },
  RoccoTheBird: { n: 32, bust: "" },
  // Zombie ATT: video 2 from 5 s, mirrored so the whole strike faces right (see its README).
  zombie: { n: 32, bust: "" },
  zombie2: { n: 10, bust: "" },
  familiar4: { n: 32, bust: "" },
  "mordavian-wolf-final": { n: 32, bust: "" },
  punisher: { n: 4, bust: "" },
  // The Butcher — real 36-frame axe swing, a distinct unit/sprite from punisher/Carrasco
  // above (see WALK_FRAMES.theButcher below for the matching walk cut).
  theButcher: { n: 36, bust: "?v=the-butcher-001" },
  lancer: { n: 6, bust: "?v=3" },
  sandoval: { n: 6, bust: "?v=sandoval-complete-001" },
  kaelFinal: { n: 36, bust: "?v=kael-final-002" },
  conjurer: { n: 36, bust: "?v=conjurer-complete-003" },
  "cultist-v2": { n: 36, bust: "" },
  // Familiar 3's primary attack cut — see ATTACK2_FRAMES below for its alternate cut,
  // which Unit.idleAlt alternates into turn to turn (same flip as Malrec's idles2).
  familiar3: { n: 36, bust: "" },
};

// Cast pose: cast-*.png, same shape as the attack table — a sprite absent from here falls
// back to its attacks cut (the melee swing) for a spell just like it always did before this
// existed.
const CAST_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  birolho: { n: 3, bust: "" },
  birolho2: { n: 3, bust: "" },
  birolho3: { n: 18, bust: "" },
  // 32 authored cast frames + 12 closing frames (the unfurl played in reverse) so he folds
  // his arms back in after the charge, the same way his ATT ends.
  BirolhoLegs: { n: 44, bust: "" },
  BirolhoLegs2: { n: 32, bust: "" },
  // Neera's supplied Special cut plays for spell-type archer skills; physical attacks
  // stay on her dedicated ATT cut above.
  neera: { n: 36, bust: "" },
  // The spell cast intentionally uses the former Idle sheet; ATT remains the physical attack.
  conjurer: { n: 36, bust: "?v=conjurer-complete-003" },
  // Malrec's own cast-*.png — a copy of conjurer's same dedicated cast sequence.
  malrec: { n: 36, bust: "" },
  // Aldric's dedicated skill pose — plays only for his spell-typed pike skills (Piercing
  // Thrust, Sweep, ...), never for a plain attack, which stays on the ATT cut.
  aldric: { n: 36, bust: "?v=aldric-final-001" },
  "cultist-v2": { n: 36, bust: "" },
  // Familiar 2's real rear-up/charge/beam-release windup — a distinct animation from its
  // ATT cut (the crouch/lunge), not a fallback.
  familiar2: { n: 24, bust: "" },
  RoccoTheBird: { n: 32, bust: "" },
  // Familiar 3's spellcasting windup (cast-*.png) — plays for its Fireball cast only
  // (attackPose falls back to `attacks` for a plain melee swing); see ATTACK_FRAMES/
  // ATTACK2_FRAMES above for its two melee attack cuts.
  familiar3: { n: 36, bust: "" },
};

// Familiar 3's second, distinct attack cut (atk2-*.png) — the first case of a class having
// more than one attack cut, same "second pool, same idleAlt flip" shape as Malrec's idles2
// but for the attack pool instead of idle (see GameArt.attacks2's doc comment).
const ATTACK2_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  familiar3: { n: 36, bust: "" },
};

// Short-range (off-hand dagger/katar) attack cut — see GameArt.attacksShort.
const ATTACK_SHORT_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  neera: { n: 36, bust: "" },
};

// Left-facing counterpart to a handful of the CAST_FRAMES cuts above — same idea as
// attacksLeft/walksLeft: a sprite here skips the mirrored flip and plays this set instead
// when facing === -1.
const CAST_DIR_LEFT: SpriteId[] = ["aldric"];

// Counter pose: counter-*.png, same shape as the attack table — a sprite absent from here
// falls back to its attacks cut (the same swing used for a normal attack) for the
// defender's counter stages, same as every sprite did before this existed.
const COUNTER_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  theButcher: { n: 36, bust: "?v=the-butcher-counter-001" },
};

// Walk cycles: move-*.png, same shape as the attack table. A sprite absent from here has
// no walk cut and falls back to its idle loop played faster, as every sprite used to.
const WALK_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  familiar: { n: 8, bust: "?v=6" },
  // Right-facing cut; see the dedicated walksLeft.familiar2 load below for its own
  // authored left-facing cut (real distinct footage, not the CSS mirror every other
  // sprite absent from walksLeft falls back to).
  familiar2: { n: 12, bust: "" },
  // Shot facing left, the same "opposite of the usual facing-1-as-drawn convention" case
  // as the familiar — see computeUnitVisual's neeraWalkReversed in engine.ts, which mirrors
  // this pool for rightward travel and draws it as-is for leftward travel (backwards from
  // every other sprite's own walk pool). A plain CSS mirror-on-left-only treatment (as if
  // this were right-facing footage) used to read as walking backwards in BOTH directions.
  neera: { n: 36, bust: "" },
  "ancient-golem": { n: 32, bust: "" },
  aldric: { n: 36, bust: "?v=aldric-final-001" },
  defaultLancer: { n: 6, bust: "?v=sheet2" },
  lancer: { n: 6, bust: "?v=3" },
  sandoval: { n: 6, bust: "?v=sandoval-complete-001" },
  // One authored right-facing walk. The renderer mirrors it for left-facing movement.
  // defaultWarrior (the generic/default warrior look) has no move-*.png cut of its own —
  // it falls back to its idle loop played faster, like every sprite absent from this table.
  kaelFinal: { n: 36, bust: "?v=kael-final-002" },
  conjurer: { n: 36, bust: "?v=conjurer-complete-003" },
  // Real authored Walk Right footage replaced the old cut here — bumped so browsers
  // holding the old move-*.png in cache actually fetch the new art (the old cut lives on
  // as idle2-*.png, his alternate-turn idle; see idles2.malrec above). Mirrored via the
  // regular CSS flip for left-facing movement, same as any sprite with one authored
  // direction — see the walksLeft.malrec comment below for why.
  malrec: { n: 36, bust: "?v=malrec-walk-002" },
  birolho3: { n: 12, bust: "" },
  // Walk Left footage only; move-*.png is its mirror, and the renderer mirrors this pool
  // for left-facing movement like any sprite with one authored direction.
  BirolhoLegs: { n: 32, bust: "" },
  BirolhoLegs2: { n: 32, bust: "" },
  // Walk Left footage only; move-*.png is its mirror, same as BirolhoLegs above.
  troll2: { n: 32, bust: "" },
  RoccoTheBird: { n: 32, bust: "" },
  // Zombie: side-on walk from video 2 (2.05-3.9 s, two real strides), 32 frames like every
  // other long sheet; move-*.png is its mirror and the renderer mirrors it back for
  // left-facing movement.
  zombie: { n: 32, bust: "" },
  zombie2: { n: 12, bust: "" },
  // Right-facing dash (the video has no walk loop); the renderer mirrors it for leftward travel.
  familiar4: { n: 32, bust: "" },
  // Mordavian Wolf Final: right-facing walk (mirrored from the Walk Left footage); the
  // renderer mirrors it back for leftward travel.
  "mordavian-wolf-final": { n: 32, bust: "" },
  // Right-facing cut; see the dedicated walksLeft.theButcher load below for its own
  // authored left-facing cut (not the CSS mirror every other sprite here falls back to).
  theButcher: { n: 36, bust: "?v=the-butcher-001" },
  // Right-facing cut; see the dedicated walksLeft["cultist-v2"] load below.
  "cultist-v2": { n: 36, bust: "" },
  familiar3: { n: 36, bust: "" },
  // Right-facing cut, sliced from the Mordavian Puppy reference sheet's WALK RIGHT row;
  // see the dedicated walksLeft["morvenian-wolf"] load below for its own authored
  // left-facing cut (real distinct footage, 7 frames vs this row's 6 — not the CSS mirror
  // every other sprite absent from walksLeft falls back to).
  "morvenian-wolf": { n: 6, bust: "" },
  // Mordavian Wolf — one authored cut (its sheet has no separate left row like the
  // Puppy's); the renderer mirrors it for left-facing movement, same as most sprites here.
  "mordavian-wolf": { n: 8, bust: "" },
};

const DIR_LEFT: SpriteId[] = ["aldric", "defaultLancer", "lancer", "sandoval"];

// Up/down walk cycles (move-up-*.png / move-down-*.png), opt-in per sprite — see
// GameArt.walksUp/walksDown. A sprite with only one of the two keeps its left/right walk
// for the other direction.
const WALK_UP_DOWN_FRAMES: Partial<Record<SpriteId, { up?: number; down?: number; bust: string }>> = {
  BirolhoLegs: { up: 32, down: 32, bust: "" },
  "mordavian-wolf-final": { up: 32, down: 32, bust: "" },
  troll2: { up: 32, down: 32, bust: "" },
};

// Cosmetic alternate walk (see GameArt.walks2): its own right- and left-facing cuts.
const WALK2_FRAMES: Partial<Record<SpriteId, { n: number; bust: string }>> = {
  familiar3: { n: 36, bust: "" },
};

type SpritePoolKey = "sprites" | "attacks" | "attacks2" | "attacksShort" | "attacksLeft" | "casts" | "castsLeft" | "counters" | "countersLeft" | "walks" | "walksLeft" | "idles" | "idles2" | "walkDirs" | "walksUp" | "walksDown" | "walks2" | "walksLeft2";
const SPRITE_POOL_KEYS: SpritePoolKey[] = ["sprites", "attacks", "attacks2", "attacksShort", "attacksLeft", "casts", "castsLeft", "counters", "countersLeft", "walks", "walksLeft", "idles", "idles2", "walkDirs", "walksUp", "walksDown", "walks2", "walksLeft2"];

/** Loads every pool one sprite contributes to GameArt (idle, attack, cast, walk, ...) — the
 * same files, frame counts and cache-busts loadGameArt used to load for every sprite up front. */
async function loadSpritePools(id: SpriteId): Promise<Partial<Record<SpritePoolKey, unknown>>> {
  const cut = (n: number, frame: (i: number) => string, bust: string) =>
    Promise.all(Array.from({ length: n }, (_, i) => loadImage(spriteFrameSrc(id, frame(i + 1), bust))));
  const pools: Partial<Record<SpritePoolKey, unknown>> = {};
  const jobs: Promise<void>[] = [];
  const put = (key: SpritePoolKey, job: Promise<unknown>) => {
    jobs.push(job.then((value) => {
      pools[key] = value;
    }));
  };
  const n = id === "zombie2" ? 11 : id === "neera" || id === "conjurer" || id === "kaelFinal" || id === "aldric" || id === "cultist-v2" || id === "malrec" || id === "familiar3" ? 36 : id === "sandoval" || id === "mordavian-wolf" ? 8 : id === "birolho2" ? 18 : id === "birolho3" ? 12 : id === "BirolhoLegs" || id === "BirolhoLegs2" || id === "troll2" || id === "RoccoTheBird" || id === "zombie" || id === "ancient-golem" || id === "familiar4" || id === "mordavian-wolf-final" ? 32 : HERO_IDLE.has(id) ? 12 : 4;
  const cacheBust = id === "troll" ? "?v=11" : id === "Asherah" ? "?v=3" : id === "familiar" ? "?v=6" : id === "aldric" ? "?v=aldric-final-001" : id === "defaultLancer" ? "?v=sheet2" : id === "lancer" ? "?v=3" : id === "sandoval" ? "?v=sandoval-complete-001" : id === "kaelFinal" ? "?v=kael-final-002" : id === "kaelEarly" ? "?v=kael-early" : id === "defaultWarrior" ? "?v=kael-v2" : id === "conjurer" ? "?v=conjurer-complete-003" : "";
  put("sprites", cut(n, (i) => (id === "conjurer" ? `talk-${i}` : `${i}`), cacheBust));
  const atk = ATTACK_FRAMES[id];
  if (atk) put("attacks", cut(atk.n, (i) => `atk-${i}`, atk.bust));
  const atk2 = ATTACK2_FRAMES[id];
  if (atk2) put("attacks2", cut(atk2.n, (i) => `atk2-${i}`, atk2.bust));
  const short = ATTACK_SHORT_FRAMES[id];
  if (short) put("attacksShort", cut(short.n, (i) => `atk-short-${i}`, short.bust));
  const cast = CAST_FRAMES[id];
  if (cast) put("casts", cut(cast.n, (i) => (id === "conjurer" ? `${i}` : `cast-${i}`), cast.bust));
  if (cast && CAST_DIR_LEFT.includes(id)) put("castsLeft", cut(cast.n, (i) => `cast-left-${i}`, cast.bust));
  const counter = COUNTER_FRAMES[id];
  if (counter) put("counters", cut(counter.n, (i) => `counter-${i}`, counter.bust));
  const walk = WALK_FRAMES[id];
  if (walk) put("walks", cut(walk.n, (i) => `move-${i}`, walk.bust));
  if (DIR_LEFT.includes(id)) {
    const walkN = WALK_FRAMES[id]?.n ?? 6;
    const atkN = ATTACK_FRAMES[id]?.n ?? 5;
    const bust = id === "lancer" ? "?v=3" : id === "sandoval" ? "?v=sandoval-complete-001" : id === "aldric" ? "?v=aldric-final-001" : "?v=sheet2";
    put("walksLeft", cut(walkN, (i) => `move-left-${i}`, bust));
    put("attacksLeft", cut(atkN, (i) => `atk-left-${i}`, bust));
  }
  // The Butcher, Cultist V2, Familiar 2 and Familiar 3 each have their own authored
  // left-facing walk cut (same frame count as their right-facing one) but no dedicated
  // left-facing attack cut — their attack keeps mirroring the right-facing pool.
  if (walk && (id === "theButcher" || id === "cultist-v2" || id === "familiar2" || id === "familiar3")) put("walksLeft", cut(walk.n, (i) => `move-left-${i}`, walk.bust));
  // Mordavian Puppy's WALK LEFT row has 7 frames vs its right-facing row's 6.
  if (id === "morvenian-wolf") put("walksLeft", cut(7, (i) => `move-left-${i}`, ""));
  // Malrec's sliced move-left-*.png frames are deliberately unused: the render loop's usual
  // CSS mirror-flip of `walks.malrec` handles left-facing movement instead.
  // defaultWarrior (the generic/default warrior look) reads its own kael-v2 stand cut;
  // kaelEarly keeps the original kael-folder 36-frame stand cut. See CLASSES.swordsman vs
  // CLASSES.kaelEarly.
  if (id === "defaultWarrior") put("idles", Promise.all(Array.from({ length: 12 }, (_, i) => loadImage(`/game/sprites/kael-v2/stand-${i + 1}.png?v=kael-v2`))));
  if (id === "kaelEarly") put("idles", Promise.all(Array.from({ length: 36 }, (_, i) => loadImage(`/game/sprites/kael/stand-${i + 1}.png?v=kael-early`))));
  // Malrec's second idle loop: his original walk-right cut, kept on disk as idle2-*.png
  // (see GameArt.idles2 / Unit.idleAlt).
  if (id === "malrec") put("idles2", Promise.all(Array.from({ length: 36 }, (_, i) => loadImage(`/game/sprites/malrec/idle2-${i + 1}.png`))));
  const upDown = WALK_UP_DOWN_FRAMES[id];
  if (upDown?.up) put("walksUp", cut(upDown.up, (i) => `move-up-${i}`, upDown.bust));
  if (upDown?.down) put("walksDown", cut(upDown.down, (i) => `move-down-${i}`, upDown.bust));
  const walk2 = WALK2_FRAMES[id];
  if (walk2) {
    put("walks2", cut(walk2.n, (i) => `move2-${i}`, walk2.bust));
    put("walksLeft2", cut(walk2.n, (i) => `move2-left-${i}`, walk2.bust));
  }
  // walkDirs: kael-v2 has no walk-front/back/side cut, so defaultWarrior has no entry. The
  // Birolhos and the punisher have no side-on art (the idle/front frame stands in).
  // theButcher has real walk-cycle frames instead — walkDirs would take priority over them.
  const dirs = (front: string, back: string, side: string) =>
    Promise.all([loadImage(front), loadImage(back), loadImage(side)]).then(([f, b, s]) => ({ front: f, back: b, side: s }));
  if (id === "kaelEarly") put("walkDirs", dirs("/game/sprites/kael/walk-front.png?v=kael-early", "/game/sprites/kael/walk-back.png?v=kael-early", "/game/sprites/kael/walk-side.png?v=kael-early"));
  if (id === "birolho") put("walkDirs", dirs("/game/sprites/birolho/1.png", "/game/sprites/birolho/back.png", "/game/sprites/birolho/1.png"));
  if (id === "birolho2") put("walkDirs", dirs("/game/sprites/birolho2/1.png", "/game/sprites/birolho2/back.png", "/game/sprites/birolho2/1.png"));
  if (id === "punisher") put("walkDirs", dirs("/game/sprites/punisher/front.png", "/game/sprites/punisher/back.png", "/game/sprites/punisher/front.png"));
  await Promise.all(jobs);
  return pools;
}

const spriteLoads = new WeakMap<GameArt, Map<SpriteId, Promise<void>>>();

/** Loads one sprite's art into `art`, once — repeat calls share the same request. Every pool
 * lands at the same moment, so a unit never plays a half-loaded set; until then its
 * `art.sprites` entry is simply absent. A failed load is logged and not retried. */
export function requestSpriteArt(art: GameArt, id: SpriteId): Promise<void> {
  let loads = spriteLoads.get(art);
  if (!loads) spriteLoads.set(art, (loads = new Map()));
  const pending = loads.get(id);
  if (pending) return pending;
  const job = loadSpritePools(id).then(
    (pools) => {
      for (const [key, value] of Object.entries(pools)) (art[key as SpritePoolKey] as Record<string, unknown>)[id] = value;
    },
    (err) => console.error(`[art] sprite ${id} failed to load`, err),
  );
  loads.set(id, job);
  return job;
}

/** Loads every sprite a battle needs (see requestSpriteArt). */
export function ensureSpriteArt(art: GameArt, ids: Iterable<SpriteId>): Promise<void> {
  return Promise.all([...new Set(ids)].map((id) => requestSpriteArt(art, id))).then(() => undefined);
}

/** Drops every loaded sprite not in `keep`, so memory follows the current battle instead of
 * growing with every battle played. A dropped sprite reloads on demand (browser cache). */
export function releaseSpriteArt(art: GameArt, keep: Iterable<SpriteId>): void {
  const keepSet = new Set(keep);
  const loads = spriteLoads.get(art);
  if (!loads) return;
  for (const id of [...loads.keys()]) {
    if (keepSet.has(id)) continue;
    loads.delete(id);
    for (const key of SPRITE_POOL_KEYS) delete (art[key] as Record<string, unknown>)[id];
  }
}

export async function loadGameArt(): Promise<GameArt> {
  const tiles = {} as Record<TerrainId, HTMLImageElement[]>;
  await Promise.all(
    TILES.map(async (id) => {
      const n = TILE_VARIANT_COUNT[id];
      tiles[id] = await Promise.all(Array.from({ length: n }, (_, i) => loadImage(tileVariantSrc(id, i))));
    }),
  );
  const decorations = {} as Record<string, HTMLImageElement>;
  await Promise.all(
    Object.keys(DECORATIONS).map(async (id) => {
      // PNG first (every existing decoration ships as one); a prop supplied as WebP with real
      // alpha baked in (see decorationImage's own note) falls back to that automatically.
      decorations[id] = await loadImage(decorationImage(id))
        .catch(() => loadImage(decorationImageWebp(id)))
        .catch(() => {
          // Registered-but-not-shipped optional decor should not prevent the whole game from
          // loading; callers already skip images with naturalWidth 0.
          const placeholder = new Image();
          placeholder.width = 1;
          placeholder.height = 1;
          return placeholder;
        });
    }),
  );
  // Side-specific art is optional for most props. Explicitly preload the baked mirrored
  // variants for the tall posts so ThreeBattleRenderer can select them on its first build;
  // otherwise a lazy image could finish after the decor mesh cache had already settled on
  // the base-facing sprite.
  const mirroredPostIds = Object.keys(DECORATIONS).filter((id) => DECORATIONS[id]?.mirrorAlternate);
  await Promise.all(
    mirroredPostIds.map(async (id) => {
      const fileId = decorationSideFile(id, 3);
      decorations[fileId] = await loadImage(decorationImage(fileId)).catch(() => {
        const placeholder = new Image();
        placeholder.width = 1;
        placeholder.height = 1;
        return placeholder;
      });
    }),
  );
  // Unit sprites are NOT loaded here: every sprite pool starts empty and each battle loads
  // only the sprites its own units use (see ensureSpriteArt/requestSpriteArt above), instead
  // of every sprite in the game at the title screen.
  const sprites = {} as Record<SpriteId, HTMLImageElement[]>;
  const attacks: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const attacks2: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const attacksShort: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const casts: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const castsLeft: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const counters: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  // No sprite has a dedicated left-facing counter cut yet — every counters entry mirrors
  // via the regular flip, same as attacksLeft does for a sprite absent from that table.
  const countersLeft: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walks: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walksLeft: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const attacksLeft: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const impact = await Promise.all([1, 2, 3, 4].map((n) => loadImage(`/game/fx/impact-${n}.png`)));
  // v2: real alpha-cutout comet art (ball + trailing wisps), replacing the old flattened
  // black-background v1 that only ever worked by additive-blending the black away.
  const fireballCore = await loadImage("/game/fx/fireball-core-v2.png?v=1");
  const causticVenomCore = await loadImage("/game/fx/caustic-venom-core-v2.png?v=1");
  const arrowCore = deriveAlphaFromBlack(await loadImage("/game/fx/arrow-002.png?v=1"));
  const lightningCores = await Promise.all([
    loadImage("/game/fx/lightning-core-v1.png?v=1"),
    loadImage("/game/fx/lightning-core-v2.png?v=1"),
    loadImage("/game/fx/lightning-core-v3.png?v=1"),
  ]);
  const webfloor = await loadImage("/game/fx/webfloor.png?v=1");
  const backdrops: Record<string, HTMLImageElement> = {
    "frozen-tundra-crossing": await loadImage("/game/assets/frozen-tundra-background.jpg"),
    profundezas: await loadImage("/game/assets/profundezas-bg.jpg?v=2"),
    thebridge: await loadImage("/game/assets/thebridge-bg.jpg?v=1"),
    "wisp-forest": await loadImage("/game/assets/wisp-forest-bg.jpg"),
    "wisp-forest-2": await loadImage("/game/assets/wisp-forest-bg.jpg"),
    "wisp-forest-crossing": await loadImage("/game/assets/wisp-forest-bg.jpg"),
    // Cemitério dos Esquecidos (the grounds): aerial view of the snowed-in graveyard. Files keep
    // their original names, so the paths are percent-encoded (spaces, accents, the ✕).
    "cemiterio-esquecidos": await loadImage(encodeURI("/game/assets/CemiteryBackground.jpg")),
    // Câmara Profunda: the burial vault with the skylight.
    "cemiterio-esquecidos-cripta-2": await loadImage(encodeURI("/game/assets/2Cemitério dos Esquecidos — Câmara Profunda✕.jpg")),
    // A Estalagem do Osso Seco (the walkable Inn): the tavern interior behind the board.
    estalagem: await loadImage("/game/assets/INNbackground.jpg"),
    // As Profundezas Enevoadas (Misty Cave dungeon): the torch-lit cavern passage.
    "misty-cave-dungeon": await loadImage(encodeURI("/game/assets/As Profundezas EnevoadasBackground2.jpg")),
    // The other floors of the cemetery, each with its own picture (file names say which floor).
    "cemiterio-esquecidos-cripta": await loadImage(encodeURI("/game/assets/Andar 3Cemitério dos Esquecidos — Cripta✕.jpg")),
    "cemiterio-esquecidos-mausoleu": await loadImage(encodeURI("/game/assets/Andar 4Cemitério dos Esquecidos — Mausoléu✕.jpg")),
    "cemiterio-esquecidos-ruinas": await loadImage(encodeURI("/game/assets/Andar 5Cemitério dos Esquecidos — Ruínas Submersas.jpg")),
    "random-encounter-1": await loadImage("/game/assets/random-encounter-1-bg.jpg"),
    "random-encounter-2": await loadImage("/game/assets/random-encounter-2-bg.jpg"),
    "random-encounter-4": await loadImage("/game/assets/random-encounter-4-bg.jpg"),
    "random-encounter-5": await loadImage("/game/assets/random-encounter-5-bg.jpg"),
    "random-encounter-8": await loadImage("/game/assets/random-encounter-8-bg.jpg"),
    // O Vau's campaign battlefield has its own ash-river vista. Keep Vau Raso on the earlier
    // backdrop below: its road encounter is a separate place and should not inherit this scene.
    vau: await loadImage("/game/assets/vau-1-bg.jpg"),
    "random-encounter-6": await loadImage("/game/assets/vau-bg.jpg"),
    aldeia: await loadImage("/game/assets/aldeia-bg.jpg"),
    bosque: await loadImage("/game/assets/bosque-bg.jpg"),
  };
  const idles: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const idles2: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walksUp: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walksDown: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walks2: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walksLeft2: Partial<Record<SpriteId, HTMLImageElement[]>> = {};
  const walkDirs: GameArt["walkDirs"] = {};
  try {
    localStorage.setItem(ART_TOTAL_KEY, String(artRequested));
  } catch {
    // No storage: the next load just falls back to ART_TOTAL_FALLBACK.
  }
  return { tiles, decorations, sprites, attacks, attacks2, attacksShort, attacksLeft, casts, castsLeft, counters, countersLeft, walks, walksLeft, idles, idles2, walkDirs, walksUp, walksDown, walks2, walksLeft2, impact, fireballCore, causticVenomCore, arrowCore, lightningCores, webfloor, backdrops };
}
