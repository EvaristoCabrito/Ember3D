import fs from 'node:fs';
const C=20,R=16;
const make=(id,title,region,index,base,variant,briefing)=>({id,index,title,place:title,briefing,objective:'Derrote todos os inimigos.',win:'rout',hub:false,explore:false,autoTactics:false,fog:false,environment:region==='underworld'?'indoor':'outdoor',timeOfDay:region==='plains'?'dusk':'brightNight',sunIntensity:region==='underworld'?.15:.65,ambientIntensity:region==='underworld'?1.05:.9,locationId:'',cols:C,rows:R,tiles:Array(C*R).fill(base),tileVariants:Array(C*R).fill(variant),tileRots:Array(C*R).fill(0),decorations:[],playerSpawns:[['Kael','kaelFinal',2,11],['Neera','neera',3,12],['Voss','voss',2,13],['Salazar','salazar',1,12]].map(([name,classId,x,y])=>({name,classId,x,y,level:8})),enemySpawns:[],neutralSpawns:[]});
const paint=(m,x,y,t,v)=>{if(x>=0&&x<C&&y>=0&&y<R){m.tiles[y*C+x]=t;m.tileVariants[y*C+x]=v}};
const rect=(m,x0,y0,x1,y1,t,v)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)paint(m,x,y,t,v)};
const prop=(m,id,x,y,blocksPath=false)=>m.decorations.push({id,x,y,...(blocksPath?{blocksPath:true}:{})});
const enemy=(m,name,classId,x,y)=>m.enemySpawns.push({name,classId,x,y,level:8});
const maps=[];
let m=make('random-whispering-reeds','Emboscada no Rio dos Sussurros','plains',15,'plains',39,'O capim alto encobre saqueadores nas duas margens. Duas passagens rasas cortam o rio; a colina ao norte oferece uma posição de tiro, mas também revela quem a ocupa.');
for(let y=0;y<R;y++)for(let x=0;x<C;x++){
 if(x<2||y<2||x>17)paint(m,x,y,'woods',9);
 else if((x<8&&y<9)||(x>12&&y>7))paint(m,x,y,'plains',41);
 if(x>=3&&x<=6&&y>=2&&y<=5)paint(m,x,y,'hill',4);
 if(x>=13&&y<=5)paint(m,x,y,'plains',42);
}
for(let y=0;y<R;y++){const x=9+Math.round(1.4*Math.sin(y*.48));paint(m,x,y,'water',22);paint(m,x+1,y,'water',22);if(y===5||y===11){paint(m,x,y,'ruins',7);paint(m,x+1,y,'ruins',7);}}
[['wilds-mossy-log',4,7],['mossy-boulder',6,3],['rune-stone',15,3],['wilds-camp',15,12],['wooden-cart',5,14],['chest-medium',16,13],['dead-tree',18,5]].forEach(([id,x,y])=>prop(m,id,x,y));
[['Vigia da margem','archer',14,4],['Saqueador do capim','brigand',7,7],['Saqueador do vau','brigand',13,10],['Batedor','soldier',15,8],['Capitão dos juncos','captain',16,11],['Arqueiro da colina','archer',5,4]].forEach(a=>enemy(m,...a));maps.push([m,'plains']);
m=make('random-frostbound-sanctuary','O Santuário sob a Geada','ice',16,'snow',17,'Entre tundra e neve, um templo antigo ainda guarda o seu pátio de basalto. Os mortos cercam a nave central, enquanto sentinelas controlam as alas de calcário.');
for(let y=0;y<R;y++)for(let x=0;x<C;x++){if(x<5||y>11)paint(m,x,y,'snow',16);if(y<3||x>16)paint(m,x,y,'snow',15)}
rect(m,5,4,16,11,'nave',3);rect(m,8,3,12,10,'nave',4);rect(m,8,11,12,14,'ruins',7);
for(const [x,y] of [[6,5],[15,5],[6,9],[15,9]])paint(m,x,y,'column',2);
[['rune-stone',10,2],['city-root-shrine',10,5],['tombstones',5,3],['tombstones',16,3],['wilds-snowy-log',2,4],['wilds-snowy-dead-tree',17,12],['light-brazier-bowl',7,7],['light-brazier-bowl',13,7],['chest-medium',14,10]].forEach(([id,x,y])=>prop(m,id,x,y));
[['Guardião da nave','soldier',10,8],['Guardião da ala','pikeman',14,6],['Profanador','cultist',11,4],['Morto da geada','zombie',5,8],['Morto do santuário','zombie',15,10],['Sentinela','archer',13,3]].forEach(a=>enemy(m,...a));maps.push([m,'ice']);
m=make('random-crystal-ossuary','O Ossário de Ametista','underworld',17,'void',0,'Uma galeria de cristais desemboca em duas salas de masmorra. Um lago subterrâneo divide o salão; as passagens ao norte e ao sul permitem cercar os guardiões do ossário.');
for(let y=1;y<15;y++)for(let x=1;x<19;x++){if(((x-9.5)/9)**2+((y-8)/7)**2<1.13)paint(m,x,y,'nave',7);}
rect(m,1,10,5,14,'nave',7);rect(m,5,2,10,6,'nave',8);rect(m,12,7,17,12,'nave',9);rect(m,13,2,17,5,'nave',6);rect(m,4,7,7,9,'nave',5);
for(let y=6;y<=10;y++)for(let x=9;x<=11;x++)paint(m,x,y,'water',22);
[['large-boulder',7,3],['large-boulder',16,13],['dungeon-ossuary',15,3],['dungeon-hanging-cage',13,4],['light-wall-torch',14,2],['light-brazier-bowl',5,8],['locked-chest',16,10],['chest-medium',6,4],['rune-stone',17,8]].forEach(([id,x,y])=>prop(m,id,x,y));
[['Guarda do ossário','soldier',14,4],['Cultista de ametista','cultist',15,8],['Morto da galeria','zombie',6,5],['Morto da câmara','zombie',13,11],['Arqueiro das celas','archer',16,5],['Feiticeiro do lago','sorcerer',12,6]].forEach(a=>enemy(m,...a));maps.push([m,'underworld']);
for(const [draft] of maps){const file=`src/game/maps/${draft.id}001.json`;if(fs.existsSync(file))throw new Error(`Preserve existing ${file}`);fs.writeFileSync(file,JSON.stringify({serial:1,savedAt:Date.now(),draft},null,2)+'\n');}
const config=JSON.parse(fs.readFileSync('src/game/random-encounters.json','utf8'));
for(const [draft,region] of maps){const r=config.regions.find(r=>r.id===region);if(!r)throw new Error(region);if(!r.encounterIds.includes(draft.id))r.encounterIds.push(draft.id);}
fs.writeFileSync('src/game/random-encounters.json',JSON.stringify(config,null,2)+'\n');
console.log(maps.map(([m,r])=>`${m.title}: ${m.cols}x${m.rows}, ${m.enemySpawns.length} enemies, ${r}`).join('\n'));
