// Mounts the real OverworldMapScreen on the user's running 8080 server (never starts one),
// opens the Party dialog and screenshots it, plus the leader token on the world map.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
mkdirSync('screenshots/party-menu',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1500,height:950}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/WebSocket|vite/.test(m.text()))errors.push(m.text());});
await page.route('**/__party-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
try{
  await page.goto('http://127.0.0.1:8080/__party-qa');
  await page.evaluate(async()=>{
    const refresh=await import('/@react-refresh');refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
    const React=await import('/node_modules/.vite/deps/react.js');
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {OverworldMapScreen}=await import('/src/game/OverworldMapScreen.tsx');
    const {emptySave}=await import('/src/game/save.ts');
    const {WORLD_LOCATIONS}=await import('/src/game/data.ts');
    await import('/src/styles.css');
    const h=React.createElement??React.default.createElement;
    const base=emptySave();
    let save={...base,flags:['recruited:Neera','recruited:Voss','recruited:Salazar','recruited:Aldric','recruited:Malrec'],partyLeader:'Neera',
      affinityScores:{'Kael|Neera':12.5,'Neera|Voss':55,'Kael|Voss':82,'Aldric|Malrec':93}};
    document.body.style.cssText='margin:0;width:1500px;height:950px;background:black';
    const host=document.createElement('div');host.style.cssText='position:relative;width:1500px;height:950px;overflow:hidden';document.body.append(host);
    const root=(ReactDOM.createRoot??ReactDOM.default.createRoot)(host);
    const render=()=>root.render(h(OverworldMapScreen,{locations:WORLD_LOCATIONS,status:()=>'available',missionStatus:()=>'available',ember:0,test:false,muted:true,onMute(){},
      overworldPos:base.overworldPos,gameClock:0,rations:3,hungerStreak:0,heroHunger:{},save,onUseRation(){},onOpenStatus(){},event:null,onDismissEvent(){},onStep(){},onBack(){},onPick(){},
      onSaveFormation(order){save={...save,partyFormation:order};render();},onSaveLeader(hero){save={...save,partyLeader:hero};window.__leader=hero;render();}}));
    render();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({path:'screenshots/party-menu/map-token-neera.png'});
  await page.getByRole('button',{name:'Party',exact:true}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:'screenshots/party-menu/party-dialog-top.png'});
  // swap Frente 1 with Retaguarda 4
  await page.getByRole('button',{name:/^Frente, posição 1/}).click();
  await page.getByRole('button',{name:/^Retaguarda, posição 4/}).click();
  const after=await page.getByRole('group',{name:'Mapa da formação'}).getByRole('button').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label')));
  await page.getByRole('button',{name:'Voss',exact:true}).click();
  await page.waitForTimeout(300);
  const kicker=await page.locator('#party-title').locator('xpath=..').innerText();
  await page.locator('[role=dialog] .overflow-y-auto').evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.waitForTimeout(300);
  await page.screenshot({path:'screenshots/party-menu/party-dialog-bottom.png'});
  console.log(JSON.stringify({after,leaderClicked:await page.evaluate(()=>window.__leader),kicker,errors},null,1));
}finally{await browser.close();}
