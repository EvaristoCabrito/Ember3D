import fs from 'node:fs';

// Native Map Editor saves, using only the project's existing artwork and roster.
const cols = 20, rows = 16;
const maps = [];
const dialog = (id, speaker, text) => ({ id, startId: 'start', lines: [{ id: 'start', speaker, text }] });
function make(id, title, index, briefing, intro, outro) {
  const d = {
    id, index, title, place: title, briefing, objective: 'Derrote todos os inimigos.', win: 'rout',
    hub: false, explore: false, autoTactics: false, fog: false,
    environment: 'outdoor', timeOfDay: 'brightNight', sunIntensity: 0.65, ambientIntensity: 0.9,
    locationId: '', cols, rows, tiles: Array(cols * rows).fill('snow'),
    tileVariants: Array(cols * rows).fill(17), tileRots: Array(cols * rows).fill(0), decorations: [],
    playerSpawns: [['Kael', 'kaelFinal', 2, 11], ['Neera', 'neera', 3, 12], ['Voss', 'voss', 2, 13], ['Salazar', 'salazar', 1, 12]]
      .map(([name, classId, x, y]) => ({ name, classId, x, y, level: 8 })),
    enemySpawns: [], neutralSpawns: [],
    introDialogEnabled: true, introDialog: dialog(`${id}-intro`, 'Narrador', intro),
    outroDialogEnabled: true, outroDialog: dialog(`${id}-outro`, 'Narrador', outro),
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (x < 2 || y < 2 || x > 17) d.tileVariants[y * cols + x] = 15;
    else if (y > 11) d.tileVariants[y * cols + x] = 16;
  }
  maps.push(d);
  return d;
}
function rect(d, x0, y0, x1, y1, terrain, variant) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = y * cols + x; d.tiles[k] = terrain; d.tileVariants[k] = variant;
  }
}
const props = (d, list) => list.forEach(([id, x, y]) => d.decorations.push({ id, x, y }));
const enemies = (d, list) => list.forEach(([name, classId, x, y]) => d.enemySpawns.push({ name, classId, x, y, level: 8 }));

let d = make('random-bell-beneath-ice', 'O Sino sob o Gelo', 18,
  'Um sino ressoa sob o lago congelado. Duas passagens de neve levam à capela em ruínas; os mortos guardam suas colunas e o pátio central.',
  'Sob o gelo transparente, uma capela afogada responde ao toque de um sino. Os reflexos se movem sozinhos. Um sussurro pede que vocês libertem o pátio dos mortos antes de silenciar o chamado.',
  'Os guardiões caem e o sino se cala. Algo enorme se move nas profundezas. Vocês deixam a capela antes que a superfície volte a tremer.');
rect(d, 7, 2, 12, 13, 'water', 22);
rect(d, 6, 4, 14, 10, 'nave', 3);
rect(d, 7, 6, 12, 7, 'nave', 4);
rect(d, 7, 11, 12, 11, 'snow', 15);
rect(d, 7, 3, 12, 3, 'snow', 15);
for (const [x, y] of [[7, 5], [13, 5], [7, 9], [13, 9]]) rect(d, x, y, x, y, 'column', 2);
props(d, [['rune-stone', 10, 4], ['tombstones', 6, 2], ['tombstones', 15, 9], ['wilds-snowy-log', 3, 5], ['chest-medium', 14, 10]]);
enemies(d, [['Afogado da capela', 'zombie', 8, 8], ['Guardião do sino', 'cultist', 11, 5], ['Morto do lago', 'zombie', 14, 6], ['Vigia da margem', 'archer', 16, 4], ['Afogado da nave', 'zombie', 10, 9], ['Sentinela da geada', 'pikeman', 15, 11]]);

d = make('random-small-toll-collector', 'O Pequeno Cobrador de Pedágio', 19,
  'Um cobrador de pedágio e seus comparsas ocupam uma passagem estreita. Contorne as barricadas pelo sul ou avance pelo corredor central; arqueiros vigiam as colinas.',
  'Um pequeno cobrador, enrolado num casaco enorme, exige sopa quente, uma piada ou um segredo. Atrás dele, uma cabra com chifres de madeira parece comandar a conversa. Seus comparsas decidem cobrar o pedágio à força.',
  'Sem os comparsas, o cobrador admite a derrota e revela o caminho protegido da avalanche. A cabra dá uma cabeçada nele: aparentemente, era ela quem mandava.');
rect(d, 7, 1, 10, 5, 'hill', 4); rect(d, 7, 10, 10, 14, 'hill', 4);
rect(d, 9, 6, 13, 8, 'ruins', 7);
for (const y of [4, 5, 9, 10]) rect(d, 11, y, 11, y, 'barricade', 0);
props(d, [['wooden-cart', 13, 7], ['wilds-camp', 15, 9], ['wilds-snowy-pines', 4, 3], ['wilds-snowy-log', 5, 14], ['chest-medium', 16, 10]]);
enemies(d, [['Pequeno cobrador', 'brigand', 12, 7], ['Comparsa do pedágio', 'brigand', 14, 8], ['Vigia da encosta', 'archer', 9, 3], ['Vigia do desfiladeiro', 'archer', 9, 12], ['Chefe dos comparsas', 'captain', 16, 7]]);

d = make('random-walking-campfire', 'A Fogueira Andante', 20,
  'Um antigo construto conduz viajantes por uma clareira de braseiros. Saqueadores cercam o abrigo: enfrente-os entre as ruínas, antes de continuar até o templo.',
  'Na nevasca, uma luz acompanha um construto de pedra. Um braseiro preso às suas costas aquece os viajantes, e objetos queimados mostram lembranças nas chamas. Saqueadores surgem nas duas alas da clareira.',
  'A clareira está livre. O construto retoma sua marcha em direção ao templo distante. Nas brasas, uma última lembrança mostra suas portas abertas, convidando os viajantes a seguir.');
rect(d, 6, 6, 14, 10, 'ruins', 7); rect(d, 9, 2, 12, 5, 'nave', 4);
props(d, [['light-brazier-bowl', 7, 7], ['light-brazier-bowl', 13, 9], ['wilds-camp', 6, 10], ['wilds-snowy-pines', 3, 3], ['wilds-snowy-pines', 16, 12], ['wilds-snowy-log', 15, 3], ['rune-stone', 10, 2]]);
d.neutralSpawns.push({ name: 'Portador do braseiro', classId: 'ancientGolem', x: 10, y: 7, level: 8,
  dialog: dialog('campfire-guide', 'Voz nas brasas', 'O fogo se alimenta de lembranças. Quando o caminho estiver livre, seguiremos até o templo. Você pode vir conosco.') });
enemies(d, [['Saqueador da nevasca', 'brigand', 5, 6], ['Saqueador das ruínas', 'brigand', 15, 8], ['Arqueiro do abrigo', 'archer', 14, 4], ['Caçador do norte', 'ranger', 8, 3], ['Capitão da emboscada', 'captain', 16, 10], ['Saqueador da retaguarda', 'soldier', 6, 14]]);

d = make('random-backward-hunt', 'A Caçada sem Fim', 21,
  'Caçadores amaldiçoados cercam uma trilha de tundra. Um lago divide o campo; as rotas ao norte e ao sul permitem flanquear os arqueiros.',
  'Uma pequena criatura branca cruza a trilha com uma flecha prateada na boca, deixando pegadas humanas. Caçadores sem pegadas surgem da tormenta. A presa roubou a flecha para interromper uma caçada que se repete há séculos; vocês se colocam entre ela e os perseguidores.',
  'Com os perseguidores vencidos, a flecha se desfaz ao primeiro brilho da aurora. As pegadas humanas desaparecem e a pequena criatura segue livre. Pela primeira vez em séculos, a trilha permanece em silêncio.');
rect(d, 8, 5, 11, 10, 'water', 22); rect(d, 5, 2, 7, 4, 'hill', 4); rect(d, 13, 10, 16, 12, 'hill', 4);
rect(d, 8, 3, 11, 4, 'snow', 16); rect(d, 8, 11, 11, 12, 'snow', 16);
props(d, [['wilds-snowy-pines', 3, 4], ['wilds-snowy-pines', 15, 3], ['wilds-snowy-dead-tree', 17, 12], ['wilds-snowy-log', 5, 9], ['rune-stone', 12, 2], ['chest-medium', 16, 13]]);
enemies(d, [['Caçador sem pegadas', 'archer', 14, 5], ['Rastreador amaldiçoado', 'ranger', 15, 11], ['Lanceiro da tormenta', 'pikeman', 12, 8], ['Morto da caçada', 'zombie', 7, 7], ['Morto da trilha', 'zombie', 13, 13], ['Mestre da caçada', 'sorcerer', 16, 7]]);

const configPath = 'src/game/random-encounters.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const ice = config.regions.find(r => r.id === 'ice');
if (!ice) throw new Error('Missing ice region');
for (const map of maps) {
  const path = `src/game/maps/${map.id}001.json`;
  if (fs.existsSync(path) || ice.encounterIds.includes(map.id)) throw new Error(`Already exists: ${map.id}`);
}
for (const map of maps) {
  fs.writeFileSync(`src/game/maps/${map.id}001.json`, JSON.stringify({ serial: 1, savedAt: Date.now(), draft: map }, null, 2) + '\n', { flag: 'wx' });
  ice.encounterIds.push(map.id);
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(maps.map(d => `${d.id}: ${d.enemySpawns.length} enemies`).join('\n'));
