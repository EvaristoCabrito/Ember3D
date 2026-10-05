import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('random loot never awards free starting weapons, including fallback pools', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CLASSES, WEAPONS, EQUIPMENT, MAX_LEVEL, starterWeaponFor, weightedLootPick, weightedWeaponPick } = await server.ssrLoadModule('/src/game/data.ts');
    const { emptySave } = await server.ssrLoadModule('/src/game/save.ts');
    const save = emptySave();
    const starters = new Set([
      ...Object.keys(CLASSES).map(starterWeaponFor).filter(Boolean),
      ...Object.keys(save.weapons),
      ...Object.values(save.equipment).flatMap(slots => Object.values(slots)),
    ]);
    assert.ok(starters.has('arco-composto'));
    assert.ok(starters.has('cajado-da-galhada'));
    assert.ok(starters.has('punhal-curvo'));
    const ownedAll = new Set(Object.keys(WEAPONS));
    const starterOnly = [...starters].filter(id => WEAPONS[id]);
    const seen = new Set();
    for (const level of [0, 1, 3, 10, MAX_LEVEL]) {
      for (let i = 0; i <= 64; i++) {
        const rng = () => Math.min(i / 64, 1 - Number.EPSILON);
        for (const owned of [new Set(), ownedAll]) {
          const drop = weightedLootPick(rng, level, owned);
          assert.ok(!starters.has(drop.id), `Starter ${drop.id} dropped at level ${level}`);
          assert.ok(drop.kind === 'weapon' ? WEAPONS[drop.id] : EQUIPMENT[drop.id]);
          if (owned === ownedAll) assert.equal(drop.kind, 'equipment');
          seen.add(drop.kind);
        }
        for (const ids of [Object.keys(WEAPONS), starterOnly, []]) {
          const id = weightedWeaponPick(rng, ids, level);
          assert.ok(WEAPONS[id]);
          assert.ok(!starters.has(id), `Starter ${id} returned by weapon-only loot at level ${level}`);
        }
      }
    }
    assert.deepEqual(seen, new Set(['weapon', 'equipment']));
  } finally {
    await server.close();
  }
});
