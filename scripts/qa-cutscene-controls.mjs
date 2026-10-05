import assert from 'node:assert/strict';
import { chromium } from 'playwright';
let browser;
try {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  await page.route('**/qa-cutscene.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/src/styles.css"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><script type="module">import { mount } from "/work/house-collision-qa/cutscene-harness.tsx"; mount();</script></body></html>' }));
  await page.goto('http://127.0.0.1:8080/qa-cutscene.html', { waitUntil: 'domcontentloaded' });
  await page.locator('video').waitFor({ timeout: 120000 });
  await page.locator('video').evaluate(video => { video.pause(); });
  const sound = page.locator('button[aria-pressed]').filter({ has: page.locator('svg') }).first();
  const skip = page.getByRole('button', { name: /Pular|Skip/ });
  await page.mouse.move(700, 450);
  await page.waitForTimeout(300);
  assert.equal(await sound.evaluate(el => getComputedStyle(el).opacity), '0');
  assert.equal(await skip.evaluate(el => getComputedStyle(el).opacity), '0');
  const box = await sound.boundingBox();
  assert.ok(box.width <= 28 && box.height <= 28);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  assert.equal(await sound.evaluate(el => getComputedStyle(el).opacity), '1');
  await sound.click();
  const first = await page.locator('video').evaluate(el => el.muted);
  assert.equal(await page.evaluate(async () => (await import('/work/house-collision-qa/cutscene-harness.tsx')).isMuted()), first);
  await sound.click();
  assert.equal(await page.locator('video').evaluate(el => el.muted), !first);
  assert.equal(await page.evaluate(async () => (await import('/work/house-collision-qa/cutscene-harness.tsx')).isMuted()), !first);
  await page.mouse.move(700, 450);
  await page.waitForTimeout(300);
  assert.equal(await sound.evaluate(el => getComputedStyle(el).opacity), '0');
  const skipBox = await skip.boundingBox();
  assert.ok(skipBox.height < 30);
  await page.mouse.move(skipBox.x + skipBox.width / 2, skipBox.y + skipBox.height / 2);
  await page.waitForTimeout(300);
  assert.equal(await skip.evaluate(el => getComputedStyle(el).opacity), '1');
  console.log('PASS: sound toggles actual video mute; sound and small Skip disappear off hover.');
} finally { await browser?.close(); }
