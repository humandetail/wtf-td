const scroll = (name, grade, icon, cost, availableWave) => ({name, grade, icon, cost, availableWave, isScroll:true, description:'用于合成同品质装备'});
const white = (name, icon, cost, description, effects, role = '') => ({name, grade:'white', icon, cost, description, ...effects, role});
const recipe = (name, grade, icon, components, description, role, effects, active = undefined) => ({
 name, grade, icon, components, scroll:`scroll-${grade}`, description, role, ...effects, active,
});

export const LOOP_EQUIPMENT = {
 blade:white('锋刃片',0,65,'物理直伤 +8%',{physical:.08},'physical'),
 crystal:white('导能晶',1,65,'法术伤害 +8%',{magic:.08},'magic'),
 gear:white('调速齿轮',2,60,'攻击频率 +8%',{rate:.08},'attack'),
 coil:white('约束线圈',3,55,'主动控制时长 +10%',{control:.10},'control'),
 lens:white('增程阵列',4,60,'射程或支援半径 +8%',{range:.08}),
 repeater:recipe('连射机括','green',5,['blade','gear'],'物理直伤 +10%，攻频 +8%','physical',{physical:.10,rate:.08}),
 splitter:recipe('裂甲火控','blue',6,['repeater','blade'],'物理直伤 +18%，攻频 +10%，忽略 10 个百分点物抗','physical',{physical:.18,rate:.10,pierce:.10}),
 arbalest:recipe('贯阵机弩','orange',7,['splitter','repeater'],'物理直伤 +25%，攻频 +15%，忽略 15 个百分点物抗','physical',{physical:.25,rate:.15,pierce:.15}),
 focus:recipe('导能机芯','green',8,['crystal','lens'],'法伤 +10%，射程 +8%','magic',{magic:.10,range:.08}),
 embers:recipe('余烬阵列','blue',9,['focus','crystal'],'法伤 +16%，射程 +10%。每第三次普攻对命中点半径 55 内最多 4 怪追加 0.3 倍法伤','magic',{magic:.16,range:.10,embers:true}),
 furnace:recipe('裂焰炉','orange',10,['embers','focus'],'法伤 +20%，射程 +12%。主动对半径 90 内最多 6 怪造成 0.9 倍法伤','magic',{magic:.20,range:.12},{kind:'fire',cooldown:24,targeted:true}),
 breaker:recipe('攻坚机芯','green',11,['blade','crystal'],'首领直伤 +10%','attack',{boss:.10}),
 siege:recipe('破阵弹头','blue',12,['breaker','lens'],'首领直伤 +20%，射程 +8%','attack',{boss:.20,range:.08}),
 lance:recipe('破阵矛','orange',13,['siege','breaker'],'首领直伤 +25%，射程 +8%。主动打出 1.5 倍直伤，忽略 30 个百分点减伤','attack',{boss:.25,range:.08},{kind:'lance',cooldown:28,targeted:true}),
 tether:recipe('缚流线圈','green',14,['coil','lens'],'主动控制时长 +15%，射程 +8%','control',{control:.15,range:.08}),
 field:recipe('滞行力场','blue',15,['tether','coil'],'主动控制时长 +25%，射程 +10%','control',{control:.25,range:.10}),
 anchor:recipe('锚定场','orange',16,['field','tether'],'主动控制时长 +30%，射程 +10%。主动使半径 90 内最多 6 怪减速 35%，持续 3 秒','control',{control:.30,range:.10},{kind:'slow',cooldown:30,targeted:true}),
 beacon:recipe('协同模组','green',17,['gear','lens'],'支援半径 +10%','support',{range:.10}),
 relay:recipe('协同枢纽','blue',18,['beacon','crystal'],'支援半径 +15%，范围内攻击塔攻频 +8%','support',{range:.15,auraRate:.08}),
 nexus:recipe('联阵中枢','orange',19,['relay','beacon'],'支援半径 +18%，范围内攻击塔攻频 +10%。主动鼓舞最近至多 4 座攻击塔，攻频 +20% 持续 5 秒','support',{range:.18,auraRate:.10},{kind:'rally',cooldown:32,targeted:false}),
 'scroll-green':scroll('绿装卷轴','green',20,40,3),
 'scroll-blue':scroll('蓝装卷轴','blue',21,90,12),
 'scroll-orange':scroll('橙装卷轴','orange',22,180,25),
};

const credentials = {
 T18:['T14','T27','T35'], T20:['T03','T33'], T12:['T31','T32'], T13:['T04','T05','T34'],
 T15:['T23','T25'], T21:['T02','T24','T28','T30'], T06:['T08','T26'], T22:['T09','T10','T29','T36'],
};
export const LOOP_CREDENTIALS = Object.fromEntries(Object.entries(credentials).flatMap(([credential,towers])=>towers.map(code=>[code,credential])));
export const LOOP_XP = [0,15,55,160,360];
export const LOOP_PACKS = [
 {tier:'R',price:120,odds:{R:100,SR:0,SSR:0}},
 {tier:'SR',price:300,odds:{R:55,SR:45,SSR:0}},
 {tier:'SSR',price:750,odds:{R:20,SR:55,SSR:25}},
];
export const LOOP_RARITY={common:'R',rare:'SR',epic:'SSR'};
export const LOOP_CAMPAIGN_WAVES=50;
