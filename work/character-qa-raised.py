from pathlib import Path
p=Path('scripts/qa-character-shadows.mjs');s=p.read_text(encoding='utf-8').replace("image:entry.img.src", "image:entry.img.src, contact:r.groundAO.uniforms.groundContactStrength.value, footXY:[p.x,p.y], visibleXY:[visible.x,visible.y]");s=s.replace("await page.screenshot({path:'screenshots/character-shadows/aldric-walking.png'});",'''await page.screenshot({path:'screenshots/character-shadows/aldric-walking.png'});
const raised=await page.evaluate(async()=>{
 const {BattleEngine}=await import('/src/game/engine.ts');const {ThreeBattleRenderer}=await import('/src/game/gfx/three/ThreeBattleRenderer.ts');const {e:old,r:oldRenderer,art,decorationAnchor,T}=window.demo;
 const mission={...old.mission,id:'raised-character-qa',terrainElevations:Array(80).fill(2)};
 const e=new BattleEngine(mission,art,{hp:{},levels:{}},1);e.setZoom(5);e.tacticsCamera=true;e.cameraTilt=45;e.cameraTiltSide=30;
 const canvas=oldRenderer.renderer.domElement;oldRenderer.dispose();const r=new ThreeBattleRenderer(canvas,e);r.setSize(1200,850,1);for(let i=0;i<3;i++)r.render(1200,850);
 return e.units.map(u=>{const entry=r.unitEntries.get(u.id),base=decorationAnchor(entry.img);const p=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.shadowMesh.matrixWorld);const visible=new T.Vector3((base.u0+base.u1)/2-.5,.5-base.v,0).applyMatrix4(entry.mesh.matrixWorld);return{name:u.name,footZ:p.z,ground:r.landscape.heightAt(visible.x,visible.y)};});
});
assert.ok(raised.every(u=>Math.abs(u.footZ-u.ground+3)<.001),'Raised terrain must keep character casters grounded');
await page.screenshot({path:'screenshots/character-shadows/raised.png'});''');p.write_text(s,encoding='utf-8')
