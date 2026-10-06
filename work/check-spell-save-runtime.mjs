import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const appSource=readFileSync('src/game/GameApp.tsx','utf8');
assert.ok(appSource.includes('const spellSpent = testMode ? undefined : save.spellUses;'));
assert.ok(appSource.includes('spellUses: { ...data.spellUses, ...engine.spentTiers() }')); 
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
await page.route('**/__spell-save-qa',r=>r.fulfill({contentType:'text/html',body:'<html><body>Save reload QA</body></html>'}));
try{
await page.goto('http://localhost:8080/__spell-save-qa');
const initial=await page.evaluate(async()=>{
const {BattleEngine}=await import('/src/game/engine.ts');const S=await import('/src/game/save.ts');const art={sprites:{},attacks:{},attacks2:{},casts:{},walks:{},idles:{},idles2:{},tiles:{},decorations:{}};
const {ALL_MISSIONS}=await import('/src/game/mapstore.ts');const m={id:ALL_MISSIONS[0].id,index:0,title:'QA',place:'',briefing:'',objective:'',win:'rout',hub:false,fog:false,mistType:'none',environment:'outdoor',timeOfDay:'day',cols:8,rows:6,layout:Array(6).fill('.'.repeat(8)),playerSpawns:['swordsman','neera','mage','healer'].map((classId,i)=>({name:['Kael','Neera','Salazar','Voss'][i],classId,x:i+1,y:3,level:15})),enemySpawns:[],neutralSpawns:[],decorations:[],elementalFx:[]};
const e=new BattleEngine(m,art,{hp:{},levels:{}},1);const before=e.units.map(u=>({name:u.name,spells:{...u.spells}}));
for(const u of e.units)for(const k of Object.keys(u.spells))if(u.spells[k]>0)u.spells[k]=k==='tier1'?0:Math.max(0,u.spells[k]-1);
const expected=e.units.map(u=>({name:u.name,spells:{...u.spells}}));const save={...S.emptySave(),levels:Object.fromEntries(e.units.map(u=>[u.name,u.level])),spellUses:e.spentTiers(),pendingMission:m.id,battle:e.captureSnapshot()};S.writeSlot(S.emptyBank(),0,save);localStorage.setItem('qa-mission',JSON.stringify(m));localStorage.setItem('qa-expected',JSON.stringify(expected));return {before,expected};
});
assert.notDeepEqual(initial.before,initial.expected);
await page.reload();
const result=await page.evaluate(async()=>{
const {BattleEngine}=await import('/src/game/engine.ts');const S=await import('/src/game/save.ts');const saved=S.activeSave(S.loadBank());const m=JSON.parse(localStorage.getItem('qa-mission'));const expected=JSON.parse(localStorage.getItem('qa-expected'));const art={sprites:{},attacks:{},attacks2:{},casts:{},walks:{},idles:{},idles2:{},tiles:{},decorations:{}};
const fresh=new BattleEngine(m,art,{hp:{},levels:saved.levels,spellSpent:saved.spellUses},2);const carried=fresh.units.map(u=>({name:u.name,spells:{...u.spells}}));fresh.applySnapshot(saved.battle);const resumed=fresh.units.map(u=>({name:u.name,spells:{...u.spells}}));
const source=await(await fetch('/src/game/GameApp.tsx')).text();return {expected,carried,resumed,uses:saved.spellUses,carryCode:source.includes('testMode ? undefined : save.spellUses'),liveSaveCode:source.includes('...data.spellUses, ...engine.spentTiers()')};
});
assert.deepEqual(result.resumed,result.expected);assert.deepEqual(result.carried,result.expected);assert.ok(result.resumed.every(u=>u.spells.tier1===0));console.log('PASS: real storage write, page reload, saved-slot normalization, battle snapshot restore and mission re-entry preserve every tier for four heroes, including zero remaining uses.');
}finally{await browser.close();}
