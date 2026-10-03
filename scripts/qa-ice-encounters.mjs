import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { CLASSES, DECORATIONS, placedFootprint, placedBlockingFootprint, decorationImage } from '../src/game/data.ts';
import { buildDecorOverlay, hexDef } from '../src/game/hexprops.ts';
import { hexNeighbors } from '../src/game/pathfinding.ts';

const forest = process.argv.includes('--forest');
const expanded = process.argv.includes('--mora-road-icelands');
const crossing = process.argv.includes('--frozen-swamp');
const ids = crossing ? [1, 2, 3].flatMap(n => [`frozen-swamp-crossing-${n}`, `frozen-swamp-${n}-sunk-vault`, `frozen-swamp-${n}-hidden-cellar`]) : expanded ? ['random-mora-rootwatch', 'random-mora-hollow-stream', 'random-road-three-routes-market', 'random-road-broken-milepost', 'random-icelands-blue-antlers', 'random-icelands-last-beacon'] : forest
  ? ['random-caravan-green-road', 'random-broken-antler-grove', 'random-river-rope-ambush', 'random-hollow-root-den']
  : ['random-bell-beneath-ice', 'random-small-toll-collector', 'random-walking-campfire', 'random-backward-hunt'];
const config = JSON.parse(readFileSync('src/game/random-encounters.json', 'utf8'));
const region = config.regions.find(r => r.id === (forest ? 'forest' : 'ice'));
for (const id of ids) {
  const encounterRegion = expanded ? config.regions.find(r => r.id === (id.startsWith('random-mora-') ? 'forest' : id.startsWith('random-road-') ? 'road' : 'ice')) : region;
  if (!crossing) assert.equal(encounterRegion.encounterIds.filter(value => value === id).length, 1);
  const { serial, draft: d } = JSON.parse(readFileSync(`src/game/maps/${id}001.json`, 'utf8'));
  assert.equal(serial, 1);
  for (const key of ['tiles', 'tileVariants', 'tileRots']) assert.equal(d[key].length, d.cols * d.rows);
  const overlay = buildDecorOverlay(d.decorations, d.cols, d.rows, placedBlockingFootprint);
  const pass = (x, y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows && hexDef(d.tiles, d.cols, x, y, overlay).passable;
  for (const p of d.decorations) {
    assert.ok(DECORATIONS[p.id], `${id}: unknown decoration ${p.id}`);
    assert.ok(DECORATIONS[p.id].model3d || existsSync(`public${decodeURI(decorationImage(p.id).split('?')[0])}`), `${id}: missing decoration image ${p.id}`);
    for (const o of placedFootprint(p)) assert.ok(p.x + o.dx >= 0 && p.x + o.dx < d.cols && p.y + o.dy >= 0 && p.y + o.dy < d.rows, `${id}: decoration outside grid`);
  }
  if (crossing) {
    const doors = d.decorations.filter(p => DECORATIONS[p.id].model3d === "secretDoor");
    const openedOverlay = buildDecorOverlay(d.decorations.filter(p => !doors.includes(p)), d.cols, d.rows, placedBlockingFootprint);
    const doorKeys = new Set(doors.map(p => `${p.x},${p.y}`));
    const reach = (closed) => {
      const q = [d.playerSpawns[0]], found = new Set([`${q[0].x},${q[0].y}`]);
      for (let i = 0; i < q.length; i++) for (const p of hexNeighbors(q[i].x, q[i].y)) {
        const key = `${p.x},${p.y}`;
        if (p.x < 0 || p.y < 0 || p.x >= d.cols || p.y >= d.rows || found.has(key) || (closed && doorKeys.has(key))) continue;
        if (!hexDef(d.tiles, d.cols, p.x, p.y, openedOverlay).passable) continue;
        found.add(key); q.push(p);
      }
      return found;
    };
    const open = reach(false), closed = reach(true);
    assert.ok(open.size > closed.size, `${id}: secret door must conceal an accessible chamber`);
    for (const p of d.decorations.filter(p => p.targetMapId)) {
      assert.ok(open.has(`${p.x},${p.y}`), `${id}: inaccessible connector ${p.targetMapId}`);
      const target = JSON.parse(readFileSync(`src/game/maps/${p.targetMapId}001.json`, 'utf8')).draft;
      assert.ok(target.decorations.some(p => p.targetMapId === id), `${id}: missing return link from ${target.id}`);
    }
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
  const result = await page.evaluate(async ({ ids, crossing }) => {
    const maps = await import('/src/game/mapstore.ts');
    const assets = await import('/src/game/assets.ts');
    const errors = [];
    if (crossing) {
      const location = maps.ALL_LOCATIONS.find(l => l.id === 'frozen-swamp');
      if (JSON.stringify(location?.missionIds) !== JSON.stringify(['frozen-swamp-crossing-1'])) errors.push('Frozen Swamp root incorrectly registered in Locais');
      if (location?.submaps?.length !== 8) errors.push('Frozen Swamp must expose eight connected submaps in Locais');
    }
    for (const id of ids) {
      const d = maps.latestSavedDraft(id);
      if (!d || (!crossing && !maps.isRandomEncounter(id))) { errors.push(`${id}: not available to editor`); continue; }
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
  }, { ids, crossing });
  assert.deepEqual(result, []);
  console.log('All requested maps load through the editor map store; all terrain artwork decodes.');
} finally {
  await browser?.close();
  await server.close();
}
