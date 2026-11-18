import {CHALLENGES, GOLD_RUSHES, LOOP_TOWERS, LOOP_EQUIPMENT, LOOP_ENEMIES, LOOP_PRIORITIES, FIXED_ROUTES,
 loopTower, loopStats, loopWave, loopEnemy, loopWaveInterval, waveMultiplier} from './loop-catalog.js';
import {createLoopCombat} from './loop-combat.js';
import {loopPlacementStatus, createRoadPosition, advanceOnRoad, ROAD_NODES} from './geometry.js';

const starters=['T01','T06','T12','T13'];
const qualities=['common','rare','epic'];
const odds=[[80,20,0],[65,30,5],[50,37,13],[40,40,20]];
const experience=[0,10,30,70,130];
const success=(message,extra={})=>({ok:true,message,...extra});
const failure=message=>({ok:false,message});

export function createLoopGame(options={}){
 const initial=()=>({mode:'loop',phase:'menu',paused:false,speed:1,gold:options.startingGold??450,elapsed:0,
  wave:0,nextWaveIn:options.initialDelay??30,limit:options.limit??60,endless:false,kills:0,
  towers:[],enemies:[],walls:[],convoy:null,regions:[],dust:[],pendingSpawns:0,capacity:4,populationUsed:0,
  draft:null,cards:[],inventory:[],challenge:null,completedChallenges:[],usedChallenges:[],goldRush:null,goldRushQueued:0,
  endlessKills:0,endlessSupply:0,supplyCursor:0,rollTier:0,ledger:[]});
 const state=initial(),random=options.random??Math.random,draftRandom=options.draftRandom??Math.random;
 const waveCount=options.waveCount??20;
 let events=[],queue=[],spawnIn=0,nextId=1,nextEnemy=1,priorDirection=null,rushQueue=[];
 const remainingByWave=new Map(), pendingExperience=new Map(), challengesUsed=new Set();
 const emit=e=>events.push(e);
 const changeGold=(amount,reason)=>{
  if(!amount)return;
  state.gold+=amount;state.ledger.push({time:state.elapsed,amount,reason});
 };
 const playing=()=>state.phase==='playing';
 const waveXp=wave=>1+Math.floor((Math.min(20,wave)-1)/5);
 const activePressure=()=>state.enemies.reduce((count,e)=>count+Number(e.hp>0&&e.special!=='gold'),0);
 function addEnemy(entry,position){
  const enemy=loopEnemy(entry,nextEnemy++,position,options);
  enemy.spawnedAt=state.elapsed;
  state.enemies.push(enemy);
  if(enemy.special!=='gold'&&activePressure()>=state.limit&&playing()){
   state.phase='defeat';emit({type:'defeat',message:'环路积怪已达上限'});
  }
  return enemy;
 }
 function summon(parent,code,count,shieldHits){
  for(let i=0;i<count&&playing();i++){
   const position={x:parent.x,y:parent.y,angle:parent.angle,roadFrom:parent.roadFrom,roadTo:parent.roadTo,progress:parent.progress};
   if(!parent.endless&&!parent.special)remainingByWave.set(parent.wave,(remainingByWave.get(parent.wave)??0)+1);
   addEnemy({code,wave:parent.wave,endless:parent.endless,special:parent.special,scaleWave:parent.scaleWave,
    parentId:parent.id,summoned:true,shieldHits},position);
  }
 }
 function onDeath(e){
  if(e.special==='gold')return;
  if(e.code==='X20'||e.code==='E07')summon(e,e.code==='X20'?'X01':'X06',2,e.code==='E07'?1:0);
  if(e.special)return;
  if(!e.summoned){
   state.kills++;
   changeGold(e.reward,'kill');if(e.endless)state.endlessKills++;
   const xp=waveXp(e.wave)*(e.boss?8:e.elite?2:1);
   for(const t of state.towers)if(Math.hypot(e.x-t.x,e.y-t.y)<=260)pendingExperience.set(t.id,(pendingExperience.get(t.id)??0)+xp);
  }
  emit({type:'kill',x:e.x,y:e.y,code:e.code,amount:e.reward,wave:e.wave,endless:e.endless});
  if(e.endless)return;
  if(e.boss){
   if(e.wave<20){state.rollTier=Math.max(state.rollTier,e.wave/5);state.capacity=4+2*state.rollTier;}
   if(!options.noGoldRush&&GOLD_RUSHES[e.wave/5-1]){
    rushQueue.push({config:GOLD_RUSHES[e.wave/5-1],at:state.elapsed+5});
    state.goldRushQueued=rushQueue.length;
   }
  }
  if(remainingByWave.has(e.wave)){
   const remaining=remainingByWave.get(e.wave)-1;
   if(remaining>0)remainingByWave.set(e.wave,remaining);
   else if(playing()){remainingByWave.delete(e.wave);changeGold(60,'wave-clear');emit({type:'wave-clear',wave:e.wave,amount:60,message:'第 '+e.wave+' 波已清完 · 补给 60 金币'});}
  }
 }
 function flushExperience(){
  if(!pendingExperience.size)return;
  for(const t of state.towers){
   t.xp=Math.min(130,t.xp+(pendingExperience.get(t.id)??0));
   const level=experience.filter(xp=>t.xp>=xp).length;
   if(level<=t.level)continue;
   if(t.level<3&&level>=3||t.level<5&&level>=5){t.cycles=0;t.streak=0;t.lockId=null;}
   t.level=level;t.route=level>=3?FIXED_ROUTES[t.code]:null;
   emit({type:'upgrade',x:t.x,y:t.y,code:t.code,amount:level});
  }
  pendingExperience.clear();
 }
 function onDamage(enemy,amount){
  if(enemy.special!=='gold'||!state.goldRush)return;
  const rush=state.goldRush;
  rush.damage+=amount; rush.reward=Math.min(rush.maxReward,Math.floor(rush.damage*rush.maxReward/rush.totalHp+1e-8));
 }
 const combat=createLoopCombat(state,emit,{onDeath,onDamage,flushExperience,summon,changeGold});
 function chooseCode(pool){return pool[Math.floor(draftRandom()*pool.length)];}
 function makeDraft(free){
  const codes=[];
  const pool=options.towerFilter?LOOP_TOWERS.filter(options.towerFilter):LOOP_TOWERS;
  for(let i=0;i<3;i++){
   const available=free?starters.filter(code=>!codes.includes(code)):pool.filter(t=>!codes.includes(t.code)).map(t=>t.code);
   let rarity='common';
   if(!free&&i>0){
    let roll=100*draftRandom();
    rarity=qualities.find((q,j)=>(roll-=odds[state.rollTier][j])<0)??'epic';
   }
   const matches=available.filter(code=>loopTower(code).rarity===rarity);
   codes.push(chooseCode(matches.length?matches:available));
  }
  return {codes,cost:free?0:150};
 }
 function waveEntries(wave){
  const override=options.waveSize?Math.max(1,Math.floor(options.waveSize(wave)))-Number(state.endless&&wave%5===0):null;
  return loopWave(wave,state.endless,override);
 }
 function forecast(wave){
  const entries=waveEntries(wave),boss=entries.find(e=>e.boss);
  return {wave,count:entries.length,entries,boss:!!boss,bossName:boss?LOOP_ENEMIES[boss.code].name:'',
   types:[...new Set(entries.filter(e=>!e.boss).map(e=>e.code))],elites:entries.filter(e=>e.code.startsWith('E')).length,
   summonLimit:entries.reduce((total,e)=>total+({X20:2,E07:2,B07:4}[e.code]??0),0),
   hpMultiplier:waveMultiplier(wave,state.endless),endless:state.endless};
 }
 function beginWave(){
  state.wave++;
  state.nextWaveIn=options.waveInterval??loopWaveInterval(state.wave,state.endless);
  const entries=waveEntries(state.wave);
  if(!state.endless)remainingByWave.set(state.wave,entries.length);
  queue.push(...entries);state.pendingSpawns=queue.length;
  emit({type:'wave',amount:state.wave,message:'第 '+state.wave+' 波'+(entries.some(e=>e.boss)?' · Boss':'')});
 }
 function advanceQueue(dt){
  if(state.endless||state.wave<waveCount){
   state.nextWaveIn=Math.max(0,state.nextWaveIn-dt);
   if(state.nextWaveIn<=1e-9&&(!state.endless||!queue.length))beginWave();
  }else state.nextWaveIn=0;
  spawnIn-=dt;
  while(queue.length&&spawnIn<=1e-9&&playing()){
   const entry=queue.shift();
   if(!entry.cohort)priorDirection=random();
   addEnemy(entry,createRoadPosition(()=>priorDirection));
   spawnIn+=options.spawnInterval??(queue[0]?.cohort ? .22 : .65);
  }
  state.pendingSpawns=queue.length;
  if(!queue.length)spawnIn=0;
 }
 function updateSpecial(){
  const challenge=state.challenge;
  if(challenge){
   challenge.remaining=Math.max(0,challenge.until-state.elapsed);
   while(challenge.entries.length&&state.elapsed>=challenge.nextAt-1e-9&&playing()){
    addEnemy(challenge.entries.shift(),createRoadPosition(()=>challenge.config.direction/4));
    challenge.nextAt+=.35;
   }
   if(!challenge.entries.length&&!state.enemies.some(e=>e.special==='challenge'&&e.hp>0)){
    state.inventory.push({id:nextId++,code:challenge.config.item});
    changeGold(challenge.config.gold,'challenge');state.completedChallenges.push(challenge.code);
    emit({type:'challenge-end',message:'挑战成功 · '+challenge.config.reward});
    state.challenge=null;
   }else if(challenge.remaining<=1e-9){
    state.enemies=state.enemies.filter(e=>e.special!=='challenge');state.challenge=null;
    emit({type:'challenge-end',message:'挑战超时'});
   }
  }
  if(!state.goldRush&&rushQueue[0]?.at<=state.elapsed+1e-9){
   const {config}=rushQueue.shift();state.goldRushQueued=rushQueue.length;
   const totalHp=LOOP_ENEMIES[config.code].hp*(options.enemyHealthScale??1)*config.direction.length;
   state.goldRush={code:config.code,remaining:18,until:state.elapsed+18,damage:0,reward:0,maxReward:config.reward,totalHp,directions:[...config.direction],nextAt:state.elapsed};
   emit({type:'gold-rush',message:'金币怪已出场'});
  }
  const rush=state.goldRush;
  if(!rush)return;
  rush.remaining=Math.max(0,rush.until-state.elapsed);
  while(rush.directions.length&&state.elapsed>=rush.nextAt-1e-9){
   addEnemy({code:rush.code,wave:state.wave,special:'gold'},createRoadPosition(()=>rush.directions.shift()/4));
   rush.nextAt+=.35;
  }
  if(rush.remaining<=1e-9||!rush.directions.length&&!state.enemies.some(e=>e.special==='gold'&&e.hp>0)){
   changeGold(rush.reward,'gold-rush');state.enemies=state.enemies.filter(e=>e.special!=='gold');state.goldRush=null;
   emit({type:'gold-rush-end',amount:rush.reward,message:'金币怪奖励 '+rush.reward+' 金币'});
  }
 }
 function move(e,dt){
  const slowed=e.slowImmuneUntil>state.elapsed?0:Math.min(.6,combat.strength(e,'slow'))*(e.boss?.5:1);
  e.slowUntil=slowed?state.elapsed+.1:0;
  const speed=(e.code==='G04'&&e.shield>0?e.speed*55/65:e.speed)*(1+combat.strength(e,'haste'))*(1-slowed);
  e.actualSpeed=e.rootUntil>state.elapsed||e.stopUntil>state.elapsed?0:speed;
  const travel=e.actualSpeed*dt;
  e.progress+=travel;
  advanceOnRoad(e,travel,random,(node,exits)=>{
   e.junctions=(e.junctions??0)+1;
   combat.junction(e);
   if(e.reroute>0){
    e.reroute--;
    const cover=index=>state.towers.reduce((n,t)=>{
     const p=ROAD_NODES[index],s=loopStats(t,state);
     return n+Number(s.damage>0&&Math.hypot(t.x-(node.x+p.x)/2,t.y-(node.y+p.y)/2)<=s.range);
    },0);
    return [...exits].sort((a,b)=>cover(a)-cover(b)||a-b)[0];
   }
   if(e.code==='G02'&&e.junctions===1){
    const other=state.enemies.find(a=>a!==e&&a.code==='G02'&&a.firstExit!=null);
    e.firstExit=exits.find(index=>index!==other?.firstExit)??exits[0];return e.firstExit;
   }
  });
 }
 function step(dt){
  state.elapsed+=dt;advanceQueue(dt);
  if(!playing())return;
  updateSpecial();
  if(!playing())return;
  combat.step(dt);
  if(!playing())return;
  updateSpecial();
  for(const enemy of state.enemies)move(enemy,dt);
  if(!state.endless&&state.wave>=waveCount&&!queue.length&&!state.enemies.some(e=>!e.special)){
   state.challenge=null;state.enemies=state.enemies.filter(e=>e.special!=='challenge');
   if(!state.goldRush&&!rushQueue.length){state.phase='victory';emit({type:'victory',message:'常规波次已清场，环路守卫成功！'});}
  }
 }
 const attackEquipment=new Set(['core','gear','siege','scatter']);
 const controlTowers=new Set(['T06','T07','T08','T17','T18','T19','T21','T26','T27']);
 function compatible(t,code){
  const s=loopStats(t,state);
  if(code==='relay')return ['T09','T10'].includes(t.code);
  if(code==='coil'||code==='field')return controlTowers.has(t.code);
  if(code==='scatter')return s.targetCount>1;
  return t.code!=='T11'&&(!attackEquipment.has(code)||s.damage>0);
 }
 const game={state,catalog:LOOP_TOWERS,enemyCatalog:LOOP_ENEMIES,priorities:LOOP_PRIORITIES,equipment:LOOP_EQUIPMENT,challenges:CHALLENGES,
  statsFor:t=>loopStats(t,state),
  forecasts:()=>[state.wave+1,state.wave+2].filter(w=>state.endless||w<=waveCount).map(forecast),
  start(){if(state.phase==='menu'){state.phase='playing';state.draft=makeDraft(true);}return success('选择起手工事');},
  restart(){Object.assign(state,initial());events=[];queue=[];rushQueue=[];spawnIn=0;nextId=1;nextEnemy=1;priorDirection=null;
   remainingByWave.clear();pendingExperience.clear();challengesUsed.clear();return game.start();},
  tick(seconds){
   if(!playing()||state.paused||state.draft?.cost===0||!Number.isFinite(seconds)||seconds<=0)return;
   for(let remaining=seconds*state.speed;remaining>1e-9&&playing();){
    const dt=Math.min(.05,remaining);step(dt);remaining-=dt;
   }
  },
  launchWave(){
   if(!playing()||state.paused||state.draft?.cost===0||queue.length||!state.endless&&state.wave>=waveCount)return failure('当前不能提前出怪');
   beginWave();return success('下一波开始');
  },
  draw(){
   if(!playing()||state.draft)return failure('请先选完当前候选');
   if(state.gold<150)return failure('抽卡需要 150 金币');
   state.draft=makeDraft(false);changeGold(-150,'draft');return success('请选择一张卡');
  },
  chooseCard(index){
   const code=state.draft?.codes[index];
   if(!playing()||!Number.isInteger(index)||!code)return failure('当前没有这张候选卡');
   const card={id:nextId++,code,paid:state.draft.cost>0};
   state.cards.push(card);state.draft=null;return success('已收入卡包',{cardId:card.id});
  },
  sellCard(id){
   const card=state.cards.find(c=>c.id===id);
   if(!playing()||!card)return failure('当前无法出售此卡');
   state.cards=state.cards.filter(c=>c.id!==id);changeGold(card.paid?75:0,'sell-card');return success('已出售卡片');
  },
  canDeploy(id,x=undefined,y=undefined){
   const card=state.cards.find(c=>c.id===id);
   if(!playing()||!card)return failure('请先选择卡包里的卡');
   if(state.populationUsed+loopTower(card.code).population>state.capacity)return failure('部署人口不足');
   return x===undefined&&y===undefined?success('可部署'):loopPlacementStatus(x,y,state.towers);
  },
  deploy(id,x,y){
   const status=game.canDeploy(id,x,y);if(!status.ok)return status;
   const card=state.cards.find(c=>c.id===id),def=loopTower(card.code),towerId=nextId++;
   state.cards=state.cards.filter(c=>c.id!==id);state.populationUsed+=def.population;
   state.towers.push({id:towerId,code:def.code,assetCode:def.assetCode,x,y,paid:card.paid,xp:0,level:1,
    population:def.population,priority:'default',equipment:[],combatUntil:0,angle:0,cooldown:0,cycles:0,route:null});
   emit({type:'build',x,y,code:def.code});return success('部署完成',{towerId});
  },
  // Shared callers still use these rejections for commands belonging to other modes.
  canBuildType:()=>failure('从卡包选择工事'), canBuild:()=>failure('从卡包选择工事'), build:()=>failure('从卡包选择工事'),
  canUpgrade:()=>failure('击杀获取经验后自动升级'),
  sell(id){
   const tower=state.towers.find(t=>t.id===id);
   if(!playing()||!tower)return failure('当前不能出售');
   if(tower.equipment.length&&tower.combatUntil>state.elapsed)return failure('脱战后才能出售带装备的工事');
   const amount=tower.paid?75:0;
   state.inventory.push(...tower.equipment);state.towers=state.towers.filter(t=>t.id!==id);state.populationUsed-=tower.population;
   state.regions=state.regions.filter(zone=>zone.source!==id);
   changeGold(amount,'sell-tower');emit({type:'sell',x:tower.x,y:tower.y,amount});return success('已出售工事');
  },
  setPriority(id,priority){
   const t=state.towers.find(t=>t.id===id);
   if(!playing()||!t||loopTower(t.code).role==='support'||!Object.hasOwn(LOOP_PRIORITIES,priority))return failure('无效选敌设置');
   t.priority=priority;t.lockId=null;t.streak=0;return success('选敌已更新');
  },
  buyEquipment(code){
   const item=Object.hasOwn(LOOP_EQUIPMENT,code)?LOOP_EQUIPMENT[code]:null;
   if(!playing()||!item||item.components)return failure('该装备需要合成');
   if(state.gold<item.cost)return failure('金币不足');
   state.inventory.push({id:nextId++,code});changeGold(-item.cost,'equipment');return success('已购买'+item.name);
  },
  equip(towerId,itemId){
   const t=state.towers.find(t=>t.id===towerId),item=state.inventory.find(i=>i.id===itemId);
   if(!playing()||!t||!item)return failure('请选择背包装备');
   if(t.equipment.length>=3)return failure('装备槽已满');
   if(!compatible(t,item.code)||t.equipment.some(i=>i.code===item.code))return failure('工事不适用或已装同名装备');
   t.equipment.push(item);state.inventory=state.inventory.filter(i=>i.id!==itemId);return success('已装配');
  },
  unequip(towerId,itemId){
   const t=state.towers.find(t=>t.id===towerId),item=t?.equipment.find(i=>i.id===itemId);
   if(!playing()||!item)return failure('请选择已装配的装备');
   if(t.combatUntil>state.elapsed)return failure('脱战后才能卸装');
   t.equipment=t.equipment.filter(i=>i.id!==itemId);state.inventory.push(item);return success('已退回背包');
  },
  craft(itemId,otherId,towerId=undefined){
   const t=state.towers.find(t=>t.id===towerId),items=towerId==null?state.inventory:t?.equipment;
   const first=items?.find(i=>i.id===itemId),second=items?.find(i=>i.id===otherId);
   if(!playing()||!first||!second||first===second)return failure('请选择两个不同组件');
   const recipe=Object.entries(LOOP_EQUIPMENT).find(([,def])=>def.components?.includes(first.code)&&def.components.includes(second.code)&&first.code!==second.code);
   if(!recipe)return failure('没有匹配的配方');
   const [code,def]=recipe;
   if(t&&(!compatible(t,code)||items.some(i=>i.code===code)))return failure('工事不适用或已装同名装备');
   if(state.gold<def.cost)return failure('金币不足');
   const next=items.filter(i=>i.id!==itemId&&i.id!==otherId);next.push({id:nextId++,code});
   if(t)t.equipment=next;else state.inventory=next;
   changeGold(-def.cost,'craft');return success('已合成'+def.name);
  },
  startChallenge(code){
   const config=CHALLENGES.find(c=>c.code===code);
   if(!playing()||state.endless||state.wave>=20||!config||state.wave<config.wave||challengesUsed.has(code))return failure('挑战未开放或已开启');
   if(state.challenge||activePressure()>=45)return failure('先清理战场上的敌人');
   challengesUsed.add(code);state.usedChallenges.push(code);
   const entries=[code,...(['C02','C08'].includes(code)?[code]:code==='C05'?['X03','X03']:[])].map((unit,index)=>({
    code:unit,wave:state.wave,scaleWave:config.wave,special:'challenge',boss:unit===code,variant:index,
   }));
   state.challenge={code,remaining:28,until:state.elapsed+28,nextAt:state.elapsed,config,entries};
   return success('挑战已开启');
  },
  togglePause(){if(playing())state.paused=!state.paused;},
  setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
  continueEndless(){
   if(state.phase!=='victory')return failure('请先完成常规关');
   state.phase='playing';state.wave=20;state.endless=true;state.capacity=12;state.paused=false;state.nextWaveIn=options.waveInterval??26;
   for(const t of state.towers){t.incomeIn=20;t.dividendIn=null;}
   return success('无尽开始');
  },
  drainEvents(){const out=events;events=[];return out;},
 };
 return game;
}
