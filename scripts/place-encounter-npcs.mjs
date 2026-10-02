import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ENCOUNTER_NPC_IDS, encounterNpcSpawn } from '../src/game/encounter-npcs.ts';
import { placedBlockingFootprint } from '../src/game/data.ts';
import { buildDecorOverlay, hexDef } from '../src/game/hexprops.ts';
import { hexNeighbors } from '../src/game/pathfinding.ts';

const placements = [
  ['random-bell-beneath-ice', ['bellCollector']],
  ['random-small-toll-collector', ['marshTrapper', 'ratCatcher']],
  ['random-walking-campfire', ['charcoalBurner', 'wanderingTinker']],
  ['random-backward-hunt', ['shadowScholar']],
  ['random-broken-antler-grove', ['mothKeeper', 'maskedPhysician']],
  ['random-river-rope-ambush', ['swampFerryman', 'roadCartographer']],
  ['random-hollow-root-den', ['mushroomForager', 'lostCourier']],
];
function freeCells(d) {
  const overlay = buildDecorOverlay(d.decorations, d.cols, d.rows, placedBlockingFootprint);
  const pass = (x, y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows && hexDef(d.tiles, d.cols, x, y, overlay).passable;
  const occupied = [...d.playerSpawns, ...d.enemySpawns, ...d.neutralSpawns];
  const origin = d.playerSpawns[0];
  const queue = [origin], seen = new Set([`${origin.x},${origin.y}`]);
  for (let i = 0; i < queue.length; i++) for (const n of hexNeighbors(queue[i].x, queue[i].y)) {
    const key = `${n.x},${n.y}`;
    if (pass(n.x, n.y) && !seen.has(key)) { seen.add(key); queue.push(n); }
  }
  return queue.filter(p => occupied.every(s => Math.hypot(p.x - s.x, p.y - s.y) >= 2))
    .sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
}
function addNpcs(d, ids) {
  const cells = freeCells(d), chosen = [];
  for (const id of ids) {
    const p = cells.find(p => chosen.every(s => Math.hypot(p.x - s.x, p.y - s.y) >= 2));
    assert.ok(p, `No connected free cell for ${id}`);
    chosen.push(p);
    d.neutralSpawns.push({ ...encounterNpcSpawn(id, p.x, p.y), level: 1 });
  }
}
function save(file, d, serial) {
  assert.ok(!existsSync(file), `Preserving existing save: ${file}`);
  writeFileSync(file, JSON.stringify({ serial, savedAt: Date.now(), draft: d }, null, 2) + '\n');
}
for (const [id, ids] of placements) {
  const { draft } = JSON.parse(readFileSync(`src/game/maps/${id}001.json`, 'utf8'));
  addNpcs(draft, ids);
  save(`src/game/maps/${id}002.json`, draft, 2);
  console.log(`${id}: added ${ids.join(', ')}`);
}
const { draft } = JSON.parse(readFileSync('src/game/maps/random-caravan-green-road001.json', 'utf8'));
Object.assign(draft, { id: 'npc-cast-showcase', title: 'Os Doze Viajantes', place: 'Clareira dos Viajantes', briefing: 'Converse com os doze viajantes. Todos estão disponíveis no pincel NPC do editor.', objective: 'Explore a clareira e converse com os viajantes.', explore: true, fog: false, enemySpawns: [], neutralSpawns: [], introDialog: undefined, outroDialog: undefined, victoryReward: undefined });
addNpcs(draft, ENCOUNTER_NPC_IDS);
save('src/game/maps/npc-cast-showcase001.json', draft, 1);
console.log('npc-cast-showcase: all 12 characters with individual dialogues');
