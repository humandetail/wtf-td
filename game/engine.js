import {createLoopGame} from './loop-session.js';
import {beginTowerUpgrade,advanceTowerUpgrades} from './tower-upgrades.js';
import {ignite,tickBurn} from './tower-effects.js';
import {TOWERS, ENEMIES, MAX_LEVEL, towerStats, effectiveTowerStats} from './catalog.js';
import {TECHNOLOGIES, deploymentStats, towerUnlockLevel} from './research.js';
import {placementStatus, createRoadPosition, advanceOnRoad} from './geometry.js';
import {defensePlacementStatus, pointOnDefenseRoute} from './defense-geometry.js';
import {ESCORT_LENGTH,ESCORT_CHECKPOINTS,pointOnEscortRoute,escortPlacementStatus} from './escort-geometry.js';
import {MAZE_ENTRY,WALL_COST,WALL_REFUND,WALL_LIMIT,createMazeNavigation,mazeRoute,mazePlacementStatus,advanceInMaze} from './maze-geometry.js';
import {createGemGame} from './gem-session.js';
import {createHeroGame} from './hero-session.js';
import {createLegionGame} from './legion-session.js';

// Each mode has a different command surface; callers choose it through state.mode.
/** @param {any} options @returns {any} */
export function createGame(options={}){
 if(!options.mode||options.mode==='loop')return createLoopGame(options);
 if(options.mode==='gem')return createGemGame(options);
 if(options.mode==='hero')return createHeroGame(options);
 if(options.mode==='legion')return createLegionGame(options);
 return createBaseGame(options);
}
/**
 * @param {{mode?:'loop'|'defense'|'escort'|'maze',convoySpeed?:number,coreHealth?:number,startingGold?:number,limit?:number,waveInterval?:number,spawnInterval?:number,initialDelay?:number,waveCount?:number,waveSize?:(wave:number)=>number,enemyHealthScale?:number,enemySpeedScale?:number,rewardScale?:number,random?:()=>number}} options
 */
export function createBaseGame(options={}) {
 const defense=options.mode==='defense',escort=options.mode==='escort',maze=options.mode==='maze';
 const finite=defense||escort||maze,clearWaves=defense||maze;
 const coreHealth=options.coreHealth??(escort?100:20);
 const initialConvoy=()=>escort?{...pointOnEscortRoute(0),progress:0,length:ESCORT_LENGTH,moving:false,checkpointIndex:0}:null;
 const convoySpeed=Math.max(0,options.convoySpeed??14);
 const startingGold=options.startingGold??400;
 /** @type {{mode:string,convoy:any,walls:any[],mazeRoute:any[],mazeLength:number,ambushPoints:number[],coreHealth:number,maxCoreHealth:number,leaks:number,waveActive:boolean,attackLane:number,phase:string,paused:boolean,speed:number,gold:number,wave:number,nextWaveIn:number,elapsed:number,kills:number,endless:boolean,limit:number,towers:any[],enemies:any[],tech:{deployment:number,reinforcement:number},research:null|{kind:string,level:number,cost:number,duration:number,remaining:number}}} */
 const state={mode:escort?'escort':maze?'maze':defense?'defense':'loop',convoy:initialConvoy(),walls:[],mazeRoute:[],mazeLength:0,ambushPoints:[],coreHealth,maxCoreHealth:coreHealth,leaks:0,waveActive:false,attackLane:0,phase:'menu',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,limit:options.limit??80,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null};
 /** @type {any[]} */
 let events=[];
 /** @type {{code:string,boss:boolean,wave:number,spawnAt?:number}[]} */
 let queue=[];
 let spawnIn=0, nextEnemyId=1, nextTowerId=1,nextWallId=1,hitNoticeIn=0;
 let navigation;
 function refreshMaze(){
  if(!maze)return;
  navigation=createMazeNavigation(state.towers,state.walls);state.mazeRoute=mazeRoute(navigation);
  state.mazeLength=state.mazeRoute.slice(1).reduce((length,point,index)=>length+Math.hypot(point.x-state.mazeRoute[index].x,point.y-state.mazeRoute[index].y),0);
 }
 refreshMaze();
 const waveInterval=Math.max(.1,options.waveInterval??(maze?10:escort?18:defense?12:26));
 const spawnInterval=Math.max(.02,options.spawnInterval??.65);
 const waveCount=options.waveCount??(maze?12:20);
 function beginWave(){
  state.wave++;state.nextWaveIn=clearWaves?0:waveInterval;state.waveActive=true;state.attackLane=(state.wave-1)%4;
  if(escort)state.ambushPoints=[Math.min(ESCORT_LENGTH,state.convoy.progress+360),Math.max(0,state.convoy.progress-260)];
  const count=Math.max(1,Math.floor(options.waveSize?.(state.wave)??(escort?3+Math.floor(state.wave/3):maze?6+state.wave*2:10+state.wave*2)));
  for(let i=0;i<count;i++) queue.push({code:ENEMIES[(state.wave-1+Math.floor(i/3))%12].code,boss:false,wave:state.wave,...(escort?{spawnAt:state.ambushPoints[i%2]}:{})});
  if(state.wave%(maze?4:5)===0)queue.push({code:'X12',boss:true,wave:state.wave,...(escort?{spawnAt:state.ambushPoints[0]}:{})});
  events.push({type:'wave',amount:state.wave,message:`第 ${state.wave} 波${state.wave%(maze?4:5)===0?' · 首领来袭':''}`});
 }
 function spawn(){
  const entry=queue.shift(),def=ENEMIES.find(e=>e.code===entry.code);
  const scale=1+(entry.wave-1)*(escort?.1:.16);
  const maxHp=def.hp*scale*(entry.boss?(escort?4:10):1)*(options.enemyHealthScale??1);
  state.enemies.push({id:nextEnemyId++,code:entry.code,hp:maxHp,maxHp,...(escort?{...pointOnEscortRoute(entry.spawnAt),routeProgress:entry.spawnAt,remaining:Math.abs(entry.spawnAt-state.convoy.progress),arrived:false}:maze?{...MAZE_ENTRY,angle:0,remaining:state.mazeLength,arrived:false}:defense?{lane:state.attackLane,...pointOnDefenseRoute(state.attackLane,0)}:createRoadPosition(options.random)),progress:0,boss:entry.boss,speed:def.speed*(entry.boss ? .72 : 1)*(options.enemySpeedScale??1),reward:Math.max(1,Math.round(def.reward*(entry.boss?8:1)*(options.rewardScale??1))),slowUntil:0,slowFactor:1,rootUntil:0});
  if(!finite&&state.enemies.length>=state.limit){state.phase='defeat';events.push({type:'defeat',message:'环路积怪已达上限'});}
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
  const activeTowers=escort?state.towers.filter(tower=>(tower.readyAt??0)<=state.elapsed):state.towers;
  for(const tower of activeTowers){
   const stats=effectiveTowerStats(tower,activeTowers);
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
   if(stats.kind==='multi'){targets=[target,...state.enemies.filter(e=>e!==target&&e.hp>0&&distance(tower,e)<=stats.range).sort((a,b)=>distance(tower,a)-distance(tower,b))].slice(0,stats.targetCount);for(const e of targets)if(e!==target)events.push({type:'shot',x:tower.x,y:tower.y,tx:e.x,ty:e.y,code:tower.code,color:stats.color});}
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
    if(stats.kind==='magic')ignite(enemy,stats);
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
  advanceTowerUpgrades(state.towers,dt,tower=>events.push({type:'upgrade',x:tower.x,y:tower.y,code:tower.code}));
  if(escort&&state.convoy.moving){
   const convoy=state.convoy,target=ESCORT_CHECKPOINTS[convoy.checkpointIndex]??ESCORT_LENGTH;
   convoy.progress=Math.min(target,convoy.progress+convoySpeed*dt);Object.assign(convoy,pointOnEscortRoute(convoy.progress));
   if(convoy.progress>=target-1e-9&&convoy.checkpointIndex<ESCORT_CHECKPOINTS.length){
    convoy.moving=false;convoy.checkpointIndex++;state.gold+=100;
    events.push({type:'checkpoint',x:convoy.x,y:convoy.y,amount:100,message:`抵达补给站 ${convoy.checkpointIndex}，获得 100 金币；准备好后继续启程`});
   }
  }
  if(state.research){
   state.research.remaining=Math.max(0,state.research.remaining-dt);
   if(state.research.remaining<=1e-9){
    const {kind,level}=state.research;state.tech[kind]=level;state.research=null;
    events.push({type:'research-complete',kind,message:`${TECHNOLOGIES[kind].name} ${level} 级研究完成`});
   }
  }
  if((!clearWaves||!state.waveActive)&&(escort||state.endless||state.wave<waveCount)){state.nextWaveIn-=dt;if(state.nextWaveIn<=1e-9)beginWave();}
  else state.nextWaveIn=0;
  spawnIn-=dt;
  while(queue.length&&spawnIn<=0&&playable()){spawn();spawnIn+=spawnInterval;}
  if(!queue.length)spawnIn=0;
  if(!playable())return;
  let convoyDamage=0;
  hitNoticeIn-=dt;
  for(const enemy of state.enemies){
   tickBurn(enemy,dt,amount=>damage(enemy,amount,'#d59bff'));if(enemy.hp<=0)continue;
   let factor=enemy.slowUntil>state.elapsed?enemy.slowFactor:1;
   for(const tower of state.towers){
    if(escort&&(tower.readyAt??0)>state.elapsed)continue;
    const stats=towerStats(tower);
    if(stats.kind==='barrier'&&distance(tower,enemy)<=stats.range)factor=Math.min(factor,stats.slow);
   }
   if(enemy.rootUntil>state.elapsed)factor=0;
   const travel=enemy.speed*factor*dt;
   if(escort){
    const difference=state.convoy.progress-enemy.routeProgress;
    const movement=Math.min(travel,Math.max(0,Math.abs(difference)-30));
    enemy.progress+=movement;enemy.routeProgress+=Math.sign(difference)*movement;
    Object.assign(enemy,pointOnEscortRoute(enemy.routeProgress));enemy.arrived=false;
    if(difference<0)enemy.angle+=Math.PI;
    enemy.remaining=Math.max(0,Math.abs(state.convoy.progress-enemy.routeProgress)-30);
    if(enemy.remaining<1e-9&&enemy.rootUntil<=state.elapsed)convoyDamage+=(enemy.boss?7:2.5)*dt;
   }else if(maze){enemy.progress+=travel;advanceInMaze(enemy,travel,navigation);}
   else {enemy.progress+=travel;if(!defense)advanceOnRoad(enemy,travel,options.random);}
   if(defense){
    Object.assign(enemy,pointOnDefenseRoute(enemy.lane,enemy.progress));
   }
   if((defense||maze)&&enemy.arrived){
     const amount=enemy.boss?5:1;
     state.leaks++;state.coreHealth=Math.max(0,state.coreHealth-amount);
     events.push({type:'core-hit',x:enemy.x,y:enemy.y,amount,...(maze?{label:'出口'}:{}),message:maze?`出口漏怪，耐久减少 ${amount}`:`核心受到 ${amount} 点伤害`});
     if(state.coreHealth===0){
      state.enemies=state.enemies.filter(e=>!e.arrived);
      state.phase='defeat';events.push({type:'defeat',message:'核心耐久归零，防线失守'});return;
     }
   }
  }
  if(escort&&convoyDamage>0){
   state.coreHealth=Math.max(0,state.coreHealth-convoyDamage);
   if(hitNoticeIn<=0){events.push({type:'core-hit',x:state.convoy.x,y:state.convoy.y,amount:Number(convoyDamage.toFixed(1)),label:'载具',message:'载具正在遭受近身攻击'});hitNoticeIn=.5;}
   if(state.coreHealth<=1e-9){state.coreHealth=0;state.phase='defeat';events.push({type:'defeat',message:'护送载具被摧毁'});return;}
  }
  if(defense||maze)state.enemies=state.enemies.filter(e=>!e.arrived);
  combat(dt);
  if(clearWaves&&state.waveActive&&!queue.length&&!state.enemies.length){
   const amount=40+5*state.wave;state.gold+=amount;
   state.waveActive=false;state.nextWaveIn=waveInterval;
   events.push({type:'wave-clear',amount,message:`第 ${state.wave} 波清场，补给 ${amount} 金币`});
  }
  if(escort&&state.convoy.progress>=ESCORT_LENGTH-1e-9){state.phase='victory';events.push({type:'victory',message:'载具已安全抵达终点！'});}
  if(!escort&&!state.endless&&state.wave>=waveCount&&!queue.length&&!state.enemies.length){state.phase='victory';events.push({type:'victory',message:maze?'迷宫试炼已清场！':defense?'二十波已清场，核心守卫成功！':'二十波已清场，环路守卫成功！'});}
 }
 const result=(ok,message)=>({ok,message});
 const playable=()=>state.phase==='playing';
 const game={state,
 start(){if(state.phase==='menu') state.phase='playing';},
 restart(){Object.assign(state,{convoy:initialConvoy(),walls:[],mazeRoute:[],mazeLength:0,ambushPoints:[],coreHealth,maxCoreHealth:coreHealth,leaks:0,waveActive:false,attackLane:0,phase:'playing',paused:false,speed:1,gold:startingGold,wave:0,nextWaveIn:options.initialDelay??18,elapsed:0,kills:0,endless:false,towers:[],enemies:[],tech:{deployment:0,reinforcement:0},research:null});events=[];queue=[];spawnIn=0;nextEnemyId=1;nextTowerId=1;nextWallId=1;hitNoticeIn=0;refreshMaze();},
 tick(seconds){
  if(!Number.isFinite(seconds)||seconds<=0||!playable()||state.paused)return;
  let remaining=seconds*state.speed;
  while(remaining>1e-9&&playable()) {const dt=Math.min(.05,remaining);step(dt);remaining-=dt;}
 },
 launchWave(){
  if(!playable()||state.paused||queue.length||(clearWaves&&state.waveActive)||(!escort&&!state.endless&&state.wave>=waveCount))return result(false,'当前不能提前出怪');
  beginWave();return result(true,'下一波开始');
 },
 toggleConvoy(){
  if(!escort||!playable())return result(false,'当前不能操作载具');
  state.convoy.moving=!state.convoy.moving;
  const message=state.convoy.moving?'载具启程，请保护前方路线':'载具已停车，敌人仍会继续进攻';
  events.push({type:'convoy-toggle',message});return result(true,message);
 },
 repairConvoy(){
  if(!escort||!playable())return result(false,'当前不能维修载具');
  if(state.convoy.moving)return result(false,'请先停车再维修');
  if(state.coreHealth>=state.maxCoreHealth)return result(false,'载具耐久已满');
  if(state.gold<60)return result(false,'维修需要 60 金币');
  state.gold-=60;state.coreHealth=Math.min(state.maxCoreHealth,state.coreHealth+6);
  events.push({type:'convoy-repair',x:state.convoy.x,y:state.convoy.y,message:'支付 60 金币，载具恢复 6 耐久'});
  return result(true,'载具维修完成');
 },
 canRelocate(id,x,y){
  if(!escort||!playable())return result(false,'当前不能搬迁');
  const tower=state.towers.find(tower=>tower.id===id);
  if(!tower)return result(false,'请先选择已有防御单位');
  if(tower.upgrading)return result(false,'升级期间不能搬迁');
  if((tower.readyAt??0)>state.elapsed)return result(false,'工事仍在搬迁停机中');
  if(state.gold<25)return result(false,'搬迁需要 25 金币');
  if(Math.hypot(tower.x-x,tower.y-y)<1)return result(false,'请选择新的位置');
  return escortPlacementStatus(x,y,state.towers.filter(t=>t!==tower));
 },
 relocate(id,x,y){
  const status=game.canRelocate(id,x,y);if(!status.ok)return status;
  const tower=state.towers.find(tower=>tower.id===id);
  state.gold-=25;tower.x=x;tower.y=y;tower.readyAt=state.elapsed+3;
  events.push({type:'relocate',x,y,code:tower.code,message:'搬迁完成，工事停机 3 秒'});
  return result(true,'搬迁完成，等级保留，3 秒后恢复工作');
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
  if(code==='WALL')return !maze?result(false,'仅自由迷宫可布置路障'):state.walls.length>=WALL_LIMIT?result(false,'路障数量已达上限'):state.gold<WALL_COST?result(false,'金币不足'):result(true,'可以布置路障');
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
  if(maze)return mazePlacementStatus(x,y,code,state.towers,state.walls,state.enemies);
  return (escort?escortPlacementStatus:defense?defensePlacementStatus:placementStatus)(x,y,state.towers);
 },
 /** @param {number} x @param {number} y @param {string} code @returns {{ok:boolean,message:string,towerId?:number}} */
 build(x,y,code){
  const status=game.canBuild(x,y,code);
  if(!status.ok)return status;
  if(code==='WALL'){const towerId=-nextWallId++;state.gold-=WALL_COST;state.walls.push({id:towerId,code:'WALL',x,y});refreshMaze();events.push({type:'build',x,y,code});return {ok:true,message:'路障已布置，敌人路线已重算',towerId};}
  const def=TOWERS.find(t=>t.code===code),towerId=nextTowerId++;
  state.gold-=def.price;
  state.towers.push({id:towerId,code,level:1,spent:def.price,x,y,angle:0});
  refreshMaze();events.push({type:'build',x,y,code});return {ok:true,message:'建造完成',towerId};
 },
 canUpgrade(id){
  if(!playable()) return result(false,'当前不能升级');
  if(state.walls.some(wall=>wall.id===id))return result(false,'路障不能升级');
  const tower=state.towers.find(t=>t.id===id);
  if(!tower) return result(false,'请先选择防御单位');
  if(tower.upgrading)return result(false,'升级进行中');
  if(tower.level>=MAX_LEVEL) return result(false,'已达最高等级');
  if(tower.level>=TECHNOLOGIES.reinforcement.levels[state.tech.reinforcement].maxTowerLevel)return result(false,`需要强化科技 ${tower.level} 级`);
  const cost=towerStats(tower).upgradeCost;
  if(state.gold<cost) return result(false,'金币不足');
  return result(true,'可以升级');
 },
 upgrade(id){
  const status=game.canUpgrade(id);if(!status.ok)return status;
  const tower=state.towers.find(t=>t.id===id),cost=towerStats(tower).upgradeCost;
  return beginTowerUpgrade(state,tower,cost);
 },
 sell(id){
  if(!playable()) return result(false,'当前不能出售');
  const wall=state.walls.find(wall=>wall.id===id);
  if(wall){state.gold+=WALL_REFUND;state.walls=state.walls.filter(w=>w!==wall);refreshMaze();events.push({type:'sell',x:wall.x,y:wall.y,amount:WALL_REFUND});return result(true,'路障已拆除，路线已重算');}
  const tower=state.towers.find(t=>t.id===id);
  if(!tower) return result(false,'防御单位不存在');
  if(tower.upgrading)return result(false,'升级期间不能出售');
  const amount=towerStats(tower).sellValue;state.gold+=amount;state.towers=state.towers.filter(t=>t!==tower);
  refreshMaze();events.push({type:'sell',x:tower.x,y:tower.y,amount});return result(true,'出售完成');
 },
 togglePause(){if(playable()) state.paused=!state.paused;},
 setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
 continueEndless(){
  if(escort)return result(false,'护送交付后不能进入无尽');
  if(state.phase!=='victory')return result(false,'请先通关');
  state.phase='playing';state.endless=true;state.paused=false;state.nextWaveIn=waveInterval;
  return result(true,'无尽挑战开始');
 },
 drainEvents(){const drained=events;events=[];return drained;}
 };return game;
}
