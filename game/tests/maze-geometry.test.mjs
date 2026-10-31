import test from 'node:test';
import assert from 'node:assert/strict';
import { MAZE_ENTRY, MAZE_EXIT, createMazeNavigation, mazeRoute, mazeRouteLength, mazePlacementStatus, advanceInMaze } from '../maze-geometry.js';

const wall=(x,y)=>({x,y,code:'WALL'});
const routeOf=walls=>mazeRoute(createMazeNavigation([],walls));
function assertOrthogonal(route){
  for(let i=1;i<route.length;i++)assert.ok(route[i].x===route[i-1].x||route[i].y===route[i-1].y,'no diagonal shortcut');
}

test('free tower placement changes actual flow and removing it shortens the route',()=>{
  const open=mazeRoute(createMazeNavigation());
  assert.deepEqual(open[0],MAZE_ENTRY);assert.deepEqual(open.at(-1),MAZE_EXIT);
  assert.equal(mazeRouteLength(open),1180);
  const placed=mazePlacementStatus(600.25,390.75,'GUN');
  assert.equal(placed.ok,true);assert.ok(placed.routeLength>1180);assertOrthogonal(placed.route);
  assert.notDeepEqual(placed.route,mazePlacementStatus(600.25,200.75,'GUN').route);
  const blocked=routeOf([wall(600.25,390.75)]);
  assert.ok(mazeRouteLength(blocked)>mazeRouteLength(routeOf([])));
});

test('each final opening in a full barrier is protected',()=>{
  // Alternating free centers retain the required eight-pixel building gap,
  // while their enemy-expanded rectangles form a connected barrier.
  const barrier=Array.from({length:9},(_,i)=>wall(600+(i%2)*68,130+i*67.5));
  assert.equal(routeOf(barrier),null);
  for(let i=0;i<barrier.length;i++){
    const rest=barrier.filter((_,j)=>j!==i),last=barrier[i];
    assert.ok(routeOf(rest));
    const status=mazePlacementStatus(last.x,last.y,'WALL',[],rest);
    assert.equal(status.ok,false,`opening ${i}`);assert.match(status.message,/最后通路/);
  }
});

test('trapping a live enemy is rejected even when entry still has a route',()=>{
  const walls=[];
  for(const y of [300,480])for(const x of [400,460,520,580,640])walls.push(wall(x,y));
  for(const y of [360,420])walls.push(wall(400,y));
  const enemy={x:520,y:390};
  assert.ok(mazeRoute(createMazeNavigation([],walls),enemy.x,enemy.y));
  assert.equal(mazePlacementStatus(640,390,'WALL',[],walls).ok,true);
  const status=mazePlacementStatus(640,390,'WALL',[],walls,[enemy]);
  assert.equal(status.ok,false);assert.match(status.message,/场上敌人/);
});

test('full footprints, bounds, finite coordinates, gap, enemy and next target are checked',()=>{
  assert.equal(mazePlacementStatus(NaN,300,'WALL').ok,false);
  assert.equal(mazePlacementStatus(300,Infinity,'WALL').ok,false);
  assert.equal(mazePlacementStatus(140,300,'TOWER').ok,false);
  assert.equal(mazePlacementStatus(150,300,'WALL').ok,true);
  assert.equal(mazePlacementStatus(300,300,'TOWER',[{x:390,y:300}]).ok,false);
  assert.equal(mazePlacementStatus(300,300,'WALL',[{x:383,y:300}]).ok,true);
  assert.equal(mazePlacementStatus(300,300,'WALL',[{x:382,y:300}]).ok,false);
  assert.equal(mazePlacementStatus(500,390,'WALL',[],[],[{x:500,y:390}]).ok,false);
  assert.equal(mazePlacementStatus(550,390,'WALL',[],[],[{x:500,y:390,navTarget:{x:550,y:390}}]).ok,false);
  assert.equal(mazePlacementStatus(500,390,'WALL',[],Array.from({length:24},()=>wall(900,200))).ok,false);
});

test('flow avoids full rectangular clearances and never cuts diagonal corners',()=>{
  const towers=[{x:600.25,y:390.75}];
  const nav=createMazeNavigation(towers),route=mazeRoute(nav);
  assertOrthogonal(route);
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    for(const r of nav.obstacles)assert.equal(Math.max(a.x,b.x)>=r.left&&Math.min(a.x,b.x)<=r.right&&Math.max(a.y,b.y)>=r.top&&Math.min(a.y,b.y)<=r.bottom,false);
  }
});

test('a layout change redirects moving enemies continuously and keeps progress owned by engine',()=>{
  const enemy={...MAZE_ENTRY,progress:123};
  advanceInMaze(enemy,403,createMazeNavigation());
  assert.equal(enemy.x,453);assert.equal(enemy.y,390);assert.equal(enemy.progress,123);
  const next=createMazeNavigation([],[wall(600,390)]),before={x:enemy.x,y:enemy.y};
  advanceInMaze(enemy,0,next);
  assert.equal(enemy.x,before.x);assert.equal(enemy.y,before.y);
  assert.equal(enemy.navTarget.version,next.version);
  const left=enemy.remaining;
  for(let i=0;i<2000&&!enemy.arrived;i++){
    const old={x:enemy.x,y:enemy.y};
    advanceInMaze(enemy,3,next);
    assert.ok(Math.hypot(enemy.x-old.x,enemy.y-old.y)<=3.000001);
    assert.ok(!next.obstacles.some(r=>enemy.x>=r.left&&enemy.x<=r.right&&enemy.y>=r.top&&enemy.y<=r.bottom));
  }
  assert.ok(left>0);assert.equal(enemy.arrived,true);assert.equal(enemy.remaining,0);
  assert.equal(enemy.progress,123);assert.equal(enemy.x,MAZE_EXIT.x);assert.equal(enemy.y,MAZE_EXIT.y);
});
