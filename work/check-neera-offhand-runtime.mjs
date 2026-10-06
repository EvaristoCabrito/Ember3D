import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1000,height:800}});
await p.route('**/__neera-idle-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
try {
await p.goto('http://localhost:8081/__neera-idle-qa');
const result=await p.evaluate(async()=>{
const {BattleEngine}=await import('/src/game/engine.ts');const {loadGameArt,ensureSpriteArt}=await import('/src/game/assets.ts');const {ThreeBattleRenderer}=await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
const art=await loadGameArt();await ensureSpriteArt(art,['neera','kaelFinal','voss','salazar','aldric']);
const mission={id:'neera-idle-qa',index:0,title:'QA',place:'',briefing:'',objective:'',win:'rout',hub:false,fog:false,mistType:'none',environment:'outdoor',timeOfDay:'day',cols:8,rows:6,layout:Array(6).fill('.'.repeat(8)),playerSpawns:[{name:'Neera',classId:'neera',x:4,y:3,level:3},...['kaelFinal','voss','salazar','aldric'].map((classId,i)=>({name:classId,classId,x:i+1,y:2,level:3}))],enemySpawns:[],neutralSpawns:[],decorations:[],elementalFx:[],bloomIntensity:0};
const e=new BattleEngine(mission,art,{hp:{},levels:{}},1);e.active=null;e.activeTurnHighlight=()=>null;e.boardOverlayLayers=()=>[];e.movementPreview=()=>[];e.hover=null;e.cursor={x:-1,y:-1};e.setZoom(4);e.tacticsCamera=true;e.cameraTilt=45;e.cameraTiltSide=30;
const c=document.createElement('canvas');document.body.append(c);const r=new ThreeBattleRenderer(c,e);r.setSize(1000,800,1);const u=e.units.find(u=>u.sprite==='neera');
const samples=[];
for(const counter of [false,true])for(const facing of [1,-1])for(const stage of ['lunge','hit','recover']){
 u.facing=facing;u.faceDx=facing;u.faceDy=0;
 const n=stage==='lunge'?18:9;const duration=stage==='lunge'?.2:stage==='hit'?.18:.16;
 for(let i=0;i<n;i++){
 e.active={type:'combat',att:counter?'enemy':u.id,def:counter?u.id:'enemy',stage:counter?'counter'+stage[0].toUpperCase()+stage.slice(1):stage,t:(i+.01)*duration/n,customDice:counter?null:{dice:1,faces:4,bonus:0},counterCustomDice:counter?{dice:1,faces:4,bonus:0}:null};
 const v=e.unitVisual(u,40);samples.push({counter,facing,src:v.img.src,scaleX:v.scaleX,scaleY:v.scaleY,pixelScale:v.h/v.img.naturalHeight,aspect:v.w/v.h,sourceAspect:v.img.naturalWidth/v.img.naturalHeight});
 }
}
e.active={type:'combat',att:u.id,def:'enemy',stage:'hit',t:.02,customDice:{dice:1,faces:4,bonus:0}};u.facing=1;u.faceDx=1;r.render(1000,800);window.offhandQA={e,r,u};
return samples;
});
for(const sample of result){assert.ok(sample.src.includes('/neera-v2-001/atk-short-'));assert.equal(sample.scaleY,1);assert.equal(Math.sign(sample.scaleX),sample.facing);assert.ok(Math.abs(sample.aspect-sample.sourceAspect)<1e-9);assert.ok(Math.abs(sample.pixelScale-40*Math.sqrt(3)*1.53/675)<1e-9);}
for(const counter of [false,true])for(const facing of [1,-1])assert.equal(new Set(result.filter(x=>x.counter===counter&&x.facing===facing).map(x=>x.src)).size,36);
await p.screenshot({path:'work/neera-offhand-runtime.png'});
await p.evaluate(()=>{const {e,r,u}=window.offhandQA;u.facing=-1;u.faceDx=-1;e.active={type:'combat',att:'enemy',def:u.id,stage:'counterHit',t:.02,counterCustomDice:{dice:1,faces:4,bonus:0}};r.render(1000,800);});
await p.screenshot({path:'work/neera-offhand-counter-runtime.png'});
console.log('PASS: all 36 off-hand frames, attack and counter, both facings; fixed scale, natural proportions, no squash.');
}finally{await b.close();}
