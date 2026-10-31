export const WORLD = { width: 1280, height: 800 };
export const ROAD_WIDTH = 48;
export const ROAD_SHOULDER = 8;
export const ENTRY = { x: 640, y: 400 };
export const FOOTPRINT = { width: 90, height: 50, gap: 8 };
export const BUILD_BOUNDS = { x: 110, y: 100, width: 1060, height: 600 };
export const PLAZA = { x: 565, y: 345, width: 150, height: 110 };
export const ROAD_SEGMENTS = [
  [76,60,1204,60], [1204,60,1204,740], [1204,740,76,740], [76,740,76,60],
  [300,210,980,210], [980,210,980,590], [980,590,300,590], [300,590,300,210],
  [640,60,640,740], [76,400,1204,400],
].map(([x1,y1,x2,y2]) => ({ x1,y1,x2,y2 }));
export const ROAD_PATH = 'M76 60H1204V740H76Z M300 210H980V590H300Z M640 60V740 M76 400H1204';

// Split the artwork's straight roads at every endpoint and intersection.
const onRoad=(road,x,y)=>x>=Math.min(road.x1,road.x2)&&x<=Math.max(road.x1,road.x2)&&y>=Math.min(road.y1,road.y2)&&y<=Math.max(road.y1,road.y2);
/** @type {{x:number,y:number,neighbors:number[]}[]} */
export const ROAD_NODES=[];
function addNode(x,y){
  if(!ROAD_NODES.some(node=>node.x===x&&node.y===y))ROAD_NODES.push({x,y,neighbors:[]});
}
for(const road of ROAD_SEGMENTS){addNode(road.x1,road.y1);addNode(road.x2,road.y2);}
for(const horizontal of ROAD_SEGMENTS.filter(road=>road.y1===road.y2)){
  for(const vertical of ROAD_SEGMENTS.filter(road=>road.x1===road.x2)){
    if(onRoad(horizontal,vertical.x1,horizontal.y1)&&onRoad(vertical,vertical.x1,horizontal.y1))addNode(vertical.x1,horizontal.y1);
  }
}
for(const road of ROAD_SEGMENTS){
  const nodes=ROAD_NODES.map((node,index)=>({...node,index})).filter(node=>onRoad(road,node.x,node.y)).sort((a,b)=>a.x-b.x||a.y-b.y);
  for(let i=1;i<nodes.length;i++){
    ROAD_NODES[nodes[i-1].index].neighbors.push(nodes[i].index);
    ROAD_NODES[nodes[i].index].neighbors.push(nodes[i-1].index);
  }
}
export function createRoadPosition(random=Math.random){
  const roadFrom=ROAD_NODES.findIndex(node=>node.x===ENTRY.x&&node.y===ENTRY.y);
  const directions=[[0,-1],[1,0],[0,1],[-1,0]];
  const [dx,dy]=directions[Math.floor(random()*4)];
  const roadTo=ROAD_NODES[roadFrom].neighbors.find(index=>{
    const node=ROAD_NODES[index];
    return Math.sign(node.x-ENTRY.x)===dx&&Math.sign(node.y-ENTRY.y)===dy;
  });
  return {...ENTRY,angle:Math.atan2(dy,dx),roadFrom,roadTo};
}
export function advanceOnRoad(entity,distance,random=Math.random){
  let remaining=distance;
  while(remaining>0){
    const target=ROAD_NODES[entity.roadTo],dx=target.x-entity.x,dy=target.y-entity.y;
    const length=Math.hypot(dx,dy);
    if(remaining<length){
      entity.x+=dx*remaining/length;entity.y+=dy*remaining/length;
      break;
    }
    entity.x=target.x;entity.y=target.y;remaining-=length;
    const exits=target.neighbors.filter(index=>index!==entity.roadFrom);
    const next=exits[exits.length===1?0:Math.floor(random()*exits.length)];
    entity.roadFrom=entity.roadTo;entity.roadTo=next;
    entity.angle=Math.atan2(ROAD_NODES[next].y-target.y,ROAD_NODES[next].x-target.x);
  }
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
export function placementStatus(x,y,towers=[],exclusions=BUILD_EXCLUSIONS) {
  if(!Number.isFinite(x)||!Number.isFinite(y)||!contains(BUILD_CENTER_BOUNDS,x,y))return {ok:false,message:'超出可建造区域'};
  const blocked=exclusions.find(rect=>contains(rect,x,y));
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
