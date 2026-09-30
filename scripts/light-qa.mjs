#!/usr/bin/env node
/**
 * Map-light QA: how lamp/brazier point lights spread over the ground and onto nearby props
 * and characters, at night. Same pattern as scripts/shadow-qa.mjs — builds BattleEngine +
 * ThreeBattleRenderer directly against the already-running dev server, no menus.
 *
 *   node scripts/light-qa.mjs <label>          # against http://127.0.0.1:8080/
 *   node scripts/light-qa.mjs <label> <url>
 *
 * Saves screenshots/lighting/<label>-<scene>.png (plus a -zoom crop). Use a distinct label per
 * check so earlier captures stay on disk.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { checkedUrl } from "./browser-guard.mjs";

const label = process.argv[2];
if (!label) {
  console.error("usage: node scripts/light-qa.mjs <label> [url]");
  process.exit(2);
}
const url = checkedUrl(process.argv[3] || "http://127.0.0.1:8080/");
const outDir = new URL("../screenshots/lighting/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(m.text());
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
} catch (err) {
  console.error(`[light-qa] ${url} did not answer — is the dev server up? (${err.message.split("\n")[0]})`);
  await browser.close();
  process.exit(2);
}

const result = await page.evaluate(async () => {
  const { BattleEngine } = await import("/src/game/engine.ts");
  const { TILE_CHAR } = await import("/src/game/data.ts");
  const { ThreeBattleRenderer } = await import("/src/game/gfx/three/ThreeBattleRenderer.ts");
  const assets = await import("/src/game/assets.ts");
  const art = await assets.loadGameArt();
  const roster = { hp: {}, levels: {} };
  const layout = (cols, rows, fill = "plains") => Array.from({ length: rows }, () => TILE_CHAR[fill].repeat(cols));

  const W = 1400;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  document.body.appendChild(canvas);

  function zoomCrop(sx, sy, sw, sh, scale) {
    const out = document.createElement("canvas");
    out.width = sw * scale;
    out.height = sh * scale;
    const ctx = out.getContext("2d");
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  async function scene(timeOfDay) {
    const m = {
      id: "light-qa",
      index: 0,
      title: "light-qa",
      place: "QA",
      briefing: "",
      objective: "QA",
      win: "rout",
      cols: 16,
      rows: 12,
      layout: layout(16, 12),
      environment: "outdoor",
      timeOfDay,
      playerSpawns: [
        { name: "Kael", classId: "kaelFinal", x: 5, y: 6 },
        { name: "Neera", classId: "neera", x: 11, y: 5 },
      ],
      enemySpawns: [],
      decorations: [
        { id: "lamppost", x: 4, y: 5 },
        { id: "tombstones", x: 3, y: 6 },
        { id: "tombstones", x: 5, y: 4 },
        { id: "tombstones", x: 2, y: 4 },
        { id: "Brazier3", x: 12, y: 6 },
        { id: "tombstones", x: 13, y: 7 },
        { id: "dead-tree", x: 10, y: 7 },
      ],
    };
    const eng = new BattleEngine(m, art, roster, 7);
    const renderer = new ThreeBattleRenderer(canvas, eng);
    renderer.setSize(W, H, 1);
    renderer.render(W, H);
    eng.centerOnBoard();
    for (let i = 0; i < 6; i++) renderer.render(W, H);
    return { dataUrl: canvas.toDataURL("image/png"), zoomDataUrl: zoomCrop(W * 0.2, H * 0.25, W * 0.6, H * 0.5, 2) };
  }

  return { brightNight: await scene("brightNight"), darkNight: await scene("darkNight"), dusk: await scene("dusk") };
});

if (pageErrors.length) {
  console.log(`[light-qa] ${pageErrors.length} page error(s):`);
  for (const e of pageErrors.slice(0, 10)) console.log(`[light-qa]   ${e}`);
}
for (const [name, data] of Object.entries(result)) {
  for (const [suffix, du] of [["", data.dataUrl], ["-zoom", data.zoomDataUrl]]) {
    const path = new URL(`${label}-${name}${suffix}.png`, outDir);
    writeFileSync(path, Buffer.from(du.replace(/^data:image\/png;base64,/, ""), "base64"));
    console.log(`[light-qa] -> ${path.pathname.replace(/^\//, "")}`);
  }
}
await browser.close();
if (pageErrors.length) process.exit(1);
