import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {SLOTS, LOOP_LENGTH, pointOnLoop} from '../game/geometry.js';
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
async function checkPng(path, width, height, transparent) {
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
    previous=row;
  }
  if (transparent) assert(minAlpha<255 && maxAlpha>0 && bytes[25]!==2, `${path} 应包含透明背景与可见像素`);
  console.log(`✓ ${path}：${width} × ${height}${transparent?'，透明叠图有效':''}`);
  return {width,height,alpha};
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
for(let distance=0;distance<LOOP_LENGTH;distance+=2){
  const point=pointOnLoop(distance);
  assert(roadV2.alpha[Math.round(point.y)*1280+Math.round(point.x)]>=240,'敌人路线超出新版道路实际像素');
}
assert.equal(SLOTS.length,20);
assert.equal(new Set(SLOTS.map(slot=>slot.id)).size,20);
for(const slot of SLOTS)assert.equal(roadV2.alpha[slot.y*1280+slot.x],0,`塔位 ${slot.id} 落在行进道路上`);
for(const id of [8,20]){
  const slot=SLOTS.find(slot=>slot.id===id);
  for(let y=-20;y<=20;y+=10)for(let x=-40;x<=40;x+=10){
    assert(bridgeV2.alpha[(slot.y+y)*1280+slot.x+x]>=240,`桥头塔位 ${id} 缺少完整石台支撑`);
  }
}
console.log('✓ 新版环路逐 2 像素采样均位于道路上，20 个独立塔位均避开道路');
console.log('✓ 两处桥头塔位具有完整的实际石台像素支撑');
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
