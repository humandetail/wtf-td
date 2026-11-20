import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoopGame} from '../loop-session.js';
import {GOLD_RUSHES,LOOP_ENEMIES,assignWaveBounties,loopEnemy,loopWave,waveMultiplier} from '../loop-catalog.js';

function start(options={}){
 const game=createLoopGame({draftRandom:()=>0,random:()=>0,...options});
 game.start();game.openStarter();return game;
}
function deployStarter(game){return game.deploy(game.state.cards[0].id,500,300).towerId;}

test('kill budgets pay once with no flat wave-clear grant',()=>{
 const game=start({waveCount:1,waveSize:()=>1,enemyHealthScale:.001});
 assert.equal(game.state.gold,80);
 deployStarter(game);
 assert.ok(game.launchWave().ok);
 game.tick(3);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.gold,125);
 assert.equal(game.drainEvents().filter(e=>e.type==='wave-clear').length,1);
 game.tick(30);
 assert.equal(game.state.gold,125);
});

test('overlapping waves retain the bounty budget of their originating wave',()=>{
 const game=start({waveCount:2,waveSize:()=>2,spawnInterval:.025,enemyHealthScale:.001,enemySpeedScale:0});
 deployStarter(game);game.state.towers[0].cooldown=.8;
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.ok(game.launchWave().ok);game.tick(.15);
 assert.equal(game.state.enemies.length,4);
 game.tick(5);
 assert.equal(game.state.phase,'victory');
 assert.equal(game.state.gold,173);
 assert.deepEqual(game.drainEvents().filter(e=>e.type==='wave-clear').map(e=>e.wave),[1,2]);
});

function deployDeputy(game,main) {
 game.state.cards.push({id:900,code:game.credentials[main.code],paid:false,refund:0});
 const {towerId}=game.deploy(900,780,300);
 assert.ok(towerId);
 const deputy=game.state.towers.find(t=>t.id===towerId);
 for(const cost of [30,60,90]){
  const gold=game.state.gold;
  assert.ok(game.upgradeDeputy(towerId).ok);
  assert.equal(game.state.gold,gold-cost);
 }
 return deputy;
}

test('crafting uses distinct materials free of charge and orange re-equip requires a deputy',()=>{
 const game=start({startingGold:2500,draftRandom:()=>.99});
 const towerId=deployStarter(game),main=game.state.towers[0];
 assert.equal(main.code,'T27');
 assert.equal(game.buyEquipment('scroll-green').ok,false);
 const deputy=deployDeputy(game,main);
 assert.equal(deputy.deputyStage,3);
 const blue=game.buyEquipment('splitter');
 assert.ok(blue.ok);
 assert.ok(game.buyEquipment('siege').ok);
 const invested=game.state.inventory.reduce((sum,item)=>sum+item.invested,0);
 assert.equal(game.craftEquipment('arbalest').ok,false);
 assert.ok(game.buyEquipment('blade').ok);
 const gold=game.state.gold;
 const orange=game.craftEquipment('arbalest');
 assert.ok(orange.ok);
 assert.equal(game.state.gold,gold);
 assert.equal(game.equip(towerId,orange.itemId).ok,false);
 main.level=19;
 assert.equal(game.breakthrough(towerId,deputy.id).ok,false);
 main.level=20;
 assert.ok(game.breakthrough(towerId,deputy.id).ok);
 assert.equal(game.state.gold,gold);
 assert.equal(game.breakthrough(towerId,deputy.id).ok,false);
 assert.ok(game.equip(towerId,orange.itemId).ok);
 assert.ok(game.sell(deputy.id).ok);
 assert.equal(game.levelCap(main),30);
 assert.equal(game.statsFor(main).damage>0,true);
 assert.equal(main.equipment[0].id,orange.itemId);
 assert.ok(game.unequip(towerId,orange.itemId).ok);
 assert.equal(game.equip(towerId,orange.itemId).ok,false);
 deployDeputy(game,main);
 assert.ok(game.equip(towerId,orange.itemId).ok);
 assert.ok(game.unequip(towerId,orange.itemId).ok);
 assert.equal(game.sellEquipment(orange.itemId).refund,Math.floor((invested+65)/4));
 assert.equal(game.sellEquipment(orange.itemId).ok,false);

 for(const code of ['embers','field','crystal'])assert.ok(game.buyEquipment(code).ok);
 const before=game.state.inventory.map(item=>item.id);
 assert.equal(game.craftEquipment('furnace').ok,false);
 assert.deepEqual(game.state.inventory.map(item=>item.id),before);
 assert.ok(game.buyEquipment('crystal').ok);
 assert.ok(game.craftEquipment('furnace').ok);
 assert.deepEqual(game.state.inventory.map(item=>item.code),['furnace']);
});

test('cross-type gear remains wearable while incompatible affixes stay inactive',()=>{
 const game=start({startingGold:1000});
 const id=deployStarter(game),tower=game.state.towers[0],base=game.statsFor(tower);
 const {itemId}=game.buyEquipment('repeater');
 assert.ok(game.equip(id,itemId).ok);
 assert.equal(game.statsFor(tower).damage,base.damage);
 assert.ok(game.statsFor(tower).interval<base.interval);
});

test('shield rounds remove one bonus shield layer per attack cycle',()=>{
 const game=start({startingGold:1200,initialDelay:1000,enemySpeedScale:0});
 const id=deployStarter(game);
 const {itemId}=game.buyEquipment('siege');
 assert.ok(game.equip(id,itemId).ok);
 game.state.enemies=[550,580].map((x,index)=>{
  const enemy=loopEnemy({code:'X08',wave:1},100+index,{x,y:300,roadFrom:0,roadTo:1});
  enemy.shieldHits=4;
  return enemy;
 });
 game.tick(.05);
 assert.deepEqual(game.state.enemies.map(enemy=>enemy.shieldHits).sort(),[2,3]);
});

test('bounty gear pays once per ally kill up to the wave limit and resets next match',()=>{
 const game=start({startingGold:1200,initialDelay:1000,enemySpeedScale:0});
 deployStarter(game);
 const [main]=game.state.towers;
 game.state.cards.push({id:900,code:'T19',paid:false,refund:0});
 const {towerId}=game.deploy(900,570,300);
 const control=game.state.towers.find(t=>t.id===towerId);
 const {itemId}=game.buyEquipment('bounty');
 assert.ok(game.equip(towerId,itemId).ok);
 for(let i=0;i<13;i++){
  main.cooldown=.10;control.cooldown=0;
  const enemy=loopEnemy({code:'X01',wave:1},100+i,{x:550,y:300,roadFrom:0,roadTo:1});
  enemy.hp=24;
  game.state.enemies=[enemy];
  game.tick(.10);
  assert.equal(game.state.enemies.length,0);
 }
 assert.equal(game.state.ledger.filter(entry=>entry.reason==='gear-bounty').length,12);
 assert.equal(game.state.gearBounty[1],12);
 game.restart();
 assert.deepEqual(game.state.gearBounty,{});
});

test('manual equipment rejects invalid aims and keeps its cooldown after detaching',()=>{
 const game=start({startingGold:2000});
 const id=deployStarter(game),tower=game.state.towers[0];
 deployDeputy(game,tower);
 tower.level=20;
 assert.ok(game.breakthrough(id).ok);
 const {itemId}=game.buyEquipment('anchor');
 assert.ok(game.equip(id,itemId).ok);
 assert.equal(game.castEquipment(id,itemId,5,5).ok,false);
 assert.equal(tower.equipment[0].readyAt,0);
 const target=loopEnemy({code:'X02',wave:1},123,{x:560,y:300});
 game.state.enemies.push(target);
 assert.ok(game.castEquipment(id,itemId,560,300).ok);
 assert.ok(target.rootUntil>0);
 assert.equal(tower.equipment[0].readyAt,30);
 assert.equal(game.castEquipment(id,itemId,560,300).ok,false);
 assert.equal(game.unequip(id,itemId).ok,false);
 game.state.elapsed=5.01;
 assert.ok(game.unequip(id,itemId).ok);
 assert.ok(game.equip(id,itemId).ok);
 assert.equal(game.castEquipment(id,itemId,560,300).ok,false);
});

test('automatic anchor waits for a group and roots the group only once',()=>{
 const game=start({initialDelay:1000,startingGold:2000});
 const id=deployStarter(game),tower=game.state.towers[0];
 deployDeputy(game,tower);
 tower.level=20;tower.cooldown=9;
 assert.ok(game.breakthrough(id).ok);
 const {itemId}=game.buyEquipment('anchor');
 assert.ok(game.equip(id,itemId).ok);
 assert.ok(game.toggleEquipmentMode(id,itemId).ok);
 const makeEnemy=i=>loopEnemy({code:'X08',wave:1},100+i,{x:550+i*6,y:300,roadFrom:0,roadTo:1},{enemySpeedScale:0,enemyHealthScale:10});
 game.state.enemies=Array.from({length:3},(_,i)=>makeEnemy(i));
 game.tick(.1);assert.equal(tower.equipment[0].readyAt,0);
 game.state.enemies.push(makeEnemy(3));
 game.tick(.1);
 const ready=tower.equipment[0].readyAt;
 assert.ok(ready>=30);
 assert.ok(game.state.enemies.every(enemy=>enemy.rootUntil>game.state.elapsed));
 game.tick(.1);assert.equal(tower.equipment[0].readyAt,ready);
});

test('a challenge awards an unsellable-for-profit component once',()=>{
 const game=start({initialDelay:1000,waveSize:()=>1,spawnInterval:.01,enemyHealthScale:.001});
 deployStarter(game);
 for(let wave=1;wave<=3;wave++){assert.ok(game.launchWave().ok);game.tick(.05);}
 assert.equal(game.state.wave,3);
 assert.equal(game.startChallenge('C02').ok,false);
 assert.ok(game.startChallenge('C01').ok);
 assert.equal(game.startChallenge('C01').ok,false);
 game.tick(2);
 assert.deepEqual(game.state.completedChallenges,['C01']);
 const item=game.state.inventory.find(item=>item.code==='blade');
 assert.equal(item.invested,0);
 assert.equal(game.sellEquipment(item.id).refund,0);
 assert.equal(game.startChallenge('C01').ok,false);
});

test('late escort waves retain fifty slots and shift the planned bounty into gold rushes',()=>{
 const escorts=[['X16','X10','E06'],['X15','X04','E08'],['X20','X13','E07'],
  ['X02','X09','E09'],['X18','X07','E03'],['X05','X06','E04']];
 let payout=0,oldPayout=0;
 for(let wave=1;wave<=50;wave++){
  const entries=assignWaveBounties(loopWave(wave,false),wave);
  const ordinaryBounty=entries.filter(e=>!e.boss).reduce((sum,e)=>sum+e.bounty,0);
  const previousBounty=Math.min(180,45+3*(wave-1));
  const reduction=wave<=5?0:wave<=10?15:wave>=16&&wave<=20?24:[26,36,46].some(start=>wave>=start&&wave<start+5)?30:0;
  assert.equal(ordinaryBounty,previousBounty-reduction,`wave ${wave}`);
  payout+=ordinaryBounty;
  oldPayout+=previousBounty;
  if(wave<25||wave%5)continue;
  assert.equal(entries.length,50);
  assert.equal(entries.filter(e=>e.boss).length,1);
  const base=loopWave(wave,false,37);
  escorts[(wave-25)/5].forEach((code,i)=>assert.equal(entries.filter(e=>e.code===code).length-base.filter(e=>e.code===code).length,[6,4,2][i]));
 }
 assert.equal(payout+GOLD_RUSHES.reduce((sum,r)=>sum+r.reward,0),oldPayout+370);
});

test('regular and elite health changes at campaign bands with boss and endless scaling intact',()=>{
 const position={x:0,y:0};
 for(const [wave,growth] of [[20,.60],[21,.80],[30,.80],[31,1],[40,1],[41,1.35],[50,1.35]]){
  for(const code of ['X01','E04','B10']){
   const boss=code==='B10';
   assert.equal(loopEnemy({code,wave,boss},1,position).maxHp,LOOP_ENEMIES[code].hp*waveMultiplier(wave,false)*(boss?.60:growth));
  }
 }
 const endless=loopEnemy({code:'E04',wave:55,endless:true},1,position);
 assert.equal(endless.maxHp,LOOP_ENEMIES.E04.hp*waveMultiplier(55,true)*.60);
});
