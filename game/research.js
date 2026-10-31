export const TECHNOLOGIES = {
 deployment: {name:'部署科技',levels:[
  {cost:0,duration:0,capacity:4,unlocks:['T01','T02','T06']},
  {cost:120,duration:12,capacity:8,unlocks:['T03','T07','T11']},
  {cost:300,duration:20,capacity:12,unlocks:['T04','T05','T12']},
  {cost:600,duration:30,capacity:20,unlocks:['T08','T09','T10']},
 ]},
 reinforcement: {name:'强化科技',levels:[
  {cost:0,duration:0,maxTowerLevel:1},
  {cost:100,duration:10,maxTowerLevel:2},
  {cost:200,duration:15,maxTowerLevel:3},
  {cost:350,duration:20,maxTowerLevel:4},
  {cost:550,duration:25,maxTowerLevel:5},
 ]},
};
export function deploymentStats(level){
 const levels=TECHNOLOGIES.deployment.levels;
 return {capacity:levels[level].capacity,unlockedCodes:levels.slice(0,level+1).flatMap(level=>level.unlocks)};
}
export function towerUnlockLevel(code){
 return TECHNOLOGIES.deployment.levels.findIndex(level=>level.unlocks.includes(code));
}
