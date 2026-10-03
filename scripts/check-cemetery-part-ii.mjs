import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const files = ['cemiterio-esquecidos005.json', 'cemetery-ground-part-ii001.json', ...[1,2,3,4].map(n => `cemetery-ground-deep-crypt-${n}001.json`)];
const drafts = files.map(file => JSON.parse(fs.readFileSync(`src/game/maps/${file}`, 'utf8')).draft);
const old = JSON.parse(fs.readFileSync('src/game/maps/cemiterio-esquecidos004.json', 'utf8')).draft;
assert.deepEqual(drafts[0].elementalFx, old.elementalFx);
for (const key of ['mistType','mistIntensity','mistSpeed','bloomIntensity','wispIntensity','wispSpeed','wispColor']) assert.deepEqual(drafts[0][key],old[key]);
for (const placement of old.decorations) assert.ok(drafts[0].decorations.some(p => JSON.stringify(p) === JSON.stringify(placement)));
const server = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/__cemetery-qa', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__cemetery-qa`);
  const results = await page.evaluate(async drafts => {
    const { DECORATIONS, CLASSES, TERRAIN, placedBlockingFootprint } = await import('/src/game/data.ts');
    const { buildDecorOverlay } = await import('/src/game/hexprops.ts');
    const { latestSavedDraft, missionById, ALL_LOCATIONS } = await import('/src/game/mapstore.ts');
    const check = (condition,message) => { if (!condition) throw new Error(message); };
    return drafts.map(d => {
      check(latestSavedDraft(d.id)?.title === d.title, `Latest save: ${d.id}`);
      check(missionById(d.id), `Mission missing: ${d.id}`);
      check(d.tiles.length === d.cols*d.rows && d.tileVariants.length === d.tiles.length && d.terrainElevations.length === d.tiles.length, `Array size: ${d.id}`);
      for (const p of d.decorations) check(DECORATIONS[p.id] && p.x>=0 && p.y>=0 && p.x<d.cols && p.y<d.rows, `Invalid prop: ${d.id} ${p.id}`);
      const overlay=buildDecorOverlay(d.decorations,d.cols,d.rows,placedBlockingFootprint,d.terrainElevations);
      const open=(x,y)=> x>=0 && y>=0 && x<d.cols && y<d.rows && TERRAIN[d.tiles[y*d.cols+x]].passable && !(overlay[y*d.cols+x]&1);
      const start=d.playerSpawns[0]; const seen=new Set([start.y*d.cols+start.x]); const queue=[[start.x,start.y]];
      for(let q=0;q<queue.length;q++) {
        const [x,y]=queue[q]; const r=y&1;
        for(const [nx,ny] of [[x-1,y],[x+1,y],[x+r-1,y-1],[x+r,y-1],[x+r-1,y+1],[x+r,y+1]]) {
          const i=ny*d.cols+nx;if(open(nx,ny)&&!seen.has(i)){seen.add(i);queue.push([nx,ny]);}
        }
      }
      for(const s of [...d.playerSpawns,...d.enemySpawns,...d.neutralSpawns]) {
        check(CLASSES[s.classId],`Unknown class ${s.classId}`);
        // Existing author placements remain unchanged; validate all newly authored spawns.
        if(d.id!=='cemiterio-esquecidos') check(open(s.x,s.y)&&seen.has(s.y*d.cols+s.x),`Blocked/unreachable spawn ${d.id}: ${s.name} ${s.x},${s.y}`);
      }
      const links=d.decorations.filter(p=>p.targetMapId);
      for(const p of links) {
        check(open(p.x,p.y)&&seen.has(p.y*d.cols+p.x),`Unreachable link ${d.id}: ${p.targetMapId}`);
        const target=latestSavedDraft(p.targetMapId);
        check(target?.decorations.some(back=>back.targetMapId===d.id),`Missing reciprocal link ${d.id}: ${p.targetMapId}`);
      }
      if(d.id!=='cemiterio-esquecidos') check(!ALL_LOCATIONS.some(l=>l.missionIds.includes(d.id)),`Submap listed separately: ${d.id}`);
      return {id:d.id,size:`${d.cols}x${d.rows}`,reachableCells:seen.size,links:links.length};
    });
  }, drafts);
  console.log(JSON.stringify(results,null,2));
} finally { await browser?.close(); await server.close(); }
