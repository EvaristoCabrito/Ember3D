import { createServer } from 'vite';
import { chromium } from 'playwright';
const server=await createServer({mode:'development',server:{host:'127.0.0.1',port:0}});
let browser;
try {
  await server.listen(); browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.route('**/__counter-missile',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__counter-missile`);
  console.log(await page.evaluate(async()=>{
    const {BattleEngine}=await import('/src/game/engine.ts');
    const {MagicMissileV2VFX}=await import('/src/game/gfx/three/MagicMissileV2VFX.ts');
    const {ThreeBattleRenderer}=await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
    let cases=0;
    for(const classId of ['swordsman','kaelFinal','kaelEarly']) for(const [x,y] of [[3,4],[5,4],[4,5],[4,3]]){
      const art=new Proxy({decorations:{}},{get:(t,k)=>t[k]??{}});
      const m={id:'counter-qa',index:0,title:'QA',place:'',briefing:'',objective:'',win:'rout',cols:10,rows:10,layout:Array(10).fill('.'.repeat(10)),decorations:[],playerSpawns:[{name:'Kael',classId,x:4,y:4,level:3}],enemySpawns:[{name:'Enemy',classId:'soldier',x,y,level:3}]};
      const e=new BattleEngine(m,art,{hp:{},levels:{}},1);e.reducedMotion=true;e.layout={tile:34,ox:0,oy:0,cols:10,rows:10};
      const hero=e.units.find(u=>u.side==='player'),foe=e.units.find(u=>u.side==='enemy');
      const want=e.hexCenter(x,y).cx>e.hexCenter(4,4).cx?1:-1;
      const a={type:'combat',att:foe.id,def:hero.id,stage:'recover',t:0,noCounter:false,customDice:null,counterCustomDice:null};
      hero.facing=-want;e.active=a;e.stepCombat(a,0.2);
      assert(a.stage==='counterLunge'&&hero.facing===want,`Counter entry ${classId} ${x},${y}`);
      for(const stage of ['counterLunge','counterHit','counterRecover']){a.stage=stage;hero.facing=-want;e.unitVisual(hero,34);assert(hero.facing===want,`Counter pose ${classId} ${stage}`);}
      cases++;
    }
    const scene=new THREE.Scene(),system=new MagicMissileV2VFX(scene);
    let parts=0;system.root.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])assert(!m.depthTest&&!m.depthWrite&&m.transparent,'Missile depth/layer');assert(o.renderOrder>2,'Missile draw priority');parts++;}});
    system.dispose();
    const r=Object.assign(Object.create(ThreeBattleRenderer.prototype),{activeMagicMissileV2VfxRequestId:null,pendingMagicMissileV2VfxRequests:[],engine:{magicMissileV2VfxRequests:[]}});
    assert(!r.hasMagicMissileV2Vfx(),'Idle missile');r.engine.magicMissileV2VfxRequests.push({id:'queued'});assert(r.hasMagicMissileV2Vfx(),'Queued launch');r.engine.magicMissileV2VfxRequests=[];r.activeMagicMissileV2VfxRequestId='active';assert(r.hasMagicMissileV2Vfx(),'Active missile');
    return {counterCases:cases,foregroundMissileParts:parts};
  }));
}finally{await browser?.close();await server.close();}
