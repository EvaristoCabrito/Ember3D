import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1000,height:850}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.route('**/__options-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
async function mount() {
 await page.goto('http://localhost:8080/__options-qa');
 await page.evaluate(async()=>{
  const refresh=await import('/@react-refresh');refresh.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;
  await import('/src/styles.css');
  const R=await import('/node_modules/.vite/deps/react.js');const D=await import('/node_modules/.vite/deps/react-dom_client.js');
  const {OptionsButton}=await import('/src/game/OptionsMenu.tsx');const {DialogOverlay}=await import('/src/game/DialogOverlay.tsx');
  const optionsSource=await (await fetch('/src/game/OptionsMenu.tsx')).text();
  const dependency=name=>optionsSource.match(new RegExp('from ["\']([^"\']*'+name+'[^"\']*)["\']'))[1];
  window.preferences=await import(dependency('gamePreferences.ts'));window.gfx=await import(dependency('devGfx.ts'));
  const h=R.createElement??R.default.createElement;
  (D.createRoot??D.default.createRoot)(document.body).render(h(R.Fragment??R.default.Fragment,null,h(OptionsButton,{muted:false,onMute:()=>{}}),h(DialogOverlay,{tree:{id:'qa',startId:'1',lines:[{id:'1',speaker:'Test',text:'Original Portuguese',translations:{en:'English dialogue'}}]},onClose:()=>{}})));
 });
}
try {
 await mount();
 // Dialogue overlay is absolute; launch options via JS for isolated component harness.
 await page.getByRole('button',{name:'Op\u00e7\u00f5es',exact:true}).evaluate(el=>el.click());
 const modal=page.getByRole('dialog');await modal.waitFor({state:'visible'});
 await modal.locator('select').nth(0).selectOption('en');
 await page.getByRole('heading',{name:'Options',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.preferences.getGamePreferences().dialogueLanguage),'pt');
 assert.equal(await page.evaluate(()=>window.preferences.uiText('Bola De Fogo')),'Fireball');
 await modal.getByRole('button',{name:'Low',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.gfx.getDevGfx().realShadows),true);
 await modal.getByRole('checkbox',{name:'Shadows',exact:true}).uncheck();
 await modal.getByText(/^Custom \u00b7/).waitFor();
 await modal.getByRole('slider',{name:/Music/}).fill('0.27');
 await modal.locator('select').nth(1).selectOption('en');
 assert.equal(await page.evaluate(()=>window.preferences.getGamePreferences().subtitleLanguage),'en');
 await page.evaluate(()=>window.preferences.setGamePreferences({subtitleLanguage:'pt'}));
 assert.equal(await page.evaluate(()=>window.preferences.getGamePreferences().subtitleLanguage),'en');
 mkdirSync('screenshots/options',{recursive:true});await page.screenshot({path:'screenshots/options/english-subtitles.png'});
 await modal.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByText('English dialogue',{exact:true}).waitFor();
 await page.evaluate(()=>window.preferences.setGamePreferences({dialogueLanguage:'pt'}));
 await page.getByText('Original Portuguese',{exact:true}).waitFor();
 await mount();
 assert.equal(await page.evaluate(()=>window.preferences.getGamePreferences().uiLanguage),'en');
 assert.equal(await page.evaluate(()=>window.gfx.getDevGfx().realShadows),false);
 await page.getByRole('button',{name:'Options',exact:true}).evaluate(el=>el.click());
 await page.getByRole('dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('Options, independent languages, dialogue fallback, audio, advanced graphics persistence and Escape passed.');
} finally {await browser.close();}


