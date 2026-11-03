import {loopStats} from './loop-catalog.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function createLoopCombat(state,emit){
 let supplyRequested=false;
 const alive=()=>state.enemies.filter(e=>e.hp>0);
 function effect(e,kind,value,duration,source=0){if(e.hp<=0)return;const old=e.statuses.find(s=>s.kind===kind&&s.source===source);if(old){old.value=value;old.until=state.elapsed+duration;}else e.statuses.push({kind,value,until:state.elapsed+duration,source});}
 const strength=(e,kind)=>Math.max(0,...(e.statuses||[]).filter(s=>s.kind===kind&&s.until>state.elapsed).map(s=>s.value));
 function root(e,duration,tower){if(e.hp<=0)return false;if(e.boss&&(e.rootUntil>state.elapsed||e.immuneUntil>state.elapsed))return false;e.rootUntil=Math.max(e.rootUntil,state.elapsed+duration*(e.boss?.5:1));if(e.boss)e.immuneUntil=e.rootUntil+3;return true;}
 function hurt(e,amount,type='magic',tower=null,opts={}){
  if(e.hp<=0||amount<=0)return;
  const stats=tower?loopStats(tower,state):null,oldShield=e.shield;
  if(stats?.conditional&&(e.armor>0||e.shield>0))amount*=1+stats.conditional;
  if(opts.arc&&strength(e,'wet'))amount*=1.25;
  amount*=1+Math.min(.25,strength(e,'vulnerable'));
  if(type==='physical'&&!opts.pierce)amount*=1-Math.max(0,e.armor-strength(e,'armor'));
  const shieldPart=Math.min(amount,e.shield/(opts.shieldMultiplier||1));e.shield=Math.max(0,e.shield-shieldPart*(opts.shieldMultiplier||1));
  const healthPart=amount-shieldPart;e.hp=Math.max(0,e.hp-healthPart);
  emit({type:'hit',x:e.x,y:e.y,amount:shieldPart+healthPart,color:stats?.color||'#b5a2eb'});
  if(oldShield>0&&e.shield<=1e-9&&tower?.code==='T02'&&tower.route==='A'&&tower.level>=5)effect(e,'vulnerable',stats.master?.2:.15,stats.master?5:4,tower.id);
  if(e.hp>0)return;
  state.kills++;state.gold+=e.reward;if(e.endless)state.endlessKills++;
  emit({type:'kill',x:e.x,y:e.y,code:e.code,amount:e.reward});
  if(opts.secondary)return;
  const burn=(e.burns||[]).filter(b=>b.until>state.elapsed).sort((a,b)=>b.dps-a.dps||a.started-b.started)[0];
  if(burn?.primary&&burn.route==='B'){
   const others=alive().filter(x=>distance(x,e)<=100&&!x.burns.some(b=>b.towerId===burn.towerId&&b.until>state.elapsed)).sort((a,b)=>distance(a,e)-distance(b,e)||a.id-b.id).slice(0,burn.advanced?3:2);
   for(const next of others)addBurn(next,{...burn,primary:false,dps:burn.dps*.6,until:state.elapsed+2,started:state.elapsed,covered:0});
   if(burn.level>=5)for(const next of area(e,burn.master?75:60,burn.master?6:4))hurt(next,burn.damage*(burn.master?.65:.5),'magic',null,{secondary:true});
  }
 }
 function addBurn(e,burn){const old=e.burns.find(b=>b.towerId===burn.towerId);if(old){const covered=old.until>state.elapsed&&old.level===burn.level&&old.route===burn.route?old.covered:0;Object.assign(old,burn,{covered,started:old.until>state.elapsed?old.started:burn.started});}else e.burns.push(burn);}
 function area(center,radius,limit){return alive().filter(e=>distance(e,center)<=radius).sort((a,b)=>distance(a,center)-distance(b,center)||a.id-b.id).slice(0,limit);}
 function slow(e,value,duration,t){effect(e,'slow',value,duration,t.id);}
 function rank(t,s){
  let priority=t.priority||'default';
  if(priority==='default')priority=t.code==='T12'||t.code==='T03'&&t.route==='B'?'armor':t.code==='T02'&&t.route!=='B'?'shield':t.code==='T07'&&t.route!=='B'||t.code==='T02'&&t.route==='B'?'support':t.code==='T04'&&t.route!=='B'||t.code==='T13'?'strongest':t.code==='T14'&&t.route==='B'?'weakest':'progress';
  const score=e=>priority==='strongest'?e.hp+e.shield:priority==='weakest'?-e.hp/e.maxHp:priority==='fastest'?e.speed*(1-Math.min(.6,strength(e,'slow'))*(e.boss?.5:1)):priority==='armor'?e.armor:priority==='shield'?e.shield:priority==='support'?Number(e.support):e.progress;
  return alive().filter(e=>distance(t,e)<=s.range).sort((a,b)=>score(b)-score(a)||b.progress-a.progress||a.id-b.id);
 }
 function targets(t,s,primary,ranked){
  if(t.code==='T05'){
   const list=[primary];while(list.length<s.targetCount){const last=list.at(-1),next=alive().filter(e=>!list.includes(e)&&distance(last,e)<=90).sort((a,b)=>distance(last,a)-distance(last,b)||a.id-b.id)[0];if(!next)break;list.push(next);}return list;
  }
  if(t.code==='T08'||t.code==='T12'&&t.route==='B'){
   const angle=Math.atan2(primary.y-t.y,primary.x-t.x),half=(t.code==='T12'?100:t.route==='B'?120:80)*Math.PI/360;
   return ranked.filter(e=>{const a=Math.atan2(e.y-t.y,e.x-t.x)-angle;return Math.abs(Math.atan2(Math.sin(a),Math.cos(a)))<=half;}).slice(0,s.targetCount);
  }
  if(t.code==='T03'||t.code==='T06')return area(primary,s.splash,s.targetCount);
  if(t.code==='T04'&&t.route==='B'){
   const dx=(primary.x-t.x)/distance(t,primary),dy=(primary.y-t.y)/distance(t,primary),width=s.advanced?32:24;
   return ranked.filter(e=>{const x=e.x-t.x,y=e.y-t.y,along=x*dx+y*dy;return along>=0&&along<=s.range&&Math.abs(x*dy-y*dx)<=width/2;}).sort((a,b)=>distance(t,a)-distance(t,b)||a.id-b.id).slice(0,s.targetCount);
  }
  if(t.code==='T07'&&t.route==='B'&&t.level>=5&&t.cycles%4===0)return area(primary,80,s.master?7:5);
  return ranked.slice(0,s.targetCount);
 }
 function burnHit(e,t,s){addBurn(e,{towerId:t.id,dps:s.burnDps,damage:s.damage,until:state.elapsed+(t.route==='A'?4:3),started:state.elapsed,covered:0,primary:true,route:t.route,level:t.level,advanced:s.advanced,master:s.master,burstIn:4});}
 function fire(t,s,ranked){
  const lock=t.code==='T01'&&t.route==='A'||t.code==='T04'&&t.route!=='B'||t.code==='T05'&&t.route==='B'||t.code==='T12'&&t.route==='A'||t.code==='T03'&&t.route==='B';
  const previous=ranked.find(e=>e.id===t.lockId),primary=lock&&previous?previous:ranked[0];
  if(t.lockId!==primary.id||state.elapsed-(t.lastAttack??-100)>2*s.interval){t.streak=0;t.stacks=0;}
  t.lockId=primary.id;t.lastAttack=state.elapsed;t.streak=(t.streak||0)+1;t.cycles=(t.cycles||0)+1;
  t.angle=Math.atan2(primary.y-t.y,primary.x-t.x);t.cooldown=s.interval;
  const before=state.kills,list=targets(t,s,primary,ranked),burst=t.chargeUntil>state.elapsed?(t.chargeMultiplier||1.2):1;t.chargeUntil=0;
  for(const [index,e] of list.entries()){
   emit({type:'shot',x:index&&t.code==='T05'?list[index-1].x:t.x,y:index&&t.code==='T05'?list[index-1].y:t.y,tx:e.x,ty:e.y,code:t.code,color:s.color});
   let multiplier=burst;
   if(t.code==='T05')multiplier*=t.route==='B'?(index===0?(s.advanced?1.4:1.25):.6):.8**index;
   if(t.code==='T04'&&t.route==='B')multiplier*=[1,.65,.45,.3,.3,.3][index];
   if(t.code==='T03'&&t.route==='B'&&e.armor>0)multiplier*=s.advanced?1.5:1.35;
   if((t.code==='T01'||t.code==='T04')&&t.route==='A')multiplier*=1+Math.min(5,t.streak-1)*(t.code==='T01'?(s.advanced?.1:.08):(s.advanced?.12:.1));
   if(t.code==='T12')effect(e,'armor',t.route==='A'?(s.advanced?.3:.25):.15,3,t.id);
   if(t.code==='T03'&&t.route==='B'&&t.level>=5&&t.streak%3===0)effect(e,'armor',s.master?.25:.2,s.master?5:4,t.id);
   if(t.code==='T13')burnHit(e,t,s);
   hurt(e,s.damage*multiplier,s.damageType,t,{arc:t.code==='T05',shieldMultiplier:s.shieldMultiplier});
   if(e.hp<=0)continue;
   if(t.code==='T08'){slow(e,.3,1.8,t);if(t.route==='A'&&e===primary&&t.streak%3===0&&root(e,s.advanced?1:.8,t)&&t.level>=5){e.thaw={at:e.rootUntil,value:s.master?.35:.25,duration:s.master?3:2,source:t.id};}}
   if(t.code==='T06'){slow(e,s.slow,t.route==='A'?1.8:1,t);effect(e,'wet',1,t.route==='B'?(s.advanced?6:5):3,t.id);}
   if(t.code==='T07'){const duration=t.route==='A'?(s.advanced?1.2:1):t.route==='B'?(t.level>=5&&s.master&&t.cycles%4===0?.65:.5):.65;
    if(root(e,duration,t)&&t.route==='A'&&t.level>=5)effect(e,'vulnerable',s.master?.2:.15,s.master?3:2,t.id);}
   if(t.code==='T02'&&t.route==='B')effect(e,'suppress',s.advanced?.6:.5,3,t.id);
  }
  if(t.level>=5){
   if(t.code==='T12'&&t.route==='A'&&t.streak%4===0)hurt(primary,s.damage*(s.master?1.2:.8),'physical',t,{secondary:true});
   if(t.code==='T12'&&t.route==='B'&&t.cycles%5===0)for(const e of area(primary,s.master?110:90,s.master?8:6)){effect(e,'armor',s.master?.2:.15,3,t.id);hurt(e,s.damage/.7*.4,'physical',t,{secondary:true});}
   if(t.code==='T08'&&t.route==='B'&&t.cycles%5===0)region(t,primary,s.master?100:80,3,'slow',s.master?.5:.4,6);
   if(t.code==='T05'&&t.route==='A'&&t.cycles%4===0)for(const e of area(list.at(-1),s.master?60:45,s.master?5:4))hurt(e,s.damage/.8*(s.master?.5:.35),'magic',t,{secondary:true});
   if(t.code==='T05'&&t.route==='B'&&t.streak%4===0)hurt(primary,s.damage*(s.master?1.5:1),'magic',t,{secondary:true,arc:true});
   if(t.code==='T01'&&t.route==='A'&&t.streak%6===0)hurt(primary,s.damage*(s.master?1:.6),'physical',t,{secondary:true,pierce:true});
   if(t.code==='T04'&&t.route==='A'&&t.streak%6===0)hurt(primary,s.damage*(s.master?1.5:1),'magic',t,{secondary:true});
   if(t.code==='T03'&&t.route==='A'&&t.cycles%4===0)for(let i=0;i<2;i++)for(const e of area(primary,s.master?45:35,3))hurt(e,s.damage/.9*(s.master?.35:.25),'physical',t,{secondary:true});
   if(t.code==='T03'&&t.route==='B'&&t.streak%3===0)hurt(primary,s.damage*.5,'physical',t,{secondary:true});
   if(t.code==='T06'&&t.route==='A'&&t.cycles%4===0)root(primary,s.master?1.1:.8,t);
   if(t.code==='T06'&&t.route==='B'&&t.cycles%5===0)for(const e of area(primary,s.master?125:100,s.master?10:8))effect(e,'wet',1,s.advanced?6:5,t.id);
   if(t.code==='T02'&&t.route==='B'&&t.cycles%4===0)region(t,primary,s.master?110:90,3,'suppress',s.master?.7:.5,6);
  }
  if(t.code==='T14'&&t.route==='B'){
   const extra=list.find(e=>e.hp>0&&e.hp/e.maxHp<=(s.advanced?.35:.3));if(extra){emit({type:'shot',x:t.x,y:t.y,tx:extra.x,ty:extra.y,code:t.code,color:s.color});hurt(extra,s.damage*.6,'physical',t,{secondary:true});}
   if(t.level>=5&&state.kills>before)t.cooldown*=1-(s.master?.35:.25);
  }
 }
 function region(t,point,radius,duration,kind,value,limit){state.regions.push({source:t.id,x:point.x,y:point.y,radius,until:state.elapsed+duration,nextAt:state.elapsed,kind,value,limit});}
 function pay(t,requested){supplyRequested=true;let amount=requested;if(state.endless)amount=Math.min(requested,Math.max(0,Math.floor(state.endlessKills/10)-state.endlessSupply));if(amount<=0)return;state.gold+=amount;if(state.endless)state.endlessSupply+=amount;emit({type:'income',x:t.x,y:t.y,amount,color:'#ffe494'});}
 function supportStep(t,s,dt){
  if(t.code==='T11'){
   if(state.endless&&!alive().length)return;
   const cycle=state.endless?20:8;t.incomeIn=(t.incomeIn??cycle)-dt;
   if(t.incomeIn<=1e-9){t.incomeIn+=cycle;pay(t,state.endless?(t.route==='A'?(s.advanced?3:2):1):s.income+(t.route==='A'?(s.advanced?10:8):0));}
   if(t.route==='A'&&t.level>=5){const period=state.endless?(s.master?45:60):40;t.dividendIn=(t.dividendIn??period)-dt;if(t.dividendIn<=1e-9){t.dividendIn+=period;pay(t,state.endless?1:s.master?40:30);}}return;
  }
  if(t.code==='T09'&&t.route==='A'){
   t.markIn=(t.markIn??2)-dt;if(t.markIn<=1e-9){t.markIn+=2;const e=alive().filter(e=>distance(t,e)<=s.range).sort((a,b)=>(b.hp+b.shield)-(a.hp+a.shield)||a.id-b.id)[0];if(e)effect(e,'vulnerable',t.level>=5&&(e.boss||e.code==='X12')?(s.master?.22:.18):(s.advanced?.12:.1),2.5,t.id);}return;
  }
  if(t.level<5)return;
  const pulse=t.code==='T09'&&t.route==='B'||t.code==='T10'&&t.route==='A',calibrate=t.code==='T10'&&t.route==='B';
  if(!pulse&&!calibrate)return;
  const period=calibrate?10:12;t.pulseIn=(t.pulseIn??period)-dt;
  if(t.pulseIn<=1e-9){t.pulseIn+=period;if(pulse)t.pulseUntil=state.elapsed+(s.master?4:3);else for(const ally of state.towers.filter(a=>loopStats(a,state).role!=='support'&&distance(a,t)<=s.range).sort((a,b)=>a.id-b.id).slice(0,4)){ally.chargeUntil=state.elapsed+8;ally.chargeMultiplier=s.master?1.3:1.2;}}
 }
 function statusStep(dt){
  for(const zone of state.regions)if(zone.until>state.elapsed&&zone.nextAt<=state.elapsed){zone.nextAt=state.elapsed+.2;for(const e of area(zone,zone.radius,zone.limit)){effect(e,zone.kind,zone.value,.4,zone.source);if(zone.kind==='suppress'&&e.healer)effect(e,'outSuppress',zone.value,.4,zone.source);}}
  state.regions=state.regions.filter(z=>z.until>state.elapsed);
  for(const e of alive()){
   e.statuses=e.statuses.filter(s=>s.until>state.elapsed);
   if(e.thaw&&e.thaw.at<=state.elapsed){effect(e,'slow',e.thaw.value,e.thaw.duration,e.thaw.source);e.thaw=null;}
   const burn=e.burns.filter(b=>b.until>state.elapsed-dt).sort((a,b)=>b.dps-a.dps||a.started-b.started)[0];
   if(burn){const time=Math.min(dt,Math.max(0,burn.until-(state.elapsed-dt)));hurt(e,burn.dps*time,'magic',null,{secondary:!burn.primary});burn.covered+=time;
    if(e.hp>0&&burn.primary&&burn.route==='A'&&burn.level>=5&&burn.covered>=4-1e-9){burn.covered-=4;hurt(e,burn.damage*(burn.master?1.5:1),'magic',null,{secondary:true});}}
   for(const b of e.burns)if(b!==burn)b.covered=0;
   e.burns=e.burns.filter(b=>b.until>state.elapsed);e.burnRemaining=Math.max(0,...e.burns.map(b=>b.until-state.elapsed));
  }
  for(const e of alive()){
   if(e.healer){e.healIn-=dt;if(e.healIn<=1e-9){e.healIn+=3;const target=alive().filter(a=>a!==e&&a.hp<a.maxHp&&distance(a,e)<=160).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id)[0];if(target)heal(target,target.maxHp*(target.boss?.01:.03),strength(e,'outSuppress'));}}
   if(e.boss&&e.wave>=15){e.selfHealIn-=dt;if(e.selfHealIn<=1e-9){e.selfHealIn+=10;heal(e,e.maxHp*.01,0);}}
  }
 }
 function heal(e,amount,out){const effective=amount*(1-Math.min(.75,Math.max(out,strength(e,'suppress'))));const gain=Math.min(e.maxHp-e.hp,effective);if(gain>0){e.hp+=gain;emit({type:'heal',x:e.x,y:e.y,amount:gain});}}
 function step(dt){
  statusStep(dt);
  // Rotate processing order so a global endless supply allowance is shared fairly.
  supplyRequested=false;const supplies=state.towers.filter(t=>t.code==='T11');if(supplies.length){const offset=state.supplyCursor%supplies.length;for(let i=0;i<supplies.length;i++){const t=supplies[(i+offset)%supplies.length];supportStep(t,loopStats(t,state),dt);}if(supplyRequested)state.supplyCursor=(offset+1)%supplies.length;}
  for(const t of state.towers){if(t.code==='T11')continue;const s=loopStats(t,state);if(s.role==='support'){supportStep(t,s,dt);continue;}
   t.cooldown=Math.max(0,(t.cooldown||0)-dt);if(t.cooldown>1e-9)continue;const ranked=rank(t,s);if(ranked.length)fire(t,s,ranked);else {t.streak=0;t.lockId=null;}}
  state.enemies=state.enemies.filter(e=>e.hp>0);
 }
 return {step,hurt,effect,strength,root,rank};
}
