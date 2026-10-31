// Gem values belong to this mode; the original twelve-tower catalog is unchanged.
export const GEM_RULES={startingGold:400,coreHealth:20,waveCount:20,initialDrafts:3,draftCost:60,rerollCosts:[20,40,80],reserveSlots:2,scrapThreshold:5,scrapGold:10,bossEvery:5,spawnInterval:.65,
 waveSize:wave=>8+wave,enemyHp:wave=>(55+wave*16)*Math.pow(1.065,wave-1),enemySpeed:wave=>78+wave*1.8,enemyReward:wave=>9+Math.floor(wave/3),waveReward:wave=>55+wave*5,bossHpMultiplier:9,bossSpeed:62,bossReward:65};
export const GEM_PROBABILITIES = [[100,0,0,0,0],[80,20,0,0,0],[60,30,10,0,0],[45,30,20,5,0],[30,30,25,12,3]];
export const GEM_TECHNOLOGIES = {
 deployment:{name:'部署科技',levels:[
  {cost:0,duration:0,capacity:4,unlocks:['G01','G02','G03','G04','G05','G06']},
  {cost:120,duration:12,capacity:8,unlocks:['F01','F02','F03']},
  {cost:300,duration:20,capacity:12,unlocks:['F04']},
  {cost:600,duration:30,capacity:20,unlocks:['F05']},
 ]},
 reinforcement:{name:'强化科技',levels:[{cost:0,duration:0,maxTowerLevel:1},{cost:100,duration:10,maxTowerLevel:2},{cost:200,duration:15,maxTowerLevel:3},{cost:350,duration:20,maxTowerLevel:4},{cost:550,duration:25,maxTowerLevel:5}]},
};
/** @type {[string,string,string,number,number,number,string,string,string][]} */
const rows = [
 ['G01','炎晶','splash',34,1.1,205,'#ff9170','T03','小范围爆发，冲击目标周围的敌人。'],
 ['G02','霜晶','slow',13,.9,210,'#9ee9ff','T08','命中减速，为其他宝石争取输出时间。'],
 ['G03','雷晶','chain',23,1,225,'#9bcfff','T05','最多连锁四个目标，跳跃伤害逐次衰减。'],
 ['G04','金晶','pierce',43,.85,230,'#ffdb75','T04','穿透攻击，首领受到额外伤害。'],
 ['G05','翠晶','aura',0,1,235,'#9fe3a0','T09','附近攻击宝石伤害与射程提高，同类光环不叠加。'],
 ['G06','镜晶','direct',26,.55,300,'#dfbaff','T01','大范围持续点射。'],
 ['F01','熔霜阵','frost',95,1,245,'#fdc6b5','T06','范围冲击，并持续减速整片敌人。'],
 ['F02','雷镜台','chain',69,.8,340,'#c6caff','T05','远射程六目标连锁，单体效率低于金晶。'],
 ['F03','镇岳印','boss',145,.9,255,'#ffe7a5','T04','对首领造成三倍伤害，失去翠晶光环。'],
 ['F04','天工矩阵','matrix',22,1.2,270,'#a6f5df','T10','相邻宝石射程提高，连锁距离与目标数提高。'],
 ['F05','太初晶枢','echo',0,1,285,'#ffcff7','T09','附近其他宝石每对同一敌人命中四次，追加单体回响。'],
];
export const GEM_TOWERS = rows.map(([code,name,kind,damage,interval,range,color,assetCode,description])=>({code,name,kind,damage:Number(damage),interval:Number(interval),range:Number(range),color,assetCode,description,price:60}));
export const GEM_RECIPES = [
 {code:'F01',name:'熔霜阵',inputs:[['G01',2],['G02',2]],level:3,deployment:1,reinforcement:2},
 {code:'F02',name:'雷镜台',inputs:[['G03',2],['G06',2]],level:3,deployment:1,reinforcement:2},
 {code:'F03',name:'镇岳印',inputs:[['G04',2],['G05',2]],level:3,deployment:1,reinforcement:2},
 {code:'F04',name:'天工矩阵',inputs:[['G03',2],['G05',2],['G06',2]],level:4,deployment:2,reinforcement:3},
 {code:'F05',name:'太初晶枢',inputs:[['F01',3],['F03',3]],level:5,deployment:3,reinforcement:4},
];
export function gemStats(tower,towers=[]) {
 const base=GEM_TOWERS.find(def=>def.code===tower.code);
 if(!base)return null;
 const level=tower.level??1,scale=base.code.startsWith('G')?Math.pow(1.95,level-1):1;
 let aura=0,matrix=0;
 for(const other of towers){
  if(other.id===tower.id)continue;
  const def=GEM_TOWERS.find(item=>item.code===other.code);
  if(!def||Math.hypot(tower.x-other.x,tower.y-other.y)>def.range+10*((other.level??1)-1))continue;
  if(def.kind==='aura')aura=Math.max(aura,.2+.07*((other.level??1)-1));
  if(def.kind==='matrix')matrix=.25;
 }
 return {...base,level,damage:base.damage*scale*(1+aura),interval:base.interval/Math.pow(1.06,level-1),range:(base.range+10*(level-1))*(1+aura+matrix),upgradeCost:0,sellValue:Math.floor((tower.spent??60)*.7),income:0,splash:80+8*level,slow:.45,duration:2.1,chainCount:(tower.code==='F02'?6:4)+(matrix?2:0),chainRange:135*(matrix?1.6:1),echoDamage:240,boost:aura};
}
