// Offline native Canvas rendering of real default-parameter playthrough states.
// This exercises render.js directly; it is not a browser or layout screenshot.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {existsSync,readdirSync} from 'node:fs';
import {createRenderer} from '../render.js';
import {playMission} from './mission-strategies.mjs';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts}=require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const fontRoot='/System/Library/AssetsV2/com_apple_MobileAsset_Font7';
const font=existsSync(fontRoot)&&readdirSync(fontRoot).map(name=>`${fontRoot}/${name}/AssetData/PingFang.ttc`).find(existsSync);
if(font)GlobalFonts.registerFromPath(font,'PingFang SC');
const root=new URL('../../',import.meta.url),out=new URL('.scratch/2d-loop-td/previews/',root);
await mkdir(out,{recursive:true});
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
globalThis.document={createElement:()=>createCanvas(1280,800)};
const artwork={units:new Map(),effects:new Map(),ground:await loadImage(fileURLToPath(new URL('../assets/maps/v5/scene.png',import.meta.url))),defenseGround:await loadImage(fileURLToPath(new URL('../assets/maps/core-defense/scene.png',import.meta.url)))};
const manifest=JSON.parse(await readFile(new URL('outputs/manifest.json',root),'utf8'));
const frames=new Map();
for(const mode of ['harvest','storm'])playMission(mode,(state,events)=>{
 if(mode==='harvest'&&state.elapsed>=120&&!frames.has('harvest'))frames.set('harvest',{state:structuredClone(state),events});
 if(mode==='harvest'&&state.extractionRemaining!==null&&state.extractionRemaining<15&&!frames.has('evacuation'))frames.set('evacuation',{state:structuredClone(state),events});
 if(mode==='storm'&&state.stormActive&&events.some(event=>event.type==='pulse')&&!frames.has('storm'))frames.set('storm',{state:structuredClone(state),events});
});
const directions=['E','SE','S','SW','W','NW','N','NE'];
for(const {state} of frames.values())for(const entity of [...state.towers,...state.enemies]){
 let unit=artwork.units.get(entity.code);
 if(!unit){
  const entry=manifest.units.find(unit=>unit.code===entity.code);
  unit={...entry,masterImage:await loadImage(fileURLToPath(new URL(`outputs/${entry.master}`,root))),images:new Map(),requested:new Set()};
  artwork.units.set(entity.code,unit);
 }
 const direction=directions[((Math.round((entity.angle||0)/(Math.PI/4))%8)+8)%8];
 if(!unit.images.has(direction))unit.images.set(direction,await loadImage(fileURLToPath(new URL(`outputs/${unit.directions[direction]}`,root))));
}
const canvas=createCanvas(1280,800),renderer=createRenderer(canvas,artwork);
const summary={};
for(const [name,{state,events}] of frames){
 renderer.reset();
 if(name==='storm')for(const event of events.filter(event=>event.type==='pulse'))renderer.event(event);
 renderer.draw(state,null,null,name==='storm'?.2:0);
 await writeFile(new URL(`${name}.png`,out),canvas.toBuffer('image/png'));
 summary[name]={mode:state.mode,elapsed:state.elapsed,coreHealth:state.coreHealth,enemies:state.enemies.length,harvested:state.harvested,extractionRemaining:state.extractionRemaining,stormActive:state.stormActive,pulseRemaining:state.pulseRemaining};
}
await writeFile(new URL('frames.json',out),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
