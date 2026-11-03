import {LOOP_TOWERS,LOOP_TECHNOLOGIES,LOOP_ROUTES,LOOP_PRIORITIES,loopStats,loopUnlockLevel,upgradeQuote,loopWave,loopEnemy} from './loop-catalog.js';
import {createLoopCombat} from './loop-combat.js';
import {createResearchControls} from './research-controls.js';
import {placementStatus,createRoadPosition,advanceOnRoad} from './geometry.js';
/** @returns {any} */
const result=(ok,message,extra={})=>({ok,message,...extra});
export function createLoopGame(options={}){
 const initial=()=>({mode:'loop',phase:'menu',paused:false,speed:1,gold:options.startingGold??400,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,limit:options.limit??80,towers:[],enemies:[],walls:[],convoy:null,tech:{deployment:0,reinforcement:0},research:null,regions:[],pendingSpawns:0,endlessKills:0,endlessSupply:0,supplyCursor:0});
 const state=initial();let events=[],queue=[],spawnIn=0,nextTower=1,nextEnemy=1;
 const emit=e=>events.push(e),research=createResearchControls(state,emit,LOOP_TECHNOLOGIES,()=>state.phase==='playing'),combat=createLoopCombat(state,emit);
 function forecast(w){const entries=loopWave(w,state.endless),types=[...new Set(entries.filter(e=>!e.boss).map(e=>e.code))];return {wave:w,count:entries.length,boss:entries.some(e=>e.boss),types,entries,endless:state.endless,hpMultiplier:state.endless?4.04*(1+.01*(w-20)):1+.16*(w-1)};}
 function beginWave(){state.wave++;state.nextWaveIn=options.waveInterval??26;queue.push(...loopWave(state.wave,state.endless,options.waveSize?Math.max(1,Math.floor(options.waveSize(state.wave))):null));state.pendingSpawns=queue.length;emit({type:'wave',amount:state.wave,message:`第${state.wave}波${state.wave%5===0?' · Boss':''}`});}
 function spawn(){const entry=queue.shift(),enemy=loopEnemy(entry,nextEnemy++,createRoadPosition(options.random),options);state.enemies.push(enemy);state.pendingSpawns=queue.length;if(state.enemies.length>=state.limit){state.phase='defeat';emit({type:'defeat',message:'环路积怪已达上限'});}}
 function finishUpgrade(t){const pending=t.upgrading;delete t.upgrading;t.level++;if(pending.route)t.route=pending.route;if(t.level===3||t.level===5){t.cycles=0;t.streak=0;t.lockId=null;if(t.level===5){t.pulseIn=null;t.dividendIn=null;}}emit({type:'upgrade',x:t.x,y:t.y,code:t.code});}
 function step(dt){
  state.elapsed+=dt;research.advanceResearch(dt);
  for(const t of state.towers)if(t.upgrading){t.upgrading.remaining=Math.max(0,t.upgrading.remaining-dt);if(t.upgrading.remaining<=1e-9)finishUpgrade(t);}
  if(state.endless||state.wave<(options.waveCount??20)){state.nextWaveIn-=dt;if(state.nextWaveIn<=1e-9)beginWave();}else state.nextWaveIn=0;
  spawnIn-=dt;while(queue.length&&spawnIn<=1e-9&&state.phase==='playing'){spawn();spawnIn+=options.spawnInterval??.65;}if(!queue.length)spawnIn=0;if(state.phase!=='playing')return;
  combat.step(dt);
  for(const e of state.enemies){const slowed=Math.min(.6,combat.strength(e,'slow'))*(e.boss?.5:1);e.slowUntil=slowed?state.elapsed+.1:0;const travel=e.rootUntil>state.elapsed?0:e.speed*(1-slowed)*dt;e.progress+=travel;advanceOnRoad(e,travel,options.random);}
  if(!state.endless&&state.wave>=(options.waveCount??20)&&!queue.length&&!state.enemies.length){state.phase='victory';emit({type:'victory',message:'二十波已清场，环路守卫成功！'});}
 }
 const game={state,catalog:LOOP_TOWERS,technologies:LOOP_TECHNOLOGIES,routes:LOOP_ROUTES,priorities:LOOP_PRIORITIES,
  statsFor(t){const stats=loopStats(t,state);return {...stats,...(t.level<5?{upgradeCost:upgradeQuote(t,state).cost,upgradeDuration:upgradeQuote(t,state).duration}:{}),specialization:t.route?LOOP_ROUTES[t.code][t.route==='A'?0:1]:null};},
  forecasts(){const max=state.endless?Infinity:options.waveCount??20;return [state.wave+1,state.wave+2].filter(w=>w<=max).map(forecast);},
  start(){if(state.phase==='menu')state.phase='playing';return result(true,'开始布防');},
  restart(){Object.assign(state,initial(),{phase:'playing'});queue=[];events=[];spawnIn=0;nextTower=1;nextEnemy=1;},
  tick(seconds){if(state.phase!=='playing'||state.paused||!Number.isFinite(seconds)||seconds<=0)return;let remaining=seconds*state.speed;while(remaining>1e-9&&state.phase==='playing'){const dt=Math.min(.05,remaining);step(dt);remaining-=dt;}},
  launchWave(){if(state.phase!=='playing'||state.paused||queue.length||!state.endless&&state.wave>=(options.waveCount??20))return result(false,'当前不能提前出怪');beginWave();return result(true,'下一波开始');},
  ...research,
  canBuildType(code){if(state.phase!=='playing')return result(false,'请先开始对局');const def=LOOP_TOWERS.find(t=>t.code===code);if(!def)return result(false,'无效防御单位');const unlock=loopUnlockLevel(code);if(state.tech.deployment<unlock)return result(false,`需要部署科技 ${unlock} 级`);if(state.towers.length>=LOOP_TECHNOLOGIES.deployment.levels[state.tech.deployment].capacity)return result(false,'部署容量已满');return result(state.gold>=def.price,state.gold>=def.price?'可以建造':'金币不足');},
  canBuild(x,y,code){const s=game.canBuildType(code);return s.ok?placementStatus(x,y,state.towers):s;},
  build(x,y,code){const s=game.canBuild(x,y,code);if(!s.ok)return s;const def=LOOP_TOWERS.find(t=>t.code===code),id=nextTower++;state.gold-=def.price;state.towers.push({id,code,x,y,level:1,spent:def.price,angle:0,priority:'default',route:null,cooldown:0,cycles:0});emit({type:'build',x,y,code});return result(true,'建造完成',{towerId:id});},
  canUpgrade(id){const t=state.towers.find(t=>t.id===id);if(state.phase!=='playing'||!t)return result(false,'请先选择防御单位');if(t.upgrading)return result(false,'升级进行中');if(t.level>=5)return result(false,'已达最高等级');if(t.level>=LOOP_TECHNOLOGIES.reinforcement.levels[state.tech.reinforcement].maxTowerLevel)return result(false,`需要强化科技 ${t.level} 级`);return result(state.gold>=upgradeQuote(t,state).cost,state.gold>=upgradeQuote(t,state).cost?'可以升级':'金币不足');},
  upgrade(id,route=null){const s=game.canUpgrade(id);if(!s.ok)return s;const t=state.towers.find(t=>t.id===id);if(t.level===2&&!['A','B'].includes(route))return result(false,'升至3级请选择A或B专精');const quote=upgradeQuote(t,state);state.gold-=quote.cost;t.spent+=quote.cost;t.upgrading={...quote,remaining:quote.duration,route:t.level===2?route:null};return result(true,`升级开始，${quote.duration}秒后完成`);},
  canRespecialize(id,route){const t=state.towers.find(t=>t.id===id);if(!t||t.level<3)return result(false,'三级后可改选专精');if(state.phase!=='playing'||!state.paused||state.enemies.some(e=>e.hp>0)||queue.length)return result(false,'清空敌人与待出怪后暂停整备');if(t.upgrading)return result(false,'升级中不可改选');if(!['A','B'].includes(route)||route===t.route)return result(false,'请选择另一条专精');const cost=Math.ceil(LOOP_TOWERS.find(d=>d.code===t.code).price*.3);return result(state.gold>=cost,state.gold>=cost?`改选需要 ${cost} 金币`:'金币不足',{cost});},
  respecialize(id,route){const s=game.canRespecialize(id,route);if(!s.ok)return s;const t=state.towers.find(t=>t.id===id);state.gold-=s.cost;t.route=route;for(const key of ['cycles','streak','stacks','pulseUntil','chargeUntil','lastAttack'])t[key]=0;for(const key of ['pulseIn','markIn','dividendIn','lockId'])t[key]=null;t.cooldown=loopStats(t,state).interval;state.regions=state.regions.filter(z=>z.source!==id);for(const e of state.enemies)e.statuses=e.statuses.filter(s=>s.source!==id);return result(true,'专精已改选，技能从完整周期开始');},
  setPriority(id,priority){const t=state.towers.find(t=>t.id===id);if(state.phase!=='playing'||!t||loopStats(t,state).role==='support'||!Object.hasOwn(LOOP_PRIORITIES,priority))return result(false,'无效选敌设置');t.priority=priority;t.lockId=null;t.streak=0;return result(true,'选敌优先级已更新');},
  sell(id){const t=state.towers.find(t=>t.id===id);if(state.phase!=='playing'||!t||t.upgrading)return result(false,'当前不能出售');const amount=Math.floor(t.spent*.7);state.gold+=amount;state.towers=state.towers.filter(t=>t.id!==id);state.regions=state.regions.filter(z=>z.source!==id);for(const e of state.enemies)e.statuses=e.statuses.filter(s=>s.source!==id);emit({type:'sell',x:t.x,y:t.y,amount});return result(true,'出售完成');},
  togglePause(){if(state.phase==='playing')state.paused=!state.paused;},setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
  continueEndless(){if(state.phase!=='victory')return result(false,'请先通关');state.wave=Math.max(20,state.wave);state.endless=true;state.phase='playing';state.paused=false;state.nextWaveIn=options.waveInterval??26;state.endlessKills=0;state.endlessSupply=0;for(const t of state.towers){t.incomeIn=20;t.dividendIn=null;}return result(true,'无尽开始：固定50只，每怪1金币，补给减产并全场限额10%');},
  drainEvents(){const out=events;events=[];return out;}
 };return game;
}
