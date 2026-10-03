import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ mode: 'development', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/__vau-camera', r => r.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__vau-camera`);
  const result = await page.evaluate(async () => {
    const { BattleEngine, ZOOM_RADII } = await import('/src/game/engine.ts');
    const { vauBackdropBounds } = await import('/src/game/vauBackdrop.ts');
    const { missionById } = await import('/src/game/mapstore.ts');
    const mission = missionById('vau');
    const image = new Image(); image.src = '/game/assets/vau-1-bg.jpg'; await image.decode();
    let checks = 0;
    for (const [viewW,viewH] of [[390,844],[1280,720],[1920,1080],[2560,1080]]) {
      const engine = Object.assign(Object.create(BattleEngine.prototype), { mission, cols: mission.cols, rows: mission.rows, art: { backdrops: { vau: image } }, viewW, viewH, zoom: 0, camX: 0, camY: 0, tacticsCamera: false, emit: () => {} });
      const covered = () => {
        const b=vauBackdropBounds(ZOOM_RADII[engine.zoom],mission.cols,viewW,viewH,image.width/image.height);
        const eps=1e-7;
        if(engine.camX<b.left-eps||engine.camY<b.top-eps||engine.camX+viewW>b.left+b.width+eps||engine.camY+viewH>b.top+b.height+eps) throw new Error(`Background exposed at ${viewW}x${viewH}, zoom ${engine.zoom}`);
        checks++;
      };
      for(let zoom=0;zoom<ZOOM_RADII.length;zoom++) {
        engine.setZoom(zoom);
        for(const [x,y] of [[-1e6,-1e6],[1e6,1e6],[-1e6,1e6],[1e6,-1e6]]) { engine.restoreCamera({x,y}); covered(); }
        engine.panBy(-1e6,1e6); covered();
      }
      engine.setZoom(0); covered();
    }
    return {checks,image:`${image.width}x${image.height}`,mission:mission.title};
  });
  console.log(JSON.stringify(result));
} finally { await browser?.close(); await server.close(); }
