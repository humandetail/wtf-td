import {TOWERS,ENEMIES} from './catalog.js';
export const LOOP_TECHNOLOGIES={
 deployment:{name:'部署科技',levels:[
 {capacity:4,unlocks:['T01','T12','T06','T13'],cost:0,duration:0},
 {capacity:6,unlocks:['T03','T07','T09','T11'],cost:120,duration:12},
 {capacity:8,unlocks:['T05','T02','T10'],cost:240,duration:20},
 {capacity:10,unlocks:['T04','T08','T14'],cost:420,duration:30},
 {capacity:12,unlocks:[],cost:650,duration:40},{capacity:16,unlocks:[],cost:950,duration:50}]},
 reinforcement:{name:'强化科技',levels:[{maxTowerLevel:1,cost:0,duration:0},{maxTowerLevel:2,cost:100,duration:10},{maxTowerLevel:3,cost:180,duration:15},{maxTowerLevel:4,cost:300,duration:20},{maxTowerLevel:5,cost:450,duration:25},{maxTowerLevel:5,cost:650,duration:35},{maxTowerLevel:5,cost:900,duration:45}]}
};
const rows={T12:['工程震荡塔',20,.9,125,'melee','physical','破甲15点，持续3秒'],T08:['冷却喷射塔',14,1.2,145,'melee','magic','扇形3目标，减速30%'],T05:['电弧线圈',36,1.1,155,'melee','magic','近邻连锁3目标'],T01:['自动拦截炮塔',22,.55,205,'ranged','physical','快速单体点射'],T03:['重型榴弹炮塔',65,1.8,235,'ranged','physical','半径65范围物理伤害'],T04:['激光跟踪塔',50,.9,265,'ranged','magic','远距离单体法术'],T06:['高压水炮塔',26,.85,205,'ranged','physical','小范围浸水和减速'],T02:['微波干扰塔',18,.9,195,'ranged','magic','对护盾伤害×1.5'],T07:['捕获网发射器',9,2,215,'ranged','physical','低伤定身，优先支援'],T13:['符焰法塔',18,1.2,230,'ranged','magic','每秒12法术灼烧，持续3秒'],T14:['三联追击塔',16,.95,215,'ranged','physical','3个独立目标'],T09:['雷达哨站',0,1,210,'support',null,'附近输出塔射程增益'],T10:['维修机械臂',0,1,200,'support',null,'附近输出塔攻速增益'],T11:['无人机补给站',0,8,190,'support',null,'定时补给，亦占1个容量']};
export const LOOP_TOWERS=TOWERS.map(base=>{const [name,damage,interval,range,role,damageType,description]=rows[base.code];return {...base,name,damage,interval,range,role,damageType,description};});
export const LOOP_ROUTES={
 T12:[['碎甲','单体破甲25点','连续4击追加重击'],['扫荡','扇形攻击3人','每5击范围破甲震波']],
 T08:[['深寒','连续3次喷射冻结','解冻保留寒缓'],['广域','120°扇形6人','每5击留下减速区']],
 T05:[['跳弧','连锁5人，首击0.8倍','每4击末端电爆'],['电容','双目标，主目标1.25倍','连续4击超载']],
 T01:[['狙猎','锁定同目标逐击叠伤','第6击追加穿甲弹'],['分流','3目标各0.55倍伤害','5目标独立射击']],
 T03:[['爆破','扩大爆区，伤害0.9倍','每4炮两枚集束弹'],['攻坚','小爆区强化对重甲','连续3炮破甲重击']],
 T04:[['聚焦','同目标连续照射叠伤','连续6击过载束'],['贯穿','直线穿透3人','穿透最多5人']],
 T06:[['水牢','减速30%','每4击束缚爆心'],['潮涌','更大浸水覆盖','每5击扩散水环']],
 T02:[['破障','对盾伤害×2.5','破盾后短时易伤'],['干扰','抑制治疗50%','每4击区域抑制治疗']],
 T07:[['猎首','单体定身1秒','捕获目标集火标记'],['群缚','多目标捕网','每4击范围撒网']],
 T13:[['焚心','强化主灼烧50%','持续灼烧4秒爆燃'],['传火','主灼烧死亡传火','主灼烧死亡爆炸']],
 T14:[['弹幕','5目标各0.8倍','7目标独立攻击'],['追猎','低血目标补射','击杀加快下次攻击']],
 T09:[['标定','每2秒标记最强目标','强化精英／Boss标记'],['组网','射程光环22%','周期超距脉冲']],
 T10:[['超频','攻速光环25%','周期短时超频'],['调校','强化对重甲／护盾伤害','周期发放攻击充能']],
 T11:[['经贸','每周期额外8金币','持续存续40秒分红'],['军需','附近升级费降低12%','附近升级耗时缩短15%']]
};
export const LOOP_PRIORITIES={default:'默认职责',strongest:'最强目标',weakest:'最低生命',fastest:'最快目标',shield:'护盾优先',support:'支援优先'};
export const loopUnlockLevel=code=>LOOP_TECHNOLOGIES.deployment.levels.findIndex(l=>l.unlocks.includes(code));
export function loopStats(tower,state={tech:{reinforcement:0},towers:[],elapsed:0,endless:false}){
 const base=LOOP_TOWERS.find(t=>t.code===tower.code),level=tower.level||1,r=tower.route,advanced=level>=3&&(state.tech.reinforcement>=5),master=level>=5&&state.tech.reinforcement>=6;
 const s={...base,level,route:r,advanced,master,damage:base.damage*[1,1.55,2.4,3.7,5.75][level-1],interval:base.interval/[1,1.04,1.08,1.12,1.16][level-1],range:base.range+(base.role==='support'?0:6*(level-1)),targetCount:1,upgradeCost:level>=5?0:Math.round(base.price*[0,.85,1.1,1.4,1.8][level]),sellValue:Math.floor((tower.spent??base.price)*.7),income:12+4*(level-1),burnDps:12*[1,1.55,2.4,3.7,5.75][level-1],aura:.1+.02*level,conditional:0,boost:0,supplyIncome:0,supplyInterval:8,slow:0,shieldMultiplier:1,splash:0};
 if(base.code==='T12'){s.targetCount=r==='B'?(advanced?4:3):1;if(r==='B')s.damage*=.7;}
 if(base.code==='T08'){s.targetCount=r==='B'?(advanced?8:6):3;s.slow=r==='A'?.3:.3;}
 if(base.code==='T05'){s.targetCount=r==='A'?(advanced?6:5):r==='B'?2:3;if(r==='A')s.damage*=.8;}
 if(base.code==='T01'&&r==='B'){s.targetCount=level>=5?(master?6:5):3;s.damage*=advanced?.6:.55;}
 if(base.code==='T03'){s.splash=r==='A'?(advanced?95:85):r==='B'?35:65;s.targetCount=r==='A'?8:r==='B'?3:6;if(r==='A')s.damage*=.9;}
 if(base.code==='T04'&&r==='B')s.targetCount=level>=5?(master?6:5):3;
 if(base.code==='T06'){s.splash=r==='B'?65:45;s.targetCount=r==='B'?6:4;s.slow=r==='A'?(advanced?.35:.3):.15;if(r==='B')s.damage*=.85;}
 if(base.code==='T02')s.shieldMultiplier=r==='A'?(advanced?3:2.5):1.5;
 if(base.code==='T07'){s.targetCount=r==='B'?(advanced?4:3):1;if(r==='B')s.damage*=.5;}
 if(base.code==='T13'&&r==='A')s.burnDps*=advanced?1.7:1.5;
 if(base.code==='T14'){s.targetCount=r==='A'?(level>=5?(master?8:7):5):3;if(r==='A')s.damage*=advanced?.85:.8;}
 if(base.code==='T09')s.boost=r==='B'?(tower.pulseUntil>state.elapsed?(master?.35:.3):(advanced?.25:.22)):s.aura;
 if(base.code==='T10')s.boost=r==='A'?(tower.pulseUntil>state.elapsed?(master?.45:.4):(advanced?.28:.25)):s.aura;
 const supplyIncome=state.endless?(r==='A'?(advanced?3:2):1):s.income+(r==='A'?(advanced?10:8):0);
 Object.assign(s,{supplyIncome,supplyInterval:state.endless?20:8});
 // Only output/control towers receive support: no self-buff or recursive aura ranges.
 if(base.role!=='support'){
  let range=0,rate=0,conditional=0;
  for(const a of state.towers){if(Math.hypot(a.x-tower.x,a.y-tower.y)>(a.code==='T09'?210:a.code==='T10'?200:0))continue;
   const ar=a.level>=3?a.route:null,hi=a.level>=3&&state.tech.reinforcement>=5,top=a.level>=5&&state.tech.reinforcement>=6,basic=.1+.02*a.level;
   if(a.code==='T09')range=Math.max(range,ar==='B'?(a.pulseUntil>state.elapsed?(top?.35:.3):(hi?.25:.22)):basic);
   if(a.code==='T10'){rate=Math.max(rate,ar==='A'?(a.pulseUntil>state.elapsed?(top?.45:.4):(hi?.28:.25)):basic);if(ar==='B')conditional=Math.max(conditional,hi?.16:.12);}
  }s.range*=1+range;s.interval/=1+rate;s.conditional=conditional;
 }
 return s;
}
export function upgradeQuote(tower,state){if(tower.level>=5)return {cost:0,duration:0};const stats=loopStats(tower,state);let discount=0,timeDiscount=0;
 if(stats.role!=='support')for(const t of state.towers)if(t.code==='T11'&&t.route==='B'&&Math.hypot(t.x-tower.x,t.y-tower.y)<=190){discount=Math.max(discount,state.tech.reinforcement>=5?.16:.12);if(t.level>=5)timeDiscount=Math.max(timeDiscount,state.tech.reinforcement>=6?.2:.15);}
 return {cost:Math.max(1,Math.round(stats.upgradeCost*(1-Math.min(.2,discount)))),duration:Math.round([0,5,8,12,16][tower.level]*(1-Math.min(.25,timeDiscount))*100)/100};}
const pools=[[1,1,4],[1,7,4],[1,2,2],[1,5,4],[1,2,4],[1,2,3],[4,4,10,1],[5,6,1],[2,8,3],[4,5,9],[1,3,10,5],[2,8,9],[4,10,10,7],[5,6,11],[2,3,9],[4,8,11,5],[2,8,3,12],[5,6,10,11],[4,8,9,12],[2,5,10,11]];
export function loopWave(w,endless=w>20,countOverride=null){
 const n=w-20,pool=pools[w<=20?w-1:10+(n-1)%10],boss=w%5===0,total=countOverride??(endless?50:10+2*w),normal=endless?total-Number(boss):total;
 const entries=Array.from({length:normal},(_,i)=>({code:`X${String(pool[i%pool.length]).padStart(2,'0')}`,boss:false,wave:w,endless}));if(boss)entries.push({code:'X12',boss:true,wave:w,endless});return entries;
}
export function loopEnemy(entry,id,position,options={}){
 const base=ENEMIES.find(e=>e.code===entry.code),scale=entry.endless?4.04*(1+.01*(entry.wave-20)):1+.16*(entry.wave-1),maxHp=base.hp*scale*(entry.boss?10:1)*(options.enemyHealthScale??1),armor=['X02','X08'].includes(base.code)?.35:base.code==='X12'?.25:0;
 const shield=entry.boss?(entry.wave>=10?maxHp*.2:0):(['X05','X06'].includes(base.code)?(base.code==='X05'?80:60)*scale:0);
 return {...base,...entry,...position,id,hp:maxHp,maxHp,armor,shield,maxShield:shield,healer:['X03','X11'].includes(base.code),support:['X03','X11'].includes(base.code),speed:base.speed*(entry.boss?.72:1)*(options.enemySpeedScale??1),reward:entry.endless?1:Math.max(1,Math.round(base.reward*(entry.boss?8:1)*(options.rewardScale??1))),progress:0,statuses:[],burns:[],rootUntil:0,immuneUntil:0,healIn:3,selfHealIn:10};
}
