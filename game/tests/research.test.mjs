import test from 'node:test';
import assert from 'node:assert/strict';
// Shared base-engine mechanics retained by defense / escort / maze.
// The new loop rules are covered by loop-strategy.test.mjs.
import {createBaseGame as createGame} from '../engine.js';

const session=(options={})=>{const game=createGame({startingGold:10000,initialDelay:10000,...options});game.start();return game;};

test('deployment research charges once and unlocks the next tower group only on completion',()=>{
 const game=session();
 assert.deepEqual(game.state.tech,{deployment:0,reinforcement:0});
 assert.equal(game.canBuildType('T01').ok,true);
 assert.equal(game.canBuildType('T03').ok,false);
 assert.equal(game.startResearch('deployment').ok,true);
 assert.equal(game.state.gold,9880);
 assert.deepEqual(game.state.research,{kind:'deployment',level:1,cost:120,duration:12,remaining:12});
 game.tick(11.9);assert.equal(game.canBuildType('T03').ok,false);
 game.tick(.1);assert.equal(game.state.tech.deployment,1);
 assert.equal(game.state.research,null);
 assert.equal(game.build(190,140,'T03').ok,true);
});

test('reinforcement completion permits paid manual upgrades without upgrading existing towers',()=>{
 const game=session();const {towerId}=game.build(190,140,'T01');
 const before=game.state.gold;
 assert.equal(game.canUpgrade(towerId).ok,false);
 assert.equal(game.upgrade(towerId).ok,false);assert.equal(game.state.gold,before);
 assert.equal(game.startResearch('reinforcement').ok,true);
 game.tick(9.9);assert.equal(game.upgrade(towerId).ok,false);
 game.tick(.1);assert.equal(game.state.towers[0].level,1);
 assert.equal(game.canUpgrade(towerId).ok,true);assert.equal(game.upgrade(towerId).ok,true);
 assert.equal(game.state.towers[0].level,1);game.tick(5);assert.equal(game.state.towers[0].level,2);assert.equal(game.upgrade(towerId).ok,false);
 for(const [cost,duration] of [[200,15],[350,20],[550,25]]){
  const gold=game.state.gold;
  assert.equal(game.startResearch('reinforcement').ok,true);
  assert.equal(game.state.gold,gold-cost);assert.equal(game.state.research.duration,duration);game.tick(duration);
  assert.equal(game.upgrade(towerId).ok,true);game.tick(game.state.towers[0].upgrading.duration);
 }
 assert.equal(game.state.towers[0].level,5);assert.equal(game.canUpgrade(towerId).ok,false);
 assert.equal(game.canResearch('reinforcement').ok,false);
});

test('single research slot rejects queues and cancellation refunds once, including while paused',()=>{
 const game=session();game.togglePause();
 assert.equal(game.startResearch('deployment').ok,true);
 assert.equal(game.canResearch('reinforcement').ok,false);
 assert.equal(game.startResearch('reinforcement').ok,false);
 assert.equal(game.state.gold,9880);game.tick(100);
 assert.equal(game.state.research.remaining,12);
 assert.equal(game.cancelResearch().ok,true);assert.equal(game.state.gold,10000);
 assert.equal(game.cancelResearch().ok,false);assert.equal(game.state.gold,10000);
 assert.deepEqual(game.state.tech,{deployment:0,reinforcement:0});
 assert.equal(game.startResearch('reinforcement').ok,true);
 game.togglePause();game.setSpeed(3);game.tick(3);
 assert.ok(Math.abs(game.state.research.remaining-1)<1e-8);
 game.tick(1/3);assert.equal(game.state.research,null);
 const gold=game.state.gold;assert.equal(game.cancelResearch().ok,false);assert.equal(game.state.gold,gold);
 const events=game.drainEvents();
 assert.ok(events.some(e=>e.type==='research-start'&&e.kind==='deployment'&&e.message));
 assert.ok(events.some(e=>e.type==='research-cancel'&&e.kind==='deployment'&&e.message));
 assert.ok(events.some(e=>e.type==='research-complete'&&e.kind==='reinforcement'&&e.message));
});

test('restart clears completed technologies and a paid research task',()=>{
 const game=session();game.startResearch('reinforcement');game.tick(10);
 game.startResearch('deployment');game.tick(3);game.restart();
 assert.deepEqual(game.state.tech,{deployment:0,reinforcement:0});
 assert.equal(game.state.research,null);assert.equal(game.state.gold,10000);
 assert.equal(game.canBuildType('T03').ok,false);
});

test('each ordinary enemy and Boss independently draws its central birth direction from the session RNG',()=>{
 for(const [choice,angle,axis,sign] of [[0,-Math.PI/2,'y',-1],[.249,-Math.PI/2,'y',-1],[.25,0,'x',1],[.499,0,'x',1],[.5,Math.PI/2,'y',1],[.749,Math.PI/2,'y',1],[.75,Math.PI,'x',-1],[.999,Math.PI,'x',-1]]){
  let calls=0;
  const game=session({initialDelay:0,waveInterval:.1,spawnInterval:.02,waveCount:5,waveSize:()=>1,enemySpeedScale:.001,random:()=>{calls++;return choice;}});
  game.tick(.6);
  assert.equal(game.state.enemies.length,6);assert.equal(calls,6);
  assert.equal(game.state.enemies.filter(e=>e.boss).length,1);
  for(const enemy of game.state.enemies){
   assert.equal(enemy.angle,angle);
   assert.ok((enemy[axis]-(axis==='x'?640:400))*sign>0);
   assert.equal(enemy[axis==='x'?'y':'x'],axis==='x'?400:640);
  }
 }
});

test('deployment tiers enforce 4/8/12/20 capacities, cumulative groups and the final cap',()=>{
 const game=session();
 const fill=(capacity)=>{
  for(let y=140;y<=660;y+=60)for(let x=170;x<=1110;x+=100)if(game.canBuild(x,y,'T01').ok)game.build(x,y,'T01');
  assert.equal(game.state.towers.length,capacity);
  const gold=game.state.gold;assert.equal(game.canBuildType('T01').ok,false);
  assert.equal(game.build(190,650,'T01').ok,false);assert.equal(game.state.gold,gold);
 };
 fill(4);
 for(const [cost,duration,capacity,codes] of [[120,12,8,['T03','T07','T11']],[300,20,12,['T04','T05','T12']],[600,30,20,['T08','T09','T10']]]){
  const gold=game.state.gold;assert.equal(game.startResearch('deployment').ok,true);
  assert.equal(game.state.gold,gold-cost);assert.equal(game.state.research.duration,duration);
  game.tick(duration);
  for(const code of codes)assert.equal(game.canBuildType(code).ok,true,code);
  fill(capacity);
 }
 assert.equal(game.canResearch('deployment').ok,false);
 const sold=game.state.towers[0];assert.equal(game.sell(sold.id).ok,true);
 assert.equal(game.canBuildType('T10').ok,true);
 assert.equal(game.build(sold.x,sold.y,'T10').towerId,21);
});

test('victory freezes a paid task, endless resumes it, defeat freezes it and rejects mutations',()=>{
 const game=session({waveCount:1,waveSize:()=>1,enemyHealthScale:.001,enemySpeedScale:0});
 assert.equal(game.build(500,300,'T01').ok,true);
 game.startResearch('deployment');game.launchWave();game.tick(.2);
 assert.equal(game.state.phase,'victory');
 const frozen=structuredClone(game.state.research),gold=game.state.gold;
 game.tick(100);assert.deepEqual(game.state.research,frozen);
 assert.equal(game.startResearch('reinforcement').ok,false);assert.equal(game.cancelResearch().ok,false);
 assert.equal(game.state.gold,gold);assert.equal(game.continueEndless().ok,true);
 assert.deepEqual(game.state.research,frozen);game.tick(12);
 assert.equal(game.state.tech.deployment,1);assert.equal(game.state.research,null);
 const failed=session({initialDelay:0,limit:1});failed.startResearch('reinforcement');failed.tick(1);
 assert.equal(failed.state.phase,'defeat');const task=structuredClone(failed.state.research),paid=failed.state.gold;
 failed.tick(100);assert.deepEqual(failed.state.research,task);
 assert.equal(failed.cancelResearch().ok,false);assert.equal(failed.startResearch('deployment').ok,false);assert.equal(failed.state.gold,paid);
});

test('invalid, unaffordable and pregame research attempts do not charge or allocate tasks',()=>{
 const game=createGame({startingGold:99});
 assert.equal(game.startResearch('reinforcement').ok,false);game.start();
 for(const kind of ['reinforcement','deployment','unknown','toString','__proto__']){
  assert.equal(game.canResearch(kind).ok,false);assert.equal(game.startResearch(kind).ok,false);
  assert.equal(game.state.gold,99);assert.equal(game.state.research,null);
 }
});

test('the birth draw and later non-reversing junction draws share one RNG stream',()=>{
 const draws=[0,.5];let decisions=0;
 const game=session({initialDelay:0,waveCount:1,waveSize:()=>1,random:()=>draws[decisions++]??0});
 game.tick(2);assert.equal(decisions,1);assert.equal(game.state.enemies[0].x,640);
 game.tick(.5);const enemy=game.state.enemies[0];assert.equal(decisions,2);
 assert.ok(enemy.x>640);assert.equal(enemy.y,210);assert.equal(enemy.angle,0);
 const group=session({initialDelay:0,waveCount:1,waveSize:()=>4,spawnInterval:.02,random:(()=>{let n=0;return()=>[0,.25,.5,.75][n++];})()});
 group.tick(.15);assert.deepEqual(group.state.enemies.map(e=>e.angle),[-Math.PI/2,0,Math.PI/2,Math.PI]);
});
