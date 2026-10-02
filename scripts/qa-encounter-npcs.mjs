import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { ENCOUNTER_NPC_IDS } from '../src/game/encounter-npcs.ts';
import { CLASSES, GROWTH, placedBlockingFootprint } from '../src/game/data.ts';
import { buildDecorOverlay, hexDef } from '../src/game/hexprops.ts';
import { hexNeighbors } from '../src/game/pathfinding.ts';

const mapFiles = readdirSync('src/game/maps').filter(f => f === 'npc-cast-showcase001.json' || f === 'estalagem-andar-2002.json' || /^random-.+002\.json$/.test(f));
for (const id of ENCOUNTER_NPC_IDS) {
  assert.equal(CLASSES[id].sprite, id);
  assert.ok(GROWTH[id]);
  const hashes = [1,2,3,4].map(n => createHash('sha256').update(readFileSync(`public/game/sprites/${id}/${n}.png`)).digest('hex'));
  assert.equal(new Set(hashes).size, 4, `${id}: duplicate frames`);
}
for (const file of mapFiles) {
  const { draft: d } = JSON.parse(readFileSync(`src/game/maps/${file}`));
  const overlay = buildDecorOverlay(d.decorations, d.cols, d.rows, placedBlockingFootprint);
  const pass = (x,y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows && hexDef(d.tiles,d.cols,x,y,overlay).passable;
  const queue = [d.playerSpawns[0]], seen = new Set([`${queue[0].x},${queue[0].y}`]);
  for (let i=0; i<queue.length; i++) for (const p of hexNeighbors(queue[i].x,queue[i].y)) {
    const key = `${p.x},${p.y}`;
    if(pass(p.x,p.y) && !seen.has(key)) { seen.add(key); queue.push(p); }
  }
  const occupied = new Set();
  for(const s of [...d.playerSpawns,...d.enemySpawns,...d.neutralSpawns]) {
    const key = `${s.x},${s.y}`;
    assert.ok(!occupied.has(key), `${file}: overlapping spawn ${s.name}`); occupied.add(key);
    if (!ENCOUNTER_NPC_IDS.includes(s.classId)) continue;
    assert.ok(seen.has(key), `${file}: inaccessible NPC ${s.name}`);
    assert.ok(s.dialog?.lines.length >= 3);
    const lines = new Set(s.dialog.lines.map(l=>l.id));
    assert.ok(lines.has(s.dialog.startId));
    for (const l of s.dialog.lines) for (const next of [l.next,...(l.replies??[]).map(r=>r.next)].filter(Boolean)) assert.ok(lines.has(next));
  }
}
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/__npc-qa', r=>r.fulfill({ contentType:'text/html', body:'<!doctype html><title>NPC QA</title>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__npc-qa`);
  const result = await page.evaluate(async ({ids,files}) => {
    const assets = await import('/src/game/assets.ts');
    const maps = await import('/src/game/mapstore.ts');
    const {BattleEngine} = await import('/src/game/engine.ts');
    const art = {sprites:{}};
    await assets.ensureSpriteArt(art,ids);
    const errors = [];
    for(const id of ids) {
      const frames = art.sprites[id];
      if(frames?.length !== 4) { errors.push(`${id}: expected 4 loaded frames`); continue; }
      for(const frame of frames) {
        if(frame.naturalWidth !== 512 || frame.naturalHeight !== 768) errors.push(`${id}: wrong frame size`);
        const canvas = document.createElement('canvas');canvas.width=512;canvas.height=768;
        const ctx = canvas.getContext('2d');ctx.drawImage(frame,0,0);
        if(ctx.getImageData(0,0,1,1).data[3] !== 0) errors.push(`${id}: opaque background`);
      }
      const visited = new Set();
      for(let t=0;t<3;t+=0.05) visited.add(BattleEngine.prototype.idleFrame.call({active:null,reducedMotion:false},{id, sprite:id,classId:id,bob:t},4));
      if(visited.size !== 4) errors.push(`${id}: animation does not visit all four frames`);
    }
    for(const file of files) {
      const d = JSON.parse(await (await fetch(`/src/game/maps/${file}`)).text()).draft;
      const latest = maps.latestSavedDraft(d.id);
      if(JSON.stringify(latest?.neutralSpawns) !== JSON.stringify(d.neutralSpawns)) errors.push(`${d.id}: editor selected wrong version`);
      const mission = maps.draftToMission(latest);
      if(JSON.stringify(mission.neutralSpawns.map(s=>s.dialog)) !== JSON.stringify(d.neutralSpawns.map(s=>s.dialog))) errors.push(`${d.id}: dialogues lost`);
    }
    return errors;
  },{ids:ENCOUNTER_NPC_IDS,files:mapFiles});
  assert.deepEqual(result,[]);
  console.log(`PASS: 12 NPCs, 48 unique transparent frames, all animation frames visited, dialogues preserved, ${mapFiles.length} maps reachable and loaded through editor.`);
} finally { await browser?.close(); await server.close(); }
