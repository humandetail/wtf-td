export const MAX_LEVEL = 5;
/** @type {[string,string,string,number,number,number,number,string,string,string][]} */
const towerRows = [
 ['T01','自动拦截炮塔','tech-interceptor-01',100,22,.55,205,'direct','#f5ca66','快速点射，稳定清理单体敌人。'],
 ['T02','微波干扰塔','tech-microwave-jammer',130,12,.9,195,'slow','#ca91ff','微波令目标减速，延长火力覆盖时间。'],
 ['T03','重型榴弹炮塔','tech-heavy-howitzer',190,65,1.8,235,'splash','#ff9970','榴弹轰击一片敌人，适合密集怪群。'],
 ['T04','激光跟踪塔','tech-laser-tracker',180,56,.9,265,'direct','#fa787c','远距高伤激光，优先锁定行进最远的敌人。'],
 ['T05','高压电弧塔','tech-high-voltage-arc',200,36,1.1,205,'chain','#82cfff','电弧跳跃至附近最多四名敌人。'],
 ['T06','高压水炮塔','tech-high-pressure-water',140,26,.85,205,'splash','#68dedf','小范围水压冲击，同时轻度减速。'],
 ['T07','捕获网发射器','tech-net-cannon',145,9,2,215,'root','#b4e37c','短暂定身目标；Boss 定身时间减半。'],
 ['T08','冷却喷射塔','tech-cooling-spray',175,14,1.2,185,'frost','#a5edff','范围冰雾强力减速，搭配群攻。'],
 ['T09','雷达哨站','tech-radar-outpost',160,0,1,235,'radar','#c6b7ff','提升范围内攻击塔射程与伤害，同类光环不叠加。'],
 ['T10','维修机械臂','tech-repair-arm',165,0,1,225,'overclock','#96f1b8','维护并超频附近武器，提升攻速；无需建筑生命。'],
 ['T11','无人机补给站','tech-drone-supply',150,0,8,0,'supply','#ffe494','每 8 秒补给金币；升级增加收益。'],
 ['T12','工程路障','tech-engineering-roadblock',105,0,1,180,'barrier','#edbb8a','路旁干扰场令附近敌人减速，不封堵环路。'],
];
export const TOWERS = towerRows.map(([code,name,assetId,price,damage,interval,range,kind,color,description]) => ({code,name,assetId,price:Number(price),damage:Number(damage),interval:Number(interval),range:Number(range),kind,color,description}));
/** @type {[string,string,string,number,number,number,string][]} */
const enemyRows = [
 ['X01','御剑纸符小妖','fantasy-paper-sword-goblin',58,86,8,'#f6e8bd'],
 ['X02','青铜石狮','fantasy-bronze-stone-lion',110,60,11,'#b8c6a2'],
 ['X03','葫芦法师','fantasy-gourd-mage',80,74,10,'#d6b1ed'],
 ['X04','墨影狐妖','fantasy-ink-shadow-fox',65,112,10,'#b9a1d8'],
 ['X05','铜铃精','fantasy-bronze-bell',130,67,12,'#e9bd69'],
 ['X06','竹卷书灵','fantasy-bamboo-scroll',105,80,12,'#c3db8c'],
 ['X07','赤焰灯笼怪','fantasy-red-lantern',100,94,13,'#ff947c'],
 ['X08','玉甲龟','fantasy-jade-turtle',220,47,16,'#a0d6b6'],
 ['X09','酒坛力士','fantasy-wine-jar',185,65,16,'#d7ab92'],
 ['X10','飞剑群','fantasy-flying-sword-pack',95,126,14,'#cbd9ed'],
 ['X11','莲台灵童','fantasy-lotus-spirit',170,80,17,'#ecb6df'],
 ['X12','山魈头目','fantasy-mountain-ape',285,60,20,'#d3b18e'],
];
export const ENEMIES = enemyRows.map(([code,name,assetId,hp,speed,reward,color]) => ({code,name,assetId,hp:Number(hp),speed:Number(speed),reward:Number(reward),color,description:'沿环路持续行进，存活敌人会与后续波次叠加。'}));
export function towerStats(tower) {
 const base=TOWERS.find(item=>item.code===tower.code);
 const level=tower.level || 1;
 return {...base,damage:base.damage*Math.pow(1.55,level-1),interval:base.kind==='supply'?8:base.interval/Math.pow(1.08,level-1),range:base.range+12*(level-1),upgradeCost:level>=MAX_LEVEL?0:Math.round(base.price*(.7+.45*level)),sellValue:Math.floor((tower.spent ?? base.price)*.7),income:12+8*(level-1),slow:Math.max(.3,.65-.06*(level-1)),duration:1.6+.25*(level-1),splash:75+8*(level-1),boost:.18+.06*(level-1)};
}

// Same effective values drive combat and the selected tower UI.
export function effectiveTowerStats(tower, towers) {
 const stats=towerStats(tower);
 if(stats.damage<=0)return stats;
 let radar=0,overclock=0;
 for(const support of towers){
  const aura=towerStats(support);
  if(Math.hypot(tower.x-support.x,tower.y-support.y)>aura.range)continue;
  if(aura.kind==='radar')radar=Math.max(radar,aura.boost);
  if(aura.kind==='overclock')overclock=Math.max(overclock,aura.boost);
 }
 return {...stats,damage:stats.damage*(1+radar),range:stats.range*(1+radar),interval:stats.interval/(1+overclock)};
}
