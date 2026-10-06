import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({headless:true});const p=await b.newPage();
await p.route('**/__xp-qa',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
try{await p.goto('http://localhost:8080/__xp-qa');const result=await p.evaluate(async()=>{
const {BattleEngine}=await import('/src/game/engine.ts');const {ALL_MISSIONS}=await import('/src/game/mapstore.ts');const S=await import('/src/game/save.ts');
const art={sprites:{},attacks:{},attacks2:{},casts:{},walks:{},idles:{},idles2:{},tiles:{},decorations:{}};
const m={id:ALL_MISSIONS[0].id,index:0,title:'XP QA',place:'',briefing:'',objective:'',win:'rout',hub:false,fog:false,mistType:'none',cols:6,rows:5,layout:Array(5).fill('.'.repeat(6)),playerSpawns:[{name:'Kael',classId:'swordsman',x:2,y:2,level:3}],enemySpawns:[],neutralSpawns:[],decorations:[]};
const make=(level)=>new BattleEngine(m,art,{hp:{},levels:{Kael:level}},1);
const cases=[];for(const [level,cost] of [[2,100],[3,150],[7,150],[8,225],[12,225],[13,300],[17,300],[18,400],[22,400],[23,500],[27,500],[28,600],[29,600]]){const e=make(level),u=e.units[0];e.addExp(u,cost-1);const before={level:u.level,xp:u.xp};e.addExp(u,1);cases.push({level,cost,before,after:{level:u.level,xp:u.xp}});}
const e=make(7),u=e.units[0];e.addExp(u,150+225+12);const multi={level:u.level,xp:u.xp};
const saved={...S.emptySave(),levels:{Kael:28},xp:{Kael:599},unitHp:{Kael:50}};S.writeSlot(S.emptyBank(),0,saved);const loaded=S.activeSave(S.loadBank());return {cases,multi,savedXp:loaded.xp.Kael};
});for(const c of result.cases){assert.deepEqual(c.before,{level:c.level,xp:c.cost-1});assert.deepEqual(c.after,{level:c.level+1,xp:0});}assert.deepEqual(result.multi,{level:9,xp:12});assert.equal(result.savedXp,599);console.log('PASS: actual engine level-ups at all band edges, multi-level overflow, level-30 cap, and save/load of 599 XP.');}finally{await b.close();}

