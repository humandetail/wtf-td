import test from 'node:test';
import assert from 'node:assert/strict';
import {mat4,quat,vec3} from 'gl-matrix';
import {createLoopGame} from '../loop-session.js';
import {createBattleCamera,pickActor} from '../local-3d/camera.js';
import {createYoshinoRenderer,findLocalYoshino,loadYoshino,YOSHINO_FILES} from '../local-3d/boss.js';

const math = {mat4,quat,vec3};

test('rotated and zoomed camera ground points preserve the real loop deployment rules',()=>{
 const camera = createBattleCamera(math);
 for (const [width,height] of [[1280,800],[390,244]]) {
  camera.resize(width,height);
  for (const [yaw,pitch,zoom] of [[0,0,1],[45,-12,1.12],[135,15,1.2],[225,-8,1.3],[315,5,1.04]]) {
   camera.reset();camera.orbit(yaw,pitch);camera.zoomBy(zoom);
   const game = createLoopGame({draftRandom:()=>0});
   game.start();
   const {cardId} = game.openStarter();
   for (const [x,y] of [[500,300],[700,500],[640,400],[640,270],[45,45]]) {
    const screen = camera.project(x,y);
    const actual = camera.ground(screen.x,screen.y);
    assert.ok(actual&&Math.hypot(actual.x-x,actual.y-y)<.1);
    assert.equal(game.canDeploy(cardId,actual.x,actual.y).ok,game.canDeploy(cardId,x,y).ok);
   }
   const road = camera.project(640,400), valid = camera.project(500,300);
   const fromRoad = camera.ground(road.x,road.y), fromLand = camera.ground(valid.x,valid.y);
   assert.equal(game.deploy(cardId,fromRoad.x,fromRoad.y).ok,false);
   assert.equal(game.deploy(cardId,fromLand.x,fromLand.y).ok,true);
   assert.equal(game.deploy(cardId,fromLand.x,fromLand.y).ok,false);
   assert.equal(game.state.towers.length,1);
  }
 }
 camera.orbit(0,900);
 assert.equal(camera.pitch,70);
 camera.orbit(0,-900);
 assert.equal(camera.pitch,30);
 camera.reset();
 assert.equal(camera.pitch,56);
});

test('RTS zoom lowers the camera up close and overview fits the entire map at every aspect',()=>{
 const camera = createBattleCamera(math);
 for (const [width,height] of [[1280,540],[800,500],[390,600]]) {
  camera.resize(width,height);
  camera.reset();
  assert.equal(camera.pitch,56);
  const start = camera.project(740,400);
  camera.zoomBy(1.7);
  assert.ok(camera.pitch<56);
  assert.ok(camera.project(740,400).x>start.x);
  camera.zoomBy(.1);
  assert.equal(camera.pitch,70);
  camera.reset(true);
  for (const [x,y] of [[0,0],[1280,0],[0,800],[1280,800]]) {
   const p = camera.project(x,y);
   assert.ok(p.visible && p.x>0 && p.x<width && p.y>0 && p.y<height);
  }
  const north = camera.project(740,400);
  camera.lookAside(90);
  assert.notDeepEqual(camera.project(740,400),north);
  camera.lookAside(0);
  assert.deepEqual(camera.project(740,400),north);
 }
});

test('shared pick ray selects the nearest live unit across both actor lists',()=>{
 const ray = {origin:[200,-800,55],direction:[0,1,-.1]};
 const tower = {id:12,x:200,y:510};
 const enemy = {id:77,x:200,y:650,hp:100,boss:true};
 const state = {towers:[tower],enemies:[enemy]};
 assert.deepEqual(pickActor(ray,state),{id:77,kind:'enemy',x:200,y:650});
 enemy.hp=0;
 assert.deepEqual(pickActor(ray,state),{id:12,kind:'tower',x:200,y:510});
 assert.equal(pickActor({origin:[0,0,10],direction:[0,0,-1]},state),null);
});

test('automatic model import requires loopback and the complete three-file set',async t=>{
 const saved = Object.getOwnPropertyDescriptor(globalThis,'location');
 t.after(()=>{
  if (saved) Object.defineProperty(globalThis,'location',saved);
  else delete globalThis.location;
 });
 let missing = null;
 const fetchModel = t.mock.method(globalThis,'fetch',async url=>{
  const name = url.pathname.split('/').pop();
  return name===missing ? new Response(null,{status:204}) : new Response(name);
 });

 globalThis.location = {hostname:'10.10.2.55'};
 assert.equal(await findLocalYoshino(),null);
 assert.equal(fetchModel.mock.callCount(),0);

 globalThis.location = {hostname:'127.0.0.1'};
 const files = await findLocalYoshino();
 assert.deepEqual(files.map(file=>file.name),YOSHINO_FILES);
 missing = 'YoshinoMagic.blp';
 assert.equal(await findLocalYoshino(),null);
});

test('Yoshino renders ordinary, elite and boss sizes and leaves canceled spell clips immediately',async()=>{
 const enemy = {code:'X01',hp:100,x:640,y:400,actualSpeed:32};
 await assert.rejects(loadYoshino([],{}),/一起选择/);
 const frames = [], scales = [];
 class ModelRenderer {
  initGL(){} setTeamColor(){} update(){} setCamera(){}
  render(matrix){scales.push(Math.hypot(...matrix.slice(0,3)));}
  setSequence(index){this.index=index;}
  setFrame(frame){frames.push([this.index,frame]);}
 }
 const renderer = createYoshinoRenderer({}, {ModelRenderer}, math, {
  indexes:{stand:0,walk:1,channel:2,death:3},textures:new Map(),
  model:{Sequences:[{Interval:[1000,2000]},{Interval:[2000,3000]},{Interval:[3000,4500]},{Interval:[5000,5840]}]}
 });
 const camera = createBattleCamera(math);
 renderer.draw(camera,{...enemy,actualSpeed:0},2.25);
 renderer.draw(camera,{...enemy,code:'B02',boss:true,channel:{start:2,until:3}},2.5);
 renderer.draw(camera,{...enemy,code:'B02',boss:true},2.55);
 renderer.draw(camera,{...enemy,code:'E03'},3,.4);
 renderer.draw(camera,enemy,4,1);
 assert.deepEqual(frames,[[0,1250],[2,3750],[1,2000],[3,5400]]);
 assert.ok(scales[0]<scales[3] && scales[3]<scales[1]);
 assert.equal(scales[1],scales[2]);
});
