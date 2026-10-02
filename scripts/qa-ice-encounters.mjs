import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { CLASSES, DECORATIONS, placedFootprint, placedBlockingFootprint, decorationImage } from '../src/game/data.ts';
import { buildDecorOverlay, hexDef } from '../src/game/hexprops.ts';
import { hexNeighbors } from '../src/game/pathfinding.ts';

const forest = process.argv.includes('--forest');
const ids = forest
  ? ['random-caravan-green-road', 'random-broken-antler-grove', 'random-river-rope-ambush', 'random-hollow-root-den']
  : ['random-bell-beneath-ice', 'random-small-toll-collector', 'random-walking-campfire', 'random-backward-hunt'];
const config = JSON.parse(readFileSync('src/game/random-encounters.json', 'utf8'));
const region = config.regions.find(r => r.id === (forest ? 'forest' : 'ice'));
for (const id of ids) {
  assert.equal(region.encounterIds.filter(value => value === id).length, 1);
  const { serial, draft: d } = JSON.parse(readFileSync(`src/game/maps/${id}001.json`, 'utf8'));
  assert.equal(serial, 1);
  for (const key of ['tiles', 'tileVariants', 'tileRots']) assert.equal(d[key].length, d.cols * d.rows);
  const overlay = buildDecorOverlay(d.decorations, d.cols, d.rows, placedBlockingFootprint);
  const pass = (x, y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows && hexDef(d.tiles, d.cols, x, y, overlay).passable;
  for (const p of d.decorations) {
    assert.ok(DECORATIONS[p.id], `${id}: unknown decoration ${p.id}`);
    assert.ok(existsSync(`public${decodeURI(decorationImage(p.id).split('?')[0])}`), `${id}: missing decoration image ${p.id}`);
    for (const o of placedFootprint(p)) assert.ok(p.x + o.dx >= 0 && p.x + o.dx < d.cols && p.y + o.dy >= 0 && p.y + o.dy < d.rows, `${id}: decoration outside grid`);
  }
  const occupied = new Set();
  for (const s of [...d.playerSpawns, ...d.enemySpawns, ...d.neutralSpawns]) {
    assert.ok(CLASSES[s.classId], `${id}: unknown class ${s.classId}`);
    for (const o of CLASSES[s.classId].footprintOffsets ?? [{ dx: 0, dy: 0 }]) {
      const x = s.x + o.dx, y = s.y + o.dy, key = `${x},${y}`;
      assert.ok(pass(x, y), `${id}: blocked footprint ${s.name} at ${key}`);
      assert.ok(!occupied.has(key), `${id}: overlapping footprint ${s.name} at ${key}`);
      occupied.add(key);
    }
  }
  const queue = [d.playerSpawns[0]], seen = new Set([`${queue[0].x},${queue[0].y}`]);
  for (let i = 0; i < queue.length; i++) for (const n of hexNeighbors(queue[i].x, queue[i].y)) {
    const key = `${n.x},${n.y}`;
    if (pass(n.x, n.y) && !seen.has(key)) { seen.add(key); queue.push(n); }
  }
  for (const s of [...d.playerSpawns, ...d.enemySpawns, ...d.neutralSpawns]) assert.ok(seen.has(`${s.x},${s.y}`), `${id}: unreachable ${s.name}`);
  for (const tree of [d.introDialog, d.outroDialog, ...d.neutralSpawns.map(s => s.dialog)].filter(Boolean)) {
    const lines = new Set(tree.lines.map(line => line.id));
    assert.ok(lines.has(tree.startId));
    for (const line of tree.lines) for (const next of [line.next, ...(line.replies ?? []).map(r => r.next)].filter(Boolean)) assert.ok(lines.has(next));
  }
  console.log(`${id}: ${seen.size} connected hexes, ${d.enemySpawns.length} enemies, valid footprints/dialogues/assets`);
}

// Confirm Vite's editor map loader discovers each native save and all floor art decodes.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/__ice-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Ice encounter validation</title>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ice-qa`);
  const result = await page.evaluate(async ids => {
    const maps = await import('/src/game/mapstore.ts');
    const assets = await import('/src/game/assets.ts');
    const errors = [];
    for (const id of ids) {
      const d = maps.latestSavedDraft(id);
      if (!d || !maps.isRandomEncounter(id)) { errors.push(`${id}: not available to editor`); continue; }
      const mission = maps.draftToMission(d);
      if (JSON.stringify(mission.victoryReward) !== JSON.stringify(d.victoryReward)) errors.push(`${id}: reward lost in editor conversion`);
      if (id === 'random-caravan-green-road') {
        const { victoryRewardFor } = await import('/src/game/victory-reward.ts');
        const units = [...(mission.neutralSpawns ?? []).map(s => ({ ...s, side: 'neutral', alive: true })), ...mission.enemySpawns.map(s => ({ ...s, side: 'enemy', alive: false }))];
        const reward = victoryRewardFor(mission, units);
        if (reward.ember !== 400 || reward.rations !== 12) errors.push('Caravan reward does not match NPC promise');
      }
      for (const src of new Set(d.tiles.map((t, i) => assets.tileVariantSrc(t, d.tileVariants[i])))) {
        const image = new Image(); image.src = src;
        try { await image.decode(); } catch { errors.push(`${id}: cannot decode ${src}`); }
      }
    }
    return errors;
  }, ids);
  assert.deepEqual(result, []);
  console.log('All four maps load through the editor map store; all terrain artwork decodes.');
} finally {
  await browser?.close();
  await server.close();
}
