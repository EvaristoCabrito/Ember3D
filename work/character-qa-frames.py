from pathlib import Path
p=Path('scripts/qa-character-shadows.mjs');s=p.read_text(encoding='utf-8');s='import assert from "node:assert/strict";\n'+s;s=s.replace('r.render(1200,850);window.demo=', 'r.render(1200,850);r.render(1200,850);r.render(1200,850);window.demo=');s=s.replace("console.log(JSON.stringify({result,errors},null,2));mkdirSync", "console.log(JSON.stringify({result,errors},null,2));\nfor(const u of result) assert.ok(Math.abs(u.footZ+3)<.001, `${u.name}: caster foot row must touch the ground`);\nassert.ok(Math.abs(result[0].visibleFootZ)<.1,'Aldric visible boot must be grounded');\nmkdirSync");s=s.replace("await page.screenshot({path:'screenshots/character-shadows/current.png'});",'''await page.screenshot({path:'screenshots/character-shadows/aldric-kael-neera-idle.png'});
const animation=await page.evaluate(()=>{
 const {e,r,decorationAnchor,T}=window.demo;const samples=[];
 const measure=()=>{r.render(1200,850);for(const u of e.units){const entry=r.unitEntries.get(u.id),base=decorationAnchor(entry.img);for(const x of [base.u0,base.u1]){const point=new T.Vector3(x-.5,.5-base.v,0).applyMatrix4(entry.shadowMesh.matrixWorld);const foot=new T.Vector3(x-.5,.5-base.v,0).applyMatrix4(entry.mesh.matrixWorld);const ground=e.tacticsCamera ? r.landscape.heightAt(foot.x,foot.y):0;samples.push({name:u.name,yaw:e.cameraTiltSide,frame:entry.img.src,z:point.z-ground});}}};
 for(const yaw of [-60,0,30,90]){e.cameraTiltSide=yaw;measure();}
 e.cameraTiltSide=30;const aldric=e.units.find(u=>u.name==='Aldric');e.startSeq({type:'move',id:aldric.id,path:[{x:aldric.x,y:aldric.y},{x:aldric.x+1,y:aldric.y}]});
 for(let i=0;i<30;i++){e.tick(1/60);measure();}
 return samples;
});
assert.ok(animation.every(p=>Math.abs(p.z+3)<.001),'Foot rows must remain level while rotating and walking');
await page.screenshot({path:'screenshots/character-shadows/aldric-walking.png'});
console.log('Character foot anchors passed across camera turns and 30 walking frames.');
assert.deepEqual(errors,[]);''');p.write_text(s,encoding='utf-8')
