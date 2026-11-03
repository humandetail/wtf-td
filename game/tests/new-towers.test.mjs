import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,createBaseGame} from '../engine.js';import {towerStats} from '../catalog.js';
function setup(code,mode='loop'){
 const g=(mode==='hero'?createGame:createBaseGame)({mode,startingGold:10000,initialDelay:1000,waveCount:1,waveSize:()=>4,spawnInterval:.02,enemyHealthScale:100,enemySpeedScale:.01,random:()=>0});g.start();
 for(const duration of [12,20]){assert.ok(g.startResearch('deployment').ok);g.tick(duration);}
 if(mode==='hero'){g.moveHeroTo(1100,600);g.tick(3);}
 g.launchWave();g.tick(.3);g.drainEvents();
 // Controlled living targets: isolated groups within tower range but outside each other's splash/chain radius.
 g.state.enemies=g.state.enemies.slice(0,4);g.state.enemies.forEach((e,i)=>{e.x=[390,500,610,500][i];e.y=[280,180,280,440][i];e.speed=0;e.hp=e.maxHp=1000;e.burnRemaining=0;});
 assert.ok(g.build(mode==='hero'?480:500,mode==='hero'?550:300,code).ok);
 return g;
}
test('multishot fires three distinct independent shots and grows to five with manual upgrades',()=>{
 const g=setup('T14');g.tick(.05);const events=g.drainEvents().filter(e=>e.type==='shot'&&e.code==='T14');
 assert.equal(events.length,3);assert.equal(new Set(events.map(e=>e.tx+','+e.ty)).size,3);assert.equal(g.state.enemies.filter(e=>e.hp<1000).length,3);
 assert.equal(towerStats({code:'T14',level:3}).targetCount,4);assert.equal(towerStats({code:'T14',level:5}).targetCount,5);
});
test('magic applies real timed damage that freezes on pause and cannot duplicate kill rewards',()=>{
 const g=setup('T13');g.state.enemies=g.state.enemies.slice(0,1);g.tick(.05);const e=g.state.enemies[0];assert.equal(e.hp,982);assert.equal(e.burnRemaining,3);
 g.togglePause();g.tick(5);assert.equal(e.hp,982);assert.equal(e.burnRemaining,3);g.togglePause();
 g.tick(.5);assert.ok(Math.abs(e.hp-976)<1e-6);g.sell(g.state.towers[0].id);const hp=e.hp;g.tick(4);assert.ok(Math.abs(e.hp-(hp-30))<1e-6);const gold=g.state.gold;e.hp=1;e.burnRemaining=1;e.burnDps=12;g.tick(.5);assert.equal(g.state.kills,1);assert.equal(g.state.gold,gold+e.reward);g.tick(10);assert.equal(g.state.kills,1);
});
test('hero campaign also resolves independent multishots and magic damage through the real tower combat loop',()=>{
 for(const code of ['T13','T14']){
  const g=setup(code,'hero');g.state.enemies.forEach((e,i)=>{e.ai='caster';e.castCooldown=999;e.x=[390,480,570,480][i];e.y=[500,450,500,610][i];});g.tick(.05);
  if(code==='T14'){assert.equal(g.drainEvents().filter(e=>e.type==='shot'&&e.code===code).length,3);assert.equal(g.state.enemies.filter(e=>e.hp<1000).length,3);}
  else {const e=g.state.enemies.find(e=>e.burnRemaining>0);assert.ok(e);const before=e.hp;g.tick(.5);assert.ok(e.hp<before);}
 }
});
