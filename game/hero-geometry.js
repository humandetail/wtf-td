import {FOOTPRINT,placementStatus} from './geometry.js';
export const HERO_GODDESS={x:640,y:650,radius:42};
export const HERO_CAMPS=[{id:'west',x:220,y:300},{id:'east',x:1060,y:300}];
export const HERO_TERRAIN=[{x:300,y:270,width:100,height:100},{x:880,y:270,width:100,height:100},{x:330,y:650,width:95,height:85},{x:855,y:650,width:95,height:85}];
export const HERO_ROUTES=[[[240,35],[450,205],[500,450],[640,600],[640,650]],[[640,35],[640,650]],[[1040,35],[830,205],[780,450],[640,600],[640,650]]].map((points,lane)=>({lane,points,length:points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0)}));
export const HERO_ROAD_PATH=HERO_ROUTES.map(r=>r.points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join('')).join(' ');
export function pointOnHeroRoute(lane,distance){const route=HERO_ROUTES[lane],end=route.length-65;let d=Math.max(0,Math.min(end,distance));for(let i=1;i<route.points.length;i++){const [x,y]=route.points[i-1],[tx,ty]=route.points[i],n=Math.hypot(tx-x,ty-y);if(d<=n||i===route.points.length-1)return {x:x+(tx-x)*d/n,y:y+(ty-y)*d/n,angle:Math.atan2(ty-y,tx-x),remaining:Math.max(0,end-distance),arrived:distance>=end};d-=n;}}
export function heroPositionStatus(x,y,towers=[]){const r=15;if(!Number.isFinite(x)||!Number.isFinite(y)||x<r||x>1280-r||y<r||y>800-r)return {ok:false,message:'超出地图'};if(Math.hypot(x-640,y-650)<HERO_GODDESS.radius+r)return {ok:false,message:'神殿阻挡'};if(HERO_TERRAIN.some(t=>x>t.x-r&&x<t.x+t.width+r&&y>t.y-r&&y<t.y+t.height+r)||towers.some(t=>Math.abs(x-t.x)<FOOTPRINT.width/2+r&&Math.abs(y-t.y)<FOOTPRINT.height/2+r))return {ok:false,message:'地形或防御单位阻挡'};return {ok:true,message:'可以移动'};}
function segmentDistance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
export function heroPlacementStatus(x,y,towers=[]){const base=placementStatus(x,y,towers,[]);if(!base.ok)return base;if(HERO_ROUTES.some(r=>r.points.slice(1).some((p,i)=>segmentDistance(x,y,r.points[i],p)<82)))return {ok:false,message:'进攻道路不可建造'};if(Math.hypot(x-640,y-650)<125||HERO_CAMPS.some(c=>Math.hypot(x-c.x,y-c.y)<110)||HERO_TERRAIN.some(t=>x>t.x-45&&x<t.x+t.width+45&&y>t.y-25&&y<t.y+t.height+25))return {ok:false,message:'神殿、营地或地形不可建造'};return base;}

// This small visibility graph is rebuilt only when buildings change.
export function createHeroNavigation(towers=[]){
 const boxes=[...HERO_TERRAIN,...towers.map(t=>({x:t.x-45,y:t.y-25,width:90,height:50}))];
 const nodes=boxes.flatMap(t=>[[t.x-17,t.y-17],[t.x+t.width+17,t.y-17],[t.x+t.width+17,t.y+t.height+17],[t.x-17,t.y+t.height+17]]).map(([x,y])=>({x,y}));
 for(let i=0;i<16;i++){const a=i*Math.PI/8;nodes.push({x:640+61*Math.cos(a),y:650+61*Math.sin(a)});}
 const valid=nodes.filter(p=>heroPositionStatus(p.x,p.y,towers).ok);
 function visible(a,b){
  if(!heroPositionStatus(b.x,b.y,towers).ok||segmentDistance(640,650,[a.x,a.y],[b.x,b.y])<57)return false;
  for(const box of boxes){let low=0,high=1;for(const [start,delta,min,max] of [[a.x,b.x-a.x,box.x-15,box.x+box.width+15],[a.y,b.y-a.y,box.y-15,box.y+box.height+15]]){if(Math.abs(delta)<1e-10){if(start<=min||start>=max){low=2;break;}}else{const t1=(min-start)/delta,t2=(max-start)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));}}if(low<high&&high>0&&low<1)return false;}return true;
 }
 const edges=valid.map(()=>[]);for(let i=0;i<valid.length;i++)for(let j=0;j<i;j++)if(visible(valid[i],valid[j])){const cost=Math.hypot(valid[i].x-valid[j].x,valid[i].y-valid[j].y);edges[i].push([j,cost]);edges[j].push([i,cost]);}
 return function moveEntity(entity,target,travel){
  if(travel<=0)return false;let waypoint=target;
  if(!visible(entity,target)){
   const costs=valid.map(p=>visible(p,target)?Math.hypot(p.x-target.x,p.y-target.y):Infinity),done=new Set();
   for(let count=0;count<valid.length;count++){let best=-1;for(let i=0;i<valid.length;i++)if(!done.has(i)&&(best<0||costs[i]<costs[best]))best=i;if(best<0||!Number.isFinite(costs[best]))break;done.add(best);for(const [i,cost] of edges[best])if(costs[best]+cost<costs[i]){costs[i]=costs[best]+cost;}}
   let best=-1,total=Infinity;for(let i=0;i<valid.length;i++){const cost=costs[i]+Math.hypot(entity.x-valid[i].x,entity.y-valid[i].y);if(cost<total&&visible(entity,valid[i])){best=i;total=cost;}}
   if(best<0)return false;waypoint=valid[best];
  }
  const length=Math.hypot(waypoint.x-entity.x,waypoint.y-entity.y);if(length<1e-8)return false;const dx=(waypoint.x-entity.x)/length,dy=(waypoint.y-entity.y)/length,amount=Math.min(length,travel),steps=Math.ceil(amount/5);let moved=false;
  for(let i=0;i<steps;i++){const x=entity.x+dx*amount/steps,y=entity.y+dy*amount/steps;if(!heroPositionStatus(x,y,towers).ok)break;entity.x=x;entity.y=y;moved=true;}if(moved)entity.angle=Math.atan2(dy,dx);return moved;
 };
}
