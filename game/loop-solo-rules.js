export const DIFFICULTIES = [
 {id:'easy',name:'简单',health:.8,modes:[]},
 {id:'normal',name:'普通',health:1.2,modes:[]},
 {id:'hard',name:'困难',health:1.62,modes:['endless']},
 {id:'nightmare',name:'噩梦',health:2.5,modes:['endless','abyss']},
 {id:'hell',name:'地狱',health:2.6,modes:['abyss']},
];

export const WORKER_TALENTS = [
 {id:'arsenal',name:'工坊号令',description:'提升主塔伤害。每十波提高一阶。'},
 {id:'commerce',name:'征收',description:'击杀主线敌人获得额外金币。每十波提高一阶。'},
 {id:'growth',name:'研修',description:'提高主塔每级的伤害成长。'},
 {id:'fortune',name:'双签',description:'购买塔卡时有概率附送同档抽取的额外卡，概率随波次上升。'},
 {id:'reroll',name:'改印',description:'按冷却置换一张 N、R 或 SR 卡，品质不变。'},
 {id:'merge',name:'并契',description:'按冷却将四张同品质卡合成一张更高品质的卡，最高为 SR。'},
 {id:'cache',name:'寻材',description:'按冷却领取装备奖励。'},
 {id:'relocate',name:'调防',description:'按冷却将一座塔移到新的合法位置。'},
];

export const BASIC_TOWERS = {N01:10,N02:10,N03:12};
export const INITIAL_GOLD = 200;
export const INITIAL_CAPACITY = 30;
export const CAPACITY_BY_WAVE = {11:50,21:70,31:90,41:100};
export const talentRank = wave => Math.min(5,1+Math.floor(Math.max(0,wave-1)/10));

export const ABYSS_STAGES = [
 {name:'流金试炼',code:'G01',seconds:60,isGold:true,reward:null},
 {name:'守阵试炼',code:'B03',seconds:150,isGold:false,reward:'siege'},
 {name:'断咒试炼',code:'B12',seconds:150,isGold:false,reward:'prism'},
 {name:'深渊蜈王',code:'B07',seconds:150,isGold:false,reward:'anchor'},
];
export const ABYSS_RADIUS = 105;
export const MYSTERY_STOCK_WAVES = new Set([21,26,31,36,41,46,51,52,53,54]);
export const MYSTERY_ITEMS = ['scope','reveal','capacitor','refraction','sluice','starforged','winterSeal','echoSigil'];
