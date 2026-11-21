import {CHALLENGES, GOLD_RUSHES, ENDLESS_POOLS, LOOP_TOWERS, LOOP_EQUIPMENT, LOOP_ENEMIES, LOOP_PRIORITIES, FIXED_ROUTES,
 loopTower, loopStats, loopWave, loopEnemy, loopWaveInterval, waveMultiplier, assignWaveBounties} from './loop-catalog.js';
import {createLoopCombat} from './loop-combat.js';
import {createLoopArmory} from './loop-armory.js';
import { LOOP_CAMPAIGN_WAVES, LOOP_CREDENTIALS, LOOP_DEPUTIES, LOOP_DEPUTY_COSTS, LOOP_DEPUTY_LEVELS, LOOP_PACKS, LOOP_RARITY, LOOP_XP, LOOP_SSR_GUARANTEE, LOOP_EXCHANGE_WAVE, loopLevelCap, loopCredential } from './loop-equipment.js';
import {loopPlacementStatus, createRoadPosition, advanceOnRoad, ROAD_NODES, ENTRY} from './geometry.js';
import {ABYSS_RADIUS, ABYSS_STAGES, BASIC_TOWERS, CAPACITY_BY_WAVE, DIFFICULTIES, INITIAL_CAPACITY, INITIAL_GOLD, MYSTERY_ITEMS, MYSTERY_STOCK_WAVES, WORKER_TALENTS, talentRank} from './loop-solo-rules.js';

const starters=['T05','T25','T26','T27'];
const refundFor=code=>Math.floor(LOOP_PACKS.find(pack=>pack.tier===LOOP_RARITY[loopTower(code).rarity]).price/4);
const success=(message,extra={})=>({ok:true,message,...extra});
const failure=message=>({ok:false,message});

export function createLoopGame(options={}){
 const waveCount=options.waveCount??LOOP_CAMPAIGN_WAVES;
 let difficulty=DIFFICULTIES.find(rule=>rule.id===options.difficulty)??DIFFICULTIES[1];
 const initial=()=>({phase:'menu',paused:false,speed:1,gold:options.startingGold??INITIAL_GOLD,lumber:0,elapsed:0,
  difficulty:difficulty.id,talent:null,talentReadyAt:0,
  finalUntil:null,defeatReason:null,lastGoldRushWave:null,abyss:null,
  mystery:null,mysteryRefreshes:1,tempering:[],treasures:0,
  wave:0,nextWaveIn:options.initialDelay??30,limit:options.limit??60,endless:false,kills:0,
  towers:[],enemies:[],regions:[],dust:[],pendingSpawns:0,capacity:options.startingCapacity??INITIAL_CAPACITY,populationUsed:0,
  waveCount,starter:'unopened',ssrMisses:0,draft:null,cards:[],inventory:[],challenge:null,completedChallenges:[],usedChallenges:[],goldRush:null,goldRushQueued:0,
  regularKillGold:0,regularSupply:0,endlessKills:0,endlessSupply:0,supplyCursor:0,gearBounty:{},ledger:[]});
 const state=initial(),random=options.random??Math.random,draftRandom=options.draftRandom??Math.random;
 const endlessRandom=options.endlessRandom??Math.random;
 const marketRandom=options.marketRandom??Math.random;
 const credentialRandom=options.credentialRandom??options.draftRandom??Math.random;
 const endlessChoices=new Map();
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
 function refreshMystery(final=false){
  const candidates=MYSTERY_ITEMS.filter(code=>Object.hasOwn(LOOP_EQUIPMENT,code));
  const stock=[];
  while(candidates.length&&(final||stock.length<5)){
   const [code]=candidates.splice(Math.min(candidates.length-1,Math.floor(marketRandom()*candidates.length)),1);
   stock.push({code,count:final?2:1});
  }
  state.mystery={stock,closesAt:state.mystery?.closesAt??(final?state.elapsed+120:null)};
  emit({type:'shop',message:'神秘商店已上架新货'});
 }
 const activePressure=()=>state.enemies.reduce((count,e)=>count+Number(e.hp>0&&e.special!=='gold'),0);
 function addEnemy(entry,position){
  const enemy=loopEnemy(entry,nextEnemy++,position,{...options,difficultyScale:difficulty.health});
  enemy.spawnedAt=state.elapsed;
  state.enemies.push(enemy);
  if(enemy.special!=='gold'&&activePressure()>=state.limit&&playing()){
   state.phase='defeat';state.defeatReason='环路积怪已达上限';emit({type:'defeat',message:state.defeatReason});
  }
  return enemy;
 }
 function summon(parent,code,count,shieldHits){
  for(let i=0;i<count&&playing();i++){
   const position={x:parent.x,y:parent.y,angle:parent.angle,roadFrom:parent.roadFrom,roadTo:parent.roadTo,progress:parent.progress};
   if(parent.special==='abyss')Object.assign(position,{orbit:parent.orbit+(i+1)*.32});
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
   if(!e.endless&&state.talent==='commerce'){
    const rate=[.5,.9,1.4,2,2.7][talentRank(state.wave)-1];
    changeGold(Math.round(rate*state.kills)-Math.round(rate*(state.kills-1)),'worker-talent');
   }
   const xp=waveXp(e.wave)*(e.boss?8:e.elite?2:1);
   for(const t of state.towers)if(!LOOP_DEPUTIES.has(t.code)&&Math.hypot(e.x-t.x,e.y-t.y)<=260)pendingExperience.set(t.id,(pendingExperience.get(t.id)??0)+xp);
  }
  emit({type:'kill',x:e.x,y:e.y,angle:e.angle,code:e.code,amount:e.reward,wave:e.wave,endless:e.endless});
  if(e.endless)return;
  if(e.boss){
   state.lumber+=1;
   const rush=GOLD_RUSHES.find(entry=>entry.wave===e.wave);
   if(!options.noGoldRush&&rush){
    rushQueue.push({config:rush,at:state.elapsed+10});
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
   const gain=pendingExperience.get(t.id);
   if(!gain)continue;
   t.xp=Math.min(LOOP_XP[loopLevelCap(t)-1],t.xp+gain);
   const level=LOOP_XP.filter(xp=>t.xp>=xp).length;
   if(level<=t.level)continue;
   if(t.level<3&&level>=3||t.level<5&&level>=5){t.cycles=0;t.streak=0;t.lockId=null;}
   t.level=level;t.route=level>=3?FIXED_ROUTES[t.code]:null;
   emit({type:'upgrade',x:t.x,y:t.y,code:t.code,amount:level});
  }
  pendingExperience.clear();
 }
 function advanceTraining(id,definition){
  const tower=state.towers.find(candidate=>candidate.id===id);
  if(!tower||tower.population!==20||tower.level>=loopLevelCap(tower))return false;
  const gain=definition.nextLevel?LOOP_XP[tower.level]-tower.xp:definition.experience;
  pendingExperience.set(id,(pendingExperience.get(id)??0)+gain);
  flushExperience();
  return true;
 }
 function onDamage(enemy,amount){
  if(enemy.special==='abyss'&&state.abyss?.config.isGold)state.abyss.damage+=amount;
  if(enemy.special!=='gold'||!state.goldRush)return;
  const rush=state.goldRush;
  rush.damage+=amount; rush.reward=Math.min(rush.maxReward,Math.floor(rush.damage*rush.maxReward/rush.totalHp+1e-8));
 }
 const combat=createLoopCombat(state,emit,{onDeath,onDamage,flushExperience,summon,changeGold,random:options.combatRandom??Math.random});
 const armory=createLoopArmory(state,{editable,newId:()=>nextId++,changeGold,advanceTraining,combat,emit});
 const pool=options.towerFilter?LOOP_TOWERS.filter(options.towerFilter):LOOP_TOWERS;
 const chooseCode=items=>items[Math.min(items.length-1,Math.max(0,Math.floor(draftRandom()*items.length)))];
 function eligiblePacks(pack) {
  return pool.filter(tower=>pack.odds[LOOP_RARITY[tower.rarity]]>0);
 }
 function draftChoices(towers,first){
  const remaining=towers.filter(tower=>tower.code!==first);
  const choices=[first];
  while(choices.length<3&&remaining.length){
   const chosen=chooseCode(remaining);
   choices.push(chosen.code);
   remaining.splice(remaining.indexOf(chosen),1);
  }
  return choices;
 }
 function addCard(code,paid,starter=false) {
  const card={id:nextId++,code,paid,starter,refund:paid?refundFor(code):0};
  state.cards.push(card);return card.id;
 }
 function deploymentChoice(id){
  if(typeof id==='string'&&id.startsWith('basic:')){
   const code=id.slice(6);
   if(Object.hasOwn(BASIC_TOWERS,code))return {id,code,basic:true,cost:BASIC_TOWERS[code],refund:Math.floor(BASIC_TOWERS[code]/4)};
  }
  if(typeof id==='string'&&id.startsWith('relocate:')){
   const tower=state.towers.find(t=>t.id===Number(id.slice(9)));
   if(tower)return {id,code:tower.code,relocate:tower};
  }
  return state.cards.find(card=>card.id===id);
 }
 function waveEntries(wave){
  const override=options.waveSize?Math.max(1,Math.floor(options.waveSize(wave)))-Number(!state.endless&&wave>20&&wave%5===0):null;
  const round=wave-waveCount;
  if(state.endless&&!endlessChoices.has(wave)){
   const choices=round%10===0?ENDLESS_POOLS.boss:ENDLESS_POOLS.regular;
   endlessChoices.set(wave,choices[Math.min(choices.length-1,Math.floor(endlessRandom()*choices.length))]);
  }
  const entries=loopWave(wave,state.endless,state.endless&&override!==null?Math.max(1,override):override,endlessChoices.get(wave),round);
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
  const capacity=CAPACITY_BY_WAVE[state.wave];
  if(!state.endless&&capacity!==undefined&&capacity>state.capacity){
   state.capacity=capacity;emit({type:'population',message:`人口上限提高至 ${capacity}`});
  }
  if(!state.endless&&state.wave===54&&state.challenge){
   state.challenge=null;state.enemies=state.enemies.filter(enemy=>enemy.special!=='challenge');
   emit({type:'challenge-end',message:'挑战商店已关闭'});
  }
  if(!state.endless&&MYSTERY_STOCK_WAVES.has(state.wave))refreshMystery(state.wave===54);
  const interval=loopWaveInterval(state.wave+1,state.endless);
  const preparation=!state.endless&&difficulty.health>=2.5 ? (state.wave<11?22:14) : 0;
  state.nextWaveIn=options.waveInterval??(interval+preparation);
  const entries=waveEntries(state.wave);
  if(!state.endless&&state.wave===LOOP_CAMPAIGN_WAVES)state.finalUntil=state.elapsed+480;
  if(!state.endless)remainingByWave.set(state.wave,entries.length);
  queue.push(...entries);state.pendingSpawns=queue.length;
  emit({type:'wave',amount:state.wave,message:'第 '+state.wave+' 波'+(entries.some(e=>e.boss)?' · Boss':'')});
 }
 function advanceQueue(dt){
  if(state.endless||state.wave<waveCount){
   state.nextWaveIn=Math.max(0,state.nextWaveIn-dt);
   if(state.nextWaveIn<=1e-9&&canAdvanceWave())beginWave();
  }else state.nextWaveIn=0;
  spawnIn-=dt;
  while(queue.length&&spawnIn<=1e-9&&playing()){
   const entry=queue.shift();
   if(!entry.cohort)priorDirection=random();
   addEnemy(entry,createRoadPosition(()=>priorDirection));
   spawnIn+=options.spawnInterval??(entry.endless?2:queue[0]?.cohort ? .22 : entry.wave>20 ? .48 : .65);
  }
  state.pendingSpawns=queue.length;
  if(!queue.length){
   spawnIn=0;
   if(!options.noGoldRush&&!state.endless&&state.wave===54&&state.lastGoldRushWave!==54&&
      state.goldRush?.wave!==54&&!rushQueue.some(rush=>rush.config.wave===54)){
    rushQueue.push({config:GOLD_RUSHES.at(-1),at:state.elapsed+10});state.goldRushQueued=rushQueue.length;
   }
  }
 }
 function canAdvanceWave(){
  return (!state.endless||!queue.length)&&
   (state.endless||state.wave!==54||options.noGoldRush||!queue.length&&state.lastGoldRushWave===54);
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
   state.goldRush={wave:config.wave,code:config.code,remaining:20,until:state.elapsed+20,damage:0,reward:0,maxReward:config.reward,totalHp,directions:[...config.direction],nextAt:state.elapsed};
   emit({type:'gold-rush',message:'金币怪已出场'});
  }
  const rush=state.goldRush;
  if(!rush)return;
  rush.remaining=Math.max(0,rush.until-state.elapsed);
  while(rush.directions.length&&state.elapsed>=rush.nextAt-1e-9){
   addEnemy({code:rush.code,wave:rush.wave,special:'gold'},createRoadPosition(()=>rush.directions.shift()/4));
   rush.nextAt+=.95;
  }
  if(rush.remaining<=1e-9||!rush.directions.length&&!state.enemies.some(e=>e.special==='gold'&&e.hp>0)){
   changeGold(rush.reward,'gold-rush');state.enemies=state.enemies.filter(e=>e.special!=='gold');state.goldRush=null;
   state.lastGoldRushWave=rush.wave;
   emit({type:'gold-rush-end',amount:rush.reward,message:'金币怪奖励 '+rush.reward+' 金币'});
  }
 }
 function move(e,dt){
  const slowed=e.slowImmuneUntil>state.elapsed||e.special==='abyss'&&state.abyss?.config.isGold?0:
   Math.min(.6,combat.strength(e,'slow'))*(e.boss?.5:1)*(e.controlScale??1);
  e.slowUntil=slowed?state.elapsed+.1:0;
  const speed=(e.code==='G04'&&e.shield>0?e.speed*55/65:e.speed)*(1+combat.strength(e,'haste'))*(1-slowed);
  e.actualSpeed=e.rootUntil>state.elapsed||e.stopUntil>state.elapsed?0:speed;
  const travel=e.actualSpeed*dt;
  e.progress+=travel;
  if(e.special==='abyss'){
   e.orbit+=travel/ABYSS_RADIUS;
   e.x=ENTRY.x+ABYSS_RADIUS*Math.cos(e.orbit);
   e.y=ENTRY.y+ABYSS_RADIUS*Math.sin(e.orbit);
   e.angle=e.orbit+Math.PI/2;
   return;
  }
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
 function finishAbyssRound(cleared){
  const abyss=state.abyss;
  const tower=state.towers.find(candidate=>candidate.id===abyss.selected);
  Object.assign(tower,abyss.home);
  state.towers=abyss.roster;
  state.enemies=[];state.regions=[];state.dust=[];
  abyss.selected=null;
  if(abyss.config.isGold){
   changeGold(Math.min(150,Math.floor(abyss.damage*150/abyss.maxHp)),'abyss-gold');
  }else if(cleared&&abyss.config.reward){
   state.inventory.push({id:nextId++,code:abyss.config.reward,invested:0,readyAt:0,manual:false});
  }
  if(cleared||abyss.config.isGold){
   abyss.best=Math.max(abyss.best,abyss.stage>=4?abyss.stage-3:0);
   abyss.stage++;
   abyss.config=ABYSS_STAGES[Math.min(3,abyss.stage-1)];
   emit({type:'abyss',message:'深渊挑战完成，请选择下一关出战塔'});
  }else if(--abyss.attempts<=0){
   state.phase='defeat';state.defeatReason='深渊重试次数已用完';
   emit({type:'defeat',message:state.defeatReason});
  }else{
   emit({type:'abyss',message:`挑战超时 · 剩余 ${abyss.attempts} 次机会`});
  }
 }
 function stepAbyss(dt){
  state.elapsed+=dt;
  combat.step(dt);
  for(const enemy of state.enemies)move(enemy,dt);
  const cleared=state.enemies.every(enemy=>enemy.hp<=0);
  if(cleared||state.elapsed>=state.abyss.until)finishAbyssRound(cleared);
 }
 function step(dt){
  if(state.abyss){stepAbyss(dt);return;}
  state.elapsed+=dt;advanceQueue(dt);
  if(state.mystery?.closesAt!=null&&state.mystery.closesAt<=state.elapsed){
   state.mystery=null;emit({type:'shop',message:'神秘商店已关闭'});
  }
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
  if(playing()&&!state.endless&&state.finalUntil!==null&&state.elapsed>=state.finalUntil){
   state.phase='defeat';state.defeatReason='终局首领挑战超时';emit({type:'defeat',message:state.defeatReason});
  }
 }
 const game={state,catalog:LOOP_TOWERS,enemyCatalog:LOOP_ENEMIES,priorities:LOOP_PRIORITIES,equipment:LOOP_EQUIPMENT,challenges:CHALLENGES,
  difficulties:DIFFICULTIES,workerTalents:WORKER_TALENTS,basicTowers:BASIC_TOWERS,deploymentChoice,
  ...armory,shopPacks:LOOP_PACKS,ssrGuarantee:LOOP_SSR_GUARANTEE,exchangeWave:LOOP_EXCHANGE_WAVE,credentials:LOOP_CREDENTIALS,xpThresholds:LOOP_XP,
  deputies:[...LOOP_DEPUTIES],qualificationFor:loopCredential,
  levelCap:loopLevelCap,
  canUpgradeDeputy(towerId){
   const tower=state.towers.find(t=>t.id===towerId);
   if(!editable()||!tower||tower.deputyStage===undefined)return {...failure('当前不能升阶'),cost:undefined};
   const cost=LOOP_DEPUTY_COSTS[tower.deputyStage];
   if(cost===undefined)return {...failure('副塔已升满'),cost};
   return state.gold<cost?{...failure(`需 ${cost} 金币`),cost}:{...success('可以升阶'),cost};
  },
  upgradeDeputy(towerId){
   const status=game.canUpgradeDeputy(towerId);if(!status.ok)return status;
   const tower=state.towers.find(t=>t.id===towerId);
   changeGold(-status.cost,'deputy-upgrade');
   tower.deputyStage++;
   tower.level=LOOP_DEPUTY_LEVELS[tower.deputyStage];
   tower.route=tower.level>=3?FIXED_ROUTES[tower.code]:null;
   tower.cycles=0;tower.streak=0;tower.lockId=null;
   emit({type:'upgrade',x:tower.x,y:tower.y,code:tower.code,amount:tower.level});
   return success(`副塔已升至 ${tower.deputyStage} 阶`);
  },
  statsFor:t=>loopStats(t,state),
  forecasts:()=>state.abyss?[]:[state.wave+1,state.wave+2].filter(w=>state.endless||w<=waveCount).map(forecast),
  selectDifficulty(id){
   const rule=DIFFICULTIES.find(item=>item.id===id);
   if(state.phase!=='menu'||!rule)return failure('请选择开局难度');
   difficulty=rule;state.difficulty=id;return success(rule.name);
  },
  chooseTalent(id){
   const talent=WORKER_TALENTS.find(item=>item.id===id);
   if(!editable()||!talent||state.wave!==0||state.talent)return failure('工人天赋仅可在首波前选择一次');
   state.talent=id;return success('已选择'+talent.name);
  },
  useWorkerTalent(cardId=undefined){
   if(!editable()||state.endless||state.abyss||state.talentReadyAt>state.elapsed)return failure('工人天赋当前不可用');
   const rank=talentRank(state.wave)-1;
   if(state.talent==='cache'){
    state.treasures++;state.talentReadyAt=state.elapsed+250;
    return success('获得一组宝箱和钥匙');
   }
   if(!['reroll','merge'].includes(state.talent))return failure('此天赋无需主动使用');
   const card=state.cards.find(item=>item.id===cardId&&!item.starter);
   if(!card)return failure('请先选择背包里的非起手塔卡');
   const tier=LOOP_RARITY[loopTower(card.code).rarity];
   if(tier==='SSR')return failure('SSR 卡不适用');
   const order=['N','R','SR'];
   const merging=state.talent==='merge';
   const materials=merging?[card,...state.cards.filter(item=>item!==card&&!item.starter&&
    LOOP_RARITY[loopTower(item.code).rarity]===tier)].slice(0,4):[card];
   if(merging&&(tier==='SR'||materials.length<4))return failure('需要四张同档 N 或 R 卡');
   const target=merging?order[order.indexOf(tier)+1]:tier;
   const chosen=chooseCode(pool.filter(t=>LOOP_RARITY[t.rarity]===target&&(merging||t.code!==card.code)));
   if(!chosen)return failure('当前卡池没有可选塔卡');
   state.cards=state.cards.filter(item=>!materials.includes(item));
   const reward=addCard(chosen.code,false);
   state.talentReadyAt=state.elapsed+(merging?[160,150,140,130,120]:[230,190,150,110,70])[rank];
   return success(merging?'合成成功':'置换成功',{cardId:reward});
  },
  openTreasure(){
   if(!editable()||state.treasures<=0)return failure('需要一组宝箱和钥匙');
   const rank=talentRank(state.wave)-1;
   const items=['blade','crystal','lens','font',...rank>0?['repeater','condenser']:[],...rank>2?['prism','scope','siege']:[]];
   const code=chooseCode(items);
   state.treasures--;
   state.inventory.push({id:nextId++,code,invested:0,readyAt:0,manual:false});
   return success('获得'+LOOP_EQUIPMENT[code].name);
  },
  refreshMystery(){
   if(!editable()||!state.mystery||state.mysteryRefreshes<=0)return failure('当前无法刷新神秘商店');
   state.mysteryRefreshes--;refreshMystery(state.wave>=54);return success('已更换神秘商店货物');
  },
  start(){if(state.phase==='menu')state.phase='playing';return success('开启免费起手 SR');},
  restart(){Object.assign(state,initial());events=[];queue=[];rushQueue=[];spawnIn=0;nextId=1;nextEnemy=1;priorDirection=null;
   remainingByWave.clear();pendingExperience.clear();challengesUsed.clear();endlessChoices.clear();return game.start();},
  tick(seconds){
   if(!playing()||state.paused||state.starter!=='deployed'||!Number.isFinite(seconds)||seconds<=0)return;
   for(let remaining=seconds*state.speed;remaining>1e-9&&playing();){
    if(state.abyss&&!state.abyss.selected)break;
    const dt=Math.min(.05,remaining);step(dt);remaining-=dt;
   }
  },
  launchWave(){
   if(!playing()||state.paused||state.abyss||state.starter!=='deployed'||queue.length||!canAdvanceWave()||!state.endless&&state.wave>=waveCount)return failure('当前不能提前出怪');
   beginWave();return success('下一波开始');
  },
  canOpenStarter(){return editable()&&!state.draft&&state.starter==='unopened'?{ok:true}:failure('起手 SR 已开启或当前不可开启');},
  openStarterPack(){
   const status=game.canOpenStarter();if(!status.ok)return status;
   const choices=starters.filter(code=>pool.some(tower=>tower.code===code));
   const code=chooseCode(choices);
   if(!code)return failure('起手池没有可抽塔');
   state.draft={tier:'SR',starter:true,codes:draftChoices(pool.filter(tower=>choices.includes(tower.code)),code)};
   return success('请选择一张起手 SR');
  },
  choosePackCard(code){
   const draft=state.draft;
   if(!editable()||!draft?.codes.includes(code))return {...failure('请选择当前卡包中的一张卡'),cardId:undefined};
   state.draft=null;
   if(draft.starter)state.starter='held';
   const cardId=addCard(code,!draft.starter,draft.starter);
   const fortune=!draft.starter&&!state.endless&&state.talent==='fortune'&&draftRandom()<[.1,.13,.16,.19,.25][talentRank(state.wave)-1];
   if(fortune){
    const bonus=chooseCode(pool.filter(tower=>LOOP_RARITY[tower.rarity]===draft.quality));
    if(bonus)addCard(bonus.code,false);
   }
   return {...success(`已获得 · ${loopTower(code).name}${fortune?' · 额外抽取一张':''}`),cardId};
  },
  openStarter(){
   const status=game.openStarterPack();
   return status.ok?game.choosePackCard(state.draft.codes[0]):status;
  },
  canDraw(tier){
   const pack=LOOP_PACKS.find(pack=>pack.tier===tier);
   if(!editable()||!pack||!eligiblePacks(pack).length)return failure('当前不可购买该卡包');
   if(state.draft||state.abyss)return failure('当前无法开启新卡包');
   return state.gold<pack.price?failure(`抽卡需要 ${pack.price} 金币`):{ok:true};
  },
  buyPack(tier){
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
   const allowed=available.filter(tower=>LOOP_PACKS.findIndex(entry=>entry.tier===LOOP_RARITY[tower.rarity])<=LOOP_PACKS.findIndex(entry=>entry.tier===quality));
   state.draft={tier,quality,starter:false,codes:draftChoices(allowed,code)};
   return success(`已购买 ${tier} 包 · 请选择一张塔卡`);
  },
  draw(tier){
   const status=game.buyPack(tier);
   return status.ok?game.choosePackCard(state.draft.codes[0]):status;
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
   const card=deploymentChoice(id);
   if(!editable()||state.abyss||!card)return failure('当前不可部署');
   if(card.relocate){
    if(state.talent!=='relocate'||state.endless||state.talentReadyAt>state.elapsed)return failure('调防天赋冷却中');
    return x===undefined&&y===undefined?success('可调防'):loopPlacementStatus(x,y,state.towers.filter(t=>t!==card.relocate));
   }
   if(card.basic&&state.gold<card.cost)return failure('金币不足');
   if(state.populationUsed+loopTower(card.code).population>state.capacity)return failure('部署人口不足');
   return x===undefined&&y===undefined?success('可部署'):loopPlacementStatus(x,y,state.towers);
  },
  deploy(id,x,y){
   const status=game.canDeploy(id,x,y);if(!status.ok)return status;
   const card=deploymentChoice(id),def=loopTower(card.code);
   if(card.relocate){
    const t=card.relocate;
    Object.assign(t,{x,y,lockId:null,streak:0});
    state.talentReadyAt=state.elapsed+[25,20,15,10,5][talentRank(state.wave)-1];
    emit({type:'build',x,y,code:def.code});return {ok:true,message:'调防完成',towerId:t.id};
   }
   const towerId=nextId++;
   if(card.basic)changeGold(-card.cost,'basic-tower');
   else state.cards=state.cards.filter(c=>c.id!==id);
   state.populationUsed+=def.population;
   if(card.starter)state.starter='deployed';
   state.towers.push({id:towerId,code:def.code,assetCode:def.assetCode,x,y,paid:card.paid,refund:card.refund??0,awakened:false,
    credential:LOOP_CREDENTIALS[def.code] ? game.deputies[Math.min(game.deputies.length-1,Math.floor(credentialRandom()*game.deputies.length))]:undefined,
    deputyStage:LOOP_DEPUTIES.has(def.code)?0:undefined,xp:0,level:1,
    population:def.population,priority:'default',equipment:[],combatUntil:0,angle:0,cooldown:0,cycles:0,route:null});
   emit({type:'build',x,y,code:def.code});return {ok:true,message:'部署完成',towerId};
  },
  buildBasic(code,x,y){return game.deploy('basic:'+code,x,y);},
  sell(id){
   const tower=state.towers.find(t=>t.id===id);
   if(!editable()||state.abyss||!tower)return failure('当前不能出售');
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
  canStartChallenge(code){
   const config=CHALLENGES.find(c=>c.code===code);
   if(!editable()||state.endless||state.abyss||state.wave>=Math.min(54,waveCount)||!config||state.wave<config.wave||challengesUsed.has(code))return failure('挑战未开放或已开启');
   if(state.challenge||activePressure()>=45)return failure('先清理战场上的敌人');
   if(state.gold<config.cost)return failure('金币不足');
   return success('可开启挑战');
  },
  startChallenge(code){
   const status=game.canStartChallenge(code);if(!status.ok)return status;
   const config=CHALLENGES.find(c=>c.code===code);
   changeGold(-config.cost,'challenge');
   challengesUsed.add(code);state.usedChallenges.push(code);
   const entries=[code,...(['C02','C08'].includes(code)?[code]:code==='C05'?['X03','X03']:[])].map((unit,index)=>({
    code:unit,wave:state.wave,scaleWave:config.wave,special:'challenge',boss:unit===code,variant:index,
   }));
   state.challenge={code,remaining:config.seconds,until:state.elapsed+config.seconds,nextAt:state.elapsed,config,entries};
   return success('挑战已开启');
  },
  togglePause(){if(playing())state.paused=!state.paused;},
  setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
  availableModes(){return state.phase==='victory'&&!state.endless&&!state.abyss?[...difficulty.modes]:[];},
  continueEndless(){
   if(!game.availableModes().includes('endless'))return failure('当前难度尚未解锁无尽');
   state.phase='playing';state.wave=waveCount;state.endless=true;state.paused=false;state.nextWaveIn=options.waveInterval??26;
   for(const t of state.towers){t.incomeIn=20;t.dividendIn=null;}
   return success('无尽开始');
  },
  continueAbyss(){
   if(!game.availableModes().includes('abyss'))return failure('当前难度尚未解锁深渊');
   if(!state.towers.some(tower=>tower.population===20))return failure('需要一座已部署的主塔');
   state.phase='playing';state.paused=false;
   state.abyss={stage:1,best:0,attempts:5,selected:null,until:null,config:ABYSS_STAGES[0],roster:state.towers,damage:0,maxHp:0,home:null};
   return success('深渊试炼 · 请选择出战塔');
  },
  selectAbyssTower(id){
   const abyss=state.abyss;
   const tower=state.towers.find(candidate=>candidate.id===id);
   if(!editable()||!abyss||abyss.selected||tower?.population!==20)return failure('请选择一座主塔出战');
   abyss.selected=id;abyss.damage=0;abyss.until=state.elapsed+abyss.config.seconds;
   abyss.home={x:tower.x,y:tower.y,angle:tower.angle};
   Object.assign(tower,{x:ENTRY.x,y:ENTRY.y,lockId:null,streak:0});
   state.towers=[tower];tower.cooldown=0;
   const {code,isGold}=abyss.config;
   const position={x:ENTRY.x+ABYSS_RADIUS,y:ENTRY.y,orbit:0,angle:Math.PI/2,progress:0};
   const target=addEnemy({code,wave:55,scaleWave:35+Math.min(50,2*Math.max(0,abyss.stage-4)),special:'abyss',boss:!isGold},position);
   if(abyss.stage>4){target.hp*=1+.12*(abyss.stage-4);target.maxHp=target.hp;}
   abyss.maxHp=target.maxHp;
   return success('已出战 · '+abyss.config.name);
  },
  drainEvents(){const out=events;events=[];return out;},
 };
 return game;
}
