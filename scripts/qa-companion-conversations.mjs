import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'node:path';

mkdirSync('work/companion-dialogues', { recursive: true });
const server = await createServer({ configFile: false, cacheDir: 'work/companion-vite-cache', plugins: [react(), tailwind()], resolve: { alias: { '@': resolve('src') } }, optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] }, server: { host: '127.0.0.1', port: 8099, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/__companion-dialogue-qa', r => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('http://127.0.0.1:8099/__companion-dialogue-qa');
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh'); refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => t => t; window.__vite_plugin_react_preamble_installed__ = true;
    const source = await (await fetch('/src/game/CompanionConversations.tsx')).text();
    const reactUrl = source.match(/"([^"\n]+\/react\.js\?v=[^"]+)"/)[1];
    const React = await import(reactUrl);
    const ReactDOM = await import(reactUrl.replace('react.js?', 'react-dom_client.js?'));
    const { CompanionConversations } = await import('/src/game/CompanionConversations.tsx');
    const { resolveCompanionReply } = await import('/src/game/companionDialogues.ts');
    const { emptySave } = await import('/src/game/save.ts');
    const { AFFINITY_HEROES } = await import('/src/game/affinity.ts');
    await import('/src/styles.css');
    const h = React.createElement ?? React.default.createElement;
    let save = { ...emptySave(), partyLeader: 'Kael', affinityScores: { 'Kael|Neera': 80, 'Aldric|Voss': 50, 'Kael|Malrec': 100 } };
    const host = document.createElement('div'); document.body.append(host);
    const root = (ReactDOM.createRoot ?? ReactDOM.default.createRoot)(host);
    const render = () => {
      window.__companionSave = save;
      root.render(h(CompanionConversations, { save, leader: save.partyLeader, heroes: AFFINITY_HEROES,
        onLeader(hero) { save = { ...save, partyLeader: hero }; render(); },
        onReply(reply, leader) { const resolved = resolveCompanionReply(save.affinityScores, save.companionConversations, reply, leader); save = { ...save, affinityScores: resolved.scores, companionConversations: resolved.memory }; render(); }, onClose() {} }));
    };
    render();
  });
  const topic = label => page.getByRole('button', { name: new RegExp(label) });
  await topic('Space to take a shot').waitFor();
  assert.equal(await topic('A place worth staying').isDisabled(), true);
  await page.screenshot({ path: 'work/companion-dialogues/topics-desktop.png' });
  await topic('Space to take a shot').click();
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.getByRole('button', { name: /I can listen without/ }).click();
  assert.equal(await page.evaluate(() => window.__companionSave.affinityScores['Kael|Neera']), 83.6);
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.getByRole('button', { name: /^Ok$/i }).click();
  await topic('Space to take a shot').click();
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.getByRole('button', { name: /If we're going to stand together/ }).click();
  assert.equal(await page.evaluate(() => window.__companionSave.affinityScores['Kael|Neera']), 83.6);
  await page.getByRole('button', { name: /^Ok$/i }).click();
  await page.getByRole('combobox').selectOption('Aldric');
  await page.getByRole('button', { name: 'Voss', exact: true }).click();
  await topic('The joke beneath the fear').click();
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.screenshot({ path: 'work/companion-dialogues/voss-to-aldric.png' });
  await page.getByRole('button', { name: /We can leave this here/ }).click();
  await page.getByRole('button', { name: /^Ok$/i }).click();
  await page.getByRole('combobox').selectOption('Kael');
  await page.getByRole('button', { name: 'Malrec', exact: true }).click();
  assert.equal(await page.locator('button.ember-slot').count(), 3, 'Malrec ends at middle tier');
  await page.setViewportSize({ width: 390, height: 844 });
  await topic('A promise for today').click();
  await page.getByRole('button', { name: /Próximo|Next/ }).click();
  await page.screenshot({ path: 'work/companion-dialogues/malrec-mobile.png' });
  assert.equal(await page.locator('.ember-btn-ghost').evaluateAll(buttons => buttons.every(b => b.scrollHeight <= b.clientHeight + 1)), true, 'long reply text fits each mobile button');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  assert.deepEqual(errors, []);
  console.log('PASS: actual React menu, tier locks, leader switching, distinct voices, one-time affinity, Malrec cap, desktop/mobile layout');
} finally { await browser.close(); await server.close(); }
