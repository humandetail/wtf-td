import {CARD_ROWS, ULTIMATES, ENEMY_ROWS, WAVE_ROWS} from './loop-roster.js';
import {LOOP_EQUIPMENT, LOOP_CAMPAIGN_WAVES} from './loop-equipment.js';
import {talentRank} from './loop-solo-rules.js';
export {LOOP_EQUIPMENT} from './loop-equipment.js';

const baseStats = {
 T01:['T01','ranged','physical',22,.55,205,'direct','#f5ca66'], T02:['T02','ranged','magic',18,.9,195,'slow','#ca91ff'],
 T03:['T03','ranged','physical',82,1.8,245,'splash','#ff9970'], T04:['T04','ranged','magic',62,.9,265,'direct','#fa787c'],
 T05:['T05','melee','magic',46,1.1,178,'chain','#82cfff'], T06:['T06','ranged','physical',26,.85,205,'splash','#68dedf'],
 T07:['T07','ranged','physical',9,2,215,'root','#b4e37c'], T08:['T08','melee','magic',14,1.2,145,'frost','#a5edff'],
 T09:['T09','support',null,0,1,210,'radar','#c6b7ff'], T10:['T10','support',null,0,1,200,'overclock','#96f1b8'],
 T11:['T11','support',null,0,8,190,'supply','#ffe494'], T12:['T12','melee','physical',20,.9,125,'barrier','#edbb8a'],
 T13:['T05','ranged','magic',18,1.2,230,'magic','#d59bff'], T14:['T01','ranged','physical',27,.95,235,'multi','#f6d085'],
};
const strengthTowers = new Set(['T02','T03','T06','T11','T12','T15','T17','T21','T32','T33','T34']);
const agilityTowers = new Set(['T01','T07','T14','T16','T18','T19','T20','T22','T25','T27','T29','T35']);
const controlTowers = new Set(['N03','T06','T07','T08','T17','T18','T19','T21','T24','T26','T27']);
export const LOOP_TOWERS=Object.entries(CARD_ROWS).map(([code,[name,rarity,...data]])=>{
 const base=baseStats[code];
 const [assetCode,role,damageType,damage,interval,range,...skills]=base ? [...base.slice(0,6),...data] : data;
 const attribute=strengthTowers.has(code)?'strength':agilityTowers.has(code)?'agility':'intelligence';
 const duty=role==='support'?'support':controlTowers.has(code)?'control':'damage';
 if(ULTIMATES[code])skills.push(ULTIMATES[code].join(' · '));
 return {code,name,rarity,assetCode,role,attribute,duty,damageType,damage,interval,range,skills,
  population:rarity==='common'||rarity==='beginner'?5:20,description:skills[0],
  kind:base?.[6]??(role==='support'?'aura':'direct'),color:base?.[7]??(damageType==='physical'?'#ffe494':'#9bc9ff')};
});
export const LOOP_PRIORITIES={default:'默认职责',strongest:'最强目标',weakest:'最低生命',fastest:'最快目标',shield:'护盾优先',support:'支援优先',gold:'金币优先'};
export const FIXED_ROUTES={T01:'A',T02:'B',T03:'A',T04:'A',T05:'A',T06:'B',T07:'B',T08:'A',T09:'A',T10:'B',T11:'A',T12:'B',T13:'B',T14:'A'};
const roster=new Map(LOOP_TOWERS.map(t=>[t.code,t]));
export const loopTower=code=>roster.get(code);
export function affixApplies(tower,key){
 const base=loopTower(tower.code);
 switch(key){
  case 'physical':case 'sunder':case 'breach':return base.damageType==='physical'||tower.code==='T31';
  case 'magic':case 'prism':case 'embers':case 'cinders':case 'capacitor':return base.damageType==='magic'||tower.code==='T31';
  case 'control':case 'stall':case 'bounty':return base.duty==='control';
  case 'relay':case 'nexus':return base.role==='support';
  case 'rate':case 'boss':case 'shieldBreaker':case 'scatter':case 'flywheel':case 'scope':case 'disruptor':case 'refraction':
   return base.damage>0;
  default:return true;
 }
}
export function gearBonus(tower,key){
 let strongest=0;
 for(const item of tower.equipment??[])strongest=Math.max(strongest,LOOP_EQUIPMENT[item.code]?.[key]??0);
 return strongest&&affixApplies(tower,key)?strongest:0;
}
const growth=[1,1.55,2.4,3.7,5.75], rates=[1,1.04,1.08,1.12,1.16];
export function loopStats(tower,state={towers:[],elapsed:0,endless:false,dust:[]}){
 const base=loopTower(tower.code),level=tower.level||1,r=level>=3?FIXED_ROUTES[tower.code]:null;
 const rank=Math.min(level,5),extra=level-rank;
 const main=base.rarity==='rare'||base.rarity==='epic';
 const workerBonus=main&&!state.endless
  ? state.talent==='arsenal' ? .04*talentRank(state.wave) : state.talent==='growth' ? .004*(level-1) : 0 : 0;
 const damageScale=growth[rank-1]*(1+.012*extra)*(1+workerBonus);
 const s={...base,level,route:r,advanced:false,master:level>=30,damage:base.damage*damageScale,interval:base.interval/(rates[rank-1]+.004*extra),
  range:(base.range+(base.role==='support'?0:6*(rank-1)+.5*extra))*(1+gearBonus(tower,'range')),targetCount:1,
  sellValue:tower.refund??0,burnDps:12*damageScale,burnDuration:3,boost:.1+.02*rank+.002*extra,aura:.1+.02*rank+.002*extra,
  conditional:0,slow:0,shieldMultiplier:1,splash:0,supplyInterval:state.endless?20:18,
  supplyIncome:state.endless?(level>=3?2:1):[3,4,6,7,8][rank-1],
  control:gearBonus(tower,'control'),bossBonus:gearBonus(tower,'boss'),supportSources:[]};
 switch(base.code){
  case 'T03': s.splash=r?110:85;s.targetCount=r?10:7;break;
  case 'T05': s.targetCount=r?5:3;if(r)s.damage*=.8;break;
  case 'T06': s.splash=r?65:45;s.targetCount=r?6:4;s.slow=.15;if(r)s.damage*=.85;break;
  case 'T07': s.targetCount=r?3:1;if(r)s.damage*=.5;break;
  case 'T08': s.targetCount=3;break;
  case 'T12': s.targetCount=r?3:1;if(r)s.damage*=.7;break;
  case 'T02': s.shieldMultiplier=1.5;break;
  case 'T14': s.targetCount=level>=5?7:r?5:3;if(r)s.damage*=.9;break;
  case 'T25': s.targetCount=level>=5&&(tower.cycles||0)%4===0?6:r||level>=3?4:3;break;
  case 'T26': s.splash=50;s.targetCount=4;break;
  case 'T32': s.targetCount=level>=5&&(tower.cycles||0)%4===0?6:4;break;
  case 'T34': s.splash=58;s.targetCount=5;break;
 }
 if(base.role==='support')return s;
 s.damage*=1+gearBonus(tower,base.damageType);s.burnDps*=1+gearBonus(tower,'magic');
 let range=0,rate=0;
 const rangeSources=[],rateSources=[],conditionalSources=[];
 for(const ally of state.towers){
  if(!['T09','T10','T22'].includes(ally.code))continue;
  const reach=loopTower(ally.code).range*(1+gearBonus(ally,'range'));
  if(Math.hypot(ally.x-tower.x,ally.y-tower.y)>reach)continue;
  const aura=.1+.02*Math.min(5,ally.level)+.002*Math.max(0,ally.level-5);
  if(ally.code==='T09')rangeSources.push({value:aura,id:ally.id});
  if(ally.code==='T10'){rateSources.push({value:aura,id:ally.id});if(ally.level>=3)conditionalSources.push({value:.12,id:ally.id});}
  if(ally.code==='T22'){
   const targets=nearbyAttackers(state,ally,reach,ally.level>=3?2:1);
   const index=targets.findIndex(t=>t.id===tower.id);
   if(index>=0)rangeSources.push({value:index===0&&ally.level>=5?.20:.12,id:ally.id});
  }
 }
 for(const [key,pool] of Object.entries({range:rangeSources,rate:rateSources,conditional:conditionalSources})){
  const best=pool.sort((a,b)=>b.value-a.value||a.id-b.id)[0];
  if(!best)continue;
  s.supportSources.push({id:best.id,key});
  if(key==='range')range=best.value;if(key==='rate')rate=best.value;if(key==='conditional')s.conditional=best.value;
 }
 s.range*=1+range;s.interval/=(1+Math.max(rate,tower.relayUntil>state.elapsed?.18:0))*(1+gearBonus(tower,'rate'));
 if(state.dust?.some(z=>z.until>state.elapsed&&Math.hypot(z.x-tower.x,z.y-tower.y)<=65))s.range*=.85;
 if(tower.hostileRateUntil>state.elapsed)s.interval/=1-tower.hostileRate;
 return s;
}
export function nearbyAttackers(state,source,range,limit){
 const distance=t=>Math.hypot(t.x-source.x,t.y-source.y);
 return state.towers.filter(t=>loopTower(t.code)?.role!=='support'&&distance(t)<=range)
  .sort((a,b)=>distance(a)-distance(b)||a.id-b.id).slice(0,limit);
}
const enemyColors = {
 X01:'#f6e8bd',X02:'#b8c6a2',X03:'#d6b1ed',X04:'#b9a1d8',
 X05:'#e9bd69',X06:'#c3db8c',X07:'#ff947c',X08:'#a0d6b6',
 X09:'#d7ab92',X10:'#cbd9ed',X11:'#ecb6df',X12:'#d3b18e',
};
export const LOOP_ENEMIES=Object.fromEntries(Object.entries(ENEMY_ROWS).map(([code,[name,assetCode,hp,speed,reward,description,counter,armor]])=>[
 code,{code,name,assetCode,hp:Number(hp),speed:Number(speed),reward:Number(reward),description,counter,armor:Number(armor??({X02:.35,X08:.35,E01:.25,C01:.4}[code]??0)),
  color:enemyColors[assetCode]??'#f5d79b'}
]));
export const CHALLENGES=[
 ['C01',11,0,'blade'],['C02',11,1,'gear'],['C03',13,2,'coil'],['C04',18,3,'lens'],
 ['C05',25,0,'crystal'],['C06',32,1,'gear'],['C07',39,2,'coil'],['C08',46,3,'lens'],
].map(([code,wave,direction,item],index)=>({code:String(code),wave:Number(wave),direction:Number(direction),item:String(item),
 cost:20+index*10,seconds:28,name:LOOP_ENEMIES[code].name,
 description:LOOP_ENEMIES[code].description,reward:LOOP_EQUIPMENT[item].name}));
export const GOLD_RUSHES=[5,10,15,20,25,30,35,40,45,50,54].map((wave,index)=>({
 wave,code:['G01','G02','G03','G04'][index%4],
 direction:[index%4,index%4],reward:Math.min(260,110+wave*3),bountyReduction:wave===54?0:Math.min(30,12+wave),
}));
const bossEscorts={
 25:['X16','X10','E06'],30:['X15','X04','E08'],35:['X20','X13','E07'],
 40:['X02','X09','E09'],45:['X18','X07','E03'],50:['X05','X06','E04'],
};
const lateHealth=[.80,.88,1.02];
export const waveMultiplier=(wave,endless)=>endless
 ? 5.965*(1+.035*Math.max(0,wave-LOOP_CAMPAIGN_WAVES))
 : wave<=20 ? 1+.16*(wave-1) : 4.04+.055*(wave-20);
export const ENDLESS_POOLS={regular:['X26','X27','X28','X29'],boss:['B06','B04','B10','B11','B09','B07','B08']};
export function loopWave(wave,endless=wave>LOOP_CAMPAIGN_WAVES,countOverride=null,endlessCode=undefined,endlessRound=wave-LOOP_CAMPAIGN_WAVES){
 if(endless){
  const boss=endlessRound%10===0;
  const options=boss?ENDLESS_POOLS.boss:ENDLESS_POOLS.regular;
  const code=endlessCode??options[(Math.max(1,boss?endlessRound/10:endlessRound)-1)%options.length];
  return Array.from({length:boss?1:countOverride??7},()=>({code,wave,endless,boss,cohort:false}));
 }
 if(wave===LOOP_CAMPAIGN_WAVES)return [{code:'B11',wave,endless:false,boss:true,cohort:false}];
 const pool=[...WAVE_ROWS['w'+wave]];
 const bossCode=wave%5===0?'B'+String(wave/5).padStart(2,'0'):null;
 const total=wave<=20?10+2*wave:(wave<=30?50:wave<=40?40:34)-Number(!!bossCode);
 const count=Math.max(0,countOverride??total);
 const escorts=!endless&&bossEscorts[wave];
 const reserved=escorts&&countOverride===null?12:0;
 const baseCount=count-reserved;
 const weights=pool.map(([,n])=>Number(n)),weight=weights.reduce((a,b)=>a+b,0);
 const quotas=weights.map(n=>Math.floor(n*baseCount/weight));
 const remainder=weights.map((n,i)=>({i,value:n*baseCount%weight})).sort((a,b)=>b.value-a.value||a.i-b.i);
 for(const {i} of remainder.slice(0,baseCount-quotas.reduce((a,b)=>a+b,0)))quotas[i]++;
 if(reserved) for(const [index,code] of escorts.entries()){
  const quota=[6,4,2][index], existing=pool.findIndex(([kind])=>kind===code);
  if(existing<0){pool.push([code,quota]);quotas.push(quota);}
  else quotas[existing]+=quota;
 }
 const entries=[];
 for(let remaining=count;remaining>0;){
  for(const [i,[code]] of pool.entries()){
   const group=Math.min(quotas[i],code==='X10'?3:1);
   for(let j=0;j<group;j++)entries.push({code,wave,endless,boss:false,cohort:j>0});
   quotas[i]-=group;remaining-=group;
  }
 }
 if(bossCode)entries.push({code:bossCode,wave,endless,boss:true,cohort:false});
 return entries;
}
export function loopEnemy(entry,id,position,options={}){
 const base=LOOP_ENEMIES[entry.code],scale=entry.special==='gold'?1:waveMultiplier(entry.scaleWave??entry.wave,entry.endless);
 const growth=entry.special?1:entry.endless||entry.boss||entry.wave<=20?.60:lateHealth[Math.min(2,Math.floor((entry.wave-21)/10))];
 const maxHp=base.hp*scale*(options.enemyHealthScale??growth*(entry.special?1:(options.difficultyScale??1.2)/1.2));
 const shield=({X05:80}[entry.code]??0)*scale+({B02:maxHp*.12,G04:350}[entry.code]??0);
 const elite=entry.code.startsWith('E'),reward=entry.special||entry.summoned?0:entry.endless?1:Math.round((entry.bounty??base.reward)*(options.rewardScale??1));
 return {...base,...entry,...position,id,hp:maxHp,maxHp,shield,maxShield:shield,elite,reward,scale,
  evasion:entry.code==='X26'?.45:0,deflection:entry.code==='X28'?.25:0,
  controlScale:entry.code==='X29'?.5:1,magicResist:entry.code==='X27'?.55:0,
  shieldHits:entry.shieldHits??({X06:3,E04:4,B10:8,C04:7}[entry.code]??0),
  support:['X03','X11','X16','X18','X21','E02','E05','E06','E08','C05','B09'].includes(entry.code),
  healer:['X03','X11','E06'].includes(entry.code),speed:base.speed*(options.enemySpeedScale??1),
  progress:position.progress??0,statuses:[],burns:[],rootUntil:0,immuneUntil:0,skillAt:{},thresholds:0};
}
export function loopWaveInterval(wave,endless=false){return endless?26:wave>40?26:wave>25?28:wave>10?32:36;}

export function assignWaveBounties(entries, wave) {
 const reduction=GOLD_RUSHES.find(rush=>wave>rush.wave&&wave<=rush.wave+5)?.bountyReduction??0;
 const bounty = Math.min(180,45+3*(wave-1))-reduction;
 const enemies = entries.filter(entry=>!entry.boss);
 const total = enemies.reduce((sum,entry)=>sum+LOOP_ENEMIES[entry.code].reward,0);
 const shares = enemies.map((entry,index)=>{
  const exact=bounty*LOOP_ENEMIES[entry.code].reward/total;
  entry.bounty=Math.floor(exact);
  return {entry,index,remainder:exact-entry.bounty};
 });
 const left=bounty-enemies.reduce((sum,entry)=>sum+entry.bounty,0);
 for(const {entry} of shares.sort((a,b)=>b.remainder-a.remainder||a.index-b.index).slice(0,left))entry.bounty++;
 for(const entry of entries)if(entry.boss)entry.bounty=60+5*(wave/5-1);
 return entries;
}
