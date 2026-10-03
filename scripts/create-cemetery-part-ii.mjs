// Append authored editor saves; earlier maps and FX remain available unchanged.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'src/game/maps';
const source = JSON.parse(fs.readFileSync(path.join(dir, 'cemiterio-esquecidos004.json'), 'utf8'));
const partId = 'cemetery-ground-part-ii';
const cryptId = n => `cemetery-ground-deep-crypt-${n}`;
function save(draft, serial = 1) {
  const file = path.join(dir, `${draft.id}${String(serial).padStart(3, '0')}.json`);
  if (fs.existsSync(file)) throw new Error(`Save already exists: ${file}`);
  fs.writeFileSync(file, JSON.stringify({ serial, savedAt: Date.now(), draft }, null, 2) + '\n');
}
function prop(d, id, x, y, extra = {}) { d.decorations.push({ id, x, y, ...extra }); }
function rect(d, x0, y0, x1, y1, tile, elevation = 0) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * d.cols + x; d.tiles[i] = tile; d.terrainElevations[i] = elevation;
  }
}
function wall(d, x0, y0, x1, y1, gaps = []) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
    if (gaps.some(([gx, gy]) => gx === x && gy === y)) continue;
    prop(d, 'wall-3d-crypt', x, y, { blocksPath: true, wallOrientation: y === y0 || y === y1 ? 'horizontal' : 'vertical' });
  }
}
function base(id, title, cols, rows, indoor) {
  return { id, title, place: title, index: 13, briefing: '', objective: 'Explore as câmaras e use as passagens para avançar ou voltar.', win: 'escape', hub: false, explore: false, autoTactics: false, fog: true,
    environment: indoor ? 'indoor' : 'outdoor', timeOfDay: indoor ? 'darkNight' : 'brightNight', sunIntensity: indoor ? 0.12 : 3.5, ambientIntensity: indoor ? 0.42 : 1.4,
    mistType: indoor ? 'vignette3' : 'mist4', mistIntensity: 0.25, mistSpeed: 0.6, bloomIntensity: 0.7, wispIntensity: 0.2, wispSpeed: 0.6, wispColor: 16754002,
    locationId: '', music: '', cols, rows, tiles: Array(cols * rows).fill(indoor ? 'void' : 'plains'), tileVariants: Array(cols * rows).fill(0), tileRots: Array(cols * rows).fill(0), terrainElevations: Array(cols * rows).fill(0), baseTile: indoor ? 'nave' : 'plains', baseVariant: 0,
    decorations: [], elementalFx: [], playerSpawns: source.draft.playerSpawns.map((s, i) => ({ ...s, x: indoor ? 22 + i : 5 + i, y: indoor ? 35 : 24 })), enemySpawns: [], neutralSpawns: [] };
}
const first = structuredClone(source.draft);
first.terrainElevations ??= Array(first.cols * first.rows).fill(0);
// A clear east avenue joins the new district without removing the original scenery.
rect(first, 53, 22, 59, 23, 'nave');
prop(first, 'floor-connector', 58, 22, { targetMapId: partId });
prop(first, 'door-3d-frame', 57, 22);
prop(first, 'light-candle', 56, 23);
for (const [x, y] of [[27, 40], [33, 40], [22, 27], [38, 27]]) {
  if (!first.decorations.some(p => p.x === x && p.y === y)) prop(first, 'wilds-cemetery-lantern', x, y);
}
first.briefing += ' A alameda a leste atravessa um arco de pedra e continua em Cemetery Ground Part II, onde a Cripta Profunda guarda quatro andares.';
first.objective += ' e atravesse a alameda leste para Cemetery Ground Part II';
save(first, 5);

const second = base(partId, 'Cemetery Ground Part II', 64, 48, false);
second.briefing = 'Além do arco oriental, longas alamedas dividem os jardins funerários. Um lago escuro contorna a capela arruinada; no extremo norte, a Cripta Profunda desce por quatro vastos andares. A passagem oeste retorna ao primeiro cemitério.';
second.objective = 'Explore o segundo cemitério e os quatro andares da Cripta Profunda; volte pela passagem oeste.';
rect(second, 0, 21, 60, 27, 'nave'); rect(second, 28, 3, 34, 44, 'nave');
for (const [x0, y0, x1, y1] of [[8, 5, 25, 18], [38, 5, 56, 18], [8, 31, 25, 43], [38, 31, 56, 43]]) {
  rect(second, x0, y0, x1, y1, 'ruins');
  for (let y = y0 + 2; y < y1; y += 4) for (let x = x0 + 2; x < x1; x += 4) prop(second, (x + y) % 3 ? 'wilds-gothic-gravestone' : 'wilds-broken-gravestone', x, y, { blocksPath: true });
}
for (let y = 5; y < 45; y += 6) for (const x of [27, 35]) prop(second, 'wilds-cemetery-lantern', x, y);
for (let x = 8; x < 60; x += 8) for (const y of [20, 28]) prop(second, 'wilds-cemetery-lantern', x, y);
wall(second, 25, 2, 37, 12, [[30, 12], [31, 12], [32, 12]]);
rect(second, 26, 3, 36, 11, 'nave');
prop(second, 'door-3d-frame', 31, 12); prop(second, 'floor-connector', 31, 5, { targetMapId: cryptId(1) });
prop(second, 'floor-connector', 3, 24, { targetMapId: first.id, returnConnector: true });
prop(second, 'wilds-knight-statue', 27, 8); prop(second, 'wilds-knight-statue', 35, 8);
rect(second, 58, 31, 62, 42, 'water');
second.waterVersion = 'v4'; second.waterLevels = second.tiles.map(t => t === 'water' ? 0 : null);
rect(second, 40, 33, 47, 38, 'ruins', 1);
for (const [x,y] of [[12,10],[44,10],[15,36],[50,36]]) prop(second, 'chest-medium', x, y);
for (const [x,y] of [[1,4],[60,4],[2,40],[60,18]]) prop(second, 'dead-tree', x, y, { blocksPath: true });
second.enemySpawns = [[16,15],[46,15],[18,34],[49,39],[31,16],[54,24],[41,35],[22,9]].map(([x,y],i) => ({ name: i % 2 ? 'Guardião dos Túmulos' : 'Morto da Alameda', classId: i % 2 ? 'cultistV2' : 'zombie', x, y, level: 11 }));
save(second);

const names = ['Vestíbulo dos Sepultados', 'Galerias do Ossuário', 'Reservatório dos Esquecidos', 'Santuário da Última Vigília'];
for (let n = 1; n <= 4; n++) {
  const d = base(cryptId(n), `Cripta Profunda — Andar ${n}: ${names[n-1]}`, 48, 40, true);
  d.briefing = [`Salões funerários cercam uma nave ampla. As escadas ao sul voltam ao cemitério; as do norte descem ao ossuário.`, `Quatro ossuários se abrem para uma galeria central. Patrulhas guardam as passagens laterais e a descida ao reservatório.`, `Águas antigas ocupam as alas externas. Uma travessia seca cruza o reservatório e conduz ao santuário inferior.`, `No fundo da cripta, um santuário elevado domina a nave. O guardião da última vigília protege os sarcófagos e o tesouro; retorne pelas escadas ao sul.`][n-1];
  rect(d, 2, 2, 45, 37, 'nave'); wall(d, 1, 1, 46, 38);
  // Four large side chambers, broad cross-aisles and an unobstructed central nave.
  for (const [x0,y0,x1,y1,gx,gy] of [[3,3,19,16,19,10],[28,3,44,16,28,10],[3,23,19,36,19,29],[28,23,44,36,28,29]]) {
    wall(d,x0,y0,x1,y1,[[gx,gy],[gx,gy+1],[gx,gy+2]]);
    prop(d,'door-3d-frame',gx,gy+1,{rot:1});
    for (const [x,y] of [[x0+3,y0+3],[x1-4,y1-3]]) prop(d,n===2?'dungeon-ossuary':'dungeon-sarcophagus',x,y,{blocksPath:true});
    prop(d,'light-wall-torch',x0+1,y0+1); prop(d,'chest-medium',x1-3,y0+3);
  }
  for (const y of [5,13,25,33]) for (const x of [21,26]) prop(d,'light-candle',x,y);
  prop(d,'floor-connector',23,36,{targetMapId:n===1?partId:cryptId(n-1),returnConnector:true});
  if(n<4) prop(d,'floor-connector',23,3,{targetMapId:cryptId(n+1)});
  if(n===3) {
    for(const [x0,x1] of [[6,15],[32,41]]) rect(d,x0,18,x1,21,'water',-1);
    d.waterVersion='v4'; d.waterLevels=d.tiles.map(t=>t==='water'?-0.5:null);
  }
  if(n===4) {
    rect(d,20,4,27,12,'nave',1); rect(d,22,13,25,14,'nave',0.5);
    prop(d,'wilds-altar-sarcophagus',23,6,{blocksPath:true});
    prop(d,'locked-chest',25,9); prop(d,'wilds-knight-statue',20,8); prop(d,'wilds-knight-statue',27,8);
    d.objective='Explore o santuário e seu tesouro; retorne aos andares superiores pela escadaria sul.';
  }
  d.enemySpawns=[[10,11],[36,11],[11,29],[36,29],[23,19],[24,8],[17,19],[31,20]].map(([x,y],i)=>({name:n===4&&i===5?'Guardião da Última Vigília':i%2?'Sentinela Ossuária':'Morto da Cripta',classId:i%2?'cultistV2':'zombie',x,y,level:11+n, ...(n===4&&i===5?{guaranteedDrop:true}:{})}));
  save(d);
}
console.log('Created Cemetery Part I revision, Part II, and four deep crypt floors.');
