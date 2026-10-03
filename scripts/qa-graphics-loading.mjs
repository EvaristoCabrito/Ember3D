import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/__graphics-qa', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
try {
  await page.goto('http://localhost:8080/__graphics-qa');
  const result = await page.evaluate(async () => {
    const assets = await import('/src/game/assets.ts');
    const quality = await import('/src/game/graphicsQuality.ts');
    const qualitySource = await (await fetch('/src/game/graphicsQuality.ts')).text();
    const gfxPath = qualitySource.match(/from ["']([^"']*devGfx\.ts[^"']*)["']/)[1];
    const gfx = await import(gfxPath);
    const art = await assets.loadGameArt();
    const bootDecor = Object.keys(art.decorations).length;
    const terrainRequests = performance.getEntriesByType('resource').filter(entry => /\/game\/tiles\//.test(entry.name)).length;
    await assets.ensureDecorationArt(art, ['city-inn-chair']);
    await assets.ensureTerrainArt(art, ['plains'], [10]);
    const loaded = art.decorations['city-inn-chair'].naturalWidth > 0 && art.tiles.plains[10].naturalWidth > 0;
    const presetResults = [];
    gfx.setDevGfx({ softShadows: true });
    for (const level of ['low', 'medium', 'high']) {
      quality.setGraphicsQuality(level);
      presetResults.push({ level, dpr: quality.graphicsDpr(), shadows: gfx.getDevGfx().realShadows, fog: gfx.getDevGfx().fogOfWar, ao: gfx.getDevGfx().ambientOcclusion, soft: gfx.getDevGfx().softShadows, resolution: gfx.getDevGfx().shadowResolution, contacts: gfx.getDevGfx().contactShadows, lights: gfx.getDevGfx().localLights });
    }
    return { bootDecor, terrainRequests, loaded, presetResults };
  });
  assert.equal(result.bootDecor, 0);
  assert.equal(result.loaded, true);
  assert.deepEqual(result.presetResults.map(p => p.dpr), [1, 1.5, 2]);
  assert.deepEqual(result.presetResults.map(p => p.shadows), [true, true, true]);
  assert.ok(result.presetResults.every(p => p.fog && p.ao && p.lights && p.contacts));
  assert.deepEqual(result.presetResults.map(p => p.soft), [true, false, false]);
  assert.deepEqual(result.presetResults.map(p => p.resolution), [1024, 2048, 4096]);
  assert.deepEqual(errors, []);
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/src/styles.css');
    const R = await import('/node_modules/.vite/deps/react.js');
    const D = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { GraphicsQualityControl } = await import('/src/game/GraphicsQualityControl.tsx');
    (D.createRoot ?? D.default.createRoot)(document.body).render((R.createElement ?? R.default.createElement)(GraphicsQualityControl));
  });
  for (const [label, id] of [['Baixa', 'low'], ['M\u00e9dia', 'medium'], ['Alta', 'high']]) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('emberash:graphicsQuality')), id);
  }
  mkdirSync('screenshots/graphics', { recursive: true });
  await page.screenshot({ path: 'screenshots/graphics/presets.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }

