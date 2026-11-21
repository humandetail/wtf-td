const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function createEnemyEffects(state,{alive,effect,strength,heal,summon,emit}){
 const nearby=(point,range,predicate)=>alive().filter(e=>e!==point&&e.special!=='gold'&&distance(point,e)<=range&&predicate(e))
  .sort((a,b)=>distance(point,a)-distance(point,b)||a.id-b.id);
 const towerNear=(e,range,limit)=>state.towers.filter(t=>t.attack&&distance(e,t)<=range)
  .sort((a,b)=>distance(e,a)-distance(e,b)||a.id-b.id).slice(0,limit);
 function every(e,key,interval){
  const due=e.skillAt[key]??e.spawnedAt+interval;
  if(due>state.elapsed+1e-9)return false;
  e.skillAt[key]=state.elapsed+interval;return true;
 }
 function once(e,key,threshold){
  if(e.hp>e.maxHp*threshold||e.skillAt[key])return false;
  e.skillAt[key]=true;return true;
 }
 function addShield(e,value,seconds=Infinity,limit=Infinity){
  e.shield=Math.min(limit,e.shield+value);e.maxShield=Math.max(e.shield,e.maxShield);
  if(Number.isFinite(seconds))e.shieldUntil=state.elapsed+seconds;
 }
 function supportOutput(e){
  if(strength(e,'blockOut')>0)return 0;
  if(!e.supportDampened)return 1;
  e.supportDampened=false;
  return .5;
 }
 function cast(e,kind,duration,target=null){
  e.channel={kind,until:state.elapsed+duration,start:state.elapsed,targetId:target?.id??null,startHp:e.hp};
  e.castUntil=e.channel.until;
  emit({type:'boss-cast',code:e.code,x:e.x,y:e.y,message:e.name+'正在蓄力'});
 }
 function completeCast(e){
  const {kind,targetId,startHp}=e.channel;
  const out=strength(e,'outSuppress');
  e.channel=null;e.castUntil=0;
  if(kind==='charge')effect(e,'haste',.6,3);
  if(kind==='heal')heal(e,e.maxHp*.08,out);
  if(kind==='aid'){
   const target=alive().find(a=>a.id===targetId);
   if(target)heal(target,target.maxHp*(target.boss?.04:.12)*supportOutput(e),out);
  }
  if(kind==='reverse')heal(e,Math.min(e.maxHp*.12,Math.max(0,startHp-e.hp)*.5),out);
  if(kind==='guard-heal'){
   const allies=alive().filter(a=>a.special==='challenge'&&!a.boss);
   const multiplier=allies.length?supportOutput(e):0;
   for(const ally of allies)heal(ally,ally.maxHp*.25*multiplier,out);
  }
  if(kind==='chain'||kind==='thunder'){
   const target=state.towers.find(t=>t.id===targetId);
   if(target){
    if(kind==='chain')target.silenceUntil=state.elapsed+2;
    else {target.hostileRate=.30;target.hostileRateUntil=state.elapsed+3;}
   }
  }
  if(kind==='drum')for(const ally of nearby(e,150,a=>!a.boss&&!a.special).slice(0,5))effect(ally,'haste',.4,4,e.id);
 }
 function hit(e,t,type,opts){
  if(e.hp<=0)return;
  const now=state.elapsed;
  switch(e.code){
   case 'X09': if(once(e,'ward',.5))effect(e,'magicArmor',.35,4);break;
   case 'X14': if(t&&opts.direct&&distance(e,t)>140&&!e.skillAt.dash){e.skillAt.dash=true;effect(e,'haste',.75,.8);}break;
   case 'X16': if(once(e,'static',.5))for(const tower of towerNear(e,145,1)){tower.hostileRate=.18;tower.hostileRateUntil=now+3;}break;
   case 'X25': if(once(e,'door',.35)){e.stopUntil=now+1.5;e.skillAt.sprint=now+1.5;}break;
   case 'E01': if(once(e,'cleanse',.5)){e.statuses=e.statuses.filter(s=>!['slow','wet','armor','vulnerable','suppress','outSuppress'].includes(s.kind));e.rootUntil=0;}break;
   case 'E04': if(once(e,'reload',.6))e.shieldHits=4;break;
   case 'E08': if(once(e,'cleanse',.7))for(const a of nearby(e,105,a=>!a.boss&&!a.special).slice(0,4))a.statuses=a.statuses.filter(s=>!['slow','armor','vulnerable','suppress','outSuppress'].includes(s.kind));break;
   case 'E09':
    if(opts.direct&&!(e.skillAt.adapt>now)){
     e.streak=e.lastType===type?(e.streak??0)+1:1;e.lastType=type;
     if(e.streak>=4){e.streak=0;e.adaptType=type;e.adaptUntil=now+3;e.skillAt.adapt=now+8;}
    }break;
   case 'B02': if(once(e,'refraction',.5))e.shieldHits=6;break;
   case 'B04':
    if(once(e,'physical',.75))e.physicalUntil=now+6;
    if(once(e,'magic',.4))e.skillAt.magicStart=Math.max(now,e.physicalUntil??0);
    break;
   case 'B07': {
    const upper=once(e,'first',.75),lower=once(e,'second',.4);
    if((upper||lower)&&!alive().some(a=>a.parentId===e.id))summon(e,'X13',2,0);
    break;
   }
   case 'B10': if(once(e,'reload',.5))e.skillAt.reloadAt=now+1;break;
   case 'B11': e.reroute=(e.reroute??0)+Number(once(e,'first',.75))+Number(once(e,'second',.35));break;
   case 'C04': if(once(e,'reload',.5))e.shieldHits+=4;break;
  }
 }
 function rooted(e){
  if(e.code==='X17'&&!e.skillAt.root){e.skillAt.root=true;addShield(e,35*e.scale,3);}
  if(e.code==='X24'&&!e.skillAt.root){e.skillAt.root=true;e.skillAt.unroot=e.rootUntil;}
  if(e.code==='C03'&&!e.skillAt.root){e.skillAt.root=true;addShield(e,e.maxHp*.15,4);}
 }
 function dead(e){
  if(e.special==='gold')return;
  if(e.code==='X19')state.dust.push({x:e.x,y:e.y,until:state.elapsed+2.5});
  for(const a of nearby(e,100,a=>a.code==='X23'&&!e.elite&&!e.boss&&!e.special)){
   if(a.skillAt.pickup>state.elapsed)continue;
   a.skillAt.pickup=state.elapsed+3;addShield(a,30*a.scale,Infinity,60*a.scale);
  }
  if(e.code==='C02')for(const a of nearby(e,Infinity,a=>a.code==='C02'))effect(a,'haste',.35,3);
 }
 function junction(e){
  if(e.code==='X07'&&e.junctions===1)effect(e,'haste',.35,2);
  if(e.code==='E03'&&e.junctions%2===0)e.hiddenUntil=state.elapsed+2;
  if(e.code==='B06'&&e.junctions===2)e.skillAt.mist=state.elapsed+12;
  if(e.code==='C06'&&e.junctions===1){e.hiddenUntil=state.elapsed+3;e.skillAt.mist=state.elapsed+8;}
  if(e.code==='G03'&&e.junctions===1)effect(e,'haste',.25,2);
 }
 function amountAfterArmor(e,amount,type,t,opts){
  const now=state.elapsed;
  if(e.code==='X13'&&opts.direct&&t&&distance(e,t)>150)amount*=.75;
  if(e.code==='X22'&&!opts.direct)amount*=.55;
  if(e.code==='X25'&&e.stopUntil>now)amount*=.5;
  if(e.code==='E09'&&e.adaptUntil>now&&e.adaptType===type)amount*=.75;
  if(e.code==='B07'&&opts.direct&&state.enemies.some(a=>a.parentId===e.id&&a.hp>0&&distance(e,a)<=120))amount*=.7;
  if(e.code==='B08'&&opts.direct&&e.mirrorType===type)amount*=.35;
  return amount;
 }
 function defense(e,type){
  const now=state.elapsed;
  if(type==='physical'){
   const armor=e.armor+Number(e.physicalUntil>now)*.4;
   return Math.max(0,Math.max(armor,strength(e,'guard'))-strength(e,'armor'));
  }
  return Math.max(0,Math.max(e.magicResist??0,strength(e,'magicArmor'),e.magicUntil>now?.4:0)-strength(e,'magicBreak'));
 }
 function check(e){
  const now=state.elapsed;
  if(e.shieldUntil&&e.shieldUntil<=now){e.shield=0;e.shieldUntil=0;}
  if(e.skillAt.sprint&&e.skillAt.sprint<=now){effect(e,'haste',.3,2);delete e.skillAt.sprint;}
  if(e.skillAt.unroot&&e.rootUntil<=now){e.slowImmuneUntil=now+2;delete e.skillAt.unroot;}
  if(e.skillAt.magicStart!=null&&e.skillAt.magicStart<=now){e.magicUntil=now+6;delete e.skillAt.magicStart;}
  if(e.skillAt.reloadAt&&e.skillAt.reloadAt<=now){e.shieldHits=8;addShield(e,e.maxHp*.06);delete e.skillAt.reloadAt;}
  if(e.channel&&e.channel.until<=now)completeCast(e);
  const age=now-e.spawnedAt;
  switch(e.code){
   case 'X15': e.hiddenUntil=age>=2&&(age-2)%5<2?now+.06:0;break;
   case 'X18': for(const a of nearby(e,120,a=>!a.elite&&!a.boss&&!a.special).slice(0,4))effect(a,'haste',.18,.1,e.id);break;
   case 'X21': if(every(e,'shield',5)){
    const a=nearby(e,125,a=>!a.boss&&!a.elite&&!a.special&&a.shield<=0)[0];
    const multiplier=a?supportOutput(e):0;
    if(multiplier>0)addShield(a,45*e.scale*multiplier,4);
   }break;
   case 'E02': for(const a of nearby(e,130,a=>!a.boss&&!a.special).slice(0,4))effect(a,'guard',.2,.1,e.id);break;
   case 'E05': if(every(e,'jam',5))for(const t of towerNear(e,155,2)){t.hostileRate=.20;t.hostileRateUntil=now+2;}break;
   case 'B06':
   case 'C06': if(e.skillAt.mist&&e.skillAt.mist<=now){e.hiddenUntil=now+(e.code==='B06'?2.5:2);e.skillAt.mist=now+(e.code==='B06'?12:8);}break;
   case 'B08': if(age>=6)e.mirrorType=Math.floor(age/6)%2?'physical':'magic';break;
   case 'E10': e.valveClosed=age>=9&&age%9<3;break;
   case 'C08': {
    const twin=nearby(e,120,a=>a.code==='C08')[0];if(twin)effect(e,e.variant?'magicArmor':'guard',.35,.1);break;
   }
  }
  const reveal=strength(e,'reveal')>0||state.towers.some(t=>distance(e,t)<=(t.code==='T09'?t.revealRange:t.attack?75:0));
  e.hidden=e.hiddenUntil>now&&!reveal;
  const damaged=(range)=>nearby(e,range,a=>a.hp<a.maxHp&&a.special===e.special).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);
  const out=strength(e,'outSuppress');
  if((e.code==='X03'||e.code==='X11')&&every(e,'heal',e.code==='X03'?3:4)){
   const allies=damaged(160).slice(0,e.code==='X03'?1:3);
   const multiplier=allies.length?supportOutput(e):0;
   for(const a of allies)heal(a,a.maxHp*(a.boss?.01:.03)*multiplier,out);
  }
  if(e.channel||e.rootUntil>now||e.echo?.until>now)return;
  if(e.code==='E06'&&every(e,'heal',8)&&damaged(160)[0])cast(e,'aid',1,damaged(160)[0]);
  if(e.code==='B01'&&!e.skillAt.charge&&state.towers.some(t=>t.attack&&distance(e,t)<=t.revealRange)){e.skillAt.charge=true;cast(e,'charge',1);}
  if(e.code==='B03'&&e.hp<e.maxHp*.7&&!(e.skillAt.heal>now)){e.skillAt.heal=now+12;cast(e,'heal',1.6);}
  if(e.code==='B05'&&every(e,'chain',12)&&towerNear(e,150,1)[0])cast(e,'chain',1,towerNear(e,150,1)[0]);
  if(e.code==='B09'&&every(e,'drum',10)){
   if(nearby(e,150,a=>!a.boss&&!a.special).length)cast(e,'drum',1.2);else e.skillAt.drum=now+1;
  }
  if(e.code==='B12'&&once(e,'reverse',.6))cast(e,'reverse',1.8);
  if(e.code==='C05'&&once(e,'heal',.5))cast(e,'guard-heal',1.5);
  if(e.code==='C07'&&e.hp<e.maxHp*.7&&!(e.skillAt.thunder>now)){
   const t=towerNear(e,160,1)[0];if(t){e.skillAt.thunder=now+7;cast(e,'thunder',1,t);}
  }
 }
 return {check,hit,dead,rooted,junction,defense,amountAfterArmor};
}
