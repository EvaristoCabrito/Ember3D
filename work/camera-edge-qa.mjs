import {chromium} from 'playwright';
const base='http://127.0.0.1:8080';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage();
try{
  await page.goto(base);
  const out=await page.evaluate(async()=>{
    const {BattleEngine,ZOOM_RADII}=await import('/src/game/engine.ts');
    const {missionById,allMissions}=await import('/src/game/mapstore.ts');
    const res=[];
    const ids=['vau','bosque','aldeia','thebridge','estalagem','ashen-forest-crossing'];
    for(const id of ids){
      const mission=missionById(id);if(!mission){res.push(id+': missing');continue;}
      for(const [viewW,viewH] of [[1920,1080],[1280,720]]){
        const e=Object.assign(Object.create(BattleEngine.prototype),{mission,cols:mission.cols,rows:mission.rows,viewW,viewH,zoom:0,camX:0,camY:0,previewPanMarginRadii:0,emit:()=>{}});
        for(let z=0;z<ZOOM_RADII.length;z++){
          e.setZoom(z);const t=ZOOM_RADII[z],s3=Math.sqrt(3);
          const W=t*s3*(mission.cols+0.5),top=t*2.4,H=top+t*(1.5*(mission.rows-1)+2);
          e.restoreCamera({x:-1e6,y:-1e6});const L=-e.camX/(t*s3),T=(top-e.camY)/(1.5*t);
          e.restoreCamera({x:1e6,y:1e6});const R=(e.camX+viewW-W)/(t*s3),B=(e.camY+viewH-H)/(1.5*t);
          res.push(`${id}${e.fogged?' [FOG]':''} ${viewW}x${viewH} z${z}: left ${L.toFixed(2)} right ${R.toFixed(2)} top ${T.toFixed(2)} bottom ${B.toFixed(2)} hexes`);
        }
      }
    }
    return res;
  });
  console.log(out.join('\n'));
}finally{await browser.close();}
