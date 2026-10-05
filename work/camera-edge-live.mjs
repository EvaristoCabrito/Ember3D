// Mounts the real BattleCanvas for a real map on the user's running 8080 server (never starts one),
// pans to each corner at several zoom levels and screenshots what is actually visible.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const W=1600,H=900,missionId=process.argv[2]??'vau';
mkdirSync('screenshots/camera-edge',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:W,height:H}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__camera-edge-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
try{
  await page.goto('http://127.0.0.1:8080/__camera-edge-qa');
  await page.evaluate(async({W,H,missionId})=>{
    const refresh=await import('/@react-refresh');refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
    const {BattleCanvas}=await import('/src/game/BattleCanvas.tsx');
    const React=await import('/node_modules/.vite/deps/react.js');
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {BattleEngine}=await import('/src/game/engine.ts');
    const {loadGameArt}=await import('/src/game/assets.ts');
    const {missionById}=await import('/src/game/mapstore.ts');
    const art=await loadGameArt();
    const engine=new BattleEngine(missionById(missionId),art,{hp:{},levels:{}},1);
    engine.reducedMotion=true;
    document.body.style.cssText=`margin:0;width:${W}px;height:${H}px;background:black`;
    const host=document.createElement('div');host.style.cssText=`position:relative;width:${W}px;height:${H}px`;document.body.append(host);
    await import('/src/styles.css');
    (ReactDOM.createRoot??ReactDOM.default.createRoot)(host).render((React.createElement??React.default.createElement)(BattleCanvas,{engine,onHud:()=>{}}));
    window.__e=engine;
  },{W,H,missionId});
  await page.waitForTimeout(6000);
  const zooms=await page.evaluate(()=>window.__e.constructor.name&&[0,1,2,3]);
  for(const z of zooms){
    for(const [n,x,y] of [['topleft',-1e6,-1e6],['bottomright',1e6,1e6]]){
      const info=await page.evaluate(({z,x,y})=>{const e=window.__e;e.setZoom(z);e.restoreCamera({x,y});e.emit?.();return {zoom:e.zoom,tactics:e.tacticsCamera,camX:Math.round(e.camX),camY:Math.round(e.camY)};},{z,x,y});
      await page.waitForTimeout(900);
      await page.screenshot({path:`screenshots/camera-edge/${missionId}-z${z}-${n}.png`});
      console.log(missionId,n,JSON.stringify(info));
    }
  }
  console.log('errors',errors.slice(0,5));
}finally{await browser.close();}
