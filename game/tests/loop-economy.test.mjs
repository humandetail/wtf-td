import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {LOOP_TOWERS} from '../loop-catalog.js';

test('opening bankroll supports the four available roles with room for initial research',()=>{
 const g=createGame();g.start();const four=['T01','T12','T06','T13'].reduce((sum,code)=>sum+LOOP_TOWERS.find(t=>t.code===code).price,0);
 assert.ok(g.state.gold>=four+g.technologies.reinforcement.levels[1].cost,`opening gold ${g.state.gold} cannot fund four roles (${four}) plus first reinforcement`);
});
test('early loop wave clock leaves time to earn and reinvest before wave ten',()=>{
 const g=createGame({limit:100000,enemySpeedScale:0});g.start();
 for(let i=0;i<1000&&g.state.wave<10;i++)g.tick(.5);
 assert.ok(g.state.elapsed>=360,`wave ten starts after only ${g.state.elapsed.toFixed(1)} seconds`);
});
test('a normal wave pays its clear grant once after all spawns and deaths, not when merely launched',()=>{
 const g=createGame({waveCount:1,waveSize:()=>1,startingGold:1000,enemySpeedScale:0,enemyHealthScale:.001});g.start();g.build(500,300,'T01');const before=g.state.gold;
 g.launchWave();assert.equal(g.state.gold,before);g.tick(5);
 assert.equal(g.state.phase,'victory');const events=g.drainEvents();assert.equal(events.filter(e=>e.type==='wave-clear').length,1);assert.equal(events.find(e=>e.type==='wave-clear').amount,60);
 const gold=g.state.gold;g.tick(100);assert.equal(g.state.gold,gold);
});

test('overlapping waves earn separate clear grants with no endless grants',()=>{
 const g=createGame({waveSize:()=>2,spawnInterval:.02,limit:10000,enemySpeedScale:0,initialDelay:10000});g.start();
 g.launchWave();g.tick(.1);const first=[...g.state.enemies];g.launchWave();g.tick(.1);const second=g.state.enemies.filter(e=>e.wave===2);
  // Finish through production combat rather than a disconnected emitter.
  g.state.towers.push({id:99,code:'T01',level:5,route:'B',x:500,y:300,spent:100,cycles:0,cooldown:0});
  for(const e of [...first,...second]){e.hp=1;e.shield=0;e.x=550;e.y=300;}
  g.tick(.2);const paid=g.drainEvents().filter(e=>e.type==='wave-clear');assert.equal(paid.length,2);assert.deepEqual(paid.map(e=>e.wave).sort(),[1,2]);
  const gold=g.state.gold;g.tick(1);assert.equal(g.state.gold,gold);
  g.state.phase='victory';g.continueEndless();g.launchWave();g.tick(.1);for(const e of g.state.enemies){e.hp=1;e.shield=0;e.x=550;e.y=300;}g.state.towers[0].cooldown=0;g.tick(.2);
  assert.equal(g.drainEvents().filter(e=>e.type==='wave-clear').length,0);
});

test('normal resources support six towers by wave ten even with forty seconds between purchases',async()=>{
 const {playLoopStrategy}=await import('../qa/loop-strategy.mjs');
 const r=playLoopStrategy(1,'physical',{decisionInterval:40,stopAtWave:10}),tenth=r.milestones.find(m=>m.wave===10);
 assert.ok(tenth);assert.ok(tenth.towers>=6,JSON.stringify(tenth));assert.ok(r.income.clear>0);assert.ok(r.reconciled);
});

test('boss must also die before a boss wave receives its clear grant',()=>{
 const g=createGame({waveCount:5,waveSize:()=>1,spawnInterval:.02,enemySpeedScale:0,initialDelay:10000});g.start();
 for(let w=1;w<=5;w++){assert.ok(g.launchWave().ok);g.tick(.1);}
 const boss=g.state.enemies.find(e=>e.boss);assert.ok(boss);
 g.state.towers.push({id:99,code:'T01',level:5,route:'B',x:500,y:300,spent:100,cycles:0,cooldown:0});
 for(const e of g.state.enemies){e.hp=1;e.shield=0;e.x=e.boss?1000:550;e.y=300;}
 g.tick(.1);assert.equal(g.drainEvents().filter(e=>e.type==='wave-clear'&&e.wave===5).length,0);
 boss.x=550;g.state.towers[0].cooldown=0;g.tick(.1);assert.equal(g.drainEvents().filter(e=>e.type==='wave-clear'&&e.wave===5).length,1);
});
