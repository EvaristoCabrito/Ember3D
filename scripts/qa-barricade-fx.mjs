import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.route('**/__barricade-qa', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(checkedUrl('http://localhost:8080/__barricade-qa'));
  console.log(await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { decorationImage } = await import('/src/game/data.ts');
    const { ThreeBattleRenderer } = await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const img = new Image();
    img.src = decorationImage('barricade');
    await img.decode();
    const engine = {
      mission: { id: 'barricade-qa' }, tacticsCamera: true, cols: 10, rows: 10,
      decorations: [{ id: 'barricade', x: 0, y: 0 }], units: [], elementalFxPlacements: [],
      art: { decorations: { barricade: img } }, cursor: { x: 0, y: 0 }, explored: () => true,
    };
    const renderer = new ThreeBattleRenderer(document.createElement('canvas'), engine);
    renderer.groundHeight = () => 0;
    renderer.ensureDecorBuilt(100);
    const entry = renderer.decorEntries[0];
    if (!entry?.mesh.userData.tacticsAnchor?.fixed) throw new Error('Barricade is not fixed');
    if (!entry.mesh.castShadow || entry.shadowMesh || entry.proxy) throw new Error('Barricade must cast its own shadow without duplicate proxy casters');
    const orientation = entry.mesh.quaternion.clone();
    for (const angle of [0, 0.7, 2.1]) {
      renderer.unitFacing.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
      renderer.syncTacticsScenery(100);
      if (entry.mesh.quaternion.angleTo(orientation) > 1e-6) throw new Error('Barricade rotated with camera');
    }
    const source = document.createElement('canvas');
    source.width = img.naturalWidth;
    source.height = img.naturalHeight;
    const sourceCtx = source.getContext('2d');
    sourceCtx.drawImage(img, 0, 0);
    const data = sourceCtx.getImageData(0, 0, source.width, source.height).data;
    const sample = opaque => {
      let best, distance = Infinity;
      for (let y = 8; y < source.height - 8; y += 3) for (let x = 8; x < source.width - 8; x += 3) {
        let solid = true;
        for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
          const alpha = data[((y + dy) * source.width + x + dx) * 4 + 3];
          if (opaque ? alpha < 250 : alpha > 0) solid = false;
        }
        const d = Math.hypot(x - source.width / 2, y - source.height / 2);
        if (solid && d < distance) { best = { x, y }; distance = d; }
      }
      if (!best) throw new Error('Could not find an artwork alpha sample');
      return best;
    };
    renderer.camera = new THREE.OrthographicCamera(-180, 180, 180, -180, 0.1, 2000);
    renderer.camera.up.set(0, 0, 1);
    renderer.camera.position.copy(entry.mesh.position).add(new THREE.Vector3(90, -400, 180));
    renderer.camera.lookAt(entry.mesh.position);
    const uri = renderer.architectureFxMaskDataUri(640, 640);
    if (!uri) throw new Error('Barricade has no FX mask');
    const image = new Image();
    image.src = uri.slice(5, -2);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 640;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const alphaAt = ({ x, y }) => {
      const p = new THREE.Vector3(x / source.width - 0.5, 0.5 - y / source.height, 0)
        .applyMatrix4(entry.mesh.matrixWorld).project(renderer.camera);
      return ctx.getImageData(Math.round((p.x + 1) * 320), Math.round((1 - p.y) * 320), 1, 1).data[3];
    };
    const overWood = alphaAt(sample(true)), throughGap = alphaAt(sample(false));
    if (overWood > 10 || throughGap < 240) throw new Error(`Wrong barricade FX mask: wood ${overWood}, gap ${throughGap}`);
    return { fixedAcrossCameraTurns: true, castsOwnShadow: true, fxAlphaOverWood: overWood, fxAlphaThroughGap: throughGap };
  }));
} finally {
  await browser.close();
}
