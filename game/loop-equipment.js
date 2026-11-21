const white = (name, icon, cost, description, effects) => ({name, grade:'white', icon, cost, description, ...effects});
const craftFees = {green:40,blue:90,orange:180};
const recipe = (name, grade, icon, components, description, effects = {}, active = undefined) => ({
 name, grade, icon, components, craftFee:craftFees[grade], description, ...effects, active,
});

export const LOOP_EQUIPMENT = {
 blade:white('锋刃片',0,65,'物理伤害 +8%',{physical:.08}),
 crystal:white('导能晶',1,65,'法术伤害 +8%',{magic:.08}),
 gear:white('调速齿轮',2,60,'攻击频率 +8%',{rate:.08}),
 coil:white('约束线圈',3,55,'控制时长 +10%',{control:.10}),
 lens:white('增程阵列',4,60,'射程或支援半径 +8%',{range:.08}),
 repeater:recipe('连射机括','green',5,['blade','gear'],'物理伤害 +10%，攻击频率 +8%',{physical:.10,rate:.08}),
 splitter:recipe('裂甲火控','blue',6,['repeater','blade'],'连续物理命中同一敌人叠加破甲，每层 4 个百分点，最多 3 层，持续 3 秒。',{physical:.13,sunder:true}),
 arbalest:recipe('贯阵机弩','orange',7,['splitter','siege','blade'],'打破护盾后叠满破甲，对同一目标的下一次物理命中增伤 35%。',{physical:.17,shieldBreaker:true,breach:true}),
 focus:recipe('导能机芯','green',8,['crystal','lens'],'法术伤害 +10%，射程或支援半径 +8%',{magic:.10,range:.08}),
 embers:recipe('余烬阵列','blue',9,['focus','crystal'],'直接法术命中受控敌人时引发法术爆炸，最多每 3 秒一次。',{magic:.13,embers:true}),
 furnace:recipe('裂焰炉','orange',10,['embers','field','crystal','crystal'],'法术击杀受控目标时向附近至多 2 只怪传递余烬，最多每 3 秒一次。',{magic:.17,cinders:true}),
 breaker:recipe('攻坚机芯','green',11,['blade','crystal'],'对首领的直接伤害 +10%',{boss:.10}),
 siege:recipe('破盾弹头','blue',12,['breaker','gear'],'一次攻击最多额外打掉 1 层次数盾，对耐久盾的伤害提高 35%。',{shieldBreaker:true}),
 scatter:recipe('分矢机括','blue',13,['repeater','lens'],'每第 4 次普攻额外打击附近至多两个未命中的敌人，各造成 30% 普攻伤害。',{scatter:true}),
 tether:recipe('缚流线圈','green',14,['coil','lens'],'控制时长 +15%，射程或支援半径 +8%',{control:.15,range:.08}),
 field:recipe('滞行力场','blue',15,['tether','coil'],'同一敌人受这座塔减速三次后定身 0.6 秒，对单个敌人冷却 5 秒。',{control:.20,stall:true}),
 anchor:recipe('锚定场','orange',16,['field','siege'],'主动定住指定区域内至多 6 只普通怪或精英 1.5 秒，并尝试打断首领蓄力。',{control:.24},{kind:'anchor',cooldown:30,targeted:true}),
 beacon:recipe('协同模组','green',17,['gear','lens'],'射程或支援半径 +10%',{range:.10}),
 relay:recipe('协同枢纽','blue',18,['beacon','crystal'],'最近两座攻击塔打中受控敌人后，获得 18% 攻速，持续 2 秒，每塔冷却 6 秒。',{relay:true}),
 nexus:recipe('联阵中枢','orange',19,['relay','scatter'],'光环内两座友塔在 3 秒内先后命中同一敌人时合击，追加 30% 直伤，每目标冷却 5 秒。',{nexus:true}),
 prism:recipe('蓄能棱镜','blue',20,['focus','coil'],'每 2 秒未造成直接法伤蓄一层，最多三层，每层使下一次直接法术命中伤害 +15%。',{prism:true}),
 flywheel:recipe('追击飞轮','blue',21,['repeater','gear'],'击杀后下次普攻等待时间减半，每 3 秒最多触发一次。',{flywheel:true}),
 scope:recipe('远距瞄具','blue',22,['breaker','lens','lens'],'普攻命中射程最外三分之一内的敌人时，直接伤害 +20%。',{scope:true}),
 bounty:recipe('赏金信标','blue',23,['beacon','blade','coil'],'普通怪被此塔控制后由另一塔击杀时额外获得 1 金币，全队每常规波最多 12 金币。',{bounty:true}),
 reveal:recipe('照影透镜','blue',24,['focus','lens','gear'],'每 4 秒揭露射程内的敌人 2 秒。',{reveal:true}),
 disruptor:recipe('干扰探针','blue',25,['breaker','coil'],'连续命中同一支援怪三次，使它下一次对外治疗或套盾减半。',{disruptor:true}),
 refraction:recipe('双线折射器','orange',26,['scope','scatter','crystal'],'打中射程外侧三分之一内的敌人时，将 35% 伤害折射给内圈另一只敌人，每轮一次。',{refraction:true}),
 blockade:recipe('封锁矩阵','orange',27,['reveal','disruptor','coil','coil'],'主动封锁指定区域 3 秒，揭露敌人并封住它们对外治疗与套盾。',{}, {kind:'blockade',cooldown:30,targeted:true}),
 capacitor:recipe('回路电容','orange',28,['prism','relay','gear'],'满蓄重击后，附近两座友塔下一次命中附带 30% 法伤。',{prism:true,capacitor:true}),
 sluice:recipe('截流闸','orange',29,['field','flywheel','lens'],'在场超过 20 秒的敌人进入射程时，自动在其脚下展开 3 秒减速区，冷却 30 秒。',{sluice:true}),
 font:white('回流瓶',1,55,'每秒额外恢复 5 点法力。',{manaRegen:5}),
 striker:recipe('脉冲锋刃','blue',5,['repeater','blade'],'物理伤害 +12%，每第四次攻击造成 160% 普攻伤害。',{physical:.12,critical:1.6}),
 trueLens:recipe('穿雾罗盘','blue',24,['reveal','lens'],'普攻无视闪避，每 4 秒揭露射程内敌人 2 秒。',{trueStrike:true,reveal:true}),
 starforged:recipe('星弦投射器','orange',7,['striker','scope','lens'],'远程塔每第五次攻击向目标附近至多 4 只敌人追加神圣伤害。伤害随主塔伤害和射程提升。',{starburst:true}),
 condenser:recipe('静流导管','green',8,['font','crystal'],'法术伤害 +12%，每秒额外恢复 8 点法力。',{magic:.12,manaRegen:8}),
 arcFocus:recipe('震荡聚能器','blue',20,['condenser','crystal'],'每秒额外恢复 8 点法力。主动消耗 30 法力，对选定目标造成 220% 法术伤害。',{manaRegen:8},{kind:'arcFocus',cooldown:12,targeted:true,mana:30}),
 winterSeal:recipe('寒潮封印','orange',16,['arcFocus','field','crystal'],'主动消耗 45 法力，吟唱 2 秒后冻结区域并造成 160% 法术伤害。',{manaRegen:8},{kind:'winter',cooldown:24,targeted:true,mana:45}),
 echoSigil:recipe('裂音印','orange',27,['striker','disruptor','font'],'主动沉默一名敌人 4 秒，结束时追加期间生命损失的 20% 神圣伤害，消耗 30 法力。',{manaRegen:5},{kind:'echo',cooldown:25,targeted:true,mana:30}),
 surgeCell:recipe('引能蓄电器','blue',28,['font','beacon'],'每秒额外恢复 8 点法力，主动回复 60 点法力。',{manaRegen:8},{kind:'recharge',cooldown:22,targeted:false,mana:0}),
 fieldManual:white('战训笔记',20,140,'对一座主塔使用，增加 140 点经验。',{experience:140}),
 fieldPrimer:white('进阶手册',22,180,'对一座主塔使用，补足当前等级升级所需的经验。',{nextLevel:true}),
 untemperedEdge:white('未淬震刃',26,120,'放入能量圈淬炼 120 秒。',{tempered:'thunderEdge',seconds:120}),
 untemperedCore:white('未淬焰芯',10,120,'放入能量圈淬炼 120 秒。',{tempered:'solarCore',seconds:120}),
 untemperedCoil:white('未淬锁环',15,120,'放入能量圈淬炼 120 秒。',{tempered:'frostBand',seconds:120}),
 thunderEdge:{...white('震刃',26,120,'物理伤害 +18%，每第四次攻击造成 170% 普攻伤害。',{physical:.18,critical:1.7}),grade:'blue',forged:true},
 solarCore:{...white('焰芯',10,120,'法术伤害 +20%，每秒额外恢复 8 点法力。',{magic:.20,manaRegen:8}),grade:'blue',forged:true},
 frostBand:{...white('锁环',15,120,'控制时长 +23%，同一敌人受此塔减速三次后定身。',{control:.23,stall:true}),grade:'blue',forged:true},
};

export function equipmentCraftCost(code) {
 const item=LOOP_EQUIPMENT[code];
 return item.components ? item.components.reduce((sum,part)=>sum+equipmentCraftCost(part),item.craftFee) : item.cost;
}
export function equipmentPurchasePrice(code) {
 const cost=equipmentCraftCost(code);
 return LOOP_EQUIPMENT[code].components ? Math.round(cost * 1.25 / 5) * 5 : cost;
}

const credentials = {
 T18:['T14','T27','T35'], T20:['T03','T33'], T12:['T31','T32'], T13:['T04','T05','T34'],
 T15:['T23','T25'], T21:['T02','T24','T28','T30'], T06:['T08','T26'], T22:['T09','T10','T29','T36'],
};
export const LOOP_CREDENTIALS = Object.fromEntries(Object.entries(credentials).flatMap(([credential,towers])=>towers.map(code=>[code,credential])));
export const LOOP_DEPUTIES = new Set([...Object.keys(credentials),'T01','T07','T16','T17','T19']);
export const isMainTower = tower => !!tower&&Object.hasOwn(LOOP_CREDENTIALS,tower.code);
export const loopCredential = tower => tower?.credential??LOOP_CREDENTIALS[tower?.code];
export const LOOP_DEPUTY_COSTS = [30,60,90];
export const LOOP_DEPUTY_LEVELS = [1,2,3,5];
export const LOOP_XP = [0,15,55,160,360,390,425,460,495,535,575,615,655,695,735,775,815,855,900,950,
 1090,1230,1390,1560,1750,1940,2170,2450,2770,3180];
export const loopLevelCap = tower => isMainTower(tower) ? (tower.awakened ? 30 : 20) : 5;
export const LOOP_PACKS = [
 {tier:'N',price:100,odds:{N:90,R:10,SR:0,SSR:0}},
 {tier:'R',price:120,odds:{R:100,SR:0,SSR:0}},
 {tier:'SR',price:300,odds:{R:55,SR:45,SSR:0}},
 {tier:'SSR',price:750,odds:{R:15,SR:50,SSR:35}},
];
export const LOOP_RARITY={beginner:'N',common:'R',rare:'SR',epic:'SSR'};
export const LOOP_CAMPAIGN_WAVES=55;
export const LOOP_POPULATION = 100;
export const LOOP_SSR_GUARANTEE = 3;
export const LOOP_EXCHANGE_WAVE = 20;
