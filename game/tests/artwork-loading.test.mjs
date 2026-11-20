import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArtwork,loadImage,MAP_SCENE} from '../render.js';
import {readFileSync} from 'node:fs';

const isActiveMap = pathname => pathname.endsWith(`/${MAP_SCENE}`);

test('an unavailable loop map leaves unit and effect artwork available',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch;
 const requests=[];
 class ImageMock{
  set src(value){const url=new URL(value);requests.push(url.pathname);
   queueMicrotask(()=>isActiveMap(url.pathname)?this.onerror?.():this.onload?.());
  }
 }
 try{
  globalThis.Image=ImageMock;
  globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  const artwork=await loadArtwork();
  assert.equal(artwork.ground,null);
  assert.ok(artwork.units.get('T01').masterImage);
  assert.ok(artwork.effects.get('F04'));
  assert.equal(requests.filter(isActiveMap).length,3);
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});

test('progressive startup opens with the first requests still pending and installs images as they arrive',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch;
 const pending=[];
 let release=false, finish;
 const complete=new Promise(resolve=>{finish=resolve;});
 class ImageMock{
  set src(value){
   if(release)queueMicrotask(()=>this.onload());
   else pending.push(()=>this.onload());
  }
 }
 try{
  globalThis.Image=ImageMock;
  globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  const artwork=await loadArtwork((done,total)=>{if(done===total)finish();},undefined,{progressive:true});
  assert.equal(pending.length,3);
  assert.equal(artwork.ground,null);
  assert.equal(artwork.units.get('T01').masterImage,null);
  release=true;
  for(const loaded of pending)loaded();
  await complete;
  assert.ok(artwork.ground);
  assert.ok(artwork.units.get('T01').masterImage);
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});

test('a temporary loop scene failure retries the lightweight WebP and still completes startup',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch,requests=[];
 class ImageMock{
  set src(value){const url=new URL(value);requests.push(url);queueMicrotask(()=>{if(isActiveMap(url.pathname)&&requests.filter(u=>u.pathname===url.pathname).length===1)this.onerror();else {this.width=this.naturalWidth=1280;this.height=this.naturalHeight=800;this.onload();}});}
 }
 try{
  globalThis.Image=ImageMock;globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  const progress=[],artwork=await loadArtwork((n,total)=>progress.push([n,total]));
  assert.ok(artwork.ground);assert.equal(requests.filter(u=>isActiveMap(u.pathname)).length,2);assert.deepEqual(progress.at(-1),[31,31]);
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});

 test('permanent image failure is bounded and keeps the complete PNG path',async()=>{
 const saved=globalThis.Image,requests=[];
 class BrokenImage{set src(value){requests.push(new URL(value));queueMicrotask(()=>this.onerror?.());}}
 try{globalThis.Image=BrokenImage;await assert.rejects(loadImage('https://example.test/game/assets/maps/v5/scene.png',{retryDelay:0}),/scene\.png.*3次/);assert.equal(requests.length,3);assert.ok(requests.every(u=>u.pathname.endsWith('/scene.png')));}
 finally{globalThis.Image=saved;}
});

 test('a stalled request times out and retries while preserving existing version parameters',async()=>{
 const saved=globalThis.Image,requests=[];
 class SlowImage{set src(value){requests.push(new URL(value));if(requests.length>1)queueMicrotask(()=>this.onload?.());}}
 try{globalThis.Image=SlowImage;const img=await loadImage('https://example.test/game/assets/maps/v5/scene.png?v=7',{retryDelay:0,timeoutMs:5});assert.ok(img);assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('v'),'7');assert.equal(requests[1].searchParams.get('asset_retry'),'1');}
 finally{globalThis.Image=saved;}
});

 test('startup uses valid lightweight map derivatives instead of multi-megabyte PNG originals',async()=>{
 const savedImage=globalThis.Image,savedFetch=globalThis.fetch,requests=[];
 class ImageMock{set src(value){requests.push(new URL(value));queueMicrotask(()=>this.onload?.());}}
 try{
  globalThis.Image=ImageMock;globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(url,'utf8'))});
  await loadArtwork();
  const maps=requests.filter(url=>url.pathname.includes('/assets/maps/'));
  assert.equal(maps.length,1);
  for(const url of maps){
   assert.ok(isActiveMap(url.pathname));
   const bytes=readFileSync(url);
   assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
   assert.ok(bytes.length<700000,`${url.pathname} exceeds mobile map budget`);
   assert.ok(readFileSync(new URL('scene.png',url)).length>bytes.length*5,'original stays separate from runtime derivative');
  }
 }finally{globalThis.Image=savedImage;globalThis.fetch=savedFetch;}
});
