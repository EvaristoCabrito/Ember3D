// Captures the Map Editor's 2D ("Vista superior") and 3D preview against the user's
// already-running dev server. Never starts a server. Usage:
//   node scripts/qa-preview-2d.mjs <map-file-stem> <screenshot-prefix>
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

const mapStem = process.argv[2] ?? 'aldeia009';
const prefix = process.argv[3] ?? 'preview2d';
const baseUrl = 'http://localhost:8080';
mkdirSync('screenshots/preview-2d', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/__preview-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }));
await page.goto(checkedUrl(`${baseUrl}/__preview-qa`));
await page.evaluate(async (mapStem) => {
  const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
  window.__vite_plugin_react_preamble_installed__ = true;
  await import('/src/styles.css');
  const R = await import('/node_modules/.vite/deps/react.js');
  const D = await import('/node_modules/.vite/deps/react-dom_client.js');
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
await page.waitForTimeout(4000);
await panel.screenshot({ path: `screenshots/preview-2d/${prefix}-3d.png` });
await toggle.click();
await page.waitForTimeout(4000);
await panel.screenshot({ path: `screenshots/preview-2d/${prefix}-2d-after-3d.png` });
console.log('errors:', errors.slice(0, 20));
await browser.close();
