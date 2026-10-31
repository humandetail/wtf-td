import test from 'node:test';
import assert from 'node:assert/strict';
import {createGemGame} from '../gem-session.js';
import {GEM_TOWERS,GEM_RECIPES,GEM_PROBABILITIES,gemStats} from '../gem-catalog.js';
import {gemPlacementStatus,GEM_LENGTH,pointOnGemRoute} from '../gem-geometry.js';
import {playGem} from '../qa/gem-strategy.mjs';
const started=(seed=1)=>{const g=createGemGame({seed});g.start();return g;};
const tower=(id,code,level=1,x=640,y=270,spent=60)=>({id,code,level,x,y,spent,angle:0});
function snapshot(g){return JSON.stringify(g.state);}
function combat(g){assert.equal(g.startCombat().ok,true);let n=0;while(g.state.phase==='playing'&&g.state.turnPhase==='combat'&&n++<10000){g.tick(.5);g.drainEvents();}assert.ok(n<10000);}

test('gem independent catalog contains six colors and five public recipes with normalized probabilities',()=>{
 assert.equal(GEM_TOWERS.length,11);assert.equal(GEM_RECIPES.length,5);
 for(const [cap,row] of GEM_PROBABILITIES.entries()){assert.equal(row.reduce((a,b)=>a+b),100);assert.ok(row.slice(cap+1).every(n=>n===0));}
 for(const def of GEM_TOWERS)assert.ok(def.assetCode.startsWith('T'));
});
test('gem draft is deterministic and paid; five shown candidates are retained through menu and pause',()=>{
 const a=started(42),b=started(42);assert.ok(a.draw().ok&&b.draw().ok);assert.deepEqual(a.state.draft,b.state.draft);assert.equal(a.state.gold,340);
 assert.ok(a.reroll().ok&&b.reroll().ok);assert.deepEqual(a.state.draft,b.state.draft);assert.equal(a.state.gold,320);
 assert.ok(a.reroll().ok);assert.ok(a.reroll().ok);assert.equal(a.state.gold,200);const old=snapshot(a);assert.equal(a.reroll().ok,false);assert.equal(snapshot(a),old);
 const draft=structuredClone(a.state.draft);a.state.phase='menu';a.tick(100);a.start();a.togglePause();a.tick(100);assert.deepEqual(a.state.draft,draft);a.togglePause();
 assert.ok(a.keep(0,{inventory:true}).ok);assert.equal(a.state.inventory[0].spent,200);assert.equal(a.state.scraps,4);assert.equal(a.state.gold,200);
});
test('gem full reserve and field do not lose a paid candidate; scraps return ten per five',()=>{
 const g=started();g.state.towers=[tower(10,'G01',1,310),tower(11,'G02',1,420),tower(12,'G03',1,530),tower(13,'G04',1,640)];g.state.inventory=[tower(14,'G05'),tower(15,'G06')];g.draw();
 let old=snapshot(g);assert.equal(g.keep(0,{inventory:true}).ok,false);assert.equal(snapshot(g),old);assert.equal(g.keep(0,{x:750,y:270}).ok,false);assert.equal(snapshot(g),old);
 assert.ok(g.sell(14).ok);assert.ok(g.keep(0,{inventory:true}).ok);g.sell(15);g.draw();assert.ok(g.keep(0,{inventory:true}).ok);assert.equal(g.state.scraps,3);assert.equal(g.state.gold,374);
});
test('gem ordinary merge retains ID position and exact spent ledger, rejects premature or duplicate materials atomically',()=>{
 const g=started();g.state.towers=[tower(50,'G01',1,640,270,60),tower(51,'G01',1,750,270,80)];let old=snapshot(g);assert.equal(g.merge(50,51).ok,false);assert.equal(snapshot(g),old);
 g.state.tech.reinforcement=1;old=snapshot(g);assert.equal(g.merge(50,50).ok,false);assert.equal(snapshot(g),old);assert.ok(g.merge(50,51).ok);
 assert.deepEqual(g.state.towers.map(t=>[t.id,t.x,t.y,t.level,t.spent]),[[50,640,270,2,140]]);assert.equal(g.statsFor(g.state.towers[0]).sellValue,98);const gold=g.state.gold;g.sell(50);assert.equal(g.state.gold-gold,98);
});
test('gem all five recipes validate complete materials and tech before atomic consumption',()=>{
 for(const recipe of GEM_RECIPES){
  const g=started();g.state.towers=recipe.inputs.map(([code,level],i)=>tower(10+i,code,level,310+110*i,270,60+20*i));
  const ids=g.state.towers.map(t=>t.id);let old=snapshot(g);assert.equal(g.forge(recipe.code,ids[0],ids.slice(1)).ok,false);assert.equal(snapshot(g),old);
  g.state.tech={deployment:recipe.deployment,reinforcement:recipe.reinforcement};old=snapshot(g);assert.equal(g.forge(recipe.code,ids[0],[...ids.slice(1),ids[0]]).ok,false);assert.equal(snapshot(g),old);
  const spent=g.state.towers.reduce((n,t)=>n+t.spent,0);assert.ok(g.forge(recipe.code,ids[0],ids.slice(1)).ok);assert.equal(g.state.towers.length,1);assert.deepEqual([g.state.towers[0].id,g.state.towers[0].x,g.state.towers[0].code,g.state.towers[0].level,g.state.towers[0].spent],[10,310,recipe.code,recipe.level,spent]);
 }
});
test('gem free placement checks full footprint road clearance; reserve does not attack or consume field capacity',()=>{
 assert.equal(gemPlacementStatus(640,150).ok,false);assert.equal(gemPlacementStatus(640,200).ok,false);assert.equal(gemPlacementStatus(640,270).ok,true);assert.equal(gemPlacementStatus(641,271,[tower(1,'G01')]).ok,false);
 assert.equal(pointOnGemRoute(GEM_LENGTH).arrived,true);assert.ok(GEM_LENGTH>3000);
 const g=started();g.draw();g.keep(0,{x:640,y:270});const original=g.state.towers[0];assert.ok(g.store(original.id).ok);assert.equal(g.state.towers.length,0);assert.equal(g.state.inventory[0],original);assert.ok(g.deployInventory(original.id,530,270).ok);assert.equal(g.state.towers[0],original);
});
test('gem preparation, pause, menu and terminal phases freeze research, income and combat; only combat research unlocks tiers',()=>{
 const g=started();assert.ok(g.startResearch('reinforcement').ok);const old=snapshot(g);g.tick(100);assert.equal(snapshot(g),old);assert.equal(g.state.tech.reinforcement,0);assert.ok(g.draw().ok);assert.ok(g.state.draft.candidates.every(t=>t.level===1));g.keep(0,{x:640,y:270});
 g.startCombat();g.togglePause();const paused=snapshot(g);g.tick(100);assert.equal(snapshot(g),paused);g.togglePause();g.state.phase='menu';const menu=snapshot(g);g.tick(100);assert.equal(snapshot(g),menu);g.start();for(let i=0;i<21;i++)g.tick(.5);assert.equal(g.state.tech.reinforcement,1);
 g.state.phase='victory';const ended=snapshot(g);g.tick(100);assert.equal(snapshot(g),ended);
});
test('gem combat blocks transactions and direct purchasing/upgrades never bypass draft or ingredients',()=>{
 const g=started();g.draw();g.keep(0,{x:640,y:270});g.startCombat();const old=snapshot(g);for(const command of [()=>g.draw(),()=>g.reroll(),()=>g.store(1),()=>g.sell(1),()=>g.merge(1,2),()=>g.forge('F01',1,[2]),()=>g.deployInventory(1,750,270),()=>g.build(750,270,'G04'),()=>g.upgrade(1)]){assert.equal(command().ok,false);assert.equal(snapshot(g),old);}
});
test('gem bad-luck protection guarantees a legal ordinary pairing and suspends when all gems are capped',()=>{
 const g=started(42);g.state.tech.reinforcement=1;g.state.towers=[tower(1,'G01')];g.state.pity=3;g.draw();assert.ok(g.state.draft.candidates.some(t=>t.code==='G01'&&t.level===1));
 const h=started();h.state.towers=[tower(1,'G06',1),tower(2,'G04',1,750)];h.state.pity=2;combat(h);assert.equal(h.state.pity,0);assert.equal(h.state.draftCredits,1);
});
function damageTrial(code,level=1,{boss=false,support=[],nearby=1}={}){
 const g=started();g.state.towers=[tower(1,code,level),...support];g.startCombat();g.tick(.05);g.state.enemies=Array.from({length:nearby},(_,i)=>({id:100+i,code:'X01',x:640+i*10,y:150,progress:580+i*10,remaining:GEM_LENGTH-580,hp:100000,maxHp:100000,speed:0,reward:0,boss,slowUntil:0,slowFactor:1}));
 const events=[];for(let i=0;i<40;i++){g.tick(.05);events.push(...g.drainEvents());}return {damage:g.state.enemies.filter(e=>e.id>=100).reduce((n,e)=>n+100000-e.hp,0),g,events};
}
test('gem six colors and all five recipes have real distinct combat effects',()=>{
 assert.ok(damageTrial('G01',1,{nearby:3}).damage>damageTrial('G01').damage*2);
 const frost=damageTrial('G02');assert.ok(frost.g.state.enemies.find(e=>e.id===100).slowUntil>0);
 assert.ok(damageTrial('G03',1,{nearby:3}).damage>damageTrial('G03').damage);
 assert.ok(damageTrial('G04',1,{boss:true}).damage>damageTrial('G04').damage*1.6);
 assert.equal(damageTrial('G05').damage,0);assert.ok(gemStats(tower(1,'G04'),[tower(2,'G05',1,750)]).damage>gemStats(tower(1,'G04')).damage);
 assert.ok(gemStats(tower(1,'G06')).range>gemStats(tower(1,'G04')).range);
 const molten=damageTrial('F01',3,{nearby:3});assert.ok(molten.damage>damageTrial('F01',3).damage*2);assert.ok(molten.g.state.enemies.find(e=>e.id===100).slowUntil>0);
 assert.ok(damageTrial('F02',3,{nearby:6}).damage>damageTrial('F02',3).damage*2);
 assert.ok(damageTrial('F03',3,{boss:true}).damage>damageTrial('F03',3).damage*2.9);
 const boosted=gemStats(tower(1,'G03'),[tower(2,'F04',4,750)]);assert.ok(boosted.chainRange>gemStats(tower(1,'G03')).chainRange);assert.equal(boosted.chainCount,6);
 assert.equal(damageTrial('F05',5).damage,0);const echo=damageTrial('G06',2,{support:[tower(2,'F05',5,750)]});assert.ok(echo.events.some(e=>e.type==='echo'));
});
test('gem default400 paid strategy wins seeds1/42/2026 and twenty unscreened seeds',()=>{
 const seeds=[1,42,2026,...Array.from({length:17},(_,i)=>i+2)];for(const seed of seeds){const run=playGem(seed);assert.equal(run.phase,'victory',`seed ${seed} wave ${run.wave} health ${run.health}`);assert.equal(run.wave,20);}
});
test('gem same random seed permits different retention strategies and observable results',()=>{
 const a=playGem(42),b=playGem(42,{choice:'reverse'});assert.notDeepEqual(a.log.map(w=>w.towers),b.log.map(w=>w.towers));assert.notDeepEqual([a.health,a.kills,a.gold,a.elapsed], [b.health,b.kills,b.gold,b.elapsed]);
});

test('identical paid candidate lists produce different first-wave results when only the keep decision changes',()=>{
 const games=[started(42),started(42)],spots=[{x:640,y:270},{x:530,y:270},{x:750,y:270}];
 for(const spot of spots){
  for(const game of games)assert.equal(game.draw().ok,true);
  assert.deepEqual(games[0].state.draft.candidates,games[1].state.draft.candidates);
  games.forEach((game,side)=>{
   const ranked=game.state.draft.candidates.map((candidate,i)=>({i,damage:game.statsFor(candidate).damage})).sort((a,b)=>side?a.damage-b.damage:b.damage-a.damage);
   assert.equal(game.keep(ranked[0].i,spot).ok,true);
  });
 }
 for(const game of games){assert.equal(game.startCombat().ok,true);while(game.state.phase==='playing'&&game.state.turnPhase==='combat')game.tick(.5);}
 assert.notDeepEqual(games[0].state.towers.map(t=>t.code),games[1].state.towers.map(t=>t.code));
 const result=game=>[game.state.kills,game.state.coreHealth,game.state.gold,game.state.elapsed];
 assert.notDeepEqual(result(games[0]),result(games[1]));
});

test('gem repeated restart resets the same public state and research closures, IDs and random sequence',()=>{
 const g=started(42),state=g.state,startResearch=g.startResearch,cancelResearch=g.cancelResearch;
 g.draw();const first=structuredClone(state.draft.candidates);g.keep(0,{x:640,y:270});startResearch('reinforcement');g.startCombat();g.tick(2);
 for(let i=0;i<3;i++){
  g.restart();assert.equal(g.state,state);assert.equal(g.startResearch,startResearch);assert.equal(g.cancelResearch,cancelResearch);
  assert.equal(state.gold,400);assert.equal(state.phase,'playing');assert.equal(state.turnPhase,'planning');assert.equal(state.elapsed,0);assert.equal(state.research,null);assert.deepEqual(state.tech,{deployment:0,reinforcement:0});assert.equal(state.draft,null);assert.deepEqual(state.towers,[]);assert.deepEqual(g.drainEvents(),[]);
  assert.ok(g.draw().ok);assert.deepEqual(state.draft.candidates,first);const kept=g.keep(0,{x:640,y:270});assert.equal(kept.towerId,1);
  assert.ok(startResearch('reinforcement').ok);assert.equal(state.research.remaining,10);assert.ok(cancelResearch().ok);assert.equal(state.research,null);
  assert.ok(startResearch('reinforcement').ok);g.startCombat();g.tick(.05);assert.equal(state.enemies[0].id,1);g.tick(10.95);assert.equal(state.tech.reinforcement,1);assert.equal(state.research,null);
 }
});
test('gem tick consumes the full elapsed seconds and speed, with equivalent large and small chunks',()=>{
 const a=started(),b=started();a.startResearch('reinforcement');b.startResearch('reinforcement');a.startCombat();b.startCombat();a.setSpeed(2);b.setSpeed(2);
 a.tick(6);for(let i=0;i<24;i++)b.tick(.25);
 assert.ok(Math.abs(a.state.elapsed-12)<1e-8);assert.ok(Math.abs(b.state.elapsed-12)<1e-8);assert.equal(a.state.tech.reinforcement,1);assert.equal(b.state.tech.reinforcement,1);assert.equal(a.state.enemies.length,b.state.enemies.length);
 for(let i=0;i<a.state.enemies.length;i++){assert.equal(a.state.enemies[i].id,b.state.enemies[i].id);assert.ok(Math.abs(a.state.enemies[i].progress-b.state.enemies[i].progress)<1e-7);}
 const old=snapshot(a);for(const dt of [0,-1,NaN,Infinity,-Infinity])a.tick(dt);assert.equal(snapshot(a),old);
 a.tick(1000);assert.equal(a.state.turnPhase,'planning');const elapsed=a.state.elapsed;a.tick(1000);assert.equal(a.state.elapsed,elapsed);assert.ok(elapsed<2012);
});
test('gem research start, eligibility and cancellation reject combat without changing state or events',()=>{
 const g=started();assert.ok(g.startResearch('reinforcement').ok);g.startCombat();g.drainEvents();const old=snapshot(g);
 for(const command of [()=>g.canResearch('deployment'),()=>g.startResearch('deployment'),()=>g.cancelResearch()]){assert.equal(command().ok,false);assert.equal(snapshot(g),old);assert.deepEqual(g.drainEvents(),[]);}
 g.tick(11);assert.equal(g.state.tech.reinforcement,1);const after=snapshot(g);assert.equal(g.startResearch('deployment').ok,false);assert.equal(snapshot(g),after);
});

test('gem default400 legal paid recipe plans acquire and fight with all five results; recorded commands replay without state injection',()=>{
 for(const recipe of GEM_RECIPES){
  const seen=new Set();let frames=0,lastElapsed=0;
  const run=playGem(42,{recipeTarget:recipe.code,onFrame(state,events){
   frames++;assert.ok(state.elapsed>lastElapsed);lastElapsed=state.elapsed;assert.ok(Array.isArray(events));
   for(const event of events)seen.add(event.type==='shot'?`shot:${event.code}`:event.type==='fusion'?`fusion:${event.code}`:event.type);
  }});
  assert.equal(run.initialGold,400);assert.equal(run.phase,'victory',recipe.code);assert.equal(run.wave,20);assert.ok(frames>100);
  for(const name of ['draw','reroll','keep','merge','startResearch','forge'])assert.ok(run.commands.some(c=>c.name===name),`${recipe.code} missing ${name}`);
  assert.ok(run.forges.some(f=>f.code===recipe.code));assert.ok(seen.has(`fusion:${recipe.code}`));
  if(recipe.code==='F05'){
   assert.ok(run.echoes.length>0);assert.ok(seen.has('echo'));
   for(const prerequisite of ['F01','F03']){assert.ok(run.shotsByCode[prerequisite]>0);assert.ok(run.forges.find(f=>f.code===prerequisite).wave<run.forges.find(f=>f.code==='F05').wave);}
  }else assert.ok(run.shotsByCode[recipe.code]>0);
  // Re-run only the public command journal and normal battle ticks from a fresh400 game.
  const replay=started(42);
  for(const command of run.commands){
   assert.equal(replay.state.gold,command.goldBefore,`${recipe.code} replay ${command.name} before wave${command.wave}`);
   if(command.name==='keep')assert.deepEqual(replay.state.draft.candidates[command.args[0]],command.kept);
   const result=replay[command.name](...command.args);assert.ok(result.ok,`${recipe.code} ${command.name}: ${result.message}`);
   assert.equal(replay.state.gold,command.goldAfter);
   if(command.name==='draw')assert.equal(command.goldBefore-command.goldAfter,60);
   if(command.name==='reroll')assert.ok([20,40,80].includes(command.goldBefore-command.goldAfter));
   if(command.name==='startCombat'){let ticks=0;while(replay.state.phase==='playing'&&replay.state.turnPhase==='combat'&&ticks++<10000){replay.tick(.5);replay.drainEvents();}assert.ok(ticks<10000);}
  }
  assert.equal(replay.state.phase,run.phase);assert.equal(replay.state.coreHealth,run.health);assert.equal(replay.state.gold,run.gold);assert.equal(replay.state.kills,run.kills);
  for(const forged of run.forges){const definition=GEM_RECIPES.find(r=>r.code===forged.code);assert.deepEqual(forged.materials.map(t=>[t.code,t.level]).sort(),definition.inputs.toSorted());}
 }
});
