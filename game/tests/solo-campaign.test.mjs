import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoopGame} from '../loop-session.js';

test('a solo player chooses a difficulty and worker talent and builds a basic defense',()=>{
 const game=createLoopGame({initialDelay:0,waveSize:()=>1,draftRandom:()=>0});
 assert.equal(game.selectDifficulty('hard').ok,true);
 game.start();
 assert.equal(game.state.difficulty,'hard');
 assert.equal(game.state.capacity,30);
 assert.equal(game.chooseTalent('arsenal').ok,true);
 assert.equal(game.chooseTalent('commerce').ok,false);
 const startingGold=game.state.gold;
 assert.equal(game.buildBasic('N01').ok,false);
 assert.equal(game.buildBasic('N01',640,400).ok,false);
 assert.equal(game.state.gold,startingGold);
 assert.equal(game.buildBasic('N01',500,300).ok,true);
 assert.ok(game.state.gold<startingGold);
 assert.equal(game.state.populationUsed,5);
 game.tick(.05);
 assert.equal(game.state.wave,1);
 game.openStarter();
 assert.equal(game.deploy(game.state.cards[0].id,570,300).ok,true);
 game.tick(.1);
 assert.equal(game.state.wave,1);
 assert.equal(game.selectDifficulty('easy').ok,false);
});

test('the 55-wave campaign expands population and runs the last gold rush before the final boss',()=>{
 const game=createLoopGame({difficulty:'nightmare',initialDelay:0,waveSize:()=>2,waveInterval:.3,spawnInterval:.05,
  enemyHealthScale:.001,enemySpeedScale:0,limit:2000,draftRandom:()=>0});
 game.start();game.openStarter();game.deploy(game.state.cards[0].id,500,300);
 assert.equal(game.state.waveCount,55);
 const capacities=[];
 for(let i=0;i<16000&&game.state.phase==='playing';i++){
  game.tick(.05);
  for(const event of game.drainEvents()){
   if(event.type==='population')capacities.push(game.state.capacity);
   if(event.type==='wave'&&event.amount===55)assert.equal(game.state.finalGoldSettled,true);
  }
 }
 assert.deepEqual(capacities,[50,70,90,100]);
 assert.equal(game.state.wave,55);
 assert.equal(game.state.phase,'victory');
 assert.deepEqual(game.availableModes(),['endless','abyss']);
});

test('a delayed wave 50 reward cannot reopen the settled wave 54 gold rush',()=>{
 const game=createLoopGame({initialDelay:1000,waveInterval:1000,spawnInterval:.05,waveSize:()=>1,
  enemyHealthScale:.001,enemySpeedScale:0,random:()=>0,draftRandom:()=>0});
 game.start();game.openStarter();
 assert.ok(game.deploy(game.state.cards[0].id,190,140).ok);
 game.state.wave=49;
 for(let wave=50;wave<=54;wave++){
  assert.ok(game.launchWave().ok);
  game.tick(.05);
 }
 game.tick(31);
 assert.equal(game.state.finalGoldSettled,true);
 assert.ok(game.state.enemies.some(enemy=>enemy.boss&&enemy.wave===50));
 assert.ok(game.buildBasic('N01',500,300).ok);
 game.tick(75);
 const paid=game.drainEvents().filter(event=>event.type==='gold-rush-end').map(event=>event.wave);
 assert.deepEqual(paid,[54,50]);
 assert.equal(game.state.finalGoldSettled,true);
 assert.ok(game.launchWave().ok);
 assert.equal(game.state.wave,55);
});

test('a nightmare victory leads through the abyss trials into floor progression with one selected main tower',()=>{
 const game=createLoopGame({difficulty:'nightmare',waveCount:1,initialDelay:0,waveSize:()=>1,enemyHealthScale:.001,
  enemySpeedScale:0,random:()=>0,draftRandom:()=>0});
 assert.equal(game.continueAbyss().ok,false);
 game.start();game.openStarter();
 const {towerId}=game.deploy(game.state.cards[0].id,500,300);
 assert.equal(game.buildBasic('N01',570,300).ok,true);
 game.tick(15);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.continueAbyss().ok,true);
 assert.equal(game.state.abyss.stage,1);
 assert.equal(game.selectAbyssTower(game.state.towers.find(t=>t.id!==towerId).id).ok,false);
 assert.equal(game.selectAbyssTower(towerId).ok,true);
 assert.deepEqual(game.state.towers.map(t=>t.id),[towerId]);
 game.tick(30);
 assert.equal(game.state.abyss.stage,2);
 assert.equal(game.state.towers.length,2);
 for(let stage=2;stage<=4;stage++){
  assert.ok(game.selectAbyssTower(towerId).ok);
  game.tick(10);
  assert.equal(game.state.abyss.stage,stage+1);
 }
 assert.equal(game.state.abyss.best,1);
 assert.deepEqual(game.state.inventory.map(item=>item.code),['siege','prism','anchor']);
});

test('hard mode enters endless with seven regular enemies and a boss on round ten',()=>{
 const game=createLoopGame({difficulty:'hard',waveCount:1,initialDelay:0,waveInterval:.2,spawnInterval:.05,waveSize:()=>1,
  enemyHealthScale:.001,enemySpeedScale:0,random:()=>0,draftRandom:()=>0,endlessRandom:()=>0,combatRandom:()=>1});
 game.start();game.openStarter();game.deploy(game.state.cards[0].id,500,300);
 game.tick(4);
 assert.equal(game.state.phase,'victory');
 assert.ok(game.continueEndless().ok);
 const tower=game.state.towers[0];
 assert.equal(game.forecasts()[0].types[0],'X26');
 game.tick(2);
 assert.ok(game.drainEvents().some(event=>event.type==='wave'&&event.amount===11&&event.message.includes('Boss')));
 assert.equal(game.state.towers[0],tower);
});

test('the mystery merchant opens at wave 21, sells stock once and grants one refresh',()=>{
 const game=createLoopGame({startingGold:4000,initialDelay:0,waveInterval:.2,spawnInterval:.05,waveSize:()=>2,
  enemyHealthScale:.001,enemySpeedScale:0,noGoldRush:true,marketRandom:()=>0,draftRandom:()=>0});
 game.start();game.openStarter();game.deploy(game.state.cards[0].id,500,300);
 game.tick(3.95);
 assert.equal(game.state.wave,20);
 assert.equal(game.buyEquipment('scope','mystery').ok,false);
 game.tick(.2);
 assert.equal(game.state.wave,21);
 const before=game.state.gold;
 assert.ok(game.buyEquipment('scope','mystery').ok);
 const after=game.state.gold;
 assert.ok(after<before);
 assert.equal(game.buyEquipment('scope','mystery').ok,false);
 assert.equal(game.state.gold,after);
 assert.ok(game.refreshMystery().ok);
 assert.equal(game.refreshMystery().ok,false);
 assert.ok(game.buyEquipment('scope','mystery').ok);
});

test('a worker can temper a weapon and a main tower can equip only one result',()=>{
 const game=createLoopGame({startingGold:500,initialDelay:1000,draftRandom:()=>0});
 game.start();game.openStarter();
 const {towerId}=game.deploy(game.state.cards[0].id,500,300);
 const first=game.buyEquipment('untemperedEdge').itemId;
 const second=game.buyEquipment('untemperedCore').itemId;
 assert.equal(game.equip(towerId,first).ok,false);
 assert.ok(game.startTempering(first).ok);
 assert.equal(game.startTempering(second).ok,false);
 game.tick(119);
 assert.equal(game.claimTempered().ok,false);
 game.tick(1.1);
 assert.ok(game.claimTempered().ok);
 assert.ok(game.equip(towerId,game.state.inventory.find(item=>item.code==='thunderEdge').id).ok);
 assert.ok(game.startTempering(second).ok);
 game.tick(120.1);
 assert.ok(game.claimTempered().ok);
 assert.equal(game.equip(towerId,game.state.inventory.find(item=>item.code==='solarCore').id).ok,false);
});
