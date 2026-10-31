import {LEGION_FIGHTERS,LEGION_MERCENARIES,LEGION_TECHNOLOGIES,LEGION_RULES,legionStats} from './legion-catalog.js';
import {LEGION_KING,legionPlacement,moveLegionUnit} from './legion-geometry.js';
import {createResearchControls} from './research-controls.js';

export function createLegionGame(options={}){
 const events=[],result=(ok,message,extra={})=>({ok,message,...extra});
 const emit=event=>events.push(event);
 let nextId=1,accumulator=0;
 const createSide=id=>({id,gold:options.startingGold??LEGION_RULES.startingGold,mythium:LEGION_RULES.startingMythium,workers:LEGION_RULES.startingWorkers,income:LEGION_RULES.startingIncome,tech:{deployment:0,reinforcement:0},research:null,fighters:[],invaders:[],pendingInvaders:[],orders:[],committedOrders:[],ledger:[],kills:0,lastLeaks:0,king:{...LEGION_KING,hp:LEGION_RULES.king.hp,maxHp:LEGION_RULES.king.hp,damage:LEGION_RULES.king.damage,attack:LEGION_RULES.king.damage,range:LEGION_RULES.king.range,interval:LEGION_RULES.king.interval,cooldown:0,level:0,kind:'king'},round:{leaks:0,kingDamage:0,kills:0,gold:0}});
 const state={mode:'legion',phase:'menu',turnPhase:'planning',paused:false,speed:1,wave:0,elapsed:0,kills:0,walls:[],convoy:null,sides:{player:createSide('player'),ai:createSide('ai')},seed:options.seed??1,battleLog:[],reports:[],viewSide:'player',effects:[],projectiles:[]};
 Object.defineProperties(state,{towers:{get:()=>state.sides.player.fighters},enemies:{get:()=>state.sides.player.invaders},gold:{get:()=>state.sides.player.gold,set:value=>{state.sides.player.gold=value;}},coreHealth:{get:()=>state.sides.player.king.hp},tech:{get:()=>state.sides.player.tech},research:{get:()=>state.sides.player.research},capacity:{get:()=>LEGION_TECHNOLOGIES.deployment.levels[state.sides.player.tech.deployment].capacity}});
 const planning=()=>state.phase==='playing'&&state.turnPhase==='planning'&&!state.paused;
 function ledger(side,kind,gold=0,mythium=0,extra={}){side.ledger.push({wave:state.wave,kind,gold,mythium,...extra});}
 function commandsFor(id){
  const side=state.sides[id];
  if(!side)throw new Error('Unknown legion side');
  const tech=createResearchControls(side,event=>{ledger(side,event.type,event.type==='research-start'?-(side.research?.cost||0):0,0,{research:side.research?{...side.research}:null});emit({...event,side:id});},LEGION_TECHNOLOGIES,planning);
  const cancelResearch=tech.cancelResearch;
  tech.cancelResearch=()=>{const refund=side.research?.cost||0;const status=cancelResearch();if(status.ok)ledger(side,'research-refund',refund);return status;};
  function canBuildType(code){
   const base=LEGION_FIGHTERS.find(f=>f.code===code);if(!planning()||!base)return result(false,'准备阶段才能部署有效守军');
   const defs=LEGION_TECHNOLOGIES.deployment.levels;
   if(!defs.slice(0,side.tech.deployment+1).some(d=>d.unlocks.includes(code)))return result(false,'需要部署科技');
   if(side.fighters.length>=defs[side.tech.deployment].capacity)return result(false,'编制已满');
   return side.gold>=base.price?result(true,'可以部署'):result(false,'金币不足');
  }
  function canBuild(x,y,code){const status=canBuildType(code);return !status.ok?status:legionPlacement(x,y,side.fighters)?status:result(false,'请在部署区留足单位间距');}
  function build(x,y,code){const status=canBuild(x,y,code);if(!status.ok)return status;
   const base=LEGION_FIGHTERS.find(f=>f.code===code);const fighter={...legionStats({code}),id:nextId++,code,assetCode:base.assetCode,x,y,homeX:x,homeY:y,level:1,spent:base.price,cooldown:0,radius:15};
   side.gold-=base.price;side.fighters.push(fighter);ledger(side,'build',-base.price,0,{code,id:fighter.id});return result(true,'守军已部署',{towerId:fighter.id,fighterId:fighter.id});}
  function canUpgrade(unitId){const f=side.fighters.find(f=>f.id===unitId);if(!planning()||!f)return result(false,'当前不能强化');
   if(f.level>=LEGION_TECHNOLOGIES.reinforcement.levels[side.tech.reinforcement].maxTowerLevel)return result(false,'需要强化科技');
   return side.gold>=legionStats(f).upgradeCost?result(true,'可以强化'):result(false,'金币不足');}
  function upgrade(unitId){const status=canUpgrade(unitId);if(!status.ok)return status;const f=side.fighters.find(f=>f.id===unitId),cost=legionStats(f).upgradeCost;
   side.gold-=cost;f.spent+=cost;f.level++;Object.assign(f,legionStats(f));ledger(side,'upgrade',-cost,0,{id:unitId});return result(true,'守军已强化');}
  function sell(unitId){const index=side.fighters.findIndex(f=>f.id===unitId);if(!planning()||index<0)return result(false,'当前不能出售');
   const gold=legionStats(side.fighters[index]).sellValue;side.gold+=gold;side.fighters.splice(index,1);ledger(side,'sell',gold);return result(true,'已出售');}
  function buyWorker(){if(!planning()||side.gold<LEGION_RULES.workerCost||side.workers>=LEGION_RULES.maxWorkers)return result(false,`工人需${LEGION_RULES.workerCost}金币，最多${LEGION_RULES.maxWorkers}名`);side.gold-=LEGION_RULES.workerCost;side.workers++;ledger(side,'worker',-LEGION_RULES.workerCost);return result(true,'工人已增加');}
  function queueMercenary(code){const merc=LEGION_MERCENARIES.find(m=>m.code===code);if(!planning()||!merc||side.orders.length>=LEGION_RULES.maxOrders||side.mythium<merc.cost)return result(false,'军需不足或订单已满');
   side.mythium-=merc.cost;const order={id:nextId++,code,cost:merc.cost,income:merc.income};side.orders.push(order);ledger(side,'order',0,-merc.cost,{id:order.id,code});return result(true,'派兵订单已加入',{orderId:order.id});}
  function cancelMercenary(orderId){const index=side.orders.findIndex(o=>o.id===orderId);if(!planning()||index<0)return result(false,'无法取消此订单');const [order]=side.orders.splice(index,1);side.mythium+=order.cost;ledger(side,'cancel-order',0,order.cost,{id:order.id});return result(true,'军需已全额返还');}
  function upgradeKing(){if(!planning()||side.mythium<LEGION_RULES.king.upgradeCost||side.king.level>=LEGION_RULES.king.maxLevel)return result(false,`国王升级需${LEGION_RULES.king.upgradeCost}军需，最多${LEGION_RULES.king.maxLevel}级`);side.mythium-=LEGION_RULES.king.upgradeCost;side.king.level++;side.king.hp+=LEGION_RULES.king.upgradeHp;side.king.maxHp+=LEGION_RULES.king.upgradeHp;side.king.damage+=LEGION_RULES.king.upgradeDamage;side.king.attack=side.king.damage;ledger(side,'king-upgrade',0,-LEGION_RULES.king.upgradeCost);return result(true,'国王已强化');}
  return {...tech,canBuildType,canBuild,build,canUpgrade,upgrade,sell,buyWorker,queueMercenary,cancelMercenary,upgradeKing};
 }
 const controls={player:commandsFor('player'),ai:commandsFor('ai')};
 function publicIntel(id){const s=state.sides[id];return {id,king:{...s.king},fighters:s.fighters.map(f=>({...f})),workers:s.workers,income:s.income,lastLeaks:s.lastLeaks,tech:{...s.tech}};}
 function aiPlan(){
  if(options.ai===false)return;
  const side=state.sides.ai,cmd=controls.ai,intel=publicIntel('player');
  // Decisions see the same public roster as scouting. Never inspect enemy orders or funds.
  const points=[[600,370],[680,370],[595,510],[680,510],[510,440],[770,440],[510,550],[770,550],[430,420],[850,420],[430,550],[850,550]];
  if(!side.fighters.length){cmd.build(...points[0],'T01');cmd.build(...points[1],'T01');cmd.build(...points[2],'T04');cmd.build(...points[3],'T02');}
  if(state.wave>0){
   if(side.tech.deployment===0&&side.fighters.length>=4&&side.gold>=175)cmd.startResearch('deployment');
   if(!side.research&&side.tech.reinforcement===0&&side.gold>=150)cmd.startResearch('reinforcement');
   for(const f of side.fighters)if(side.gold>=140)cmd.upgrade(f.id);
   if(side.gold>=120){const p=points[side.fighters.length];if(p)cmd.build(...p,side.fighters.length%3===0?'T03':'T01');}
   if(side.gold>=100&&side.workers<5&&side.lastLeaks<3)cmd.buyWorker();
  }
  if(side.king.hp<500)cmd.upgradeKing();
  const code=intel.fighters.filter(f=>f.range>100).length>=3?'X04':'X08';
  if(state.wave%3===2){let n=0;while(n++<3&&cmd.queueMercenary(code).ok){/* bounded legal orders */}}
 }
 function spawn(side,code,index,wave,owner=null){
  const merc=LEGION_MERCENARIES.find(m=>m.code===code),growth=Math.pow(LEGION_RULES.waves.growth,Math.max(0,wave-1))*Math.pow(LEGION_RULES.waves.lateGrowth,Math.max(0,wave-LEGION_RULES.waves.lateGrowthAfter));
  const base=merc?{...merc,hp:merc.hp*(1+LEGION_RULES.waves.mercenaryHpGrowth*(wave-1)),damage:merc.damage*(1+LEGION_RULES.waves.mercenaryDamageGrowth*(wave-1))}:{...LEGION_RULES.waves.basic,hp:LEGION_RULES.waves.basic.hp*growth,damage:LEGION_RULES.waves.basic.damage*growth};
  return {...base,id:nextId++,maxHp:base.hp,x:490+(index%6)*58,y:145+Math.floor(index/6)*37,cooldown:LEGION_RULES.waves.initialCooldown,radius:15,owner,leaked:false,slowUntil:0};
 }
 function releaseInvaders(side){
  // Thirty nonoverlapping staging positions, all north of deployment. Larger
  // waves wait off-map until a real vacancy exists rather than piling up.
  for(let index=0;index<30&&side.pendingInvaders.length;index++){
   const x=490+(index%6)*58,y=145+Math.floor(index/6)*37;
   if([...side.fighters,...side.invaders].some(unit=>unit.hp>0&&Math.hypot(unit.x-x,unit.y-y)<30.00001))continue;
   const unit=side.pendingInvaders.shift();unit.x=x;unit.y=y;side.invaders.push(unit);
  }
 }
 function startCombat(){
  if(!planning())return result(false,'当前不能开战');
  state.wave++;state.turnPhase='combat';
  for(const side of Object.values(state.sides)){
   side.round={leaks:0,kingDamage:0,kills:0,gold:0};side.committedOrders=side.orders.map(o=>({...o}));side.orders=[];
   const income=side.committedOrders.reduce((sum,o)=>sum+o.income,0);side.income+=income;ledger(side,'commit',0,0,{income,orders:side.committedOrders.map(o=>({...o}))});
   for(const f of side.fighters){f.homeX=f.x;f.homeY=f.y;Object.assign(f,legionStats(f));f.cooldown=0;}
  }
  const count=LEGION_RULES.waves.initialCount+Math.floor(state.wave*LEGION_RULES.waves.extraPerWave);
  for(const side of Object.values(state.sides)){
   const other=state.sides[side.id==='player'?'ai':'player'];
   side.invaders=[];side.pendingInvaders=Array.from({length:count},(_,i)=>spawn(side,'X01',i,state.wave));
   other.committedOrders.forEach((order,i)=>side.pendingInvaders.push(spawn(side,order.code,count+i,state.wave,other.id)));releaseInvaders(side);
  }
  emit({type:'wave-start',wave:state.wave,message:`第${state.wave}回合开战`});return result(true,'双方已锁定阵容和派兵');
 }
 function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
 function move(unit,target,dt,obstacles){const d=distance(unit,target);if(!d)return;unit.angle=Math.atan2(target.y-unit.y,target.x-unit.x);const amount=Math.min(unit.speed*dt*(unit.slowUntil>state.elapsed?LEGION_RULES.effects.slowSpeedMultiplier:1),Math.max(0,d-unit.range)),dx=(target.x-unit.x)/d*amount,dy=(target.y-unit.y)/d*amount;const moved=moveLegionUnit(unit,dx,dy,obstacles);if(moved<1){const left=1-moved;if(Math.abs(dx)>Math.abs(dy)){if(moveLegionUnit(unit,dx*left,0,obstacles)<.001)moveLegionUnit(unit,0,dy*left,obstacles);}else if(moveLegionUnit(unit,0,dy*left,obstacles)<.001)moveLegionUnit(unit,dx*left,0,obstacles);}}
 function battleSide(side,dt,hits){
  releaseInvaders(side);
  const living=side.fighters.filter(f=>f.hp>0),invaders=side.invaders.filter(f=>f.hp>0),king=side.king,obstacles=[...living,...invaders];
  function hit(target,damage,attacker,splash=false){const ward=splash&&invaders.some(f=>f.kind==='ward'&&distance(f,target)<=LEGION_RULES.effects.wardRadius);hits.push({target,damage:damage*(ward?LEGION_RULES.effects.wardDamageMultiplier:1),attacker,side});}
  for(const f of living){
   f.cooldown-=dt;const targets=invaders.slice().sort((a,b)=>distance(f,a)-distance(f,b)),target=targets[0];if(!target)continue;
   f.targetId=target.id;move(f,target,dt,obstacles);
   if(distance(f,target)<=f.range+2&&f.cooldown<=0){
    f.cooldown=f.interval;const boost=living.some(a=>a.kind==='support'&&distance(a,f)<=LEGION_RULES.effects.supportRadius)?LEGION_RULES.effects.supportDamageMultiplier:1;
    if(f.kind==='splash')for(const enemy of targets.filter(e=>distance(target,e)<=LEGION_RULES.effects.splashRadius))hit(enemy,f.damage*boost,f,true);else hit(target,f.damage*boost,f);
    if(f.kind==='slow')target.slowUntil=state.elapsed+LEGION_RULES.effects.slowDuration;
    if(f.kind==='healer'){const patient=living.filter(a=>distance(a,f)<=LEGION_RULES.effects.healRadius).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(patient)hit(patient,-LEGION_RULES.effects.healAmount,f);}
    emit({type:'attack',side:side.id,x:f.x,y:f.y,targetX:target.x,targetY:target.y,kind:f.kind});
   }
  }
  for(const enemy of invaders){
   enemy.cooldown-=dt;
   const backline=living.filter(f=>f.range>LEGION_RULES.effects.raiderBacklineRange);const pool=enemy.kind==='raider'&&backline.length?backline:living;
   const target=pool.slice().sort((a,b)=>distance(enemy,a)-distance(enemy,b))[0]||king;
   enemy.targetId=target.id??'king';move(enemy,target,dt,obstacles);
   if(target===king&&!enemy.leaked&&distance(enemy,king)<=enemy.range+2){enemy.leaked=true;side.round.leaks++;}
   if(distance(enemy,target)<=enemy.range+2&&enemy.cooldown<=0){enemy.cooldown=enemy.interval;hit(target,enemy.damage,enemy);}
  }
  king.cooldown-=dt;
  const target=invaders.filter(e=>distance(e,king)<=king.range).sort((a,b)=>distance(a,king)-distance(b,king))[0];
  if(target&&king.cooldown<=0){king.cooldown=king.interval;hit(target,king.damage,king);emit({type:'king-attack',side:side.id,x:king.x,y:king.y,targetX:target.x,targetY:target.y});}
 }
 function settle(){
  const report={wave:state.wave,sides:{}};
  for(const side of Object.values(state.sides)){
   const other=state.sides[side.id==='player'?'ai':'player'];const reward=side.income+Math.min(LEGION_RULES.maxLeakGold,other.round.leaks*LEGION_RULES.leakGoldPerEnemy),mythium=LEGION_RULES.baseMythium+side.workers*LEGION_RULES.mythiumPerWorker;
   side.gold+=reward;side.mythium+=mythium;side.lastLeaks=side.round.leaks;ledger(side,'round-income',reward,mythium);
   report.sides[side.id]={...side.round,goldIncome:reward,mythiumIncome:mythium,kingHp:side.king.hp,orders:side.committedOrders.map(o=>({...o}))};
   for(const f of side.fighters){Object.assign(f,legionStats(f));f.x=f.homeX;f.y=f.homeY;f.cooldown=0;}
  }
  state.reports.push(report);state.battleLog.push(report);state.turnPhase='planning';aiPlan();emit({type:'round-end',message:`第${state.wave}回合结算`,report});
 }
 function step(dt){
  state.elapsed+=dt;for(const id of ['player','ai'])controls[id].advanceResearch(dt);
  const hits=[];for(const side of Object.values(state.sides))battleSide(side,dt,hits);
  // Resolve the entire frame only after both battlefields have produced attacks.
  for(const {target,damage,side} of hits){const previous=target.hp;target.hp=Math.min(target.maxHp,target.hp-damage);if(target===side.king)side.round.kingDamage+=Math.max(0,damage);emit({type:damage<0?'heal':'damage',side:side.id,targetId:target.id??'king',x:target.x,y:target.y,damage});if(previous>0&&target.hp<=0)emit({type:target===side.king?'king-death':'unit-death',side:side.id,targetId:target.id,code:target.assetCode??target.code,x:target.x,y:target.y});}
  for(const side of Object.values(state.sides)){
   for(const enemy of side.invaders.filter(e=>e.hp<=0)){
    const reward=enemy.leaked?Math.floor(enemy.reward*LEGION_RULES.leakedKillRewardFactor):enemy.reward;side.gold+=reward;side.kills++;side.round.kills++;side.round.gold+=reward;ledger(side,'kill',reward,0,{id:enemy.id,leaked:enemy.leaked});
   }
   side.invaders=side.invaders.filter(e=>e.hp>0);
  }
  state.kills=state.sides.player.kills;
  const deadPlayer=state.sides.player.king.hp<=0,deadAI=state.sides.ai.king.hp<=0;
  if(deadPlayer||deadAI){state.phase=deadPlayer&&deadAI?'draw':deadPlayer?'defeat':'victory';emit({type:state.phase,message:state.phase==='draw'?'双方国王同时倒下':deadAI?'击败AI国王':'国王失守'});return;}
  if(Object.values(state.sides).every(s=>s.invaders.length===0&&s.pendingInvaders.length===0))settle();
 }
 function tick(dt){if(state.phase!=='playing'||state.paused||state.turnPhase!=='combat'||!Number.isFinite(dt)||dt<=0)return;
  accumulator+=dt*state.speed;while(accumulator>=.05&&state.phase==='playing'&&state.turnPhase==='combat'){step(.05);accumulator-=.05;}if(state.turnPhase!=='combat'||state.phase!=='playing')accumulator=0;
 }
 function reset(){nextId=1;accumulator=0;state.sides.player=createSide('player');state.sides.ai=createSide('ai');controls.player=commandsFor('player');controls.ai=commandsFor('ai');state.phase='menu';state.turnPhase='planning';state.paused=false;state.speed=1;state.wave=0;state.elapsed=0;state.kills=0;state.reports=[];state.battleLog=[];state.viewSide='player';events.length=0;}
 const game={state,catalog:LEGION_FIGHTERS,technologies:LEGION_TECHNOLOGIES,statsFor:legionStats,commandsFor:id=>controls[id],publicIntel,
  start(){reset();state.phase='playing';aiPlan();return result(true,'对战AI：准备部署');},reset,restart(){reset();state.phase='playing';aiPlan();},tick,startCombat,
  setPaused(value){state.paused=!!value;},togglePause(){state.paused=!state.paused;},setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},returnToMenu(){state.phase='menu';state.paused=false;},drainEvents(){return events.splice(0);},scout(id){if(state.sides[id])state.viewSide=id;return publicIntel(state.viewSide);}};
 for(const name of Object.keys(controls.player))if(name!=='advanceResearch')game[name]=(...args)=>controls.player[name](...args);
 return game;
}
