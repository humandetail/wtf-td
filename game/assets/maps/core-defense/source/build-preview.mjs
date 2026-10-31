// Offline asset composition, not a browser screenshot or human acceptance.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WORLD} from '../../../../geometry.js';
import {DEFENSE_ROAD_PATH,defensePlacementStatus} from '../../../../defense-geometry.js';
const sharp=createRequire(import.meta.url)('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const asset=file=>fileURLToPath(new URL(`../${file}`,import.meta.url));
const root=new URL('../../../../../',import.meta.url);
const scene=await sharp(asset('scene.png')).resize(WORLD.width,WORLD.height).png().toBuffer();
const wash=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#758067" opacity="${31/255}"/></svg>`;
const map=await sharp(scene).composite([{input:Buffer.from(wash)}]).png().toBuffer();
await writeFile(asset('preview.png'),map);
const manifest=JSON.parse(await readFile(new URL('outputs/manifest.json',root),'utf8'));
// Four legal freely placed towers; this wave arrives only from the north.
const actors=[
 {code:'T06',x:500,y:280,angle:'NE',tower:true},
 {code:'T06',x:780,y:450,angle:'NW',tower:true},
 {code:'T01',x:500,y:450,angle:'NE',tower:true},
 {code:'T03',x:780,y:280,angle:'SW',tower:true},
 {code:'X01',x:480,y:110,angle:'S'},
 {code:'X02',x:480,y:190,angle:'S'},
 {code:'X03',x:570,y:200,angle:'E'},
 {code:'X12',x:640,y:286,angle:'S',boss:true},
];
const shadows=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">${actors.map(a=>`<ellipse cx="${a.x}" cy="${a.y+3}" rx="${a.tower||a.boss?31:19}" ry="${a.tower?11:a.boss?9:8}" fill="#18271b" opacity="${a.tower?61/255:102/255}"/>`).join('')}</svg>`;
const overlays=[{input:Buffer.from(shadows)}];
for(const actor of actors.sort((a,b)=>a.y-b.y)){
 if(actor.tower&&!defensePlacementStatus(actor.x,actor.y).ok)throw Error(`Invalid preview tower ${actor.code}`);
 const unit=manifest.units.find(unit=>unit.code===actor.code),size=actor.tower?128:actor.boss?184:126;
 const image=await sharp(fileURLToPath(new URL(`outputs/${unit.directions[actor.angle]}`,root))).resize(size,size).toBuffer();
 overlays.push({input:image,left:Math.round(actor.x-size*.5),top:Math.round(actor.y-size*.625)});
}
await sharp(map).composite(overlays).png().toFile(asset('battle-preview.png'));
const line=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><path d="${DEFENSE_ROAD_PATH}" fill="none" stroke="#d53b52" stroke-width="1.5" opacity=".8" stroke-dasharray="4 3"/></svg>`;
await writeFile(new URL('./route-inspection.svg',import.meta.url),line);
await sharp(map).composite([{input:Buffer.from(line)}]).png().toFile(fileURLToPath(new URL('./route-inspection.png',import.meta.url)));
console.log('Created core-defense asset compositions and final route inspection.');
