import {TOWERS, ENEMIES, MAX_LEVEL, towerStats, effectiveTowerStats} from './catalog.js';
import {TECHNOLOGIES, deploymentStats, towerUnlockLevel} from './research.js';
import {placementStatus, createRoadPosition, advanceOnRoad} from './geometry.js';
import {HARVEST_SITES,HARVEST_TARGET,HARVEST_DURATION,EXTRACTION_DURATION,SURVIVAL_DURATION,PULSE_COOLDOWN} from './modes.js';
import {defensePlacementStatus, pointOnDefenseRoute} from './defense-geometry.js';
/**
 * @param {{mode?:'loop'|'defense'|'harvest'|'storm',harvestDuration?:number,extractionDuration?:number,survivalDuration?:number,coreHealth?:number,startingGold?:number,limit?:number,waveInterval?:number,spawnInterval?:number,initialDelay?:number,waveCount?:number,waveSize?:(wave:number)=>number,enemyHealthScale?:number,enemySpeedScale?:number,rewardScale?:number,random?:()=>number}} options
 */
export function createGame(options={}) {
 const defense=options.mode==='defense',harvestMode=options.mode==='harvest',storm=options.mode==='storm';
 const finite=defense||harvestMode||storm;
 const harvestDuration=Math.max(.05,options.harvestDuration??HARVEST_DURATION);
 const extractionDuration=Math.max(.05,options.extractionDuration??EXTRACTION_DURATION);
 const survivalDuration=Math.max(.05,options.survivalDuration??SURVIVAL_DURATION);
 const missionState=()=>({harvested:0,deposits:[3,3,3],harvest:null,extractionRemaining:null,survivalRemaining:survivalDuration,stormActive:false,pulseRemaining:0});
 const coreHealth=options.coreHealth??20;
 const startingGold=options.startingGold??400;
 /** @type {{mode:string,coreHealth:number,maxCoreHealth:number,leaks:number,waveActive:boolean,attackLane:number,phase:string,paused:boolean,speed:number,gold:number,wave:number,nextWaveIn:number,elapsed:number,kills:number,endless:boolean,limit:number,towers:any[],enemies:any[],tech:{deployment:number,reinforcement:number},harvested:number,deposits:number[],harvest:null|{site:number,remaining:number},extractionRemaining:null|number,survivalRemaining:number,stormActive:boolean,pulseRemaining:number,research:null|{kind:string,level:number,cost:number,duration:number,remaining:number}}} */
 const state={mode:harvestMode?'harvest':storm?'storm':defense?'defense':'loop',coreHealth,maxCoreHealth:coreHealth,leaks:0,waveActive:false,attackLane:0,phase:'menu',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,limit:options.limit??80,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null,...missionState()};
 /** @type {any[]} */
 let events=[];
 /** @type {{code:string,boss:boolean,wave:number,lane?:number,delay?:number}[]} */
 let queue=[];
 let spawnIn=0, nextEnemyId=1, nextTowerId=1;
 const waveInterval=Math.max(.1,options.waveInterval??(harvestMode?20:storm?18:defense?12:26));
 const spawnInterval=Math.max(.02,options.spawnInterval??.65);
 const waveCount=options.waveCount??20;
 function beginWave(){
  state.wave++;state.nextWaveIn=defense?0:waveInterval;state.waveActive=true;
  state.attackLane=harvestMode&&state.harvest?HARVEST_SITES[state.harvest.site].lane:(state.wave-1)%4;
  const lanes=storm?(state.wave%2?[0,2]:[1,3]):[state.attackLane];
  const count=Math.max(1,Math.floor(options.waveSize?.(state.wave)??(harvestMode?6+state.wave:storm?4+Math.floor(state.wave/2):10+state.wave*2)));
  for(let i=0;i<count;i++)for(let j=0;j<lanes.length;j++)queue.push({code:ENEMIES[(state.wave-1+Math.floor(i/3))%12].code,boss:false,wave:state.wave,lane:lanes[j],delay:j<lanes.length-1?0:spawnInterval});
  if(state.wave%5===0)queue.push({code:'X12',boss:true,wave:state.wave,lane:lanes[0]});
  events.push({type:'wave',amount:state.wave,message:`第 ${state.wave} 波${state.wave%5===0?' · 首领来袭':''}`});
 }
 function spawn(){
  const entry=queue.shift(),def=ENEMIES.find(e=>e.code===entry.code);
  const scale=1+(entry.wave-1)*.16;
  const maxHp=def.hp*scale*(entry.boss?10:1)*(options.enemyHealthScale??1);
  state.enemies.push({id:nextEnemyId++,code:entry.code,hp:maxHp,maxHp,...(finite?{lane:entry.lane,...pointOnDefenseRoute(entry.lane,0)}:createRoadPosition(options.random)),progress:0,boss:entry.boss,speed:def.speed*(entry.boss ? .72 : 1)*(options.enemySpeedScale??1),reward:Math.max(1,Math.round(def.reward*(entry.boss?8:1)*(options.rewardScale??1))),slowUntil:0,slowFactor:1,rootUntil:0});
  if(!finite&&state.enemies.length>=state.limit){state.phase='defeat';events.push({type:'defeat',message:'环路积怪已达上限'});}
  return entry.delay??spawnInterval;
 }
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 function damage(enemy,amount,color){
  if(enemy.hp<=0)return;
  enemy.hp=Math.max(0,enemy.hp-amount);
  events.push({type:'hit',x:enemy.x,y:enemy.y,amount,color});
  if(enemy.hp===0){state.kills++;state.gold+=enemy.reward;events.push({type:'kill',x:enemy.x,y:enemy.y,code:enemy.code,amount:enemy.reward,color});}
 }
 // ponytail: at most 20 towers; use a spatial index if that limit grows.
 function combat(dt){
  for(const tower of state.towers){
   const stats=effectiveTowerStats(tower,state.towers);
   if(stats.kind==='supply'){
    tower.cooldown=(tower.cooldown??8)-dt;
    if(tower.cooldown<=0){state.gold+=stats.income;tower.cooldown+=8;events.push({type:'income',x:tower.x,y:tower.y,amount:stats.income,color:stats.color});}
   }
   if(stats.damage<=0)continue;
   tower.cooldown=Math.max(0,(tower.cooldown??0)-dt);
   if(tower.cooldown>0)continue;
   const target=state.enemies.filter(e=>e.hp>0&&distance(tower,e)<=stats.range).sort((a,b)=>finite?a.remaining-b.remaining:b.progress-a.progress)[0];
   if(!target)continue;
   tower.angle=Math.atan2(target.y-tower.y,target.x-tower.x);tower.cooldown=stats.interval;
   events.push({type:'shot',x:tower.x,y:tower.y,tx:target.x,ty:target.y,code:tower.code,color:stats.color});
   let targets=[target];
   if(['splash','frost'].includes(stats.kind))targets=state.enemies.filter(e=>e.hp>0&&distance(target,e)<=stats.splash);
   if(stats.kind==='chain'){
    while(targets.length<4){
     const last=targets[targets.length-1];
     const next=state.enemies.filter(e=>e.hp>0&&!targets.includes(e)&&distance(last,e)<=135).sort((a,b)=>distance(last,a)-distance(last,b))[0];
     if(!next)break;
     targets.push(next);events.push({type:'shot',x:last.x,y:last.y,tx:next.x,ty:next.y,code:tower.code,color:stats.color});
    }
   }
   targets.forEach((enemy,index)=>{
    damage(enemy,stats.damage*(stats.kind==='chain'?Math.pow(.8,index):1),stats.color);
    if(['slow','frost','splash'].includes(stats.kind)&&tower.code!=='T03'){
     const factor=stats.kind==='frost'?Math.max(.25,stats.slow-.15):stats.slow;
     enemy.slowFactor=enemy.slowUntil>state.elapsed?Math.min(enemy.slowFactor,factor):factor;
     enemy.slowUntil=state.elapsed+stats.duration;
    }
    if(stats.kind==='root'){
     const until=state.elapsed+(.8+.1*(tower.level-1))*(enemy.boss ? .5 : 1);
     enemy.rootUntil=storm?Math.max(enemy.rootUntil,until):until;
    }
   });
  }
  state.enemies=state.enemies.filter(e=>e.hp>0);
 }
 function step(dt){
  const previousElapsed=state.elapsed;
  state.elapsed+=dt;
  if(storm){
   state.survivalRemaining=Math.max(0,survivalDuration-state.elapsed);
   state.pulseRemaining=Math.max(0,state.pulseRemaining-dt);
   const active=(state.elapsed+1e-9)%60>=40;
   if(active!==state.stormActive){state.stormActive=active;events.push({type:'storm-change',message:active?'裂隙风暴来袭：敌人加速 25%':'裂隙风暴消退'});}
   if(Math.floor((state.elapsed+1e-9)/30)>Math.floor((previousElapsed+1e-9)/30)){state.gold+=45;events.push({type:'supply',amount:45,message:'生存补给：45 金币'});}
  }
  if(harvestMode&&state.harvest){
   state.harvest.remaining-=dt;
   if(state.harvest.remaining<=1e-9){
    const site=state.harvest.site;state.deposits[site]--;state.harvested+=40;state.gold+=60;
    events.push({type:'harvest-complete',amount:40,site,message:`${HARVEST_SITES[site].name}采集完成：40 灵能、60 金币`});
    if(state.deposits[site]>0)state.harvest.remaining+=harvestDuration;else state.harvest=null;
   }
  }
  if(state.extractionRemaining!==null)state.extractionRemaining=Math.max(0,state.extractionRemaining-dt);
  if(state.research){
   state.research.remaining=Math.max(0,state.research.remaining-dt);
   if(state.research.remaining<=1e-9){
    const {kind,level}=state.research;state.tech[kind]=level;state.research=null;
    events.push({type:'research-complete',kind,message:`${TECHNOLOGIES[kind].name} ${level} 级研究完成`});
   }
  }
  if(state.extractionRemaining===null&&(!defense||!state.waveActive)&&(harvestMode||storm||state.endless||state.wave<waveCount)){state.nextWaveIn-=dt;if(state.nextWaveIn<=1e-9)beginWave();}
  else state.nextWaveIn=0;
  spawnIn-=dt;
  while(queue.length&&spawnIn<=0&&playable()){spawnIn+=spawn();}
  if(!queue.length)spawnIn=0;
  if(!playable())return;
  for(const enemy of state.enemies){
   let factor=enemy.slowUntil>state.elapsed?enemy.slowFactor:1;
   for(const tower of state.towers){
    const stats=towerStats(tower);
    if(stats.kind==='barrier'&&distance(tower,enemy)<=stats.range)factor=Math.min(factor,stats.slow);
   }
   if(!storm&&enemy.rootUntil>state.elapsed)factor=0;
   const movementTime=storm?dt-Math.min(dt,Math.max(0,enemy.rootUntil-previousElapsed)):dt;
   const travel=enemy.speed*factor*(storm&&(previousElapsed+1e-9)%60>=40?1.25:1)*movementTime;
   enemy.progress+=travel;
   if(finite){
    Object.assign(enemy,pointOnDefenseRoute(enemy.lane,enemy.progress));
    if(enemy.arrived){
     const amount=enemy.boss?5:1;
     state.leaks++;state.coreHealth=Math.max(0,state.coreHealth-amount);
     events.push({type:'core-hit',x:enemy.x,y:enemy.y,amount,message:`核心受到 ${amount} 点伤害`});
     if(state.coreHealth===0){
      state.enemies=state.enemies.filter(e=>!e.arrived);
      state.phase='defeat';events.push({type:'defeat',message:'核心耐久归零，防线失守'});return;
     }
    }
   }else advanceOnRoad(enemy,travel,options.random);
  }
  if(finite)state.enemies=state.enemies.filter(e=>!e.arrived);
  combat(dt);
  if(defense&&state.waveActive&&!queue.length&&!state.enemies.length){
   const amount=40+5*state.wave;state.gold+=amount;
   state.waveActive=false;state.nextWaveIn=waveInterval;
   events.push({type:'wave-clear',amount,message:`第 ${state.wave} 波清场，补给 ${amount} 金币`});
  }
  if((harvestMode&&state.extractionRemaining!==null&&state.extractionRemaining<=1e-9)||(storm&&!state.endless&&state.survivalRemaining<=1e-9)){state.phase='victory';events.push({type:'victory',message:harvestMode?'撤离成功，灵能已安全转移！':'生存目标达成，裂隙风暴守卫成功！'});}
  if(!harvestMode&&!storm&&!state.endless&&state.wave>=waveCount&&!queue.length&&!state.enemies.length){state.phase='victory';events.push({type:'victory',message:defense?'二十波已清场，核心守卫成功！':'二十波已清场，环路守卫成功！'});}
 }
 const result=(ok,message)=>({ok,message});
 const playable=()=>state.phase==='playing';
 const game={state,
 start(){if(state.phase==='menu') state.phase='playing';},
 restart(){Object.assign(state,{coreHealth,maxCoreHealth:coreHealth,leaks:0,waveActive:false,attackLane:0,phase:'playing',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null,...missionState()});events=[];queue=[];spawnIn=0;nextEnemyId=1;nextTowerId=1;},
 tick(seconds){
  if(!Number.isFinite(seconds)||seconds<=0||!playable()||state.paused)return;
  let remaining=seconds*state.speed;
  while(remaining>1e-9&&playable()) {const dt=Math.min(.05,remaining,storm&&!state.endless?state.survivalRemaining:Infinity,state.extractionRemaining??Infinity);step(dt);remaining-=dt;}
 },
 launchWave(){
  if(!playable()||state.paused||state.extractionRemaining!==null||queue.length||(defense&&state.waveActive)||(!harvestMode&&!storm&&!state.endless&&state.wave>=waveCount))return result(false,'当前不能提前出怪');
  beginWave();return result(true,'下一波开始');
 },
 startHarvest(site){
  if(!harvestMode||!playable())return result(false,'当前不能采集');
  if(state.extractionRemaining!==null)return result(false,'撤离期间不能采集');
  if(!Number.isInteger(site)||!HARVEST_SITES[site])return result(false,'无效采集点');
  if(state.deposits[site]<=0)return result(false,'该采集点已耗尽');
  if(state.harvest?.site===site)return result(false,'正在采集该灵脉');
  state.harvest={site,remaining:harvestDuration};
  const message=`开始采集${HARVEST_SITES[site].name}`;events.push({type:'harvest-start',site,message});return result(true,message);
 },
 stopHarvest(){
  if(!harvestMode||!playable()||state.extractionRemaining!==null||!state.harvest)return result(false,'当前不能停止采集');
  state.harvest=null;const message='采集已停止';events.push({type:'harvest-stop',message});return result(true,message);
 },
 evacuate(){
  if(!harvestMode||!playable()||state.extractionRemaining!==null||state.harvested<HARVEST_TARGET)return result(false,'需要采集 240 灵能后启动撤离');
  state.harvest=null;state.extractionRemaining=extractionDuration;state.nextWaveIn=0;
  const pending=queue;queue=[];
  for(let i=0;i<6;i++)for(let lane=0;lane<4;lane++)queue.push({code:'X01',boss:false,wave:Math.max(1,state.wave),lane});
  while(queue.length)spawn();
  queue=pending;
  const message='四路伏击来袭，坚持至撤离完成';events.push({type:'evacuation-start',message});return result(true,message);
 },
 overloadPulse(){
  if(!storm||!playable()||state.pulseRemaining>1e-9)return result(false,'过载脉冲尚不可用');
  if(!state.enemies.some(enemy=>enemy.hp>0))return result(false,'没有可攻击的敌人');
  state.pulseRemaining=PULSE_COOLDOWN;
  for(const enemy of state.enemies){damage(enemy,enemy.maxHp*(enemy.boss?.12:.35),'#a8eaff');enemy.rootUntil=Math.max(enemy.rootUntil,state.elapsed+2);}
  state.enemies=state.enemies.filter(enemy=>enemy.hp>0);
  const message='过载脉冲：伤害并定身 2 秒';events.push({type:'pulse',x:640,y:360,message});return result(true,message);
 },
 pulse(){return game.overloadPulse();},
 canResearch(kind){
  if(!playable())return result(false,'请先开始对局');
  const technology=Object.hasOwn(TECHNOLOGIES,kind)?TECHNOLOGIES[kind]:null;
  if(!technology)return result(false,'无效科技');
  if(state.research)return result(false,'已有研究进行中，请先完成或取消');
  const next=technology.levels[state.tech[kind]+1];
  if(!next)return result(false,'科技已达最高等级');
  if(state.gold<next.cost)return result(false,'金币不足');
  return result(true,'可以开始研究');
 },
 startResearch(kind){
  const status=game.canResearch(kind);if(!status.ok)return status;
  const level=state.tech[kind]+1,{cost,duration}=TECHNOLOGIES[kind].levels[level];
  state.gold-=cost;state.research={kind,level,cost,duration,remaining:duration};
  const message=`${TECHNOLOGIES[kind].name} ${level} 级开始研究`;
  events.push({type:'research-start',kind,message});return result(true,message);
 },
 cancelResearch(){
  if(!playable())return result(false,'当前不能取消研究');
  if(!state.research)return result(false,'没有进行中的研究');
  const {kind,cost}=state.research;state.gold+=cost;state.research=null;
  const message=`${TECHNOLOGIES[kind].name}研究已取消，退还 ${cost} 金币`;
  events.push({type:'research-cancel',kind,message});return result(true,message);
 },
 canBuildType(code){
  if(!playable())return result(false,'请先开始对局');
  const def=TOWERS.find(t=>t.code===code);
  if(!def)return result(false,'无效防御单位');
  const required=towerUnlockLevel(code);
  if(state.tech.deployment<required)return result(false,`需要部署科技 ${required} 级`);
  if(state.towers.length>=deploymentStats(state.tech.deployment).capacity)return result(false,'部署容量已满，请研究部署科技或出售防御单位');
  if(state.gold<def.price)return result(false,'金币不足');
  return result(true,'可以建造');
 },
 /** @param {number} x @param {number} y @param {string} code */
 canBuild(x,y,code){
  const status=game.canBuildType(code);if(!status.ok)return status;
  return (finite?defensePlacementStatus:placementStatus)(x,y,state.towers);
 },
 /** @param {number} x @param {number} y @param {string} code @returns {{ok:boolean,message:string,towerId?:number}} */
 build(x,y,code){
  const status=game.canBuild(x,y,code);
  if(!status.ok)return status;
  const def=TOWERS.find(t=>t.code===code),towerId=nextTowerId++;
  state.gold-=def.price;
  state.towers.push({id:towerId,code,level:1,spent:def.price,x,y,angle:0});
  events.push({type:'build',x,y,code});return {ok:true,message:'建造完成',towerId};
 },
 canUpgrade(id){
  if(!playable()) return result(false,'当前不能升级');
  const tower=state.towers.find(t=>t.id===id);
  if(!tower) return result(false,'请先选择防御单位');
  if(tower.level>=MAX_LEVEL) return result(false,'已达最高等级');
  if(tower.level>=TECHNOLOGIES.reinforcement.levels[state.tech.reinforcement].maxTowerLevel)return result(false,`需要强化科技 ${tower.level} 级`);
  const cost=towerStats(tower).upgradeCost;
  if(state.gold<cost) return result(false,'金币不足');
  return result(true,'可以升级');
 },
 upgrade(id){
  const status=game.canUpgrade(id);if(!status.ok)return status;
  const tower=state.towers.find(t=>t.id===id),cost=towerStats(tower).upgradeCost;
  state.gold-=cost;tower.spent+=cost;tower.level++;
  events.push({type:'upgrade',x:tower.x,y:tower.y,code:tower.code});return result(true,'升级完成');
 },
 sell(id){
  if(!playable()) return result(false,'当前不能出售');
  const tower=state.towers.find(t=>t.id===id);
  if(!tower) return result(false,'防御单位不存在');
  const amount=towerStats(tower).sellValue;state.gold+=amount;state.towers=state.towers.filter(t=>t!==tower);
  events.push({type:'sell',x:tower.x,y:tower.y,amount});return result(true,'出售完成');
 },
 togglePause(){if(playable()) state.paused=!state.paused;},
 setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
 continueEndless(){
  if(harvestMode)return result(false,'灵脉采集撤离后不能进入无尽');
  if(state.phase!=='victory')return result(false,'请先通关');
  state.phase='playing';state.endless=true;state.paused=false;state.nextWaveIn=waveInterval;
  return result(true,'无尽挑战开始');
 },
 drainEvents(){const drained=events;events=[];return drained;}
 };return game;
}
