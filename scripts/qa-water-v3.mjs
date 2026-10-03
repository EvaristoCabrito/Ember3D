// Renders a real battle scene (BattleCanvas + ThreeBattleRenderer) on Bosque with a painted
// 3D-water pond, comparing water versions in the normal and tactics cameras. Runs against
// the user's already-running dev server on 8080. Never starts a server.
//   node scripts/qa-water-v3.mjs <screenshot-prefix> [versions comma list]
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

const prefix = process.argv[2] ?? 'water';
const versions = (process.argv[3] ?? 'v2,v3').split(',');
mkdirSync('screenshots/water-v3', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/__water-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body style="margin:0;background:#000"></body></html>' }));
await page.goto(checkedUrl('http://localhost:8080/__water-qa'));
await page.evaluate(async (firstVersion) => {
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
  // Paint a pond: every cell within 3.2 hexes of a point near the party's start.
  const cx = Math.floor(mission.cols / 2), cy = Math.min(5, mission.rows - 4);
  const center = { x: Math.sqrt(3) * (cx + 0.5 * (cy & 1) + 0.5), y: 1.5 * cy };
  mission.waterLevels = Array.from({ length: mission.cols * mission.rows }, (_, i) => {
    const col = i % mission.cols, row = Math.floor(i / mission.cols);
    const x = Math.sqrt(3) * (col + 0.5 * (row & 1) + 0.5), y = 1.5 * row;
    return Math.hypot(x - center.x, y - center.y) <= 3.2 * Math.sqrt(3) ? 0 : null;
  });
  mission.waterVersion = firstVersion;
  // Judge the water itself: no mist veil over it.
  mission.mistType = 'none';
  const engine = new BattleEngine({ ...mission, fog: false }, art, { hp: {}, levels: {} }, 1);
  await ensureSpriteArt(art, engine.units.map(u => u.sprite));
  window.__engine = engine;
  window.__pond = { cx, cy };
  const root = document.createElement('div'); root.style.cssText = 'position:relative;width:1400px;height:860px'; document.body.append(root);
  (D.createRoot ?? D.default.createRoot)(root).render((R.createElement ?? R.default.createElement)(BattleCanvas, { engine, onHud: () => {}, paused: true }));
}, versions[0]);
await page.waitForTimeout(5000);

for (const version of versions) {
  await page.evaluate((v) => { window.__engine.mission.waterVersion = v; }, version);
  for (const [name, tactics, tilt, side] of [['normal', false, 0, 0], ['tactics', true, 45, 30]]) {
    await page.evaluate(([tactics, tilt, side]) => {
      const e = window.__engine; e.tacticsCamera = tactics; e.cameraTilt = tilt; e.cameraTiltSide = side;
      e.centerOn(window.__pond.cx, window.__pond.cy);
      // No selected unit, so no movement grid drawn over the pond.
      e.selectedId = null; e.mode = 'idle';
    }, [tactics, tilt, side]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/water-v3/${prefix}-${version}-${name}.png` });
    await page.screenshot({ path: `screenshots/water-v3/${prefix}-${version}-${name}-zoom.png`, clip: { x: 400, y: 180, width: 600, height: 440 } });
  }
}
console.log('errors:', errors.filter(m => !/WebSocket|vite/.test(m)).slice(0, 10));
await browser.close();
