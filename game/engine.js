import {TOWERS, ENEMIES, MAX_LEVEL, towerStats, effectiveTowerStats} from './catalog.js';
import {TECHNOLOGIES, deploymentStats, towerUnlockLevel} from './research.js';
import {placementStatus, createRoadPosition, advanceOnRoad} from './geometry.js';
/**
 * @param {{startingGold?:number,limit?:number,waveInterval?:number,spawnInterval?:number,initialDelay?:number,waveCount?:number,waveSize?:(wave:number)=>number,enemyHealthScale?:number,enemySpeedScale?:number,rewardScale?:number,random?:()=>number}} options
 */
export function createGame(options={}) {
 const startingGold=options.startingGold??400;
 /** @type {{phase:string,paused:boolean,speed:number,gold:number,wave:number,nextWaveIn:number,elapsed:number,kills:number,endless:boolean,limit:number,towers:any[],enemies:any[],tech:{deployment:number,reinforcement:number},research:null|{kind:string,level:number,cost:number,duration:number,remaining:number}}} */
 const state={phase:'menu',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,limit:options.limit??80,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null};
 /** @type {any[]} */
 let events=[];
 /** @type {{code:string,boss:boolean,wave:number}[]} */
 let queue=[];
 let spawnIn=0, nextEnemyId=1, nextTowerId=1;
 const waveInterval=Math.max(.1,options.waveInterval??26);
 const spawnInterval=Math.max(.02,options.spawnInterval??.65);
 const waveCount=options.waveCount??20;
 function beginWave(){
  state.wave++;state.nextWaveIn=waveInterval;
  const count=Math.max(1,Math.floor(options.waveSize?.(state.wave)??(10+state.wave*2)));
  for(let i=0;i<count;i++) queue.push({code:ENEMIES[(state.wave-1+Math.floor(i/3))%12].code,boss:false,wave:state.wave});
  if(state.wave%5===0)queue.push({code:'X12',boss:true,wave:state.wave});
  events.push({type:'wave',amount:state.wave,message:`第 ${state.wave} 波${state.wave%5===0?' · 首领来袭':''}`});
 }
 function spawn(){
  const entry=queue.shift(),def=ENEMIES.find(e=>e.code===entry.code);
  const scale=1+(entry.wave-1)*.16;
  const maxHp=def.hp*scale*(entry.boss?10:1)*(options.enemyHealthScale??1);
  state.enemies.push({id:nextEnemyId++,code:entry.code,hp:maxHp,maxHp,...createRoadPosition(options.random),progress:0,boss:entry.boss,speed:def.speed*(entry.boss ? .72 : 1)*(options.enemySpeedScale??1),reward:Math.max(1,Math.round(def.reward*(entry.boss?8:1)*(options.rewardScale??1))),slowUntil:0,slowFactor:1,rootUntil:0});
  if(state.enemies.length>=state.limit){state.phase='defeat';events.push({type:'defeat',message:'环路积怪已达上限'});}
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
   const target=state.enemies.filter(e=>e.hp>0&&distance(tower,e)<=stats.range).sort((a,b)=>b.progress-a.progress)[0];
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
    if(stats.kind==='root')enemy.rootUntil=state.elapsed+(.8+.1*(tower.level-1))*(enemy.boss ? .5 : 1);
   });
  }
  state.enemies=state.enemies.filter(e=>e.hp>0);
 }
 function step(dt){
  state.elapsed+=dt;
  if(state.research){
   state.research.remaining=Math.max(0,state.research.remaining-dt);
   if(state.research.remaining<=1e-9){
    const {kind,level}=state.research;state.tech[kind]=level;state.research=null;
    events.push({type:'research-complete',kind,message:`${TECHNOLOGIES[kind].name} ${level} 级研究完成`});
   }
  }
  if(state.endless||state.wave<waveCount){state.nextWaveIn-=dt;if(state.nextWaveIn<=1e-9)beginWave();}
  else state.nextWaveIn=0;
  spawnIn-=dt;
  while(queue.length&&spawnIn<=0&&playable()){spawn();spawnIn+=spawnInterval;}
  if(!queue.length)spawnIn=0;
  if(!playable())return;
  for(const enemy of state.enemies){
   let factor=enemy.slowUntil>state.elapsed?enemy.slowFactor:1;
   for(const tower of state.towers){
    const stats=towerStats(tower);
    if(stats.kind==='barrier'&&distance(tower,enemy)<=stats.range)factor=Math.min(factor,stats.slow);
   }
   if(enemy.rootUntil>state.elapsed)factor=0;
   const travel=enemy.speed*factor*dt;
   enemy.progress+=travel;
   advanceOnRoad(enemy,travel,options.random);
  }
  combat(dt);
  if(!state.endless&&state.wave>=waveCount&&!queue.length&&!state.enemies.length){state.phase='victory';events.push({type:'victory',message:'二十波已清场，环路守卫成功！'});}
 }
 const result=(ok,message)=>({ok,message});
 const playable=()=>state.phase==='playing';
 const game={state,
 start(){if(state.phase==='menu') state.phase='playing';},
 restart(){Object.assign(state,{phase:'playing',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null});events=[];queue=[];spawnIn=0;nextEnemyId=1;nextTowerId=1;},
 tick(seconds){
  if(!Number.isFinite(seconds)||seconds<=0||!playable()||state.paused)return;
  let remaining=seconds*state.speed;
  while(remaining>1e-9&&playable()) {const dt=Math.min(.05,remaining);step(dt);remaining-=dt;}
 },
 launchWave(){
  if(!playable()||state.paused||queue.length||(!state.endless&&state.wave>=waveCount))return result(false,'当前不能提前出怪');
  beginWave();return result(true,'下一波开始');
 },
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
  return placementStatus(x,y,state.towers);
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
  if(state.phase!=='victory')return result(false,'请先通关');
  state.phase='playing';state.endless=true;state.paused=false;state.nextWaveIn=waveInterval;
  return result(true,'无尽挑战开始');
 },
 drainEvents(){const drained=events;events=[];return drained;}
 };return game;
}
