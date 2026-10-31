import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {TOWERS, ENEMIES, towerStats, effectiveTowerStats} from '../catalog.js';

test('arbitrary coordinates build exact positions with an allocated tower ID', () => {
 const game=createGame();
 assert.equal(game.canBuild(190.25,140.5,'T01').ok,false);
 game.start();
 assert.equal(game.canBuild(190.25,140.5,'T01').ok,true);
 const built=game.build(190.25,140.5,'T01');
 assert.equal(built.ok,true);assert.equal(built.towerId,1);
 assert.equal(game.state.gold,300);
 assert.equal(game.state.towers[0].x,190.25);assert.equal(game.state.towers[0].y,140.5);
 assert.equal('slotId' in game.state.towers[0],false);
});

test('placement rejects roads, hub, edges, nonfinite inputs and overlapping footprints without side effects', () => {
 const game=createGame({startingGold:10000});game.start();
 const invalid=[ [300,300], [640,140], [400,400], [640,340], [540,330],
  [154,140], [1126,140], [190,124], [190,676], [390,170], [250,300],
  [-100,140], [NaN,140], [190,Infinity], [Infinity,NaN] ];
 const before=game.state.gold;
 for(let repeat=0;repeat<3;repeat++)for(const [x,y] of invalid){
  const preview=game.canBuild(x,y,'T01');assert.equal(preview.ok,false,`${x},${y}`);
  assert.deepEqual(game.build(x,y,'T01'),preview);
 }
 assert.equal(game.build(190,140,'unknown').ok,false);
 assert.equal(game.state.gold,before);assert.deepEqual(game.state.towers,[]);assert.deepEqual(game.drainEvents(),[]);
 assert.equal(game.build(190,140,'T01').towerId,1);
 for(const [x,y] of [[190,140],[287,140],[190,197]]){
  assert.equal(game.canBuild(x,y,'T01').ok,false);assert.equal(game.build(x,y,'T01').ok,false);
 }
 assert.equal(game.build(390.75,140.25,'T03').towerId,2);
 assert.equal(game.state.towers.length,2);
 assert.equal(game.build(155,125,'T01').ok,false); // This legal boundary point overlaps the first tower.
 const boundary=createGame();boundary.start();
 assert.equal(boundary.build(155,125,'T01').ok,true);
 assert.equal(boundary.build(1125,675,'T01').ok,true);
});

test('repeated unaffordable commands preserve money and the next successful tower ID', () => {
 const game=createGame({startingGold:200});game.start();
 const first=game.build(190,140,'T01').towerId;
 for(let repeat=0;repeat<5;repeat++){
  assert.deepEqual(game.canBuild(390,140,'T03'),{ok:false,message:'金币不足'});
  assert.deepEqual(game.build(390,140,'T03'),{ok:false,message:'金币不足'});
 }
 assert.equal(game.state.gold,100);assert.equal(game.state.towers.length,1);
 assert.equal(game.sell(first).ok,true);
 assert.equal(game.build(390,140,'T01').towerId,2);
});

test('tower IDs select the correct unit through upgrades, sale, rebuilding and restart', () => {
 const game=createGame({startingGold:10000});game.start();
 assert.equal(TOWERS.length,12);assert.equal(ENEMIES.length,12);
 const first=game.build(190,140,'T01').towerId;
 const second=game.build(390,140,'T03').towerId;
 const initialDamage=towerStats(game.state.towers[0]).damage;
 for(let i=0;i<4;i++)assert.equal(game.upgrade(first).ok,true);
 assert.equal(game.upgrade(first).ok,false);
 assert.equal(game.state.towers[0].level,5);assert.equal(game.state.towers[1].level,1);
 assert.ok(towerStats(game.state.towers[0]).damage>initialDamage);
 const refund=towerStats(game.state.towers[0]).sellValue,before=game.state.gold;
 assert.equal(game.sell(first).ok,true);assert.equal(game.state.gold,before+refund);
 const rebuilt=game.build(190,140,'T12').towerId;
 assert.ok(rebuilt>second);assert.equal(game.upgrade(first).ok,false);assert.equal(game.sell(first).ok,false);
 assert.equal(game.upgrade(second).ok,true);assert.equal(game.state.towers.find(t=>t.id===second).level,2);
 game.launchWave();game.tick(.1);
 assert.equal(game.build(490,140,'T01').towerId,4); // Enemy spawning uses a separate ID sequence.
 game.togglePause();game.setSpeed(3);game.restart();
 assert.equal(game.state.gold,10000);assert.equal(game.state.paused,false);assert.equal(game.state.speed,1);
 assert.deepEqual(game.state.towers,[]);assert.deepEqual(game.state.enemies,[]);assert.equal(game.state.wave,0);
 assert.equal(game.build(190,140,'T01').towerId,1);
});

test('surviving enemies loop and overlap waves, pause freezes and large ticks stop at the cap', () => {
 const game=createGame({initialDelay:0,waveInterval:3,spawnInterval:.1,waveSize:()=>1,enemySpeedScale:20,limit:4});game.start();
 game.tick(.2);
 assert.equal(game.state.enemies.length,1);
 const id=game.state.enemies[0].id;
 game.togglePause(); const frozen=game.state.elapsed;game.tick(10);assert.equal(game.state.elapsed,frozen);game.togglePause();
 game.setSpeed(3); game.tick(1);assert.ok(game.state.elapsed>3);
 assert.ok(game.state.enemies.some(enemy=>enemy.id===id));
 assert.ok(game.state.enemies[0].progress>3800);
 assert.ok(game.state.enemies.length>=2);
 game.tick(100);assert.equal(game.state.phase,'defeat');assert.equal(game.state.enemies.length,4);
 const stopped=game.state.elapsed;game.tick(100);assert.equal(game.state.elapsed,stopped);
 assert.equal(game.drainEvents().filter(e=>e.type==='defeat').length,1);
});

test('one enemy traverses both rings, cross and spokes then returns past the entry', () => {
 const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>1});game.start();
 // Visible coordinate windows on the locked 9352-pixel patrol, at 86 pixels/second.
 const checkpoints=[
  [10,930,940,59,61], [16,1203,1205,300,315], [25,850,870,739,741],
  [40,75,77,225,245], [50,638,642,175,185], [54,950,960,209,211],
  [58,979,981,520,535], [65,435,450,589,591], [70,299,301,295,305],
  [76,639,641,290,302], [78,700,720,399,401], [84,1203,1205,415,425], [90,1000,1015,739,741],
  [96,639,641,585,600], [98,639,641,415,425], [102,310,325,399,401], [109,95,105,59,61],
 ];
 let previousTime=0,previousProgress=0,id;
 for(const [time,minX,maxX,minY,maxY] of checkpoints){
  game.tick(time-previousTime);previousTime=time;
  assert.equal(game.state.enemies.length,1);const enemy=game.state.enemies[0];id??=enemy.id;
  assert.equal(enemy.id,id);
  assert.ok(enemy.x>=minX&&enemy.x<=maxX&&enemy.y>=minY&&enemy.y<=maxY,`patrol position at ${time}s: ${enemy.x},${enemy.y}`);
  assert.ok(enemy.progress>previousProgress);previousProgress=enemy.progress;
 }
 assert.ok(game.state.enemies[0].progress>9352);
 assert.equal(game.state.kills,0);assert.equal(game.state.phase,'playing');
});

test('automatic fire kills targets once and awards gold through visible combat events', () => {
 const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>3,spawnInterval:.1,enemyHealthScale:.3});game.start();game.build(190,140,'T01');
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
 if(code)game.build(190,140,code);
 if(support)game.build(390,140,support);
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
 const game=createGame({initialDelay:100});game.start();game.build(190,140,'T11');const gold=game.state.gold;game.tick(8.1);
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
 for(let y=140;y<=660;y+=60)for(let x=170;x<=1110;x+=100)if(game.canBuild(x,y,'T04').ok)game.build(x,y,'T04');
 assert.ok(game.state.towers.length>20,'valid packing has no legacy 20-tower cap');
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
 assert.equal(game.build(190,140,'T01').ok,false);game.start();game.build(190,140,'T01');
 game.build(390,140,'T03');const gold=game.state.gold;
 assert.deepEqual(game.canBuild(490,140,'T05'),{ok:false,message:'金币不足'});
 assert.equal(game.build(490,140,'T05').ok,false);assert.equal(game.upgrade(1).ok,false);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,true);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,false);game.tick(.1);
 assert.equal(game.state.phase,'playing');assert.equal(game.state.kills,1);
 game.tick(5);assert.equal(game.state.phase,'victory');assert.equal(game.state.kills,3);
 assert.equal(game.build(490,140,'T01').ok,false);assert.equal(game.sell(1).ok,false);
 game.restart();assert.equal(game.state.wave,0);game.tick(.1);assert.equal(game.state.wave,0);
});

test('normal economy supports a 20-wave clear using only coordinate purchases, upgrades and elapsed player time', () => {
 const game=createGame();game.start();
 const plan=[[190.25,140.5,'T01'],[390.75,140.25,'T03'],[490.5,140.75,'T05'],[190.5,200.25,'T04'],[190.75,260.5,'T03'],[190.25,320.75,'T04']];
 for(let elapsed=0;elapsed<1000&&game.state.phase==='playing';elapsed+=.5){
  const next=plan.find(([x,y])=>!game.state.towers.some(t=>t.x===x&&t.y===y));
  if(next&&game.canBuild(...next).ok)assert.equal(game.build(...next).ok,true);
  if(game.state.towers.length>=6){const tower=game.state.towers.find(t=>t.level<5);if(tower)game.upgrade(tower.id);}
  game.tick(.5);game.drainEvents();
 }
 assert.equal(game.state.phase,'victory');assert.equal(game.state.wave,20);assert.equal(game.state.kills,624);
 assert.equal(game.state.towers.length,6);
});
