import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { readdirSync } from 'node:fs';
import { createServer } from 'vite';

const vite = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const address = vite.httpServer.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
let page;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/__editor-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }));
  await page.goto(checkedUrl(`${baseUrl}/__editor-qa`));
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/src/styles.css');
    const R = await import('/node_modules/.vite/deps/react.js');
    const D = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { MapEditorScreen } = await import('/src/game/GameApp.tsx');
    const { BattleEngine } = await import('/src/game/engine.ts');
    const { tileVariantSrc } = await import('/src/game/assets.ts');
    const { TERRAIN } = await import('/src/game/data.ts');
    const image = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const floor = await image(tileVariantSrc('nave', 0));
    const sprite = await image('/game/sprites/kael-v2/stand-1.png');
    const sprites = new Proxy({}, { get: () => [sprite] });
    const art = new Proxy({ tiles: Object.fromEntries(Object.keys(TERRAIN).map(id => [id,[floor]])), decorations: {}, sprites, impact: [] }, { get: (t,k) => t[k] ?? {} });
    const original = BattleEngine.prototype.setPreviewPanMargin;
    window.__engineBuilds = 0;
    BattleEngine.prototype.setPreviewPanMargin = function(value) { window.__previewEngine = this; window.__engineBuilds++; return original.call(this,value); };
    const draft = { id: 'qa-editor', index: 0, title: 'Editor QA', place: '', briefing: '', objective: '', win: 'rout', hub: false, autoTactics: false, fog: false, mistType: 'none', environment: 'outdoor', timeOfDay: 'day', cols: 12, rows: 12,
      tiles: Array(144).fill('nave'), tileVariants: Array(144).fill(0), tileRots: Array(144).fill(0), baseTile: 'nave', baseVariant: 0, decorations: [{ id: 'wall-3d-dungeon', x: 3, y: 6, rot: 0, wallOrientation: 'horizontal' }], elementalFx: [],
      playerSpawns: [{ name: 'Kael', classId: 'swordsman', x: 5, y: 5, level: 1 }], enemySpawns: [], neutralSpawns: [], music: '' };
    window.__draft = draft;
    document.body.replaceChildren();
    document.documentElement.style.cssText = 'height:100%;width:100%;overflow:hidden';
    document.body.style.cssText = 'height:100%;width:100%;margin:0;display:block;overflow:hidden';
    const root = document.createElement('div'); root.style.cssText = 'height:100%;width:100%'; document.body.append(root);
    (D.createRoot ?? D.default.createRoot)(root).render((R.createElement ?? R.default.createElement)(MapEditorScreen, {
      art, initialDraft: draft, onBack: () => {}, onPlaytest: () => {}, onDraftChange: d => { window.__draft = d; window.__draftAt = performance.now(); }
    }));
  });
  const cssFile = readdirSync('.vercel/output/static/assets').find(name => name.startsWith('styles-') && name.endsWith('.css'));
  await page.addStyleTag({ path: `.vercel/output/static/assets/${cssFile}` });
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '* { scroll-behavior: auto !important; } #app { height:100vh; overflow:auto; }';
    document.head.append(style);
  });
  await page.getByRole('button', { name: '3D Walls', exact: true }).evaluate(el => el.scrollIntoView());
  await page.getByRole('button', { name: '3D Walls', exact: true }).click({ timeout: 3000 });
  await page.getByRole('button', { name: 'Passagem aberta 3D', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__previewEngine);
  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const point = async (x,y) => page.evaluate(({x,y}) => {
    const e = window.__previewEngine, a = e.effectAnchor(x,y), canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect();
    const scale = 34 * .75 / a.tile;
    return { x: r.left + a.x * scale, y: r.top + a.y * scale };
  }, {x,y});
  const clickCell = async (x,y) => { const p = await point(x,y); await page.mouse.click(p.x,p.y); };
  const palette = name => page.getByRole('button', { name, exact: true });
  assert.ok(await palette('Passagem aberta 3D').isVisible());
  assert.ok(await palette('Porta fechada 3D').isVisible());
  await palette('Porta fechada 3D').click();
  await page.waitForTimeout(1500);
  const start = Date.now();
  await clickCell(3,6);
  await page.waitForFunction(() => window.__draft.decorations.length === 1 && window.__draft.decorations[0].id === 'door-3d-closed');
  await page.waitForFunction(() => window.__previewEngine.decorations[0]?.id === 'door-3d-closed');
  assert.equal(await palette('Porta fechada 3D').getAttribute('aria-pressed'), 'true', 'door brush stays selected after placement');
  const placementMs = Date.now() - start;
  console.log({ first3DPlacementMs: placementMs });
  await clickCell(3,6);
  const beforeSelection = await page.evaluate(() => window.__engineBuilds);
  const orientationStart = Date.now();
  await page.getByRole('button', { name: 'Vertical', exact: true }).click();
  await page.waitForFunction(() => window.__draft.decorations[0]?.wallOrientation === 'vertical');
  const orientationMs = Date.now() - orientationStart;
  await page.getByRole('button', { name: 'Abrir porta', exact: true }).click();
  await page.waitForFunction(() => window.__draft.decorations[0]?.id === 'door-3d-frame');
  await page.getByRole('button', { name: 'Fechar passagem', exact: true }).click();
  await page.waitForFunction(() => window.__draft.decorations[0]?.id === 'door-3d-closed');
  assert.equal(await palette('Porta fechada 3D').getAttribute('aria-pressed'), 'true', 'open/close does not move the palette brush');
  await canvas.scrollIntoViewIfNeeded();
  await clickCell(3,6);
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => window.__draft.decorations.length === 0);
  await page.waitForFunction(() => window.__previewEngine.decorations.length === 0);
  const from = await point(5,5), to = await point(7,5);
  await page.mouse.move(from.x,from.y); await page.mouse.down();
  await page.mouse.move(to.x,to.y, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => window.__draft.playerSpawns[0]?.x === 7);
  await page.waitForFunction(() => window.__previewEngine.units[0]?.x === 7);
  const unitPoint = await point(7,5);
  const builds = await page.evaluate(() => window.__engineBuilds);
  await page.mouse.click(unitPoint.x, unitPoint.y);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__engineBuilds), builds, 'selection rebuilt engine');
  await page.keyboard.press('Delete');
  await page.waitForFunction(() => window.__draft.playerSpawns.length === 0);
  await page.screenshot({ path: 'C:/Users/evari/.codex/visualizations/2026/10/01/01a0f571-4a42-7532-9a51-da27406ef7f7/map-editor-controls-qa.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ placementMs, orientationMs, doorsVisible: true, orientation: true, doorOpenClose: true, decorationDelete: true, leftUnitDrag: true, unitDeleteAfterRelease: true, selectionKeepsRenderer: true, errors }, null, 2));
} catch (error) {
  if (!page) throw error;
  console.log(JSON.stringify({ errors, builds: await page.evaluate(() => window.__engineBuilds), text: (await page.locator('body').innerText()).slice(-1500) }, null, 2));
  await page.screenshot({ path: 'C:/Users/evari/.codex/visualizations/2026/10/01/01a0f571-4a42-7532-9a51-da27406ef7f7/map-editor-controls-failure.png' });
  throw error;
} finally { await browser?.close(); await vite.close(); }
