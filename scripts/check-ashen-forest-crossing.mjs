import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
const draft=JSON.parse(fs.readFileSync('src/game/maps/ashen-forest-crossing001.json','utf8')).draft;
const wisp=JSON.parse(fs.readFileSync('src/game/maps/wisp-forest-crossing004.json','utf8')).draft;
const server=await createServer({mode:'development',server:{host:'127.0.0.1',port:0}});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.route('**/__ashen-qa',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ashen-qa`);
  console.log(await page.evaluate(async({d,wisp})=>{
    const {WORLD_LOCATIONS,CLASSES,DECORATIONS,TERRAIN,placedBlockingFootprint}=await import('/src/game/data.ts');
    const {ALL_LOCATIONS,latestSavedDraft,missionsForLocation,isCrossingDungeon}=await import('/src/game/mapstore.ts');
    const {worldToHex,hexToWorld,neighborsOf,isOverworldCell,canStepOverworld,ASHEN_FOREST_ENTRANCE,ASHEN_FOREST_BLOCKED_HEX,stepOverworld}=await import('/src/game/overworld.ts');
    const {buildDecorOverlay}=await import('/src/game/hexprops.ts');
    const {hexNeighbors,hexDist}=await import('/src/game/pathfinding.ts');
    const assert=(c,m)=>{if(!c)throw new Error(m);};
    const inn=WORLD_LOCATIONS.find(l=>l.id==='estalagem'),ih=worldToHex(inn.x,inn.y);
    const right={x:ih.x+2,y:ih.y},ne=neighborsOf(right.x,right.y).find(p=>p.y<right.y&&hexToWorld(p.x,p.y).x>hexToWorld(right.x,right.y).x);
    assert(ne.x===ASHEN_FOREST_ENTRANCE.x&&ne.y===ASHEN_FOREST_ENTRANCE.y,'Entrance must be Inn E E NE');
    const loc=ALL_LOCATIONS.find(l=>l.id==='ashen-forest');assert(loc&&missionsForLocation(loc).some(m=>m.id===d.id),'Map must be registered at entrance');
    assert(loc.openAccess===true,'Location must have no campaign progression prerequisite');
    assert(latestSavedDraft(d.id)?.cols===88,'Latest save must load');
    assert(isCrossingDungeon(missionsForLocation(loc)[0]),'Crossing persistence/revisit behavior');
    const cell=worldToHex(loc.x,loc.y);assert(cell.x===ne.x&&cell.y===ne.y&&isOverworldCell(ne.x,ne.y),'Location pin must match entrance');
    assert(!ALL_LOCATIONS.some(l=>l.id!==loc.id&&worldToHex(l.x,l.y).x===ne.x&&worldToHex(l.x,l.y).y===ne.y),'Location must not collide');
    const se=neighborsOf(ne.x,ne.y).find(p=>p.y>ne.y&&hexToWorld(p.x,p.y).x>hexToWorld(ne.x,ne.y).x);
    assert(se.x===ASHEN_FOREST_BLOCKED_HEX.x&&se.y===ASHEN_FOREST_BLOCKED_HEX.y&&!isOverworldCell(se.x,se.y),'Lower-right bypass must be blocked');
    const save={completed:['vau','bosque','aldeia','thebridge'],overworldPos:{col:ne.x,row:ne.y}};
    const east={x:ne.x+1,y:ne.y};
    assert(canStepOverworld({completed:[],overworldPos:{col:ne.x,row:ne.y}},ne,east),'Overworld exploration has no crossing completion prerequisite');
    assert(canStepOverworld(save,ne,{x:ne.x,y:ne.y+1}),'Can retreat toward Inn');
    for(const p of neighborsOf(se.x,se.y))assert(!canStepOverworld(save,p,se,true),'Blocked hex must stay blocked from every side');
    assert(stepOverworld(save,se.x,se.y,ALL_LOCATIONS,true).save===save,'Blocked route must not consume a travel day');
    assert(d.tiles.length===d.cols*d.rows&&d.terrainElevations.length===d.tiles.length,'Map array lengths');
    assert(d.decorations.length/d.tiles.length<wisp.decorations.length/wisp.tiles.length,'Less dense than Wisp Forest');
    const overlay=buildDecorOverlay(d.decorations,d.cols,d.rows,placedBlockingFootprint,d.terrainElevations);
    const open=(x,y)=>x>=0&&y>=0&&x<d.cols&&y<d.rows&&TERRAIN[d.tiles[y*d.cols+x]].passable&&!(overlay[y*d.cols+x]&1);
    for(const p of d.decorations)assert(DECORATIONS[p.id]&&p.x>=0&&p.y>=0&&p.x<d.cols&&p.y<d.rows,'Valid decorations');
    const start=d.playerSpawns[0],queue=[[start.x,start.y]],distance=new Map([[start.y*d.cols+start.x,0]]);
    for(let q=0;q<queue.length;q++){const [x,y]=queue[q];for(const p of hexNeighbors(x,y)){const k=p.y*d.cols+p.x;if(open(p.x,p.y)&&!distance.has(k)){distance.set(k,distance.get(y*d.cols+x)+1);queue.push([p.x,p.y]);}}}
    for(const s of [...d.playerSpawns,...d.enemySpawns])assert(CLASSES[s.classId]&&open(s.x,s.y)&&distance.has(s.y*d.cols+s.x),`Spawn must be reachable: ${s.name}`);
    const exit=d.decorations.find(p=>p.id==='dungeon-exit');assert(open(exit.x,exit.y)&&distance.has(exit.y*d.cols+exit.x),'Far exit must be reachable');
    assert(d.decorations.filter(p=>DECORATIONS[p.id].exitKind).length===1,'No premature completion waypoint');
    const wispExit=wisp.decorations.find(p=>p.id==='dungeon-exit');assert(distance.get(exit.y*d.cols+exit.x)>hexDist(wisp.playerSpawns[0],wispExit),'Longer journey than Wisp Forest');
    return {entrance:ne,blocked:se,size:`${d.cols}x${d.rows}`,minimumJourneySteps:distance.get(exit.y*d.cols+exit.x),reachableCells:distance.size,props:d.decorations.length};
  },{d:draft,wisp}));
}finally{await browser?.close();await server.close();}
