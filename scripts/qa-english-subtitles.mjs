import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('emberash:preferences:v1', JSON.stringify({ subtitleLanguage: 'pt', subtitles: true })));
  await page.route('**/qa-subtitles.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="/src/styles.css"><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body></body></html>' }));
  for (const [name, count] of [['aldeia-intro', 3], ['asherah-rite', 2], ['temple-aftermath', 2], ['inn-arrival', 11], ['smith-intro', 4], ['wisp-entrance', 5], ['thebridge-intro', 0], ['vau-intro', 0], ['portao-end', 0], ['title-open', 0]]) {
    if (process.env.QA_CUTSCENE && name !== process.env.QA_CUTSCENE) continue;
    await page.goto('http://127.0.0.1:8080/qa-subtitles.html');
    await page.evaluate(async src => (await import('/work/subtitle-harness.tsx')).mount(src), `/game/${name}.mp4`);
    await page.locator('video').waitFor();
    await page.locator('video').evaluate(video => video.pause());
    assert.equal(await page.locator('track').count(), count ? 1 : 0, name);
    if (count) {
      await page.waitForFunction(count => document.querySelector('video').textTracks[0]?.cues?.length === count, count);
      const result = await page.locator('video').evaluate(video => {
        const track = video.textTracks[0];
        return { language: track.language, mode: track.mode, cues: Array.from(track.cues).map(c => ({ start: c.startTime, end: c.endTime, text: c.text })), duration: video.duration };
      });
      assert.equal(result.language, 'en', name);
      assert.equal(result.mode, 'showing', name);
      for (const cue of result.cues) assert.ok(cue.end > cue.start && cue.end <= result.duration, `${name}: invalid cue timing`);
      if (name === 'wisp-entrance') {
        for (const cue of result.cues) {
          await page.locator('video').evaluate((video, time) => { video.currentTime = time; }, (cue.start + cue.end) / 2);
          await page.waitForFunction(text => document.querySelector('video').textTracks[0].activeCues?.[0]?.text === text, cue.text);
          console.log(`Wisp Forest ${cue.start.toFixed(2)}s: ${cue.text.replaceAll('\n', ' ')}`);
        }
        await page.locator('video').evaluate(video => { video.currentTime = 1.5; });
        await page.waitForFunction(() => document.querySelector('video').textTracks[0].activeCues?.[0]?.text.startsWith('Tell me again'));
        await page.screenshot({ path: 'work/wisp-english-subtitles.png' });
      }
      if (name === 'aldeia-intro') {
        assert.equal(result.cues[0].text, 'Run!');
        assert.equal(result.cues[1].text, 'They are torching the village!');
        await page.locator('video').evaluate(video => { video.currentTime = 2.5; });
        await page.waitForFunction(() => document.querySelector('video').textTracks[0].activeCues?.[0]?.text === 'They are torching the village!');
        await page.screenshot({ path: 'work/village-english-subtitles.png' });
        await page.evaluate(async () => {
          const source = await (await fetch('/src/game/GameApp.tsx')).text();
          const url = source.match(/from ["']([^"']*gamePreferences\.ts[^"']*)["']/)[1];
          window.subtitlePreferences = await import(url);
          window.subtitlePreferences.setGamePreferences({ subtitles: false });
        });
        await page.waitForFunction(() => document.querySelector('video').textTracks[0].mode === 'disabled');
        await page.evaluate(() => window.subtitlePreferences.setGamePreferences({ subtitles: true, subtitleLanguage: 'pt' }));
        await page.waitForFunction(() => document.querySelector('video').textTracks[0].mode === 'showing');
        assert.equal(await page.evaluate(() => window.subtitlePreferences.getGamePreferences().subtitleLanguage), 'en');
      }
    }
    console.log(`PASS ${name}: ${count} English cues`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
