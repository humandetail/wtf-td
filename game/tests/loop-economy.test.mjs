import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';

function start(options={}){
 const game=createGame({draftRandom:()=>0,random:()=>0,...options});
 game.start();game.chooseCard(0);return game;
}
function deployStarter(game){return game.deploy(game.state.cards[0].id,500,300).towerId;}

test('starting bankroll buys three picks and clearing a wave pays once',()=>{
 const game=start({waveCount:1,waveSize:()=>1,enemyHealthScale:.001});
 assert.equal(game.state.gold,450);
 deployStarter(game);
 assert.ok(game.launchWave().ok);
 assert.equal(game.state.gold,450);
 game.tick(3);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.gold,518);
 assert.equal(game.drainEvents().filter(e=>e.type==='wave-clear').length,1);
 game.tick(30);
 assert.equal(game.state.gold,518);
});

test('concurrent waves earn separate grants based on originating wave',()=>{
 const game=start({waveCount:2,waveSize:()=>2,spawnInterval:.025,enemyHealthScale:.001,enemySpeedScale:0});
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.equal(game.state.enemies.length,4);
 deployStarter(game);game.tick(5);
 assert.equal(game.state.phase,'victory');
 assert.deepEqual(game.drainEvents().filter(e=>e.type==='wave-clear').map(e=>[e.wave,e.amount]),[[1,60],[2,60]]);
});

test('buying, crafting on tower and selling preserve item and gold ownership',()=>{
 const game=start({startingGold:900});
 const towerId=deployStarter(game);
 assert.ok(game.buyEquipment('core').ok);
 assert.ok(game.buyEquipment('gear').ok);
 const [core,gear]=game.state.inventory;
 assert.ok(game.equip(towerId,core.id).ok);
 assert.ok(game.equip(towerId,gear.id).ok);
 assert.equal(game.craft(core.id,core.id,towerId).ok,false);
 assert.equal(game.craft(core.id,gear.id,towerId).ok,false,'single-target tower cannot equip scatter');
 assert.ok(game.unequip(towerId,gear.id).ok);
 assert.ok(game.unequip(towerId,core.id).ok);
 assert.ok(game.craft(core.id,gear.id).ok);
 assert.deepEqual(game.state.inventory.map(e=>e.code),['scatter']);
 assert.equal(game.state.gold,680);
 assert.equal(game.sell(towerId).ok,true);
 assert.equal(game.state.gold,680);
});

test('attack consistently blocks removal and sale until five simulation seconds have elapsed',()=>{
 const game=start({waveCount:2,enemyHealthScale:.001,waveSize:()=>1});
 const towerId=deployStarter(game);
 game.buyEquipment('core');const id=game.state.inventory[0].id;
 game.equip(towerId,id);game.launchWave();game.tick(.3);
 assert.equal(game.unequip(towerId,id).ok,false);
 assert.equal(game.sell(towerId).ok,false);
 game.togglePause();game.tick(30);
 assert.equal(game.unequip(towerId,id).ok,false);
 game.togglePause();game.setSpeed(2);game.tick(2.5);
 assert.ok(game.sell(towerId).ok);
 assert.deepEqual(game.state.inventory.map(e=>e.id),[id]);
});

test('challenge uses one attempt, grants its reward once and leaves the main-wave ledger intact',()=>{
 const game=start({initialDelay:1000,waveSize:()=>1,spawnInterval:.01,enemyHealthScale:.001});
 deployStarter(game);
 for(let wave=1;wave<=3;wave++){assert.ok(game.launchWave().ok);game.tick(.05);}
 assert.equal(game.state.wave,3);
 assert.equal(game.startChallenge('C02').ok,false);
 assert.ok(game.startChallenge('C01').ok);
 assert.equal(game.startChallenge('C01').ok,false);
 game.tick(2);
 assert.deepEqual(game.state.completedChallenges,['C01']);
 assert.equal(game.state.inventory.filter(e=>e.code==='core').length,1);
 assert.equal(game.startChallenge('C01').ok,false);
});
