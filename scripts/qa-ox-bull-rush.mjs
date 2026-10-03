import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try {
 const {BattleEngine}=await server.ssrLoadModule('/src/game/engine.ts');
 const {CLASSES,bullRushPower}=await server.ssrLoadModule('/src/game/data.ts');
 const {footprint}=await server.ssrLoadModule('/src/game/pathfinding.ts');
 const engine=Object.create(BattleEngine.prototype);
 const ox={id:'ox',classId:'bigBlueCalf',sprite:'big-blue-ox-002',alive:true,acted:false,side:'enemy',x:1,y:3,level:7,size:2,footprintOffsets:CLASSES.bigBlueCalf.footprintOffsets,spells:{tier1:3}};
 const foe={id:'foe',alive:true,side:'player',x:4,y:3,size:1,hp:30};
 Object.assign(engine,{occCache:null,occStamp:[],cols:12,rows:8,tiles:Array(96).fill('plains'),decorOverlay:new Uint8Array(0),units:[ox,foe],queue:[],chargeMoves:new WeakSet(),missileTargets:[]});
 for(let cast=0;cast<3;cast++){
  engine.queue=[];engine.castBullRush(ox,foe);
  assert.equal(ox.spells.tier1,2-cast);
  const strike=engine.queue.find(s=>s.type==='combat');assert.ok(strike);assert.equal(strike.spellKind,'bullRush');assert.equal(strike.noCounter,true);
  const power=bullRushPower(ox.level);assert.equal(strike.bonusDice,power.faces);assert.equal(strike.bonusDiceCount,power.dice);
  for(const move of engine.queue.filter(s=>s.type==='move'))for(const p of move.path)assert.ok(footprint({...ox,...p}).every(c=>c.x!==foe.x||c.y!==foe.y),'full body avoids target');
 }
 engine.queue=[];engine.castBullRush(ox,foe);assert.equal(engine.queue.length,0,'fourth cast rejected');
 ox.spells.tier1=3;engine.tiles[3*12+3]='column';assert.equal(engine.bullRushCharge(ox,foe),null,'second hex cannot pass through obstacle');
 engine.tiles.fill('plains');const ally={id:'ally',alive:true,side:'enemy',x:3,y:3,size:1};engine.units.push(ally);assert.equal(engine.bullRushCharge(ox,foe),null,'second hex cannot pass through ally');engine.units.pop();
 engine.tiles[3*12+5]='column';engine.castBullRush(ox,foe);assert.deepEqual(engine.queue.find(s=>s.type==='combat').wallImpact,{dice:1,faces:8});
 engine.art={attacks:{[ox.sprite]:Array(32).fill('normal')},attacks2:{[ox.sprite]:Array(32).fill('rush')},counters:{},attacksShort:{}};
 engine.active={type:'combat',att:ox.id,def:foe.id,stage:'lunge',spellKind:'bullRush',t:.1};assert.notEqual(engine.attackPose(ox),null,'ox rush animates');
 engine.art.deaths={[ox.sprite]:Array(32).fill('death')};engine.art.hits={[ox.sprite]:Array(32).fill('hit')};ox.alive=false;ox.diedAt=0;engine.time=0;
 assert.equal(engine.deathSheetPlaying(ox),true);engine.time=5.01;assert.equal(engine.deathSheetPlaying(ox),false,'Ox death has no extra hit-reaction lead');
 console.log('PASS: three casts, exhausted pool, warrior scaling, full footprint clearance, wall impact, charge animation, direct death playback');
} finally {await server.close();}
