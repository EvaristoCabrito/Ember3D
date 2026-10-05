import { AFFINITY_HEROES } from "./affinity.ts";
import type { Mission } from "./types";

export function cleanPartyFormation(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((hero): hero is string => typeof hero === "string" && AFFINITY_HEROES.includes(hero as typeof AFFINITY_HEROES[number])))];
}

/** Assign heroes to the map's existing starting slots; never invent new hexes. */
export function applyPartyFormation(mission: Mission, raw: unknown, protectedStart = false): Mission {
  const order = cleanPartyFormation(raw);
  if (!order.length || protectedStart || mission.lockPartyFormation || mission.explore) return mission;
  const heroes = mission.playerSpawns.filter(spawn => AFFINITY_HEROES.includes(spawn.name as typeof AFFINITY_HEROES[number]));
  const ranked = [...heroes].sort((a, b) => {
    const ai = order.indexOf(a.name), bi = order.indexOf(b.name);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
  });
  const positions = new Map(ranked.map((hero, i) => [hero.name, { x: heroes[i].x, y: heroes[i].y }]));
  return { ...mission, playerSpawns: mission.playerSpawns.map(spawn => positions.has(spawn.name) ? { ...spawn, ...positions.get(spawn.name)! } : spawn) };
}
