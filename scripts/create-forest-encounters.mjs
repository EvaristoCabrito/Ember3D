import fs from 'node:fs';

const cols = 22, rows = 18, maps = [];
const tree = (id, lines) => ({ id, startId: lines[0].id, lines });
const conversation = (id, entries) => tree(id, entries.map(([speaker, text], i) => ({ id: `line-${i}`, speaker, text, next: i + 1 < entries.length ? `line-${i + 1}` : null })));
function make(id, title, index, briefing, intro, outro) {
  const d = { id, title, place: title, index, briefing, objective: 'Derrote todos os inimigos.', win: 'rout',
    hub: false, explore: false, autoTactics: false, fog: false, environment: 'outdoor', timeOfDay: 'day',
    sunIntensity: 0.65, ambientIntensity: 0.9, locationId: '', cols, rows,
    tiles: Array(cols * rows).fill('woods'), tileVariants: Array(cols * rows).fill(9), tileRots: Array(cols * rows).fill(0),
    decorations: [], playerSpawns: [['Kael', 'kaelFinal', 2, 13], ['Neera', 'neera', 3, 14], ['Voss', 'voss', 2, 15], ['Salazar', 'salazar', 1, 14]]
      .map(([name, classId, x, y]) => ({ name, classId, x, y, level: 8 })), enemySpawns: [], neutralSpawns: [],
    introDialogEnabled: true, introDialog: conversation(`${id}-intro`, intro),
    outroDialogEnabled: true, outroDialog: conversation(`${id}-outro`, outro),
  };
  maps.push(d); return d;
}
function paint(d, x0, y0, x1, y1, terrain, variant) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = y * cols + x; d.tiles[k] = terrain; d.tileVariants[k] = variant; }
}
const props = (d, entries) => entries.forEach(([id, x, y]) => d.decorations.push({ id, x, y }));
const enemies = (d, entries) => entries.forEach(([name, classId, x, y]) => d.enemySpawns.push({ name, classId, x, y, level: 8 }));

let d = make('random-caravan-green-road', 'A Caravana da Estrada Verde', 22,
  'Carroças de mantimentos estão cercadas por salteadores. Mara, Tomás e Ilda se abrigam na clareira. Vença todos os atacantes e conclua a missão para receber 400 Gold e 12 rações, com os três viajantes vivos. Clique nos NPCs para conversar.',
  [['Mara, chefe da caravana', 'Ei! Vocês, na trilha! Há gente viva atrás dessas carroças!'],
    ['Tomás, cocheiro', 'Eu disse que a estrada estava quieta demais. Mara disse que era porque eu finalmente tinha parado de cantar.'],
    ['Ilda, curandeira', 'Guardem o fôlego para depois. Eles vêm pelo barranco e pela margem do riacho.'],
    ['Mara, chefe da caravana', 'Levamos comida e remédios para uma aldeia que não pode esperar. Limpem a estrada e eu pago 400 Gold, mais 12 rações. Palavra de quem ainda pretende chegar em casa.'],
    ['Kael', 'Fiquem junto às carroças. Vamos abrir caminho.']],
  [['Mara, chefe da caravana', 'O último deles caiu... Tomás? Ilda? Respondam alguma coisa!'],
    ['Tomás, cocheiro', 'Presente. A roda perdeu um raio, meu orgulho perdeu dois, mas ambos ainda rodam.'],
    ['Ilda, curandeira', 'Os remédios estão intactos. Amanhã, gente que nunca saberá seus nomes vai acordar por causa do que vocês fizeram.'],
    ['Mara, chefe da caravana', 'Aqui estão os 400 Gold e as 12 rações que prometi. Aceitem. Gratidão não enche cantil, mas uma caravana sabe preparar provisões.'],
    ['Neera', 'Então entreguem os remédios. Essa é a parte que vale mais.']]);
d.objective = 'Derrote todos os salteadores e ajude Mara, Tomás e Ilda.';
d.victoryReward = { ember: 400, rations: 12, requiredNpcNames: ['Mara', 'Tomás', 'Ilda'] };
paint(d, 1, 11, 19, 12, 'plains', 39); paint(d, 9, 6, 16, 13, 'plains', 39);
paint(d, 6, 2, 8, 5, 'hill', 4);
for (let y = 0; y < rows; y++) paint(d, 18, y, 19, y, 'water', 22);
paint(d, 18, 10, 19, 12, 'ruins', 7);
props(d, [['wooden-cart', 10, 9], ['wilds-abandoned-cart', 14, 11], ['wilds-camp', 13, 7], ['wilds-mossy-log', 4, 6], ['mossy-boulder', 7, 3], ['wilds-lantern-post', 16, 12], ['chest-medium', 15, 7]]);
enemies(d, [['Salteador do barranco', 'brigand', 7, 5], ['Arqueiro da copa', 'archer', 8, 3], ['Salteador da estrada', 'brigand', 16, 10], ['Saqueador do riacho', 'soldier', 20, 11], ['Capitão dos salteadores', 'captain', 15, 5], ['Arqueiro da retaguarda', 'archer', 6, 16], ['Cão dos saqueadores', 'wardog', 16, 14]]);
d.neutralSpawns = [
  { name: 'Mara', classId: 'travelingMerchant', x: 12, y: 10, level: 8, dialog: tree('caravan-mara', [
    { id: 'start', speaker: 'Mara', text: 'Minha mãe dizia: nunca confie numa estrada que parece fácil. Eu devia ter escutado antes de comprar três carroças.', replies: [{ text: 'O que vocês transportam?', next: 'cargo' }, { text: 'Como os salteadores cercaram vocês?', next: 'ambush' }, { text: 'Falemos da recompensa.', next: 'reward' }] },
    { id: 'cargo', speaker: 'Mara', text: 'Grãos, ataduras e remédios para febre. O baú bonito está quase vazio; o que importa cabe em sacos sem enfeite.', next: 'pledge' },
    { id: 'ambush', speaker: 'Mara', text: 'Um tronco na estrada. Arqueiros no barranco. O capitão ficou ao norte, contando nossa carga antes mesmo de nos derrubar.', next: 'pledge' },
    { id: 'reward', speaker: 'Mara', text: '400 Gold e 12 rações quando os atacantes forem derrotados e pudermos partir. Não é esmola: é pagamento justo por um serviço que ninguém mais quis fazer.', next: 'pledge' },
    { id: 'pledge', speaker: 'Mara', text: 'Ajudem-nos a sair daqui, e eu entrego cada moeda prometida. E, se encontrarem alguém da Estrada Verde, digam que Mara lhes deve uma boa história.' },
  ]) },
  { name: 'Tomás', classId: 'woodsman', x: 11, y: 11, level: 8, dialog: tree('caravan-tomas', [
    { id: 'start', speaker: 'Tomás', text: 'Se perguntarem, eu estava consertando a roda. Não me escondendo atrás dela. Há uma diferença técnica muito importante.', replies: [{ text: 'Alguma dica sobre o terreno?', next: 'route' }, { text: 'Ainda consegue conduzir a caravana?', next: 'wheel' }] },
    { id: 'route', speaker: 'Tomás', text: 'A ponte baixa a leste ainda aguenta peso. O mato ao sul contorna os arqueiros, mas o barranco ao norte dá a eles uma bela visão da clareira.', next: 'wheel' },
    { id: 'wheel', speaker: 'Tomás', text: 'Consigo. Uma roda torta não impede ninguém de chegar em casa. Só dá assunto para o caminho — e eu nunca desperdiço assunto.' },
  ]) },
  { name: 'Ilda', classId: 'oldHealer', x: 13, y: 9, level: 8, dialog: tree('caravan-ilda', [
    { id: 'start', speaker: 'Ilda', text: 'Venha para cá só se precisar falar. Não quero que parem no meio de uma flecha por educação.', replies: [{ text: 'Por que essa entrega é tão urgente?', next: 'village' }, { text: 'Você parece tranquila.', next: 'calm' }] },
    { id: 'village', speaker: 'Ilda', text: 'Febre na aldeia da outra margem. Crianças, velhos, gente que já passou semanas esperando. Cada frasco inteiro aqui é um dia a mais para alguém lá.', next: 'thanks' },
    { id: 'calm', speaker: 'Ilda', text: 'Estou com medo. Só aprendi que minhas mãos trabalham melhor quando não deixo o medo falar por elas.', next: 'thanks' },
    { id: 'thanks', speaker: 'Ilda', text: 'Mara paga em moedas. Eu agradeço de outro jeito: vou me lembrar de vocês em cada porta onde esses remédios chegarem.' },
  ]) },
];

d = make('random-broken-antler-grove', 'O Bosque do Chifre Partido', 23,
  'Um círculo antigo foi ocupado por profanadores. As ruínas centrais oferecem abrigo, mas as alas de vegetação alta escondem os flancos. Um baú grande guarda as oferendas roubadas.',
  [['Neera', 'Esses símbolos não foram riscados pelo tempo. Alguém os cortou de propósito.'], ['Voss', 'Os vigias também não parecem muito interessados em receber visitantes.'], ['Salazar', 'O círculo está cercado de ossos recentes. Vamos acabar com o ritual antes que ganhe uma voz.']],
  [['Salazar', 'O canto parou. As marcas antigas ainda estão sob os riscos; talvez o bosque saiba se refazer.'], ['Neera', 'Deixem as pedras em paz. Levaremos só o que os profanadores roubaram dos viajantes.']]);
paint(d, 7, 5, 15, 11, 'ruins', 7); paint(d, 9, 6, 13, 10, 'nave', 4);
paint(d, 3, 3, 5, 6, 'plains', 41); paint(d, 16, 10, 19, 14, 'plains', 41);
for (const [x, y] of [[8, 6], [14, 6], [8, 10], [14, 10]]) paint(d, x, y, x, y, 'column', 2);
props(d, [['city-root-shrine', 11, 6], ['rune-stone', 11, 3], ['wilds-mossy-shrine', 6, 8], ['wilds-mossy-log', 3, 8], ['mossy-boulder', 17, 4], ['tombstones', 16, 8], ['chest-large', 14, 9]]);
enemies(d, [['Profanador do círculo', 'cultist', 11, 8], ['Morto das oferendas', 'zombie', 9, 9], ['Morto das raízes', 'zombie', 15, 10], ['Vigia do bosque', 'archer', 17, 6], ['Guarda do menir', 'pikeman', 8, 4], ['Feiticeiro do chifre', 'sorcerer', 13, 4]]);

d = make('random-river-rope-ambush', 'A Emboscada do Vau das Cordas', 24,
  'Saqueadores fingiram deixar uma travessia vazia. O rio divide o campo e duas passagens rasas permitem cruzá-lo; os arqueiros controlam a elevação na margem oposta.',
  [['Voss', 'Uma carroça vazia, cordas recém-cortadas e nenhuma pegada voltando pela estrada. Armadilha.'], ['Kael', 'Já nos viram. A travessia do sul parece mais larga.'], ['Neera', 'Ou podemos tomar a elevação e devolver a vista aos arqueiros. Com juros.']],
  [['Voss', 'A carga roubada estava escondida na outra margem. Eles planejavam voltar quando a água baixasse.'], ['Kael', 'Agora a travessia fica aberta. Que o próximo viajante encontre apenas um rio.']]);
for (let y = 0; y < rows; y++) { const x = 10 + Math.round(Math.sin(y * 0.4)); paint(d, x, y, x + 1, y, 'water', 22); }
paint(d, 9, 4, 13, 5, 'ruins', 7); paint(d, 8, 12, 12, 13, 'ruins', 7);
paint(d, 15, 3, 18, 6, 'hill', 4); paint(d, 2, 7, 7, 9, 'plains', 39);
props(d, [['wilds-abandoned-cart', 5, 8], ['wilds-mossy-log', 7, 3], ['mossy-boulder', 17, 4], ['wilds-camp', 17, 11], ['chest-large', 18, 12], ['wilds-lantern-post', 14, 5]]);
enemies(d, [['Arqueiro da elevação', 'archer', 16, 5], ['Arqueiro do vau', 'archer', 14, 11], ['Saqueador da corda', 'brigand', 8, 6], ['Lanceiro da travessia', 'pikeman', 13, 5], ['Capitão do rio', 'captain', 17, 10], ['Saqueador da margem', 'brigand', 15, 14]]);

d = make('random-hollow-root-den', 'A Toca das Raízes Ocas', 25,
  'Lobos e saqueadores disputam um acampamento abandonado. Um barranco separa a clareira em duas rotas, com abrigo de pedra ao norte e vegetação alta ao sul.',
  [['Neera', 'Os pássaros pararam de cantar há alguns passos. Agora sei por quê.'], ['Voss', 'Lobos na trilha. Homens no acampamento. Nenhum dos dois parece disposto a dividir o jantar.'], ['Kael', 'Fiquem juntos. Usem as pedras para não receber flechas enquanto o bando se aproxima.']],
  [['Voss', 'Havia mantimentos de viajantes no acampamento. Os saqueadores atraíam o bando com restos, depois roubavam quem tentava fugir.'], ['Neera', 'Uma toca, dois predadores. Pelo menos a trilha voltou a respirar.']]);
paint(d, 8, 3, 13, 6, 'hill', 4); paint(d, 8, 10, 17, 14, 'plains', 41); paint(d, 14, 5, 19, 8, 'ruins', 7);
paint(d, 10, 7, 10, 9, 'column', 2); paint(d, 11, 7, 11, 8, 'column', 2);
props(d, [['wilds-camp', 16, 6], ['wilds-mossy-log', 5, 7], ['mossy-boulder', 8, 4], ['wilds-twisted-tree', 18, 12], ['wilds-abandoned-cart', 15, 8], ['chest-medium', 17, 7], ['chest-large', 19, 6]]);
enemies(d, [['Mordavian Wolf Final', 'mordavianWolfFinal', 6, 9], ['Mordavian Wolf Final', 'mordavianWolfFinal', 12, 12], ['Mordavian Wolf Final', 'mordavianWolfFinal', 17, 14], ['Saqueador do acampamento', 'brigand', 15, 6], ['Arqueiro das raízes', 'archer', 12, 4], ['Chefe da toca', 'captain', 18, 8]]);

const path = 'src/game/random-encounters.json', config = JSON.parse(fs.readFileSync(path, 'utf8'));
const forest = config.regions.find(r => r.id === 'forest');
if (!forest) throw new Error('Missing forest region');
for (const d of maps) if (fs.existsSync(`src/game/maps/${d.id}001.json`) || forest.encounterIds.includes(d.id)) throw new Error(`Already exists: ${d.id}`);
for (const draft of maps) {
  fs.writeFileSync(`src/game/maps/${draft.id}001.json`, JSON.stringify({ serial: 1, savedAt: Date.now(), draft }, null, 2) + '\n', { flag: 'wx' });
  forest.encounterIds.push(draft.id);
}
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(maps.map(d => `${d.title}: ${d.enemySpawns.length} enemies, ${d.neutralSpawns.length} NPCs`).join('\n'));
