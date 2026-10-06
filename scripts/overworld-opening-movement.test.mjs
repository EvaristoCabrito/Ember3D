import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

test('campaign first step requires O Vau completion, then allows walking to the bridge and back', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { emptySave } = await server.ssrLoadModule('/src/game/save.ts');
    const { OVERWORLD_START_HEX, neighborsOf, isOverworldCell, canStepOverworld } = await server.ssrLoadModule('/src/game/overworld.ts');
    const source = await readFile(new URL('../src/game/overworld.ts', import.meta.url), 'utf8');
    const exclusions = source.split('const OVERWORLD_OFF_MAP_HEXES = new Set<string>([')[1].split(']);')[0];
    const removed = [...exclusions.matchAll(/key\((\d+),\s*(\d+)\)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    assert.ok(removed.length > 20);
    for (const cell of removed) {
      assert.equal(isOverworldCell(cell.x, cell.y), false, `Removed hex ${cell.x},${cell.y} stays removed`);
      for (const testMode of [false, true]) assert.equal(canStepOverworld(emptySave(), OVERWORLD_START_HEX, cell, testMode), false);
    }
    for (const completed of [[], ['vau'], ['vau', 'bosque']]) {
      const save = { ...emptySave(), completed };
      assert.deepEqual(save.overworldPos, { col: OVERWORLD_START_HEX.x, row: OVERWORLD_START_HEX.y });
      const next = neighborsOf(OVERWORLD_START_HEX.x, OVERWORLD_START_HEX.y).find(p => p.x > OVERWORLD_START_HEX.x && isOverworldCell(p.x, p.y));
      assert.ok(next);
      assert.equal(canStepOverworld(save, OVERWORLD_START_HEX, next), completed.includes('vau'));
      assert.equal(canStepOverworld(save, next, OVERWORLD_START_HEX), completed.includes('vau'));
      assert.equal(canStepOverworld(save, OVERWORLD_START_HEX, next, true), true, 'Test mode keeps its movement override');
      for (const neighbor of neighborsOf(OVERWORLD_START_HEX.x, OVERWORLD_START_HEX.y)) {
        if (neighbor.y !== OVERWORLD_START_HEX.y) assert.equal(canStepOverworld(save, OVERWORLD_START_HEX, neighbor), false, 'Stay on the predefined line');
      }
    }
  } finally {
    await server.close();
  }
});
