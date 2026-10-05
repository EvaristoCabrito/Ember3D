import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
let browser;
try {
  const { BattleEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { CURES, rollCure } = await server.ssrLoadModule('/src/game/data.ts');
  const { key } = await server.ssrLoadModule('/src/game/pathfinding.ts');
  assert.equal(CURES.cureLight.name, 'Healing Hands');
  assert.equal(CURES.cureLight.range, 1);
  for (const mag of [0, 10, 20, 40, 80]) {
    const average = kind => Array.from({ length: 120 }, (_, i) => rollCure(kind, mag, () => (i + 0.5) / 120)).reduce((a, b) => a + b) / 120;
    assert.ok(average('cureLight') > average('cureMinor'));
    assert.ok(average('cureLight') < average('cureWounds'));
  }
  const engine = Object.create(BattleEngine.prototype);
  const caster = { x: 3, y: 3, side: 'player' };
  const ally = { x: 4, y: 3, side: 'player', alive: true, hp: 5, maxHp: 20 };
  engine.spellKind = 'cureLight';
  engine.occ = () => new Map([[key(ally.x, ally.y), ally]]);
  assert.equal(engine.validHealTarget(caster, ally), true);
  ally.x = 5;
  assert.equal(engine.validHealTarget(caster, ally), false);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 430 } });
  await page.setContent('<canvas width="1000" height="430"></canvas>');
  await page.evaluate(({ source }) => {
    const draw = new Function(`return function ${source}`)();
    const ctx = document.querySelector('canvas').getContext('2d');
    ctx.fillStyle = '#181c27'; ctx.fillRect(0, 0, 1000, 430);
    for (const [i, kind] of ['minor', 'hands', 'medium'].entries()) {
      const cx = 170 + i * 330;
      ctx.fillStyle = '#566474'; ctx.fillRect(cx - 14, 290, 28, 60);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      draw.call({ time: 0.25 }, ctx, cx, 350, 95, { kind, seed: 0.8 }, 0.85, 0.35);
      ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(['Minor Heal', 'Healing Hands', 'Medium Heal'][i], cx, 400);
    }
  }, { source: BattleEngine.prototype.drawDivineLight.toString() });
  await page.screenshot({ path: 'work/healing-hands-comparison.png' });
  console.log('PASS: intermediate potency, adjacent-only range, and 2D effects rendered');
} finally {
  await browser?.close();
  await server.close();
}
