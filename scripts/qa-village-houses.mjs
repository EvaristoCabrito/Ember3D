import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const mission = JSON.parse(await readFile(new URL('../src/game/maps/aldeia009.json', import.meta.url), 'utf8')).draft;
let browser;
try {
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ channel: 'chrome', headless: true }); }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(120000);
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async mission => {
    const { BattleEngine } = await import('/src/game/engine.ts');
    const { loadGameArt } = await import('/src/game/assets.ts');
    const { placedBlockingFootprint, placedFootprint, TILE_CHAR } = await import('/src/game/data.ts');
    const { computeReachable, reconstructPath, clearShot, key } = await import('/src/game/pathfinding.ts');
    const art = await loadGameArt();
    mission.layout = Array.from({ length: mission.rows }, (_, y) => mission.tiles.slice(y * mission.cols, (y + 1) * mission.cols).map(t => TILE_CHAR[t]).join(''));
    const engine = new BattleEngine(mission, art, { hp: {}, levels: {} }, 7);
    window.__houseQA = engine;
    const houses = engine.decorations.filter(p => ['burning-house', 'burnt-house-ruins', 'burning-hamlet'].includes(p.id));
    const failures = [];
    let destinations = 0, paths = 0;
    for (const house of houses) {
      const blocked = placedBlockingFootprint(house).map(({ dx, dy }) => ({ x: house.x + dx, y: house.y + dy }));
      for (const side of ['player', 'enemy']) {
        const unit = { ...engine.units.find(u => u.side === side), mov: 100, moveBudgetUsed: 0 };
        const reach = computeReachable(unit, engine.tiles, engine.cols, engine.rows, [unit], false, engine.decorOverlay);
        for (const cell of blocked) {
          destinations++;
          if (reach.has(key(cell.x, cell.y))) failures.push(`reachable house cell: ${side} ${house.id} ${cell.x},${cell.y}`);
        }
        for (const cell of reach.values()) {
          const path = reconstructPath(reach, cell);
          paths++;
          if (path.slice(1).some(p => blocked.some(b => b.x === p.x && b.y === p.y))) failures.push(`path crosses house: ${side} ${house.id}`);
        }
      }
      if (!house.rot) {
        const front = { x: house.x, y: house.y + 1 };
        const behind = { x: house.x, y: house.y - 4 };
        if (clearShot(front, behind, engine.tiles, engine.cols, 'arrow', engine.decorOverlay)) failures.push(`arrow passes house ${house.id}`);
        if (clearShot(front, behind, engine.tiles, engine.cols, 'bolt', engine.decorOverlay)) failures.push(`magic passes house ${house.id}`);
        const extra = placedBlockingFootprint(house).filter(p => !placedFootprint(house).some(q => q.dx === p.dx && q.dy === p.dy));
        if (house.id !== 'burnt-house-ruins' && extra.some(p => p.dy >= -1)) failures.push(`added front collision ${house.id}`);
      }
    }
    // Exercise the live engine's move queue, not only its pathfinder.
    const unit = engine.units.find(u => u.side === 'player');
    const house = houses.find(p => p.id === 'burnt-house-ruins' && p.x === 5);
    engine.units = [unit]; engine.queue = []; engine.seq = null;
    unit.x = 5; unit.y = 13; unit.drawX = 5; unit.drawY = 13; unit.mov = 30; unit.moveBudgetUsed = 0;
    engine.reach = computeReachable(unit, engine.tiles, engine.cols, engine.rows, engine.units, true, engine.decorOverlay);
    const before = { x: unit.x, y: unit.y };
    engine.commitMove(unit, { x: house.x - 1, y: house.y - 1 });
    if (engine.queue.length) failures.push('engine queued a move behind/inside house');
    if (unit.x !== before.x || unit.y !== before.y) failures.push('blocked move changed position');
    const destination = [...engine.reach.values()].find(p => p.y <= 9 && p.x >= 7);
    if (!destination) failures.push('no route around house');
    else {
      engine.commitMove(unit, destination);
      const movement = engine.queue.find(q => q.type === 'move');
      if (!movement) failures.push('valid detour did not queue');
      else {
        const blocked = new Set(houses.flatMap(h => placedBlockingFootprint(h).map(p => key(h.x + p.dx, h.y + p.dy))));
        if (movement.path.some(p => blocked.has(key(p.x, p.y)))) failures.push('live movement crosses a house');
        for (let i = 0; i < 1500 && engine.queue.length; i++) engine.tick(1 / 60);
        if (unit.x !== destination.x || unit.y !== destination.y) failures.push('detour did not finish');
      }
    }
    document.body.innerHTML = '<canvas width="1600" height="1000" style="width:1600px;height:1000px"></canvas>';
    const canvas = document.querySelector('canvas');
    engine.queue = []; engine.seq = null; engine.setZoom(0); engine.centerOnBoard();
    const { ThreeBattleRenderer } = await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const renderer = new ThreeBattleRenderer(canvas, engine);
    renderer.setSize(1600, 1000, 1);
    window.__houseRenderer = renderer;
    let housesReady = false;
    for (let i = 0; i < 600; i++) {
      renderer.render(1600, 1000);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const entries = renderer.decorEntries.filter(entry => houses.some(h => h.id === entry.placement.id && h.x === entry.placement.x && h.y === entry.placement.y));
      housesReady = entries.length === houses.length && entries.every(entry => {
        const image = entry.mesh.material.map?.image;
        return image?.complete && image.naturalWidth > 0;
      });
      if (housesReady && i >= 30) break;
    }
    if (!housesReady) failures.push('house artwork failed to finish loading for inspection: ' + JSON.stringify(houses.map(h => ({ id: h.id, image: engine.art.decorations[h.id]?.src, width: engine.art.decorations[h.id]?.naturalWidth, entries: renderer.decorEntries.filter(e => e.placement.id === h.id).length }))));
    window.__qaCanvas = canvas;
    const debug = document.createElement('canvas');
    debug.width = 1600; debug.height = 1000;
    debug.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    document.body.append(debug);
    const ctx = debug.getContext('2d');
    for (const house of houses) for (const { dx, dy } of placedBlockingFootprint(house)) {
      const anchor = engine.effectAnchor(house.x + dx, house.y + dy);
      const point = renderer.projectFlatScreen(anchor.x, anchor.y, 1600, 1000);
      ctx.fillStyle = 'rgba(255,40,40,.18)'; ctx.strokeStyle = '#ff7777';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 + 30) * Math.PI / 180;
        const x = point.x + Math.cos(angle) * anchor.tile * .85;
        const y = point.y + Math.sin(angle) * anchor.tile * .85;
        if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'white'; ctx.font = '11px sans-serif'; ctx.fillText(`${house.x+dx},${house.y+dy}`,point.x-14,point.y);
    }
    return { houses: houses.length, destinations, paths, failures };
  }, mission);
  await mkdir('work/house-collision-qa', { recursive: true });
  await page.screenshot({ path: 'work/house-collision-qa/live-map.png' });
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(result.failures, []);
} finally { await browser?.close(); }
