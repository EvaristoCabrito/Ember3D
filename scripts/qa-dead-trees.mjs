// Places the 3D dead trees (plus the existing broadleaf/pine for scale) on Bosque and captures
// the tactics camera (real 3D models) and the normal camera (2D cutouts), battle paused.
// Runs against the user's already-running dev server on 8080. Never starts a server.
//   node scripts/qa-dead-trees.mjs <screenshot-prefix>
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

const prefix = process.argv[2] ?? 'dead-trees';
mkdirSync('screenshots/dead-trees', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/__trees-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body style="margin:0;background:#000"></body></html>' }));
await page.goto(checkedUrl('http://localhost:8080/__trees-qa'));
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
  const cy = Math.min(5, mission.rows - 4), cx = Math.floor(mission.cols / 2);
  const ids = ['tree-3d-broadleaf', 'tree-3d-dead-oak', 'tree-3d-dead-snag', 'tree-3d-twisted-stump', 'tree-3d-snowy-pine'];
  const spots = ids.map((id, i) => ({ id, x: cx - 4 + i * 2, y: cy }));
  mission.decorations = [...(mission.decorations ?? []).filter(p => !spots.some(s => Math.abs(s.x - p.x) <= 1 && Math.abs(s.y - p.y) <= 1)), ...spots];
  mission.mistType = 'none';
  const engine = new BattleEngine({ ...mission, fog: false }, art, { hp: {}, levels: {} }, 1);
  await ensureSpriteArt(art, engine.units.map(u => u.sprite));
  window.__engine = engine; window.__spot = { cx, cy };
  window.__placed = engine.decorations.filter(p => p.id.startsWith('tree-3d')).map(p => `${p.id}@${p.x},${p.y}`);
  const root = document.createElement('div'); root.style.cssText = 'position:relative;width:1400px;height:860px'; document.body.append(root);
  (D.createRoot ?? D.default.createRoot)(root).render((R.createElement ?? R.default.createElement)(BattleCanvas, { engine, onHud: () => {}, paused: true }));
});
await page.waitForTimeout(5000);
console.log('placed:', await page.evaluate(() => window.__placed));
for (const [name, tactics, tilt, side] of [['normal', false, 0, 0], ['tactics', true, 45, 30], ['tactics-turned', true, 40, 150]]) {
  await page.evaluate(([tactics, tilt, side]) => {
    const e = window.__engine; e.tacticsCamera = tactics; e.cameraTilt = tilt; e.cameraTiltSide = side;
    e.centerOn(window.__spot.cx, window.__spot.cy); e.selectedId = null; e.mode = 'idle';
  }, [tactics, tilt, side]);
  await page.waitForTimeout(6000); // GLB models stream in after the first frame
  await page.screenshot({ path: `screenshots/dead-trees/${prefix}-${name}.png` });
}
console.log('errors:', errors.filter(m => !/WebSocket|vite/.test(m)).slice(0, 10));
await browser.close();
