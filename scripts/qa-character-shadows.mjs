import assert from "node:assert/strict";
import { chromium } from 'playwright';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:850}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/WebSocket|vite/.test(m.text()))errors.push(m.text());});
await page.route('**/__character-shadow-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
try{await page.goto('http://localhost:8080/__character-shadow-qa');
const result=await page.evaluate(async()=>{
 const {BattleEngine}=await import('/src/game/engine.ts');const {loadGameArt,ensureSpriteArt}=await import('/src/game/assets.ts');const {ThreeBattleRenderer}=await import('/src/game/gfx/three/ThreeBattleRenderer.ts');const {decorationAnchor}=await import('/src/game/gfx/decorationAnchor.ts');const T=await import('/node_modules/.vite/deps/three.js');
 const source=await(await fetch('/src/game/gfx/three/ThreeBattleRenderer.ts')).text();const gfx=await import(source.match(/from ["']([^"']*devGfx[^"']*)["']/)[1]);gfx.setDevGfx({realShadows:true,softShadows:false,shadowResolution:4096,contactShadows:true,ambientOcclusion:true,sunAzimuth:53.13,sunElevation:45});
 const art=await loadGameArt();const mission={id:'character-qa',index:0,title:'QA',place:'',briefing:'',objective:'',win:'rout',hub:false,fog:false,mistType:'none',environment:'outdoor',timeOfDay:'day',cols:10,rows:8,layout:Array(8).fill('.'.repeat(10)),playerSpawns:[{name:'Aldric',classId:'aldric',x:3,y:4,level:3},{name:'Kael',classId:'swordsman',x:5,y:4,level:3},{name:'Neera',classId:'neera',x:7,y:4,level:3}],enemySpawns:[],neutralSpawns:[],decorations:[],elementalFx:[],bloomIntensity:0};
 const e=new BattleEngine(mission,art,{hp:{},levels:{}},1);await ensureSpriteArt(art,e.units.map(u=>u.sprite));e.activeTurnHighlight=()=>null;e.boardOverlayLayers=()=>[];e.movementPreview=()=>[];e.hover=null;e.cursor={x:-1,y:-1};e.setZoom(5);e.tacticsCamera=true;e.cameraTilt=45;e.cameraTiltSide=30;
 const c=document.createElement('canvas');document.body.append(c);const r=new ThreeBattleRenderer(c,e);r.setSize(1200,850,1);r.render(1200,850);r.render(1200,850);r.render(1200,850);window.demo={e,r,art,decorationAnchor,T};
 const program=r.renderer.properties.get(r.landscapeMaterial).currentProgram;
 const shader=r.renderer.getContext().getShaderSource(program.fragmentShader);
 console.log('CONTACT SHADER',shader.includes('max(-0.00005'),shader.match(/getShadow\([^;]+/g)?.slice(-2));
 return e.units.map(u=>{const entry=r.unitEntries.get(u.id),base=decorationAnchor(entry.img);const p=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.shadowMesh.matrixWorld);const visible=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.mesh.matrixWorld);return{name:u.name,sprite:u.sprite,base,footZ:p.z,visibleFootZ:visible.z,scale:entry.shadowMesh.scale.toArray(),image:entry.img.src, shaderPatched:shader.includes('max(-0.00005'),contact:r.groundAO.uniforms.groundContactStrength.value, footXY:[p.x,p.y], visibleXY:[visible.x,visible.y]};});
});console.log(JSON.stringify({result,errors},null,2));
for(const u of result) assert.ok(Math.abs(u.footZ+0.5)<.001, `${u.name}: caster foot row must touch the ground`);
assert.ok(Math.abs(result[0].visibleFootZ)<.1,'Aldric visible boot must be grounded');
mkdirSync('screenshots/character-shadows',{recursive:true});await page.screenshot({path:'screenshots/character-shadows/aldric-kael-neera-idle.png'});
await page.screenshot({path:'screenshots/character-shadows/aldric-closeup.png',clip:{x:510,y:320,width:240,height:300}});
const withContact=await page.screenshot();
await page.evaluate(()=>{const {r}=window.demo;r.contactShadowGroup.visible=false;r.finalComposer.render();});
const withoutContact=await page.screenshot({path:'screenshots/character-shadows/contact-off.png'});
assert.ok(!withContact.equals(withoutContact),'Contact masks must visibly affect the rendered frame');
const contactPixels=await page.evaluate(async({on,off})=>{
 const read=async(data)=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=1200;c.height=850;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(550,445,130,40).data;};
 const a=await read(on),b=await read(off);let darker=0;for(let i=0;i<a.length;i+=4)if(a[i]+a[i+1]+a[i+2]<b[i]+b[i+1]+b[i+2]-6)darker++;return darker;
},{on:withContact.toString('base64'),off:withoutContact.toString('base64')});
assert.ok(contactPixels>10,'Aldric contact must visibly darken the ground immediately beneath his boots');
console.log('Aldric boot contact pixels:',contactPixels);
await page.evaluate(()=>{const {r}=window.demo;r.contactShadowGroup.visible=true;r.finalComposer.render();});
const animation=await page.evaluate(()=>{
 const {e,r,decorationAnchor,T}=window.demo;const samples=[];
 const measure=()=>{r.render(1200,850);for(const u of e.units){const entry=r.unitEntries.get(u.id),base=decorationAnchor(entry.img);for(const x of [base.u0,base.u1]){const point=new T.Vector3(x-.5,.5-base.v,0).applyMatrix4(entry.shadowMesh.matrixWorld);const foot=new T.Vector3(x-.5,.5-base.v,0).applyMatrix4(entry.mesh.matrixWorld);const ground=e.tacticsCamera ? r.landscape.heightAt(foot.x,foot.y):0;samples.push({name:u.name,yaw:e.cameraTiltSide,frame:entry.img.src,z:point.z-ground});}}};
 for(const yaw of [-60,0,30,90]){e.cameraTiltSide=yaw;measure();}
 r.timeOfDay='brightNight';measure();r.timeOfDay='day';
 e.cameraTiltSide=30;const aldric=e.units.find(u=>u.name==='Aldric');e.startSeq({type:'move',id:aldric.id,path:[{x:aldric.x,y:aldric.y},{x:aldric.x+1,y:aldric.y}]});
 for(let i=0;i<30;i++){e.tick(1/60);measure();}
 return samples;
});
assert.ok(animation.every(p=>Math.abs(p.z+0.5)<.001),'Foot rows must remain level while rotating and walking');
await page.screenshot({path:'screenshots/character-shadows/aldric-walking.png'});
const raised=await page.evaluate(async()=>{
 const {BattleEngine}=await import('/src/game/engine.ts');const {ThreeBattleRenderer}=await import('/src/game/gfx/three/ThreeBattleRenderer.ts');const {e:old,r:oldRenderer,art,decorationAnchor,T}=window.demo;
 const mission={...old.mission,id:'raised-character-qa',terrainElevations:Array(80).fill(2)};
 const e=new BattleEngine(mission,art,{hp:{},levels:{}},1);e.activeTurnHighlight=()=>null;e.boardOverlayLayers=()=>[];e.movementPreview=()=>[];e.hover=null;e.cursor={x:-1,y:-1};e.setZoom(5);e.tacticsCamera=true;e.cameraTilt=45;e.cameraTiltSide=30;
 const canvas=oldRenderer.renderer.domElement;oldRenderer.dispose();const r=new ThreeBattleRenderer(canvas,e);r.setSize(1200,850,1);for(let i=0;i<3;i++)r.render(1200,850);
 return e.units.map(u=>{const entry=r.unitEntries.get(u.id),base=decorationAnchor(entry.img);const p=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.shadowMesh.matrixWorld);const visible=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.mesh.matrixWorld);return{name:u.name,footZ:p.z,ground:r.landscape.heightAt(visible.x,visible.y)};});
});
assert.ok(raised.every(u=>Math.abs(u.footZ-u.ground+0.5)<.001),'Raised terrain must keep character casters grounded');
await page.screenshot({path:'screenshots/character-shadows/raised.png'});
console.log('Character foot anchors passed across camera turns and 30 walking frames.');
assert.deepEqual(errors,[]);
}finally{await browser.close();}



