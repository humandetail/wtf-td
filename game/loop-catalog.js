import {TOWERS, ENEMIES} from './catalog.js';
import {CARD_ROWS, ENEMY_ROWS, WAVE_ROWS} from './loop-roster.js';
import {LOOP_EQUIPMENT, LOOP_CAMPAIGN_WAVES} from './loop-equipment.js';
export {LOOP_EQUIPMENT} from './loop-equipment.js';

const baseStats = {
 T01:[22,.55,205,'ranged','physical'], T02:[18,.9,195,'ranged','magic'],
 T03:[65,1.8,235,'ranged','physical'], T04:[50,.9,265,'ranged','magic'],
 T05:[46,1.1,178,'melee','magic'], T06:[26,.85,205,'ranged','physical'],
 T07:[9,2,215,'ranged','physical'], T08:[14,1.2,145,'melee','magic'],
 T09:[0,1,210,'support',null], T10:[0,1,200,'support',null],
 T11:[0,8,190,'support',null], T12:[20,.9,125,'melee','physical'],
 T13:[18,1.2,230,'ranged','magic'], T14:[16,.95,215,'ranged','physical'],
};
export const LOOP_TOWERS=Object.entries(CARD_ROWS).map(([code,[name,rarity,...data]])=>{
 const original=TOWERS.find(t=>t.code===code);
 const [assetCode,role,damageType,damage,interval,range,...skills]=original
  ? [original.assetCode??code,baseStats[code][3],baseStats[code][4],...baseStats[code].slice(0,3),...data] : data;
 return {...original,code,name,rarity,assetCode,role,damageType,damage,interval,range,skills,
  population:{common:1,rare:2,epic:3}[rarity],description:skills[0],
  kind:original?.kind??(role==='support'?'aura':'direct'),color:original?.color??(damageType==='physical'?'#ffe494':'#9bc9ff')};
});
export const LOOP_PRIORITIES={default:'默认职责',strongest:'最强目标',weakest:'最低生命',fastest:'最快目标',shield:'护盾优先',support:'支援优先',gold:'金币优先'};
export const FIXED_ROUTES={T01:'A',T02:'B',T03:'A',T04:'A',T05:'A',T06:'B',T07:'B',T08:'A',T09:'A',T10:'B',T11:'A',T12:'B',T13:'B',T14:'A'};
const roster=new Map(LOOP_TOWERS.map(t=>[t.code,t]));
export const loopTower=code=>roster.get(code);
export function gearBonus(tower,key){
 return Math.max(0,...(Array.isArray(tower.equipment)?tower.equipment:[]).map(item=>LOOP_EQUIPMENT[item.code]?.[key]??0));
}
const growth=[1,1.55,2.4,3.7,5.75], rates=[1,1.04,1.08,1.12,1.16];
export function loopStats(tower,state={towers:[],elapsed:0,endless:false,dust:[]}){
 const base=loopTower(tower.code),level=tower.level||1,r=level>=3?FIXED_ROUTES[tower.code]:null;
 const s={...base,level,route:r,advanced:false,master:false,damage:base.damage*growth[level-1],interval:base.interval/rates[level-1],
  range:(base.range+(base.role==='support'?0:6*(level-1)))*(1+gearBonus(tower,'range')),targetCount:1,
  sellValue:tower.refund??0,burnDps:12*growth[level-1],burnDuration:3,boost:.1+.02*level,aura:.1+.02*level,
  conditional:0,slow:0,shieldMultiplier:1,splash:0,supplyInterval:state.endless?20:18,
  supplyIncome:state.endless?(level>=3?2:1):[3,4,6,7,8][level-1],
  control:gearBonus(tower,'control'),bossBonus:gearBonus(tower,'boss'),gearPeriod:gearBonus(tower,'period'),supportSources:[]};
 switch(base.code){
  case 'T03': s.splash=r?85:65;s.targetCount=r?8:6;if(r)s.damage*=.9;break;
  case 'T05': s.targetCount=r?5:3;if(r)s.damage*=.8;break;
  case 'T06': s.splash=r?65:45;s.targetCount=r?6:4;s.slow=.15;if(r)s.damage*=.85;break;
  case 'T07': s.targetCount=r?3:1;if(r)s.damage*=.5;break;
  case 'T08': s.targetCount=3;break;
  case 'T12': s.targetCount=r?3:1;if(r)s.damage*=.7;break;
  case 'T02': s.shieldMultiplier=1.5;break;
  case 'T14': s.targetCount=level>=5?7:r?5:3;if(r)s.damage*=.8;break;
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
  if(!['T09','T10','T22'].includes(ally.code)&&!gearBonus(ally,'auraRate'))continue;
  const reach=loopTower(ally.code).range*(1+gearBonus(ally,'range'));
  if(Math.hypot(ally.x-tower.x,ally.y-tower.y)>reach)continue;
  const aura=.1+.02*ally.level,gearRate=gearBonus(ally,'auraRate');
  if(gearRate)rateSources.push({value:gearRate,id:ally.id});
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
 s.range*=1+range;s.interval/=(1+Math.max(rate,tower.rallyUntil>state.elapsed?.20:0))*(1+gearBonus(tower,'rate'));
 if(state.dust?.some(z=>z.until>state.elapsed&&Math.hypot(z.x-tower.x,z.y-tower.y)<=65))s.range*=.85;
 if(tower.hostileRateUntil>state.elapsed)s.interval/=1-tower.hostileRate;
 return s;
}
export function nearbyAttackers(state,source,range,limit){
 const distance=t=>Math.hypot(t.x-source.x,t.y-source.y);
 return state.towers.filter(t=>loopTower(t.code)?.role!=='support'&&distance(t)<=range)
  .sort((a,b)=>distance(a)-distance(b)||a.id-b.id).slice(0,limit);
}
export const LOOP_ENEMIES=Object.fromEntries(Object.entries(ENEMY_ROWS).map(([code,[name,assetCode,hp,speed,reward,description,counter,armor]])=>[
 code,{code,name,assetCode,hp:Number(hp),speed:Number(speed),reward:Number(reward),description,counter,armor:Number(armor??({X02:.35,X08:.35,E01:.25,C01:.4}[code]??0)),
  color:ENEMIES.find(item=>item.code===assetCode)?.color??'#f5d79b'}
]));
export const CHALLENGES=[
 ['C01',3,0,'blade'],['C02',8,1,'gear'],['C03',13,2,'coil'],['C04',18,3,'lens'],
 ['C05',25,0,'crystal'],['C06',32,1,'gear'],['C07',39,2,'coil'],['C08',46,3,'lens'],
].map(([code,wave,direction,item])=>({code:String(code),wave:Number(wave),direction:Number(direction),item:String(item),name:LOOP_ENEMIES[code].name,
 description:LOOP_ENEMIES[code].description,reward:LOOP_EQUIPMENT[item].name}));
export const GOLD_RUSHES=[
 {wave:5,code:'G01',direction:[0],reward:45},{wave:15,code:'G02',direction:[1,1],reward:60},
 {wave:25,code:'G03',direction:[0,1,2],reward:75},{wave:35,code:'G04',direction:[3],reward:90},
 {wave:45,code:'G01',direction:[0],reward:100},
];
const lateWaves=[11,12,13,14,15,16,17,18,19,20,13,17,19,14,16,18,14,15,19,20,11,18,16,17,19,12,14,17,18,20];
export const waveMultiplier=(wave,endless)=>endless
 ? 5.69*(1+.01*Math.max(0,wave-LOOP_CAMPAIGN_WAVES))
 : wave<=20 ? 1+.16*(wave-1) : 4.04+.055*(wave-20);
export function loopWave(wave,endless=wave>LOOP_CAMPAIGN_WAVES,countOverride=null){
 const template=endless?11+Math.max(0,wave-51)%10:wave<=20?wave:lateWaves[wave-21];
 const pool=WAVE_ROWS['w'+template];
 const bossOrder=[11,12,1,2,3,4,5,6,7,8,9,10];
 const bossIndex=endless?bossOrder[((wave/5-11)%12+12)%12]:wave/5;
 const bossCode=wave%5===0?'B'+String(bossIndex).padStart(2,'0'):null;
 const total=wave>20||endless?50-Number(!!bossCode):10+2*wave;
 const count=Math.max(0,countOverride??total);
 const weights=pool.map(([,n])=>Number(n)),weight=weights.reduce((a,b)=>a+b,0);
 const quotas=weights.map(n=>Math.floor(n*count/weight));
 const remainder=weights.map((n,i)=>({i,value:n*count%weight})).sort((a,b)=>b.value-a.value||a.i-b.i);
 for(const {i} of remainder.slice(0,count-quotas.reduce((a,b)=>a+b,0)))quotas[i]++;
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
 const maxHp=base.hp*scale*(options.enemyHealthScale??(entry.special?1:.60));
 const shield=({X05:80}[entry.code]??0)*scale+({B02:maxHp*.12,G04:350}[entry.code]??0);
 const elite=entry.code.startsWith('E'),reward=entry.special||entry.summoned?0:entry.endless?1:Math.round((entry.bounty??base.reward)*(options.rewardScale??1));
 return {...base,...entry,...position,id,hp:maxHp,maxHp,shield,maxShield:shield,elite,reward,scale,
  shieldHits:entry.shieldHits??({X06:3,E04:4,B10:8,C04:7}[entry.code]??0),
  support:['X03','X11','X16','X18','X21','E02','E05','E06','E08','C05','B09'].includes(entry.code),
  healer:['X03','X11','E06'].includes(entry.code),speed:base.speed*(options.enemySpeedScale??1),
  progress:position.progress??0,statuses:[],burns:[],rootUntil:0,immuneUntil:0,skillAt:{},thresholds:0};
}
export function loopWaveInterval(wave,endless=false){return endless||wave>40?26:wave>25?28:wave>10?32:36;}

export function assignWaveBounties(entries, wave) {
 const bounty = Math.min(180,45+3*(wave-1));
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
