import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { encounterNpcSpawn } from '../src/game/encounter-npcs.ts';
import { placedBlockingFootprint } from '../src/game/data.ts';
import { buildDecorOverlay, hexDef } from '../src/game/hexprops.ts';
import { hexNeighbors } from '../src/game/pathfinding.ts';

const { draft: d } = JSON.parse(readFileSync('src/game/maps/estalagem-andar-2001.json', 'utf8'));
const overlay = buildDecorOverlay(d.decorations, d.cols, d.rows, placedBlockingFootprint);
const pass = (x, y) => x >= 0 && y >= 0 && x < d.cols && y < d.rows && hexDef(d.tiles, d.cols, x, y, overlay).passable;
const queue = [d.playerSpawns[0]], seen = new Set([`${queue[0].x},${queue[0].y}`]);
for (let i = 0; i < queue.length; i++) for (const n of hexNeighbors(queue[i].x, queue[i].y)) {
  const key = `${n.x},${n.y}`;
  if (pass(n.x, n.y) && !seen.has(key)) { seen.add(key); queue.push(n); }
}
const guests = [
  ['maskedPhysician', 5, 3, [
    'Tomas finalmente dormiu. Fale baixo; o silêncio também faz parte do tratamento.',
    'Ele vai melhorar?',
    'A febre cedeu um pouco. Isa trouxe água limpa e eu troquei o curativo. Agora precisamos de uma noite sem sustos.',
    'Por que mantém a máscara aqui?',
    'Porque cuido de gente doente antes e depois do jantar. Ela não é para assustar os hóspedes. É para eu continuar ajudando amanhã.',
  ]],
  ['roadCartographer', 10, 4, [
    'Reservei uma cama. A dona trouxe uma mesa. Acho que entendeu meu problema melhor do que eu.',
    'Está preparando uma viagem?',
    'Estou corrigindo as estradas do mapa. Três hóspedes juraram que a mesma ponte ficava em três lugares diferentes. Vou começar pelo rio; ele costuma ser mais sincero.',
    'Consegue descansar?',
    'Quando termino de marcar os caminhos, fecho os olhos e ainda vejo encruzilhadas. Talvez amanhã eu tente dormir sem a bússola debaixo do travesseiro.',
  ]],
  ['shadowScholar', 18, 4, [
    'A camareira proibiu discussões depois da meia-noite. Minha sombra entendeu isso como uma vitória.',
    'Por que discute com ela?',
    'Ela acompanha todas as minhas leituras e nunca admite um erro. Um péssimo colega de quarto, mas extraordinariamente pontual.',
    'O livro é interessante?',
    'Muito. O capítulo sobre o silêncio tem trinta páginas. Pretendo ler algumas em voz alta para mostrar ao autor a ironia.',
  ]],
  ['wanderingTinker', 9, 12, [
    'A chaleira de Berta estava vazando. Agora o único barulho é o assoalho, e ele ainda não entrou no orçamento.',
    'Você conserta tudo?',
    'Panelas, fechos e fechaduras honestas. Corações ficam com o curandeiro e promessas eu devolvo sem garantia.',
    'Vai ficar na estalagem?',
    'Até amanhã. Me deram jantar e uma cama em troca de quatro consertos. O ronco no quarto ao lado seria o quinto, mas não tenho ferramenta para isso.',
  ]],
];
for (const [id, preferredX, preferredY, lines] of guests) {
  const p = queue.filter(p => [...d.playerSpawns, ...d.neutralSpawns].every(s => p.x !== s.x || p.y !== s.y) && d.decorations.every(s => p.x !== s.x || p.y !== s.y))
    .sort((a,b) => Math.hypot(a.x-preferredX,a.y-preferredY)-Math.hypot(b.x-preferredX,b.y-preferredY))[0];
  assert.ok(p, `No connected cell for ${id}`);
  const s = { ...encounterNpcSpawn(id, p.x, p.y), level: 1 };
  s.dialog.id = `inn-guest-${id}`;
  s.dialog.lines[0].text = lines[0];
  s.dialog.lines[0].replies[0].text = lines[1];
  s.dialog.lines[1].text = lines[2];
  s.dialog.lines[0].replies[1].text = lines[3];
  s.dialog.lines[2].text = lines[4];
  d.neutralSpawns.push(s);
  console.log(`${s.name}: ${p.x},${p.y}`);
}
const file = 'src/game/maps/estalagem-andar-2002.json';
assert.ok(!existsSync(file), 'Preserving existing second-floor save');
writeFileSync(file, JSON.stringify({ serial: 2, savedAt: Date.now(), draft: d }, null, 2) + '\n');
