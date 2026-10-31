import test from 'node:test';
import assert from 'node:assert/strict';
import {ESCORT_POINTS,ESCORT_LENGTH,ESCORT_CHECKPOINTS,ESCORT_ROAD_PATH,ESCORT_BUILD_EXCLUSIONS,pointOnEscortRoute,escortPlacementStatus} from '../escort-geometry.js';
import {BUILD_CENTER_BOUNDS,FOOTPRINT} from '../geometry.js';

test('escort follows the specified complete route and checkpoint distances',()=>{
 assert.deepEqual(ESCORT_POINTS,[[80,660],[300,660],[300,180],[640,180],[640,600],[980,600],[980,140],[1200,140]]);
 assert.equal(ESCORT_LENGTH,2480);
 assert.deepEqual(ESCORT_CHECKPOINTS,[800,1600]);
 assert.equal(ESCORT_ROAD_PATH,'M80 660L300 660L300 180L640 180L640 600L980 600L980 140L1200 140');
 assert.equal(ESCORT_BUILD_EXCLUSIONS.length,7);
 assert.deepEqual(pointOnEscortRoute(800),{x:400,y:180,angle:0,remaining:1680,arrived:false});
 assert.deepEqual(pointOnEscortRoute(1600),{x:780,y:600,angle:0,remaining:880,arrived:false});
});

test('route sampling clamps distances and adopts the outgoing angle at each corner',()=>{
 assert.deepEqual(pointOnEscortRoute(-10),{x:80,y:660,angle:0,remaining:2480,arrived:false});
 assert.deepEqual(pointOnEscortRoute(0),pointOnEscortRoute(-10));
 const corners=[[220,300,660,-Math.PI/2],[700,300,180,0],[1040,640,180,Math.PI/2],[1460,640,600,0],[1800,980,600,-Math.PI/2],[2260,980,140,0]];
 for(const [distance,x,y,angle] of corners)assert.deepEqual(pointOnEscortRoute(distance),{x,y,angle,remaining:2480-distance,arrived:false});
 assert.deepEqual(pointOnEscortRoute(460.5),{x:300,y:419.5,angle:-Math.PI/2,remaining:2019.5,arrived:false});
 const end={x:1200,y:140,angle:0,remaining:0,arrived:true};
 assert.deepEqual(pointOnEscortRoute(2480),end);
 assert.deepEqual(pointOnEscortRoute(10000),end);
});

test('escort reserves full road width, tower footprint and shoulder on every segment',()=>{
 // The first horizontal road spans x=80..300, y=660: 77/57 clearance.
 assert.deepEqual(ESCORT_BUILD_EXCLUSIONS[0],{x:3,y:603,width:374,height:114,reason:'护送道路不可建造'});
 for(let i=0;i<ESCORT_POINTS.length-1;i++){
  const [x1,y1]=ESCORT_POINTS[i],[x2,y2]=ESCORT_POINTS[i+1];
  assert.equal(escortPlacementStatus((x1+x2)/2,(y1+y2)/2).ok,false);
 }
 assert.equal(escortPlacementStatus(500,237).ok,false,'full footprint touches horizontal road shoulder');
 assert.equal(escortPlacementStatus(500,237.01).ok,true);
 assert.equal(escortPlacementStatus(377,400).ok,false,'full footprint touches vertical road shoulder');
 assert.equal(escortPlacementStatus(377.01,400).ok,true);
 assert.equal(escortPlacementStatus(377,603).ok,false,'corner reserves both footprint axes');
 assert.equal(escortPlacementStatus(640,400).ok,false);
 assert.equal(escortPlacementStatus(500,400).ok,true,'old central plaza adds no escort exclusion');
});

test('free placement uses original bounds and tower spacing with continuous coordinates',()=>{
 const {x,y,width,height}=BUILD_CENTER_BOUNDS;
 assert.equal(escortPlacementStatus(x,y).ok,true);
 assert.equal(escortPlacementStatus(x-.001,y).ok,false);
 assert.equal(escortPlacementStatus(x,y-.001).ok,false);
 assert.equal(escortPlacementStatus(x+width+.001,400).ok,false);
 assert.equal(escortPlacementStatus(500,y+height+.001).ok,false);
 for(const value of [NaN,Infinity,-Infinity]){
  assert.equal(escortPlacementStatus(value,400).ok,false);
  assert.equal(escortPlacementStatus(500,value).ok,false);
 }
 const towers=[{id:1,x:450.25,y:400.125}];
 assert.equal(escortPlacementStatus(450.25,400.125,towers).ok,false);
 assert.equal(escortPlacementStatus(450.25+FOOTPRINT.width+FOOTPRINT.gap-.001,400.125,towers).ok,false);
 assert.equal(escortPlacementStatus(450.25+FOOTPRINT.width+FOOTPRINT.gap,400.125,towers).ok,true);
 assert.equal(escortPlacementStatus(450.25,400.125+FOOTPRINT.height+FOOTPRINT.gap,towers).ok,true);
 assert.equal(escortPlacementStatus(450.25,400.125+FOOTPRINT.height+FOOTPRINT.gap-.001,towers).ok,false);
 assert.deepEqual(escortPlacementStatus(500.123,300.456),{ok:true,message:'可以建造'});
});
