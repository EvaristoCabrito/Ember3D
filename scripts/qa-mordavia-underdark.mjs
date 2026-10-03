import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES,DECORATIONS,placedBlockingFootprint} from '../src/game/data.ts';
import {buildDecorOverlay,hexDef} from '../src/game/hexprops.ts';
import {hexNeighbors} from '../src/game/pathfinding.ts';
const ids=['misty-root-descent','misty-spore-basin','misty-blackwater-shelf','misty-hollow-earth','mordavia-underdark','misty-sporehaven','misty-deep-mycelium'];
function load(id){const files=fs.readdirSync('src/game/maps').filter(f=>f.startsWith(id)&&/^\d+\.json$/.test(f.slice(id.length))).sort();return JSON.parse(fs.readFileSync('src/game/maps/'+files.at(-1),'utf8')).draft;}
for(const id of ids){const d=load(id),overlay=buildDecorOverlay(d.decorations,d.cols,d.rows,placedBlockingFootprint),pass=(x,y)=>x>=0&&y>=0&&x<d.cols&&y<d.rows&&hexDef(d.tiles,d.cols,x,y,overlay).passable;
 const q=[d.playerSpawns[0]],seen=new Set([`${q[0].x},${q[0].y}`]);for(let i=0;i<q.length;i++)for(const p of hexNeighbors(q[i].x,q[i].y)){const k=`${p.x},${p.y}`;if(pass(p.x,p.y)&&!seen.has(k)){seen.add(k);q.push(p);}}
 for(const s of [...d.playerSpawns,...d.enemySpawns,...d.neutralSpawns]){assert.ok(CLASSES[s.classId]);assert.ok(pass(s.x,s.y)&&seen.has(`${s.x},${s.y}`),`${id}: blocked/unreachable ${s.name} ${s.x},${s.y}`);}
 for(const p of d.decorations){assert.ok(DECORATIONS[p.id]);if(p.targetMapId){assert.ok(seen.has(`${p.x},${p.y}`),`${id}: unreachable link ${p.targetMapId}`);assert.ok(load(p.targetMapId).decorations.some(l=>l.targetMapId===id),`${id}: no return`);}}
 console.log(`${id}: ${seen.size} reachable cells, links valid`);
}
