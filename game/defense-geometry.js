import {ROAD_WIDTH, ROAD_SHOULDER, FOOTPRINT, placementStatus} from './geometry.js';

export const DEFENSE_CORE = {x:640,y:360};
export const DEFENSE_PLAZA = {x:565,y:305,width:150,height:110};

export const DEFENSE_LANES = [
 {name:'北',points:[[80,60],[480,60],[480,200],[640,200],[640,360]]},
 {name:'东',points:[[1220,130],[980,130],[980,360],[640,360]]},
 {name:'南',points:[[1200,700],[820,700],[820,530],[640,530],[640,360]]},
 {name:'西',points:[[60,600],[290,600],[290,360],[640,360]]},
].map(lane=>({...lane,length:lane.points.slice(1).reduce((total,point,index)=>total+Math.hypot(point[0]-lane.points[index][0],point[1]-lane.points[index][1]),0)}));
export const DEFENSE_ROAD_PATH = DEFENSE_LANES.map(lane=>lane.points.map(([x,y],index)=>`${index?'L':'M'}${x} ${y}`).join('')).join(' ');
export const DEFENSE_ROAD_SEGMENTS = DEFENSE_LANES.flatMap(lane=>lane.points.slice(1).map(([x2,y2],index)=>({x1:lane.points[index][0],y1:lane.points[index][1],x2,y2})));
const halfX=FOOTPRINT.width/2,halfY=FOOTPRINT.height/2;
export const DEFENSE_BUILD_EXCLUSIONS = DEFENSE_ROAD_SEGMENTS.map(road=>({
 x:Math.min(road.x1,road.x2)-ROAD_WIDTH/2-halfX-ROAD_SHOULDER,
 y:Math.min(road.y1,road.y2)-ROAD_WIDTH/2-halfY-ROAD_SHOULDER,
 width:Math.abs(road.x2-road.x1)+ROAD_WIDTH+FOOTPRINT.width+ROAD_SHOULDER*2,
 height:Math.abs(road.y2-road.y1)+ROAD_WIDTH+FOOTPRINT.height+ROAD_SHOULDER*2,
 reason:'进攻道路不可建造',
}));
DEFENSE_BUILD_EXCLUSIONS.push({x:DEFENSE_PLAZA.x-halfX-ROAD_SHOULDER,y:DEFENSE_PLAZA.y-halfY-ROAD_SHOULDER,width:DEFENSE_PLAZA.width+FOOTPRINT.width+ROAD_SHOULDER*2,height:DEFENSE_PLAZA.height+FOOTPRINT.height+ROAD_SHOULDER*2,reason:'核心区域不可建造'});
export function defensePlacementStatus(x,y,towers=[]) {
 return placementStatus(x,y,towers,DEFENSE_BUILD_EXCLUSIONS);
}
export function pointOnDefenseRoute(lane,distance) {
 const route=DEFENSE_LANES[lane];
 let travel=Math.max(0,Math.min(route.length,distance));
 for(let i=1;i<route.points.length;i++){
  const [x,y]=route.points[i-1],[tx,ty]=route.points[i],length=Math.hypot(tx-x,ty-y);
  if(travel<length||i===route.points.length-1)return {x:x+(tx-x)*travel/length,y:y+(ty-y)*travel/length,angle:Math.atan2(ty-y,tx-x),remaining:Math.max(0,route.length-Math.max(0,distance)),arrived:distance>=route.length};
  travel-=length;
 }
}
