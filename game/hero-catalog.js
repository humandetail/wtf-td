export const HERO_CONFIG={
 hp:300,mana:100,speed:190,manaRegen:3,attackDamage:42,attackInterval:.65,attackRange:115,respawn:10,xpRange:400,maxLevel:8,xpThresholds:[0,60,150,280,450,670,940,1260],waveCount:15,waveInterval:15,initialGold:400,
 goddessHp:100,initialDelay:15,growth:{hp:28,heal:55,attackDamage:8},experience:{boss:100,camp:90,normal:18},
 waves:{baseSize:5,bossEvery:5,spawnInterval:.75,rewardBase:50,rewardPerWave:8},
 enemies:{hp:65,bossHp:900,healthGrowth:.14,speed:{boss:33,hunter:58,rush:46},reward:{boss:120,normal:14},meleeRange:38,leash:{hunter:230,normal:140},aggro:{hunter:210,normal:85},disengagePadding:70,meleeDamage:{boss:38,hunter:18,normal:10},meleeInterval:{boss:1.3,normal:1},coreDamage:{boss:7,normal:2},coreInterval:{boss:2,normal:3}},
 caster:{range:390,damage:4,cooldown:5,windup:2},
 boss:{heroTriggerRange:240,coreTriggerRange:210,radius:100,windup:1.4,cooldown:7,heroDamage:105,coreDamage:9},
 camp:{hp:360,speed:70,reward:35,activationRange:160,leash:190,aggro:170,meleeDamage:23,goldReward:100,manaReward:40},
 equipmentUpgrades:[{heroLevel:3,cost:80},{heroLevel:6,cost:140}],
 towerEffects:{chainTargets:4,chainRange:135,chainFalloff:.8,frostMinimum:.25,frostBonus:.15,rootDuration:.8,rootPerLevel:.1,bossRootFactor:.5},
};
export const HERO_SKILLS={Q:{name:'破阵斩',level:1,mana:25,cooldown:8,range:280,width:52,damage:120,damagePerLevel:18,interruptCooldown:4},E:{name:'瞬步',level:2,mana:15,cooldown:10,range:180,invulnerability:.5},R:{name:'共鸣护罩',level:6,mana:50,cooldown:30,range:300,radius:170,duration:6,shield:80}};
export const HERO_EQUIPMENT=[{code:'horn',name:'猎杀号角',description:'普攻伤害 +20%／30%／40%',effects:[.2,.3,.4]},{code:'core',name:'充能核心',description:'Q冷却 -20%／30%／40%',effects:[.2,.3,.4]},{code:'jade',name:'护心玉',description:'生命上限 +100／150／200',effects:[100,150,200]}];
