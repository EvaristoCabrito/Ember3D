import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='http://127.0.0.1:8080';
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const page=await browser.newPage({viewport:{width:1400,height:820}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
try{
  // 1) every frame is served
  const pools=['','move-','atk-','cast-','death-'];
  for(const p of pools)for(let i=1;i<=36;i++){const r=await page.request.get(`${base}/game/sprites/plague-bearing-cattle/${p}${i}.png?v=plague-cattle-001`);assert.equal(r.status(),200,`${p}${i}`);}
  // 2) the game boots (loadGameArt preloads SPRITES and rejects on any missing file)
  await page.goto(base);await page.waitForTimeout(8000);
  await page.screenshot({path:'work/plague-cattle/qa-game-boot.png'});
  // 3) side-by-side in the engine's draw boxes: both use size 2 * 1.283 height / 1.889 width
  await page.setContent(`<body style="margin:0;background:#3c4a38"><canvas id=c width=1400 height=820></canvas></body>`);
  await page.evaluate(async(base)=>{
    const load=s=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src=s;});
    const c=document.getElementById('c').getContext('2d');const cell=60;
    const h=cell*1.72*1.2*1.283,w=cell*1.85*1.2*1.889;
    const rows=[['undeadOx','?v=ox-36',['1','atk-19','cast-20','death-36']],['plague-bearing-cattle','?v=plague-cattle-001',['1','atk-19','cast-20','death-36']]];
    c.fillStyle='#fff';c.font='16px sans-serif';
    for(const [r,[id,bust,frames]] of rows.entries()){
      for(const [k,f] of frames.entries()){
        const im=await load(`${base}/game/sprites/${id}/${f}.png${bust}`);
        const x=20+k*(w+10),y=40+r*(h+40);
        c.strokeStyle='#c33';c.beginPath();c.moveTo(x,y+h*397/404);c.lineTo(x+w,y+h*397/404);c.stroke();
        c.drawImage(im,x,y,w,h);c.fillText(`${id} ${f}`,x,y-6);
      }
    }
  },base);
  await page.screenshot({path:'work/plague-cattle/qa-size-vs-undead-ox.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: 180 Plague Bearing Cattle frames served, game boots without errors, size sheet saved');
}finally{await browser.close();}
