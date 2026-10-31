import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {TOWERS, ENEMIES, towerStats, effectiveTowerStats} from '../catalog.js';
import {hitTest} from '../render.js';

function researchTo(game,kind,target) {
 const durations=kind==='deployment'?[0,12,20,30]:[0,10,15,20,25];
 while(game.state.tech[kind]<target){
  assert.equal(game.startResearch(kind).ok,true);
  game.tick(durations[game.state.tech[kind]+1]);
 }
}
function unlockAll(game){researchTo(game,'deployment',3);researchTo(game,'reinforcement',4);}


test('adjacent free-placed tower bases select and operate on the intended building', () => {
 const game=createGame({startingGold:10000,initialDelay:1000});game.start();researchTo(game,'reinforcement',1);
 const upper=game.build(190,140,'T01'),lower=game.build(190,200,'T06');
 assert.equal(upper.ok,true);assert.equal(lower.ok,true);
 const selected=hitTest(190,140,game.state.towers);
 assert.equal(selected,upper.towerId);
 assert.equal(game.upgrade(selected).ok,true);
 assert.equal(game.state.towers.find(t=>t.id===upper.towerId).level,2);
 assert.equal(game.state.towers.find(t=>t.id===lower.towerId).level,1);
 assert.equal(game.sell(selected).ok,true);
 assert.deepEqual(game.state.towers.map(t=>t.id),[lower.towerId]);
 assert.equal(hitTest(190,200,game.state.towers),lower.towerId);
 assert.equal(hitTest(190,160,game.state.towers),lower.towerId);
});

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
 assert.equal(game.build(390.75,140.25,'T06').towerId,2);
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
  assert.deepEqual(game.canBuild(390,140,'T06'),{ok:false,message:'金币不足'});
  assert.deepEqual(game.build(390,140,'T06'),{ok:false,message:'金币不足'});
 }
 assert.equal(game.state.gold,100);assert.equal(game.state.towers.length,1);
 assert.equal(game.sell(first).ok,true);
 assert.equal(game.build(390,140,'T01').towerId,2);
});

test('tower IDs select the correct unit through upgrades, sale, rebuilding and restart', () => {
 const game=createGame({startingGold:10000,initialDelay:1000});game.start();unlockAll(game);
 assert.equal(TOWERS.length,12);assert.equal(ENEMIES.length,12);
 const first=game.build(190,140,'T01').towerId;
 const second=game.build(390,140,'T06').towerId;
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

function seededRandom(seed) {
 return () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}

test('enemies randomly continue or turn at a junction, deciding only upon arrival', () => {
 for(const [choice,expected] of [[0,[572,210]],[.999,[640,142]]]){
  let decisions=0;
  const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>1,random:()=>decisions++===0?0:choice});game.start();
  game.tick(2);assert.equal(decisions,1,'only the birth direction has been drawn');
  game.tick(1);const enemy=game.state.enemies[0];
  assert.equal(decisions,2);
  assert.ok(Math.abs(enemy.x-expected[0])<.001&&Math.abs(enemy.y-expected[1])<.001);
  assert.ok(enemy.progress>250);assert.equal(game.state.kills,0);
 }
});

test('returning to the central crossing offers three onward exits without reversing', () => {
 for(const [choice,expected,angle] of [[0,[640,316],-Math.PI/2],[.5,[640,484],Math.PI/2],[.999,[724,400],0]]){
  const choices=[0,.999,0,.999,.999,choice];let decisions=0;
  const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>1,random:()=>choices[decisions++]});game.start();
  game.tick(22);const enemy=game.state.enemies[0];
  assert.equal(decisions,6);
  assert.ok(Math.abs(enemy.x-expected[0])<.001&&Math.abs(enemy.y-expected[1])<.001,`${enemy.x},${enemy.y}`);
  assert.equal(enemy.angle,angle);
 }
});

test('random walkers stay on roads through repeated junctions, pause, high speed and restart', () => {
 // Explicit visible road coordinates keep this check independent of the graph builder.
 const onRoad=(x,y)=>
  ((y===60||y===740)&&x>=76&&x<=1204)||((x===76||x===1204)&&y>=60&&y<=740)||
  ((y===210||y===590)&&x>=300&&x<=980)||((x===300||x===980)&&y>=210&&y<=590)||
  (x===640&&y>=60&&y<=740)||(y===400&&x>=76&&x<=1204);
 const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>6,spawnInterval:.02,enemySpeedScale:20,random:seededRandom(42)});game.start();
 game.tick(.5);game.togglePause();const frozen=game.state.enemies.map(e=>[e.x,e.y,e.angle,e.progress]);
 game.tick(5);assert.deepEqual(game.state.enemies.map(e=>[e.x,e.y,e.angle,e.progress]),frozen);game.togglePause();
 const seen=new Set();let previous=game.state.enemies.map(e=>[e.x,e.y]);
 for(let i=0;i<800;i++){
  game.tick(.05);
  for(const [index,enemy] of game.state.enemies.entries()){
   assert.ok(onRoad(enemy.x,enemy.y),`off road: ${enemy.x},${enemy.y}`);
   assert.ok(Math.hypot(enemy.x-previous[index][0],enemy.y-previous[index][1])<=enemy.speed*.05+.001,'no teleport at junction');
   if(enemy.x===640&&enemy.y>210&&enemy.y<590)seen.add('cross');
   if((enemy.y===210||enemy.y===590)&&enemy.x>300&&enemy.x<980)seen.add('inner');
   if(enemy.y===60||enemy.y===740||enemy.x===76||enemy.x===1204)seen.add('outer');
  }
  previous=game.state.enemies.map(e=>[e.x,e.y]);
 }
 assert.deepEqual([...seen].sort(),['cross','inner','outer']);
 assert.equal(game.state.enemies.length,6);assert.ok(game.state.enemies.every(e=>e.progress>e.speed*39.9));
 assert.ok(new Set(game.state.enemies.map(e=>`${e.x},${e.y}`)).size>1);
 game.restart();game.tick(.05);
 assert.equal(game.state.enemies[0].id,1);assert.ok(Math.abs(Math.hypot(game.state.enemies[0].x-640,game.state.enemies[0].y-400)-86)<.001);assert.ok(onRoad(game.state.enemies[0].x,game.state.enemies[0].y));
 const fast=createGame({initialDelay:0,waveCount:1,waveSize:()=>1,enemySpeedScale:2000,random:()=>.999});fast.start();fast.tick(.05);
 const enemy=fast.state.enemies[0];assert.ok(Math.abs(enemy.progress-8600)<.001);assert.ok(onRoad(enemy.x,enemy.y));
});

test('automatic fire kills targets once and awards gold through visible combat events', () => {
 const game=createGame({initialDelay:0,waveCount:1,waveSize:()=>3,spawnInterval:.1,enemyHealthScale:.3,random:()=>0});game.start();game.build(500,300,'T01');
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
 const game=createGame({startingGold:10000,initialDelay:1000,waveCount:1,waveSize:()=>4,spawnInterval:.02,enemyHealthScale:100,random:()=>0});game.start();unlockAll(game);game.launchWave();game.tick(.2);
 if(code)game.build(500,300,code);
 if(support)game.build(400,300,support);
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
 const game=createGame({startingGold:10000,initialDelay:1000});game.start();researchTo(game,'deployment',1);researchTo(game,'reinforcement',1);game.build(500,300,'T11');const gold=game.state.gold;game.tick(8.1);
 assert.equal(game.state.gold,gold+12);
 assert.ok(game.drainEvents().some(e=>e.type==='income'&&e.amount===12));
 assert.equal(game.upgrade(1).ok,true);const upgradedGold=game.state.gold;game.tick(8);
 assert.equal(game.state.gold,upgradedGold+20);assert.equal(towerStats(game.state.towers[0]).interval,8);
});

test('20 scheduled waves include four persistent bosses; victory waits for final spawn and clear, then endless retains economy', () => {
 const game=createGame({startingGold:100000,initialDelay:1000,waveInterval:.3,spawnInterval:.02,waveSize:()=>1,enemyHealthScale:.05,random:seededRandom(7)});game.start();unlockAll(game);game.launchWave();
 game.tick(6.2);
 assert.equal(game.state.wave,20);
 assert.equal(game.state.enemies.filter(e=>e.boss).length,4);
 assert.equal(game.state.phase,'playing');
 game.tick(100);
 assert.equal(game.state.phase,'playing');
 assert.equal(game.state.enemies.filter(e=>e.boss).length,4);
 for(let y=140;y<=660;y+=60)for(let x=170;x<=1110;x+=100)if(game.canBuild(x,y,'T04').ok)game.build(x,y,'T04');
 assert.equal(game.state.towers.length,20,'deployment research caps the freely placed army at 20');assert.equal(game.canBuildType('T04').ok,false);
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
 const game=createGame({waveCount:1,waveSize:()=>3,spawnInterval:2,enemyHealthScale:.1,random:()=>0});
 assert.equal(game.build(500,300,'T01').ok,false);game.start();game.build(500,300,'T01');
 game.build(780,300,'T06');game.build(500,500,'T01');const gold=game.state.gold;
 assert.deepEqual(game.canBuild(780,500,'T02'),{ok:false,message:'金币不足'});
 assert.equal(game.build(780,500,'T02').ok,false);assert.equal(game.upgrade(1).ok,false);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,true);assert.equal(game.state.gold,gold);
 assert.equal(game.launchWave().ok,false);game.tick(.1);
 assert.equal(game.state.phase,'playing');assert.equal(game.state.kills,1);
 game.tick(5);assert.equal(game.state.phase,'victory');assert.equal(game.state.kills,3);
 assert.equal(game.build(780,500,'T01').ok,false);assert.equal(game.sell(1).ok,false);
 game.restart();assert.equal(game.state.wave,0);game.tick(.1);assert.equal(game.state.wave,0);
});

test('normal economy clears 20 waves with paid research, coordinate purchases and manual upgrades', () => {
 for(const seed of [1,42,2026]){
  const game=createGame({random:seededRandom(seed)});game.start();
  for(const point of [[500,300,'T01'],[780,300,'T01'],[500,500,'T01']])assert.equal(game.build(...point).ok,true);
  const plan=[[780,500,'T03'],[400,300,'T11'],[880,300,'T03'],[400,500,'T03'],[880,500,'T03']];
  for(let elapsed=0;elapsed<1000&&game.state.phase==='playing';elapsed+=.5){
   const state=game.state;
   if(state.tech.reinforcement===0)game.startResearch('reinforcement');
   else if(state.towers[0].level<2)game.upgrade(state.towers[0].id);
   else if(state.tech.deployment<1)game.startResearch('deployment');
   else {
    const next=plan.find(([x,y])=>!state.towers.some(t=>t.x===x&&t.y===y));
    if(next&&game.canBuild(...next).ok)assert.equal(game.build(...next).ok,true);
    else if(!next){
     const upgrade=state.towers.find(t=>t.level<=state.tech.reinforcement);
     if(upgrade)game.upgrade(upgrade.id);
     else if(state.tech.reinforcement<4)game.startResearch('reinforcement');
    }
   }
   game.tick(.5);game.drainEvents();
  }
  assert.equal(game.state.phase,'victory',`seed ${seed}`);assert.equal(game.state.wave,20);assert.equal(game.state.kills,624);
  assert.deepEqual(game.state.tech,{deployment:1,reinforcement:4});assert.equal(game.state.towers.length,8);
 }
});
