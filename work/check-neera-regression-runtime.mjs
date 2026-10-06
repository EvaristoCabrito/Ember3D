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
const c=document.createElement('canvas');document.body.append(c);const r=new ThreeBattleRenderer(c,e);r.setSize(1000,800,1);const u=e.units.find(u=>u.sprite==='neera');const idle=[];
for(const i of Array.from({length:36},(_,i)=>i)){u.bob=i*.098+.001;r.render(1000,800);idle.push(r.unitEntries.get(u.id)?.img?.src);}
const attacks=[];for(const alt of [false,true]){u.idleAlt=alt;u.facing=1;u.faceDx=1;u.faceDy=0;e.active={type:'combat',att:u.id,def:'qa-enemy',stage:'lunge',t:.1};attacks.push(e.unitVisual(u,40).img?.src);}
const specials=[];const windups=[];
for(const facing of [1,-1])for(const alt of [false,true]){
u.facing=facing;u.faceDx=facing;u.faceDy=0;u.idleAlt=alt;
e.active={type:'windup',id:u.id,pose:'attack',t:.3};windups.push(e.unitVisual(u,40).img?.src);
e.active={type:'windup',id:u.id,pose:'specialAttack',t:.3};specials.push(e.unitVisual(u,40).img?.src);
}
const walks=[];
for(const facing of [1,-1]){u.faceDx=facing;u.faceDy=0;u.walkPose='side';e.active={type:'move',id:u.id,path:[{x:4,y:3},{x:5,y:3}],t:.1};const v=e.unitVisual(u,40);walks.push({src:v.img?.src,scaleX:v.scaleX,facing:u.facing});}
e.active=null;u.bob=.001;r.render(1000,800);window.neeraQA={e,r,u};
const sizing=[];
for(const pose of ['idle','attack','specialAttack','move']){
const samples=[];
for(let i=0;i<36;i++){
 u.faceDx=1;u.faceDy=0;u.bob=i*.098+.001;
 e.active=pose==='idle'?null:pose==='move'?{type:'move',id:u.id,path:[{x:4,y:3},{x:5,y:3}],t:.1}:{type:'windup',id:u.id,pose,t:i*3/36+.001};
 if(pose==='move'){const steps=(i+.01)*1.5/36/.22;e.active.i=Math.floor(steps);e.active.t=(steps-Math.floor(steps))*.22;}
 const v=e.unitVisual(u,40);samples.push({src:v.img.src,pixelScale:v.h/v.img.naturalHeight,aspect:v.w/v.h,sourceAspect:v.img.naturalWidth/v.img.naturalHeight,scaleY:v.scaleY});
}
sizing.push({pose,samples});
}
e.active=null;u.bob=.001;
const humans=e.units.filter(x=>x.sprite!=='neera').map(x=>{const v=e.unitVisual(x,40);const im=v.img;const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;let top=canvas.height,bottom=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(a[(y*canvas.width+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}return {name:x.name,height:v.h*(bottom-top)/canvas.height};});
return {sizing,humans,idle,attacks,windups,specials,walks,count:art.sprites.neera.length,dimensions:[art.sprites.neera[0].naturalWidth,art.sprites.neera[0].naturalHeight]};
});console.log(JSON.stringify({humans:result.humans},null,2));for(const {pose,samples} of result.sizing){
assert.equal(new Set(samples.map(v=>v.src)).size,36,`${pose} samples every frame`);
assert.ok(samples.every(v=>Math.abs(v.aspect-v.sourceAspect)<1e-9),`${pose} preserves proportions`);
assert.ok(samples.every(v=>v.scaleY===1),`${pose} has no squash/stretch`);
assert.ok(Math.max(...samples.map(v=>v.pixelScale))-Math.min(...samples.map(v=>v.pixelScale))<1e-9,`${pose} holds fixed body scale`);
}
const target=40*Math.sqrt(3)*1.53;
for(const [pose,body] of [['idle',800],['attack',672],['specialAttack',755],['move',471]])assert.ok(Math.abs(result.sizing.find(x=>x.pose===pose).samples[0].pixelScale*body-target)<1e-8);
const hs=result.humans.map(x=>x.height).sort((a,b)=>a-b);assert.ok(Math.abs(target-(hs[1]+hs[2])/2)/target<.02);
console.log('PASS: constant body scale and natural proportions across 144 pose samples; standing heights match within 2% of the human median.');
assert.equal(result.count,36);assert.ok(result.idle.every(src=>src?.includes('/neera-v2-001/idle-')));assert.equal(new Set(result.idle).size,36);assert.ok(result.attacks.every(src=>src?.includes('/atk-')&&!src.includes('/atk2-')));
assert.ok(result.windups.every(src=>src?.includes('/atk-')));assert.ok(result.windups.some(src=>src.includes('/atk-left-')));assert.ok(result.specials.some(src=>src.includes('/atk2-left-')));assert.ok(result.walks.every(v=>v.src.includes('/neera-v2-001/move-')&&Math.sign(v.scaleX)===-v.facing));assert.ok(result.specials.every(src=>src?.includes('/atk2-')));
await p.screenshot({path:'work/neera-idle-runtime.png'});
for(const pose of ['ATT','Special','Walk']){
await p.evaluate((pose)=>{const {e,r,u}=window.neeraQA;u.faceDx=1;u.faceDy=0;e.active=pose==='Walk'?{type:'move',id:u.id,path:[{x:4,y:3},{x:5,y:3}],t:.1}:{type:'windup',id:u.id,pose:pose==='ATT'?'attack':'specialAttack',t:1};r.render(1000,800);},pose);
await p.screenshot({path:`work/neera-v2-${pose}.png`});
}
console.log('PASS: renderer displays new idle; regular ATT stays regular on both alternate turns.');
}finally{await b.close();}


