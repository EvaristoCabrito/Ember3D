import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:960,height:700}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/WebSocket|vite/.test(m.text()))errors.push(m.text());});
await page.route('**/__contact-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
try {
 await page.goto('http://localhost:8080/__contact-qa');
 const result=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');const {GroundAO}=await import('/src/game/gfx/three/ThreeGroundAO.ts');
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const renderer=new T.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.BasicShadowMap;
  const scene=new T.Scene();const camera=new T.OrthographicCamera(-64,64,64,-64,1,300);camera.position.z=150;
  const ao=new GroundAO();ao.uniforms.groundAoStrength.value=0;ao.uniforms.groundAoMap.value=new T.DataTexture(new Uint8Array([0]),1,1,T.RedFormat);ao.uniforms.groundAoMap.value.needsUpdate=true;
  const material=new T.MeshLambertMaterial({color:0xffffff});ao.patch(material);
  const ground=new T.Mesh(new T.PlaneGeometry(128,128),material);ground.receiveShadow=true;scene.add(ground);
  const caster=new T.Mesh(new T.BoxGeometry(20,20,20),new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,shadowSide:T.DoubleSide}));caster.position.z=10;caster.castShadow=true;scene.add(caster);
  const light=new T.DirectionalLight(0xffffff,1);light.position.set(-1200,1600,2000);light.castShadow=true;light.shadow.bias=-.0015;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:10,far:4400});light.shadow.camera.updateProjectionMatrix();scene.add(light);scene.add(new T.AmbientLight(0xffffff,.25));
  const gl=renderer.getContext();function brightness(x,y){const p=new Uint8Array(4);gl.readPixels(Math.floor((x+64)*2),Math.floor((y+64)*2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p[0];}
  ao.uniforms.groundContactStrength.value=0;renderer.render(scene,camera);const off=Array.from({length:12},(_,i)=>brightness(-9.75+i*.5,0));
  ao.uniforms.groundContactStrength.value=1;renderer.render(scene,camera);const on=Array.from({length:12},(_,i)=>brightness(-9.75+i*.5,0));
  const outside=brightness(40,40);const center=brightness(0,0);
  // Rotate the sky light to the opposite side, as happens when the moon is used.
  light.position.set(1200,1600,2000);renderer.render(scene,camera);
  const opposite=brightness(9.75,0);light.position.set(-1200,1600,2000);
  // Raise the receiver and caster together; the correction must use receiver depth, not z=0.
  ground.position.z=12;caster.position.z=22;renderer.render(scene,camera);
  const raised=brightness(-9.75,0);ground.position.z=0;caster.position.z=10;
  const point=new T.PointLight(0xffffff,1000,100,2);point.position.set(-25,20,40);point.castShadow=true;point.shadow.bias=-.003;scene.add(point);renderer.render(scene,camera);
  renderer.shadowMap.type=T.PCFShadowMap;renderer.render(scene,camera);
  renderer.dispose();canvas.remove();
  const {ThreeTrees}=await import('/src/game/gfx/three/ThreeTrees.ts');const trees=new ThreeTrees();trees.create('tavern-chair',30);trees.create('grey-outcrop',30);
  await new Promise((resolve,reject)=>{const until=performance.now()+20000;const poll=()=>{if(trees.revision>=2)resolve();else if(performance.now()>until)reject(new Error('Models did not load'));else setTimeout(poll,50);};poll();});
  const c=document.createElement('canvas');document.body.append(c);const r=new T.WebGLRenderer({canvas:c,antialias:true,preserveDrawingBuffer:true});r.setSize(960,700);r.setClearColor(0x303438);r.shadowMap.enabled=true;r.shadowMap.type=T.BasicShadowMap;
  const s=new T.Scene();const cam=new T.OrthographicCamera(-115,115,84,-84,.1,1000);cam.up.set(0,0,1);cam.position.set(125,-180,165);cam.lookAt(0,0,22);
  s.add(new T.AmbientLight(0xffffff,.4));const sun=new T.DirectionalLight(0xfff2df,2);sun.position.set(-1200,1600,2000);sun.castShadow=true;sun.shadow.bias=-.0015;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-170,right:170,top:170,bottom:-170,near:10,far:4400});sun.shadow.camera.updateProjectionMatrix();s.add(sun);
  const receiver=new GroundAO();receiver.uniforms.groundAoStrength.value=0;receiver.uniforms.groundAoMap.value=ao.uniforms.groundAoMap.value;
  const floorMat=new T.MeshLambertMaterial({color:0xa0a3a0});receiver.patch(floorMat);const floor=new T.Mesh(new T.PlaneGeometry(500,500),floorMat);floor.receiveShadow=true;s.add(floor);
  for(const [kind,x] of [['tavern-chair',-46],['grey-outcrop',40]]){const model=trees.create(kind,30);model.position.x=x;model.rotation.z=.3;s.add(model);}
  r.render(s,cam);window.contactDemo={r,s,cam,receiver};return {off,on,outside,center,opposite,raised};
 });
 assert.ok(result.on[0]<result.off[0],'Shadow must attach to the foot edge');
 assert.ok(result.on.every(v=>v<result.outside-10),'Contact band must be continuous with no light holes');
 assert.ok(result.center<result.outside-10,'Solid caster interior must be shadowed');
 assert.ok(result.raised<result.outside-10 && result.opposite<result.outside-10,'Raised receivers and opposite sky direction must stay attached');
 mkdirSync('screenshots/contact-shadows',{recursive:true});await page.screenshot({path:'screenshots/contact-shadows/receiver-attached.png'});
 await page.evaluate(()=>{const {r,s,cam,receiver}=window.contactDemo;receiver.uniforms.groundContactStrength.value=0;r.render(s,cam);});await page.screenshot({path:'screenshots/contact-shadows/receiver-before.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
} finally {await browser.close();}



