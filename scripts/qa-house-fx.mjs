import { chromium } from 'playwright';
import { checkedUrl } from './browser-guard.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/__house-qa', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto(checkedUrl('http://localhost:8080/__house-qa'));
  console.log(await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { tacticsProp } = await import('/src/game/gfx/three/ThreeTacticsGeometry.ts');
    const { ThreeBattleRenderer } = await import('/src/game/gfx/three/ThreeBattleRenderer.ts');
    const renderer = Object.create(ThreeBattleRenderer.prototype);
    renderer.engine = { tacticsCamera: true, cursor: { x: 0, y: 0 }, explored: () => true };
    renderer.groundHeight = () => 0;
    renderer.wallEntries = [];
    renderer.unitEntries = new Map();
    renderer.scene = new THREE.Scene();
    renderer.camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 2000);
    renderer.camera.up.set(0, 0, 1);
    renderer.camera.position.set(250, -400, 300);
    renderer.camera.lookAt(0, 0, 60);
    renderer.cameraBack = renderer.camera.position.clone().sub(new THREE.Vector3(0, 0, 60)).normalize();
    renderer.unitUp = new THREE.Vector3(0, 0, 1);
    const results = [];
    for (const id of ['small-house', 'stone-hut']) {
      const mesh = tacticsProp(id, 100, 140, new THREE.Texture(), new THREE.Texture());
      mesh.material.forEach(material => { material.opacity = 0.25; });
      renderer.scene.clear();
      renderer.scene.add(mesh);
      renderer.decorEntries = [{ mesh, placement: { id, x: 0, y: 0 } }];
      renderer.syncTacticsScenery(30);
      if (mesh.material.some(material => material.opacity !== 1 || !material.depthWrite)) throw new Error(`${id} still faded`);
      const uri = renderer.architectureFxMaskDataUri(400, 400);
      if (!uri) throw new Error(`${id} missing from FX mask`);
      const image = new Image();
      image.src = uri.slice(5, -2);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const center = new THREE.Vector3(0, 0, 30).project(renderer.camera);
      const x = Math.round((center.x + 1) * 200), y = Math.round((1 - center.y) * 200);
      const inside = ctx.getImageData(x, y, 1, 1).data[3];
      const outside = ctx.getImageData(0, 0, 1, 1).data[3];
      if (inside !== 0 || outside !== 255) {
        const pixels = ctx.getImageData(0, 0, 400, 400).data;
        let cutoutPixels = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) cutoutPixels++;
        throw new Error(`${id} FX mask failed: ${inside}, ${outside}; cutout pixels ${cutoutPixels}; center ${x},${y}`);
      }
      results.push({ id, opacity: 1, fxAlphaOverHouse: inside, fxAlphaOutside: outside });
    }
    return results;
  }));
} finally {
  await browser.close();
}
