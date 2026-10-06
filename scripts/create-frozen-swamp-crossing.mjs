import fs from 'node:fs';

const maps = [];
const surfaceIds = [1, 2, 3].map(n => `frozen-swamp-crossing-${n}`);
const dungeonIds = [1, 2, 3].flatMap(n => [`frozen-swamp-${n}-sunk-vault`, `frozen-swamp-${n}-hidden-cellar`]);
const chat = (id, text) => ({ id, startId: 'start', lines: [{ id: 'start', speaker: 'Narrador', text }] });
function make(id, title, cols, rows, indoor = false) {
  const d = { id, index: 0, title, place: 'Frozen Swamp', briefing: '', objective: 'Explore e encontre a passagem.', win: 'escape',
    hub: false, explore: true, autoTactics: false, fog: true, environment: indoor ? 'indoor' : 'outdoor',
    timeOfDay: 'brightNight', sunIntensity: indoor ? 0.12 : 0.38, ambientIntensity: indoor ? 0.75 : 0.85,
    mistType: 'mist3', mistIntensity: indoor ? 0.08 : 0.24, mistSpeed: 0.45, bloomIntensity: 0.35,
    locationId: id === surfaceIds[0] ? 'frozen-swamp' : '', cols, rows,
    tiles: Array(cols * rows).fill(indoor ? 'void' : 'water'), tileVariants: Array(cols * rows).fill(indoor ? 0 : 22), tileRots: Array(cols * rows).fill(0),
    decorations: [], playerSpawns: [], enemySpawns: [], neutralSpawns: [] };
  maps.push(d); return d;
}
function rect(d, x0, y0, x1, y1, tile = 'snow', variant = 16) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < d.cols && y < d.rows) {
    const i = y * d.cols + x; d.tiles[i] = tile; d.tileVariants[i] = variant;
  }
}
function trail(d, points, radius = 1, tile = 'snow', variant = 15) {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i], steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= steps; k++) { const x = Math.round(x0 + (x1 - x0) * k / (steps || 1)), y = Math.round(y0 + (y1 - y0) * k / (steps || 1)); rect(d, x - radius, y - radius, x + radius, y + radius, tile, variant); }
  }
}
const prop = (d, id, x, y, extra = {}) => d.decorations.push({ id, x, y, ...extra });
const link = (d, x, y, targetMapId, back = false) => prop(d, 'floor-connector', x, y, { targetMapId, ...(back ? { returnConnector: true } : {}) });
const party = (d, x, y) => { d.playerSpawns = [['Kael', 'kaelFinal', x, y], ['Neera', 'neera', x + 1, y], ['Voss', 'voss', x, y + 1], ['Salazar', 'salazar', x + 1, y + 1]].map(([name, classId, x, y]) => ({ name, classId, x, y, level: 9 })); };
const enemy = (d, name, classId, x, y, level = 9) => d.enemySpawns.push({ name, classId, x, y, level });
// A fully enclosed room with an actual discoverable secret door, not a visible loot marker.
function secretRoom(d, x, y, loot = true) {
  rect(d, x, y, x + 6, y + 5, 'nave', 3);
  rect(d, x, y, x + 6, y, 'column', 2); rect(d, x, y + 5, x + 6, y + 5, 'column', 2);
  rect(d, x, y, x, y + 5, 'column', 2); rect(d, x + 6, y, x + 6, y + 5, 'column', 2);
  rect(d, x + 3, y + 5, x + 3, y + 5, 'nave', 3); prop(d, 'secret-door-3d-hidden', x + 3, y + 5);
  if (loot) prop(d, 'chest-large', x + 3, y + 2);
}

const names = ['The Drowned Causeway', 'The Hollow Reed Basin', 'The Pale Beacon'];
const routes = [
  [[4, 31], [12, 27], [17, 18], [29, 21], [36, 12], [46, 6]],
  [[4, 31], [15, 30], [12, 19], [26, 16], [36, 23], [43, 15], [46, 6]],
  [[4, 31], [10, 21], [22, 25], [30, 15], [40, 17], [46, 6]],
];
for (let n = 1; n <= 3; n++) {
  const d = make(surfaceIds[n - 1], `Frozen Swamp Crossing — Part ${n}: ${names[n - 1]}`, 52, 38);
  d.briefing = `An immense frozen marsh stretches between drowned trees and broken causeways. Part ${n} contains two optional underground sites, a sealed cache and alternate island routes. Follow solid snow and stone; the dark channels remain impassable. Secret doors can be discovered and opened using the game's normal exploration rules.`;
  d.objective = n === 3 ? 'Reach the pale beacon and the exit; explore the optional ruins.' : 'Find the crossing to the next part; explore the optional ruins.';
  rect(d, 1, 28, 8, 35); rect(d, 42, 2, 50, 9);
  trail(d, routes[n - 1], 2);
  // Wide islands and a second route make each section a battlefield, not a single corridor.
  rect(d, 10, 20, 19, 29); rect(d, 22, 12, 31, 23, 'snow', 17); rect(d, 34, 9, 43, 20, 'snow', 17);
  trail(d, [[12, 26], [6, 15], [16, 9], [27, 17]], 1);
  trail(d, [[28, 20], [35, 30], [45, 26], [42, 16]], 1);
  trail(d, [[35, 19], [35, 25]], 1);
  trail(d, [[17, 18], [17, 22]], 1);
  // Visible sunk vault, and a second entrance hidden inside an enclosed ruined pumping house.
  rect(d, 21, 6, 29, 11, 'ruins', 7); trail(d, [[26, 16], [25, 9]], 1);
  link(d, 25, 8, `frozen-swamp-${n}-sunk-vault`);
  rect(d, 4, 4, 14, 12, 'ruins', 7); trail(d, [[6, 15], [9, 11]], 1);
  secretRoom(d, 6, 4, false); link(d, 9, 6, `frozen-swamp-${n}-hidden-cellar`);
  // An independent secret treasure room on an optional southern island.
  rect(d, 32, 27, 43, 35, 'ruins', 7); secretRoom(d, 34, 28);
  for (const [id, x, y] of [['wilds-snowy-dead-tree', 13, 23], ['wilds-snowy-log', 29, 13], ['wilds-snowy-roots', 40, 12], ['wilds-snowy-fallen-tree', 16, 26], ['wilds-snowy-stump', 24, 21], ['wilds-snowy-bush', 45, 4], ['rune-stone', 27, 7], ['tombstones', 23, 10], ['chest-medium', 44, 26]]) prop(d, id, x, y);
  prop(d, 'tree-3d-dead-oak', 18, 21); prop(d, 'tree-3d-dead-oak', 37, 18);
  party(d, 3, 31); prop(d, 'dungeon-exit', 2, 34);
  if (n > 1) link(d, 6, 32, surfaceIds[n - 2], true);
  if (n < 3) link(d, 47, 5, surfaceIds[n]); else { prop(d, 'dungeon-exit', 47, 5); prop(d, 'light-brazier-bowl', 45, 3); }
  for (const [name, classId, x, y] of [
    ['Cobalt Blue Deer', 'swampBlueCalf', 15, 24], ['Cobalt Blue Deer', 'swampBlueCalf', 38, 14],
    ['Mordavian Wolf Final', 'mordavianWolfFinal', 17, 19], ['Mordavian Wolf Final', 'mordavianWolfFinal', 35, 23],
    ['Drowned walker', 'zombie', 25, 19], ['Drowned keeper', 'zombie', 25, 10],
    ['Reed stalker', 'archer', 28, 14], ['Causeway raider', 'brigand', 42, 18],
    ['Frozen sentinel', 'pikeman', 43, 8], ['Marsh witch', 'sorcerer', 29, 21],
    ['Hollow pilgrim', 'cultist', 16, 10], ['Beacon guard', 'captain', 46, 7],
  ]) enemy(d, name, classId, x, y, 8 + n);
  d.introDialogEnabled = true; d.introDialog = chat(`${d.id}-intro`, [
    'The snow hides a drowned road. Beneath the roots, old stone entrances descend into the marsh. Keep to the causeway, or search the islands for forgotten stores.',
    'Hollow reeds whistle over the channels. A ruined pumping house stands west of the basin; another stair sinks beneath the central island. Both lead away from the crossing.',
    'Beyond the last causeway, a pale beacon rises over the frozen water. The ruins around it hold one last pair of underground entrances. The light marks the way out.',
  ][n - 1]);
  for (const kind of ['sunk-vault', 'hidden-cellar']) {
    const hidden = kind === 'hidden-cellar';
    const floor = make(`frozen-swamp-${n}-${kind}`, `Frozen Swamp ${n} — ${hidden ? 'Hidden Cellar' : 'Sunk Vault'}`, 24, 20, true);
    floor.briefing = hidden ? 'A forgotten cellar beneath a secret entrance. Two chambers flank a frozen cistern; another hidden wall conceals an untouched store.' : 'The sunk vault branches around a flooded burial basin. Ancient guards hold the far hall, and a secret door protects the old treasury.';
    floor.objective = 'Explore the underground chambers and return to the crossing.';
    rect(floor, 2, 3, 21, 17, 'nave', hidden ? 7 : 3);
    rect(floor, 10, 8, 13, 12, 'water', 22);
    rect(floor, 3, 4, 8, 7, 'ruins', 7); rect(floor, 15, 12, 20, 16, 'ruins', 7);
    secretRoom(floor, 15, 3); rect(floor, 18, 9, 18, 11, 'nave', 3);
    party(floor, 3, 14); link(floor, 3, 17, d.id, true);
    prop(floor, 'light-brazier-bowl', 6, 9); prop(floor, 'light-brazier-bowl', 16, 14);
    prop(floor, 'tombstones', 6, 5); prop(floor, 'chest-medium', 19, 15);
    enemy(floor, 'Drowned crypt keeper', 'zombie', 8, 11, 8 + n);
    enemy(floor, 'Cistern sentinel', 'pikeman', 15, 10, 8 + n);
    enemy(floor, 'Frostbound acolyte', 'cultist', 9, 6, 8 + n);
    enemy(floor, 'Vault archer', 'archer', 20, 12, 8 + n);
    enemy(floor, hidden ? 'Cellar witch' : 'Vault master', 'sorcerer', 18, 13, 9 + n);
  }
}
for (const d of maps) if (fs.existsSync(`src/game/maps/${d.id}001.json`)) throw new Error(`Already exists: ${d.id}`);
for (const draft of maps) fs.writeFileSync(`src/game/maps/${draft.id}001.json`, JSON.stringify({ serial: 1, savedAt: Date.now(), draft }, null, 2) + '\n', { flag: 'wx' });
const orderPath = 'src/game/map-order.json', order = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
order['frozen-swamp'] = [surfaceIds[0]];
fs.writeFileSync(orderPath, JSON.stringify(order, null, 2) + '\n');
const slotsPath = 'src/game/map-slots.json', slots = JSON.parse(fs.readFileSync(slotsPath, 'utf8'));
slots['frozen-swamp'] = 1; fs.writeFileSync(slotsPath, JSON.stringify(slots, null, 2) + '\n');
console.log(maps.map(d => `${d.id}: ${d.cols}x${d.rows}, ${d.enemySpawns.length} enemies`).join('\n'));
