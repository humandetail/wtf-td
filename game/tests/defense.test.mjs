import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';

test('default 400-gold defense can clear twenty waves using paid research and free placement',()=>{
 const game=createGame({mode:'defense'});game.start();
 for(const [x,y,code] of [[500,280,'T06'],[780,450,'T06'],[500,450,'T01']])assert.equal(game.build(x,y,code).ok,true);
 const expansion=[[780,280,'T03'],[400,280,'T11'],[880,280,'T03'],[400,450,'T03'],[880,450,'T03']];
 let next=0,steps=0;
 while(game.state.phase==='playing'&&steps++<4000){
  const state=game.state;
  if(!state.tech.reinforcement)game.startResearch('reinforcement');
  else if(state.towers[0].level<2)game.upgrade(state.towers[0].id);
  else if(!state.tech.deployment)game.startResearch('deployment');
  else if(next<expansion.length){const [x,y,code]=expansion[next];if(game.build(x,y,code).ok)next++;}
  else {const tower=state.towers.find(tower=>tower.level<=state.tech.reinforcement);if(tower)game.upgrade(tower.id);else if(state.tech.reinforcement<4)game.startResearch('reinforcement');}
  game.tick(.5);game.drainEvents();
  assert.ok(game.state.gold>=0,'all purchases stay within earned funds');
 }
 assert.equal(game.state.phase,'victory');assert.equal(game.state.wave,20);assert.ok(game.state.coreHealth>0);
 assert.equal(game.state.kills+game.state.leaks,624);assert.equal(game.state.towers.length,8);assert.equal(game.state.tech.reinforcement,4);
});

test('defense enemies take a finite route, leak once without kill rewards, and clear grants supply once',()=>{
 const game=createGame({mode:'defense',initialDelay:0,waveCount:2,waveSize:()=>1,enemySpeedScale:1});game.start();game.tick(.05);
 assert.equal(game.state.mode,'defense');assert.equal(game.state.waveActive,true);assert.equal(game.state.nextWaveIn,0);
 assert.equal(game.state.attackLane,0);assert.equal(game.state.enemies[0].lane,0);
 assert.ok(game.state.enemies[0].remaining<860);
 assert.equal(game.launchWave().ok,false);
 game.tick(10);
 assert.equal(game.state.coreHealth,19);assert.equal(game.state.leaks,1);assert.equal(game.state.kills,0);
 assert.equal(game.state.enemies.length,0);assert.equal(game.state.gold,445);assert.equal(game.state.waveActive,false);
 assert.ok(game.state.nextWaveIn>11&&game.state.nextWaveIn<=12);
 const events=game.drainEvents();assert.equal(events.filter(e=>e.type==='core-hit').length,1);assert.equal(events.filter(e=>e.type==='kill').length,0);assert.equal(events.filter(e=>e.type==='wave-clear').length,1);
 game.tick(1);assert.equal(game.state.gold,445);assert.equal(game.state.leaks,1);
});

test('core defeat halts a large tick once, ignores the loop cap, and grants no clear supply',()=>{
 const game=createGame({mode:'defense',coreHealth:1,limit:1,initialDelay:0,waveSize:()=>3,spawnInterval:.02});game.start();game.tick(.1);
 assert.equal(game.state.phase,'playing');assert.equal(game.state.enemies.length,3);
 game.tick(1000);
 assert.equal(game.state.phase,'defeat');assert.equal(game.state.coreHealth,0);assert.equal(game.state.leaks,1);
 assert.equal(game.state.kills,0);assert.equal(game.state.gold,400);
 const stopped=game.state.elapsed;game.tick(100);assert.equal(game.state.elapsed,stopped);
 const events=game.drainEvents();assert.equal(events.filter(e=>e.type==='defeat').length,1);assert.equal(events.filter(e=>e.type==='core-hit').length,1);assert.equal(events.filter(e=>e.type==='wave-clear').length,0);
 assert.equal(game.startResearch('deployment').ok,false);assert.equal(game.sell(1).ok,false);
});

test('waves rotate all four entries, refuse overlapping spawns, and Boss leakage costs five',()=>{
 const game=createGame({mode:'defense',coreHealth:30,initialDelay:1000,waveCount:5,waveSize:()=>1,spawnInterval:2,enemySpeedScale:10});game.start();
 for(let wave=1;wave<=5;wave++){
  assert.equal(game.launchWave().ok,true);assert.equal(game.state.attackLane,(wave-1)%4);assert.equal(game.state.nextWaveIn,0);
  game.tick(.05);assert.equal(game.state.enemies[0].lane,(wave-1)%4);assert.equal(game.launchWave().ok,false);
  game.tick(wave===5?1.1:.1);
  assert.equal(game.launchWave().ok,false,'remaining enemy or pending boss prevents early launch');
  game.tick(4);
  assert.equal(game.state.waveActive,false);
 }
 assert.equal(game.state.phase,'victory');assert.equal(game.state.coreHealth,20);assert.equal(game.state.leaks,6);assert.equal(game.state.kills,0);
 assert.equal(game.state.gold,675);
 const events=game.drainEvents();assert.equal(events.filter(e=>e.type==='core-hit'&&e.amount===5).length,1);assert.equal(events.filter(e=>e.type==='wave-clear').length,5);assert.equal(events.filter(e=>e.type==='victory').length,1);
});

test('preparation, pause, speed, research and endless preserve this mode while restart resets it',()=>{
 const game=createGame({mode:'defense',startingGold:1000,waveCount:1,waveSize:()=>1,enemySpeedScale:10});game.start();
 assert.equal(game.state.nextWaveIn,18);assert.equal(game.startResearch('reinforcement').ok,true);
 game.togglePause();const remaining=game.state.research.remaining;game.tick(30);assert.equal(game.state.research.remaining,remaining);assert.equal(game.state.elapsed,0);
 game.togglePause();game.setSpeed(2);game.tick(5);assert.equal(game.state.tech.reinforcement,1);assert.equal(game.state.wave,0);
 assert.equal(game.startResearch('deployment').ok,true);
 assert.equal(game.build(500,280,'T01').ok,true);assert.equal(game.upgrade(1).ok,true);
 game.launchWave();game.tick(1);assert.equal(game.state.phase,'victory');assert.equal(game.state.coreHealth,19);
 const frozen=game.state.research.remaining, gold=game.state.gold;
 game.tick(20);assert.equal(game.state.research.remaining,frozen);assert.equal(game.cancelResearch().ok,false);
 assert.equal(game.continueEndless().ok,true);assert.equal(game.state.coreHealth,19);assert.equal(game.state.leaks,1);assert.equal(game.state.gold,gold);assert.equal(game.state.research.remaining,frozen);assert.equal(game.state.nextWaveIn,12);assert.equal(game.state.towers[0].level,2);
 game.tick(.1);assert.ok(game.state.research.remaining<frozen);
 game.restart();assert.equal(game.state.mode,'defense');assert.equal(game.state.coreHealth,20);assert.equal(game.state.maxCoreHealth,20);assert.equal(game.state.leaks,0);assert.equal(game.state.waveActive,false);assert.equal(game.state.attackLane,0);assert.equal(game.state.endless,false);assert.equal(game.state.nextWaveIn,18);assert.equal(game.state.gold,1000);assert.equal(game.state.speed,1);assert.deepEqual(game.state.tech,{deployment:0,reinforcement:0});assert.equal(game.state.research,null);assert.deepEqual(game.state.towers,[]);
 assert.equal(game.build(500,280,'T01').towerId,1);
});

test('defense uses all roads and core clearance while independent loop session keeps original placement',()=>{
 const defense=createGame({mode:'defense',startingGold:10000});const loop=createGame();defense.start();loop.start();
 for(const [x,y] of [[480,150],[540,200],[640,280],[980,300],[820,620],[740,530],[290,500],[500,360],[640,360]])assert.equal(defense.canBuild(x,y,'T01').ok,false,`${x},${y}`);
 assert.equal(defense.build(500,280,'T01').ok,true);assert.equal(defense.canBuild(550,280,'T01').ok,false);
 assert.equal(defense.canBuild(155,125,'T01').ok,true);assert.equal(defense.canBuild(154,125,'T01').ok,false);
 assert.equal(loop.canBuild(480,150,'T01').ok,true);assert.equal(defense.canBuild(300,300,'T01').ok,true);assert.equal(loop.canBuild(300,300,'T01').ok,false);
 defense.launchWave();defense.tick(.1);assert.equal(loop.state.mode,'loop');assert.equal(loop.state.wave,0);assert.equal(loop.state.gold,400);assert.equal(loop.state.towers.length,0);
});

test('finite route geometry clamps distance, turns at fixed corners and ends at the core',async()=>{
 const {DEFENSE_LANES,DEFENSE_ROAD_SEGMENTS,pointOnDefenseRoute}=await import('../defense-geometry.js');
 assert.deepEqual(DEFENSE_LANES.map(lane=>lane.name),['北','东','南','西']);assert.deepEqual(DEFENSE_LANES.map(lane=>lane.length),[860,810,900,820]);assert.equal(DEFENSE_ROAD_SEGMENTS.length,14);
 assert.deepEqual(DEFENSE_LANES.map((lane,index)=>pointOnDefenseRoute(index,-10)),[
  {x:80,y:60,angle:0,remaining:860,arrived:false},
  {x:1220,y:130,angle:Math.PI,remaining:810,arrived:false},
  {x:1200,y:700,angle:Math.PI,remaining:900,arrived:false},
  {x:60,y:600,angle:0,remaining:820,arrived:false},
 ]);
 assert.deepEqual(pointOnDefenseRoute(0,400),{x:480,y:60,angle:Math.PI/2,remaining:460,arrived:false});
 assert.deepEqual(pointOnDefenseRoute(0,550),{x:490,y:200,angle:0,remaining:310,arrived:false});
 for(let lane=0;lane<4;lane++){
  const end=pointOnDefenseRoute(lane,10000);assert.equal(end.x,640);assert.equal(end.y,360);assert.equal(end.remaining,0);assert.equal(end.arrived,true);
 }
 const game=createGame({mode:'defense',initialDelay:0,waveCount:1,waveSize:()=>1,random:()=>{throw Error('finite route must not consume loop junction RNG');}});game.start();game.tick(11);assert.equal(game.state.leaks,1);
});
