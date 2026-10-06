import fs from 'node:fs';
const file='src/game/maps/ashen-forest-crossing001.json';
if(fs.existsSync(file))throw new Error('Preserve the existing map: append a new serial instead.');
const cols=88,rows=32,size=cols*rows;
const tiles=Array(size).fill('plains'),tileVariants=Array(size).fill(0),tileRots=Array(size).fill(0),terrainElevations=Array(size).fill(0);
const decorations=[],trail=new Set();
const points=[[4,25],[21,25],[31,10],[47,10],[60,24],[74,24],[83,6]];
for(let p=1;p<points.length;p++){
  const [ax,ay]=points[p-1],[bx,by]=points[p];const steps=Math.max(Math.abs(bx-ax),Math.abs(by-ay))*2;
  for(let i=0;i<=steps;i++){
    const x=Math.round(ax+(bx-ax)*i/steps),y=Math.round(ay+(by-ay)*i/steps);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx*dx+dy*dy<=5){
      const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<cols&&ny<rows){const k=ny*cols+nx;trail.add(k);tiles[k]='ruins';}
    }
  }
}
const prop=(id,x,y,extra={})=>decorations.push({id,x,y,...extra});
// Sparse, hand-spaced pockets of woodland leave broad clearings around the long trail.
for(let y=3;y<rows-2;y+=4)for(let x=3;x<cols-2;x+=4){
  if(trail.has(y*cols+x)||trail.has(y*cols+x+1))continue;
  if((x*3+y*5)%7===0)continue;
  const id=(x+y)%3===0?'tree-3d-dead-oak':(x+y)%3===1?'tree-3d-dead-snag':'tree-3d-twisted-stump';
  prop(id,x,y,{blocksPath:true});
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const k=(y+dy)*cols+x+dx;if(!trail.has(k))tiles[k]='woods';}
}
// Low ash ridges frame a dry ravine; a wide trail cuts safely through the middle.
for(let y=2;y<30;y++)for(let x=50;x<=54;x++)if(!trail.has(y*cols+x)){tiles[y*cols+x]='hill';terrainElevations[y*cols+x]=1;}
for(const [x,y] of [[5,22],[20,22],[31,7],[47,7],[60,21],[74,21],[83,3]])prop('wilds-weathered-signpost',x,y);
for(const [x,y] of [[18,28],[35,13],[63,27]]){
  if(!decorations.some(p=>p.x===x&&p.y===y))prop('chest-medium',x,y);
}
for(const [x,y] of [[19,18],[40,19],[70,10]])if(!decorations.some(p=>p.x===x&&p.y===y))prop('wilds-hollow-log',x,y);
// The only completion waypoint is at the far end: clearing one encounter is not a crossing.
prop('dungeon-exit',83,6);
const players=[['Kael','kaelFinal',4,25],['Neera','neera',3,25],['Voss','voss',4,26],['Salazar','salazar',3,26],['Aldric','aldric',5,26],['Malrec','conjurer',5,25]].map(([name,classId,x,y])=>({name,classId,x,y,level:8}));
const enemies=[[19,25,'brigand','Trail Brigand'],[22,24,'archer','Ashwood Lookout'],[31,10,'zombie','Ashen Wanderer'],[34,10,'zombie','Ashen Wanderer'],[46,10,'cultistV2','Keeper of Cinders'],[47,11,'soldier','Ravine Sentinel'],[60,24,'mordavianWolfFinal','Mordavian Wolf Final'],[62,24,'mordavianWolfFinal','Mordavian Wolf Final'],[74,24,'brigand','Trail Brigand'],[76,23,'archer','Ashwood Lookout'],[82,9,'cultistV2','Keeper of the Trail'],[83,8,'soldier','Eastern Sentinel']].map(([x,y,classId,name])=>({x,y,classId,name,level:8}));
const draft={id:'ashen-forest-crossing',index:7,title:'Ashen Forest Crossing',place:'Ashen Forest — Eastern Trail',briefing:'Beyond the Inn, a long trail winds through pale trunks, broad ash clearings and a dry ravine. The woodland is more open than Wisp Forest, but the eastern exit lies far away. Follow the markers through the woods; the southeastern shortcut is impassable.',objective:'Follow the long ashwood trail and reach the eastern exit.',win:'escape',hub:false,explore:false,autoTactics:false,fog:true,environment:'outdoor',timeOfDay:'dusk',sunIntensity:2.4,ambientIntensity:1.1,mistType:'vignette3',mistIntensity:0.16,mistSpeed:0.45,bloomIntensity:0.4,wispIntensity:0.06,wispSpeed:0.4,wispColor:0xd6b991,locationId:'ashen-forest',music:'',cols,rows,tiles,tileVariants,tileRots,terrainElevations,baseTile:'plains',baseVariant:0,decorations,elementalFx:[],playerSpawns:players,enemySpawns:enemies,neutralSpawns:[]};
fs.writeFileSync(file,JSON.stringify({serial:1,savedAt:Date.now(),draft},null,2)+'\n');
console.log({file,size:`${cols}x${rows}`,decorations:decorations.length,trailCells:trail.size});
