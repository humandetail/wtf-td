export const LEGION_RULES = {
 startingGold:400,startingMythium:20,startingWorkers:2,startingIncome:10,
 workerCost:60,maxWorkers:12,maxOrders:12,baseMythium:12,mythiumPerWorker:2,
 leakGoldPerEnemy:2,maxLeakGold:20,leakedKillRewardFactor:.5,
 king:{hp:1200,damage:65,range:85,interval:1,upgradeCost:30,maxLevel:3,upgradeHp:300,upgradeDamage:25},
 waves:{initialCount:6,extraPerWave:.8,growth:1.11,lateGrowth:1.10,lateGrowthAfter:10,mercenaryHpGrowth:.035,mercenaryDamageGrowth:.025,
  basic:{code:'X01',assetCode:'X01',kind:'basic',hp:95,damage:13,speed:48,range:32,interval:1,reward:8},initialCooldown:.3},
 effects:{supportRadius:160,supportDamageMultiplier:1.25,healRadius:165,healAmount:28,wardRadius:120,wardDamageMultiplier:.6,slowSpeedMultiplier:.55,slowDuration:1.5,splashRadius:70,raiderBacklineRange:100},
 upgrades:{statGrowth:1.65,rangePerLevel:5,baseCostFactor:.65,levelCostFactor:.25,sellRefundFactor:.7},
};

// Legion uses the original atlas codes with independent, living-unit statistics.
export const LEGION_FIGHTERS = [
 {code:'T01',assetCode:'T01',name:'铁卫',price:80,hp:430,speed:62,range:34,damage:36,interval:.85,kind:'tank',color:'#edc66d',description:'高生命近战前排，承受第一轮攻击。'},
 {code:'T02',assetCode:'T02',name:'霜弩手',price:95,hp:175,speed:52,range:190,damage:28,interval:1,kind:'slow',color:'#b99cff',description:'远程减速，延缓敌军推进。'},
 {code:'T03',assetCode:'T03',name:'轰击兵',price:130,hp:220,speed:45,range:175,damage:58,interval:1.7,kind:'splash',color:'#ff9f70',description:'对目标周围70范围造成伤害。'},
 {code:'T04',assetCode:'T04',name:'追猎者',price:115,hp:210,speed:66,range:215,damage:55,interval:1,kind:'direct',color:'#fa787c',description:'远程高单体伤害。'},
 {code:'T09',assetCode:'T09',name:'战歌师',price:110,hp:230,speed:52,range:160,damage:18,interval:1,kind:'support',color:'#c6b7ff',description:'160范围内守军伤害增加25%，不叠加。'},
 {code:'T10',assetCode:'T10',name:'修复师',price:105,hp:210,speed:52,range:165,damage:12,interval:1.2,kind:'healer',color:'#96f1b8',description:'攻击时修复附近生命最低的守军28生命。'},
];
export const LEGION_MERCENARIES = [
 {code:'X04',assetCode:'X04',name:'突袭者',price:10,cost:10,income:1,hp:130,speed:90,range:30,damage:21,interval:.8,kind:'raider',reward:5,description:'优先追击后排远程守军。'},
 {code:'X08',assetCode:'X08',name:'铁甲兽',price:25,cost:25,income:2,hp:520,speed:39,range:34,damage:27,interval:1.3,kind:'armor',reward:10,description:'高生命前排，承受火力。'},
 {code:'X03',assetCode:'X03',name:'咒术师',price:40,cost:40,income:3,hp:260,speed:44,range:150,damage:24,interval:1.2,kind:'ward',reward:12,description:'附近120范围友军受到范围伤害减少40%。'},
];
export const LEGION_TECHNOLOGIES = {
 deployment:{name:'部署科技',levels:[{cost:0,duration:0,capacity:4,unlocks:['T01','T02','T04']},{cost:100,duration:12,capacity:8,unlocks:['T03','T09','T10']},{cost:220,duration:20,capacity:12,unlocks:[]},{cost:400,duration:30,capacity:20,unlocks:[]}]},
 reinforcement:{name:'强化科技',levels:[{cost:0,duration:0,maxTowerLevel:1},{cost:80,duration:10,maxTowerLevel:2},{cost:150,duration:15,maxTowerLevel:3},{cost:250,duration:20,maxTowerLevel:4},{cost:400,duration:25,maxTowerLevel:5}]},
};
export function legionStats(unit){
 const base=LEGION_FIGHTERS.find(item=>item.code===unit.code)||LEGION_MERCENARIES.find(item=>item.code===unit.code);
 if(!base)return unit;
 const level=unit.level||1,factor=Math.pow(LEGION_RULES.upgrades.statGrowth,level-1);
 return {...base,level,hp:base.hp*factor,maxHp:base.hp*factor,damage:base.damage*factor,range:base.range+LEGION_RULES.upgrades.rangePerLevel*(level-1),upgradeCost:Math.round(base.price*(LEGION_RULES.upgrades.baseCostFactor+LEGION_RULES.upgrades.levelCostFactor*level)),sellValue:Math.floor((unit.spent??base.price)*LEGION_RULES.upgrades.sellRefundFactor)};
}
