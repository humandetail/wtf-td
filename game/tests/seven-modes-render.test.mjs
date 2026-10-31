import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadArtwork,createRenderer} from '../render.js';
import {createGame} from '../engine.js';
import {projectBattleState,OBJECTIVE_FRAMES,HERO_ROW_BOUNDS} from '../special-render.js';

function canvasHarness(){
 const calls=[];
 const canvas=()=>{
  const surface={width:1280,height:800,getContext:()=>context};
  const context=new Proxy({}, {get(target,key){
   if(key in target)return target[key];
   return (...args)=>{
    if(key==='drawImage'){assert.ok(args[0],'undefined artwork');for(const n of args.slice(1))assert.ok(Number.isFinite(n),`nonfinite drawImage coordinate: ${n}`);}
    if(['arc','ellipse','fillRect','strokeRect','clearRect','moveTo','lineTo','translate','rotate','scale','setTransform'].includes(key))for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),`nonfinite ${String(key)} coordinate`);
    calls.push({method:key,args});
   };
  }});
  return surface;
 };
 class LocalImage{
  set src(url){
   this.url=String(url);
   try{const bytes=readFileSync(new URL(url));this.width=this.naturalWidth=bytes.readUInt32BE(16);this.height=this.naturalHeight=bytes.readUInt32BE(20);queueMicrotask(()=>this.onload());}
   catch(error){queueMicrotask(()=>this.onerror(error));}
  }
 }
 globalThis.Image=LocalImage;
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
 globalThis.document={createElement:canvas};
 return {canvas,calls};
}

test('production asset loader and painter render all seven actual sessions with finite coordinates',async()=>{
 const {canvas,calls}=canvasHarness(),progress=[];
 const artwork=await loadArtwork((n,total)=>progress.push([n,total]));
 assert.equal(progress.length,43);assert.deepEqual(progress.at(-1),[43,43]);
 for(const mode of ['gem','hero','legion'])assert.ok(artwork[`${mode}Ground`].url.includes(`/maps/${mode}/scene.png`));
 for(const unit of artwork.units.values())for(const direction of ['E','SE','S','SW','W','NW','N','NE'])unit.images.set(direction,unit.masterImage);
 const renderer=createRenderer(canvas(),artwork);
 for(const mode of ['loop','defense','escort','maze','gem','hero','legion']){
  const game=createGame({mode});game.start();let placement=null;
  if(mode==='gem'){assert.equal(game.draw().ok,true);placement={x:640,y:270,code:game.state.draft.candidates[0].code,level:1,ok:true};assert.equal(game.keep(0,{x:640,y:270}).ok,true);game.startCombat();game.tick(.1);}
  if(mode==='hero'){assert.equal(game.build(480,550,'T06').ok,true);game.castSkill('Q',640,200);placement={x:640,y:250,skill:'Q',ok:true};}
  if(mode==='legion'){assert.equal(game.build(600,450,'T01').ok,true);game.startCombat();game.tick(.1);}
  calls.length=0;renderer.reset();for(const event of game.drainEvents())renderer.event(event);
  const state=mode==='legion'?{...game.state,viewSide:'ai'}:game.state;
  renderer.draw(state,game.state.towers[0]?.id??null,placement,.01);
  assert.ok(calls.some(call=>call.method==='drawImage'),mode+' draws an actual scene');
  const images=calls.filter(call=>call.method==='drawImage').map(call=>call.args[0]);
  if(mode==='gem')assert.ok(images.includes(artwork.gemAtlas));
  if(mode==='hero'){
   assert.ok(images.includes(artwork.heroAtlas));assert.ok(images.includes(artwork.objectivesAtlas));
   for(const skill of ['E','R'])renderer.draw(state,null,{x:700,y:600,skill,ok:true},0);
   calls.length=0;
   renderer.draw({...state,hero:{...state.hero,alive:false,action:'dead',respawnIn:10}},null,null,0);
   const corpse=calls.find(call=>call.method==='drawImage'&&call.args[0]===artwork.heroAtlas);
   assert.equal(corpse.args[2],HERO_ROW_BOUNDS[4],'death begins below all casting feet');
   assert.equal(corpse.args[4],992-HERO_ROW_BOUNDS[4]);
   assert.ok(Math.abs(corpse.args[8]/corpse.args[7]-corpse.args[4]/corpse.args[3])<1e-9,'hero source aspect is preserved');
  }
  if(mode==='legion'){
   assert.ok(images.includes(artwork.objectivesAtlas));
   assert.ok(calls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('AI国王')));
   assert.equal(Object.hasOwn(state,'towers'),false,'the UI spread really drops non-enumerable aliases');
   assert.equal(projectBattleState(state).towers.length,game.state.sides.ai.fighters.length);
  }
 }
 for(const [x,y,w,h]of OBJECTIVE_FRAMES){assert.ok(x>=0&&y>=0&&x+w<=1254&&y+h<=1254);}
});

test('legion effects are drawn only on the side that owns the battle event',async()=>{
 const {canvas,calls}=canvasHarness(),artwork=await loadArtwork(()=>{});
 for(const unit of artwork.units.values())for(const direction of ['E','SE','S','SW','W','NW','N','NE'])unit.images.set(direction,unit.masterImage);
 const renderer=createRenderer(canvas(),artwork),game=createGame({mode:'legion'});game.start();
 renderer.event({type:'heal',side:'ai',x:600,y:400,damage:-28});
 renderer.draw({...game.state,viewSide:'player'},null,null,0);
 assert.equal(calls.some(call=>call.method==='fillText'&&call.args[0]==='+28'),false);
 calls.length=0;renderer.draw({...game.state,viewSide:'ai'},null,null,0);
 assert.ok(calls.some(call=>call.method==='fillText'&&call.args[0]==='+28'));
});
