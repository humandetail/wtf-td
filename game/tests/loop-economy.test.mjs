import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {loopEnemy} from '../loop-catalog.js';

function start(options={}){
 const game=createGame({draftRandom:()=>0,random:()=>0,...options});
 game.start();game.openStarter();return game;
}
function deployStarter(game){return game.deploy(game.state.cards[0].id,500,300).towerId;}

test('kill budgets pay once with no flat wave-clear grant',()=>{
 const game=start({waveCount:1,waveSize:()=>1,enemyHealthScale:.001});
 assert.equal(game.state.gold,80);
 deployStarter(game);
 assert.ok(game.launchWave().ok);
 game.tick(3);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.gold,125);
 assert.equal(game.drainEvents().filter(e=>e.type==='wave-clear').length,1);
 game.tick(30);
 assert.equal(game.state.gold,125);
});

test('overlapping waves retain the bounty budget of their originating wave',()=>{
 const game=start({waveCount:2,waveSize:()=>2,spawnInterval:.025,enemyHealthScale:.001,enemySpeedScale:0});
 deployStarter(game);game.state.towers[0].cooldown=.8;
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.equal(game.state.enemies.length,4);
 game.tick(5);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.gold,173);
 assert.deepEqual(game.drainEvents().filter(e=>e.type==='wave-clear').map(e=>e.wave),[1,2]);
});

test('blue and orange crafting and breakthrough consume real items without duplicating refunds',()=>{
 const game=start({startingGold:2500,draftRandom:()=>.99});
 const towerId=deployStarter(game),main=game.state.towers[0];
 assert.equal(main.code,'T27');
 assert.equal(game.buyEquipment('scroll-green').ok,false);
 game.state.wave=25;
 const other=game.draw('R').cardId;
 game.state.cards.find(card=>card.id===other).code='T18';
 assert.ok(game.deploy(other,780,300).ok);
 const credential=game.state.towers[1];
 function green(){
  for(const code of ['blade','gear','scroll-green'])assert.ok(game.buyEquipment(code).ok);
  assert.ok(game.craftEquipment('repeater').ok);
 }
 green();
 assert.ok(game.buyEquipment('blade').ok&&game.buyEquipment('scroll-blue').ok);
 assert.ok(game.craftEquipment('splitter').ok);
 green();
 assert.ok(game.buyEquipment('scroll-orange').ok);
 const items=game.state.inventory.map(item=>item.id);
 assert.equal(game.craftEquipment('tether').ok,false);
 assert.deepEqual(game.state.inventory.map(item=>item.id),items);
 const orange=game.craftEquipment('arbalest');
 assert.ok(orange.ok);
 assert.equal(game.equip(towerId,orange.itemId).ok,false);
 main.level=5;credential.level=5;
 assert.ok(game.breakthrough(towerId,credential.id).ok);
 assert.equal(game.breakthrough(towerId,credential.id).ok,false);
 assert.ok(game.equip(towerId,orange.itemId).ok);
 assert.ok(game.unequip(towerId,orange.itemId).ok);
 assert.equal(game.sellEquipment(orange.itemId).refund,166);
 assert.equal(game.sellEquipment(orange.itemId).ok,false);
});

test('manual equipment rejects invalid aims and keeps its cooldown when returned to inventory',()=>{
 const game=start({startingGold:1000});
 const id=deployStarter(game),tower=game.state.towers[0];
 tower.awakened=true;
 game.state.inventory.push({id:99,code:'furnace',invested:0,manual:false,readyAt:0});
 assert.ok(game.equip(id,99).ok);
 assert.ok(game.toggleEquipmentMode(id,99).ok);
 assert.equal(game.castEquipment(id,99,5,5).ok,false);
 assert.equal(tower.equipment[0].readyAt,0);
 const target=loopEnemy({code:'X02',wave:1},123,{x:560,y:300});
 game.state.enemies.push(target);
 const hp=target.hp;
 assert.ok(game.castEquipment(id,99,560,300).ok);
 assert.ok(target.hp<hp);
 assert.equal(tower.equipment[0].readyAt,24);
 assert.equal(game.castEquipment(id,99,560,300).ok,false);
 assert.equal(game.unequip(id,99).ok,false);
 game.state.elapsed=5.01;
 assert.ok(game.unequip(id,99).ok);
 assert.ok(game.equip(id,99).ok);
 assert.equal(game.castEquipment(id,99,560,300).ok,false);
});

test('automatic area gear waits for a group and applies only one cooldown',()=>{
 const game=start({initialDelay:1000});
 const id=deployStarter(game),tower=game.state.towers[0];
 tower.awakened=true;tower.cooldown=9;
 game.state.inventory.push({id:99,code:'furnace',invested:0,manual:false,readyAt:0});
 assert.ok(game.equip(id,99).ok);
 const makeEnemy=i=>loopEnemy({code:'X08',wave:1},100+i,{x:550+i*6,y:300,roadFrom:0,roadTo:1},{enemySpeedScale:0,enemyHealthScale:10});
 game.state.enemies=Array.from({length:3},(_,i)=>makeEnemy(i));
 game.tick(.1);assert.equal(tower.equipment[0].readyAt,0);
 game.state.enemies.push(makeEnemy(3));
 const hp=game.state.enemies.map(enemy=>enemy.hp);
 game.tick(.1);
 const ready=tower.equipment[0].readyAt;
 assert.ok(ready>=24);
 assert.ok(game.state.enemies.every((enemy,i)=>enemy.hp<hp[i]));
 game.tick(.1);assert.equal(tower.equipment[0].readyAt,ready);
});

test('a challenge awards an unsellable-for-profit component once',()=>{
 const game=start({initialDelay:1000,waveSize:()=>1,spawnInterval:.01,enemyHealthScale:.001});
 deployStarter(game);
 for(let wave=1;wave<=3;wave++){assert.ok(game.launchWave().ok);game.tick(.05);}
 assert.equal(game.state.wave,3);
 assert.equal(game.startChallenge('C02').ok,false);
 assert.ok(game.startChallenge('C01').ok);
 assert.equal(game.startChallenge('C01').ok,false);
 game.tick(2);
 assert.deepEqual(game.state.completedChallenges,['C01']);
 const item=game.state.inventory.find(item=>item.code==='blade');
 assert.equal(item.invested,0);
 assert.equal(game.sellEquipment(item.id).refund,0);
 assert.equal(game.startChallenge('C01').ok,false);
});
