import { BUILD_BOUNDS, FOOTPRINT } from './geometry.js';

export const MAZE_BOUNDS = { x:40, y:100, width:1200, height:600 };
export const MAZE_ENTRY = { x:50, y:390 };
export const MAZE_EXIT = { x:1230, y:390 };
export const MAZE_CELL = 20;
export const WALL_FOOTPRINT = { width:60, height:60, gap:8 };
export const WALL_COST = 20;
export const WALL_REFUND = 15;
export const WALL_LIMIT = 24;
const COLS=60, ROWS=30, RADIUS=10;
let version=0;
const footprint=code=>code==='WALL'?WALL_FOOTPRINT:FOOTPRINT;
const point=index=>({x:50+(index%COLS)*MAZE_CELL,y:110+Math.floor(index/COLS)*MAZE_CELL});
const inside=(p,r)=>p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;
const finite=p=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const inField=p=>finite(p)&&p.x>=50&&p.x<=1230&&p.y>=110&&p.y<=690;
function rectangle(entity,padding=0){
  const size=footprint(entity.code);
  return {left:entity.x-size.width/2-padding,right:entity.x+size.width/2+padding,top:entity.y-size.height/2-padding,bottom:entity.y+size.height/2+padding};
}
// All navigation segments are axis aligned, including attachment from free positions.
function clear(nav,a,b){
  if(!inField(a)||!inField(b)||a.x!==b.x&&a.y!==b.y)return false;
  return !nav.obstacles.some(r=>Math.max(a.x,b.x)>=r.left&&Math.min(a.x,b.x)<=r.right&&Math.max(a.y,b.y)>=r.top&&Math.min(a.y,b.y)<=r.bottom);
}

/** A private layout snapshot: version, cols/rows, obstacles (enemy-expanded
 * rectangles), blocked Uint8Array, distance Int32Array (-1 means unreachable),
 * next Int32Array (next cell toward exit), exitIndex. One reverse BFS per layout;
 * ties visit right, up, down, left deterministically. Never mutate this snapshot.
 */
export function createMazeNavigation(towers=[],walls=[]){
  const obstacles=[...towers,...walls.map(w=>({...w,code:'WALL'}))].map(e=>rectangle(e,RADIUS));
  const nav={version:++version,cols:COLS,rows:ROWS,obstacles,blocked:new Uint8Array(COLS*ROWS),distance:new Int32Array(COLS*ROWS).fill(-1),next:new Int32Array(COLS*ROWS).fill(-1),exitIndex:14*COLS+59};
  for(let i=0;i<nav.blocked.length;i++)nav.blocked[i]=Number(obstacles.some(r=>inside(point(i),r)));
  const queue=[];
  if(!nav.blocked[nav.exitIndex]){queue.push(nav.exitIndex);nav.distance[nav.exitIndex]=0;}
  for(let head=0;head<queue.length;head++){
    const i=queue[head],col=i%COLS,row=Math.floor(i/COLS);
    for(const j of [col<59?i+1:-1,row>0?i-COLS:-1,row<29?i+COLS:-1,col>0?i-1:-1]){
      if(j<0||nav.blocked[j]||nav.distance[j]>=0||!clear(nav,point(i),point(j)))continue;
      nav.distance[j]=nav.distance[i]+1;nav.next[j]=i;queue.push(j);
    }
  }
  return nav;
}

// Find a clear orthogonal connection to the shared flow field, once on layout
// change. Testing segments as well as cells prevents corner/diagonal clipping.
function attachment(nav,start){
  if(!inField(start)||nav.obstacles.some(r=>inside(start,r)))return null;
  /** @type {Array<{x:number,y:number,index?:number}> | null} */
  let best=null;
  let bestScore=Infinity;
  for(let i=0;i<nav.distance.length;i++){
    if(nav.distance[i]<0)continue;
    const end=point(i),score=Math.abs(end.x-start.x)+Math.abs(end.y-start.y)+nav.distance[i]*MAZE_CELL;
    if(score>=bestScore)continue;
    for(const corner of [{x:end.x,y:start.y},{x:start.x,y:end.y}]){
      if(!clear(nav,start,corner)||!clear(nav,corner,end))continue;
      best=[corner,end].filter((p,k)=>k===0?(p.x!==start.x||p.y!==start.y):(p.x!==corner.x||p.y!==corner.y));
      if(best.length===0)best=[end];
      best[best.length-1]={...end,index:i};bestScore=score;break;
    }
  }
  return best;
}

/** Physical orthogonal route; null if this position cannot reach the exit. */
export function mazeRoute(nav,x=MAZE_ENTRY.x,y=MAZE_ENTRY.y){
  const start={x,y},connection=attachment(nav,start);
  if(!connection)return null;
  const route=[start,...connection.filter(p=>p.x!==x||p.y!==y).map(p=>({x:p.x,y:p.y}))];
  let index=connection[connection.length-1].index;
  while(nav.next[index]>=0){index=nav.next[index];route.push(point(index));}
  return route;
}
export function mazeRouteLength(route){
  return route?.reduce((length,p,i)=>i?length+Math.hypot(p.x-route[i-1].x,p.y-route[i-1].y):0,0)??Infinity;
}

/** Preview/build share this validator; coordinates are never snapped. */
export function mazePlacementStatus(x,y,code,towers=[],walls=[],enemies=[]){
  const entity={x,y,code},r=rectangle(entity),size=footprint(code);
  const fail=message=>({ok:false,message});
  if(!finite(entity)||r.left<BUILD_BOUNDS.x||r.right>BUILD_BOUNDS.x+BUILD_BOUNDS.width||r.top<BUILD_BOUNDS.y||r.bottom>BUILD_BOUNDS.y+BUILD_BOUNDS.height)return fail('超出可建造区域');
  if(code==='WALL'&&walls.length>=WALL_LIMIT)return fail('路障数量已达上限');
  if([...towers,...walls.map(w=>({...w,code:'WALL'}))].some(other=>{
    const otherSize=footprint(other.code);
    return Math.abs(x-other.x)<(size.width+otherSize.width)/2+8&&Math.abs(y-other.y)<(size.height+otherSize.height)/2+8;
  }))return fail('与现有防御单位占地重叠');
  const expanded=rectangle(entity,RADIUS);
  if(inside(MAZE_ENTRY,expanded)||inside(MAZE_EXIT,expanded))return fail('不能覆盖入口或出口');
  if(enemies.some(enemy=>inside(enemy,expanded)||enemy.navTarget&&inside(enemy.navTarget,expanded)))return fail('不能覆盖敌人或其下一行走目标');
  const nav=createMazeNavigation(code==='WALL'?towers:[...towers,entity],code==='WALL'?[...walls,entity]:walls);
  const route=mazeRoute(nav);
  if(!route)return fail('不能封死入口到出口的最后通路');
  if(enemies.some(enemy=>!enemy.arrived&&!attachment(nav,enemy)))return fail('不能封死场上敌人的通路');
  return {ok:true,message:'可以建造',route,routeLength:mazeRouteLength(route)};
}

/** Mutates only position/heading/remaining/arrived and navigation bookkeeping.
 * progress belongs to the engine. navTarget={x,y,index?,version}; _mazeConnection
 * contains at most two free-position attachment points. A new nav version
 * invalidates old targets without changing the enemy's physical position.
 */
export function advanceInMaze(enemy,distance,nav){
  if(!finite(enemy)||!Number.isFinite(distance)||distance<0)return;
  if(enemy.mazeNavVersion!==nav.version){
    enemy.mazeNavVersion=nav.version;
    enemy._mazeConnection=attachment(nav,enemy)||[];
    enemy.navTarget=null;
  }
  let budget=distance;
  while(true){
    if(!enemy.navTarget){
      const next=enemy._mazeConnection.shift();
      if(!next)break;
      enemy.navTarget={...next,version:nav.version};
    }
    const target=enemy.navTarget,dx=target.x-enemy.x,dy=target.y-enemy.y,length=Math.hypot(dx,dy);
    if(length>0){
      enemy.angle=Math.atan2(dy,dx);
      const step=Math.min(budget,length);
      enemy.x+=dx/length*step;enemy.y+=dy/length*step;budget-=step;
      if(step<length)break;
    }
    if(target.index!==undefined){
      const next=nav.next[target.index];
      if(next<0){enemy.navTarget=null;enemy.arrived=target.index===nav.exitIndex;break;}
      enemy.navTarget={...point(next),index:next,version:nav.version};
    }else enemy.navTarget=null;
    if(budget<=0)break;
  }
  if(enemy.arrived){enemy.remaining=0;return;}
  let target=enemy.navTarget;
  enemy.remaining=target?Math.hypot(target.x-enemy.x,target.y-enemy.y):Infinity;
  if(!target)return;
  for(const next of enemy._mazeConnection){
    enemy.remaining+=Math.hypot(next.x-target.x,next.y-target.y);target=next;
  }
  enemy.remaining+=nav.distance[target.index]*MAZE_CELL;
}
