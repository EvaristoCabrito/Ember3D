import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('Phantom System uses a legacy 2D bolt and its own monster charge pool', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { BattleEngine } = await server.ssrLoadModule('/src/game/engine.ts');
    const { FANTOM_FORCE, fantomForceChargesFor, fantomForceDice } = await server.ssrLoadModule('/src/game/data.ts');
    for (const classId of ['cultist', 'cultistV2', 'emberedWraith']) {
      const monster = { id: 'monster', classId, sprite: 'cultist', level: 5, side: 'enemy', alive: true, acted: false, moved: false, x: 4, y: 4, size: 1, mov: 0, minRange: 1, maxRange: 4, spells: { tier1: 3, tier2: 0 }, shockCharges: 0, fantomForceCharges: fantomForceChargesFor(classId) };
      const foe = { id: 'foe', side: 'player', alive: true, x: 6, y: 4, size: 1, hp: 30, maxHp: 30 };
      const engine = Object.create(BattleEngine.prototype);
      Object.assign(engine, {
        cols: 16, rows: 10, tiles: Array(160).fill('plains'), decorOverlay: new Uint8Array(0), units: [monster, foe], queue: [],
        art: { attacks: {}, casts: {} }, woundUp: new Map(), onSeqStart: new Map(), bleedChargedIds: new Set(),
        time: 0, reducedMotion: false, rng: () => 0.5, missileFx: [{ live: false }], missileFxLive: 0,
        phantasmalForceVfxAvailable: true, phantasmalForceVfxRequests: [], phantasmalForceVfxEvents: [], phantasmalForceVfxSequence: 0,
      });
      engine.wakeIfSeesParty = () => true;
      engine.smashBarricades = () => {};
      engine.effectiveUnitForReach = u => u;
      engine.applyBleedingActionDamage = () => true;
      engine.faceSpriteToward = () => {};
      engine.ensureVisible = () => {};
      engine.ensureAreaVisible = () => {};
      assert.equal(monster.fantomForceCharges, FANTOM_FORCE.usesPerBattle);
      for (let cast = 0; cast < FANTOM_FORCE.usesPerBattle; cast++) {
        engine.queue = [];
        engine.runAiFor(monster);
        const spell = engine.queue.find(s => s.type === 'spell');
        assert.equal(spell.spellKind, 'fantomForce');
        assert.equal(spell.label, 'Phantom System');
        assert.equal(spell.faces, fantomForceDice(monster.level).faces);
        assert.equal(monster.fantomForceCharges, FANTOM_FORCE.usesPerBattle - cast - 1);
        assert.equal(monster.spells.tier1, 3, 'Phantom consumes no shared spell charges');
        engine.startSeq(spell);
        const bolt = engine.missileFx[0];
        assert.equal(bolt.kind, 'fantomForce');
        assert.equal(bolt.hue, 268, 'Original purple 2D bolt, not the blue apparition');
        assert.equal(bolt.travel, 0.38);
        engine.stepSpell(engine.active, 0.01);
        assert.equal(engine.phantasmalForceVfxRequests.length, 0, 'Never requests the Phantasmal Force 3D effect');
      }
      engine.queue = [];
      engine.runAiFor(monster);
      assert.equal(engine.queue.find(s => s.type === 'spell').spellKind, 'magicMissile');
      assert.equal(monster.spells.tier1, 2, 'Other monster spells retain their independent pool');

      engine.startSeq({ type: 'spell', att: monster.id, tiles: [foe], ids: [foe.id], spellKind: 'phantasmalForce' });
      engine.stepSpell(engine.active, 0.01);
      assert.equal(engine.phantasmalForceVfxRequests.length, 1, 'Phantasmal Force still requests its own 3D effect');
    }
    assert.equal(fantomForceChargesFor('conjurer'), 0);
    assert.equal(fantomForceChargesFor('swampBlueCalf'), 0);
  } finally {
    await server.close();
  }
});
