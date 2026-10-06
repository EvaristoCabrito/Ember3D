import fs from 'node:fs';
const specs = [
  {id:'random-coldwind-saddle',title:'Coldwind Saddle',cols:26,rows:20,story:'Cold wind whistles through hollow trunks on a rocky saddle. Toll collectors emerge from both ridges and demand your winter supplies.',ending:'The false toll station falls silent. Beyond the hollow trees, the mountain road opens again.',enemies:[[18,5,'captain','Coldwind Tollmaster'],[15,6,'archer','Ridge Lookout'],[21,8,'archer','Ridge Lookout'],[13,11,'brigand','Supply Raider'],[19,12,'pikeman','Pass Enforcer'],[17,9,'soldier','Pass Enforcer']]},
  {id:'random-hollow-pine-basin',title:'Hollow Pine Basin',cols:28,rows:22,story:'The hollow pines amplify every footstep. A hungry pack circles the shallow basin, moving between broken trunks and the bare hills.',ending:'The pack scatters into the mist. Scratches inside the hollow trunks explain why travellers never camp here.',enemies:[[18,5,'mordavianWolfFinal','Mordavian Wolf Final'],[21,9,'mordavianWolfFinal','Mordavian Wolf Final'],[16,12,'mordavianWolfFinal','Mordavian Wolf Final'],[22,15,'mordavianWolfFinal','Mordavian Wolf Final'],[12,9,'mordavianWolfFinal','Mordavian Wolf Final'],[19,16,'mordavianWolfFinal','Mordavian Wolf Final']]},
  {id:'random-cairnkeepers-rise',title:'Cairnkeeper’s Rise',cols:26,rows:24,story:'Old cairns climb a windswept slope among dead oaks. Grave robbers have disturbed the stones, and the mountain’s guardian rises with the buried dead.',ending:'The guardian settles back beside the cairns. A clean path remains between the graves, leading safely over the rise.',enemies:[[19,6,'ancientGolem','Cairnkeeper'],[15,11,'zombie','Buried Traveller'],[21,13,'zombie','Buried Traveller'],[12,7,'brigand','Cairn Robber'],[17,16,'cultistV2','Stone Whisperer'],[22,18,'zombie','Buried Traveller']]},
  {id:'random-splintered-trunk-pass',title:'Splintered Trunk Pass',cols:30,rows:20,story:'A dead forest has toppled across the mountain pass. Hunters use its hollow logs as blinds, trapping travellers between a broken rock wall and the fallen trunks.',ending:'The hunters abandon their blinds. The hollow logs hold stolen provisions, and the split rock wall offers a way onward.',enemies:[[23,5,'ranger','Trunk Hunter'],[18,7,'archer','Hidden Marksman'],[25,11,'archer','Hidden Marksman'],[15,11,'assassin','Pass Stalker'],[21,14,'brigand','Pass Raider'],[13,6,'soldier','Hunter’s Guard'],[25,15,'pikeman','Hunter’s Guard']]},
  {id:'random-rimewater-shrine',title:'Rimewater Shrine',cols:28,rows:24,story:'A thin skin of frost rims an unfrozen mountain spring. Dead trees shelter a forgotten shrine, where an ash cult prepares a sacrifice beneath the hollow branches.',ending:'The shrine’s candles gutter out. The spring still runs beneath its thin frost, and the wind carries away the last whispered prayer.',enemies:[[20,6,'sorcerer','Rimewater Seer'],[15,9,'cultistV2','Hollow Branch Acolyte'],[23,11,'cultist','Spring Acolyte'],[17,14,'soldier','Shrine Sentinel'],[22,17,'zombie','Cold Pilgrim'],[12,12,'zombie','Cold Pilgrim'],[19,18,'cultist','Spring Acolyte']]},
];
const configFile='src/game/random-encounters.json';
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const mountain=config.regions.find(r=>r.id==='mountain');
if(!mountain)throw new Error('Mountain region missing');
for(const s of specs)if(fs.existsSync(`src/game/maps/${s.id}001.json`))throw new Error(`Preserve existing save: ${s.id}`);
for(const [variant,s] of specs.entries()){
  const {cols,rows}=s,size=cols*rows;
  const players=[['Kael','kaelFinal',3,rows-5],['Neera','neera',4,rows-4],['Voss','voss',2,rows-4],['Salazar','salazar',3,rows-3]].map(([name,classId,x,y])=>({name,classId,x,y,level:8}));
  const enemies=s.enemies.map(([x,y,classId,name])=>({x,y,classId,name,level:8}));
  const occupied=[...players,...enemies],reserved=(x,y)=>occupied.some(p=>Math.abs(p.x-x)<=3&&Math.abs(p.y-y)<=3);
  const trail=(x,y)=>Math.abs(y-(rows-5-(x-3)*(rows-10)/(cols-7)))<=2;
  const d={id:s.id,index:20,title:s.title,place:s.title,briefing:s.story,objective:'Defeat all enemies and secure the mountain trail.',win:'rout',hub:false,explore:false,autoTactics:false,fog:false,environment:'outdoor',timeOfDay:variant===2?'dusk':'dawn',sunIntensity:0.85,ambientIntensity:0.95,mistType:'vignette3',mistIntensity:0.18,mistSpeed:0.65,bloomIntensity:0.35,wispIntensity:0,locationId:'',music:'',cols,rows,tiles:Array(size).fill('plains'),tileVariants:Array(size).fill(0),tileRots:Array(size).fill(0),terrainElevations:Array(size).fill(0),baseTile:'plains',baseVariant:0,decorations:[],elementalFx:[],playerSpawns:players,enemySpawns:enemies,neutralSpawns:[],introDialogEnabled:true,introDialog:{id:`${s.id}-intro`,startId:'start',lines:[{id:'start',speaker:'Narrador',text:s.story}]},outroDialogEnabled:true,outroDialog:{id:`${s.id}-outro`,startId:'start',lines:[{id:'start',speaker:'Narrador',text:s.ending}]}};
  const prop=(id,x,y,extra={})=>d.decorations.push({id,x,y,...extra});
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const i=y*cols+x;
    if(trail(x,y)){d.tiles[i]='ruins';continue;}
    let ridge=false;
    if(variant===0)ridge=y<5||y>rows-5;
    if(variant===1)ridge=x<5||x>cols-5||y<4;
    if(variant===2)ridge=x>cols/2&&y<rows-4;
    if(variant===3)ridge=y<5||(x>cols-6&&y<rows-5);
    if(variant===4)ridge=(x<6||x>cols-5)&&y<rows-3;
    if(ridge){d.tiles[i]='hill';d.terrainElevations[i]=1+(variant===2&&x>cols-7?0.5:0);}
    else if((x*7+y*3+variant)%11<3)d.tiles[i]='woods';
    // Sparse frost pockets: most of the board stays bare stone, earth and woodland.
    if(!reserved(x,y)&&ridge&&(x*11+y*7+variant)%17===0)d.tiles[i]='snow';
  }
  // Dense scenery at the margins and irregular hollow/dead-tree groves in the clearings.
  for(let y=1;y<rows-1;y+=2)for(let x=1;x<cols-1;x+=2){
    if(reserved(x,y)||trail(x,y))continue;
    const h=(x*13+y*17+variant*19)%9;
    if(h===0)continue;
    const id=h<3?'wilds-hollow-stump':h<5?'wilds-hollow-log':h===5?'tree-3d-dead-oak':h===6?'tree-3d-dead-snag':h===7?'wilds-dead-oak':'tree-3d-twisted-stump';
    prop(id,x,y,{blocksPath:true,rot:(x+y+variant)%6});
  }
  // Broken rock ribs are discontinuous, so the mountain geometry never seals a route.
  for(let x=2;x<cols-2;x+=4){
    const y=variant===1?2:variant===3?4:1;
    if(!reserved(x,y)&&!trail(x,y)&&!d.decorations.some(p=>p.x===x&&p.y===y))prop('rock-3d-broken',x,y,{blocksPath:true,wallOrientation:'horizontal'});
  }
  if(variant===2)for(const [x,y] of [[11,3],[9,9],[10,16]])if(!reserved(x,y))prop('rune-stone',x,y);
  if(variant===3)for(const [x,y] of [[8,3],[9,9],[8,13]])if(!reserved(x,y))prop('wilds-hollow-log',x,y,{blocksPath:true});
  if(variant===4){
    for(let y=3;y<=7;y++)for(let x=8;x<=10;x++){d.tiles[y*cols+x]='water';d.terrainElevations[y*cols+x]=-0.5;}
    d.waterVersion='v4';d.waterLevels=d.tiles.map(t=>t==='water'?-0.25:null);
    prop('wilds-ruined-wayside-shrine',12,3);prop('light-candle',13,3);
  }
  for(const [x,y] of [[2,2],[cols-3,rows-3]])if(!reserved(x,y)&&!d.decorations.some(p=>p.x===x&&p.y===y))prop('chest-medium',x,y);
  prop('wilds-weathered-signpost',5,rows-2);
  fs.writeFileSync(`src/game/maps/${s.id}001.json`,JSON.stringify({serial:1,savedAt:Date.now(),draft:d},null,2)+'\n');
  if(!mountain.encounterIds.includes(s.id))mountain.encounterIds.push(s.id);
  console.log(`${s.title}: ${cols}x${rows}, ${d.decorations.length} decorations, ${enemies.length} enemies`);
}
fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
