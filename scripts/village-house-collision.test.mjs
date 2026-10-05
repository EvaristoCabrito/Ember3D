import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer } from 'vite';

test('village house ground rejects movement for both sides in every rotation', async () => {
  const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-house-collision-test', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { HOUSE_DECOR_IDS, SOLID_HOUSE_DECOR_IDS, FOOTPRINT_TYPE_6, placedBlockingFootprint } = await server.ssrLoadModule('/src/game/data.ts');
    const { buildDecorOverlay } = await server.ssrLoadModule('/src/game/hexprops.ts');
    const { footprintCost } = await server.ssrLoadModule('/src/game/pathfinding.ts');
    let checked = 0;
    for (const version of ['aldeia008', 'aldeia009']) {
      const document = JSON.parse(await readFile(new URL(`../src/game/maps/${version}.json`, import.meta.url), 'utf8'));
      const mission = document.draft ?? document.map ?? document.mission ?? document;
      for (const placement of mission.decorations) {
        if (!HOUSE_DECOR_IDS.has(placement.id) && !SOLID_HOUSE_DECOR_IDS.has(placement.id)) continue;
        for (let rot = 0; rot < 6; rot++) {
          const house = { ...placement, rot };
          const cols = 40, rows = 40;
          const overlay = buildDecorOverlay([house], cols, rows, placedBlockingFootprint);
          const tiles = Array(cols * rows).fill('plains');
          for (const { dx, dy } of placedBlockingFootprint(house)) {
            for (const side of ['player', 'enemy']) {
              const mover = { id: side, side, classId: 'warrior' };
              assert.equal(footprintCost(house.x + dx, house.y + dy, 1, tiles, cols, rows, new Map(), mover, false, overlay), null,
                `${version}: ${house.id}, rotation ${rot}, ${side}, cell ${dx},${dy}`);
            }
          }
          if (rot === 0) {
            if (house.id === 'burnt-house-ruins') {
              assert.deepEqual(placedBlockingFootprint(house).slice(0, 6), FOOTPRINT_TYPE_6, 'original collision shape without the erroneous leftward shift');
              assert.ok(placedBlockingFootprint(house).slice(6).every(cell => cell.dy <= -2), 'additional cells only behind the original footprint');
              if (house.x >= 4) assert.equal(footprintCost(house.x - 4, house.y - 1, 1, tiles, cols, rows, new Map(), { id: 'player', side: 'player', classId: 'warrior' }, false, overlay), 1, 'old far-left blocking cell cleared');
              continue;
            }
            assert.ok(placedBlockingFootprint(house).every(cell => cell.dx >= -1), 'no misplaced far-left blocking cells');
            assert.equal(footprintCost(house.x - 1, house.y, 1, tiles, cols, rows, new Map(), { id: 'player', side: 'player', classId: 'warrior' }, false, overlay), 1, 'extra front cell stays walkable');
            assert.ok(placedBlockingFootprint(house).some(cell => cell.dy === -3), 'added collision extends behind the house');
          }
        }
        checked++;
      }
    }
    assert.equal(checked, 12);
  } finally { await server.close(); }
});
