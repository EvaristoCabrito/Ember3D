import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
const server=await createServer({mode:'development',server:{host:'127.0.0.1',port:0}});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:600,height:400}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__missile-water',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#123"><div id="board" style="position:relative;width:600px;height:400px;isolation:isolate"><canvas id="water" width="600" height="400" style="position:absolute;inset:0"></canvas><canvas id="characters" width="600" height="400" style="position:absolute;inset:0"></canvas><canvas id="missile" style="position:absolute;inset:0;width:600px;height:400px;mix-blend-mode:screen"></canvas></div></body></html>'}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__missile-water`);
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {UnrealBloomPass}=await import('/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js');
    const {MagicMissileForeground}=await import('/src/game/gfx/three/MagicMissileForeground.ts');
    const {MagicMissileV2VFX}=await import('/src/game/gfx/three/MagicMissileV2VFX.ts');
    const assert=(c,m)=>{if(!c)throw new Error(m);};
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-150,150,100,-100,0.1,1000);camera.position.z=100;
    const unrelated=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshBasicMaterial({color:0xff0000}));unrelated.position.set(-130,80,0);scene.add(unrelated);
    scene.add(new THREE.AmbientLight(0xffffff,1));
    const system=new MagicMissileV2VFX(scene);system.setRenderLayer(MagicMissileForeground.layer);
    const surface=document.getElementById('missile'),overlay=new MagicMissileForeground(surface,scene,camera);
    const bloom=new UnrealBloomPass(new THREE.Vector2(600,400),0.7,0.2,0.8);
    const water=document.getElementById('water').getContext('2d'),characters=document.getElementById('characters').getContext('2d');
    water.fillStyle='#125fa0';water.fillRect(0,0,600,400);characters.fillStyle='#d6b57b';characters.fillRect(260,160,60,90);
    const composite=()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.drawImage(document.getElementById('water'),0,0);ctx.drawImage(document.getElementById('characters'),0,0);ctx.globalCompositeOperation='screen';ctx.drawImage(surface,0,0);return ctx.getImageData(0,0,600,400).data;};
    overlay.render(scene,camera,600,400,1,false,bloom);const baseline=composite();
    overlay.render(scene,camera,600,400,1,true,bloom);
    const emptyForeground=composite(),corner=(20*600+30)*4;
    assert(emptyForeground[corner]===baseline[corner],'Unrelated ground geometry leaked into foreground');
    system.castSpell({id:'qa',origin:new THREE.Vector3(-60,0,3),target:new THREE.Vector3(60,0,3),worldScale:24,onImpact:()=>{},onComplete:()=>{}});
    let changed=0;
    for(let i=0;i<70;i++){
      system.update(0.04);overlay.render(scene,camera,600,400,1,true,bloom);
      assert(camera.layers.mask===1,'Foreground camera mask must be restored');
      const pixels=composite();let visible=0;
      for(let p=0;p<pixels.length;p+=4)if(pixels[p]>baseline[p]+5||pixels[p+2]>baseline[p+2]+5)visible++;
      changed=Math.max(changed,visible);
      // The additive foreground must never darken or replace the character underneath.
      const hero=(205*600+290)*4;assert(pixels[hero]>=baseline[hero]&&pixels[hero+1]>=baseline[hero+1]&&pixels[hero+2]>=baseline[hero+2],'Water covered character');
    }
    assert(changed>300,'Travelling missile and impact must be visible above water');
    window.__overlay=overlay;window.__scene=scene;window.__camera=camera;window.__bloom=bloom;
    return {visibleMissilePixels:changed,framesChecked:70};
  });
  fs.mkdirSync('artifacts/missile-water',{recursive:true});await page.screenshot({path:'artifacts/missile-water/foreground.png'});
  await page.evaluate(()=>{
    window.__overlay.render(window.__scene,window.__camera,600,400,1,false,window.__bloom);
    const c=document.createElement('canvas');c.width=600;c.height=400;const ctx=c.getContext('2d');ctx.drawImage(document.getElementById('missile'),0,0);
    if(ctx.getImageData(0,0,600,400).data.some((v,i)=>i%4===3&&v))throw new Error('Stale foreground after impact');
    window.__overlay.dispose();window.__bloom.dispose();
  });
  if(errors.length)throw new Error(errors.join('\n'));console.log(result);
}finally{await browser?.close();await server.close();}
