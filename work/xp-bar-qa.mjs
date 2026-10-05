// Tests the result screen's XP bar on the user's running 8080 server (never starts one).
// GrowthXpBar isn't exported, so its exact source is copied out of GameApp.tsx into a
// throwaway harness module, mounted, and its fill width sampled over time.
import {chromium} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
mkdirSync('screenshots/xp-bar',{recursive:true});
const app=readFileSync('src/game/GameApp.tsx','utf8');
const start=app.indexOf('function GrowthXpBar(');const end=app.indexOf('\nfunction ResultScreen(');
const fn=app.slice(start,end);
writeFileSync('work/xp-bar-harness.tsx',`import { useEffect, useMemo, useRef } from "react";\nimport { expToLevel } from "../src/game/data";\nexport ${fn}`);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:500,height:200}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__xp-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
try{
  await page.goto('http://127.0.0.1:8080/__xp-qa');
  const out=await page.evaluate(async()=>{
    const refresh=await import('/@react-refresh');refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
    await import('/src/styles.css');
    const React=await import('/node_modules/.vite/deps/react.js');
    const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {GrowthXpBar}=await import('/work/xp-bar-harness.tsx');
    const h=React.createElement??React.default.createElement;
    document.body.style.cssText='margin:0;background:#120e0b;padding:40px';
    const host=document.createElement('div');document.body.append(host);
    // Level 4 with 80/100 XP -> level 6 with 60/150 XP: 80%->100%, reset, 0->100%, reset, 0->40%.
    (ReactDOM.createRoot??ReactDOM.default.createRoot)(host).render(h('p',{style:{display:'flex',transform:'scale(3)',transformOrigin:'0 0'}},h(GrowthXpBar,{fromLevel:4,toLevel:6,fromXp:80,toXp:60})));
    await new Promise(r=>setTimeout(r,50));
    const fill=host.querySelector('span > span');const track=fill.parentElement;
    const samples=[];const t0=performance.now();
    while(performance.now()-t0<4200){samples.push([Math.round(performance.now()-t0),+(fill.getBoundingClientRect().width/track.getBoundingClientRect().width*100).toFixed(1)]);await new Promise(r=>requestAnimationFrame(r));}
    return samples;
  });
  let backwards=[],resets=0;
  for(let i=1;i<out.length;i++){const d=out[i][1]-out[i-1][1];if(d<-50)resets++;else if(d<-0.6)backwards.push(out[i]);}
  const peaks=out.filter((s,i)=>i&&s[1]>=99.5&&out[i-1][1]<99.5).length;
  console.log(JSON.stringify({first:out[0],final:out.at(-1),resets,timesReachedFull:peaks,backwardsSteps:backwards.slice(0,5),errors}));
  console.log(out.filter((_,i)=>i%12===0).map(s=>`${s[0]}ms:${s[1]}%`).join('  '));
  await page.screenshot({path:'screenshots/xp-bar/xp-bar-final.png'});
}finally{await browser.close();rmSync('work/xp-bar-harness.tsx',{force:true});}
