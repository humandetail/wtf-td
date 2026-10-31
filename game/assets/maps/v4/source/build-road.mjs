import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { WORLD, ROAD_WIDTH, ROAD_PATH, ROAD_SEGMENTS, PLAZA, WAYPOINTS } from '../../../../geometry.js';
const require = createRequire(import.meta.url);
const sharp = require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const path = (stroke, width, extra='') => `<path d="${ROAD_PATH}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const rect = `<rect x="${PLAZA.x}" y="${PLAZA.y}" width="${PLAZA.width}" height="${PLAZA.height}" rx="12"/>`;
const panels = ROAD_SEGMENTS.map(({x1,y1,x2,y2}, index) => {
  const horizontal = y1===y2, length=Math.abs(horizontal?x2-x1:y2-y1);
  const startX=Math.min(x1,x2), startY=Math.min(y1,y2);
  return Array.from({length:Math.ceil(length/74)},(_,i)=>{
    const x=horizontal?startX+i*74:startX-24, y=horizontal?startY-24:startY+i*74;
    const w=horizontal?72:48, h=horizontal?48:72;
    const jade=(i+index)%4===0 || (i+index)%7===2;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${jade?'#32494a':'#293b47'}"/><path d="M${x+4} ${y+4}h${w-8}v${h-8}" fill="none" stroke="${jade?'#53685e':'#405362'}" stroke-width="1" opacity=".7"/>${jade?`<path d="M${x+13} ${y+8}l7 9-5 8 9 9" fill="none" stroke="#737888" stroke-width="1" opacity=".55"/>`:''}`;
  }).join('');
}).join('');
const joints = ROAD_SEGMENTS.map(({x1,y1,x2,y2})=>{
 const horizontal=y1===y2, length=Math.abs(horizontal?x2-x1:y2-y1);
 return Array.from({length:Math.floor(length/74)},(_,i)=>{
  const x=horizontal?Math.min(x1,x2)+(i+1)*74:x1, y=horizontal?y1:Math.min(y1,y2)+(i+1)*74;
  return `<path d="${horizontal?`M${x} ${y-23}v46`:`M${x-23} ${y}h46`}" stroke="#142832" stroke-width="2"/><circle cx="${horizontal?x+5:x-17}" cy="${horizontal?y-17:y+5}" r="1.2" fill="#b18e65"/>`;
 }).join('');
}).join('');
const edgeLights = ROAD_SEGMENTS.map(({x1,y1,x2,y2})=>[-20,20].map(offset=>`<path d="M${x1+(x1===x2?offset:0)} ${y1+(y1===y2?offset:0)}L${x2+(x1===x2?offset:0)} ${y2+(y1===y2?offset:0)}" stroke="#70b8bb" stroke-width="1.2" stroke-dasharray="9 43" opacity=".68"/>`).join('')).join('');
const marks=WAYPOINTS.map(({x,y,color},i)=>`<g transform="translate(${x} ${y})"><circle r="12" fill="#182d36" stroke="#8c795c" stroke-width="1.5"/><path d="M0-8 7-4 7 4 0 8-7 4-7-4Z" fill="none" stroke="${color}" stroke-width="1.4"/><path d="M-4 0h8M0-4v8${i%2?'M-3-3 3 3':''}" stroke="${color}" stroke-width="1"/></g>`).join('');
const trigram=Array.from({length:8},(_,i)=>`<g transform="translate(640 400) rotate(${i*45}) translate(0 -34)">${[0,5,10].map((y,j)=>`<path d="${(i>>j)&1?`M-9 ${y}h6m6 0h6`:`M-9 ${y}h18`}" stroke="${i%2?'#88a49a':'#a38aa9'}" stroke-width="2"/>`).join('')}</g>`).join('');
const locks=Array.from({length:8},(_,i)=>`<g transform="translate(640 400) rotate(${i*45})"><path d="M-5-43v-7h10v7" fill="#536467" stroke="#b08c5c" stroke-width="1"/><path d="M-2-47h4" stroke="#68b7ba" stroke-width="2"/></g>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${WORLD.width}" height="${WORLD.height}" viewBox="0 0 ${WORLD.width} ${WORLD.height}"><defs><mask id="lane" maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="800">${path('white',ROAD_WIDTH)}</mask><clipPath id="hub">${rect}</clipPath><pattern id="grain" width="19" height="17" patternUnits="userSpaceOnUse"><path d="M2 4h5M11 13h4" stroke="#8faaa8" stroke-width=".6" opacity=".12"/></pattern></defs>
${path('#15262c',62)}${path('#59615b',58)}${path('#a2855b',54)}${path('#172f38',51)}${path('#293b47',48)}
<g mask="url(#lane)">${panels}${joints}<rect width="1280" height="800" fill="url(#grain)"/>${edgeLights}${path('#9984ab',2,'stroke-dasharray="2 138 9 13 2 71" stroke-opacity=".55"')}${marks}</g>
<g clip-path="url(#hub)">${rect.replace('/>',' fill="#273b43"/>')}<rect x="568" y="348" width="144" height="104" rx="10" fill="none" stroke="#a1845d" stroke-width="2"/><path d="M565 400h150M640 345v110" stroke="#475b60" stroke-width="20"/><path d="M565 389h150M565 411h150M629 345v110M651 345v110" stroke="#64868a" stroke-width="1" opacity=".5"/><circle cx="640" cy="400" r="50" fill="#1e333a" stroke="#152831" stroke-width="5"/><circle cx="640" cy="400" r="47" fill="none" stroke="#9a815f" stroke-width="2"/><circle cx="640" cy="400" r="41" fill="#304849" stroke="#58706c" stroke-width="1"/>${trigram}<circle cx="640" cy="400" r="19" fill="#263a42" stroke="#9e81ad" stroke-width="1.3"/><path d="M640 381c-18 0-18 19 0 19s18 19 0 19c25 0 25-38 0-38Z" fill="#667e77"/><circle cx="640" cy="390.5" r="2.7" fill="#c0acc5"/><circle cx="640" cy="409.5" r="2.7" fill="#20353f"/>${locks}<path d="M574 359h15m-15 0v11M706 359h-15m15 0v11M574 441h15m-15 0v-11M706 441h-15m15 0v-11" fill="none" stroke="#63b6b9" stroke-width="2"/></g></svg>`;
await writeFile(new URL('./road.svg',import.meta.url),svg);
await sharp(Buffer.from(svg)).png().toFile(new URL('../road.png',import.meta.url).pathname);
console.log(`Built ${WORLD.width}x${WORLD.height} road overlay from authoritative geometry.`);
