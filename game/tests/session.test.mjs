import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {TOWERS, ENEMIES, towerStats, effectiveTowerStats} from '../catalog.js';

test('player builds, upgrades five levels, sells and restarts a clean session', () => {
  const game = createGame({startingGold:10000});
  assert.equal(game.state.phase, 'menu');
  game.start();
  assert.equal(TOWERS.length,12);
  assert.equal(ENEMIES.length,12);
  assert.equal(game.build(99,'T01').ok,false);
  assert.equal(game.build(1,'T01').ok,true);
  assert.equal(game.state.gold,9900);
  assert.equal(game.build(1,'T01').ok,false);
  assert.equal(game.build(2,'unknown').ok,false);
  const initialDamage = towerStats(game.state.towers[0]).damage;
  for(let i=0;i<4;i++) assert.equal(game.upgrade(1).ok,true);
  assert.equal(game.state.towers[0].level,5);
  assert.equal(game.upgrade(1).ok,false);
  assert.ok(towerStats(game.state.towers[0]).damage>initialDamage);
  const refund=towerStats(game.state.towers[0]).sellValue;
  const before=game.state.gold;
  assert.equal(game.sell(1).ok,true);
  assert.equal(game.state.gold,before+refund);
  assert.equal(game.state.towers.length,0);
  game.build(20,'T12'); game.togglePause(); game.setSpeed(3); game.restart();
  assert.equal(game.state.gold,10000);
  assert.equal(game.state.paused,false);
  assert.equal(game.state.speed,1);
  assert.deepEqual(game.state.towers,[]);
  assert.deepEqual(game.state.enemies,[]);
  assert.equal(game.state.wave,0);
});

test('surviving enemies loop and overlap waves, pause freezes and large ticks stop at the cap', () => {
 const game=createGame({initialDelay:0,waveInterval:3,spawnInterval:.1,waveSize:()=>1,enemySpeedScale:20,limit:4});game.start();
 game.tick(.2);
 assert.equal(game.state.enemies.length,1);
 const id=game.state.enemies[0].id;
 game.togglePause(); const frozen=game.state.elapsed;game.tick(10);assert.equal(game.state.elapsed,frozen);game.togglePause();
 game.setSpeed(3); game.tick(1);assert.ok(game.state.elapsed>3);
 assert.ok(game.state.enemies.some(enemy=>enemy.id===id));
 assert.ok(game.state.enemies[0].progress>2600);
 assert.ok(game.state.enemies.length>=2);
 game.tick(100);assert.equal(game.state.phase,'defeat');assert.equal(game.state.enemies.length,4);
 const stopped=game.state.elapsed;game.tick(100);assert.equal(game.state.elapsed,stopped);
 assert.equal(game.drainEvents().filter(e=>e.type==='defeat').length,1);
});

test('automatic fire kills targets once and awards gold through visible combat events', () => {
 const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>3,spawnInterval:.1,enemyHealthScale:.3});game.start();game.build(3,'T01');
 const gold=game.state.gold;game.tick(12);
 assert.equal(game.state.kills,3);
 assert.equal(game.state.gold,gold+24);
 assert.equal(game.state.enemies.length,0);
 const events=game.drainEvents();
 assert.ok(events.some(e=>e.type==='shot'));
 assert.ok(events.some(e=>e.type==='hit'));
 assert.equal(events.filter(e=>e.type==='kill').length,3);
 assert.deepEqual(game.drainEvents(),[]);
});

function combatSession(code, support) {
 const game=createGame({startingGold:10000,initialDelay:0,waveCount:1,waveSize:()=>4,spawnInterval:.02,enemyHealthScale:100});game.start();game.tick(.2);
 if(code)game.build(3,code);
 if(support)game.build(2,support);
 game.drainEvents();return game;
}
test('area weapons and chain lightning strike groups while single fire strikes one enemy', () => {
 for(const code of ['T03','T05','T06','T08']){
  const game=combatSession(code);game.tick(.05);
  assert.ok(game.state.enemies.filter(e=>e.hp<e.maxHp).length>=3,code);
 }
 const single=combatSession('T01');single.tick(.05);assert.equal(single.state.enemies.filter(e=>e.hp<e.maxHp).length,1);
});

test('control weapons and off-road engineering aura slow movement without blocking the loop', () => {
 const plain=combatSession();plain.tick(.5);const distance=plain.state.enemies[0].progress;
 for(const code of ['T02','T06','T07','T08','T12']) {
  const game=combatSession(code);game.tick(.5);
  assert.ok(game.state.enemies[0].progress<distance,code);
  game.tick(45);
  assert.ok(game.state.enemies[0].progress>200,`${code} eventually moves onward`);
 }
});

test('radar boosts damage, repair arm accelerates fire, supply produces gold', () => {
 const plain=combatSession('T01');plain.tick(1.8);
 const damage=plain.state.enemies.reduce((sum,e)=>sum+e.maxHp-e.hp,0);
 for(const support of ['T09','T10']) {
  const boosted=combatSession('T01',support);boosted.tick(1.8);
  assert.ok(boosted.state.enemies.reduce((sum,e)=>sum+e.maxHp-e.hp,0)>damage,support);
  const tower=boosted.state.towers.find(t=>t.code==='T01');
  const displayed=effectiveTowerStats(tower,boosted.state.towers);
  assert.equal(boosted.drainEvents().find(e=>e.type==='hit').amount,displayed.damage);
  if(support==='T09')assert.ok(displayed.range>towerStats(tower).range);
  if(support==='T10')assert.ok(displayed.interval<towerStats(tower).interval);
 }
 const game=createGame({initialDelay:100});game.start();game.build(1,'T11');const gold=game.state.gold;game.tick(8.1);
 assert.equal(game.state.gold,gold+12);
 assert.ok(game.drainEvents().some(e=>e.type==='income'&&e.amount===12));
 assert.equal(game.upgrade(1).ok,true);const upgradedGold=game.state.gold;game.tick(8);
 assert.equal(game.state.gold,upgradedGold+20);assert.equal(towerStats(game.state.towers[0]).interval,8);
});

test('20 scheduled waves include four persistent bosses; victory waits for final spawn and clear, then endless retains economy', () => {
 const game=createGame({startingGold:100000,initialDelay:0,waveInterval:.3,spawnInterval:.02,waveSize:()=>1,enemyHealthScale:.05});game.start();
 game.tick(6.2);
 assert.equal(game.state.wave,20);
 assert.equal(game.state.enemies.filter(e=>e.boss).length,4);
 assert.equal(game.state.phase,'playing');
 game.tick(100);
 assert.equal(game.state.phase,'playing');
 assert.equal(game.state.enemies.filter(e=>e.boss).length,4);
 for(let slot=1;slot<=20;slot++)game.build(slot,'T04');
 game.tick(120);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.kills,24);
 assert.equal(game.drainEvents().filter(e=>e.type==='victory').length,1);
 const gold=game.state.gold;const towers=game.state.towers.map(t=>t.id);
 assert.equal(game.continueEndless().ok,true);
 assert.equal(game.state.phase,'playing');assert.equal(game.state.gold,gold);
 assert.deepEqual(game.state.towers.map(t=>t.id),towers);
 game.tick(.4);assert.ok(game.state.wave>20);assert.equal(game.state.endless,true);
 game.restart();assert.equal(game.state.endless,false);assert.equal(game.state.kills,0);
});

test('funds and session phase guard commands; early launch awards no gold and cannot skip a pending queue', () => {
 const game=createGame({waveCount:1,waveSize:()=>3,spawnInterval:2,enemyHealthScale:.1});
 assert.equal(game.build(3,'T01').ok,false);game.start();game.build(3,'T01');
 game.build(4,'T03');const gold=game.state.gold;
 assert.equal(game.build(2,'T05').ok,false);assert.equal(game.upgrade(3).ok,false);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,true);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,false);game.tick(.1);
 assert.equal(game.state.phase,'playing');assert.equal(game.state.kills,1);
 game.tick(5);assert.equal(game.state.phase,'victory');assert.equal(game.state.kills,3);
 assert.equal(game.build(2,'T01').ok,false);assert.equal(game.sell(3).ok,false);
 game.restart();assert.equal(game.state.wave,0);game.tick(.1);assert.equal(game.state.wave,0);
});

test('normal economy supports a 20-wave clear using only purchases, upgrades and elapsed player time', () => {
 const game=createGame();game.start();
 const plan=[[3,'T01'],[4,'T03'],[2,'T05'],[1,'T04'],[19,'T04'],[20,'T03'],[11,'T04'],[12,'T03'],[7,'T05'],[8,'T04'],[6,'T03'],[5,'T04'],[10,'T03'],[9,'T04'],[17,'T04'],[18,'T03'],[13,'T04'],[14,'T03'],[15,'T04'],[16,'T03']];
 for(let elapsed=0;elapsed<1000&&game.state.phase==='playing';elapsed+=.5){
  const next=plan.find(([slot])=>!game.state.towers.some(t=>t.slotId===slot));
  if(next)game.build(...next);
  if(game.state.towers.length>=6){const tower=game.state.towers.find(t=>t.level<5);if(tower)game.upgrade(tower.slotId);}
  game.tick(.5);game.drainEvents();
 }
 assert.equal(game.state.phase,'victory');assert.equal(game.state.wave,20);assert.equal(game.state.kills,624);
});
