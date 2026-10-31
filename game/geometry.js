export const WORLD = { width: 1280, height: 800 };
export const ROAD_WIDTH = 48;
export const ROAD_SHOULDER = 8;
export const ENTRY = { x: 76, y: 60 };
export const FOOTPRINT = { width: 90, height: 50, gap: 8 };
export const BUILD_BOUNDS = { x: 110, y: 100, width: 1060, height: 600 };
export const PLAZA = { x: 565, y: 345, width: 150, height: 110 };
export const ROAD_SEGMENTS = [
  [76,60,1204,60], [1204,60,1204,740], [1204,740,76,740], [76,740,76,60],
  [300,210,980,210], [980,210,980,590], [980,590,300,590], [300,590,300,210],
  [640,60,640,740], [76,400,1204,400],
].map(([x1,y1,x2,y2]) => ({ x1,y1,x2,y2 }));
export const ROAD_PATH = 'M76 60H1204V740H76Z M300 210H980V590H300Z M640 60V740 M76 400H1204';

// Patrol visits both rings, the central cross and every connecting spoke.
const route = [
  [76,60],[1204,60],[1204,740],[76,740],[76,60],[640,60],
  [640,210],[980,210],[980,590],[300,590],[300,210],[640,210],
  [640,400],[980,400],[1204,400],[1204,740],[640,740],
  [640,590],[640,400],[300,400],[76,400],[76,60],
];
export const LOOP = route.map(([x,y])=>({x,y}));
export const SEGMENTS = LOOP.slice(1).map((end,index)=>{
  const start=LOOP[index];
  return {start,end,length:Math.hypot(end.x-start.x,end.y-start.y)};
});
export const LOOP_LENGTH = SEGMENTS.reduce((sum,segment)=>sum+segment.length,0);
export function pointOnLoop(distance) {
  let remaining=((distance%LOOP_LENGTH)+LOOP_LENGTH)%LOOP_LENGTH;
  for(const segment of SEGMENTS){
    if(remaining<=segment.length){
      const t=remaining/segment.length;
      return {x:segment.start.x+(segment.end.x-segment.start.x)*t,y:segment.start.y+(segment.end.y-segment.start.y)*t,angle:Math.atan2(segment.end.y-segment.start.y,segment.end.x-segment.start.x)};
    }
    remaining-=segment.length;
  }
  return {...ENTRY,angle:0};
}

const halfX=FOOTPRINT.width/2,halfY=FOOTPRINT.height/2;
const margin=ROAD_SHOULDER;
export const BUILD_CENTER_BOUNDS = {
  x:BUILD_BOUNDS.x+halfX,y:BUILD_BOUNDS.y+halfY,
  width:BUILD_BOUNDS.width-FOOTPRINT.width,height:BUILD_BOUNDS.height-FOOTPRINT.height,
};
// Conservative full-footprint clearance includes the road's planted shoulders.
export const BUILD_EXCLUSIONS = ROAD_SEGMENTS.map(road=>({
  x:Math.min(road.x1,road.x2)-ROAD_WIDTH/2-halfX-margin,
  y:Math.min(road.y1,road.y2)-ROAD_WIDTH/2-halfY-margin,
  width:Math.abs(road.x2-road.x1)+ROAD_WIDTH+FOOTPRINT.width+margin*2,
  height:Math.abs(road.y2-road.y1)+ROAD_WIDTH+FOOTPRINT.height+margin*2,
  reason:'道路和连接通道不可建造',
}));
BUILD_EXCLUSIONS.push({x:PLAZA.x-halfX-margin,y:PLAZA.y-halfY-margin,width:PLAZA.width+FOOTPRINT.width+margin*2,height:PLAZA.height+FOOTPRINT.height+margin*2,reason:'中心枢纽不可建造'});
const contains=(rect,x,y)=>x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;
export function placementStatus(x,y,towers=[]) {
  if(!Number.isFinite(x)||!Number.isFinite(y)||!contains(BUILD_CENTER_BOUNDS,x,y))return {ok:false,message:'超出可建造区域'};
  const blocked=BUILD_EXCLUSIONS.find(rect=>contains(rect,x,y));
  if(blocked)return {ok:false,message:blocked.reason};
  if(towers.some(tower=>Math.abs(tower.x-x)<FOOTPRINT.width+FOOTPRINT.gap&&Math.abs(tower.y-y)<FOOTPRINT.height+FOOTPRINT.gap))return {ok:false,message:'与现有防御单位占地重叠'};
  return {ok:true,message:'可以建造'};
}
export const ZONES = [
  {name:'外环防线',x:1110,y:100,color:'#d5dfa6'},
  {name:'内环防线',x:900,y:250,color:'#d5dfa6'},
  {name:'中心枢纽',x:640,y:400,color:'#e4d3a1'},
];
export const WAYPOINTS = [
  {x:76,y:60,color:'#e06854'},{x:1204,y:60,color:'#6da3ed'},
  {x:1204,y:740,color:'#63d5c4'},{x:76,y:740,color:'#ae81d0'},
  {x:390,y:210,color:'#e6d85e'},{x:980,y:280,color:'#e9ab57'},
  {x:890,y:590,color:'#7ed87d'},{x:300,y:520,color:'#e88fc8'},
];
