// Render the production painter and asset loader against real public-command sessions.
// Native Canvas only: this does not claim browser layout, input, audio or human acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadArtwork,createRenderer} from '../render.js';
import {projectBattleState} from '../special-render.js';
import {createGame} from '../engine.js';
import {playGem} from './gem-strategy.mjs';
import {runHeroStrategy} from './hero-strategy.mjs';
import {playLegionMatch} from './legion-strategy.mjs';

const require=createRequire(import.meta.url);
const {createCanvas,loadImage,Image,GlobalFonts}=require(process.env.TD_CANVAS_MODULE||'/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const fontRoot='/System/Library/AssetsV2/com_apple_MobileAsset_Font7';
const font=existsSync(fontRoot)&&readdirSync(fontRoot).map(name=>`${fontRoot}/${name}/AssetData/PingFang.ttc`).find(existsSync);
if(font)GlobalFonts.registerFromPath(font,'PingFang SC');
const root=new URL('../../',import.meta.url),out=new URL('.scratch/2d-loop-td/previews/war3-modes/',root);
await mkdir(out,{recursive:true});
globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
globalThis.document={createElement:()=>createCanvas(1280,800)};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))});
globalThis.Image=function(){
 const image=new Image(),setter=Object.getOwnPropertyDescriptor(Image.prototype,'src').set;
 Object.defineProperty(image,'src',{set(value){setter.call(image,fileURLToPath(value));}});
 return image;
};
let loaded=0;
const artwork=await loadArtwork((complete,total)=>{loaded=complete;assert.equal(total,43);});
assert.equal(loaded,43);
const masters=[...artwork.units.values()].map(unit=>unit.masterImage);
await Promise.all([...masters,...artwork.effects.values(),...Object.values(artwork).filter(value=>value instanceof Image)].map(image=>image.decode()));
const frames=new Map();
function save(name,state,events=[],placement=null){if(!frames.has(name))frames.set(name,{state:structuredClone(state),events:structuredClone(events),placement});}
for(const mode of ['loop','defense','escort','maze'])save(`${mode}-retained`,createGame({mode}).state);
const gem=playGem(2026,{onFrame(state,events){
 if(state.wave>=4&&state.enemies.length>=5)save('gem-combat',state,events);
 if(state.wave>=16&&state.enemies.length>=7)save('gem-late',state,events);
}});
assert.equal(gem.phase,'victory');
const recipes=[];
for(const code of ['F01','F02','F03','F04','F05']){
 const run=playGem(42,{recipeTarget:code,onFrame(state,events){
  if(state.towers.some(tower=>tower.code===code)&&events.some(event=>event.type==='fusion'))save(`gem-${code}-fusion`,state,events);
  if(events.some(event=>event.type==='shot'&&event.code===code||code==='F05'&&event.type==='echo'))save(`gem-${code}-combat`,state,events);
 }});assert.equal(run.phase,'victory');recipes.push(run);
}
const hero=runHeroStrategy({onFrame(state,events){
 for(const key of ['Q','E','R'])if(events.some(event=>event.type==='hero-skill'&&event.key===key))save(`hero-${key}`,state,events);
 if(state.telegraphs.length)save('hero-warning',state,events);
 if(state.hero.action==='move'&&state.wave>=1)save('hero-movement',state,events,{x:640,y:300,skill:'Q',ok:true});
}});
assert.equal(hero.phase,'victory');
const camp=runHeroStrategy({camp:true,onFrame(state,events){if(state.enemies.some(enemy=>enemy.campId))save('hero-camp',state,events);}});
assert.equal(camp.phase,'victory');
// An explicit stress scenario exercises the death row; it is not a balance run.
const stress=createGame({mode:'hero',initialDelay:1000,waveSize:()=>18,enemyHealthScale:100});stress.start();stress.launchWave();
for(let i=0;i<1200&&stress.state.phase==='playing';i++){
 stress.tick(.05);const events=stress.drainEvents();
 if(!stress.state.hero.alive){save('hero-death-stress',stress.state,events);break;}
}
assert.ok(frames.has('hero-death-stress'));
const legion=playLegionMatch(42,{workers:true,onFrame(state,events){
 if(state.wave>=4&&state.sides.player.invaders.length>=6&&events.some(event=>event.type==='attack')){
  save('legion-player',{...state,viewSide:'player'},events);save('legion-scout',{...state,viewSide:'ai'},events);
 }
 if(state.wave>=8&&state.turnPhase==='planning')save('legion-formation',{...state,viewSide:'player'},events);
 if(events.some(event=>event.type==='unit-death'&&event.side==='player'))save('legion-unit-death',{...state,viewSide:'player'},events);
}});
assert.equal(legion.outcome,'victory');
const directions=['E','SE','S','SW','W','NW','N','NE'];
for(const frame of frames.values()){
 const state=projectBattleState(frame.state);
 for(const entity of [...state.towers,...state.enemies]){
  const unit=artwork.units.get(entity.assetCode||entity.code);if(!unit)continue;
  const direction=directions[((Math.round((entity.angle||0)/(Math.PI/4))%8)+8)%8];
  if(!unit.images.has(direction))unit.images.set(direction,await loadImage(new URL(`outputs/${unit.directions[direction]}`,root)));
 }
}
const canvas=createCanvas(1280,800),renderer=createRenderer(canvas,artwork),summary={};
for(const [name,frame]of frames){
 renderer.reset();for(const event of frame.events)renderer.event(event);
 const effectTime=name==='legion-unit-death'?.2:0;
 renderer.draw(frame.state,null,frame.placement,effectTime);
 await writeFile(new URL(`${name}.png`,out),canvas.toBuffer('image/png'));
 const state=projectBattleState(frame.state);
 summary[name]={mode:state.mode,wave:state.wave,phase:state.phase,turnPhase:state.turnPhase,elapsed:state.elapsed,towers:state.towers.length,enemies:state.enemies.length,coreHealth:state.coreHealth,events:frame.events.map(event=>event.type),placement:frame.placement,effectTime,...(name==='hero-death-stress'?{scenario:{waveSize:18,enemyHealthScale:100,initialDelay:1000}}:{})};
}
assert.ok(frames.has('gem-combat')&&frames.has('hero-Q')&&frames.has('hero-E')&&frames.has('hero-R')&&frames.has('legion-player')&&frames.has('legion-scout'));
await writeFile(new URL('frames.json',out),JSON.stringify({loaded,frames:summary},null,2)+'\n');
await writeFile(new URL('playthroughs.json',out),JSON.stringify({gem,recipes,hero,camp,legion:{...legion,game:undefined}},null,2)+'\n');
console.log(JSON.stringify({loaded,frames:[...frames.keys()],gem:gem.phase,hero:hero.phase,camp:camp.phase,legion:legion.outcome},null,2));
