#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const dataText = await readFile(new URL("src/game/data.ts", root), "utf8");

function idsBetween(start, end, pattern) {
  const block = dataText.split(start)[1]?.split(end)[0] ?? "";
  return [...block.matchAll(pattern)].map((match) => match[1] || match[2]);
}

const weapons = idsBetween(
  "export const WEAPONS: Record<string, WeaponDef> = {",
  "export function weaponIcon",
  /^\s*(?:"([^"]+)"|([a-z][a-z0-9-]*)):\s*wpn\(/gm,
).map((id) => ({ id, group: "weapons", src: `/game/icons/weapons/${id}.png` }));

const equipment = idsBetween(
  "export const EQUIPMENT: Record<string, EquipmentDef> = {",
  "/** Whether a class",
  /^\s*(?:"([^"]+)"|([a-z][a-z0-9-]*)):\s*\{/gm,
).map((id) => ({ id, group: "equipment", src: `/game/icons/equipment/${id}.png` }));

const items = [...weapons, ...equipment, { id: "rations", group: "supplies", src: "/game/icons/rations.png" }];
const browser = await chromium.launch({ headless: true });
const failures = [];
const consoleErrors = [];
const outputDir = new URL("screenshots/", root);
await mkdir(outputDir, { recursive: true });

try {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${viewport.name}: ${message.text()}`);
    });
    const response = await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
    if (!response?.ok()) failures.push(`${viewport.name}: app root returned ${response?.status() ?? "no response"}`);
    // Let React hydration settle before replacing the document with the same-origin audit gallery.
    await page.waitForTimeout(750);
    await page.setContent(`<!doctype html><html><head><style>
      html{background:#0f0d0c;color:#dccfb8;font:12px system-ui}body{margin:16px}
      h1{font:24px Georgia;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:10px}
      figure{margin:0;background:#171310;border:1px solid #3c3027;border-radius:8px;padding:8px;min-width:0}
      img{width:100%;aspect-ratio:1;object-fit:contain;display:block;background:#090807}
      figcaption{margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    </style></head><body><h1>Item icon audit · ${viewport.name}</h1><div class="grid">${items
      .map((item) => `<figure><img src="${item.src}" alt="${item.id}"><figcaption>${item.group} · ${item.id}</figcaption></figure>`)
      .join("")}</div></body></html>`, { waitUntil: "load" });

    const decoded = await page.locator("img").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      return images.map((image) => ({
        id: image.alt,
        src: image.getAttribute("src"),
        complete: image.complete,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
    });
    if (decoded.length !== items.length) failures.push(`${viewport.name}: decoded ${decoded.length}/${items.length} images`);
    for (const image of decoded) {
      if (!image.complete || image.width < 64 || image.height < 64) failures.push(`${viewport.name}: ${JSON.stringify(image)}`);
    }
    await page.screenshot({ path: new URL(`item-icons-playwright-${viewport.name}.png`, outputDir).pathname.slice(1), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

const urls = new Set(items.map((item) => item.src));
if (urls.size !== items.length) failures.push(`duplicate URL mappings: ${items.length - urls.size}`);
const report = {
  ok: failures.length === 0,
  counts: { weapons: weapons.length, equipment: equipment.length, supplies: 1, total: items.length },
  uniqueUrls: urls.size,
  failures,
  consoleErrors,
};
const serialized = JSON.stringify(report, null, 2);
await writeFile(new URL("item-icons-playwright.json", outputDir), serialized);
console.log(serialized);
if (!report.ok) process.exit(1);
