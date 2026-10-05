import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { BattleEngine } = await server.ssrLoadModule('/src/game/engine.ts');
  const { FAMILIAR_SPELL, SHOCK } = await server.ssrLoadModule('/src/game/data.ts');
  assert.equal(FAMILIAR_SPELL.familiar4, 'shock');
  assert.equal(FAMILIAR_SPELL.familiar2, 'magicMissile');
  const familiar = { id: 'radiant', classId: 'familiar4', acted: false, spellCharges: 3, lifeDrainCharges: 2, spells: { tier1: 0 } };
  const foe = { id: 'foe', x: 3, y: 2 };
  const engine = Object.create(BattleEngine.prototype);
  Object.assign(engine, { units: [familiar, foe], selectedId: familiar.id, queue: [] });
  engine.spellAimValid = () => true;
  const { key } = await server.ssrLoadModule('/src/game/pathfinding.ts');
  engine.occ = () => new Map([[key(3, 2), foe]]);
  for (let i = 0; i < 3; i++) {
    engine.spellKind = 'shock';
    engine.castShock(familiar, foe);
    assert.equal(familiar.spellCharges, 2 - i);
    const spell = engine.queue.at(-1);
    assert.equal(spell.spellKind, 'shock');
    assert.equal(spell.faces, SHOCK.faces);
    assert.deepEqual(spell.echo, { dice: SHOCK.echoDice, faces: SHOCK.echoFaces, bonus: SHOCK.echoBonus });
  }
  engine.castShock(familiar, foe);
  assert.equal(engine.queue.length, 3, 'fourth cast rejected');
  assert.equal(engine.familiarSpellRemaining(familiar, 'magicMissile'), 0);
  assert.equal(familiar.lifeDrainCharges, 2);
  console.log('PASS: three Shock casts, echo damage, exhaustion, no Magic Missile, Life Drain preserved');
} finally {
  await server.close();
}
