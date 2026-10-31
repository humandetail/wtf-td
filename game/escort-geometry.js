import {ROAD_WIDTH, ROAD_SHOULDER, FOOTPRINT, placementStatus} from './geometry.js';

export const ESCORT_POINTS = [[80,660],[300,660],[300,180],[640,180],[640,600],[980,600],[980,140],[1200,140]];
const segments=ESCORT_POINTS.slice(1).map(([x2,y2],index)=>{
 const [x1,y1]=ESCORT_POINTS[index];
 return {x1,y1,x2,y2,length:Math.hypot(x2-x1,y2-y1)};
});
export const ESCORT_LENGTH = segments.reduce((total,segment)=>total+segment.length,0);
export const ESCORT_CHECKPOINTS = [800,1600];
export const ESCORT_ROAD_PATH = ESCORT_POINTS.map(([x,y],index)=>`${index?'L':'M'}${x} ${y}`).join('');
// Expand the entire road by a tower's half-footprint and the planted shoulder.
export const ESCORT_BUILD_EXCLUSIONS = segments.map(({x1,y1,x2,y2})=>({
 x:Math.min(x1,x2)-ROAD_WIDTH/2-FOOTPRINT.width/2-ROAD_SHOULDER,
 y:Math.min(y1,y2)-ROAD_WIDTH/2-FOOTPRINT.height/2-ROAD_SHOULDER,
 width:Math.abs(x2-x1)+ROAD_WIDTH+FOOTPRINT.width+ROAD_SHOULDER*2,
 height:Math.abs(y2-y1)+ROAD_WIDTH+FOOTPRINT.height+ROAD_SHOULDER*2,
 reason:'护送道路不可建造',
}));
export function escortPlacementStatus(x,y,towers=[]) {
 return placementStatus(x,y,towers,ESCORT_BUILD_EXCLUSIONS);
}
export function pointOnEscortRoute(distance) {
 let travel=Math.max(0,Math.min(ESCORT_LENGTH,distance));
 for(let i=0;i<segments.length;i++){
  const {x1,y1,x2,y2,length}=segments[i];
  if(travel<length||i===segments.length-1)return {
   x:x1+(x2-x1)*travel/length,y:y1+(y2-y1)*travel/length,
   angle:Math.atan2(y2-y1,x2-x1),
   remaining:Math.max(0,ESCORT_LENGTH-Math.max(0,distance)),arrived:distance>=ESCORT_LENGTH,
  };
  travel-=length;
 }
}
