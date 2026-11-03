import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {towerStats} from '../catalog.js';

for(const mode of ['loop','hero','legion'])test(`${mode}: timed upgrades charge once, preserve old stats, pause, accelerate and finish once`,()=>{
 const game=createGame({mode,startingGold:10000,initialDelay:1000,ai:false});game.start();
 game.state.tech.reinforcement=4;
 let point;for(let y=100;y<700&&!point;y+=40)for(let x=100;x<1100;x+=40)if(game.canBuild(x,y,'T01').ok){point={x,y};break;}
 const {towerId}=game.build(point.x,point.y,'T01'),tower=game.state.towers.find(t=>t.id===towerId);
 for(const duration of [5,8,12,16]){
  const old=tower.level,gold=game.state.gold,cost=(game.statsFor?.(tower)||towerStats(tower)).upgradeCost;
  assert.ok(game.upgrade(towerId,tower.level===2?'A':null).ok);assert.equal(game.state.gold,gold-cost);assert.equal(tower.level,old);assert.equal(tower.upgrading.duration,duration);
  assert.equal(game.upgrade(towerId).ok,false);assert.equal(game.sell(towerId).ok,false);assert.equal(game.state.gold,gold-cost);
  game.togglePause();game.tick(30);assert.equal(tower.upgrading.remaining,duration);game.togglePause();
  game.setSpeed(2);game.tick((duration-1)/2);assert.equal(tower.level,old);assert.ok(Math.abs(tower.upgrading.remaining-1)<1e-7);
  game.tick(.5);assert.equal(tower.level,old+1);assert.equal(tower.upgrading,undefined);
  game.tick(.1);assert.equal(tower.level,old+1);
 }
 assert.equal(game.upgrade(towerId).ok,false);
});

test('a tower upgrade freezes at victory and continues into endless; restart clears it',()=>{
 const game=createGame({mode:'defense',startingGold:1000,initialDelay:1000,waveCount:1,waveSize:()=>1,enemySpeedScale:10});game.start();
 game.state.tech.reinforcement=1;game.build(500,280,'T01');game.upgrade(1);game.launchWave();game.tick(2);
 assert.equal(game.state.phase,'victory');const remaining=game.state.towers[0].upgrading.remaining;
 game.tick(100);assert.equal(game.state.towers[0].upgrading.remaining,remaining);
 game.continueEndless();game.tick(remaining);assert.equal(game.state.towers[0].level,2);
 game.restart();assert.equal(game.state.towers.length,0);
});

test('legion upgrades continue in battle without reviving fallen fighters',()=>{
 const game=createGame({mode:'legion',startingGold:1000,ai:false});game.start();game.state.tech.reinforcement=1;
 const {towerId}=game.build(600,370,'T01');game.upgrade(towerId);game.startCombat();
 const fighter=game.state.towers[0];fighter.hp=0;game.tick(5);
 assert.equal(fighter.level,2);assert.equal(fighter.hp,0);assert.equal(fighter.upgrading,undefined);
});
