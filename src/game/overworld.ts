import { statsFor } from "./data";
import { missionsForLocation } from "./mapstore";
import { cubeRound, cubeToOddr, hexNeighbors, key, oddrToCube } from "./pathfinding";
import type { ClassId, Point, SaveData, WorldLocation } from "./types";

/** RPG map only: the hidden hex grid laid over the world-map image. The renderer never
 * draws this — it only ever asks `neighborsOf` the party's current hex for what's
 * clickable, and `hexToWorld` for where to draw a dot. Coordinates are odd-r offset,
 * same convention pathfinding.ts already uses for the battle grid, just a separate and
 * much coarser grid with its own pixel scale. */

/** Hex "radius" in percent of the world-map image's width/height. Chosen so the existing
 * WORLD_LOCATIONS (spread roughly 12-86% x, 9-80% y) land several hex-steps apart, giving
 * travel room instead of every location being a single step from the next. */
const OVERWORLD_HEX_SIZE = 5;

const SQRT3 = Math.sqrt(3);

/** World-map percent coordinate -> nearest hex, via the standard pointy-top axial/pixel
 * conversion (redblobgames), reusing this project's own cube rounding and axial->offset
 * conversion instead of reinventing either. */
export function worldToHex(xPct: number, yPct: number): Point {
  const q = ((SQRT3 / 3) * xPct - (1 / 3) * yPct) / OVERWORLD_HEX_SIZE;
  const r = ((2 / 3) * yPct) / OVERWORLD_HEX_SIZE;
  const c = cubeRound(q, r, -q - r);
  return cubeToOddr(c.q, c.r);
}

/** Inverse of worldToHex — a hex's own pixel center, in the same percent space. */
export function hexToWorld(col: number, row: number): { x: number; y: number } {
  const { q, r } = oddrToCube(col, row);
  const x = OVERWORLD_HEX_SIZE * SQRT3 * (q + r / 2);
  const y = OVERWORLD_HEX_SIZE * 1.5 * r;
  return { x, y };
}

/** The only notion of adjacency the RPG map is allowed to use. */
export function neighborsOf(col: number, row: number): Point[] {
  return hexNeighbors(col, row);
}

export function isNeighbor(a: Point, b: Point): boolean {
  return neighborsOf(a.x, a.y).some((n) => n.x === b.x && n.y === b.y);
}

/** Every named location, keyed by its hex — built from whatever location list the map is
 * currently showing (the editor can move locations, same as the classic map already
 * tolerates), not a fixed snapshot. Anything not in this map is open wild ground. */
export function locationsByHex(locations: WorldLocation[]): Map<string, WorldLocation> {
  const out = new Map<string, WorldLocation>();
  for (const loc of locations) {
    const h = worldToHex(loc.x, loc.y);
    out.set(key(h.x, h.y), loc);
  }
  return out;
}

export function locationAt(locations: WorldLocation[], col: number, row: number): WorldLocation | undefined {
  return locationsByHex(locations).get(key(col, row));
}

/** A location past its (opt-in, currently unset on everything) deadline — purely derived
 * from the day clock, never stored, so it can't drift out of sync with it. */
export function locationExpired(location: WorldLocation, gameClock: number): boolean {
  return typeof location.deadlineDay === "number" && gameClock > location.deadlineDay;
}

/** Flat share of missing HP a unit recovers per day traveled, so long as the party ate
 * that day (see `fed` in stepOverworld). */
const RECOVERY_PCT = 0.08;
/** Chance a step onto open wild ground (no location) triggers a text encounter. */
const ENCOUNTER_CHANCE = 0.18;
/** Consecutive unfed days before Hungry actually kicks in — the grace period named in
 * the spec ("após 3 dias sem comida"). */
const HUNGER_GRACE_DAYS = 3;
/** Stat penalty added per day past the grace period, capped below. */
const HUNGER_PENALTY_PER_DAY = 0.1;
/** Cap on the hunger penalty — "chegando em 90% ele fica inconsciente." */
const HUNGER_PENALTY_MAX = 0.9;

const HERO_BASE_CLASS: Record<string, ClassId> = {
  Kael: "swordsman",
  Neera: "archer",
  Voss: "mage",
  Salazar: "healer",
};

function maxHpFor(save: SaveData, hero: string): number {
  const classId = (save.promotions[hero] as ClassId | undefined) ?? HERO_BASE_CLASS[hero];
  if (!classId) return 0;
  return statsFor(classId, save.levels[hero] ?? 1).hp;
}

/** The party's current hunger stat penalty (0..0.9), purely derived from hungerStreak —
 * same principle as locationExpired: never cached, so it can't drift out of sync with
 * the streak that drives it. Shared by the battle roster builder and the status-sheet
 * condition text so neither can compute a different number than the other. */
export function hungerPenaltyFor(hungerStreak: number): number {
  const daysPast = Math.max(0, hungerStreak - HUNGER_GRACE_DAYS);
  return Math.min(HUNGER_PENALTY_MAX, daysPast * HUNGER_PENALTY_PER_DAY);
}

export interface OverworldEvent {
  kind: "encounter" | "hungry";
  text: string;
}

const ENCOUNTERS: { text: string; rations?: number; ember?: number }[] = [
  { text: "Um bando de corvos assusta a coluna. Parte das rações se perde na correria.", rations: -2 },
  { text: "Vestígios de um acampamento abandonado — e uma bolsa esquecida.", ember: 15 },
  { text: "Chuva forte atrasa a marcha, mas ninguém se machuca." },
  { text: "Pegadas grandes demais cruzam o caminho. O grupo segue mais alerta, sem parar." },
];

/** Modo teste only: jumps straight to any hex, no adjacency check, no day/ration/HP cost.
 * Testing needs to reach any location on demand — walking it out one step at a time isn't
 * a real constraint there, it's just friction. */
export function teleportOverworld(save: SaveData, col: number, row: number): SaveData {
  return { ...save, overworldPos: { col, row } };
}

/** Advances the RPG map by exactly one hex step, always exactly one day. Refuses (returns
 * the save unchanged, no event) if the target hex isn't actually a neighbor of the current
 * position — the UI is expected to only ever offer neighbors, but this is the one place
 * that enforces it regardless. */
export function stepOverworld(save: SaveData, toCol: number, toRow: number, locations: WorldLocation[]): { save: SaveData; event: OverworldEvent | null } {
  const from = { x: save.overworldPos.col, y: save.overworldPos.row };
  const to = { x: toCol, y: toRow };
  if ((from.x === to.x && from.y === to.y) || !isNeighbor(from, to)) return { save, event: null };

  const livingHeroes = Object.keys(HERO_BASE_CLASS).filter((hero) => (save.unitHp[hero] ?? maxHpFor(save, hero)) > 0).length;
  const fed = save.rations > 0;
  const rations = fed ? Math.max(0, save.rations - livingHeroes) : 0;
  const prevPenalty = hungerPenaltyFor(save.hungerStreak);
  let hungerStreak = fed ? 0 : save.hungerStreak + 1;

  const unitHp: Record<string, number> = { ...save.unitHp };
  // Recovery only happens on a day the party actually ate — "não ativa a recuperação de
  // HP durante a exploração do mapa" whenever there's nothing to eat. Hunger itself never
  // does direct HP damage; it only docks combat stats (see hungerPenaltyFor), applied at
  // battle spawn, not here.
  if (fed) {
    for (const hero of Object.keys(HERO_BASE_CLASS)) {
      const max = maxHpFor(save, hero);
      if (max <= 0) continue;
      const current = unitHp[hero] ?? max;
      if (current <= 0 || current >= max) continue; // fallen heroes don't heal on the road
      unitHp[hero] = Math.min(max, Math.round(current + max * RECOVERY_PCT));
    }
  }

  let event: OverworldEvent | null = null;
  const newPenalty = hungerPenaltyFor(hungerStreak);
  if (newPenalty > prevPenalty) {
    event =
      newPenalty >= HUNGER_PENALTY_MAX
        ? { kind: "hungry", text: "O grupo desmaia de fome. Preciso retornar a uma estalagem." }
        : { kind: "hungry", text: `Fome: o grupo já passa ${hungerStreak} dias sem comer (−${Math.round(newPenalty * 100)}% nos atributos).` };
  }

  let rationsDelta = 0;
  let emberDelta = 0;
  const landedLocation = locationAt(locations, toCol, toRow);
  if (!event && !landedLocation && Math.random() < ENCOUNTER_CHANCE) {
    const pick = ENCOUNTERS[Math.floor(Math.random() * ENCOUNTERS.length)]!;
    event = { kind: "encounter", text: pick.text };
    rationsDelta = pick.rations ?? 0;
    emberDelta = pick.ember ?? 0;
  }

  // Arriving at an Inn (a hub location, same check the map screens use to style its pin)
  // cures the streak outright — "até retornar a alguma estalagem."
  if (landedLocation && missionsForLocation(landedLocation).some((m) => m.hub)) {
    hungerStreak = 0;
  }

  return {
    save: {
      ...save,
      overworldPos: { col: toCol, row: toRow },
      gameClock: save.gameClock + 1,
      rations: Math.max(0, rations + rationsDelta),
      ember: Math.max(0, save.ember + emberDelta),
      hungerStreak,
      unitHp,
    },
    event,
  };
}
