import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {loopSpriteUrl} from '../render.js';
import {readFile} from 'node:fs/promises';

function start(options={}){
 const g=createGame({draftRandom:()=>0,random:()=>0,...options});g.start();g.chooseCard(0);return g;
}
function play(g,seconds){
 for(let i=0;i<seconds*4&&g.state.phase==='playing';i++)g.tick(.25);
}

test('implemented card and monster catalogues expose every documented identifier',()=>{
 const g=start();
 assert.equal(g.catalog.length,36);
 assert.deepEqual(['common','rare','epic'].map(r=>g.catalog.filter(c=>c.rarity===r).length),[14,13,9]);
 assert.ok(g.catalog.every(t=>t.skills.length===3));
 assert.equal(Object.keys(g.enemyCatalog).length,58);
 assert.deepEqual(g.forecasts().map(f=>[f.wave,f.count]),[[1,12],[2,14]]);
});
test('every independent artwork entry is a real alpha PNG in the runtime asset directory',async()=>{
 const g=start(), units=[...g.catalog,...Object.values(g.enemyCatalog)];
 const urls=units.map(unit=>loopSpriteUrl(unit.code)).filter(Boolean);
 assert.equal(urls.length,54);
 for(const url of urls){
  const data=await readFile(url);
  assert.equal(data.subarray(1,4).toString(),'PNG');
  assert.equal(data[25],6);
 }
});
test('kill experience activates automatic levels, and the milestone Boss opens bonus settlement',()=>{
 const g=start({waveCount:5,initialDelay:0,waveInterval:.68,spawnInterval:.025,waveSize:()=>2,enemyHealthScale:.001,enemySpeedScale:0});
 const {towerId}=g.deploy(g.state.cards[0].id,500,300);
 play(g,30);
 assert.equal(g.state.phase,'victory');
 assert.equal(g.state.capacity,6);
 assert.equal(g.state.towers.find(t=>t.id===towerId).level,2);
 assert.ok(g.state.towers[0].xp>=10);
 const gold=g.drainEvents().filter(e=>e.type==='gold-rush-end');
 assert.deepEqual(gold.map(e=>e.amount),[90]);
 assert.ok(g.continueEndless().ok);
 assert.equal(g.state.capacity,12);
 assert.equal(g.state.towers[0].level,2);
 assert.equal(g.state.nextWaveIn,.68);
 g.restart();
 assert.equal(g.state.capacity,4);
 assert.equal(g.state.draft.cost,0);
 assert.deepEqual(g.state.towers,[]);
});
test('endless forecasts preserve count, wave multiplier and twelve regular boss slots',()=>{
 const g=start();
 const s=g.state;s.phase='victory';
 assert.ok(g.continueEndless().ok);
 const codes=[];
 for(let w=25;w<=85;w+=5){
  s.wave=w-1;
  const [f]=g.forecasts();
  assert.equal(f.count,50);
  codes.push(f.entries.at(-1).code);
  assert.equal(f.hpMultiplier,4.04*(1+.01*(w-20)));
 }
 assert.deepEqual(codes,['B05','B06','B07','B08','B09','B10','B11','B12','B01','B02','B03','B04','B05']);
});
test('60 pressure is the default hard end and a final state cannot keep advancing',()=>{
 const g=start();
 assert.equal(g.state.limit,60);
 g.tick(1000);
 assert.equal(g.state.phase,'defeat');
 assert.equal(g.state.enemies.length,60);
 const end=g.state.elapsed;
 g.tick(1000);assert.equal(g.state.elapsed,end);
});

test('a low-rarity composition can clear the campaign with real gold and legal placement', async()=>{
 const {playLoopStrategy}=await import('../qa/loop-strategy.mjs');
 const result=playLoopStrategy(1,'physical',{noEpic:true});
 assert.equal(result.outcome,'victory');
 assert.equal(result.wave,20);
 assert.ok(result.reconciled);
 assert.equal(result.game.state.towers.some(t=>result.game.catalog.find(c=>c.code===t.code).rarity==='epic'),false);
});

test('nearby zero-damage support shares experience while distant towers do not',()=>{
 let roll=0;
 const g=start({draftRandom:()=>roll,waveCount:1,waveSize:()=>1,enemySpeedScale:0,enemyHealthScale:.001});
 g.deploy(g.state.cards[0].id,500,300);
 const commons=g.catalog.filter(t=>t.rarity==='common');
 roll=(commons.findIndex(t=>t.code==='T11')+.5)/commons.length;
 assert.ok(g.draw().ok);
 g.chooseCard(0);
 assert.equal(g.state.cards[0].code,'T11');
 g.deploy(g.state.cards[0].id,780,300);
 roll=0;
 assert.ok(g.draw().ok);g.chooseCard(0);
 g.deploy(g.state.cards[0].id,190,140);
 g.launchWave();g.tick(.1);
 assert.deepEqual(g.state.towers.map(t=>[t.code,t.xp]),[['T01',1],['T11',1],['T01',0]]);
});
