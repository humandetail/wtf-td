import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArtwork,loadImage} from '../render.js';
import {readFileSync} from 'node:fs';

test('a temporary maze scene failure retries the lightweight WebP and still completes startup',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch,requests=[];
 class ImageMock{
  set src(value){const url=new URL(value);requests.push(url);queueMicrotask(()=>{if(url.pathname.endsWith('/maps/maze/scene.webp')&&requests.filter(u=>u.pathname===url.pathname).length===1)this.onerror();else {this.width=this.naturalWidth=1280;this.height=this.naturalHeight=800;this.onload();}});}
 }
 try{
  globalThis.Image=ImageMock;globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  const progress=[],artwork=await loadArtwork((n,total)=>progress.push([n,total]));
  assert.ok(artwork.mazeGround);assert.equal(requests.filter(u=>u.pathname.endsWith('/maps/maze/scene.webp')).length,2);assert.deepEqual(progress.at(-1),[43,43]);
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});

 test('permanent image failure is bounded and keeps the complete PNG path',async()=>{
 const saved=globalThis.Image,requests=[];
 class BrokenImage{set src(value){requests.push(new URL(value));queueMicrotask(()=>this.onerror?.());}}
 try{globalThis.Image=BrokenImage;await assert.rejects(loadImage('https://example.test/game/assets/maps/maze/scene.png',{retryDelay:0}),/scene\.png.*3次/);assert.equal(requests.length,3);assert.ok(requests.every(u=>u.pathname.endsWith('/scene.png')));}
 finally{globalThis.Image=saved;}
});

 test('a stalled request times out and retries while preserving existing version parameters',async()=>{
 const saved=globalThis.Image,requests=[];
 class SlowImage{set src(value){requests.push(new URL(value));if(requests.length>1)queueMicrotask(()=>this.onload?.());}}
 try{globalThis.Image=SlowImage;const img=await loadImage('https://example.test/game/assets/maps/maze/scene.png?v=7',{retryDelay:0,timeoutMs:5});assert.ok(img);assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('v'),'7');assert.equal(requests[1].searchParams.get('asset_retry'),'1');}
 finally{globalThis.Image=saved;}
});

 test('startup uses valid lightweight map derivatives instead of multi-megabyte PNG originals',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch,requests=[];
 class ImageMock{set src(value){requests.push(new URL(value));queueMicrotask(()=>this.onload?.());}}
 try{
  globalThis.Image=ImageMock;globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  await loadArtwork();
  const maps=requests.filter(url=>url.pathname.includes('/assets/maps/'));
  assert.equal(maps.length,7);
  for(const url of maps){
   assert.ok(url.pathname.endsWith('/scene.webp'));
   const bytes=readFileSync(url);
   assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
   assert.ok(bytes.length<700000,`${url.pathname} exceeds mobile map budget`);
   assert.ok(readFileSync(new URL('scene.png',url)).length>bytes.length*5,'original stays separate from runtime derivative');
  }
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});
