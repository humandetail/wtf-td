import {GEM_TOWERS,GEM_TECHNOLOGIES,GEM_RECIPES,GEM_PROBABILITIES,GEM_RULES,gemStats} from './gem-catalog.js';
import {GEM_LENGTH,pointOnGemRoute,gemPlacementStatus} from './gem-geometry.js';
import {createResearchControls} from './research-controls.js';
const result=(ok,message)=>({ok,message});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function createGemGame(options={}){
 const seed=(options.seed??2026)>>>0;
 let randomState=seed,nextId=1,nextEnemyId=1,events=[],spawnIn=0,queue=0;
 const initialState=()=>({mode:'gem',phase:'menu',turnPhase:'planning',paused:false,speed:1,gold:options.startingGold??GEM_RULES.startingGold,wave:0,nextWaveIn:0,elapsed:0,kills:0,coreHealth:GEM_RULES.coreHealth,maxCoreHealth:GEM_RULES.coreHealth,enemies:[],towers:[],walls:[],convoy:null,tech:{deployment:0,reinforcement:0},research:null,draft:null,draftCredits:GEM_RULES.initialDrafts,inventory:[],scraps:0,pity:0,seed,drawOrder:[],leaks:0,waveActive:false,endless:false});
 const state=initialState();
 const emit=event=>events.push(event);
 const planning=()=>state.phase==='playing'&&!state.paused&&state.turnPhase==='planning';
 const research=createResearchControls(state,emit,GEM_TECHNOLOGIES,planning);
 const capacity=()=>GEM_TECHNOLOGIES.deployment.levels[state.tech.deployment].capacity;
 const all=()=>[...state.towers,...state.inventory];
 const random=()=>{randomState=(randomState+0x6D2B79F5)>>>0;let t=randomState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const eligible=()=>all().filter(t=>t.code.startsWith('G')&&t.level<state.tech.reinforcement+1);
 const hasMerge=()=>eligible().some((a,i,items)=>items.some((b,j)=>j!==i&&a.code===b.code&&a.level===b.level));
 function candidates(){
  const row=GEM_PROBABILITIES[state.tech.reinforcement];
  const list=Array.from({length:5},()=>{let r=random()*100,level=1;for(let i=0;i<5;i++){r-=row[i];if(r<0){level=i+1;break;}}return {code:GEM_TOWERS[Math.floor(random()*6)].code,level};});
  const possible=eligible();
  if(state.pity>=3&&possible.length){const match=possible[Math.floor(random()*possible.length)];list[0]={code:match.code,level:match.level};}
  state.drawOrder.push(list.map(item=>({...item})));
  return list;
 }
 function placement(destination){
  if(destination?.inventory)return state.inventory.length<GEM_RULES.reserveSlots?result(true,'可以存入备选'):result(false,'备选栏已满');
  if(state.towers.length>=capacity())return result(false,'部署容量已满');
  return gemPlacementStatus(destination?.x,destination?.y,state.towers);
 }
 function fuse(primaryId,materialIds,recipe){
  if(!planning())return result(false,'只能在准备阶段合成');
  const ids=[primaryId,...materialIds];
  if(new Set(ids).size!==ids.length)return result(false,'不能重复使用材料');
  const items=ids.map(id=>all().find(t=>t.id===id));
  if(items.some(t=>!t))return result(false,'材料不存在');
  const primary=items[0];
  if(recipe){
   if(state.tech.deployment<recipe.deployment||state.tech.reinforcement<recipe.reinforcement)return result(false,'配方科技尚未完成');
   const keys=items.map(t=>`${t.code}:${t.level}`).sort(),required=recipe.inputs.map(([code,level])=>`${code}:${level}`).sort();
   if(keys.join()!==required.join())return result(false,'配方材料不匹配');
  }else if(items.length!==2||!primary.code.startsWith('G')||items[1].code!==primary.code||items[1].level!==primary.level||primary.level>=state.tech.reinforcement+1)return result(false,'需要同系同阶普通宝石及已完成的强化科技');
  const spent=items.reduce((sum,t)=>sum+t.spent,0);
  state.towers=state.towers.filter(t=>!materialIds.includes(t.id));state.inventory=state.inventory.filter(t=>!materialIds.includes(t.id));
  primary.code=recipe?.code??primary.code;primary.level=recipe?.level??primary.level+1;primary.spent=spent;primary.assetCode=GEM_TOWERS.find(t=>t.code===primary.code).assetCode;
  emit({type:'fusion',x:primary.x,y:primary.y,code:primary.code,amount:primary.level});return {...result(true,'合成完成'),towerId:primary.id};
 }
 function hurt(enemy,amount,color){
  if(enemy.hp<=0)return;
  enemy.hp=Math.max(0,enemy.hp-amount);emit({type:'hit',x:enemy.x,y:enemy.y,amount,color});
  if(enemy.hp===0){state.kills++;state.gold+=enemy.reward;emit({type:'kill',x:enemy.x,y:enemy.y,amount:enemy.reward,code:enemy.code});}
 }
 function hit(tower,enemy,amount,stats){
  hurt(enemy,amount,stats.color);
  for(const echo of state.towers.filter(t=>t.code==='F05'&&t.id!==tower.id&&distance(t,tower)<=gemStats(t).range)){
   echo.echoHits??={};echo.echoHits[enemy.id]=(echo.echoHits[enemy.id]??0)+1;
   if(echo.echoHits[enemy.id]>=4){echo.echoHits[enemy.id]=0;hurt(enemy,gemStats(echo).echoDamage,gemStats(echo).color);emit({type:'echo',x:echo.x,y:echo.y,tx:enemy.x,ty:enemy.y,amount:240});}
  }
 }
 function step(dt){
  state.elapsed+=dt;research.advanceResearch(dt);
  spawnIn-=dt;
  while(queue>0&&spawnIn<=0){
   const boss=state.wave%GEM_RULES.bossEvery===0&&queue===1;const maxHp=GEM_RULES.enemyHp(state.wave)*(boss?GEM_RULES.bossHpMultiplier:1);
   state.enemies.push({id:nextEnemyId++,code:boss?'X12':`X${String(1+(state.wave%11)).padStart(2,'0')}`,hp:maxHp,maxHp,boss,speed:boss?GEM_RULES.bossSpeed:GEM_RULES.enemySpeed(state.wave),reward:boss?GEM_RULES.bossReward:GEM_RULES.enemyReward(state.wave),progress:0,...pointOnGemRoute(0),slowUntil:0,slowFactor:1});queue--;spawnIn+=GEM_RULES.spawnInterval;
  }
  for(const tower of state.towers){
   const stats=gemStats(tower,state.towers);tower.cooldown=Math.max(0,(tower.cooldown??0)-dt);
   if(stats.damage<=0||tower.cooldown>0)continue;
   const target=state.enemies.filter(e=>e.hp>0&&distance(tower,e)<=stats.range).sort((a,b)=>b.progress-a.progress)[0];
   if(!target)continue;
   tower.cooldown=stats.interval;tower.angle=Math.atan2(target.y-tower.y,target.x-tower.x);
   emit({type:'shot',x:tower.x,y:tower.y,tx:target.x,ty:target.y,code:tower.code,color:stats.color});
   let targets=[target];
   if(['splash','frost'].includes(stats.kind))targets=state.enemies.filter(e=>e.hp>0&&distance(target,e)<=stats.splash);
   if(stats.kind==='chain')while(targets.length<stats.chainCount){const last=targets.at(-1);const next=state.enemies.filter(e=>e.hp>0&&!targets.includes(e)&&distance(last,e)<=stats.chainRange).sort((a,b)=>distance(last,a)-distance(last,b))[0];if(!next)break;targets.push(next);emit({type:'shot',x:last.x,y:last.y,tx:next.x,ty:next.y,code:tower.code,color:stats.color});}
   targets.forEach((enemy,i)=>{
    const bonus=stats.kind==='boss'&&enemy.boss?3:stats.kind==='pierce'&&enemy.boss?1.7:1;
    hit(tower,enemy,stats.damage*bonus*(stats.kind==='chain'?Math.pow(.78,i):1),stats);
    if(['slow','frost'].includes(stats.kind)){enemy.slowFactor=enemy.slowUntil>state.elapsed?Math.min(enemy.slowFactor,stats.slow):stats.slow;enemy.slowUntil=state.elapsed+stats.duration;}
   });
  }
  for(const enemy of state.enemies){
   if(enemy.hp<=0)continue;
   enemy.progress+=enemy.speed*dt*(enemy.slowUntil>state.elapsed?enemy.slowFactor:1);Object.assign(enemy,pointOnGemRoute(enemy.progress));
   if(enemy.arrived){enemy.hp=0;state.leaks++;state.coreHealth=Math.max(0,state.coreHealth-(enemy.boss?3:1));emit({type:'core-hit',amount:enemy.boss?3:1,x:enemy.x,y:enemy.y});}
  }
  state.enemies=state.enemies.filter(e=>e.hp>0);
  if(state.coreHealth<=0){state.phase='defeat';emit({type:'defeat',message:'出口耐久耗尽'});return;}
  if(queue===0&&state.enemies.length===0){
   state.waveActive=false;state.gold+=GEM_RULES.waveReward(state.wave);state.turnPhase='planning';
   if(eligible().length)state.pity=hasMerge()?0:state.pity+1;else state.pity=0;
   if(state.wave>=GEM_RULES.waveCount){state.phase='victory';emit({type:'victory',message:'二十波鉴定防线完成'});}else{state.draftCredits=1;emit({type:'wave-clear',amount:state.wave,message:'准备下一波'});}
  }
 }
 const game={state,catalog:GEM_TOWERS,technologies:GEM_TECHNOLOGIES,recipes:GEM_RECIPES,statsFor:t=>gemStats(t,state.towers),capacity,
  start(){if(state.phase==='menu')state.phase='playing';return result(true,'宝石准备阶段');},
  restart(){Object.assign(state,initialState());randomState=seed;nextId=1;nextEnemyId=1;events=[];spawnIn=0;queue=0;game.start();return result(true,'重新开始');},
  tick(dt){if(state.phase!=='playing'||state.paused||state.turnPhase!=='combat'||!Number.isFinite(dt)||dt<=0)return;let left=dt*state.speed;while(left>1e-9&&state.phase==='playing'&&state.turnPhase==='combat'){const stepTime=Math.min(.05,left);step(stepTime);left-=stepTime;}},
  togglePause(){if(state.phase==='playing')state.paused=!state.paused;},setSpeed(speed){if([1,2,3].includes(speed))state.speed=speed;},
  draw(){if(!planning())return result(false,'只能在准备阶段鉴定');if(state.draft)return result(false,'请先选留当前候选');if(state.draftCredits<1)return result(false,'本回合鉴定机会已用完');if(state.gold<GEM_RULES.draftCost)return result(false,'鉴定需要60金币');state.gold-=GEM_RULES.draftCost;state.draftCredits--;state.draft={candidates:candidates(),rerolls:0,spent:GEM_RULES.draftCost};return result(true,'请选择一颗宝石');},
  reroll(){if(!planning()||!state.draft)return result(false,'没有可刷新的候选');const cost=GEM_RULES.rerollCosts[state.draft.rerolls];if(cost===undefined)return result(false,'刷新次数已满');if(state.gold<cost)return result(false,'金币不足');state.gold-=cost;state.draft.spent+=cost;state.draft.rerolls++;state.draft.candidates=candidates();return result(true,'候选已刷新');},
  keep(index,destination){if(!planning()||!state.draft||!Number.isInteger(index)||!state.draft.candidates[index])return result(false,'无效候选');const status=placement(destination);if(!status.ok)return status;const candidate=state.draft.candidates[index];const tower={...candidate,id:nextId++,spent:state.draft.spent,assetCode:GEM_TOWERS.find(t=>t.code===candidate.code).assetCode,x:destination.x??0,y:destination.y??0,angle:0,cooldown:0};if(destination.inventory)state.inventory.push(tower);else state.towers.push(tower);state.scraps+=4;state.gold+=Math.floor(state.scraps/GEM_RULES.scrapThreshold)*GEM_RULES.scrapGold;state.scraps%=GEM_RULES.scrapThreshold;state.draft=null;emit({type:'build',x:tower.x,y:tower.y,code:tower.code});return {...result(true,'已选留宝石'),towerId:tower.id};},
  merge(primaryId,materialId){return fuse(primaryId,[materialId],null);},
  forge(recipeCode,primaryId,materialIds){const recipe=GEM_RECIPES.find(r=>r.code===recipeCode);return recipe&&Array.isArray(materialIds)?fuse(primaryId,materialIds,recipe):result(false,'未知配方');},
  store(id){if(!planning())return result(false,'只能在准备阶段收塔');const tower=state.towers.find(t=>t.id===id);if(!tower||!tower.code.startsWith('G')||state.inventory.length>=GEM_RULES.reserveSlots)return result(false,'普通宝石不存在或备选栏已满');state.towers=state.towers.filter(t=>t.id!==id);state.inventory.push(tower);return result(true,'已收回备选栏');},
  deployInventory(id,x,y){if(!planning())return result(false,'只能在准备阶段部署');const tower=state.inventory.find(t=>t.id===id);if(!tower)return result(false,'备选宝石不存在');const status=placement({x,y});if(!status.ok)return status;state.inventory=state.inventory.filter(t=>t.id!==id);Object.assign(tower,{x,y,cooldown:0});state.towers.push(tower);return result(true,'备选宝石已部署');},
  sell(id){if(!planning())return result(false,'只能在准备阶段出售');const tower=all().find(t=>t.id===id);if(!tower)return result(false,'宝石不存在');const amount=gemStats(tower).sellValue;state.gold+=amount;state.towers=state.towers.filter(t=>t.id!==id);state.inventory=state.inventory.filter(t=>t.id!==id);emit({type:'sell',x:tower.x,y:tower.y,amount});return result(true,'宝石已出售');},
  startCombat(){if(!planning())return result(false,'当前不能开战');if(state.draft)return result(false,'请先选留已付费候选');state.turnPhase='combat';state.wave++;state.waveActive=true;queue=GEM_RULES.waveSize(state.wave)+(state.wave%GEM_RULES.bossEvery===0?1:0);spawnIn=0;emit({type:'wave',amount:state.wave,message:`第 ${state.wave} 波${state.wave%GEM_RULES.bossEvery===0?' · 首领':''}`});return result(true,'开战');},
  launchWave(){return game.startCombat();},
  canBuildType(){return result(false,'宝石通过鉴定五选一取得');},canBuild(){return result(false,'请在鉴定面板选留或从备选栏部署');},build(){return game.canBuild();},canUpgrade(){return result(false,'宝石必须使用真实材料合成');},upgrade(){return game.canUpgrade();},continueEndless(){return result(false,'宝石模式以二十波为终点');},
  drainEvents(){const drained=events;events=[];return drained;},
  canResearch:research.canResearch,startResearch:research.startResearch,cancelResearch:research.cancelResearch,
 };
 return game;
}
