import fs from 'node:fs';
const specs = [
 ['windgrass','Capim ao Vento','Uma matilha caça entre faixas de capim alto. As elevações laterais permitem vigiar a campina.', 'morvenianWolf','Lobo da campina',0],
 ['broken-caravan','A Caravana Dispersa','Salteadores cercam carroças abandonadas. Contorne as cargas para alcançar os arqueiros.', 'brigand','Saqueador da caravana',1],
 ['sunken-ford','O Vau da Campina','Um riacho atravessa a planície. Dois vaus oferecem passagem, mas lanceiros guardam a margem distante.', 'pikeman','Lanceiro do vau',2],
 ['old-stones','As Pedras do Sol Poente','Um círculo de pedras antigas virou altar de um culto. Interrompa o ritual usando as colinas para flanquear os vigias.', 'cultist','Devoto da pedra',3],
 ['silent-harvest','A Colheita Silenciosa','Os campos deixados pelos lavradores escondem mortos inquietos. Corredores entre ruínas e vegetação dividem o combate.', 'zombie','Morto da colheita',4],
 ['hill-patrol','A Patrulha do Espigão','Uma companhia hostil domina o espigão. Escolha entre o corredor central e os flancos abertos para desalojar os arqueiros.', 'captain','Oficial do espigão',5],
];
const maps=[];
for(const [slug,title,briefing,cls,name,n] of specs){
 const id=`random-plains-${slug}`,cols=26,rows=20;
 const d={id,title:`Planícies — ${title}`,place:'Planícies',index:12+n,briefing,objective:'Derrote todos os inimigos.',win:'rout',hub:false,explore:false,autoTactics:false,fog:false,environment:'outdoor',timeOfDay:n===3?'dusk':'day',sunIntensity:0.7,ambientIntensity:0.85,locationId:'',cols,rows,tiles:Array(cols*rows).fill('plains'),tileVariants:Array(cols*rows).fill(1+n),tileRots:Array(cols*rows).fill(0),decorations:[],playerSpawns:[['Kael','kaelFinal',2,15],['Neera','neera',3,16],['Voss','voss',2,17],['Salazar','salazar',1,16]].map(([name,classId,x,y])=>({name,classId,x,y,level:6})),enemySpawns:[],neutralSpawns:[],introDialogEnabled:true,outroDialogEnabled:true};
 const rect=(x0,y0,x1,y1,t,v)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){d.tiles[y*cols+x]=t;d.tileVariants[y*cols+x]=v;}};
 const prop=(id,x,y)=>d.decorations.push({id,x,y});
 const enemy=(name,classId,x,y)=>d.enemySpawns.push({name,classId,x,y,level:6});
 rect(5,2,8,5,'hill',4);rect(19,12,22,15,'hill',4);
 if(n===0){rect(9,4,11,13,'woods',9);rect(16,6,18,15,'woods',9);prop('mossy-boulder',6,2);}
 if(n===1){rect(5,9,22,11,'plains',39);prop('wooden-cart',10,7);prop('wilds-abandoned-cart',17,13);prop('wilds-camp',21,2);}
 if(n===2){rect(12,0,13,19,'water',22);rect(11,5,14,6,'plains',39);rect(11,13,14,14,'plains',39);prop('wilds-mossy-log',7,8);}
 if(n===3){rect(13,4,20,10,'ruins',7);prop('rune-stone',14,3);prop('rune-stone',21,10);prop('wilds-mossy-shrine',18,2);}
 if(n===4){rect(8,3,10,12,'woods',9);rect(16,5,18,14,'woods',9);rect(19,3,23,6,'ruins',7);prop('tombstones',11,2);prop('wilds-abandoned-cart',20,13);}
 if(n===5){rect(13,2,18,6,'hill',4);rect(13,11,18,15,'hill',4);prop('mossy-boulder',15,2);prop('wilds-camp',22,2);}
 prop('chest-medium',23,17);
 enemy(name,cls,10,6);enemy(name,cls,17,9);enemy(name,cls,20,16);enemy(n===0?'Lobo do espigão':'Vigia da campina',n===0?cls:'archer',21,5);enemy(n===4?'Morto do celeiro':'Guarda do campo',n===4?'zombie':n===0?cls:'brigand',15,13);
 const dialog=(suffix,lines)=>({id:`${id}-${suffix}`,startId:'line-0',lines:lines.map(([speaker,text],i)=>({id:`line-${i}`,speaker,text,next:i+1<lines.length?`line-${i+1}`:null}))});
 d.introDialog=dialog('intro',[['Neera',['O capim se move contra o vento. Lobos, bem perto.','As carroças foram abertas à força. Os donos não escolheram parar aqui.','Há dois vaus. Podemos atravessar longe dos lanceiros.','Essas pedras não eram um altar. Alguém trouxe o culto até aqui.','Nenhum pássaro nos campos. E aquelas figuras não estão trabalhando.','Arqueiros no espigão. A passagem central está na mira deles.'][n]],['Kael',['Mantenham o grupo unido e usem as elevações.','Vamos libertar a passagem e procurar sobreviventes.','Abram uma margem primeiro. Depois cruzaremos juntos.','Entremos pelos flancos antes que terminem o ritual.','Avancem pelos corredores. Não deixem os mortos nos cercarem.','Subiremos pelos lados. Tirem a vantagem dos arqueiros.'][n]]]);
 d.outroDialog=dialog('outro',[['Salazar',['A matilha dispersou. Podemos seguir pela campina.','Não encontramos sobreviventes. Levaremos a notícia à próxima parada.','A travessia está livre. Aproveitem para encher os cantis.','O ritual acabou. Que as pedras voltem a guardar apenas o silêncio.','Os campos ficaram quietos outra vez. Agora poderão ser cultivados.','A patrulha deixou provisões no acampamento. A estrada está aberta.'][n]]]);
 maps.push(d);
}
const p='src/game/random-encounters.json',config=JSON.parse(fs.readFileSync(p,'utf8')),region=config.regions.find(r=>r.id==='plains');
for(const d of maps){const path=`src/game/maps/${d.id}001.json`;if(fs.existsSync(path))throw Error(`Already exists ${path}`);}
for(const d of maps){fs.writeFileSync(`src/game/maps/${d.id}001.json`,JSON.stringify({serial:1,savedAt:Date.now(),draft:d},null,2)+'\n');region.encounterIds.push(d.id);}
fs.writeFileSync(p,JSON.stringify(config,null,2)+'\n');
console.log(maps.map(d=>d.title).join('\n'));
