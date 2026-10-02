// Checks that attackers/shooters face their target and defenders face the attacker when a
// combat step starts — including targets in the same column on a staggered row. Runs against
// the user's already-running dev server on 8080. Never starts a server.
import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/combat-facing', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/__facing-qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body style="margin:0;background:#000"></body></html>' }));
await page.goto(checkedUrl('http://localhost:8080/__facing-qa'));
const result = await page.evaluate(async () => {
  const { BattleEngine } = await import('/src/game/engine.ts');
  const { loadGameArt, ensureSpriteArt } = await import('/src/game/assets.ts');
  const { WebGL2DRenderer } = await import('/src/game/gfx/WebGL2DRenderer.ts');
  const art = await loadGameArt();
  window.__art = art;
  const mission = (players, enemies) => ({ id: 'qa-facing', index: 0, title: 'QA', place: '', briefing: '', objective: '', win: 'rout', hub: false, autoTactics: false, fog: false,
    mistType: 'none', environment: 'outdoor', timeOfDay: 'day', cols: 12, rows: 10, layout: Array(10).fill('.'.repeat(12)), tiles: undefined,
    playerSpawns: players, enemySpawns: enemies, neutralSpawns: [], decorations: [], elementalFx: [] });
  // [attacker class, attacker pos, defender class, defender pos]
  const cases = [
    ['neera', [4, 4], 'archer', [4, 6]],   // same column, both even rows: straight down
    ['neera', [4, 4], 'archer', [4, 5]],   // same column, odd row: screen-right
    ['neera', [5, 5], 'archer', [5, 4]],   // same column from odd row: screen-left
    ['neera', [6, 4], 'brigand', [2, 4]],  // plain left
    ['neera', [2, 4], 'cultist', [7, 6]],  // plain right
    ['archer', [6, 5], 'cultist', [6, 3]], // generic archer (was never turned before)
    ['swordsman', [5, 4], 'brigand', [5, 5]],
    ['swordsman', [5, 5], 'brigand', [5, 4]],
  ];
  const canvas = document.createElement('canvas');
  const ctx = new WebGL2DRenderer(canvas);
  const out = [];
  for (const [ac, [ax, ay], dc, [dx, dy]] of cases) {
    const e = new BattleEngine(mission([{ name: 'A', classId: ac, x: ax, y: ay, level: 3 }], [{ name: 'D', classId: dc, x: dx, y: dy, level: 3 }]), art, { hp: {}, levels: {} }, 1);
    canvas.width = 1000; canvas.height = 800; ctx.setSize(1000, 800);
    e.renderGround(ctx, 1000, 800, 1);
    const a = e.units.find(u => u.side === 'player'), d = e.units.find(u => u.side === 'enemy');
    const cxA = e.hexCenter(a.x, a.y).cx, cxD = e.hexCenter(d.x, d.y).cx;
    const want = cxD > cxA ? 1 : cxD < cxA ? -1 : null;
    // Deliberately start both facing the wrong way.
    a.facing = want === 1 ? -1 : 1; d.facing = want === 1 ? 1 : -1;
    e.reducedMotion = true;
    e.startSeq({ type: 'combat', att: a.id, def: d.id });
    out.push({ case: `${ac}(${ax},${ay}) -> ${dc}(${dx},${dy})`, screenDx: Math.round(cxD - cxA), attackerFacing: a.facing, defenderFacing: d.facing,
      ok: want === null || (a.facing === want && d.facing === -want) });
  }
  return out;
});
console.table(result);
console.log('all ok:', result.every(r => r.ok));

// Visual: Neera shooting a same-column enemy on an offset row, then that enemy countering.
await page.evaluate(async () => {
  const { BattleEngine } = await import('/src/game/engine.ts');
  const { ensureSpriteArt } = await import('/src/game/assets.ts');
  const { WebGL2DRenderer } = await import('/src/game/gfx/WebGL2DRenderer.ts');
  const art = window.__art;
  const m = { id: 'qa-facing-shot', index: 0, title: 'QA', place: '', briefing: '', objective: '', win: 'rout', hub: false, autoTactics: false, fog: false,
    mistType: 'none', environment: 'outdoor', timeOfDay: 'day', cols: 10, rows: 8, layout: Array(8).fill('.'.repeat(10)),
    playerSpawns: [{ name: 'Neera', classId: 'neera', x: 4, y: 3, level: 3 }], enemySpawns: [{ name: 'Arqueiro', classId: 'archer', x: 4, y: 4, level: 3 }], neutralSpawns: [], decorations: [], elementalFx: [] };
  const e = new BattleEngine(m, art, { hp: {}, levels: {} }, 1);
  await ensureSpriteArt(art, e.units.map(u => u.sprite));
  const ground = document.createElement('canvas'), units = document.createElement('canvas');
  for (const c of [ground, units]) { c.width = 900; c.height = 600; c.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:600px'; document.body.append(c); }
  const g = new WebGL2DRenderer(ground), u = new WebGL2DRenderer(units);
  window.__shot = (label) => {
    g.setSize(900, 600); u.setSize(900, 600); g.clear(); u.clear();
    e.renderGround(g, 900, 600, 1);
    u.setTransform(1, 0, 0, 1, 0, 0);
    e.renderUnitsAndOverlays(u, 900, 600);
    document.title = label;
  };
  const a = e.units.find(x => x.side === 'player'), d = e.units.find(x => x.side === 'enemy');
  a.facing = -1; d.facing = -1; // wrong way for both: target is screen-right of Neera
  window.__e = e; window.__a = a; window.__d = d;
  window.__shot('setup');
  e.queue.push({ type: 'combat', att: a.id, def: d.id });
  for (let i = 0; i < 400 && !(e.active?.type === 'combat' && e.active.stage === 'lunge'); i++) e.tick(1 / 60);
  window.__shot('shot');
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/combat-facing/neera-shoots-offset-row.png', clip: { x: 0, y: 0, width: 900, height: 600 } });
const counterState = await page.evaluate(() => {
  const e = window.__e;
  for (let i = 0; i < 2000 && !(e.active?.type === 'combat' && e.active.stage.startsWith('counter')); i++) e.tick(1 / 60);
  window.__shot('counter');
  return { stage: e.active?.stage ?? null, neeraFacing: window.__a.facing, archerFacing: window.__d.facing };
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'screenshots/combat-facing/archer-counters-offset-row.png', clip: { x: 0, y: 0, width: 900, height: 600 } });
console.log('counter frame:', counterState);
console.log('errors:', errors.filter(m => !/WebSocket|vite/.test(m)).slice(0, 10));
await browser.close();
