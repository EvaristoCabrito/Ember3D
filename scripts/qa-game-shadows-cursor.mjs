import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const vite = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0, hmr: false } });
await vite.listen();
let browser;
try {
  const address = vite.httpServer.address();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  const transportWarnings = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // The browser blocks Vite's localhost hot-reload socket in this test surface.
    // Record that transport issue separately from application and shader errors.
    const message = m.text();
    if (message.startsWith('WebSocket connection to ') || message.startsWith('[vite] failed to connect to websocket.') || message.startsWith('Failed to send error to Vite server:')) transportWarnings.push(message);
    else errors.push(message);
  });
  await page.route('**/__game-shadow-qa', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(`http://127.0.0.1:${address.port}/__game-shadow-qa`);
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh');
    refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t;
    window.__vite_plugin_react_preamble_installed__ = true;
    const { BattleCanvas } = await import('/src/game/BattleCanvas.tsx');
    const React = await import('/node_modules/.vite/deps/react.js');
    const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { BattleEngine } = await import('/src/game/engine.ts');
    const { ThreeBattleRenderer } = await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const { configureWallDepth } = await import('/src/game/gfx/three/ThreeWalls.ts');
    const { draftToMission } = await import('/src/game/mapstore.ts');
    const { tileVariantSrc } = await import('/src/game/assets.ts');
    const file = (await import('/src/game/maps/teste-house001.json')).default;
    const load = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const floor = await load(tileVariantSrc('plains', 0));
    const soldier = await load('/game/sprites/soldier/1.png');
    const neera = await load('/game/sprites/neera/atk-1.png');
    await load('/game/cursors/medieval-gauntlet-grab.png');
    const art = new Proxy({ tiles: { plains: [floor] }, decorations: {}, sprites: { soldier: [soldier], neera: [neera] }, impact: [] }, { get: (t, k) => t[k] ?? {} });
    const mission = draftToMission(file.draft);
    mission.playerSpawns = mission.playerSpawns.filter(p => p.name === 'Neera');
    mission.autoTactics = false;
    const engine = new BattleEngine(mission, art, { hp: {}, levels: {} }, 1);
    engine.reducedMotion = true;
    engine.units.forEach(u => { u.fade = 1; });
    engine.units.find(u => u.name === 'Neera').x = 8;
    engine.units.find(u => u.name === 'Neera').y = 5;
    engine.tick = () => {};
    engine.setZoom(2);
    engine.updateCameraLayout(1100, 800);
    engine.centerOn(10, 5);
    const originalRender = ThreeBattleRenderer.prototype.render;
    ThreeBattleRenderer.prototype.render = function(...args) { window.__gameRenderer = this; return originalRender.apply(this, args); };
    document.body.style.cssText = 'margin:0;width:1100px;height:800px;background:black';
    const host = document.createElement('div'); host.style.cssText = 'position:relative;width:1100px;height:800px';
    document.body.append(host);
    // Tailwind is needed for the real component's canvas stack and pointer event behavior.
    await import('/src/styles.css');
    (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host).render((React.createElement ?? React.default.createElement)(BattleCanvas, { engine, onHud: () => {} }));
    window.__shadowQA = { engine, configureWallDepth };
  });
  await page.waitForFunction(() => window.__gameRenderer?.wallEntries.length > 0);
  await page.waitForTimeout(1200);
  const output = 'C:/Users/evari/.codex/visualizations/2026/10/01/01a0f571-4a42-7532-9a51-da27406ef7f7';
  await page.evaluate(() => {
    const renderer = window.__gameRenderer;
    for (const entry of renderer.wallEntries) {
      const original = entry.mesh.material.onBeforeCompile;
      entry.mesh.material.onBeforeCompile = (shader, gl) => {
        original(shader, gl);
        shader.vertexShader = shader.vertexShader
          .replace('worldPosition.y -= transformed.z * 3.5;', '')
          .replace('worldPosition.z -= 1.0;', '')
          .replace(/vec4 physicalPosition = modelMatrix[^;]+;\s*physicalPosition.z -= 1.0;\s*vViewPosition = -\(viewMatrix \* physicalPosition\).xyz;/, 'vViewPosition = - mvPosition.xyz;');
        shader.fragmentShader = shader.fragmentShader.replace('float dotNL = dot( normal, (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz );', 'float dotNL = dot( normal, hemiLight.direction );');
      };
      entry.mesh.material.customProgramCacheKey = () => 'qa-old-wall-shadows';
      entry.mesh.material.needsUpdate = true;
      entry.mesh.castShadow = true;
      entry.shadowMesh.castShadow = false;
    }
    renderer.render(1100,800);
    const c = document.createElement('canvas'); c.width = 1100; c.height = 800;
    const ctx = c.getContext('2d'); ctx.drawImage(renderer.renderer.domElement, 0, 0);
    window.__oldShadowPixels = ctx.getImageData(0,0,1100,800).data;
  });
  await page.screenshot({ path: `${output}/game-shadows-before.png` });
  const difference = await page.evaluate(() => {
    const renderer = window.__gameRenderer;
    const tile = window.__shadowQA.engine.updateCameraLayout(1100,800);
    for (const entry of renderer.wallEntries) {
      window.__shadowQA.configureWallDepth(entry.mesh.material, tile, 1, .004);
      entry.mesh.material.needsUpdate = true;
      entry.mesh.castShadow = false;
      entry.shadowMesh.castShadow = true;
    }
    renderer.render(1100,800);
    const c = document.createElement('canvas'); c.width = 1100; c.height = 800;
    const ctx = c.getContext('2d'); ctx.drawImage(renderer.renderer.domElement, 0, 0);
    const current = ctx.getImageData(0,0,1100,800).data;
    let changed = 0;
    for (let i=0; i<current.length; i+=4) if (Math.abs(current[i]-window.__oldShadowPixels[i]) + Math.abs(current[i+1]-window.__oldShadowPixels[i+1]) + Math.abs(current[i+2]-window.__oldShadowPixels[i+2]) > 12) changed++;
    return changed;
  });
  await page.screenshot({ path: `${output}/game-shadows-after.png` });
  await page.mouse.move(550,600); await page.mouse.down();
  await page.waitForTimeout(650);
  const grabbing = await page.locator('canvas').first().evaluate(c => getComputedStyle(c).cursor);
  await page.mouse.move(565,605); await page.mouse.up();
  const released = await page.locator('canvas').first().evaluate(c => getComputedStyle(c).cursor);
  assert.ok(grabbing.includes('medieval-gauntlet-grab.png'), 'gameplay uses gauntlet during pan');
  assert.ok(!released.includes('medieval-gauntlet-grab.png'), 'gameplay restores cursor after pan');
  assert.ok(difference > 100, 'physical shadow correction changes visible gameplay pixels');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ changedShadowPixels: difference, grabbing, released, errors, developmentTransportWarnings: transportWarnings.length }, null, 2));
} finally { await browser?.close(); await vite.close(); }
