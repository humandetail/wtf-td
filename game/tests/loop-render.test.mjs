import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRenderer} from '../render.js';
import {createLoopGame} from '../loop-session.js';

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

test('loop tower artwork keeps its scale while placement uses the smaller base',()=>{
 const {canvas,calls}=canvasHarness();
 const sprite={url:'starter tower'},artwork={units:new Map([['T05',{images:new Map(),masterImage:sprite}]]),effects:new Map()};
 const renderer=createRenderer(canvas(),artwork),game=createLoopGame({draftRandom:()=>0,startingGold:200});
 game.start();game.openStarter();
 const result=game.deploy(game.state.cards[0].id,190,140);
 assert.ok(result.ok);
 assert.ok(game.draw('R').ok);
 const card=game.state.cards[0];
 assert.equal(game.canDeploy(card.id,259,140).ok,false);
 assert.equal(game.canDeploy(card.id,260,140).ok,true);
 calls.length=0;
 renderer.draw(game.state,result.towerId,null);
 assert.ok(calls.some(({method,args})=>method==='drawImage'&&args[0]===sprite&&args[3]===128&&args[4]===128));
 calls.length=0;
 renderer.draw(game.state,null,{x:260,y:140,code:'T05',ok:true});
 assert.ok(calls.some(({method,args})=>method==='drawImage'&&args[0]===sprite&&args[1]===196&&args[3]===128&&args[4]===128));
 assert.ok(calls.some(({method,args})=>method==='strokeRect'&&args[2]===64&&args[3]===38));
});

test('loop paints the fallback roads and uses its ground image when available',()=>{
 const {canvas,calls}=canvasHarness();
 const artwork={units:new Map(),effects:new Map(),ground:null};
 const renderer=createRenderer(canvas(),artwork);
 const game=createLoopGame();
 renderer.draw(game.state,null,null);
 assert.ok(calls.some(call=>call.method==='lineTo'&&call.args[0]===1204&&call.args[1]===60));
 artwork.ground={url:'loop terrain'};
 renderer.draw(game.state,null,null);
 assert.ok(calls.some(call=>call.method==='drawImage'&&call.args[0]===artwork.ground));
});
