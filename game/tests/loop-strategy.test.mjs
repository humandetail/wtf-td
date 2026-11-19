import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {loopSpriteUrl} from '../render.js';
import {loopEnemy} from '../loop-catalog.js';
import {createRoadPosition} from '../geometry.js';
import {readFile} from 'node:fs/promises';

function start(options={}){
 const g=createGame({draftRandom:()=>0,random:()=>0,...options});g.start();g.openStarter();return g;
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
 assert.equal(g.state.capacity,100);
 assert.equal(g.state.towers.find(t=>t.id===towerId).level,2);
 assert.ok(g.state.towers[0].xp>=15);
 const gold=g.drainEvents().filter(e=>e.type==='gold-rush-end');
 assert.deepEqual(gold.map(e=>e.amount),[120]);
 assert.ok(g.continueEndless().ok);
 assert.equal(g.state.capacity,100);
 assert.equal(g.state.towers[0].level,2);
 assert.equal(g.state.nextWaveIn,.68);
 g.restart();
 assert.equal(g.state.capacity,100);
 assert.equal(g.state.starter,'unopened');
 assert.deepEqual(g.state.towers,[]);
});
test('endless forecasts preserve count, wave multiplier and twelve regular boss slots',()=>{
 const g=start();
 const s=g.state;s.phase='victory';
 assert.ok(g.continueEndless().ok);
 const codes=[];
 for(let w=55;w<=115;w+=5){
  s.wave=w-1;
  const [f]=g.forecasts();
  assert.equal(f.count,50);
  codes.push(f.entries.at(-1).code);
  assert.equal(f.hpMultiplier,5.69*(1+.01*(w-50)));
 }
 assert.deepEqual(codes,['B11','B12','B01','B02','B03','B04','B05','B06','B07','B08','B09','B10','B11']);
});
test('60 pressure is the default hard end and a final state cannot keep advancing',()=>{
 const g=start();
 assert.equal(g.state.limit,60);
 g.deploy(g.state.cards[0].id,190,140);
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
 assert.equal(result.wave,50);
 assert.ok(result.reconciled);
 assert.equal(result.game.state.towers.some(t=>result.game.catalog.find(c=>c.code===t.code).rarity==='epic'),false);
});

test('nearby zero-damage support shares experience while distant towers do not',()=>{
 let roll=0;
 const g=start({draftRandom:()=>roll,startingGold:360,waveCount:1,waveSize:()=>1,enemySpeedScale:0,enemyHealthScale:.001});
 g.deploy(g.state.cards[0].id,500,300);
 const commons=g.catalog.filter(t=>t.rarity==='common');
 roll=(commons.findIndex(t=>t.code==='T11')+.5)/commons.length;
 assert.ok(g.draw('R').ok);
 assert.equal(g.state.cards[0].code,'T11');
 g.deploy(g.state.cards[0].id,780,300);
 roll=0;
 assert.ok(g.draw('R').ok);
 g.deploy(g.state.cards[0].id,190,140);
 g.launchWave();g.tick(.1);
 assert.deepEqual(g.state.towers.map(t=>[t.code,t.xp]),[['T05',1],['T11',1],['T01',0]]);
});

test('skill effects follow actual attack radius and delayed mine detonation',()=>{
 const water=start({waveSize:()=>1,enemySpeedScale:0});
 water.state.cards[0].code='T06';
 assert.ok(water.deploy(water.state.cards[0].id,500,300).ok);
 Object.assign(water.state.towers[0],{level:5,cycles:4});
 water.launchWave();water.tick(.1);
 assert.deepEqual(water.drainEvents().filter(e=>e.type==='skill-pulse').map(e=>[e.kind,e.radius]),[['water',65],['water',100]]);

 const mines=start({waveSize:()=>1,enemySpeedScale:0});
 mines.state.cards[0].code='T17';
 assert.ok(mines.deploy(mines.state.cards[0].id,500,300).ok);
 mines.launchWave();mines.tick(.1);
 const region=mines.state.regions[0];
 assert.equal(region.kind,'mine');
 assert.ok(!mines.drainEvents().some(e=>e.type==='skill-pulse'));
 mines.tick(.45);
 const [blast]=mines.drainEvents().filter(e=>e.type==='skill-pulse');
 assert.deepEqual(blast,{type:'skill-pulse',kind:'burst',radius:55,x:region.x,y:region.y});
});

function combatFixture(codes, level, enemy, hp, shield = 0) {
 const game=start({enemySpeedScale:0,startingGold:1000});
 const spots=[[552,302],[730,302],[552,500]];
 game.state.cards[0].code=codes[0];
 for(const [index,code] of codes.entries()){
  if(index)game.state.cards.push({id:100+index,code,paid:true,refund:0});
  assert.ok(game.deploy(game.state.cards[0].id,...spots[index]).ok);
 }
 for(const tower of game.state.towers)Object.assign(tower,{level,xp:game.xpThresholds[level-1]});
 const position=createRoadPosition(()=>0);
 const target=loopEnemy({code:enemy,wave:25,boss:enemy.startsWith('B')},9999,position,{enemySpeedScale:0});
 Object.assign(target,{hp,maxHp:hp,shield});
 game.state.enemies.push(target);
 return {game,target};
}

test('equal-budget SR and SSR groups specialize in soaked packs and sustained boss damage',()=>{
 const damage=(codes,enemy,count)=>{
  const {game,target}=combatFixture(codes,3,enemy,25000);
  assert.equal(game.state.populationUsed,25);
  for(const [index,code] of ['crystal','gear'].entries()){
   assert.ok(game.buyEquipment(code).ok);
   assert.ok(game.equip(game.state.towers[index].id,game.state.inventory[0].id).ok);
  }
  assert.equal(game.state.gold,875);
  for(let i=1;i<count;i++)game.state.enemies.push({...target,id:target.id+i,x:640+i*6,statuses:[],burns:[],skillAt:{}});
  const enemies=[...game.state.enemies];
  play(game,8);
  return enemies.reduce((sum,e)=>sum+25000-e.hp,0);
 };
 const arc=['T05','T06'],laser=['T04','T06'];
 assert.ok(damage(arc,'X01',6)>damage(laser,'X01',6));
 assert.ok(damage(laser,'B01',1)>damage(arc,'B01',1));
});

test('a leveled SR interrupter stops the chain boss from silencing a nearby tower',()=>{
 const scenario=code=>{
  const {game,target}=combatFixture([code,'T06'],3,'B05',25000);
  play(game,15);
  return {interrupts:game.drainEvents().filter(event=>event.type==='interrupt'&&event.code===target.code).length,
   silenced:game.state.towers.some(tower=>tower.silenceUntil>0)};
 };
 const disruptor=scenario('T24'),beam=scenario('T25');
 assert.ok(disruptor.interrupts>beam.interrupts);
 assert.equal(disruptor.silenced,false);
 assert.equal(beam.silenced,true);
});

test('ion damage keeps its elite value at low HP and resonance marks outlive a broken shield',()=>{
 const damage=hp=>{
  const {game,target}=combatFixture(['T23'],1,'E01',1200);
  target.hp=hp;
  game.tick(.05);
  return hp-target.hp;
 };
 assert.ok(damage(1200)>=60);
 assert.equal(damage(300),damage(1200));
 const {game,target}=combatFixture(['T28','T01'],3,'X05',2000,5);
 game.tick(.05);
 assert.equal(target.shield,0);
 assert.ok(target.statuses.some(status=>status.kind==='vulnerable'&&status.value===.2));
 assert.ok(2000-target.hp>100);
 play(game,4.5);
 assert.equal(target.statuses.some(status=>status.kind==='vulnerable'),false);
});
