import { vauBackdropBounds } from "../src/game/vauBackdrop.ts";
const Z=[22,34,50,72],cols=16,rows=14,ratio=1712/1152,s3=Math.sqrt(3);
for (const [vw,vh] of [[1280,720],[1600,900],[1920,1080],[2560,1440]]) for (const t of Z) {
  const w=t*s3*(cols+.5),pad=t*2.4,h=t*(1.5*(rows-1)+2)+pad;
  const e=4,loX=-e*s3*t,hiX=w+e*s3*t-vw,loY=pad-e*1.5*t,hiY=h+e*1.5*t-vh;
  const res=[];
  for (const [x0,y0] of [[-1e6,-1e6],[1e6,1e6]]) {
    let x=hiX<loX?(loX+hiX)/2:Math.min(hiX,Math.max(loX,x0)), y=hiY<loY?(loY+hiY)/2:Math.min(hiY,Math.max(loY,y0));
    const b=vauBackdropBounds(t,cols,vw,vh,ratio);
    x=Math.min(Math.max(b.left+b.width,w)-vw,Math.max(Math.min(b.left,0),x)); y=Math.min(Math.max(b.top+b.height,h)-vh,Math.max(Math.min(b.top,pad),y));
    const inside=x>=b.left-1e-6&&y>=b.top-1e-6&&x+vw<=b.left+b.width+1e-6&&y+vh<=b.top+b.height+1e-6;
    const L=(-x)/(s3*t),T=(pad-y)/(1.5*t),R=(x+vw-w)/(s3*t),B=(y+vh-h)/(1.5*t);
    res.push(x0<0?`L ${L.toFixed(2)} T ${T.toFixed(2)}`:`R ${R.toFixed(2)} B ${B.toFixed(2)}`, inside?'in picture':'BLACK');
  }
  console.log(`${vw}x${vh} tile ${t}:`, res.join(' | '));
}
