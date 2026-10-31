import {placementStatus,FOOTPRINT,ROAD_SHOULDER} from './geometry.js';
export {WORLD,FOOTPRINT,BUILD_BOUNDS,BUILD_CENTER_BOUNDS} from './geometry.js';
export const ROAD_WIDTH=48;
export const GEM_ROUTE=[[60,150],[1120,150],[1120,380],[180,380],[180,650],[1220,650]];
export const GEM_ENTRY={x:60,y:150};
export const GEM_EXIT={x:1220,y:650};
export const GEM_LENGTH=GEM_ROUTE.slice(1).reduce((n,[x,y],i)=>n+Math.hypot(x-GEM_ROUTE[i][0],y-GEM_ROUTE[i][1]),0);
export const ROAD_PATH=GEM_ROUTE.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join('');
export const GEM_ROAD_PATH=ROAD_PATH;
export const ROAD_SEGMENTS=GEM_ROUTE.slice(1).map(([x2,y2],i)=>({x1:GEM_ROUTE[i][0],y1:GEM_ROUTE[i][1],x2,y2}));
export const BUILD_EXCLUSIONS=ROAD_SEGMENTS.map(({x1,y1,x2,y2})=>({x:Math.min(x1,x2)-ROAD_WIDTH/2-FOOTPRINT.width/2-ROAD_SHOULDER,y:Math.min(y1,y2)-ROAD_WIDTH/2-FOOTPRINT.height/2-ROAD_SHOULDER,width:Math.abs(x2-x1)+ROAD_WIDTH+FOOTPRINT.width+2*ROAD_SHOULDER,height:Math.abs(y2-y1)+ROAD_WIDTH+FOOTPRINT.height+2*ROAD_SHOULDER,reason:'宝石路线与出口不可建造'}));
export function gemPlacementStatus(x,y,towers=[]){return placementStatus(x,y,towers,BUILD_EXCLUSIONS);}
export function pointOnGemRoute(distance){
 let travel=Math.max(0,Math.min(GEM_LENGTH,distance));
 for(let i=1;i<GEM_ROUTE.length;i++){
  const [x,y]=GEM_ROUTE[i-1],[tx,ty]=GEM_ROUTE[i],length=Math.hypot(tx-x,ty-y);
  if(travel<=length||i===GEM_ROUTE.length-1)return {x:x+(tx-x)*travel/length,y:y+(ty-y)*travel/length,angle:Math.atan2(ty-y,tx-x),remaining:Math.max(0,GEM_LENGTH-distance),arrived:distance>=GEM_LENGTH};
  travel-=length;
 }
}
