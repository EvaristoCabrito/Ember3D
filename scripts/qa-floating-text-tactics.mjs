// Mounts the real BattleCanvas, switches to the tactics camera and pops floating combat text
// ("Missed", damage) over units, capturing screenshots at several camera angles. Runs against
// the user's already-running dev server on 8080. Never starts a server.
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/floating-text-tactics', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/__float-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body style="margin:0;background:#000"></body></html>' }));
await page.goto(checkedUrl('http://localhost:8080/__float-qa'));
await page.evaluate(async () => {
  const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
  window.__vite_plugin_react_preamble_installed__ = true;
  await import('/src/styles.css');
  const R = await import('/node_modules/.vite/deps/react.js');
  const D = await import('/node_modules/.vite/deps/react-dom_client.js');
  const { BattleCanvas } = await import('/src/game/BattleCanvas.tsx');
  const { BattleEngine } = await import('/src/game/engine.ts');
  const { loadGameArt, ensureSpriteArt } = await import('/src/game/assets.ts');
  const { draftToMission } = await import('/src/game/mapstore.ts');
  const file = await import('/src/game/maps/bosque004.json');
  const art = await loadGameArt();
  const mission = draftToMission((file.default ?? file).draft);
  const engine = new BattleEngine({ ...mission, fog: false }, art, { hp: {}, levels: {} }, 1);
  await ensureSpriteArt(art, engine.units.map(u => u.sprite));
  window.__engine = engine;
  const root = document.createElement('div'); root.style.cssText = 'position:relative;width:1400px;height:860px'; document.body.append(root);
  (D.createRoot ?? D.default.createRoot)(root).render((R.createElement ?? R.default.createElement)(BattleCanvas, { engine, onHud: () => {} }));
});
await page.waitForTimeout(5000);

const pop = () => page.evaluate(() => {
  const e = window.__engine;
  const players = e.units.filter(u => u.side === 'player' && u.alive);
  e.spawnMiss(players[0]);
  if (players[1]) e.spawnHit(players[1], 7, false);
  if (players[2]) e.spawnHit(players[2], 12, true);
  e.centerOnUnit?.(players[0].x, players[0].y);
});
const prefix = process.argv[2] ? `${process.argv[2]}-` : '';
// Let earlier text expire, pop once, then capture early and late in the same rise.
const shot = async (name) => {
  await page.waitForTimeout(2200);
  await pop();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `screenshots/floating-text-tactics/${prefix}${name}-early.png` });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `screenshots/floating-text-tactics/${prefix}${name}-late.png` });
};
await shot('normal-camera');
for (const [tilt, side] of [[45, 30], [45, 150], [35, 270]]) {
  await page.evaluate(([tilt, side]) => { const e = window.__engine; e.tacticsCamera = true; e.cameraTilt = tilt; e.cameraTiltSide = side; }, [tilt, side]);
  await page.waitForTimeout(1500);
  await shot(`tactics-tilt${tilt}-turn${side}`);
}
console.log('errors:', errors.filter(m => !/WebSocket|vite/.test(m)).slice(0, 10));
await browser.close();
