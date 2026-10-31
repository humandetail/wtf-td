import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {MAZE_ENTRY} from '../maze-geometry.js';
import {pointOnEscortRoute} from '../escort-geometry.js';
import {playMission} from '../qa/mission-strategies.mjs';
import {hitTest} from '../render.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rejects=(game,fn)=>{const snapshot=JSON.stringify(game.state);assert.equal(fn().ok,false);assert.equal(JSON.stringify(game.state),snapshot);};

test('default-resource escort requires moving its target and relocating; default maze can win by building a real detour',()=>{
 for(const mode of ['escort','maze']){
  const {state,moves,repairs}=playMission(mode);
  assert.equal(state.phase,'victory',mode);assert.ok(state.coreHealth>0);assert.ok(state.tech.reinforcement>0);
  if(mode==='escort'){assert.equal(state.convoy.progress,2480);assert.ok(moves>0);assert.ok(repairs>0);assert.equal(state.wave<20,true);}
  else {assert.equal(state.wave,12);assert.equal(state.walls.length,12);assert.ok(state.mazeLength>1700);assert.equal(state.kills+state.leaks,231);}
 }
});

test('escort drive, checkpoint supplies and delivery depend on actual movement, not wave count',()=>{
 const game=createGame({mode:'escort',initialDelay:1000,convoySpeed:800});game.start();
 assert.equal(game.state.coreHealth,100);game.tick(1);near(game.state.convoy.progress,0);
 game.toggleConvoy();game.tick(1);near(game.state.convoy.progress,800);assert.equal(game.state.convoy.moving,false);assert.equal(game.state.gold,500);
 game.tick(2);assert.equal(game.state.gold,500);game.toggleConvoy();game.tick(1);near(game.state.convoy.progress,1600);assert.equal(game.state.gold,600);assert.equal(game.state.convoy.checkpointIndex,2);
 game.toggleConvoy();game.tick(100);assert.equal(game.state.phase,'victory');near(game.state.convoy.progress,2480);assert.equal(game.state.wave,0);
 assert.equal(game.drainEvents().filter(event=>event.type==='checkpoint').length,2);rejects(game,()=>game.continueEndless());rejects(game,()=>game.toggleConvoy());
});

test('front and rear ambushers chase the moving convoy, face their travel and continue attacking without disappearing',()=>{
 const game=createGame({mode:'escort',initialDelay:1000,waveSize:()=>2,spawnInterval:.02});game.start();game.toggleConvoy();game.tick(30);game.toggleConvoy();game.launchWave();game.tick(.1);
 const [front,rear]=game.state.enemies;assert.ok(front.routeProgress>game.state.convoy.progress);assert.ok(rear.routeProgress<game.state.convoy.progress);
 near(front.angle-pointOnEscortRoute(front.routeProgress).angle,Math.PI);near(rear.angle,pointOnEscortRoute(rear.routeProgress).angle);
 game.tick(10);assert.equal(game.state.enemies.length,2);assert.ok(game.state.coreHealth<100);assert.equal(game.state.kills,0);assert.equal(game.state.leaks,0);
 const health=game.state.coreHealth;game.tick(1);near(health-game.state.coreHealth,5);
 game.toggleConvoy();game.tick(1);assert.ok(front.routeProgress>420);assert.ok(rear.routeProgress>390);
});

test('repair requires stopping and earned funds; relocating retains upgrades and pauses combat and income',()=>{
 const game=createGame({mode:'escort',startingGold:2000,initialDelay:1000});game.start();
 rejects(game,()=>game.repairConvoy());game.launchWave();game.tick(7);assert.ok(game.state.coreHealth<100);
 game.toggleConvoy();rejects(game,()=>game.repairConvoy());game.toggleConvoy();const health=game.state.coreHealth,gold=game.state.gold;
 assert.equal(game.repairConvoy().ok,true);near(game.state.coreHealth,Math.min(100,health+6));assert.equal(game.state.gold,gold-60);
 assert.equal(game.build(180,570,'T01').ok,true);game.startResearch('reinforcement');game.tick(10);assert.equal(game.upgrade(1).ok,true);
 const tower=game.state.towers[0],spent=tower.spent,before=game.state.gold;
 rejects(game,()=>game.relocate(1,300,400));assert.equal(game.relocate(1,500,300).ok,true);
 assert.equal(tower.id,1);assert.equal(tower.level,2);assert.equal(tower.spent,spent);assert.equal(game.state.gold,before-25);
 rejects(game,()=>game.relocate(1,500,400));game.drainEvents();game.tick(2);assert.equal(game.drainEvents().filter(e=>e.type==='shot'&&e.x===500).length,0);
 assert.equal(game.canRelocate(1,500,400).ok,false);game.tick(1.1);assert.equal(game.canRelocate(1,500,400).ok,true);
});

test('escort defeat halts once; pause, speed and restart preserve the intended lifecycle',()=>{
 const game=createGame({mode:'escort',coreHealth:1,initialDelay:1000});game.start();game.togglePause();game.tick(100);assert.equal(game.state.elapsed,0);
 game.togglePause();game.setSpeed(2);game.tick(.5);near(game.state.elapsed,1);assert.equal(game.state.phase,'playing');game.launchWave();game.tick(100);assert.equal(game.state.phase,'defeat');
 assert.equal(game.drainEvents().filter(e=>e.type==='defeat').length,1);rejects(game,()=>game.repairConvoy());
 game.restart();assert.equal(game.state.speed,1);assert.equal(game.state.convoy.progress,0);assert.equal(game.state.convoy.moving,false);assert.equal(game.state.convoy.checkpointIndex,0);assert.equal(game.state.coreHealth,1);assert.equal(game.state.research,null);
});

test('relocating a supply station suspends its income clock, then restores it after downtime',()=>{
 const game=createGame({mode:'escort',startingGold:2000,initialDelay:1000});game.start();game.startResearch('deployment');game.tick(12);
 assert.equal(game.build(500,300,'T11').ok,true);game.tick(7);assert.equal(game.relocate(1,500,400).ok,true);
 const gold=game.state.gold;game.tick(2.9);assert.equal(game.state.gold,gold);game.tick(1.2);assert.equal(game.state.gold,gold+12);
});

test('walls spend no tower capacity, use separate IDs and reroute real enemies; selling shortens their actual route',()=>{
 const game=createGame({mode:'maze',startingGold:1000,initialDelay:1000});game.start();const initial=game.state.mazeLength;
 const wall=game.build(600.25,390.75,'WALL');assert.equal(wall.ok,true);assert.equal(wall.towerId,-1);assert.equal(game.state.gold,980);assert.equal(game.state.towers.length,0);assert.ok(game.state.mazeLength>initial);
 assert.equal(hitTest(600.25,390.75,game.state.walls),-1);assert.equal(hitTest(600.25,340,game.state.walls),null);
 rejects(game,()=>game.upgrade(wall.towerId));game.launchWave();game.tick(2);
 const enemy=game.state.enemies[0],position={x:enemy.x,y:enemy.y};assert.equal(game.sell(wall.towerId).ok,true);assert.equal(game.state.mazeLength,initial);assert.equal(enemy.x,position.x);assert.equal(enemy.y,position.y);
 game.tick(.05);assert.ok(Math.hypot(enemy.x-position.x,enemy.y-position.y)<=enemy.speed*.05+1e-7);assert.equal(game.state.walls.length,0);assert.equal(game.state.gold,995);
 assert.equal(game.build(600,390,'WALL').towerId,-2);assert.equal(game.build(300,300,'T01').towerId,1);
});

test('maze rejects sealing the last path, covering active enemies, overlapping footprints and unaffordable walls atomically',()=>{
 const game=createGame({mode:'maze',startingGold:1000,initialDelay:1000});game.start();
 const barrier=Array.from({length:9},(_,i)=>[600+i%2*68,130+i*67.5]);for(const [x,y]of barrier.slice(0,-1))assert.equal(game.build(x,y,'WALL').ok,true);
 const [x,y]=barrier.at(-1);rejects(game,()=>game.build(x,y,'WALL'));assert.match(game.canBuild(x,y,'WALL').message,/最后通路/);
 game.launchWave();game.tick(2);const enemy=game.state.enemies[0];rejects(game,()=>game.build(enemy.x,enemy.y,'WALL'));
 const poor=createGame({mode:'maze',startingGold:19});poor.start();rejects(poor,()=>poor.build(300,300,'WALL'));
 for(const mode of ['loop','defense','escort']){const other=createGame({mode});other.start();rejects(other,()=>other.build(300,300,'WALL'));}
});

test('maze uses finite exit damage and clear-based waves, victory retains walls and research for endless',()=>{
 const game=createGame({mode:'maze',initialDelay:0,waveCount:1,waveSize:()=>1,enemySpeedScale:100,startingGold:1000});game.start();game.build(600,390,'WALL');game.startResearch('deployment');game.tick(1);
 assert.equal(game.state.phase,'victory');assert.equal(game.state.coreHealth,19);assert.equal(game.state.leaks,1);assert.equal(game.state.kills,0);assert.equal(game.state.gold,905);
 const research=game.state.research.remaining;game.tick(100);near(game.state.research.remaining,research);assert.equal(game.continueEndless().ok,true);assert.equal(game.state.walls.length,1);assert.equal(game.state.coreHealth,19);game.tick(.1);assert.ok(game.state.research.remaining<research);
 game.restart();assert.equal(game.state.walls.length,0);assert.equal(game.state.mazeLength,1180);assert.equal(game.state.tech.deployment,0);assert.equal(game.build(600,390,'WALL').towerId,-1);
 const paused=createGame({mode:'maze',initialDelay:0,waveSize:()=>1});paused.start();paused.tick(.1);assert.equal(paused.launchWave().ok,false);assert.equal(paused.state.enemies[0].x>MAZE_ENTRY.x,true);
});
