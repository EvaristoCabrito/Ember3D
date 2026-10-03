import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLASSES,DECORATIONS,placedBlockingFootprint,placedFootprint} from '../src/game/data.ts';
import {buildDecorOverlay,hexDef} from '../src/game/hexprops.ts';
import {hexNeighbors} from '../src/game/pathfinding.ts';
const c=JSON.parse(fs.readFileSync('src/game/random-encounters.json','utf8'));
for(const id of c.regions.find(r=>r.id==='plains').encounterIds.filter(id=>id.startsWith('random-plains-'))){
 const d=JSON.parse(fs.readFileSync(`src/game/maps/${id}001.json`,'utf8')).draft;
 const overlay=buildDecorOverlay(d.decorations,d.cols,d.rows,placedBlockingFootprint);
 const pass=(x,y)=>x>=0&&y>=0&&x<d.cols&&y<d.rows&&hexDef(d.tiles,d.cols,x,y,overlay).passable;
 for(const k of ['tiles','tileVariants','tileRots'])assert.equal(d[k].length,d.cols*d.rows);
 for(const p of d.decorations){assert.ok(DECORATIONS[p.id]);for(const o of placedFootprint(p))assert.ok(p.x+o.dx>=0&&p.x+o.dx<d.cols&&p.y+o.dy>=0&&p.y+o.dy<d.rows);}
 const occupied=new Set();
 for(const s of [...d.playerSpawns,...d.enemySpawns]){assert.ok(CLASSES[s.classId]);for(const o of CLASSES[s.classId].footprintOffsets??[{dx:0,dy:0}]){const x=s.x+o.dx,y=s.y+o.dy,k=`${x},${y}`;assert.ok(pass(x,y),`${id}: blocked ${s.name} ${k}`);assert.ok(!occupied.has(k));occupied.add(k);}}
 const q=[d.playerSpawns[0]],seen=new Set([`${q[0].x},${q[0].y}`]);for(let i=0;i<q.length;i++)for(const p of hexNeighbors(q[i].x,q[i].y)){const k=`${p.x},${p.y}`;if(pass(p.x,p.y)&&!seen.has(k)){seen.add(k);q.push(p);}}
 for(const s of [...d.playerSpawns,...d.enemySpawns])assert.ok(seen.has(`${s.x},${s.y}`),`${id}: unreachable ${s.name}`);
 console.log(`${id}: valid, ${seen.size} accessible hexes`);
}
