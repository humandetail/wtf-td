import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegionGame} from '../legion-session.js';
import {LEGION_FIGHTERS,LEGION_MERCENARIES,legionStats} from '../legion-catalog.js';
import {playLegionMatch} from '../qa/legion-strategy.mjs';
const start=options=>{const game=createLegionGame(options);game.start();return game;};
function army(game,side='player'){
 const cmd=game.commandsFor(side);cmd.build(600,370,'T01');cmd.build(680,370,'T01');cmd.build(595,510,'T04');cmd.build(680,510,'T02');
}

test('legion catalog has six living distinct soldiers and three real mercenaries',()=>{
 assert.equal(LEGION_FIGHTERS.length,6);assert.equal(LEGION_MERCENARIES.length,3);
 assert.equal(new Set(LEGION_FIGHTERS.map(f=>f.kind)).size,6);
 for(const f of [...LEGION_FIGHTERS,...LEGION_MERCENARIES])for(const property of ['hp','speed','range','damage','price'])assert.ok(f[property]>0);
 assert.ok(legionStats({code:'T01',level:2}).hp>legionStats({code:'T01'}).hp);
});
test('manual planning freezes independent resources and research; pause/menu freeze both sides',()=>{
 const game=start();const p=game.state.sides.player,a=game.state.sides.ai;
 assert.notEqual(p,a);assert.notEqual(p.king,a.king);assert.notEqual(p.fighters,a.fighters);
 game.startResearch('reinforcement');const remaining=p.research.remaining;
 game.tick(10000);assert.equal(p.research.remaining,remaining);assert.equal(a.gold,30);assert.equal(p.gold,320);assert.equal(p.mythium,20);
 game.startCombat();game.tick(2);assert.ok(p.research.remaining<remaining);
 game.setPaused(true);let snapshot=JSON.stringify(game.state);game.tick(20);assert.equal(JSON.stringify(game.state),snapshot);
 game.setPaused(false);game.returnToMenu();snapshot=JSON.stringify(game.state);game.tick(20);assert.equal(JSON.stringify(game.state),snapshot);
 game.start();assert.equal(game.state.wave,0);assert.equal(game.state.sides.player.gold,400);assert.equal(game.state.sides.ai.fighters.length,4);
});
test('orders reserve/cancel atomically and commit income once; workers and king obey equal prices',()=>{
 const game=start({ai:false}),p=game.state.sides.player;
 const order=game.queueMercenary('X04');assert.equal(p.mythium,10);assert.equal(p.income,10);
 assert.ok(game.cancelMercenary(order.orderId).ok);assert.equal(p.mythium,20);assert.equal(p.income,10);assert.equal(game.cancelMercenary(order.orderId).ok,false);
 assert.ok(game.buyWorker().ok);assert.equal(p.gold,340);assert.equal(p.workers,3);assert.equal(game.upgradeKing().ok,false);
 game.queueMercenary('X04');game.startCombat();assert.equal(p.income,11);assert.equal(game.startCombat().ok,false);assert.equal(p.income,11);
 assert.equal(game.state.sides.ai.invaders.filter(e=>e.owner==='player').length,1);
 assert.equal(game.queueMercenary('X04').ok,false);assert.equal(game.buyWorker().ok,false);assert.equal(game.sell(1).ok,false);
 game.tick(200);assert.equal(game.state.turnPhase,'planning');assert.equal(p.mythium,28);assert.equal(p.ledger.filter(e=>e.kind==='round-income').length,1);
 game.tick(200);assert.equal(p.mythium,28);
 const initial=p.king.hp;p.mythium=100;
 for(let i=0;i<3;i++)assert.ok(game.upgradeKing().ok);assert.equal(p.king.hp,initial+900);assert.equal(p.king.maxHp,2100);assert.equal(p.income,11);assert.equal(game.upgradeKing().ok,false);
});
test('fighters move, receive damage, collide, attack from range, and restore formation for free',()=>{
 const game=start({ai:false});army(game);army(game,'ai');const p=game.state.sides.player,home=p.fighters.map(f=>[f.x,f.y]);const spent=p.fighters.map(f=>f.spent);
 game.startCombat();game.tick(4);assert.ok(p.fighters.some((f,i)=>f.y!==home[i][1]));
 assert.ok(p.fighters.some(f=>f.hp<f.maxHp));
 for(let i=0;i<p.fighters.length;i++)for(let j=i+1;j<p.fighters.length;j++)if(p.fighters[i].hp>0&&p.fighters[j].hp>0)assert.ok(Math.hypot(p.fighters[i].x-p.fighters[j].x,p.fighters[i].y-p.fighters[j].y)>29);
 assert.ok(game.drainEvents().some(e=>e.type==='attack'&&e.kind==='direct'&&Math.hypot(e.x-e.targetX,e.y-e.targetY)>100));
 game.tick(200);assert.equal(game.state.turnPhase,'planning');assert.deepEqual(p.fighters.map(f=>[f.x,f.y]),home);assert.deepEqual(p.fighters.map(f=>f.spent),spent);assert.ok(p.fighters.every(f=>f.hp===f.maxHp));
});
test('leaks fight king over time, king counterattacks and permanent damage is retained',()=>{
 const game=start({ai:false}),p=game.state.sides.player;
 game.startCombat();game.tick(12);assert.ok(p.invaders.length>0);
 for(let i=0;i<500&&p.king.hp===1200;i++)game.tick(.1);
 assert.ok(p.king.hp<1200);assert.ok(p.invaders.length>0,'contact does not destroy invaders');assert.ok(p.round.leaks>0);
 const hp=p.king.hp;game.tick(150);assert.ok(p.king.hp<=hp);assert.ok(game.drainEvents().some(e=>e.type==='king-attack'&&e.side==='player'));
 assert.equal(p.ledger.filter(e=>e.kind==='round-income').length,1);assert.ok(p.ledger.some(e=>e.kind==='kill'&&e.leaked));
});
test('damage collected from both battlefields resolves simultaneous lethal kings as a draw',()=>{
 const game=start({ai:false});game.startCombat();
 for(const side of Object.values(game.state.sides)){
  side.king.hp=1;side.king.cooldown=10;side.invaders=[{id:987,hp:100,maxHp:100,damage:20,range:40,speed:0,x:640,y:660,interval:1,cooldown:0,reward:1,radius:15}];
 }
 game.tick(.05);assert.equal(game.state.phase,'draw');assert.ok(game.state.sides.player.king.hp<=0);assert.ok(game.state.sides.ai.king.hp<=0);
});
test('AI uses identical commands and sees public units without pending orders or hidden funds',()=>{
 const a=start(),b=start();army(a);army(b);a.queueMercenary('X04');
 const intel=a.publicIntel('player');assert.equal('orders' in intel,false);assert.equal('gold' in intel,false);assert.equal('mythium' in intel,false);
 a.startCombat();b.startCombat();
 assert.deepEqual(a.state.sides.ai.fighters.map(f=>[f.code,f.x,f.y]),b.state.sides.ai.fighters.map(f=>[f.code,f.x,f.y]));
 assert.deepEqual(a.state.sides.ai.committedOrders,b.state.sides.ai.committedOrders);
 const ai=a.state.sides.ai;assert.equal(ai.gold,400-ai.fighters.reduce((n,f)=>n+f.spent,0));assert.ok(ai.gold>=0);assert.equal(a.commandsFor('ai').buyWorker().ok,false);
});
test('default 400-gold strategy beats the full normal AI by destroying its king',()=>{
 const run=playLegionMatch(42);assert.equal(run.outcome,'victory');assert.ok(run.wave>1);assert.ok(run.playerHp>0);assert.ok(run.aiHp<=0);
 for(const side of Object.values(run.game.state.sides)){
  assert.ok(side.gold>=0);assert.ok(side.mythium>=0);assert.equal(side.ledger.filter(e=>e.kind==='commit').length,run.wave);
  assert.equal(side.ledger.filter(e=>e.kind==='round-income').length,run.wave-1);
 }
});
test('changing front/back formation changes exposure, and committed sends cause real opponent king damage',()=>{
 const formation=[];
 for(const reverse of [false,true]){
  const game=start({ai:false});game.build(600,reverse?560:340,'T01');game.build(680,reverse?560:340,'T01');game.build(600,reverse?340:560,'T04');game.build(680,reverse?340:560,'T04');game.startCombat();game.tick(4);
  formation.push(game.state.sides.player.fighters.map(f=>f.hp));
 }
 assert.notDeepEqual(formation[0],formation[1]);
 const hp=[];
 for(const send of [false,true]){
  const game=start({ai:false});game.commandsFor('ai').build(600,370,'T01');if(send){game.queueMercenary('X04');game.queueMercenary('X04');}
  game.startCombat();game.tick(180);hp.push(game.state.sides.ai.king.hp);
 }
 assert.ok(hp[1]<hp[0]);
});
test('round resource ledgers reconcile and caps/invalid commands cannot spend money',()=>{
 const game=start({ai:false});const p=game.state.sides.player;
 const snapshot=JSON.stringify(p);for(const args of [[NaN,400,'T01'],[600,200,'T01'],[600,400,'fake']])assert.equal(game.build(...args).ok,false);assert.equal(JSON.stringify(p),snapshot);
 game.build(600,370,'T01');game.sell(p.fighters[0].id);game.startResearch('reinforcement');game.cancelResearch();game.buyWorker();game.queueMercenary('X04');game.startCombat();game.tick(200);
 assert.equal(p.gold,400+p.ledger.reduce((n,e)=>n+e.gold,0));assert.equal(p.mythium,20+p.ledger.reduce((n,e)=>n+e.mythium,0));
 const capped=start({ai:false,startingGold:10000});const s=capped.state.sides.player;
 for(let i=0;i<10;i++)assert.ok(capped.buyWorker().ok);const gold=s.gold;assert.equal(capped.buyWorker().ok,false);assert.equal(s.gold,gold);assert.equal(s.workers,12);
 s.mythium=200;for(let i=0;i<12;i++)assert.ok(capped.queueMercenary('X04').ok);const funds=s.mythium;assert.equal(capped.queueMercenary('X04').ok,false);assert.equal(s.mythium,funds);assert.equal(s.orders.length,12);
});
test('ranged mercenary engagement counts as a leak, halves kill gold and grants bounded attack reward',()=>{
 const game=start({ai:false});game.startCombat();const p=game.state.sides.player,a=game.state.sides.ai;
 p.invaders=[{...LEGION_MERCENARIES.find(m=>m.code==='X03'),id:1234,x:655,y:539,maxHp:260,cooldown:0,radius:15,owner:'ai',leaked:false}];
 a.invaders=[];p.king.range=180;p.king.damage=1000;p.king.cooldown=0;
 assert.ok(Math.hypot(p.invaders[0].x-p.king.x,p.invaders[0].y-p.king.y)>120);
 game.tick(.05);
 assert.equal(game.state.turnPhase,'planning');assert.equal(p.round.leaks,1);assert.equal(p.round.kingDamage,24);
 const kill=p.ledger.find(entry=>entry.kind==='kill'&&entry.id===1234);assert.equal(kill.leaked,true);assert.equal(kill.gold,6);
 assert.equal(p.ledger.find(entry=>entry.kind==='round-income').gold,10);assert.equal(a.ledger.find(entry=>entry.kind==='round-income').gold,12);
 assert.equal(game.state.reports[0].sides.player.leaks,1);
});
test('AI enters planning visibly and locking cannot rebuild or react to pending player commands',()=>{
 const game=start();const first=game.publicIntel('ai');assert.equal(first.fighters.length,4);assert.equal(game.state.sides.ai.gold,30);
 army(game);game.queueMercenary('X04');const before=game.publicIntel('ai');const finances=game.state.sides.ai.gold;
 game.startCombat();assert.deepEqual(game.publicIntel('ai'),before);assert.equal(game.state.sides.ai.gold,finances);
 game.tick(180);assert.equal(game.state.turnPhase,'planning');assert.equal(game.publicIntel('ai').fighters.length,game.state.sides.ai.fighters.length);
 const planned=game.publicIntel('ai'),orders=game.state.sides.ai.orders.map(o=>({...o}));game.startCombat();
 assert.deepEqual(game.publicIntel('ai'),planned);assert.deepEqual(game.state.sides.ai.committedOrders,orders);
});
test('repeated restarts bind UI aliases and commands to fresh currency and army objects',()=>{
 const game=start();
 for(let run=0;run<4;run++){
  game.restart();const p=game.state.sides.player;
  assert.equal(game.state.gold,400);assert.equal(p.mythium,20);assert.equal(p.workers,2);assert.equal(p.income,10);assert.equal(game.state.towers,p.fighters);assert.equal(game.state.enemies,p.invaders);assert.equal(game.state.tech,p.tech);assert.equal(game.state.research,null);assert.equal(game.state.coreHealth,p.king.hp);
  assert.ok(game.build(600,400,'T01').ok);assert.equal(game.state.gold,320);assert.equal(game.state.towers.length,1);assert.ok(game.startResearch('reinforcement').ok);assert.equal(game.state.research,p.research);assert.equal(game.state.gold,240);assert.ok(game.queueMercenary('X04').ok);assert.equal(p.mythium,10);
 }
});
test('large tick advances all supplied combat time without the former 3600-second cap',()=>{
 const game=start({ai:false});game.startCombat();
 for(const side of Object.values(game.state.sides))side.invaders=[{id:1,code:'X01',hp:100,maxHp:100,x:640,y:145,speed:0,range:1,damage:1,interval:1,cooldown:0,radius:15}];
 game.tick(3601);assert.ok(game.state.elapsed>3600.9);assert.equal(game.state.turnPhase,'combat');
});
function assertSeparated(side){
 const units=[...side.fighters,...side.invaders].filter(unit=>unit.hp>0);
 for(const unit of units){assert.ok(unit.x>=195-1e-6&&unit.x<=1085+1e-6);assert.ok(unit.y>=140-1e-6&&unit.y<=690+1e-6);}
 for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++)assert.ok(Math.hypot(units[i].x-units[j].x,units[i].y-units[j].y)>=30-1e-6,`${units[i].id}/${units[j].id} overlap`);
}
test('second-row spawning and every subsequent combat frame preserve circle separation',()=>{
 const game=start();army(game);game.startCombat();game.tick(180);assert.equal(game.state.turnPhase,'planning');game.startCombat();
 assert.ok(new Set(game.state.sides.player.invaders.map(e=>e.y)).size>1);
 for(let frame=0;frame<2400&&game.state.phase==='playing'&&game.state.turnPhase==='combat';frame++){
  game.tick(.05);for(const side of Object.values(game.state.sides))assertSeparated(side);
 }
 assert.equal(game.state.turnPhase,'planning');
});
test('edge engagements maintain valid footprints for the entire combat',()=>{
 const game=start({ai:false});game.build(210,330,'T01');game.build(1070,330,'T01');game.startCombat();
 const p=game.state.sides.player;p.pendingInvaders=[];
 p.invaders.forEach((enemy,i)=>{enemy.x=i%2?1085:195;enemy.y=160+Math.floor(i/2)*40;});
 for(let frame=0;frame<1600&&game.state.phase==='playing'&&game.state.turnPhase==='combat';frame++){
  game.tick(.05);for(const side of Object.values(game.state.sides))assertSeparated(side);
 }
 assert.equal(game.state.turnPhase,'planning');
});
test('crowded later waves stage only available deployment-free positions and retain queued units',()=>{
 const game=start({ai:false});game.state.wave=39;game.startCombat();
 const side=game.state.sides.player;
 assert.equal(side.invaders.length,30);assert.equal(side.pendingInvaders.length,8);assertSeparated(side);
 for(let frame=0;frame<80;frame++){game.tick(.05);assertSeparated(side);}
 assert.ok(side.pendingInvaders.length<8,'off-map units enter when staging positions become free');
});
function legionSpecialistSetup(){
 const game=start({ai:false,startingGold:10000});assert.ok(game.startResearch('deployment').ok);
 // Public worker purchases earn enough mythium to place a real X03 order next round.
 for(let i=0;i<10;i++)assert.ok(game.commandsFor('ai').buyWorker().ok);
 assert.ok(game.startCombat().ok);game.tick(200);assert.equal(game.state.turnPhase,'planning');assert.equal(game.state.tech.deployment,1);game.drainEvents();return game;
}
function observeDamage(game,kind){
 for(let frame=0;frame<1200&&game.state.turnPhase==='combat';frame++){
  const before=new Map(game.state.sides.player.invaders.map(enemy=>[enemy.id,enemy.hp]));game.tick(.05);const events=game.drainEvents();
  if(events.some(event=>event.type==='attack'&&event.side==='player'&&event.kind===kind)){
   return events.filter(event=>event.type==='damage'&&event.side==='player'&&before.has(event.targetId)).map(event=>{
    const enemy=game.state.sides.player.invaders.find(enemy=>enemy.id===event.targetId);return {damage:event.damage,hpLost:enemy?before.get(enemy.id)-enemy.hp:before.get(event.targetId),enemy};
   });
  }
 }
 throw new Error(`No ${kind} attack observed`);
}
test('T09 aura changes real T04 target health loss by the configured 25 percent',()=>{
 const damage=[];
 for(const nearby of [false,true]){
  const game=legionSpecialistSetup();assert.ok(game.build(640,510,'T04').ok);assert.ok(game.build(nearby?600:210,nearby?510:620,'T09').ok);game.startCombat();
  const hits=observeDamage(game,'direct');assert.equal(hits.length,1);assert.ok(Math.abs(hits[0].hpLost-hits[0].damage)<1e-8);damage.push(hits[0].hpLost);
 }
 assert.equal(damage[0],55);assert.equal(damage[1],68.75);assert.equal(damage[1]/damage[0],1.25);
});
test('T10 heals actually injured living fighters, with the HP change matching the combat buffer',()=>{
 const game=legionSpecialistSetup();assert.ok(game.build(640,370,'T01').ok);assert.ok(game.build(600,440,'T10').ok);game.startCombat();let restored=false;
 for(let frame=0;frame<1200&&game.state.turnPhase==='combat';frame++){
  const before=new Map(game.state.sides.player.fighters.map(f=>[f.id,{hp:f.hp,maxHp:f.maxHp}]));game.tick(.05);const events=game.drainEvents();
  for(const heal of events.filter(event=>event.type==='heal'&&event.side==='player')){
   const previous=before.get(heal.targetId),fighter=game.state.sides.player.fighters.find(f=>f.id===heal.targetId);
   if(previous.hp>=previous.maxHp)continue;
   const incoming=events.filter(event=>event.type==='damage'&&event.side==='player'&&event.targetId===heal.targetId).reduce((n,event)=>n+event.damage,0);
   assert.equal(heal.damage,-28);assert.ok(Math.abs(fighter.hp-Math.min(fighter.maxHp,previous.hp+28-incoming))<1e-8);assert.ok(fighter.hp>previous.hp-incoming);restored=true;
  }
  if(restored)break;
 }
 assert.ok(restored,'healer must restore missing HP in actual combat');
});
test('legally committed X03 aura reduces actual splash HP loss by forty percent',()=>{
 const damage=[];
 for(const send of [false,true]){
  const game=legionSpecialistSetup();assert.ok(game.build(640,400,'T03').ok);
  if(send)assert.ok(game.commandsFor('ai').queueMercenary('X03').ok);game.startCombat();
  if(send)assert.equal(game.state.sides.player.invaders.filter(e=>e.code==='X03'&&e.owner==='ai').length,1);
  const hits=observeDamage(game,'splash');const actual=hits.find(hit=>hit.enemy?.code==='X01'&&Math.abs(hit.damage-(send?34.8:58))<1e-8);
  assert.ok(actual,'expected a base invader in the splash region');assert.ok(Math.abs(actual.hpLost-actual.damage)<1e-8);damage.push(actual.hpLost);
 }
 assert.ok(Math.abs(damage[1]/damage[0]-.6)<1e-8);
});
test('normal worker investment finishes a real AI match with a complete reconciled ledger',()=>{
 const run=playLegionMatch(42,{workers:true});assert.equal(run.outcome,'victory');assert.ok(run.aiHp<=0);const side=run.game.state.sides.player,ledger=run.ledger.player;
 assert.equal(side.workers,4);assert.equal(ledger.filter(entry=>entry.kind==='worker').reduce((n,entry)=>n+entry.gold,0),-120);
 assert.equal(side.gold,400+ledger.reduce((n,entry)=>n+entry.gold,0));assert.equal(side.mythium,20+ledger.reduce((n,entry)=>n+entry.mythium,0));
 assert.ok(ledger.some(entry=>entry.kind==='round-income'&&entry.mythium===20));assert.equal(ledger.filter(entry=>entry.kind==='commit').length,run.wave);
});
test('strategy onFrame emits actual small-step moving battle state and drained events',()=>{
 let combatFrames=0,attacks=0,moving=false;const positions=new Map();
 const run=playLegionMatch(42,{onFrame(state,events){
  if(state.turnPhase==='combat'){combatFrames++;for(const fighter of state.sides.player.fighters){const previous=positions.get(fighter.id);if(previous&&(previous.x!==fighter.x||previous.y!==fighter.y))moving=true;positions.set(fighter.id,{x:fighter.x,y:fighter.y});}}
  attacks+=events.filter(event=>event.type==='attack').length;
 }});
 assert.equal(run.outcome,'victory');assert.ok(combatFrames>100);assert.ok(attacks>0);assert.ok(moving);assert.equal(run.game.drainEvents().length,0);
});
