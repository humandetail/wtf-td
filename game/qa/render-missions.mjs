// Offline native Canvas rendering of real default-parameter playthrough states.
// This exercises render.js directly; it is not a browser or layout screenshot.
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {existsSync,readdirSync} from 'node:fs';
import {createRenderer} from '../render.js';
import {playMission} from './mission-strategies.mjs';
import {createGame} from '../engine.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts}=require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const fontRoot='/System/Library/AssetsV2/com_apple_MobileAsset_Font7';
const font=existsSync(fontRoot)&&readdirSync(fontRoot).map(name=>`${fontRoot}/${name}/AssetData/PingFang.ttc`).find(existsSync);
if(font)GlobalFonts.registerFromPath(font,'PingFang SC');
const root=new URL('../../',import.meta.url),out=new URL('.scratch/2d-loop-td/previews/distinct-v2/',root);
await mkdir(out,{recursive:true});
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
globalThis.document={createElement:()=>createCanvas(1280,800)};
const artwork={units:new Map(),effects:new Map(),ground:await loadImage(fileURLToPath(new URL('../assets/maps/v5/scene.png',import.meta.url))),defenseGround:await loadImage(fileURLToPath(new URL('../assets/maps/core-defense/scene.png',import.meta.url))),escortGround:await loadImage(fileURLToPath(new URL('../assets/maps/escort/scene.png',import.meta.url))),mazeGround:await loadImage(fileURLToPath(new URL('../assets/maps/maze/scene.png',import.meta.url))),convoyImage:await loadImage(fileURLToPath(new URL('outputs/props/P01-tech-supply-crate.png',root))),wallImage:await loadImage(fileURLToPath(new URL('outputs/props/P02-portable-generator.png',root)))};
const manifest=JSON.parse(await readFile(new URL('outputs/manifest.json',root),'utf8'));
const frames=new Map([['maze-open',{state:structuredClone(createGame({mode:'maze'}).state),events:[]}]]);
for(const mode of ['maze','escort'])playMission(mode,(state,events)=>{
 if(mode==='maze'&&state.mazeLength>=1800&&state.enemies.length>=3&&!frames.has('maze-built'))frames.set('maze-built',{state:structuredClone(state),events});
 if(mode==='escort'&&state.convoy.progress>1200&&state.enemies.length>=2&&!frames.has('escort'))frames.set('escort',{state:structuredClone(state),events});
 if(mode==='escort'&&events.some(event=>event.type==='checkpoint')&&!frames.has('escort-checkpoint'))frames.set('escort-checkpoint',{state:structuredClone(state),events});
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
 renderer.draw(state,null,null,0);
 await writeFile(new URL(`${name}.png`,out),canvas.toBuffer('image/png'));
 summary[name]={mode:state.mode,elapsed:state.elapsed,coreHealth:state.coreHealth,enemies:state.enemies.length,convoy:state.convoy,mazeLength:state.mazeLength,walls:state.walls.length};
}
await writeFile(new URL('frames.json',out),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
