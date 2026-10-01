import {chromium} from 'playwright';
const ids=['watchtower-undercroft','watchtower-prison','watchtower-gate-floor','watchtower-barracks','watchtower-command','watchtower-beacon'];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});await page.goto('http://127.0.0.1:8080/');
 const result=await page.evaluate(async ids=>{
  const data=await import('/src/game/data.ts');const maps=await import('/src/game/mapstore.ts');const assets=await import('/src/game/assets.ts');const props=await import('/src/game/hexprops.ts');
  const {hexNeighbors}=await import('/src/game/pathfinding.ts');
  const errors=[],summary=[];
  for(const id of ids){const d=maps.latestSavedDraft(id);if(!d){errors.push(`${id}: missing`);continue;}
   if(id.startsWith('random-') && !maps.isRandomEncounter(id))errors.push(`${id}: unassigned`);
   if(d.tiles.length!==d.cols*d.rows||d.tileVariants.length!==d.tiles.length)errors.push(`${id}: array length`);
   for(const p of d.decorations){if(!data.DECORATIONS[p.id]){errors.push(`${id}: unknown decor ${p.id}`);continue;}for(const o of data.placedFootprint(p)){if(p.x+o.dx<0||p.x+o.dx>=d.cols||p.y+o.dy<0||p.y+o.dy>=d.rows)errors.push(`${id}: prop outside ${p.id}`);}}
   const overlay=props.buildDecorOverlay(d.decorations,d.cols,d.rows,data.placedBlockingFootprint);
   const pass=(x,y)=>x>=0&&x<d.cols&&y>=0&&y<d.rows&&props.hexDef(d.tiles,d.cols,x,y,overlay).passable;
   const occupied=new Set();for(const s of [...d.playerSpawns,...d.enemySpawns]){if(!data.CLASSES[s.classId])errors.push(`${id}: unknown class ${s.classId}`);if(!pass(s.x,s.y))errors.push(`${id}: blocked spawn ${s.name} (${s.x},${s.y})`);const k=`${s.x},${s.y}`;if(occupied.has(k))errors.push(`${id}: duplicate spawn`);occupied.add(k);}
   const start=d.playerSpawns[0],seen=new Set([`${start.x},${start.y}`]),queue=[start];while(queue.length){const c=queue.shift();for(const n of hexNeighbors(c.x,c.y)){const k=`${n.x},${n.y}`;if(pass(n.x,n.y)&&!seen.has(k)){seen.add(k);queue.push(n)}}}
   for(const s of [...d.playerSpawns,...d.enemySpawns])if(!seen.has(`${s.x},${s.y}`))errors.push(`${id}: unreachable ${s.name}`);
   for(const p of d.decorations){
    if(p.id==='floor-connector'){
     if(!seen.has(`${p.x},${p.y}`))errors.push(`${id}: unreachable stairs`);
     const target=maps.latestSavedDraft(p.targetMapId);
     if(!target?.decorations.some(q=>q.id==='floor-connector'&&q.targetMapId===id))errors.push(`${id}: missing reciprocal link to ${p.targetMapId}`);
    }
    if(p.id==='dungeon-exit'&&!seen.has(`${p.x},${p.y}`))errors.push(`${id}: unreachable exit`);
   }
   if(id==='watchtower-gate-floor'&&maps.locationForMission(id)?.id!=='watchtower')errors.push('Entrance not assigned to Watchtower');
   const sources=new Set(d.tiles.map((t,i)=>assets.tileVariantSrc(t,d.tileVariants[i])));for(const src of sources){const img=new Image();img.src=src;try{await img.decode()}catch{errors.push(`${id}: missing tile ${src}`)}}
   summary.push({id,reachable:seen.size,decorations:d.decorations.length,enemies:d.enemySpawns.length});
  }return {errors,summary};
 },ids);console.log(JSON.stringify(result,null,2));if(result.errors.length)throw new Error('Map validation failed');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8080/watchtower-dungeon-preview.html');
 await page.waitForFunction(()=>window.encounterPreviewReady);
 await page.screenshot({path:'screenshots/watchtower-dungeon.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close()}
