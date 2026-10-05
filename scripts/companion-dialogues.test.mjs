import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('companion conversations cover every directed pair, gate tiers and survive save/load', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const dialog = await server.ssrLoadModule('/src/game/companionDialogues.ts');
    const { AFFINITY_HEROES, affinityPair, affinityScore } = await server.ssrLoadModule('/src/game/affinity.ts');
    let count = 0;
    for (const leader of AFFINITY_HEROES) for (const companion of AFFINITY_HEROES) {
      if (leader === companion) {
        assert.equal(dialog.buildCompanionDialogue(leader, companion, 0), null);
        continue;
      }
      const pair = affinityPair(leader, companion);
      const max = dialog.companionMaxTier(leader, companion);
      for (let tier = 0; tier <= max; tier++) {
        const threshold = dialog.COMPANION_TIERS[tier];
        if (threshold) assert.equal(dialog.buildCompanionDialogue(leader, companion, tier, { [pair]: threshold - 0.1 }), null);
        const scores = { [pair]: threshold };
        const tree = dialog.buildCompanionDialogue(leader, companion, tier, scores);
        assert.ok(tree);
        count++;
        const ids = new Set(tree.lines.map(l => l.id));
        assert.equal(ids.size, tree.lines.length);
        assert.ok(ids.has(tree.startId));
        for (const line of tree.lines) {
          assert.ok(line.text.trim());
          if (line.next) assert.ok(ids.has(line.next));
          for (const reply of line.replies ?? []) if (reply.next) assert.ok(ids.has(reply.next));
        }
        const reversed = dialog.buildCompanionDialogue(companion, leader, tier, scores);
        assert.notEqual(tree.lines.find(l => l.id === 'confide').text, reversed.lines.find(l => l.id === 'confide').text);
        const choices = tree.lines.find(l => l.id === 'confide').replies;
        for (const choice of choices.slice(0, 3)) {
          const resolved = dialog.resolveCompanionReply(scores, {}, choice, leader);
          assert.equal(resolved.memory[tree.id], choice.affinity.delta);
          assert.deepEqual(dialog.resolveCompanionReply(resolved.scores, resolved.memory, choices[2], leader), resolved, 'cannot farm gains or losses by replaying');
          const replay = dialog.buildCompanionDialogue(leader, companion, tier, { [pair]: 100 }, resolved.memory);
          assert.ok(replay.lines.find(l => l.id === 'confide').replies.slice(0, 3).every(r => r.affinity.delta === 0));
        }
        assert.deepEqual(dialog.resolveCompanionReply(scores, {}, choices[3], leader), { scores, memory: {} }, 'leaving a chapter does not spend it');
      }
      assert.equal(dialog.buildCompanionDialogue(leader, companion, max + 1, { [pair]: 100 }), null);
    }
    assert.equal(count, 130);
    const kael = dialog.buildCompanionDialogue('Kael', 'Voss', 0).lines.find(l => l.id === 'confide').replies[0];
    const aldric = dialog.buildCompanionDialogue('Aldric', 'Voss', 0).lines.find(l => l.id === 'confide').replies[0];
    assert.notEqual(kael.affinity.delta, aldric.affinity.delta, 'same approach gets different reception from different leaders');
    const result = dialog.resolveCompanionReply({}, {}, kael, 'Kael');
    assert.equal(affinityScore(result.scores, 'Kael', 'Voss'), 6, 'leader catch-up matches combat system');
    assert.equal(dialog.buildCompanionDialogue('Kael', 'Voss', 1, { 'Kael|Voss': 25 }, result.memory).lines.find(l => l.id === 'confide').text.startsWith("I've been thinking"), true);
    assert.ok(dialog.buildCompanionDialogue('Kael', 'Voss', 3, {}, { 'companion:Kael:Voss:3': -3 }), 'resolved chapter stays available after affinity drops');
    assert.deepEqual(dialog.cleanConversationMemory({ ...result.memory, 'companion:Kael:Malrec:3': 3, 'companion:Kael:Kael:0': 3, bad: 3 }), result.memory);
    assert.deepEqual(dialog.resolveCompanionReply({}, {}, kael, 'Neera'), { scores: {}, memory: {} }, 'rejects stale leader');
    const store = new Map();
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
    try {
      const { emptySave, emptyBank, writeSlot, loadBank, activeSave } = await server.ssrLoadModule('/src/game/save.ts');
      writeSlot(emptyBank(), 0, { ...emptySave(), affinityScores: result.scores, companionConversations: result.memory, partyLeader: 'Voss' });
      const restored = activeSave(loadBank());
      assert.deepEqual(restored.companionConversations, result.memory);
      assert.equal(restored.partyLeader, 'Voss');
      assert.deepEqual(restored.affinityScores, result.scores);
    } finally { globalThis.localStorage = originalStorage; }
  } finally { await server.close(); }
});
