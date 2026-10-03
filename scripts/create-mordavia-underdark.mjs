import fs from 'node:fs';
const main=['misty-root-descent','misty-spore-basin','misty-blackwater-shelf','misty-hollow-earth','mordavia-underdark'];
const cities=['misty-sporehaven','misty-deep-mycelium'];
const names=['A Garganta das Raízes','A Bacia dos Esporos','As Margens do Rio Negro','O Céu de Pedra','Underdark de Mordavia'];
const briefs=['Raízes da superfície pendem sobre uma garganta de pedra. Duas galerias contornam o abismo e convergem na escada inferior.','Uma floresta subterrânea de cogumelos ilumina as galerias. Uma ramificação leva ao pequeno refúgio Esporabrigo; a passagem principal continua descendo.','Um rio subterrâneo divide terraços de rocha. Duas pontes naturais cruzam o leito; as galerias do sul conduzem à Colônia do Micélio Profundo.','A caverna abre num vasto vazio sob o continente elevado. Ruínas em terraços e pilares naturais sustentam o teto; uma rampa leva ao último limiar.','A primeira região do submundo de Mordavia: um mar interior, ilhas de ruínas e bosques de fungos sob um teto que parece outro céu. Este é o início de futuras expansões.'];
const maps=[];
function make(id,title,n,city=false){const cols=city?36:n===4?52:44,rows=city?28:n===4?38:32;const d={id,index:14+n,title,place:'Subsolo de Mordavia',briefing:city?'Pequeno assentamento de homens-fungo. Habitantes e serviços usam placeholders editáveis enquanto a espécie é desenvolvida.':briefs[n],objective:city?'Converse com os habitantes e retorne à descida.':'Explore as galerias e encontre a passagem inferior.',win:'escape',hub:false,explore:true,autoTactics:false,fog:!city,environment:'indoor',timeOfDay:'darkNight',sunIntensity:0,ambientIntensity:0.68,mistType:'mist3',mistIntensity:0.12,bloomIntensity:0.35,wispIntensity:0.22,wispColor:5299350,locationId:'',cols,rows,tiles:Array(cols*rows).fill('void'),tileVariants:Array(cols*rows).fill(0),tileRots:Array(cols*rows).fill(0),decorations:[],playerSpawns:[['Kael','kaelFinal',4,16],['Neera','neera',5,17],['Voss','voss',4,18],['Salazar','salazar',3,17]].map(([name,classId,x,y])=>({name,classId,x,y,level:12+n})),enemySpawns:[],neutralSpawns:[]};maps.push(d);return d;}
function rect(d,x0,y0,x1,y1,t='nave',v=3){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){d.tiles[y*d.cols+x]=t;d.tileVariants[y*d.cols+x]=v;}}
function prop(d,id,x,y,extra={}){d.decorations.push({id,x,y,...extra});}
function link(d,x,y,target,back=false){prop(d,'floor-connector',x,y,{targetMapId:target,returnConnector:back});}
const chat=(id,speaker,text)=>({id,startId:'welcome',lines:[{id:'welcome',speaker,text,replies:[{text:'O que existe mais abaixo?',next:'depths'},{text:'Como vivem aqui?',next:'home'},{text:'Até logo.',next:'bye'}]},{id:'depths',speaker,text:'A água desce até o céu de pedra. Além dele começam as terras interiores de Mordavia. Voltem por estas mesmas galerias quando precisarem da superfície.',next:'welcome'},{id:'home',speaker,text:'Cultivamos luz, alimento e memória nas raízes do micélio. Nossas casas são jovens; haverá muito mais para conhecer aqui.',next:'welcome'},{id:'bye',speaker,text:'Que a luz dos esporos acompanhe seus passos.'}]});
for(let n=0;n<main.length;n++){const d=make(main[n],`Misty Cave — Profundidade ${n+1}: ${names[n]}`,n);const end=d.cols-5;
 rect(d,2,13,end,21);rect(d,7,3,18,12);rect(d,23,3,end,12);rect(d,10,22,22,d.rows-4);rect(d,28,22,end,d.rows-4);rect(d,14,9,17,25);rect(d,29,9,32,25);
 if(n===0){rect(d,20,13,23,16,'void',0);rect(d,21,4,24,8);rect(d,17,6,29,8);}
 if(n===1){rect(d,10,4,17,10,'woods',9);rect(d,29,23,36,27,'woods',9);}
 if(n===2){rect(d,20,0,22,d.rows-1,'water',22);rect(d,19,15,23,17);rect(d,19,25,23,27);}
 if(n===3){rect(d,10,5,17,10,'ruins',7);rect(d,29,23,36,27,'ruins',7);rect(d,20,13,24,15,'void',0);}
 if(n===4){rect(d,20,4,26,12,'water',22);rect(d,22,22,28,33,'water',22);rect(d,29,5,40,10,'woods',9);rect(d,31,25,44,32,'ruins',7);rect(d,12,26,19,33);}
 link(d,2,17,n===0?'misty-cave-dungeon':main[n-1],true);if(n<4)link(d,end,17,main[n+1]);
 if(n===1)link(d,12,6,cities[0]);if(n===2)link(d,30,26,cities[1]);
 for(const [x,y] of [[8,4],[17,24],[30,5],[36,24]])prop(d,'cave-glowing-mushrooms',x,y);
 prop(d,'rune-stone',10,10);prop(d,'chest-medium',end-1,20);
 d.enemySpawns=[['Sentinela das profundezas','pikeman',26,18],['Peregrino perdido','cultist',34,10],['Morto da galeria','zombie',18,20],['Vigia das ruínas','archer',33,25]].map(([name,classId,x,y])=>({name,classId,x,y,level:12+n}));
 d.introDialogEnabled=true;d.introDialog={id:`${d.id}-intro`,startId:'entry',lines:[{id:'entry',speaker:'Voss',text:['As raízes ainda alcançam este andar. A superfície está acima de nós, mas a caverna continua.','Essas luzes são fungos. Vejo casas entre eles; há gente vivendo aqui.','O rio corre para dentro da montanha. As margens guardam outra colônia.','Isso não é uma sala. É uma paisagem inteira sob o continente.','Mordavia tem outro horizonte debaixo do próprio chão. E nós acabamos de chegar.'][n]}]};
}
for(let n=0;n<2;n++){const d=make(cities[n],n===0?'Esporabrigo — Aldeia dos Homens-Fungo':'Micélio Profundo — Colônia dos Homens-Fungo',n+1,true);rect(d,2,3,33,25);rect(d,10,7,25,20,'woods',9);rect(d,3,14,31,19);rect(d,15,4,19,24);
 link(d,2,17,main[n+1],true);
 for(const [x,y] of [[6,5],[12,5],[22,5],[29,5],[6,22],[12,22],[22,22],[29,22]])prop(d,'cave-glowing-mushrooms',x,y);
 for(const [x,y] of [[7,9],[25,10],[24,22]])prop(d,'wilds-camp',x,y);
 const names=n===0?['Lume, Guardião dos Esporos','Nara, Cultivadora','Orun, Cronista']:['Siv, Guia das Profundezas','Talo, Jardineiro do Micélio','Ira, Guardiã da Colônia'];
 d.neutralSpawns=names.map((name,i)=>({name,classId:'travelingMerchant',x:10+i*6,y:16,level:12,dialog:chat(`${d.id}-npc-${i}`,name,['Bem-vindos a Esporabrigo. Somos o primeiro povo do micélio sob a névoa.','A colônia guarda as margens do rio negro. Há cavernas tão grandes que ninguém viu suas paredes.'][n])}));
}
const basePath='src/game/maps/misty-cave-dungeon001.json',base=JSON.parse(fs.readFileSync(basePath,'utf8'));
// Keep the original authored cave; publish a new editor version with an accessible descent.
base.serial=2;base.savedAt=Date.now();base.draft.decorations.push({id:'floor-connector',x:22,y:10,targetMapId:main[0]});
for(const d of maps)fs.writeFileSync(`src/game/maps/${d.id}001.json`,JSON.stringify({serial:1,savedAt:Date.now(),draft:d},null,2)+'\n',{flag:'wx'});
fs.writeFileSync('src/game/maps/misty-cave-dungeon002.json',JSON.stringify(base,null,2)+'\n',{flag:'wx'});
fs.writeFileSync('docs/mordavia-underdark.md',`# Subsolo de Mordavia\n\nMisty Cave → Garganta das Raízes → Bacia dos Esporos → Margens do Rio Negro → Céu de Pedra → Underdark de Mordavia.\n\nEsporabrigo ramifica da Bacia dos Esporos; Micélio Profundo ramifica das Margens do Rio Negro. Todas as ligações têm retorno. Nenhuma região nova cria um marcador na superfície.\n\nOs seis habitantes são placeholders visuais da classe travelingMerchant com diálogos próprios, sem comércio habilitado. Substituir por homens-fungo quando houver arte e classe. Aldeias sem inimigos; serviços e missões ficam para desenvolvimento posterior.\n\nO Underdark é a primeira região de uma expansão futura, com lago interior, bosque de fungos e ruínas. Mapas editáveis no editor, sem requisito novo de missão.\n`);
console.log('Created 5 descending regions, 2 settlements and Misty Cave version 2.');
