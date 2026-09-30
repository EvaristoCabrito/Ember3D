#!/usr/bin/env node
/** Playwright integration check for the campaign house footprints. Requires a Vite server. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const { loadGameArt } = await import("/src/game/assets.ts");
    const { BattleEngine } = await import("/src/game/engine.ts");
    const { HOUSE_DECOR_IDS, BIG_HOUSE_DECOR_IDS, SOLID_HOUSE_DECOR_IDS, placedBlockingFootprint } = await import("/src/game/data.ts");
    const { computeReachable } = await import("/src/game/pathfinding.ts");
    const { hexDef } = await import("/src/game/hexprops.ts");
    const art = await loadGameArt();
    const cols = 24;
    const rows = 14;
    const layout = Array.from({ length: rows }, () => ".".repeat(cols));
    const ids = [...HOUSE_DECOR_IDS, ...BIG_HOUSE_DECOR_IDS, ...SOLID_HOUSE_DECOR_IDS];
    const results = [];

    for (const id of ids) {
      const house = { id, x: 12, y: 7 };
      const mission = {
        id: "house-qa", index: 4, title: "House QA", place: "QA", briefing: "", objective: "QA", win: "rout",
        cols, rows, layout, autoTactics: false,
        playerSpawns: [{ name: "Kael", classId: "swordsman", x: 7, y: 7 }],
        enemySpawns: [{ name: "Foe", classId: "soldier", x: 22, y: 12 }],
        decorations: [house],
      };
      const engine = new BattleEngine(mission, art, { hp: {}, levels: {} }, 7);
      const hero = engine.units.find((unit) => unit.side === "player");
      hero.mov = cols * rows;
      const cells = placedBlockingFootprint(house).map(({ dx, dy }) => ({ x: house.x + dx, y: house.y + dy }));
      const reach = computeReachable(hero, engine.tiles, cols, rows, engine.units, true, engine.decorOverlay);
      // The constructor waits for its first RAF tick to choose the initiative winner.
      // Put the engine in the same selected-player state that beginUnitTurn establishes.
      engine.phase = "player";
      engine.mode = "selected";
      engine.selectedId = hero.id;
      engine.reach = reach;
      const movementLayer = engine.boardOverlayLayers().find((layer) => layer.fill === "rgba(140,200,245,0.5)");
      const clearSideHex = { x: house.x + 2, y: house.y };
      results.push({
        id,
        footprintHexes: cells.length,
        everyBaseHexBlocked: cells.every((p) => !hexDef(engine.tiles, cols, p.x, p.y, engine.decorOverlay).passable),
        noBaseHexInReach: cells.every((p) => !reach.has(`${p.x},${p.y}`)),
        noMovementGridUnderBase: !!movementLayer && cells.every((p) => !movementLayer.cells.some((c) => c.x === p.x && c.y === p.y)),
        adjacentSideHexPassable: hexDef(engine.tiles, cols, clearSideHex.x, clearSideHex.y, engine.decorOverlay).passable,
        adjacentSideHexReachable: reach.has(`${clearSideHex.x},${clearSideHex.y}`),
      });
    }
    return results;
  });

  for (const house of result) {
    assert.equal(house.everyBaseHexBlocked, true, `${house.id}: base contains a passable hex`);
    assert.equal(house.noBaseHexInReach, true, `${house.id}: movement can enter its base`);
    assert.equal(house.noMovementGridUnderBase, true, `${house.id}: movement grid paints beneath its base`);
    assert.equal(house.adjacentSideHexPassable, true, `${house.id}: clear adjacent hex was blocked`);
    assert.equal(house.adjacentSideHexReachable, true, `${house.id}: movement grid failed to show a clear adjacent hex`);
    console.log(`[qa] ${house.id}: ${house.footprintHexes} blocking hexes blocked; adjacent side hex remains open`);
  }
  console.log(`[qa] all ${result.length} house props passed in BattleEngine`);
} finally {
  await browser.close();
}
