import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { BattleEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { tierUses, phantasmalForceDice } = await server.ssrLoadModule('/src/game/data.ts');
  for (const level of [1, 4, 5, 10]) {
    assert.equal(tierUses('swampBlueCalf', 1, level), level >= 5 ? 3 : 2);
    assert.equal(tierUses('swampBlueCalf', 2, level), 0);
    const ox = { id: 'ox', classId: 'swampBlueCalf', side: 'enemy', alive: true, acted: false, moved: false, x: 5, y: 4, size: 1, mov: 5, minRange: 1, maxRange: 1, level, spells: { tier1: tierUses('swampBlueCalf', 1, level) } };
    const foe = { id: 'foe', side: 'player', alive: true, x: 6, y: 4, size: 1, hp: 30, maxHp: 30 };
    const engine = Object.create(BattleEngine.prototype);
    Object.assign(engine, { cols: 16, rows: 10, tiles: Array(160).fill('plains'), decorOverlay: new Uint8Array(0), units: [ox, foe], queue: [] });
    engine.wakeIfSeesParty = () => true;
    engine.smashBarricades = () => {};
    engine.effectiveUnitForReach = u => u;
    const uses = ox.spells.tier1;
    for (let cast = 0; cast < uses; cast++) {
      engine.queue = [];
      engine.runAiFor(ox);
      const spell = engine.queue.find(s => s.type === 'spell');
      assert.equal(spell?.spellKind, 'phantasmalForce');
      assert.equal(spell.faces, phantasmalForceDice(level).faces);
      assert.equal(ox.spells.tier1, uses - cast - 1);
      assert.ok(engine.queue.some(s => s.type === 'move'), 'retreats from adjacent player to cast');
      assert.ok(!engine.queue.some(s => s.type === 'combat'));
    }
    engine.queue = [];
    engine.runAiFor(ox);
    assert.ok(engine.queue.some(s => s.type === 'combat'), 'switches to melee after spending last charge');
    assert.ok(!engine.queue.some(s => s.type === 'spell'));
  }
  console.log('PASS: charge counts at levels 1/4/5/10, ranged retreat, spell scaling, exhaustion and melee transition');
} finally {
  await server.close();
}
