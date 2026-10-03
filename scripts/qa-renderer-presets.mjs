// Captures the Map Editor's 2D ("Vista superior") and 3D preview against the user's
// already-running dev server. Never starts a server. Usage:
//   node scripts/qa-preview-2d.mjs <map-file-stem> <screenshot-prefix>
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

const mapStem = process.argv[2] ?? 'aldeia009';
const prefix = 'revised-presets';
const baseUrl = 'http://localhost:8080';
mkdirSync('screenshots/preview-2d', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to send error to Vite server:')) errors.push(m.text()); });
await page.route('**/__preview-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }));
await page.goto(checkedUrl(`${baseUrl}/__preview-qa`));
await page.evaluate(async (mapStem) => {
  const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
  window.__vite_plugin_react_preamble_installed__ = true;
  await import('/src/styles.css');
  const appSource=await (await fetch('/src/game/GameApp.tsx')).text();
  const reactPath=appSource.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
  const R = await import(reactPath);
  const D = await import(reactPath.replace('/react.js','/react-dom_client.js'));
  const previewPath=appSource.match(/from ["']([^"']*MapPreviewCanvas[^"']*)["']/)[1];
  const previewSource=await (await fetch(previewPath)).text();
  const rendererPath=previewSource.match(/from ["']([^"']*ThreeBattleRenderer[^"']*)["']/)[1];
  const rendererSource=await (await fetch(rendererPath)).text();
  const gfxPath=rendererSource.match(/from ["']([^"']*devGfx[^"']*)["']/)[1];
  const {ThreeBattleRenderer}=await import(rendererPath);
  window.gfx=await import(gfxPath);
  const original=ThreeBattleRenderer.prototype.render;
  ThreeBattleRenderer.prototype.render=function(...args) {
    original.apply(this,args);
    window.shadowSnapshot={type:this.renderer.shadowMap.type,resolution:this.sunLight.shadow.mapSize.x,
      pointResolution:this.pointLights[0].shadow.mapSize.x, contacts:this.contactShadowGroup.visible, receiverContact:this.groundAO.uniforms.groundContactStrength.value,
      tactical:this.engine.tacticsCamera};
  };
  const { MapEditorScreen } = await import('/src/game/GameApp.tsx');
  const { loadGameArt } = await import('/src/game/assets.ts');
  const file = await import(`/src/game/maps/${mapStem}.json`);
  const art = await loadGameArt();
  document.body.replaceChildren();
  const root = document.createElement('div'); root.style.cssText = 'height:100vh;overflow:auto'; document.body.append(root);
  (D.createRoot ?? D.default.createRoot)(root).render((R.createElement ?? R.default.createElement)(MapEditorScreen, {
    art, initialDraft: (file.default ?? file).draft, onBack: () => {}, onPlaytest: () => {}, onDraftChange: () => {},
  }));
}, mapStem);
const toggle = page.getByRole('button', { name: /^(Vista superior|Vista 3D)$/ });
await toggle.waitFor({ state: 'visible', timeout: 60000 });
await toggle.scrollIntoViewIfNeeded();
await page.waitForTimeout(4000);
const panel = toggle.locator('xpath=../..');
await panel.screenshot({ path: `screenshots/preview-2d/${prefix}-2d.png` });
await toggle.click();
await page.waitForFunction(()=>window.shadowSnapshot?.tactical,{timeout:30000});
for (const [resolution,soft,type,point] of [[1024,true,1,256],[2048,false,0,512],[4096,false,0,1024]]) {
 await page.evaluate(({resolution,soft})=>window.gfx.setDevGfx({shadowResolution:resolution,softShadows:soft,realShadows:true,contactShadows:false}),{resolution,soft});
 await page.waitForFunction(({resolution,type})=>window.shadowSnapshot.resolution===resolution&&window.shadowSnapshot.type===type,{resolution,type});
 const snapshot=await page.evaluate(()=>window.shadowSnapshot);
 assert.equal(snapshot.pointResolution,point);assert.equal(snapshot.contacts,false);
 console.log(snapshot);
}
await page.evaluate(()=>window.gfx.setDevGfx({contactShadows:true}));
await page.waitForFunction(()=>window.shadowSnapshot.receiverContact===1);
await panel.screenshot({path:`screenshots/preview-2d/${prefix}-3d-contact.png`});
await toggle.click();
await page.waitForFunction(()=>!window.shadowSnapshot.tactical && window.shadowSnapshot.receiverContact===1);
await panel.screenshot({path:`screenshots/preview-2d/${prefix}-2d-contact.png`});
assert.ok(!errors.some(e=>/THREE.WebGLProgram|shader error|ReferenceError|TypeError/.test(e)));
console.log('errors:', errors.slice(0, 20));
await browser.close();
