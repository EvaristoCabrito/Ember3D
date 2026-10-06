import fs from 'node:fs';

// Native editor saves: dialogue branches, NPCs and terrain remain editable in the game.
const cols = 24, rows = 18, maps = [];
const conversation = (id, entries) => ({ id, startId: 'line-0', lines: entries.map(([speaker, text], i) => ({ id: `line-${i}`, speaker, text, next: i + 1 < entries.length ? `line-${i + 1}` : null })) });
function make(id, title, region, briefing, intro, outro) {
  const ice = region === 'ice';
  const draft = { id, title, place: region === 'forest' ? 'Floresta Mora' : ice ? 'Icelands' : 'Estrada das Três Rotas', index: 31 + maps.length,
    briefing, objective: 'Derrote todos os inimigos.', win: 'rout', hub: false, explore: false, autoTactics: false, fog: false,
    environment: 'outdoor', timeOfDay: ice ? 'brightNight' : 'dusk', sunIntensity: ice ? 0.45 : 0.65, ambientIntensity: 0.9,
    locationId: '', cols, rows, tiles: Array(cols * rows).fill(ice ? 'snow' : 'woods'),
    tileVariants: Array(cols * rows).fill(ice ? 16 : 9), tileRots: Array(cols * rows).fill(0), decorations: [],
    playerSpawns: [['Kael', 'kaelFinal', 2, 13], ['Neera', 'neera', 3, 14], ['Voss', 'voss', 2, 15], ['Salazar', 'salazar', 1, 14]].map(([name, classId, x, y]) => ({ name, classId, x, y, level: 8 })),
    enemySpawns: [], neutralSpawns: [], introDialogEnabled: true, outroDialogEnabled: true,
    introDialog: conversation(`${id}-intro`, intro), outroDialog: conversation(`${id}-outro`, outro) };
  maps.push([draft, region]); return draft;
}
function rect(d, x0, y0, x1, y1, terrain, variant) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * cols + x; d.tiles[i] = terrain; d.tileVariants[i] = variant; }
}
const props = (d, entries) => entries.forEach(([id, x, y]) => d.decorations.push({ id, x, y }));
const enemies = (d, entries) => entries.forEach(([name, classId, x, y]) => d.enemySpawns.push({ name, classId, x, y, level: 8 }));

let d = make('random-mora-rootwatch', 'Mora — A Vigília das Raízes', 'forest',
  'Raízes antigas cercam um santuário ocupado por profanadores. A clareira central é exposta; as trilhas laterais permitem alcançar os vigias pelos flancos.',
  [['Neera', 'Mora sempre foi silenciosa. Esse silêncio está esperando alguma coisa.'], ['Salazar', 'As oferendas foram arrancadas das pedras. Há um ritual no centro.'], ['Kael', 'Entrem pelos lados. Não daremos aos arqueiros uma coluna de alvos.']],
  [['Salazar', 'O ritual acabou. As raízes ainda guardam as pedras.'], ['Neera', 'Deixemos o bosque escolher quem volta a entrar aqui.']]);
rect(d, 7, 6, 17, 11, 'plains', 41); rect(d, 10, 5, 14, 9, 'ruins', 7);
rect(d, 5, 2, 8, 4, 'hill', 4); rect(d, 18, 10, 21, 14, 'plains', 39);
props(d, [['city-root-shrine', 12, 5], ['wilds-mossy-shrine', 6, 8], ['wilds-mossy-log', 4, 5], ['wilds-twisted-tree', 19, 3], ['rune-stone', 15, 3], ['chest-medium', 16, 10]]);
enemies(d, [['Vigia de Mora', 'archer', 7, 3], ['Profanador das raízes', 'cultist', 12, 8], ['Morto da oferenda', 'zombie', 10, 10], ['Morto do santuário', 'zombie', 15, 11], ['Lanceiro da clareira', 'pikeman', 18, 8], ['Feiticeiro do bosque', 'sorcerer', 17, 5]]);

d = make('random-mora-hollow-stream', 'Mora — O Riacho dos Troncos Ocos', 'forest',
  'Uma trilha segue um riacho entre troncos ocos. Dois vaus ligam as margens; lobos cercam a passagem e saqueadores vigiam a colina da outra margem.',
  [['Voss', 'O riacho leva mais flechas quebradas do que folhas.'], ['Neera', 'Lobos à frente. Gente atrás deles. Alguém está usando o bando para fechar a trilha.'], ['Kael', 'Tomem um vau de cada vez. A margem alta ficará por último.']],
  [['Voss', 'Os saqueadores guardavam comida entre os troncos. Agora entendo por que os lobos não saíam daqui.'], ['Kael', 'A água seguirá limpa. Nós também seguimos.']]);
for (let y = 0; y < rows; y++) { const x = 11 + Math.round(Math.sin(y * 0.5)); rect(d, x, y, x + 1, y, 'water', 22); }
rect(d, 9, 5, 14, 6, 'plains', 39); rect(d, 9, 12, 14, 13, 'plains', 39); rect(d, 17, 3, 20, 6, 'hill', 4);
props(d, [['wilds-mossy-log', 5, 6], ['wilds-mossy-log', 16, 11], ['wilds-twisted-tree', 3, 3], ['mossy-boulder', 18, 4], ['wilds-camp', 19, 10], ['chest-medium', 20, 12]]);
enemies(d, [['Mordavian Wolf Final', 'mordavianWolfFinal', 7, 9], ['Mordavian Wolf Final', 'mordavianWolfFinal', 10, 6], ['Mordavian Wolf Final', 'mordavianWolfFinal', 15, 13], ['Arqueiro do riacho', 'archer', 19, 5], ['Saqueador de Mora', 'brigand', 17, 10], ['Chefe dos troncos', 'captain', 20, 9]]);

d = make('random-road-three-routes-market', 'Estrada — O Mercador das Três Rotas', 'road',
  'Elias mantém sua carroça junto ao marco das três rotas. Converse com ele para comprar suprimentos ou equipamentos intermediários (320–1300 Gold), ouvir rumores e conhecer sua história. Salteadores ocupam a saída norte.',
  [['Elias', 'Boa tarde! Se vieram comprar, aproximem-se. Se vieram roubar, a fila fica lá no alto, junto dos outros idiotas.'], ['Neera', 'Você continua vendendo com salteadores na estrada?'], ['Elias', 'Não vender é prejuízo certo. Vender aqui é só prejuízo provável. Prefiro alguma esperança.'], ['Kael', 'Vamos abrir a passagem. Guarde um pouco dessa esperança para nós.']],
  [['Elias', 'Estrada livre, mercadoria inteira, clientes vivos. Meu melhor dia nesta semana.'], ['Kael', 'Então escolha bem quem você manda por essas rotas.'], ['Elias', 'Escolho. E vocês sempre terão lugar junto da minha carroça.']]);
rect(d, 0, 11, 23, 14, 'plains', 39); rect(d, 10, 2, 13, 14, 'plains', 39); rect(d, 6, 8, 15, 10, 'plains', 41);
rect(d, 17, 3, 20, 6, 'hill', 4);
props(d, [['wooden-cart', 11, 9], ['wilds-camp', 8, 7], ['wilds-lantern-post', 15, 12], ['mossy-boulder', 18, 4], ['wilds-mossy-log', 3, 5], ['chest-medium', 21, 8]]);
d.neutralSpawns = [{ name: 'Elias', classId: 'travelingMerchant', x: 9, y: 11, level: 8, dialog: { id: 'elias-three-routes', startId: 'welcome', lines: [
  { id: 'welcome', speaker: 'Elias', portrait: 'travelingMerchant', text: 'Elias, mercador das três rotas. Minha carroça tem rodas ruins e mercadoria boa. O que procuram?', replies: [{ text: 'Mostre os equipamentos.', next: 'equipment' }, { text: 'Preciso de suprimentos.', next: 'supplies' }, { text: 'Quem é você?', next: 'past' }, { text: 'Algum conselho sobre as rotas?', next: 'rumors' }, { text: 'Até outra hora.', next: 'goodbye' }] },
  { id: 'equipment', speaker: 'Elias', text: 'Armas, armaduras e anéis para quem já passou do primeiro combate. Entre 320 e 1300 Gold: material honesto, sem cobrar preço de relíquia.', replies: [{ text: 'Ver armas e equipamentos.', action: 'merchantGear' }, { text: 'Como você escolhe a mercadoria?', next: 'quality' }, { text: 'Voltar à conversa.', next: 'welcome' }] },
  { id: 'quality', speaker: 'Elias', text: 'Eu compro de oficinas, não de promessas. Testo as fivelas, olho a têmpera e recuso qualquer lâmina que sussurre meu nome. Já perdi uma noite de sono com isso.', next: 'equipment' },
  { id: 'supplies', speaker: 'Elias', text: 'Poções de cura, mana, rações e gazuas. Uma boa preparação custa menos do que um resgate.', replies: [{ text: 'Comprar suprimentos.', action: 'merchant' }, { text: 'Voltar à conversa.', next: 'welcome' }] },
  { id: 'past', speaker: 'Elias', text: 'Eu era carregador numa caravana. Meu patrão contava cada moeda e esquecia cada rosto. Comprei esta carroça para fazer o contrário.', replies: [{ text: 'Por que viajar sozinho?', next: 'alone' }, { text: 'O comércio vai bem?', next: 'business' }, { text: 'Voltar à conversa.', next: 'welcome' }] },
  { id: 'alone', speaker: 'Elias', text: 'Minha irmã cuida do depósito. Eu cuido das rotas. Sozinho é só o trecho entre uma fogueira e outra; tenho amigos em quase todas elas.', next: 'welcome' },
  { id: 'business', speaker: 'Elias', text: 'Quando os caminhos ficam perigosos, todo mundo precisa comprar e ninguém consegue chegar. Vocês ajudam mais abrindo a passagem do que comprando a carroça inteira.', next: 'welcome' },
  { id: 'rumors', speaker: 'Elias', text: 'Qual caminho pensam seguir?', replies: [{ text: 'A Floresta Mora.', next: 'mora' }, { text: 'Icelands.', next: 'ice' }, { text: 'A própria estrada.', next: 'road' }, { text: 'Voltar à conversa.', next: 'welcome' }] },
  { id: 'mora', speaker: 'Elias', text: 'Há dois vaus no riacho dos troncos ocos. Não sigam os lobos para dentro do bosque; procurem a margem e mantenham as pedras antigas à vista.', next: 'rumors' },
  { id: 'ice', speaker: 'Elias', text: 'O gelo fino parece liso demais. Nas Icelands, a trilha feia de neve costuma ser a mais segura. Levem comida e mana; o frio não negocia.', next: 'rumors' },
  { id: 'road', speaker: 'Elias', text: 'Viram os arqueiros no barranco? O primeiro pedágio é conversa. O segundo é uma flecha. Entrem pelo acostamento e tirem a vantagem deles.', next: 'rumors' },
  { id: 'goodbye', speaker: 'Elias', text: 'Voltem inteiros. Cliente que volta conta histórias melhores — e paga contas mais antigas.' },
] } }];
enemies(d, [['Salteador da saída', 'brigand', 13, 5], ['Arqueiro do marco', 'archer', 19, 5], ['Cobrador armado', 'pikeman', 16, 7], ['Capitão do pedágio', 'captain', 21, 9]]);

d = make('random-road-broken-milepost', 'Estrada — O Marco Quebrado', 'road',
  'Um marco derrubado bloqueia a curva. Arqueiros ocupam a elevação e uma patrulha de saqueadores controla a ponte baixa. A trilha do acostamento permite cercar a emboscada.',
  [['Voss', 'O marco caiu contra o vento. Alguém quis fazer a estrada parecer abandonada.'], ['Neera', 'Arqueiros no barranco. E passos atrás daquela ponte.'], ['Kael', 'Vamos pelo acostamento. Quem montou a emboscada não escolhe nosso caminho.']],
  [['Neera', 'O marco ainda serve. Só precisa ficar de pé.'], ['Kael', 'Deixem uma marca nova na pedra. A próxima caravana merece um aviso.']]);
rect(d, 0, 11, 23, 13, 'plains', 39); rect(d, 15, 4, 18, 13, 'plains', 39); rect(d, 7, 3, 11, 6, 'hill', 4);
rect(d, 13, 0, 14, 17, 'water', 22); rect(d, 12, 11, 15, 13, 'ruins', 7); rect(d, 12, 4, 15, 5, 'ruins', 7);
props(d, [['rune-stone', 9, 9], ['wilds-abandoned-cart', 17, 10], ['wilds-mossy-log', 4, 7], ['mossy-boulder', 9, 3], ['wilds-camp', 20, 4], ['chest-medium', 21, 5]]);
enemies(d, [['Arqueiro do marco', 'archer', 10, 5], ['Arqueiro da ponte', 'archer', 18, 6], ['Saqueador da curva', 'brigand', 16, 12], ['Lanceiro do pedágio', 'pikeman', 19, 11], ['Cão da patrulha', 'wardog', 17, 14], ['Chefe do marco', 'captain', 21, 8]]);

d = make('random-icelands-blue-antlers', 'Icelands — Os Chifres Azuis', 'ice',
  'Cervos de cobalto guardam um círculo de pedras na tundra. Um lago estreito separa as margens; as passagens de neve ao norte e sul permitem evitar o centro exposto.',
  [['Neera', 'Os chifres iluminam a neve por dentro. Não se aproximem como se fossem animais comuns.'], ['Salazar', 'As pedras estão queimadas pelo frio. Esses guardiões não querem testemunhas.'], ['Kael', 'Contornem o lago. Lutaremos de terreno firme.']],
  [['Neera', 'A luz apagou, mas as pedras continuam mornas.'], ['Salazar', 'Alguma coisa ainda dorme abaixo delas. Vamos deixá-la dormir.']]);
rect(d, 10, 5, 13, 11, 'water', 22); rect(d, 8, 3, 16, 4, 'snow', 15); rect(d, 8, 12, 17, 14, 'snow', 15); rect(d, 17, 5, 21, 10, 'snow', 17);
props(d, [['rune-stone', 18, 4], ['rune-stone', 21, 11], ['wilds-snowy-pines', 4, 3], ['wilds-snowy-log', 7, 8], ['wilds-snowy-dead-tree', 19, 14], ['chest-medium', 21, 13]]);
enemies(d, [['Cobalt Blue Deer', 'swampBlueCalf', 16, 7], ['Cobalt Blue Deer', 'swampBlueCalf', 18, 10], ['Mordavian Wolf Final', 'mordavianWolfFinal', 8, 6], ['Mordavian Wolf Final', 'mordavianWolfFinal', 15, 13], ['Vigia do círculo', 'archer', 21, 6], ['Guardião das pedras', 'sorcerer', 20, 9]]);

d = make('random-icelands-last-beacon', 'Icelands — A Última Baliza', 'ice',
  'A baliza de uma antiga estação ainda queima entre ruínas congeladas. Mortos e saqueadores cercam o abrigo. Os corredores de basalto fornecem cobertura entre as duas encostas.',
  [['Voss', 'Alguém manteve aquele fogo aceso. Pode haver gente no abrigo.'], ['Salazar', 'Ou alguém que esqueceu de morrer.'], ['Kael', 'Verificaremos depois de liberar a entrada. Mantenham-se entre as ruínas.']],
  [['Voss', 'A estação estava vazia. A lenha foi empilhada para o próximo viajante.'], ['Kael', 'Então deixem o fogo aceso. Hoje somos nós esse viajante.']]);
rect(d, 7, 6, 18, 11, 'ruins', 7); rect(d, 10, 4, 15, 8, 'nave', 3); rect(d, 5, 2, 8, 4, 'hill', 4); rect(d, 19, 12, 21, 14, 'hill', 4);
props(d, [['light-brazier-bowl', 12, 5], ['wilds-camp', 16, 9], ['wilds-snowy-pines', 3, 3], ['wilds-snowy-dead-tree', 20, 3], ['wilds-snowy-log', 6, 10], ['tombstones', 18, 5], ['chest-medium', 17, 11]]);
enemies(d, [['Morto da baliza', 'zombie', 11, 7], ['Morto da estação', 'zombie', 15, 10], ['Saqueador do abrigo', 'brigand', 18, 8], ['Arqueiro da geada', 'archer', 7, 3], ['Lanceiro da encosta', 'pikeman', 20, 13], ['Feiticeiro das cinzas frias', 'sorcerer', 17, 5]]);

const path = 'src/game/random-encounters.json', config = JSON.parse(fs.readFileSync(path, 'utf8'));
for (const [draft, region] of maps) {
  if (fs.existsSync(`src/game/maps/${draft.id}001.json`) || config.regions.some(r => r.encounterIds.includes(draft.id))) throw new Error(`Already exists: ${draft.id}`);
  if (!config.regions.some(r => r.id === region)) throw new Error(`Unknown region: ${region}`);
}
for (const [draft, region] of maps) {
  fs.writeFileSync(`src/game/maps/${draft.id}001.json`, JSON.stringify({ serial: 1, savedAt: Date.now(), draft }, null, 2) + '\n', { flag: 'wx' });
  config.regions.find(r => r.id === region).encounterIds.push(draft.id);
}
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(maps.map(([d, r]) => `${d.title}: ${cols}x${rows}, ${d.enemySpawns.length} enemies, ${r}`).join('\n'));
