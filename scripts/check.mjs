import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {FOOTPRINT, BUILD_CENTER_BOUNDS, PLAZA, ROAD_SEGMENTS, ROAD_NODES, placementStatus} from '../game/geometry.js';
import {DEFENSE_LANES, DEFENSE_ROAD_SEGMENTS, DEFENSE_PLAZA, defensePlacementStatus} from '../game/defense-geometry.js';
import {SLOTS as V2_SLOTS, LOOP_LENGTH as V2_LENGTH, pointOnLoop as v2Point} from '../game/assets/maps/v2/source/layout-geometry.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(resolve(root, file));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), {withFileTypes:true})) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path));
    else { assert(entry.isFile(), `不支持的原素材文件类型：${path}`); result.push(path); }
  }
  return result.sort();
}
const baseline = JSON.parse(await read('game/assets/original-assets.sha256.json'));
const originals = Object.keys(baseline).sort();
assert.equal(originals.length, 808, '原素材基线必须包含 808 个文件');
const protectedRoots = [...new Set(originals.map(path => path.split('/')[0]))];
const currentOriginals = (await Promise.all(protectedRoots.map(files))).flat().sort();
assert.deepEqual(currentOriginals, originals, '原素材文件清单发生增删');
for (const path of originals) assert.equal(createHash('sha256').update(await read(path)).digest('hex'), baseline[path], `原素材内容已变化：${path}`);
console.log('✓ 808 个原素材文件清单与 SHA-256 完全一致');
const manifest = JSON.parse(await read('outputs/manifest.json'));
assert.equal(manifest.units.length, 24);
let directions = 0;
for (const unit of manifest.units) {
  assert.equal(Object.keys(unit.directions).length, 8, `${unit.code} 方向数错误`);
  for (const path of [unit.master, ...Object.values(unit.directions)]) {
    assert((await stat(resolve(root, 'outputs', path))).isFile(), `素材缺失：${path}`);
  }
  directions += Object.keys(unit.directions).length;
}
assert.equal(directions, 192);
assert.equal(manifest.props.length, 6); assert.equal(manifest.effects.length, 6);
for (const item of [...manifest.props, ...manifest.effects]) assert((await stat(resolve(root, 'outputs', item.path))).isFile(), `素材缺失：${item.path}`);
console.log('✓ 原清单 24 个母版、192 个方向图、6 个道具、6 个特效存在');

// Read PNG scanlines so transparent overlays are checked against actual pixels.
async function checkPng(path, width, height, transparent, captureRGB=false) {
  const bytes = await read(path);
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', `${path} 不是 PNG`);
  assert.equal(bytes.toString('ascii',12,16),'IHDR');
  assert.equal(bytes.readUInt32BE(16),width, `${path} 宽度错误`);
  assert.equal(bytes.readUInt32BE(20),height, `${path} 高度错误`);
  assert.equal(bytes[24],8, `${path} 必须为 8 位 PNG`);
  assert.equal(bytes[28],0, `${path} 暂不支持交错 PNG`);
  const channels = {2:3,4:2,6:4}[bytes[25]];
  assert(channels, `${path} 必须为 RGB、灰度透明或 RGBA PNG`);
  const chunks = [];
  let ended = false;
  for (let offset=8; offset+12<=bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii',offset+4,offset+8);
    assert(offset+12+length<=bytes.length, `${path} PNG 数据截断`);
    if (type==='IDAT') chunks.push(bytes.subarray(offset+8,offset+8+length));
    if (type==='IEND') { ended=true; break; }
    offset += length+12;
  }
  assert(ended && chunks.length, `${path} PNG 数据不完整`);
  const decoded = inflateSync(Buffer.concat(chunks)), stride=width*channels;
  assert.equal(decoded.length,(stride+1)*height, `${path} 像素数据长度错误`);
  let previous = Buffer.alloc(stride), minAlpha=255, maxAlpha=0;
  const alpha = transparent ? new Uint8Array(width*height) : null;
  const rgb = captureRGB ? new Uint8Array(width*height*3) : null;
  for (let y=0;y<height;y++) {
    const offset=y*(stride+1), filter=decoded[offset], row=Buffer.from(decoded.subarray(offset+1,offset+1+stride));
    assert(filter<=4, `${path} PNG 滤波类型错误`);
    for (let x=0;x<stride;x++) {
      const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0;
      const p=a+b-c, pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
      const predictor=filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?(pa<=pb&&pa<=pc?a:pb<=pc?b:c):0;
      row[x]=(row[x]+predictor)&255;
    }
    if (bytes[25]===4 || bytes[25]===6) for (let x=channels-1;x<stride;x+=channels) {
      minAlpha=Math.min(minAlpha,row[x]); maxAlpha=Math.max(maxAlpha,row[x]);
      if(alpha)alpha[y*width+(x-channels+1)/channels]=row[x];
    }
    else maxAlpha=255;
    if(rgb)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=row[x*channels+(channels===2?0:c)];
    previous=row;
  }
  if (transparent) assert(minAlpha<255 && maxAlpha>0 && bytes[25]!==2, `${path} 应包含透明背景与可见像素`);
  console.log(`✓ ${path}：${width} × ${height}${transparent?'，透明叠图有效':''}`);
  return {width,height,alpha,rgb};
}
await checkPng('game/assets/maps/ground.png',1586,992,false);
await checkPng('game/assets/maps/road.png',1280,800,true);
await checkPng('game/assets/maps/pad.png',128,96,true);
for(const name of ['ground.png','road.png','pad.png']){
  assert((await read(`game/assets/maps/${name}`)).equals(await read(`game/assets/maps/v1/${name}`)),`初版地图归档与保留原文件不一致：${name}`);
}
const groundV2=await read('game/assets/maps/v2/ground.png');
assert(groundV2.equals(await read('game/assets/maps/v2/source/ground-imagegen-original.png')),'新版地形与保留的生成原图不一致');
const groundWidth=groundV2.readUInt32BE(16), groundHeight=groundV2.readUInt32BE(20);
assert(Math.abs(groundWidth/groundHeight-1.6)<.025,'新版地形比例应匹配 1280×800 战场');
assert(groundWidth>=1280&&groundHeight>=800,'新版地形分辨率不足');
await checkPng('game/assets/maps/v2/ground.png',groundWidth,groundHeight,false);
const roadV2=await checkPng('game/assets/maps/v2/road.png',1280,800,true);
const bridgeV2=await checkPng('game/assets/maps/v2/bridges.png',1280,800,true);
await checkPng('game/assets/maps/v2/pad.png',128,96,true);
for(let distance=0;distance<V2_LENGTH;distance+=2){
  const point=v2Point(distance);
  assert(roadV2.alpha[Math.round(point.y)*1280+Math.round(point.x)]>=240,'敌人路线超出新版道路实际像素');
}
assert.equal(V2_SLOTS.length,20);
assert.equal(new Set(V2_SLOTS.map(slot=>slot.id)).size,20);
for(const slot of V2_SLOTS)assert.equal(roadV2.alpha[slot.y*1280+slot.x],0,`旧版塔位 ${slot.id} 落在行进道路上`);
for(const id of [8,20]){
  const slot=V2_SLOTS.find(slot=>slot.id===id);
  for(let y=-20;y<=20;y+=10)for(let x=-40;x<=40;x+=10){
    assert(bridgeV2.alpha[(slot.y+y)*1280+slot.x+x]>=240,`桥头塔位 ${id} 缺少完整石台支撑`);
  }
}
console.log('✓ v2 归档路线、20 个塔位与两处桥头支撑保持有效');
for(const version of ['v3','v4']){
 const ground=await read(`game/assets/maps/${version}/ground.png`);
 assert(ground.equals(await read(`game/assets/maps/${version}/source/ground-imagegen-original.png`)),`${version} 地表与保留原图不一致`);
 const width=ground.readUInt32BE(16),height=ground.readUInt32BE(20);
 assert(Math.abs(width/height-1.6)<.025&&width>=1280&&height>=800,`${version} 地表比例或尺寸错误`);
 await checkPng(`game/assets/maps/${version}/ground.png`,width,height,false);
 const road=await checkPng(`game/assets/maps/${version}/road.png`,1280,800,true);
 for(const [index,node] of ROAD_NODES.entries())for(const neighbor of node.neighbors){
  const end=ROAD_NODES[neighbor],length=Math.hypot(end.x-node.x,end.y-node.y);
  assert(length>0&&end.neighbors.includes(index),'路网存在无效或单向连接');
  for(let distance=0;distance<=length;distance+=2){
   const x=node.x+(end.x-node.x)*distance/length,y=node.y+(end.y-node.y)*distance/length;
   assert(road.alpha[Math.round(y)*1280+Math.round(x)]>=240,`${version} 随机行走道路偏离实际路网`);
  }
 }
 for(const segment of ROAD_SEGMENTS)assert.equal(placementStatus((segment.x1+segment.x2)/2,(segment.y1+segment.y2)/2).ok,false,'路网存在可建造通道');
 let freePoints=0;
 for(let y=BUILD_CENTER_BOUNDS.y;y<=BUILD_CENTER_BOUNDS.y+BUILD_CENTER_BOUNDS.height;y+=13){
  for(let x=BUILD_CENTER_BOUNDS.x;x<=BUILD_CENTER_BOUNDS.x+BUILD_CENTER_BOUNDS.width;x+=19){
   if(!placementStatus(x,y).ok)continue;
   freePoints++;
   for(const dx of [-FOOTPRINT.width/2,0,FOOTPRINT.width/2])for(const dy of [-FOOTPRINT.height/2,0,FOOTPRINT.height/2]){
    assert(road.alpha[Math.round(y+dy)*1280+Math.round(x+dx)]<240,`${version} 允许建造点的完整占地压上了道路`);
   }
  }
 }
 assert(freePoints>100,'自由建造区域不足或退化成固定放置点');
 console.log(`✓ ${version} 路网像素、禁止压路与 ${freePoints} 个非固定建造采样点有效`);
}
// Both maps are painted as whole scenes. Inspect actual colors, not a synthetic lane alpha mask.
async function checkPaintedScene(directory,segments,nodes,plaza,canPlace,minimumSamples) {
const sceneBytes=await read(`${directory}/scene.png`);
assert(sceneBytes.equals(await read(`${directory}/source/scene-imagegen-original.png`)),`${directory} 场景与保留生成原图不一致`);
const sceneWidth=sceneBytes.readUInt32BE(16),sceneHeight=sceneBytes.readUInt32BE(20);
assert(Math.abs(sceneWidth/sceneHeight-1.6)<.025&&sceneWidth>=1280&&sceneHeight>=800,`${directory} 场景比例或尺寸错误`);
const scene=await checkPng(`${directory}/scene.png`,sceneWidth,sceneHeight,false,true);
const pavingAt=(x,y)=>{
 const index=(Math.round(y*sceneHeight/800)*sceneWidth+Math.round(x*sceneWidth/1280))*3;
 const [r,g,b]=scene.rgb.subarray(index,index+3);
 return r>160&&g>150&&r-g>7&&b/g>.68;
};
let paintedSamples=0;
for(const {x1,y1,x2,y2} of segments){
 const node={x:x1,y:y1},end={x:x2,y:y2},length=Math.hypot(x2-x1,y2-y1);
 for(let d=0;d<=length;d+=8){
  const x=node.x+(end.x-node.x)*d/length,y=node.y+(end.y-node.y)*d/length;
  // Junction medallions and the jade core have their own colors; inspect them in the route overlay.
  if((x>=plaza.x&&x<=plaza.x+plaza.width&&y>=plaza.y&&y<=plaza.y+plaza.height)||nodes.some(n=>Math.hypot(n.x-x,n.y-y)<18))continue;
  let found=false;
  for(let dy=-12;dy<=12&&!found;dy+=3)for(let dx=-12;dx<=12;dx+=3)if(pavingAt(x+dx,y+dy)){found=true;break;}
  assert(found,`${directory} 实际铺路偏离行走线：${x},${y}`);paintedSamples++;
 }
}
assert(paintedSamples>minimumSamples,`${directory} 实际铺路采样不足`);
let paintedFootprints=0;
for(let y=BUILD_CENTER_BOUNDS.y;y<=BUILD_CENTER_BOUNDS.y+BUILD_CENTER_BOUNDS.height;y+=13)for(let x=BUILD_CENTER_BOUNDS.x;x<=BUILD_CENTER_BOUNDS.x+BUILD_CENTER_BOUNDS.width;x+=19){
 if(!canPlace(x,y).ok)continue;
 paintedFootprints++;
 for(const dx of [-FOOTPRINT.width/2,0,FOOTPRINT.width/2])for(const dy of [-FOOTPRINT.height/2,0,FOOTPRINT.height/2]){
  let paved=0;
  for(let py=-3;py<=3;py++)for(let px=-3;px<=3;px++)paved+=Number(pavingAt(x+dx+px,y+dy+py));
  assert(paved/49<.45,`${directory} 可建占地落在实际铺路上：${x},${y}`);
 }
}
console.log(`✓ ${directory} 实际场景 ${paintedSamples} 个路面色彩采样与 ${paintedFootprints} 处建筑占地采样有效（节点装饰另行看图）`);
}
const loopSegments=ROAD_NODES.flatMap((node,index)=>node.neighbors.filter(n=>n>index).map(n=>({x1:node.x,y1:node.y,x2:ROAD_NODES[n].x,y2:ROAD_NODES[n].y})));
await checkPaintedScene('game/assets/maps/v5',loopSegments,ROAD_NODES,PLAZA,placementStatus,700);
await checkPaintedScene('game/assets/maps/core-defense',DEFENSE_ROAD_SEGMENTS,DEFENSE_LANES.flatMap(lane=>lane.points.map(([x,y])=>({x,y}))),DEFENSE_PLAZA,defensePlacementStatus,300);
for(const mode of ['escort','maze']){
 const directory=`game/assets/maps/${mode}`,bytes=await read(`${directory}/scene.png`);
 assert(bytes.equals(await read(`${directory}/source/scene-imagegen-original.png`)),`${mode} 场景原图未保留`);
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 assert(width>=1280&&height>=800&&Math.abs(width/height-1.6)<.025,`${mode} 场地尺寸或比例错误`);
 await checkPng(`${directory}/scene.png`,width,height,false);
}
const contract = (await read('game/CONTRACT.md')).toString();
const required = contract.match(/Required DOM IDs: ([^.]+)\./)?.[1].split(',').map(id=>id.trim());
assert(required?.length, 'UI 契约缺少 ID 清单');
const html = (await read('game/index.html')).toString();
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match=>match[1]);
assert.equal(new Set(ids).size, ids.length, 'UI 存在重复 ID');
for (const id of required) assert(ids.includes(id), `缺少 UI ID：${id}`);
console.log(`✓ ${required.length} 个必需 UI ID 存在且无重复`);
for (const directory of ['game','scripts']) {
  for (const file of await readdir(resolve(root,directory))) {
    if ((directory==='game' && file.endsWith('.js')) || (directory==='scripts' && file.endsWith('.mjs'))) execFileSync(process.execPath,['--check',resolve(root,directory,file)],{stdio:'pipe'});
  }
}
console.log('✓ game/*.js 与 scripts/*.mjs 语法检查通过');
console.log('浏览器完整对局、地图主观验收与实际试听：待用户验收。');
