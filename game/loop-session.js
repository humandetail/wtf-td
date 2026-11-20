import {CHALLENGES, GOLD_RUSHES, LOOP_TOWERS, LOOP_EQUIPMENT, LOOP_ENEMIES, LOOP_PRIORITIES, FIXED_ROUTES,
 loopTower, loopStats, loopWave, loopEnemy, loopWaveInterval, waveMultiplier, assignWaveBounties} from './loop-catalog.js';
import {createLoopCombat} from './loop-combat.js';
import {createLoopArmory} from './loop-armory.js';
import { LOOP_CAMPAIGN_WAVES, LOOP_CREDENTIALS, LOOP_PACKS, LOOP_RARITY, LOOP_XP, LOOP_POPULATION, LOOP_SSR_GUARANTEE, LOOP_EXCHANGE_WAVE } from './loop-equipment.js';
import {loopPlacementStatus, createRoadPosition, advanceOnRoad, ROAD_NODES} from './geometry.js';

const starters=['T05','T25','T26','T27'];
const refundFor=code=>Math.floor(LOOP_PACKS.find(pack=>pack.tier===LOOP_RARITY[loopTower(code).rarity]).price/4);
const success=(message,extra={})=>({ok:true,message,...extra});
const failure=message=>({ok:false,message});

export function createLoopGame(options={}){
 const waveCount=options.waveCount??LOOP_CAMPAIGN_WAVES;
 const initial=()=>({phase:'menu',paused:false,speed:1,gold:options.startingGold??80,elapsed:0,
  wave:0,nextWaveIn:options.initialDelay??30,limit:options.limit??60,endless:false,kills:0,
  towers:[],enemies:[],regions:[],dust:[],pendingSpawns:0,capacity:LOOP_POPULATION,populationUsed:0,
  waveCount,starter:'unopened',ssrMisses:0,cards:[],inventory:[],challenge:null,completedChallenges:[],usedChallenges:[],goldRush:null,goldRushQueued:0,
  regularKillGold:0,regularSupply:0,endlessKills:0,endlessSupply:0,supplyCursor:0,ledger:[]});
 const state=initial(),random=options.random??Math.random,draftRandom=options.draftRandom??Math.random;
 let events=[],queue=[],spawnIn=0,nextId=1,nextEnemy=1,priorDirection=null,rushQueue=[];
 const remainingByWave=new Map(), pendingExperience=new Map(), challengesUsed=new Set();
 const emit=e=>events.push(e);
 const changeGold=(amount,reason)=>{
  if(!amount)return;
  state.gold+=amount;state.ledger.push({time:state.elapsed,amount,reason});
 };
 const playing=()=>state.phase==='playing';
 const editable=()=>playing()&&!state.paused;
 const waveXp=wave=>wave<=10?1:wave<=20?2:wave<=35?3:4;
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
   changeGold(e.reward,'kill');if(e.endless)state.endlessKills++;else state.regularKillGold+=e.reward;
   const xp=waveXp(e.wave)*(e.boss?8:e.elite?2:1);
   for(const t of state.towers)if(Math.hypot(e.x-t.x,e.y-t.y)<=260)pendingExperience.set(t.id,(pendingExperience.get(t.id)??0)+xp);
  }
  emit({type:'kill',x:e.x,y:e.y,angle:e.angle,code:e.code,amount:e.reward,wave:e.wave,endless:e.endless});
  if(e.endless)return;
  if(e.boss){
   const rush=GOLD_RUSHES.find(entry=>entry.wave===e.wave);
   if(!options.noGoldRush&&rush){
    rushQueue.push({config:rush,at:state.elapsed+5});
    state.goldRushQueued=rushQueue.length;
   }
  }
  if(remainingByWave.has(e.wave)){
   const remaining=remainingByWave.get(e.wave)-1;
   if(remaining>0)remainingByWave.set(e.wave,remaining);
   else if(playing()){remainingByWave.delete(e.wave);emit({type:'wave-clear',wave:e.wave,message:`本波清场 · 第 ${e.wave} / ${waveCount} 波`});}
  }
 }
 function flushExperience(){
  if(!pendingExperience.size)return;
  for(const t of state.towers){
   t.xp=Math.min(LOOP_XP.at(-1),t.xp+(pendingExperience.get(t.id)??0));
   const level=LOOP_XP.filter(xp=>t.xp>=xp).length;
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
 const armory=createLoopArmory(state,{editable,newId:()=>nextId++,changeGold,combat,emit});
 const pool=options.towerFilter?LOOP_TOWERS.filter(options.towerFilter):LOOP_TOWERS;
 const chooseCode=items=>items[Math.min(items.length-1,Math.max(0,Math.floor(draftRandom()*items.length)))];
 function eligiblePacks(pack) {
  return pool.filter(tower=>pack.odds[LOOP_RARITY[tower.rarity]]>0);
 }
 function addCard(code,paid,starter=false) {
  const card={id:nextId++,code,paid,starter,refund:paid?refundFor(code):0};
  state.cards.push(card);return card.id;
 }
 function waveEntries(wave){
  const override=options.waveSize?Math.max(1,Math.floor(options.waveSize(wave)))-Number((state.endless||wave>20)&&wave%5===0):null;
  const entries=loopWave(wave,state.endless,override);
  return state.endless?entries:assignWaveBounties(entries,wave);
 }
 function forecast(wave){
  const entries=waveEntries(wave),boss=entries.find(e=>e.boss);
  return {wave,count:entries.length,entries,boss:!!boss,bossCode:boss?.code,bossName:boss?LOOP_ENEMIES[boss.code].name:'',
   types:[...new Set(entries.filter(e=>!e.boss).map(e=>e.code))],elites:entries.filter(e=>e.code.startsWith('E')).length,
   summonLimit:entries.reduce((total,e)=>total+({X20:2,E07:2,B07:4}[e.code]??0),0),
   hpMultiplier:waveMultiplier(wave,state.endless),endless:state.endless};
 }
 function beginWave(){
  state.wave++;
  state.nextWaveIn=options.waveInterval??loopWaveInterval(state.wave+1,state.endless);
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
   spawnIn+=options.spawnInterval??(queue[0]?.cohort ? .22 : entry.wave>20 ? .48 : .65);
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
    state.inventory.push({id:nextId++,code:challenge.config.item,invested:0,readyAt:0,manual:false});
    state.completedChallenges.push(challenge.code);
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
 const game={state,catalog:LOOP_TOWERS,enemyCatalog:LOOP_ENEMIES,priorities:LOOP_PRIORITIES,equipment:LOOP_EQUIPMENT,challenges:CHALLENGES,
  ...armory,shopPacks:LOOP_PACKS,ssrGuarantee:LOOP_SSR_GUARANTEE,exchangeWave:LOOP_EXCHANGE_WAVE,credentials:LOOP_CREDENTIALS,xpThresholds:LOOP_XP,
  statsFor:t=>loopStats(t,state),
  forecasts:()=>[state.wave+1,state.wave+2].filter(w=>state.endless||w<=waveCount).map(forecast),
  start(){if(state.phase==='menu')state.phase='playing';return success('开启免费起手 SR');},
  restart(){Object.assign(state,initial());events=[];queue=[];rushQueue=[];spawnIn=0;nextId=1;nextEnemy=1;priorDirection=null;
   remainingByWave.clear();pendingExperience.clear();challengesUsed.clear();return game.start();},
  tick(seconds){
   if(!playing()||state.paused||state.starter!=='deployed'||!Number.isFinite(seconds)||seconds<=0)return;
   for(let remaining=seconds*state.speed;remaining>1e-9&&playing();){
    const dt=Math.min(.05,remaining);step(dt);remaining-=dt;
   }
  },
  launchWave(){
   if(!playing()||state.paused||state.starter!=='deployed'||queue.length||!state.endless&&state.wave>=waveCount)return failure('当前不能提前出怪');
   beginWave();return success('下一波开始');
  },
  canOpenStarter(){return editable()&&state.starter==='unopened'?{ok:true}:failure('起手 SR 已开启或当前不可开启');},
  openStarter(){
   const status=game.canOpenStarter();if(!status.ok)return status;
   const code=chooseCode(starters.filter(code=>pool.some(tower=>tower.code===code)));
   if(!code)return failure('起手池没有可抽塔');
   state.starter='held';
   return success('已开启起手 SR',{cardId:addCard(code,false,true)});
  },
  canDraw(tier){
   const pack=LOOP_PACKS.find(pack=>pack.tier===tier);
   if(!editable()||!pack||!eligiblePacks(pack).length)return failure('当前不可购买该卡包');
   return state.gold<pack.price?failure(`抽卡需要 ${pack.price} 金币`):{ok:true};
  },
  draw(tier){
   const status=game.canDraw(tier);if(!status.ok)return status;
   const pack=LOOP_PACKS.find(pack=>pack.tier===tier);
   const available=eligiblePacks(pack);
   const tiers=Object.keys(pack.odds).filter(tier=>available.some(tower=>LOOP_RARITY[tower.rarity]===tier));
   const total=tiers.reduce((sum,tier)=>sum+pack.odds[tier],0);
   let roll=draftRandom()*total;
   const quality=tier==='SSR'&&state.ssrMisses>=LOOP_SSR_GUARANTEE-1&&tiers.includes('SSR')?'SSR'
    :tiers.find(tier=>(roll-=pack.odds[tier])<0)??tiers.at(-1);
   const code=chooseCode(available.filter(tower=>LOOP_RARITY[tower.rarity]===quality)).code;
   changeGold(-pack.price,'draft');
   if(tier==='SSR')state.ssrMisses=quality==='SSR'?0:Math.min(LOOP_SSR_GUARANTEE-1,state.ssrMisses+1);
   return success(`已获得 ${quality} · ${loopTower(code).name}`,{cardId:addCard(code,true)});
  },
  canSellCard(id){
   const card=state.cards.find(card=>card.id===id);
   return editable()&&card&&!card.starter?{ok:true}:failure('当前无法出售此卡');
  },
  sellCard(id){
   const status=game.canSellCard(id);if(!status.ok)return status;
   const card=state.cards.find(card=>card.id===id);
   state.cards=state.cards.filter(c=>c!==card);changeGold(card.refund??0,'sell-card');return success('已出售卡片');
  },
  canExchangeR(code,cardIds){
   if(!editable()||state.wave<LOOP_EXCHANGE_WAVE)return failure(`第 ${LOOP_EXCHANGE_WAVE} 波开放定向兑换`);
   if(loopTower(code)?.rarity!=='common'||!pool.some(tower=>tower.code===code)||!Array.isArray(cardIds)||cardIds.length!==5||new Set(cardIds).size!==5||
    !cardIds.every(id=>state.cards.some(card=>card.id===id&&loopTower(card.code).rarity==='common')))return failure('需要五张不同的 R 卡实例');
   return {ok:true};
  },
  exchangeR(code,cardIds){
   const status=game.canExchangeR(code,cardIds);if(!status.ok)return status;
   state.cards=state.cards.filter(card=>!cardIds.includes(card.id));
   return success('兑换成功',{cardId:addCard(code,false)});
  },
  canDeploy(id,x=undefined,y=undefined){
   const card=state.cards.find(c=>c.id===id);
   if(!editable()||!card)return failure('请先选择卡包里的卡');
   if(state.populationUsed+loopTower(card.code).population>state.capacity)return failure('部署人口不足');
   return x===undefined&&y===undefined?success('可部署'):loopPlacementStatus(x,y,state.towers);
  },
  deploy(id,x,y){
   const status=game.canDeploy(id,x,y);if(!status.ok)return status;
   const card=state.cards.find(c=>c.id===id),def=loopTower(card.code),towerId=nextId++;
   state.cards=state.cards.filter(c=>c.id!==id);state.populationUsed+=def.population;
   if(card.starter)state.starter='deployed';
   state.towers.push({id:towerId,code:def.code,assetCode:def.assetCode,x,y,paid:card.paid,refund:card.refund??0,awakened:false,qualifiedUsed:false,xp:0,level:1,
    population:def.population,priority:'default',equipment:[],combatUntil:0,angle:0,cooldown:0,cycles:0,route:null});
   emit({type:'build',x,y,code:def.code});return {ok:true,message:'部署完成',towerId};
  },
  sell(id){
   const tower=state.towers.find(t=>t.id===id);
   if(!editable()||!tower)return failure('当前不能出售');
   if(tower.equipment.length&&tower.combatUntil>state.elapsed)return failure('脱战后才能出售带装备的工事');
   const amount=tower.refund??0;
   state.inventory.push(...tower.equipment);state.towers=state.towers.filter(t=>t.id!==id);state.populationUsed-=tower.population;
   state.regions=state.regions.filter(zone=>zone.source!==id);
   changeGold(amount,'sell-tower');emit({type:'sell',x:tower.x,y:tower.y,amount});return success('已出售工事');
  },
  setPriority(id,priority){
   const t=state.towers.find(t=>t.id===id);
   if(!playing()||!t||loopTower(t.code).role==='support'||!Object.hasOwn(LOOP_PRIORITIES,priority))return failure('无效选敌设置');
   t.priority=priority;t.lockId=null;t.streak=0;return success('选敌已更新');
  },
  startChallenge(code){
   const config=CHALLENGES.find(c=>c.code===code);
   if(!editable()||state.endless||state.wave>=waveCount||!config||state.wave<config.wave||challengesUsed.has(code))return failure('挑战未开放或已开启');
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
   state.phase='playing';state.wave=waveCount;state.endless=true;state.paused=false;state.nextWaveIn=options.waveInterval??26;
   for(const t of state.towers){t.incomeIn=20;t.dividendIn=null;}
   return success('无尽开始');
  },
  drainEvents(){const out=events;events=[];return out;},
 };
 return game;
}
