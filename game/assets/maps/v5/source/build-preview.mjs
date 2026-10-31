// Offline resource composition, not a browser screenshot or acceptance result.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WORLD,ROAD_PATH,placementStatus} from '../../../../geometry.js';
const require=createRequire(import.meta.url);
const sharp=require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const asset=file=>fileURLToPath(new URL(`../${file}`,import.meta.url));
const root=new URL('../../../../../',import.meta.url);
const scene=await sharp(asset('scene.png')).resize(WORLD.width,WORLD.height).png().toBuffer();
const wash=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="1280" height="800" fill="#758067" opacity="${31/255}"/></svg>`;
const map=await sharp(scene).composite([{input:Buffer.from(wash)}]).png().toBuffer();
await writeFile(asset('preview.png'),map);
const manifest=JSON.parse(await readFile(new URL('outputs/manifest.json',root),'utf8'));
// Actual world positions and the same draw sizes/anchor as render.js.
const actors=[
 {code:'T01',x:500,y:300,angle:'SE',tower:true},
 {code:'T06',x:780,y:300,angle:'SW',tower:true},
 {code:'T03',x:500,y:500,angle:'NE',tower:true},
 {code:'T05',x:780,y:500,angle:'NW',tower:true},
 {code:'X01',x:640,y:290,angle:'N'},
 {code:'X02',x:860,y:400,angle:'E'},
 {code:'X03',x:640,y:555,angle:'S'},
 {code:'X05',x:350,y:400,angle:'W'},
 {code:'X10',x:980,y:520,angle:'S'},
];
const shadows=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">${actors.map(actor=>`<ellipse cx="${actor.x}" cy="${actor.y+3}" rx="${actor.tower?31:19}" ry="${actor.tower?11:8}" fill="#18271b" opacity="${actor.tower?61/255:102/255}"/>`).join('')}</svg>`;
const overlays=[{input:Buffer.from(shadows)}];
for(const actor of actors.sort((a,b)=>a.y-b.y)){
 if(actor.tower&&!placementStatus(actor.x,actor.y).ok)throw new Error(`Invalid preview tower: ${actor.code}`);
 const unit=manifest.units.find(unit=>unit.code===actor.code);
 const size=actor.tower?128:126;
 const image=await sharp(fileURLToPath(new URL(`outputs/${unit.directions[actor.angle]}`,root))).resize(size,size).toBuffer();
 overlays.push({input:image,left:Math.round(actor.x-size*.5),top:Math.round(actor.y-size*.625)});
}
await sharp(map).composite(overlays).png().toFile(asset('battle-preview.png'));
const line=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><path d="${ROAD_PATH}" fill="none" stroke="#d53b52" stroke-width="1.5" opacity=".8" stroke-dasharray="4 3"/></svg>`;
await writeFile(new URL('./route-inspection.svg',import.meta.url),line);
await sharp(map).composite([{input:Buffer.from(line)}]).png().toFile(fileURLToPath(new URL('./route-inspection.png',import.meta.url)));
console.log('Created v5 whole-scene and original-sprite resource compositions, plus route inspection.');
