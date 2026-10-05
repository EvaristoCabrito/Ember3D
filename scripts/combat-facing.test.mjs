import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('every class faces its opponent on both sides of combat; Neera mirrors each actual pose', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { BattleEngine } = await server.ssrLoadModule('/src/game/engine.ts');
    const { CLASSES } = await server.ssrLoadModule('/src/game/data.ts');
    const frame = name => ({ name, naturalWidth: 360, naturalHeight: 520 });
    const pool = name => Array.from({ length: 4 }, () => frame(name));
    const fixture = cls => {
      const actor = { id: 'actor', classId: cls.id, sprite: cls.sprite, x: 4, y: 4, drawX: 4, drawY: 4, facing: 1, side: 'player', size: 1, alive: true };
      const target = { ...actor, id: 'target', x: 2, drawX: 2, side: 'enemy', facing: -1 };
      const art = Object.fromEntries(['sprites', 'attacks', 'attacks2', 'attacksShort', 'attacksLeft', 'casts', 'castsLeft', 'counters', 'countersLeft', 'walks', 'walksLeft', 'walks2', 'walksLeft2', 'walksUp', 'walksDown', 'walkDirs', 'idles', 'idles2', 'hits', 'deaths', 'deaths2'].map(key => [key, {}]));
      art.sprites[cls.sprite] = pool('idle');
      art.attacks[cls.sprite] = pool('attack-right');
      art.casts[cls.sprite] = pool('cast-right');
      const engine = Object.create(BattleEngine.prototype);
      Object.assign(engine, { units: [actor, target], art, time: 0.05, camX: 0, camY: 0, zoom: 1, tacticsCamera: false, cameraTiltSide: 0, queue: [] });
      engine.liveMotion = () => ({ bob: 0, sway: 0, breath: 0 });
      engine.unitLift = () => 0;
      engine.hexCenter = (x, y) => ({ cx: x * 30, cy: y * 30 });
      return { engine, actor, target, art };
    };
    for (const cls of Object.values(CLASSES)) {
      const { engine, actor, target } = fixture(cls);
      for (const stage of ['lunge', 'hit', 'recover', 'counterLunge', 'counterHit', 'counterRecover']) {
        for (const offHand of [false, true]) {
          for (const targetX of [2, 6]) {
            target.x = targetX;
            actor.facing = targetX < actor.x ? 1 : -1;
            target.facing = actor.facing;
            engine.active = { type: 'combat', att: actor.id, def: target.id, stage, t: 0.05, customDice: offHand ? { dice: 1, faces: 4 } : null, counterCustomDice: offHand ? { dice: 1, faces: 4 } : null };
            engine.faceSpriteToward(actor.id, target.x, target.y);
            engine.faceSpriteToward(target.id, actor.x, actor.y);
            engine.unitVisual(actor, 24);
            engine.unitVisual(target, 24);
            assert.equal(actor.facing, targetX < actor.x ? -1 : 1, `${cls.id}: attacker ${stage}, off-hand ${offHand}`);
            assert.equal(target.facing, -actor.facing, `${cls.id}: attacked unit ${stage}, off-hand ${offHand}`);
            if (stage === 'counterRecover') {
              // Finish without rendering the final frame: completion itself must retain
              // the counter direction for both units when they return to idle.
              engine.evaluateEnd = () => {};
              engine.finishAction = () => {};
              engine.finishCombat(actor);
              assert.equal(engine.active, null);
              engine.unitVisual(actor, 24);
              engine.unitVisual(target, 24);
              assert.equal(actor.facing, targetX < actor.x ? -1 : 1, `${cls.id}: facing persists after counter`);
              assert.equal(target.facing, -actor.facing);
            }
          }
        }
      }
    }

    const { engine, actor, target, art } = fixture(CLASSES.neera);
    art.attacksLeft.neera = pool('attack-left');
    art.attacksShort.neera = pool('offhand-right');
    art.counters.neera = pool('counter-right');
    engine.faceSpriteToward(actor.id, target.x, target.y);
    engine.faceSpriteToward(target.id, actor.x, actor.y);
    for (const offHand of [false, true]) {
      engine.active = { type: 'combat', att: actor.id, def: target.id, stage: 'lunge', t: 0.05, customDice: offHand ? {} : null };
      const visual = engine.unitVisual(actor, 24);
      assert.equal(visual.img.name, offHand ? 'offhand-right' : 'attack-left');
      assert.equal(Math.sign(visual.scaleX), offHand ? -1 : 1);
    }
    engine.active = { type: 'combat', att: target.id, def: actor.id, stage: 'counterLunge', t: 0.05 };
    assert.equal(Math.sign(engine.unitVisual(actor, 24).scaleX), -1, 'A right-facing counter cut must be mirrored');
    for (const kind of ['longShot', 'multiShot', 'piercing']) {
      const spell = { type: 'spell', att: actor.id, ids: [target.id], tiles: [target], spellKind: kind, t: 0.05 };
      for (const windup of [false, true]) {
        engine.queue = [spell];
        engine.active = windup ? { type: 'windup', id: actor.id, pose: 'cast', t: 0.05 } : spell;
        const visual = engine.unitVisual(actor, 24);
        engine.unitVisual(target, 24);
        assert.equal(visual.img.name, 'cast-right');
        assert.equal(Math.sign(visual.scaleX), -1, `${kind}: mirror the actual skill cut, wind-up ${windup}`);
        assert.equal(target.facing, 1, 'Ranged target faces the caster');
      }
    }
    engine.active = { type: 'combat', att: actor.id, def: target.id, stage: 'lunge', t: 0.05 };
    engine.tacticsCamera = true;
    engine.cameraTiltSide = 180;
    engine.faceSpriteToward(actor.id, target.x, target.y);
    engine.faceSpriteToward(target.id, actor.x, actor.y);
    engine.unitVisual(actor, 24);
    engine.unitVisual(target, 24);
    assert.equal(actor.facing, 1, 'Facing follows the rotated camera');
    assert.equal(target.facing, -1);
    for (const direction of [-1, 1]) {
      const kael = fixture(CLASSES.kaelFinal);
      kael.actor.facing = direction;
      kael.engine.active = { type: 'combat', att: kael.target.id, def: kael.actor.id, stage: 'counterRecover', t: 0.05 };
      const counterFlip = Math.sign(kael.engine.unitVisual(kael.actor, 24).scaleX);
      kael.engine.evaluateEnd = () => {};
      kael.engine.finishAction = () => {};
      kael.engine.finishCombat(kael.target);
      // Kael's idle sheet is drawn facing left (his attack faces right), so facing the same enemy
      // means the opposite mirror sign once he returns to idle.
      assert.equal(Math.sign(kael.engine.unitVisual(kael.actor, 24).scaleX), -counterFlip, 'Kael must keep facing the enemy when counter returns to idle');
      assert.equal(counterFlip, direction);
    }
    // Hard rule: the last attack/counter heading is kept in board space, so after the camera
    // rotates back each unit still faces the other on screen (the target is to the actor's left at 0°).
    engine.cameraTiltSide = 0;
    engine.unitVisual(actor, 24);
    engine.unitVisual(target, 24);
    assert.equal(actor.facing, -1);
    assert.equal(target.facing, 1);
  } finally {
    await server.close();
  }
});
