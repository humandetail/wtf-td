import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {MODE_DETAILS,HARVEST_SITES,HARVEST_TARGET,HARVEST_DURATION,EXTRACTION_DURATION,SURVIVAL_DURATION,PULSE_COOLDOWN} from '../modes.js';
import {playMission} from '../qa/mission-strategies.mjs';

test('both missions complete through paid public commands with default 400 gold and enemy stats',()=>{
 for(const mode of ['harvest','storm']){
  const {state,pulses}=playMission(mode);
  assert.equal(state.phase,'victory',mode);assert.ok(state.coreHealth>0);assert.ok(state.tech.reinforcement>0);
  if(mode==='harvest'){assert.equal(state.harvested,240);assert.equal(state.extractionRemaining,0);near(state.elapsed,200);assert.deepEqual(state.deposits,[0,0,3]);}
  else {near(state.elapsed,360);assert.equal(state.survivalRemaining,0);assert.ok(pulses>0);assert.equal(state.towers.length,6);}
 }
});

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function readyHarvest(options={}){
 const game=createGame({mode:'harvest',harvestDuration:.1,extractionDuration:.2,enemySpeedScale:0,...options});game.start();
 for(const site of [0,1]){assert.equal(game.startHarvest(site).ok,true);game.tick(.3);}
 assert.equal(game.state.harvested,240);return game;
}
function unchanged(game,command){const before=JSON.stringify(game.state);assert.equal(command().ok,false);assert.equal(JSON.stringify(game.state),before);}

test('formal mission constants and defaults are shared and commands reject incorrect sessions',()=>{
 assert.deepEqual(Object.keys(MODE_DETAILS),['loop','defense','harvest','storm']);assert.deepEqual(HARVEST_SITES.map(site=>site.lane),[0,1,2]);
 assert.deepEqual([HARVEST_TARGET,HARVEST_DURATION,EXTRACTION_DURATION,SURVIVAL_DURATION,PULSE_COOLDOWN],[240,30,20,360,30]);
 for(const mode of Object.keys(MODE_DETAILS)){
  const game=createGame({mode});assert.equal(game.state.gold,400);assert.equal(game.state.coreHealth,20);assert.equal(game.state.nextWaveIn,18);
  unchanged(game,()=>game.startHarvest(0));unchanged(game,()=>game.stopHarvest());unchanged(game,()=>game.evacuate());unchanged(game,()=>game.pulse());
  game.start();if(mode!=='harvest')unchanged(game,()=>game.startHarvest(0));if(mode!=='storm')unchanged(game,()=>game.pulse());
 }
 const harvest=createGame({mode:'harvest'});harvest.start();harvest.startHarvest(0);assert.equal(harvest.state.harvest.remaining,30);
 assert.equal(createGame({mode:'storm'}).state.survivalRemaining,360);
});

test('harvest requires active selection; switching/stopping discards only unfinished work and exhausted sites reject',()=>{
 const game=createGame({mode:'harvest',harvestDuration:1,initialDelay:1000});game.start();game.tick(3);assert.equal(game.state.harvested,0);
 for(const index of [-1,3,NaN,.5,'0'])unchanged(game,()=>game.startHarvest(index));
 assert.equal(game.startHarvest(0).ok,true);game.tick(.6);unchanged(game,()=>game.startHarvest(0));
 assert.equal(game.startHarvest(1).ok,true);near(game.state.harvest.remaining,1);game.tick(.4);assert.equal(game.state.harvested,0);
 assert.equal(game.stopHarvest().ok,true);unchanged(game,()=>game.stopHarvest());game.startHarvest(0);game.tick(1);
 assert.equal(game.state.harvested,40);assert.equal(game.state.gold,460);assert.deepEqual(game.state.deposits,[2,3,3]);
 game.tick(2);assert.equal(game.state.harvested,120);assert.equal(game.state.gold,580);assert.deepEqual(game.state.deposits,[0,3,3]);assert.equal(game.state.harvest,null);
 unchanged(game,()=>game.startHarvest(0));unchanged(game,()=>game.evacuate());game.tick(4);assert.equal(game.state.harvested,120);
 assert.equal(game.drainEvents().filter(event=>event.type==='harvest-complete').length,3);
});

test('harvest timed waves follow the current site and every queued enemy retains its original lane',()=>{
 const game=createGame({mode:'harvest',enemySpeedScale:0,waveInterval:1,spawnInterval:.65,harvestDuration:1000});game.start();game.startHarvest(2);game.launchWave();
 game.tick(.05);assert.equal(game.state.enemies[0].lane,2);game.startHarvest(1);game.tick(1.95);assert.equal(game.state.wave,3);
 game.tick(3);assert.ok(game.state.enemies.filter(enemy=>enemy.id<=7).every(enemy=>enemy.lane===2));
 assert.equal(game.state.gold,400);assert.equal(game.drainEvents().filter(event=>event.type==='wave-clear').length,0);
 const idle=createGame({mode:'harvest',enemySpeedScale:0,spawnInterval:.02});idle.start();
 for(let wave=1;wave<=5;wave++){assert.equal(idle.launchWave().ok,true);idle.tick(.5);assert.equal(idle.state.attackLane,(wave-1)%4);}
 assert.equal(idle.state.enemies.length,46);assert.equal(idle.state.enemies.filter(enemy=>enemy.boss).length,1);
});

test('evacuation is active, locks collection and wave launching, immediately ambushes all four lanes, and wins without clearing',()=>{
 const game=readyHarvest();assert.equal(game.state.phase,'playing');assert.equal(game.state.extractionRemaining,null);
 game.startHarvest(2);assert.equal(game.evacuate().ok,true);assert.equal(game.state.harvest,null);assert.equal(game.state.enemies.length,24);
 for(let lane=0;lane<4;lane++)assert.equal(game.state.enemies.filter(enemy=>enemy.lane===lane&&!enemy.boss).length,6);
 unchanged(game,()=>game.startHarvest(2));unchanged(game,()=>game.stopHarvest());unchanged(game,()=>game.evacuate());unchanged(game,()=>game.launchWave());
 game.tick(100);assert.equal(game.state.phase,'victory');near(game.state.elapsed,.8);assert.equal(game.state.enemies.length,24);near(game.state.extractionRemaining,0);assert.equal(game.state.wave,0);
 unchanged(game,()=>game.continueEndless());unchanged(game,()=>game.startHarvest(2));game.tick(100);near(game.state.elapsed,.8);
 assert.equal(game.drainEvents().filter(event=>event.type==='victory').length,1);
});

test('core failure during evacuation wins the race against a large tick and gives no kill income',()=>{
 const game=readyHarvest({coreHealth:1,enemySpeedScale:1000,extractionDuration:.05});game.evacuate();const gold=game.state.gold;game.tick(1);
 assert.equal(game.state.phase,'defeat');assert.equal(game.state.coreHealth,0);assert.equal(game.state.kills,0);assert.equal(game.state.gold,gold);
 unchanged(game,()=>game.evacuate());assert.equal(game.drainEvents().filter(event=>event.type==='defeat').length,1);
});

test('storm waves spawn opposite lane pairs and exactly one boss every fifth wave',()=>{
 const game=createGame({mode:'storm',enemySpeedScale:0,spawnInterval:.02,initialDelay:1000});game.start();
 let previous=0;
 for(let wave=1;wave<=5;wave++){
  assert.equal(game.launchWave().ok,true);game.tick(.3);
  const enemies=game.state.enemies.slice(previous),lanes=wave%2?[0,2]:[1,3],count=4+Math.floor(wave/2);
  for(const lane of lanes)assert.equal(enemies.filter(enemy=>enemy.lane===lane&&!enemy.boss).length,count);
  assert.equal(enemies.filter(enemy=>enemy.boss).length,wave%5===0?1:0);previous=game.state.enemies.length;
 }
 assert.equal(game.state.wave,5);assert.equal(game.state.gold,400);
});

test('storm speed changes by 25 percent in the last twenty seconds; supply follows elapsed time independently of clearing',()=>{
 const game=createGame({mode:'storm',enemySpeedScale:.01,initialDelay:1000});game.start();game.launchWave();game.tick(38);
 const enemy=game.state.enemies[0],start=enemy.progress;game.tick(1);const normal=enemy.progress-start;
 assert.equal(game.state.stormActive,false);game.tick(1.1);assert.equal(game.state.stormActive,true);
 const before=enemy.progress;game.tick(1);near(enemy.progress-before,normal*1.25);
 assert.equal(game.state.gold,445);game.tick(19);assert.equal(game.state.stormActive,false);assert.equal(game.state.gold,490);
 const events=game.drainEvents();assert.equal(events.filter(event=>event.type==='supply').length,2);assert.equal(events.filter(event=>event.type==='wave-clear').length,0);
});

test('pulse rejects empty/cooling sessions, damages normal and boss proportionately, roots and rewards kills',()=>{
 const game=createGame({mode:'storm',enemySpeedScale:0,initialDelay:1000,waveInterval:1000,spawnInterval:.02});game.start();unchanged(game,()=>game.pulse());
 for(let wave=1;wave<=5;wave++){game.launchWave();game.tick(.3);}
 const normal=game.state.enemies[0],boss=game.state.enemies.find(enemy=>enemy.boss);game.togglePause();assert.equal(game.pulse().ok,true);
 near(normal.hp,normal.maxHp*.65);near(boss.hp,boss.maxHp*.88);assert.equal(game.state.pulseRemaining,30);near(normal.rootUntil,game.state.elapsed+2);
 unchanged(game,()=>game.pulse());const snapshot=JSON.stringify(game.state);game.tick(100);assert.equal(JSON.stringify(game.state),snapshot);
 game.togglePause();game.tick(30);near(game.state.pulseRemaining,0);game.pulse();game.tick(30);
 const gold=game.state.gold,count=game.state.enemies.filter(enemy=>!enemy.boss).length;
 game.pulse();assert.equal(game.state.kills,count);assert.ok(game.state.gold>gold);assert.equal(game.state.enemies.length,1);near(boss.hp,boss.maxHp*.64);
});

test('pulse stun freezes actual movement and expires with simulation time',()=>{
 const game=createGame({mode:'storm',initialDelay:1000,waveInterval:1000,waveSize:()=>1});game.start();game.launchWave();game.tick(.05);game.pulse();const enemy=game.state.enemies[0],before=enemy.progress;
 game.tick(1.8);near(enemy.progress,before);game.tick(.3);assert.ok(enemy.progress>before);assert.ok(game.state.pulseRemaining<30);
});

test('a capture net cannot shorten the active two-second overload stun',()=>{
 const game=createGame({mode:'storm',startingGold:1000,initialDelay:1000,waveInterval:1000,waveSize:()=>1,enemyHealthScale:10});
 game.start();game.startResearch('deployment');game.tick(12);assert.equal(game.build(500,280,'T07').ok,true);
 game.launchWave();game.tick(7);game.drainEvents();
 assert.equal(game.overloadPulse().ok,true);
 const until=game.state.elapsed+2,enemy=game.state.enemies[0],position=enemy.progress;
 game.tick(1.9);
 assert.ok(enemy.rootUntil>=until);near(enemy.progress,position);
 assert.ok(game.drainEvents().some(event=>event.type==='shot'&&event.code==='T07'),'the capture net fires during the overload stun');
});

test('storm timer stops exactly, freezes tech and skill at victory, then endless resumes the same game',()=>{
 const game=createGame({mode:'storm',survivalDuration:.5,startingGold:1000,enemySpeedScale:0,spawnInterval:.02});game.start();game.build(500,280,'T01');game.startResearch('deployment');game.launchWave();game.tick(.1);game.pulse();game.tick(100);
 assert.equal(game.state.phase,'victory');near(game.state.elapsed,.5);near(game.state.survivalRemaining,0);assert.ok(game.state.enemies.length>0);const cooldown=game.state.pulseRemaining,research=game.state.research.remaining,gold=game.state.gold;
 unchanged(game,()=>game.pulse());game.tick(20);near(game.state.pulseRemaining,cooldown);assert.equal(game.continueEndless().ok,true);
 assert.equal(game.state.gold,gold);assert.equal(game.state.towers.length,1);near(game.state.research.remaining,research);near(game.state.pulseRemaining,cooldown);near(game.state.elapsed,.5);
 game.tick(1);assert.equal(game.state.phase,'playing');assert.ok(game.state.elapsed>.5);assert.ok(game.state.pulseRemaining<cooldown);assert.ok(game.state.research.remaining<research);
});

test('a storm core loss on the final timer step defeats once instead of granting survival victory',()=>{
 const game=createGame({mode:'storm',coreHealth:1,survivalDuration:.05,enemySpeedScale:1000,waveSize:()=>1});
 game.start();game.launchWave();game.tick(10);
 assert.equal(game.state.phase,'defeat');assert.equal(game.state.coreHealth,0);near(game.state.survivalRemaining,0);
 const events=game.drainEvents();assert.equal(events.filter(event=>event.type==='defeat').length,1);assert.equal(events.filter(event=>event.type==='victory').length,0);
 const elapsed=game.state.elapsed;game.tick(10);near(game.state.elapsed,elapsed);
});

test('mission progress, research, extraction, cooldown and speed freeze together; restart and four sessions isolate state',()=>{
 const sessions=Object.fromEntries(Object.keys(MODE_DETAILS).map(mode=>[mode,createGame({mode,initialDelay:1000,startingGold:1000,harvestDuration:1})]));
 for(const game of Object.values(sessions))game.start();const game=sessions.harvest;game.startResearch('reinforcement');game.startHarvest(0);game.setSpeed(2);game.tick(.25);near(game.state.harvest.remaining,.5);
 game.togglePause();const snapshot=JSON.stringify(game.state);game.tick(100);assert.equal(JSON.stringify(game.state),snapshot);game.togglePause();game.tick(.25);assert.equal(game.state.harvested,40);
 for(const mode of ['loop','defense','storm']){assert.equal(sessions[mode].state.elapsed,0);assert.equal(sessions[mode].state.gold,1000);assert.equal(sessions[mode].state.harvested,0);}
 game.restart();assert.equal(game.state.speed,1);assert.equal(game.state.harvested,0);assert.deepEqual(game.state.deposits,[3,3,3]);assert.equal(game.state.harvest,null);assert.equal(game.state.extractionRemaining,null);assert.equal(game.state.research,null);assert.deepEqual(game.state.tech,{deployment:0,reinforcement:0});
 const extraction=readyHarvest();extraction.evacuate();extraction.togglePause();extraction.tick(30);near(extraction.state.extractionRemaining,.2);
 const storm=createGame({mode:'storm',enemySpeedScale:0});storm.start();storm.launchWave();storm.tick(1);storm.pulse();storm.restart();assert.equal(storm.state.pulseRemaining,0);assert.equal(storm.state.survivalRemaining,360);assert.equal(storm.state.stormActive,false);assert.equal(storm.state.enemies.length,0);
});
