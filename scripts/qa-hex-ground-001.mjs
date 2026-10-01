import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const origin = checkedUrl(process.argv[2] || "http://127.0.0.1:8080/");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const { drawHexGround } = await import('/src/game/hexGround.ts');
    const { WebGL2DRenderer } = await import('/src/game/gfx/WebGL2DRenderer.ts');
    const source = document.createElement('canvas');source.width=64;source.height=64;
    const paint = source.getContext('2d');
    const gradient=paint.createLinearGradient(0,0,64,64);
    gradient.addColorStop(0,'#195c9c');gradient.addColorStop(1,'#eb9632');
    paint.fillStyle=gradient;paint.fillRect(0,0,64,64);
    const make=()=>{const c=document.createElement('canvas');c.width=360;c.height=300;return c};
    const clipped=make(),reference=make(),panned=make();
    const a=new WebGL2DRenderer(clipped),b=new WebGL2DRenderer(reference),c=new WebGL2DRenderer(panned);
    const r=40;
    const render=(ctx,dx=0,dy=0)=>{
      for(let y=-2;y<8;y++)for(let x=-2;x<8;x++){
        const wx=r*Math.sqrt(3)*(x+.5*(y&1)+.5),wy=r*(1.5*y+1),cx=wx+dx,cy=wy+dy;
        ctx.save();ctx.beginPath();
        for(let i=0;i<6;i++){const t=(60*i-30)*Math.PI/180;const px=cx+r*Math.cos(t),py=cy+r*Math.sin(t);i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
        ctx.closePath();ctx.clip();drawHexGround(ctx,source,cx,cy,wx,wy,r);ctx.restore();
      }
    };
    render(a);render(c,11,7);
    // Independent reference: a globally mirrored material drawn without any hex clips.
    for(let y=-1;y<5;y++)for(let x=-1;x<6;x++){
      b.save();b.translate((x+(Math.abs(x%2)?1:0))*320,(y+(Math.abs(y%2)?1:0))*320);
      b.scale(Math.abs(x%2)?-1:1,Math.abs(y%2)?-1:1);b.drawImage(source,0,0,320,320);b.restore();
    }
    const pixels=canvas=>{
      const gl=canvas.getContext('webgl2');const out=new Uint8Array(360*300*4);
      gl.readPixels(0,0,360,300,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;
    };
    const pa=pixels(clipped),pb=pixels(reference),pc=pixels(panned);
    let gaps=0,maxDifference=0,panDifference=0;
    for(let y=15;y<280;y++)for(let x=15;x<330;x++){
      const index=((299-y)*360+x)*4;
      if(pa[index+3]!==255)gaps++;
      for(let channel=0;channel<3;channel++){
        maxDifference=Math.max(maxDifference,Math.abs(pa[index+channel]-pb[index+channel]));
        const shifted=((299-(y+7))*360+x+11)*4;
        panDifference=Math.max(panDifference,Math.abs(pa[index+channel]-pc[shifted+channel]));
      }
    }
    return {gaps,maxDifference,panDifference};
  });
  if(result.gaps || result.maxDifference>2 || result.panDifference>2)throw new Error(JSON.stringify(result));
  console.log('Hex continuity and camera anchoring passed:',result);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/hex-ground-001-preview.html',origin).href);
  await page.waitForFunction(()=>window.hexGroundReady,{},{timeout:30000});
  await page.screenshot({path:'screenshots/hex-ground-001-board.png',fullPage:true});
  await page.locator('#lines').uncheck();
  await page.screenshot({path:'screenshots/hex-ground-001-seam-check.png',fullPage:true});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log('All fourteen assets loaded and rendered with the game WebGL renderer.');
} finally {
  await browser.close();
}
