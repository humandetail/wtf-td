import {loopStats, loopTower, nearbyAttackers} from './loop-catalog.js';
import {createEnemyEffects} from './loop-enemy-effects.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clickOrder=(a,b)=>b.progress-a.progress||a.id-b.id;
const nearest=(point,list)=>list.sort((a,b)=>distance(point,a)-distance(point,b)||a.id-b.id);

export function createLoopCombat(state,emit,{onDeath,onDamage,flushExperience,summon,changeGold}){
 const alive=()=>state.enemies.filter(e=>e.hp>0);
 const area=(center,radius,limit,filter=(enemy)=>true)=>nearest(center,alive().filter(e=>distance(e,center)<=radius&&filter(e))).slice(0,limit);
 const strength=(e,kind)=>Math.max(0,...e.statuses.filter(s=>s.kind===kind&&s.until>state.elapsed).map(s=>s.value));
 const engage=t=>{if(t)t.combatUntil=state.elapsed+5;};
 function effect(e,kind,value,duration,source=0){
  if(e.hp<=0)return;
  const old=e.statuses.find(s=>s.kind===kind&&s.source===source);
  if(old){old.value=value;old.until=state.elapsed+duration;}
  else e.statuses.push({kind,value,until:state.elapsed+duration,source});
 }
 function heal(e,amount,out){
  const gain=Math.min(e.maxHp-e.hp,amount*(1-Math.min(.75,Math.max(out,strength(e,'suppress')))));
  if(gain>0&&e.hp>0){e.hp+=gain;emit({type:'heal',x:e.x,y:e.y,amount:gain});}
 }
 const enemyEffects=createEnemyEffects(state,{alive,effect,strength,heal,summon,emit});
 function interrupt(e){
  if(!e.channel||e.immuneUntil>state.elapsed)return false;
  e.channel=null;e.castUntil=0;
  if(e.boss)e.immuneUntil=state.elapsed+3;
  emit({type:'interrupt',x:e.x,y:e.y,code:e.code});
  return true;
 }
 function root(e,duration,t,s){
  if(e.hp<=0||e.boss&&(e.rootUntil>state.elapsed||e.immuneUntil>state.elapsed))return false;
  interrupt(e);
  e.rootUntil=Math.max(e.rootUntil,state.elapsed+duration*(1+s.control)*(e.boss?.5:1));
  if(e.boss)e.immuneUntil=e.rootUntil+3;
  enemyEffects.rooted(e);engage(t);return true;
 }
 function slow(e,value,duration,t,s){effect(e,'slow',value,duration*(1+s.control),t.id);if(e.hp>0)engage(t);}
 function addBurn(e,burn){
  if(e.hp<=0)return;
  const existing=e.burns.find(b=>b.towerId===burn.towerId);
  if(existing)Object.assign(existing,burn,{started:existing.until>state.elapsed?existing.started:burn.started});
  else e.burns.push(burn);
 }
 function effectiveBurn(e,time){return e.burns.filter(b=>b.until>time).sort((a,b)=>b.dps-a.dps||a.started-b.started)[0];}
 function propagate(e,burn){
  if(!burn?.primary||burn.level<3)return;
  const others=area(e,100,2,x=>!x.burns.some(b=>b.towerId===burn.towerId&&b.until>state.elapsed));
  for(const next of others)addBurn(next,{...burn,primary:false,dps:burn.dps*.6,until:state.elapsed+2,started:state.elapsed});
  if(burn.level>=5){
   const source=state.towers.find(t=>t.id===burn.towerId);
   for(const next of area(e,60,4))hurt(next,burn.damage*.5,'magic',source,{secondary:true,noPropagation:true,bossBonus:burn.bossBonus});
  }
 }
 /** @param {any} options */
 function hurt(e,amount,type,t=null,options={}){
  if(e.hp<=0||amount<=0||state.phase!=='playing')return;
  const opts={direct:true,...options},s=opts.stats;
  engage(t);
  const exposed=e.statuses.filter(x=>(x.kind==='vulnerable'||x.kind==='shieldExpose'&&e.shield>0)&&x.until>state.elapsed).sort((a,b)=>b.value-a.value||a.source-b.source)[0];
  if(exposed)engage(state.towers.find(tower=>tower.id===exposed.source));
  if(e.boss&&opts.direct)amount*=1+(opts.bossBonus??s?.bossBonus??0);
  if(s?.conditional&&(e.armor>0||e.shield>0)){
   amount*=1+s.conditional;
   engage(state.towers.find(tower=>tower.id===s.supportSources.find(source=>source.key==='conditional')?.id));
  }
  if(opts.arc&&strength(e,'wet'))amount*=1.25;
  amount*=1+Math.min(.25,exposed?.value??0);
  if(opts.direct&&e.shieldHits>0){
   e.shieldHits--;emit({type:'shield-hit',x:e.x,y:e.y});return;
  }
  if(type==='magic'&&strength(e,'magicBreak')>0){
   const source=e.statuses.filter(x=>x.kind==='magicBreak'&&x.until>state.elapsed).sort((a,b)=>b.value-a.value||a.source-b.source)[0];
   engage(state.towers.find(tower=>tower.id===source.source));
  }
  amount*=1-Math.max(0,enemyEffects.defense(e,type)-(opts.pierce??0));
  amount=enemyEffects.amountAfterArmor(e,amount,type,t,opts);
  const oldShield=e.shield,shieldMultiplier=opts.shieldMultiplier??1;
  const shieldPart=Math.min(amount,e.shield/shieldMultiplier);
  e.shield=Math.max(0,e.shield-shieldPart*shieldMultiplier);
  let life=amount-shieldPart;
  if(e.valveClosed&&opts.direct)life=Math.min(life,e.maxHp*.12);
  life=Math.min(e.hp,life);e.hp-=life;
  onDamage(e,life);
  emit({type:'hit',x:e.x,y:e.y,amount:shieldPart+life,color:s?.color??'#b5a2eb'});
  if(oldShield>0&&e.shield<=1e-9&&t?.code==='T21'&&t.level>=3&&!opts.secondary){
   if(e.hp>0)slow(e,.2,2,t,s);
   if(t.level>=5)for(const other of area(e,55,3,a=>a!==e))hurt(other,s.damage*.45,'magic',t,{stats:s,secondary:true});
  }
  if(e.hp>0){enemyEffects.hit(e,t,type,opts);return;}
  enemyEffects.dead(e);onDeath(e);
  if(!opts.noPropagation&&e.special!=='gold')propagate(e,effectiveBurn(e,state.elapsed));
  if(t?.code==='T16'&&t.level>=5&&opts.direct&&!opts.secondary&&e.special!=='gold'){
   const next=area(e,75,Infinity,a=>a.special!=='gold').sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id)[0];
   if(next)hurt(next,s.damage*.6,'magic',t,{stats:s,secondary:true});
  }
 }
 function rank(t,s){
  let priority=t.priority??'default';
  if(priority==='default')priority=({
   T02:'shield',T04:'strongest',T07:'support',T12:'armor',T13:'strongest',T16:'weakest',T18:'hits',
   T19:'fastest',T21:'durability',T23:'strongest',T24:'cast',T27:'fastest',T28:'durability',T35:'finish',
  })[t.code]??'progress';
  const score=e=>{
   switch(priority){
    case 'strongest': return e.hp+e.shield;
    case 'weakest': return -e.hp/e.maxHp;
    case 'fastest': return e.actualSpeed??e.speed;
    case 'armor': return e.armor;
    case 'shield': return e.shieldHits*1000+e.shield;
    case 'hits': return e.shieldHits;
    case 'durability': return e.shield;
    case 'support': return Number(e.support);
    case 'cast': return e.channel?2:Number(e.support);
    case 'finish': return Number(e.boss||e.elite)*2-e.hp/e.maxHp;
    default:return e.progress;
   }
  };
  return alive().filter(e=>!e.hidden&&distance(t,e)<=s.range).sort((a,b)=>
   (priority==='gold'?1:-1)*(Number(b.special==='gold')-Number(a.special==='gold'))||score(b)-score(a)||clickOrder(a,b));
 }
 function cone(t,angle,degrees,list,limit){
  const half=degrees*Math.PI/360;
  return list.filter(e=>{
   const a=Math.atan2(e.y-t.y,e.x-t.x)-angle;
   return Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<=half;
  }).slice(0,limit);
 }
 function targets(t,s,primary,ranked){
  if(t.code==='T05'){
   const list=[primary];
   while(list.length<s.targetCount){
    const last=list.at(-1),next=area(last,90,1,e=>!list.includes(e))[0];
    if(!next)break;
    list.push(next);
   }
   return list;
  }
  const angle=Math.atan2(primary.y-t.y,primary.x-t.x);
  if(t.code==='T08'||t.code==='T12'&&s.route||t.code==='T32'){
   const width=t.code==='T08'?80:t.code==='T12'?100:t.level>=5&&t.cycles%4===0?120:85;
   return cone(t,angle,width,[primary,...ranked.filter(e=>e!==primary)],s.targetCount);
  }
  if(s.splash)return area(primary,s.splash,s.targetCount);
  if(t.code==='T25'){
   const width=t.level>=5&&t.cycles%4===0?48:t.level>=3?34:24,dx=Math.cos(angle),dy=Math.sin(angle);
   const list=nearest(t,alive().filter(e=>{
    const x=e.x-t.x,y=e.y-t.y,along=x*dx+y*dy;
    return along>=0&&along<=s.range&&Math.abs(x*dy-y*dx)<=width/2;
   })).slice(0,s.targetCount);
   if(!list.includes(primary))list[list.length-1]=primary;
   return nearest(t,list);
  }
  if(t.code==='T07'&&t.level>=5&&t.cycles%4===0)return area(primary,80,5);
  return [primary,...ranked.filter(e=>e!==primary)].slice(0,s.targetCount);
 }
 function shot(t,e,s){
  emit({type:'shot',x:t.x,y:t.y,tx:e.x,ty:e.y,code:t.code,color:s.color});
 }
 function zone(t,e,{radius,limit,duration,interval,damage=0,kind='',value=0,delay=0,keep=false},s){
  if(kind==='heat'&&state.regions.some(z=>z.source===t.id&&z.kind===kind&&z.keep&&z.until>state.elapsed))return;
  if(!delay&&kind!=='suppress')state.regions=state.regions.filter(z=>z.source!==t.id||z.kind!==kind);
  state.regions.push({source:t.id,x:e.x,y:e.y,radius,limit,until:state.elapsed+duration+delay,nextAt:state.elapsed+delay+(delay?0:interval),
   interval,damage,kind,value,keep,control:s.control,bossBonus:s.bossBonus});
 }
 function assist(t,e){
  for(const source of state.towers){
   if(source.code!=='T36'||distance(source,t)>source.revealRange)continue;
   const mark=source.marks?.find(m=>m.id===e.id&&m.until>state.elapsed);
   if(!mark)continue;
   mark.hits.add(t.id);
   if(mark.hits.size<3)continue;
   mark.until=0;effect(e,'vulnerable',.18,3,source.id);engage(source);
   if(source.level>=5)charge(t,source,.25);
  }
 }
 function charge(target,source,bonus){
  if(target.chargeUntil>state.elapsed&&target.chargeMultiplier>1+bonus)return;
  target.chargeUntil=state.elapsed+8;target.chargeMultiplier=1+bonus;target.chargeSource=source.id;
 }
 function fire(t,s,ranked){
  const old=ranked.find(e=>e.id===t.lockId);
  const sameGroup=old&&((old.special==='gold')===(ranked[0].special==='gold'));
  const lock=t.code==='T01'||t.code==='T04';
  const primary=lock&&sameGroup?old:t.code==='T20'&&t.level>=3&&old===ranked[0]&&ranked[1]&&ranked[1].special===old.special?ranked[1]:ranked[0];
  const changed=t.lockId!==primary.id;
  if(changed||state.elapsed-(t.lastAttack??-100)>2*s.interval)t.streak=0;
  t.lockId=primary.id;t.lastAttack=state.elapsed;t.streak=(t.streak??0)+1;t.cycles=(t.cycles??0)+1;
  t.angle=Math.atan2(primary.y-t.y,primary.x-t.x);t.cooldown=s.interval;
  const list=targets(t,['T25','T32'].includes(t.code)?{...s,targetCount:loopStats(t,state).targetCount}:s,primary,ranked);
  engage(t);
  for(const source of s.supportSources.filter(source=>source.key!=='conditional'))engage(state.towers.find(a=>a.id===source.id));
  let multiplier=t.chargeUntil>state.elapsed?t.chargeMultiplier:1;
  if(multiplier>1)engage(state.towers.find(a=>a.id===t.chargeSource));
  t.chargeUntil=0;
  if(changed){
   const support=state.towers.filter(a=>a.code==='T29'&&nearbyAttackers(state,a,a.revealRange,a.level>=3?4:3).includes(t)&&!(t.rhythmUntil>state.elapsed))
    .sort((a,b)=>b.level-a.level||a.id-b.id)[0];
   if(support){multiplier*=support.level>=5?1.2:1.12;t.rhythmUntil=state.elapsed+(support.level>=3?3:4);engage(support);}
  }
  const doHit=(e,damage,type=s.damageType,opts={})=>hurt(e,damage,type,t,{stats:s,shieldMultiplier:s.shieldMultiplier,...opts});
  const [code,level]=[t.code,t.level];
  if(code==='T17'){
   shot(t,primary,s);
   const common={duration:.01,interval:1,kind:'mine',limit:6,radius:55,damage:s.damage*multiplier,value:level>=3?.2:0,delay:.45};
   zone(t,primary,common,s);
   if(level>=5&&t.cycles%3===0)zone(t,primary,{...common,limit:4,radius:40,damage:.45*s.damage,delay:.95},s);
   return;
  }
  let type=s.damageType;
  if(code==='T31')type=t.cycles%2?'physical':'magic';
  const otherType=type==='physical'?'magic':'physical';
  const enhanced=code==='T34'&&level>=3&&primary.rootUntil>state.elapsed&&!(t.heatReady>state.elapsed);
  if(enhanced){t.heatReady=state.elapsed+3;multiplier*=1.3;}
  const full=code==='T33'&&level>=3&&t.energy===3;
  if(code==='T33'){multiplier*=1+.35*(t.energy??0);t.energy=0;}
  for(const [index,e] of list.entries()){
   if(e.hp<=0)continue;
   shot(t,e,s);assist(t,e);
   let damage=s.damage*multiplier;
   if(code==='T05')damage*=.8**index;
   if(code==='T12')effect(e,'armor',.15,3,t.id);
   if(code==='T13')addBurn(e,{towerId:t.id,dps:s.burnDps,damage:s.damage,until:state.elapsed+3,started:state.elapsed,primary:true,level,bossBonus:s.bossBonus});
   if(code==='T01'&&level>=3||code==='T04'&&level>=3)damage*=1+Math.min(5,t.streak-1)*(code==='T01'?.08:.1);
   if(code==='T16'&&level>=3&&e.hp/e.maxHp<.25)damage*=1.35;
   if(code==='T18'){
    const count=level>=3&&e.shieldHits>0?4:3;
    for(let i=0;i<count&&e.hp>0;i++){
     const last=level>=5&&t.cycles%4===0&&i===count-1;
     doHit(e,damage*(last?1.6:1),type,{secondary:i>0});
     if(last)slow(e,.25,1,t,s);
    }
    continue;
   }
   if(code==='T20'&&level>=3&&old&&changed)damage*=1.2;
   if(code==='T21')s.shieldMultiplier=1.3;
   if(code==='T23'){
    const high=level>=3&&e.hp/e.maxHp>.7;
    damage+=Math.min(e.hp*(high?.015:.01),s.damage*(level>=5&&t.cycles%5===0?1.6:high?1.1:.8));
   }
   if(code==='T25')damage*=[1,.65,.45,.3,.25,.25,.25][index]??.25;
   if(code==='T27'&&strength(e,'haste')>0)damage*=1.25;
   if(code==='T31'&&level>=3&&enemyEffects.defense(e,type)-enemyEffects.defense(e,otherType)>=.2-1e-9)damage*=1.2;
   if(code==='T35'&&level>=3&&e.hp/e.maxHp<.3)damage*=1.3;
   doHit(e,damage,type,{arc:code==='T05',pierce:full?.15:0});
   if(e.hp<=0)continue;
   if(code==='T06'){slow(e,.15,1,t,s);effect(e,'wet',1,level>=3?5:3,t.id);}
   if(code==='T07')root(e,level>=3?.5:.65,t,s);
   if(code==='T08'){
    slow(e,.3,1.8,t,s);
    if(level>=3&&e===primary&&t.streak%3===0&&root(e,.8,t,s)&&level>=5)e.thaw={at:e.rootUntil,source:t.id};
   }
   if(code==='T02'&&level>=3)effect(e,'suppress',.5,3,t.id);
   if(code==='T19')slow(e,level>=3&&e.speed>=100?.4:.25,1.5,t,s);
   if(code==='T24'&&level>=3&&!(t.interruptAt>state.elapsed)&&interrupt(e)){
    t.interruptAt=state.elapsed+9;if(level>=5)effect(e,'suppress',.35,4,t.id);
   }
   if(code==='T26'&&level>=3&&e===primary&&strength(e,'wet')&&!(e.vortexUntil?.[t.id]>state.elapsed)){
    if(root(e,.45,t,s))(e.vortexUntil??={})[t.id]=state.elapsed+5;
   }
   if(code==='T27'&&level>=3&&strength(e,'haste')>0)slow(e,.3,1.5,t,s);
   if(code==='T28'&&e.shield>0)effect(e,'shieldExpose',level>=3?.18:.12,2,t.id);
  }
  if(code==='T15'){
   const keep=level>=5&&t.cycles%4===0;
   zone(t,primary,{duration:keep?3:2,interval:.5,kind:'heat',limit:level>=3?6:4,radius:level>=3?60:46,damage:s.damage*.35,keep},s);
  }
  if(code==='T32'&&level>=3)for(const e of cone(t,t.angle+Math.PI,level>=5&&t.cycles%4===0?120:85,ranked,level>=5&&t.cycles%4===0?5:3))doHit(e,s.damage*.65*multiplier);
  if(level<5)return;
  if(code==='T01'&&t.streak%6===0)doHit(primary,s.damage*.6,type,{secondary:true,pierce:1});
  if(code==='T04'&&t.streak%6===0)doHit(primary,s.damage,type,{secondary:true});
  if(code==='T03'&&t.cycles%4===0)for(let i=0;i<2;i++)for(const e of area(primary,35,3))doHit(e,s.damage*.25,type,{secondary:true});
  if(code==='T05'&&t.cycles%4===0)for(const e of area(list.at(-1),45,4))doHit(e,s.damage/.8*.35,type,{secondary:true});
  if(code==='T06'&&t.cycles%5===0)for(const e of area(primary,100,8))effect(e,'wet',1,5,t.id);
  if(code==='T02'&&t.cycles%4===0)zone(t,primary,{duration:3,interval:.2,kind:'suppress',value:.5,limit:6,radius:90},s);
  if(code==='T12'&&t.cycles%5===0)for(const e of area(primary,90,6)){effect(e,'armor',.15,3,t.id);doHit(e,s.damage*.4,type,{secondary:true});}
  if(code==='T19'&&t.cycles%3===0)for(const e of area(primary,55,4))if(e!==primary)slow(e,.2,2,t,s);
  if(code==='T20'&&t.cycles%4===0&&old&&old!==primary)doHit(old,s.damage*.5,type,{secondary:true});
  if(code==='T26'&&t.cycles%5===0)for(const e of area(primary,75,5,a=>strength(a,'wet')>0))slow(e,.35,2,t,s);
  if(code==='T27'&&t.cycles%4===0&&strength(primary,'haste')>0){
   const next=ranked.find(e=>e!==primary&&e.hp>0&&strength(e,'haste')>0);
   if(next){doHit(next,.7*s.damage,type,{secondary:true});slow(next,.3,1.5,t,s);}
  }
  if(code==='T28'&&t.cycles%4===0)for(const e of area(primary,65,3,a=>a!==primary&&a.shield>0))effect(e,'shieldExpose',.18,2,t.id);
  if(code==='T31'&&t.streak%5===0)doHit(primary,s.damage*.45,otherType,{secondary:true});
  if(code==='T33'&&full)for(const e of area(primary,60,4,a=>a!==primary))doHit(e,s.damage*.45,type,{secondary:true});
  if(code==='T34'&&enhanced)zone(t,primary,{duration:2,interval:.5,kind:'afterheat',limit:5,radius:58,damage:s.damage*.25},s);
  if(code==='T35'&&t.cycles%5===0&&primary.hp/primary.maxHp<.2){doHit(primary,s.damage*.7,type,{secondary:true});effect(primary,'suppress',.45,3,t.id);}
 }
 function pay(t,requested){
  const amount=state.endless?Math.min(requested,Math.max(0,Math.floor(state.endlessKills/10)-state.endlessSupply)):requested;
  if(!amount)return;
  changeGold(amount,'supply');if(state.endless)state.endlessSupply+=amount;
  emit({type:'income',x:t.x,y:t.y,amount,color:'#ffe494'});
 }
 function due(t,key,period,dt){
  t[key]=(t[key]??period)-dt;
  if(t[key]>1e-9)return false;
  t[key]+=period;return true;
 }
 function support(t,s,dt){
  if(t.code==='T11'){
   if((state.endless||state.goldRush)&&!alive().some(e=>e.special!=='gold'))return;
   if(due(t,'incomeIn',s.supplyInterval,dt))pay(t,s.supplyIncome);
   if(t.level>=5&&due(t,'dividendIn',state.endless?60:40,dt))pay(t,state.endless?1:30);
  }
  const strongest=()=>area(t,s.range,Infinity,e=>!e.hidden&&e.special!=='gold').sort((a,b)=>(b.hp+b.shield)-(a.hp+a.shield)||a.id-b.id);
  if(t.code==='T09'&&t.level>=3&&due(t,'markIn',2*(1-s.gearPeriod),dt)){
   const e=strongest()[0];if(e)effect(e,'vulnerable',t.level>=5&&(e.boss||e.elite)?.18:.1,2.5,t.id);
  }
  if(t.code==='T10'&&t.level>=5&&due(t,'pulseIn',10*(1-s.gearPeriod),dt))for(const target of nearbyAttackers(state,t,s.range,4))charge(target,t,.2);
  if(t.code==='T30'&&due(t,'markIn',3.5,dt)){
   const ordered=strongest().filter(e=>enemyEffects.defense(e,'magic')>0).sort((a,b)=>enemyEffects.defense(b,'magic')-enemyEffects.defense(a,'magic'));
   for(const e of ordered.slice(0,t.level>=5?2:1))effect(e,'magicBreak',t.level>=3?.18:.1,t.level>=3?2.5:2,t.id);
  }
  if(t.code==='T36'&&due(t,'markIn',6,dt))t.marks=strongest().slice(0,t.level>=3?2:1).map(e=>({id:e.id,until:state.elapsed+4,hits:new Set()}));
 }
 function statusStep(dt){
  for(const e of alive()){
   e.statuses=e.statuses.filter(s=>s.until>state.elapsed&&(s.kind!=='shieldExpose'||e.shield>0));
   if(e.thaw&&e.thaw.at<=state.elapsed){effect(e,'slow',.25,2,e.thaw.source);e.thaw=null;}
   const burn=effectiveBurn(e,state.elapsed-dt);
   if(burn){
    const time=Math.min(dt,Math.max(0,burn.until-(state.elapsed-dt)));
    const source=state.towers.find(t=>t.id===burn.towerId);
    hurt(e,burn.dps*time,'magic',source,{direct:false,secondary:!burn.primary,noPropagation:!burn.primary});
    flushExperience();
   }
   e.burns=e.burns.filter(b=>b.until>state.elapsed);
   e.burnRemaining=Math.max(0,...e.burns.map(b=>b.until-state.elapsed));
   if(e.hp>0)enemyEffects.check(e);
  }
  for(const z of state.regions){
   if(z.nextAt>state.elapsed+1e-9||z.nextAt>z.until+1e-9)continue;
   z.nextAt+=z.interval;
   const t=state.towers.find(t=>t.id===z.source);
   const list=area(z,z.radius,z.limit);
   for(const [index,e] of list.entries()){
    if(z.damage)hurt(e,z.damage,z.kind==='mine'?'physical':'magic',t,{direct:z.kind==='mine',secondary:true,bossBonus:z.bossBonus});
    if(z.kind==='mine'&&z.value&&index<4)slow(e,z.value,1.2,t,z);
    if(z.kind==='suppress'){
     effect(e,'suppress',z.value,.4,z.source);if(e.support)effect(e,'outSuppress',z.value,.4,z.source);
     if(list.length)engage(t);
    }
   }
   flushExperience();
  }
  state.regions=state.regions.filter(z=>z.nextAt<=z.until+1e-9);
 }
 function step(dt){
  state.dust=state.dust.filter(z=>z.until>state.elapsed);
  for(const t of state.towers){
   const s=loopStats(t,state);
   t.attack=s.damage>0;t.revealRange=s.range;
  }
  statusStep(dt);
  const supplies=state.towers.filter(t=>t.code==='T11');
  const granted=state.endlessSupply;
  for(let i=0;i<supplies.length;i++){
   const tower=supplies[(state.supplyCursor+i)%supplies.length];
   support(tower,loopStats(tower,state),dt);
  }
  if(supplies.length&&state.endlessSupply!==granted)state.supplyCursor=(state.supplyCursor+1)%supplies.length;
  for(const t of state.towers){
   if(state.phase!=='playing')break;
   if(t.code==='T11')continue;
   const s=loopStats(t,state);
   if(s.role==='support'){support(t,s,dt);continue;}
   t.cooldown=Math.max(0,(t.cooldown??0)-dt);
   if(t.code!=='T33'&&(t.cooldown>1e-9||t.silenceUntil>state.elapsed))continue;
   const ranked=rank(t,s);
   if(t.code==='T33'){
    if(!ranked.length){
     t.chargeTime=(t.chargeTime??0)+dt;
     if(t.chargeTime>=2-1e-9){t.chargeTime-=2;t.energy=Math.min(t.level>=3?3:2,(t.energy??0)+1);}
    }
   }
   if(t.cooldown>1e-9||t.silenceUntil>state.elapsed)continue;
   if(ranked.length){fire(t,s,ranked);flushExperience();}
   else t.streak=0;
  }
  state.enemies=alive();
 }
 return {step,strength,junction:enemyEffects.junction};
}
