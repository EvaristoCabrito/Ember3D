#!/usr/bin/env node
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Modo teste" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Debug/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /RPG Map/ }).click();
  await page.getByRole("button", { name: "Mover Kael" }).waitFor();
  const before = await page.getByText(/Dia\s+\d+/).first().innerText();
  await page.getByRole("button", { name: "Mover Kael" }).click();
  const steps = page.getByRole("button", { name: /Andar para .*1 dia/ });
  if (await steps.count() < 2) throw new Error("adjacent movement hexes did not appear");
  await steps.first().click();
  await page.waitForTimeout(650);
  const after = await page.getByText(/Dia\s+\d+/).first().innerText();
  if (before === after) throw new Error("the day clock did not advance after a step");
  if (await steps.count() !== 0) throw new Error("movement hexes stayed open after moving");
  await page.screenshot({ path: "screenshots/movement-hunger-desktop.png" });
  console.log("MOVEMENT", { before, after, adjacentHexesOpened: true });
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  console.log("ERRORS", errors);
  await browser.close();
}
