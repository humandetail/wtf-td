export const towerUpgradeDuration = level => [0,5,8,12,16][level] || 0;
export function beginTowerUpgrade(state,tower,cost){
 state.gold-=cost;tower.spent+=cost;
 const duration=towerUpgradeDuration(tower.level);
 tower.upgrading={duration,remaining:duration};
 return {ok:true,message:`升级开始，${duration}秒后完成`};
}
export function advanceTowerUpgrades(towers,dt,complete){
 for(const tower of towers){
  if(!tower.upgrading)continue;
  tower.upgrading.remaining=Math.max(0,tower.upgrading.remaining-dt);
  if(tower.upgrading.remaining<=1e-9){delete tower.upgrading;tower.level++;complete(tower);}
 }
}
