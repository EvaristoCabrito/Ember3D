import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});const p=await b.newPage();
await p.route('**/__blade-audio-qa',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));
try {
await p.goto('http://localhost:8081/__blade-audio-qa');
const results=await p.evaluate(async()=>{
const played=[];HTMLMediaElement.prototype.play=function(){played.push(this.src.split('/').pop());return Promise.resolve();};
const {sfxPlay}=await import('/src/game/audio.ts');const {BattleEngine}=await import('/src/game/engine.ts');
const e=Object.create(BattleEngine.prototype);const cases=[];
for(const [weaponId,expected] of [['espada-larga',true],['espadao',true],['machado-de-guerra',true],['lamina-sagrada',true],['maca-de-espinhos',false],['martelo-de-guerra',false],['malho-do-juizo',false],['lanca',false],['guisarme',false],['partisan',false],['cajado-da-esperanca',false]]){
const blade=e.isBladeAttack({weaponId,classId:'swordsman'});sfxPlay.meleeAttack(blade);cases.push({weaponId,blade,expected,file:played.at(-1)});
}
for(const offHandId of ['punhal-curvo','katar','adaga-sombria','misericordia-sombria']){const blade=e.isBladeAttack({weaponId:'arco-longo',offHandId},true);sfxPlay.meleeAttack(blade);cases.push({weaponId:offHandId,blade,expected:true,file:played.at(-1)});}
for(const method of ['thrust','sweep','trip'])for(const blade of [true,false]){sfxPlay[method](blade);cases.push({weaponId:method,blade,expected:blade,file:played.at(-1)});}
const response=await fetch('/game/MUSIC/SoundFX/BladeSlash1Dagger.mp3');const bytes=await response.arrayBuffer();const audio=new AudioContext();const decoded=await audio.decodeAudioData(bytes);
return {cases,status:response.status,duration:decoded.duration};
});
for(const c of results.cases){assert.equal(c.blade,c.expected,c.weaponId);assert.equal(c.file,c.expected?'BladeSlash1Dagger.mp3':'ATT01Blunt.mp3',c.weaponId);}
assert.equal(results.status,200);assert.ok(results.duration>0);console.log(JSON.stringify(results,null,2));
}finally{await b.close();}

