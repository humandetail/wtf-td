// Offline resource composition, not a browser screenshot or acceptance result.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WORLD,ENTRY,placementStatus} from '../../../../geometry.js';
const require=createRequire(import.meta.url);
const sharp=require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const asset=file=>fileURLToPath(new URL(`../${file}`,import.meta.url));
const root=new URL('../../../../../',import.meta.url);
const ground=await sharp(asset('ground.png')).resize(WORLD.width,WORLD.height).toBuffer();
const map=await sharp(ground).composite([{input:asset('road.png')}]).png().toBuffer();
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
const glyphs=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><g fill="none" stroke="#f7d397" stroke-width="2"><ellipse cx="${ENTRY.x}" cy="${ENTRY.y}" rx="44" ry="24"/>${[0,90,180,270].map(a=>`<path d="M43-6L52 0 43 6" transform="translate(640 400) rotate(${a})"/>`).join('')}</g></svg>`;
const overlays=[{input:Buffer.from(glyphs)}];
for(const actor of actors.sort((a,b)=>a.y-b.y)){
 if(actor.tower&&!placementStatus(actor.x,actor.y).ok)throw new Error(`Invalid preview tower: ${actor.code}`);
 const unit=manifest.units.find(unit=>unit.code===actor.code);
 const size=actor.tower?128:126;
 const image=await sharp(fileURLToPath(new URL(`outputs/${unit.directions[actor.angle]}`,root))).resize(size,size).toBuffer();
 overlays.push({input:image,left:Math.round(actor.x-size*.5),top:Math.round(actor.y-size*.625)});
}
await sharp(map).composite(overlays).png().toFile(asset('battle-preview.png'));
console.log('Created v4 map and original-sprite resource compositions.');
