import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { checkedUrl } from './browser-guard.mjs';

// Run QA on a temporary loopback port and close it in finally, so this check never
// leaves the application's normal development port occupied.
const vite = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0 } });
await vite.listen();
const address = vite.httpServer.address();
assert.ok(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(checkedUrl(`${baseUrl}/game/icons/gold-coins-pile.png`));
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { DECORATIONS, TERRAIN, THREE_D_DOOR_VARIANTS, placedFootprint } = await import('/src/game/data.ts');
    const { buildDecorOverlay, HEX_BLOCKED } = await import('/src/game/hexprops.ts');
    const { createWallGeometry } = await import('/src/game/gfx/three/ThreeWalls.ts');
    const { BattleEngine } = await import('/src/game/engine.ts');
    const { ThreeBattleRenderer } = await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const checks = [];
    const check = (name, ok, detail) => { checks.push({ name, ok, detail }); };
    const tile = 48, height = tile * .75;
    check('wood, reinforced wood and stone passage door variants have paired states',
      Object.values(THREE_D_DOOR_VARIANTS).every(pair => DECORATIONS[pair.closed]?.wallTexture && DECORATIONS[pair.open]?.wallTexture && DECORATIONS[pair.open]?.model3d === 'doorway'));
    const thinWall = createWallGeometry(DECORATIONS['wall-3d-stone'], tile, 0);
    const thickWall = createWallGeometry(DECORATIONS['wall-3d-castle'], tile, 0);
    const corner = createWallGeometry(DECORATIONS['wall-3d-stone'], tile, 0, [{ x: tile * Math.sqrt(3), y: 0 }, { x: 0, y: tile * 1.5 }]);
    thinWall.computeBoundingBox(); thickWall.computeBoundingBox(); corner.computeBoundingBox();
    check('castle masonry is thicker than standard wall', thickWall.boundingBox.max.y - thickWall.boundingBox.min.y > thinWall.boundingBox.max.y - thinWall.boundingBox.min.y);
    check('corner wall mesh joins both axes', corner.boundingBox.max.x - corner.boundingBox.min.x > tile * 0.9 && corner.boundingBox.max.y - corner.boundingBox.min.y > tile * 1.4);
    thinWall.dispose(); thickWall.dispose(); corner.dispose();
    const doorWidths = [];
    for (const rot of [0, 1]) {
      const frame = createWallGeometry(DECORATIONS['door-3d-frame'], tile, rot);
      const door = createWallGeometry(DECORATIONS['door-3d-closed'], tile, rot);
      frame.computeBoundingBox(); door.computeBoundingBox();
      doorWidths.push({ x: door.boundingBox.max.x - door.boundingBox.min.x, y: door.boundingBox.max.y - door.boundingBox.min.y });
      const elevation = height * .4;
      const ray = new THREE.Raycaster(
        rot ? new THREE.Vector3(-100, elevation * 3.5, elevation) : new THREE.Vector3(0, -100 + elevation * 3.5, elevation),
        rot ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const a = new THREE.Mesh(frame, material), b = new THREE.Mesh(door, material);
      a.updateMatrixWorld(); b.updateMatrixWorld();
      check(`open passage has empty center, rotation ${rot}`, ray.intersectObject(a).length === 0);
      check(`closed door has solid center, rotation ${rot}`, ray.intersectObject(b).length > 0);
      check(`door height matches taller walls, rotation ${rot}`, Math.abs(frame.boundingBox.max.z - height) < .001);
      frame.dispose(); door.dispose(); material.dispose();
    }
    const wallHeight = height * 3.5;
    check('horizontal and vertical door pieces visibly turn with the toggle', doorWidths[0].x > doorWidths[0].y - wallHeight && doorWidths[1].y - wallHeight > doorWidths[1].x);
    const placements = ['door-3d-frame', 'door-3d-closed', 'wall-3d-stone', 'secret-door-3d-hidden', 'secret-door-3d-frame'].map((id, x) => ({ id, x, y: 0 }));
    const overlay = buildDecorOverlay(placements, 5, 1, placedFootprint);
    check('open passage allows movement', !(overlay[0] & HEX_BLOCKED));
    check('closed door blocks movement', !!(overlay[1] & HEX_BLOCKED));
    check('wall blocks movement', !!(overlay[2] & HEX_BLOCKED));
    check('stone secret door blocks movement while hidden', !!(overlay[3] & HEX_BLOCKED));
    check('opened secret door passage allows movement', !(overlay[4] & HEX_BLOCKED));

    const image = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
    const { tileVariantSrc } = await import('/src/game/assets.ts');
    const floor = await image(tileVariantSrc('nave', 0));
    const marker = document.createElement('canvas'); marker.width = 64; marker.height = 128;
    const markerCtx = marker.getContext('2d'); markerCtx.fillStyle = '#00ff00'; markerCtx.fillRect(8, 4, 48, 124);
    const sprite = await image(marker.toDataURL());
    const sprites = new Proxy({}, { get: () => [sprite] });
    const art = new Proxy({ tiles: Object.fromEntries(Object.keys(TERRAIN).map(id => [id, [floor]])), decorations: {}, sprites, impact: [] }, { get: (t, k) => t[k] ?? {} });
    const mission = { id: 'architecture-qa', index: 1, title: 'QA', place: '', briefing: '', objective: '', cols: 12, rows: 12, layout: Array(12).fill('n'.repeat(12)), playerSpawns: [{ name: 'QA', classId: 'swordsman', x: 5, y: 5 }], enemySpawns: [], neutralSpawns: [], decorations: [
      ...[3,4,5,6,7].map(x => ({ id: 'wall-3d-tower', x, y: 4 })),
      { id: 'door-3d-frame', x: 3, y: 7, rot: 0 },
      { id: 'door-3d-closed', x: 6, y: 7, rot: 0 },
      { id: 'door-3d-frame', x: 9, y: 7, rot: 1 },
    ], explore: true, autoTactics: false, win: 'rout', fog: false, mistType: 'none' };
    const engine = new BattleEngine(mission, art, { hp: {}, levels: {} }, 1);
    engine.setZoom(0); engine.reducedMotion = true;
    const canvas = document.createElement('canvas'); document.body.replaceChildren(canvas);
    const renderer = new ThreeBattleRenderer(canvas, engine);
    renderer.setSize(1100, 800, 1); renderer.render(1100, 800);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const counter = document.createElement('canvas'); counter.width = 1100; counter.height = 800;
    const ctx = counter.getContext('2d');
    const countGreen = () => {
      ctx.clearRect(0,0,1100,800); ctx.drawImage(canvas,0,0);
      const pixels = ctx.getImageData(0,0,1100,800).data; let count = 0;
      for(let i = 0; i < pixels.length; i += 4) if(pixels[i+1] > 40 && pixels[i+1] > pixels[i] * 2 && pixels[i+1] > pixels[i+2] * 2) count++;
      return count;
    };
    const unit = engine.units[0]; unit.fade = 1;
    unit.y = 5; renderer.render(1100,800); const front = countGreen();
    unit.y = 3; renderer.render(1100,800); const behind = countGreen();
    check('character visible in front and occluded behind wall', front > 0 && front > behind * 1.2, { front, behind });
    unit.y = 5; renderer.render(1100,800);
    check('no missing doors in scene', renderer.wallEntries.filter(e => e.placement.id.startsWith('door-')).length === 3);
    const architectureEntry = renderer.wallEntries.find(e => e.placement.id.startsWith('wall-'));
    const architectureWall = architectureEntry?.mesh;
    const unitShadow = renderer.unitEntries.get(unit.id)?.contactMesh;
    check('3D walls cast from physical geometry and receive real shadows', !!architectureEntry?.shadowMesh.castShadow && !!architectureWall?.receiveShadow);
    const shadowBox = new THREE.Box3().setFromObject(architectureEntry.shadowMesh);
    check('physical wall remains upright for light and shadow calculations', shadowBox.max.y - shadowBox.min.y < engine.updateCameraLayout(1100,800) * .6);
    check('character contact shadow stays on the ground layer', !!unitShadow && unitShadow.position.z < .1 && unitShadow.material.depthTest);
    const facingMission = { ...mission, playerSpawns: [{ name: 'Neera', classId: 'neera', x: 3, y: 5 }], enemySpawns: [{ name: 'Target', classId: 'brigand', x: 8, y: 5 }] };
    const facingEngine = new BattleEngine(facingMission, art, { hp: {}, levels: {} }, 2);
    const neera = facingEngine.units.find(u => u.name === 'Neera');
    const target = facingEngine.units.find(u => u.name === 'Target');
    for (const [x, direction] of [[8, 1], [1, -1]]) {
      target.x = x;
      neera.facing = -direction;
      facingEngine.queue = [{ type: 'combat', att: neera.id, def: target.id }];
      facingEngine.startSeq(facingEngine.queue.shift());
      const visual = facingEngine.unitVisual(neera, 48);
      check(`Neera bow attack faces target at ${direction === 1 ? 'right' : 'left'}`, neera.facing === direction && Math.sign(visual.scaleX) === direction);
      facingEngine.active = null;
      neera.facing = -direction;
      facingEngine.queue = [{ type: 'combat', att: neera.id, def: target.id, customDice: { dice: 1, faces: 6, bonus: 0 } }];
      facingEngine.startSeq(facingEngine.queue.shift());
      const offhandVisual = facingEngine.unitVisual(neera, 48);
      check(`Neera offhand attack faces target at ${direction === 1 ? 'right' : 'left'}`, neera.facing === direction && Math.sign(offhandVisual.scaleX) === direction);
      facingEngine.active = null;
    }
    for (const [x, rot] of [[3, 0], [9, 1]]) {
      unit.x = unit.drawX = x; unit.y = unit.drawY = 7; unit.moved = true;
      renderer.render(1100,800);
      const frame = renderer.wallEntries.find(e => e.placement.x === x && e.placement.y === 7);
      const sprite = renderer.unitEntries.get(unit.id);
      const renderTile = engine.updateCameraLayout(1100,800);
      const backY = -frame.mesh.position.y - renderTile * (rot ? 0.75 : 0.16);
      check(`crossing character stays behind the open frame, rotation ${rot}`, sprite.mesh.position.z < 1 + backY / renderTile * .004);
      check(`crossing character remains opaque, rotation ${rot}`, sprite.material.opacity === 1);
    }
    unit.x = unit.drawX = 5; unit.y = unit.drawY = 5; unit.moved = false;
    renderer.render(1100,800);
    const player = engine.units[0];
    player.x = player.drawX = 6; player.y = player.drawY = 6;
    player.bag.lockpick = 1; engine.selectedId = player.id; engine.phase = 'player'; engine.mode = 'selected';
    engine.useLockpick();
    check('lockpick opens 3D door', engine.decorations.some(p => p.x === 6 && p.y === 7 && p.id === 'door-3d-frame') && player.bag.lockpick === 0);
    check('opened 3D door preserves floor and allows movement', engine.tiles[7 * 12 + 6] === 'nave' && engine.hexAt(6,7).passable);
    const secretEngine = new BattleEngine({ ...mission, id: 'secret-door-qa', decorations: [{ id: 'secret-door-3d-hidden', x: 6, y: 7 }] }, art, { hp: {}, levels: {} }, 1);
    const secretPlayer = secretEngine.units[0];
    secretPlayer.x = secretPlayer.drawX = 6; secretPlayer.y = secretPlayer.drawY = 6;
    secretPlayer.bag.lockpick = 1; secretEngine.selectedId = secretPlayer.id; secretEngine.phase = 'player'; secretEngine.mode = 'selected';
    secretEngine.useLockpick();
    check('lockpick reveals the matched stone secret passage', secretEngine.decorations.some(p => p.id === 'secret-door-3d-frame' && p.x === 6 && p.y === 7));
    const { computeReachable } = await import('/src/game/pathfinding.ts');
    const routeEngine = new BattleEngine({ ...mission, id: 'door-route-qa', explore: false,
      decorations: Array.from({ length: 12 }, (_, x) => ({ id: x === 8 ? 'door-3d-frame' : 'wall-3d-tower', x, y: 4 })),
    }, art, { hp: {}, levels: {} }, 1);
    const walker = routeEngine.units[0];
    walker.x = walker.drawX = 5; walker.y = walker.drawY = 5;
    walker.mov = 30; walker.moveBudgetUsed = 0;
    routeEngine.selectedId = walker.id; routeEngine.mode = 'selected';
    routeEngine.reach = computeReachable(walker, routeEngine.tiles, 12, 12, routeEngine.units, true, routeEngine.decorOverlay);
    const destination = { x: 5, y: 3 };
    routeEngine.hover = destination;
    const preview = routeEngine.movementPreview();
    check('movement preview routes through the doorway', preview.some(p => p.x === 8 && p.y === 4) && preview.every(p => routeEngine.hexAt(p.x,p.y).passable));
    routeEngine.commitMove(walker, destination);
    const walk = routeEngine.queue.find(action => action.type === 'move');
    check('actual walking route follows the doorway without crossing walls', !!walk && walk.path.some(p => p.x === 8 && p.y === 4) && walk.path.every(p => routeEngine.hexAt(p.x,p.y).passable));
    const queueLength = routeEngine.queue.length;
    routeEngine.commitMove(walker, { x: 5, y: 4 });
    check('blocked destination never falls back to straight movement', routeEngine.queue.length === queueLength);
    window.__architectureQA = { engine, renderer };
    return checks;
  });
  await page.screenshot({ path: 'C:/Users/evari/.codex/visualizations/2026/10/01/01a0f571-4a42-7532-9a51-da27406ef7f7/architecture-doors-qa.png' });
  console.log(JSON.stringify({ result, errors }, null, 2));
  assert.equal(errors.length, 0, 'browser/shader errors');
  for (const check of result) assert.ok(check.ok, check.name);
} finally { await browser?.close(); await vite.close(); }
