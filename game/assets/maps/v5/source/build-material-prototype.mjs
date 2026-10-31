// Archived material study, not the runtime scene.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {WORLD,ROAD_PATH,ROAD_WIDTH,WAYPOINTS} from '../../../../geometry.js';
const require=createRequire(import.meta.url);
const sharp=require('/Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const lane=(color,width,extra='')=>`<path d="${ROAD_PATH}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const pins=WAYPOINTS.map(({x,y})=>`<g transform="translate(${x} ${y})"><circle r="7" fill="#526556" fill-opacity=".6" stroke="#9f9676" stroke-width="1"/><path d="M-4 0h8M0-4v8" stroke="#aec4a7" stroke-width="1.2" opacity=".6"/></g>`).join('');
const locks=Array.from({length:8},(_,i)=>`<g transform="translate(640 400) scale(1 .72) rotate(${i*45})"><path d="M-5-53h10v12H-5Z" fill="#687a68" stroke="#a09470" stroke-width="1.2"/><path d="M-2-49h4v5h-4Z" fill="#a8b99c" opacity=".65"/></g>`).join('');
const etch=Array.from({length:8},(_,i)=>`<g transform="translate(640 400) scale(1 .72) rotate(${i*45})"><path d="M-8-38h16m-14 4h4m4 0h4" stroke="#a8b59a" stroke-width="1.5" opacity=".58"/></g>`).join('');
// The same full-canvas stone painting crosses both sides of every lane edge.
// Relative href stays editable; only the render buffer embeds the source image.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${WORLD.width}" height="${WORLD.height}" viewBox="0 0 1280 800">
<defs>
 <mask id="lanes" maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="800">${lane('white',ROAD_WIDTH)}<ellipse cx="640" cy="400" rx="72" ry="52" fill="white"/></mask>
 <filter id="worn-stone" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".7"/><feComponentTransfer><feFuncR type="linear" slope=".76" intercept=".016"/><feFuncG type="linear" slope=".79" intercept=".018"/><feFuncB type="linear" slope=".72" intercept=".016"/></feComponentTransfer></filter>
 <radialGradient id="gate"><stop offset="0" stop-color="#a3c2ab" stop-opacity=".48"/><stop offset=".65" stop-color="#7d9e8a" stop-opacity=".24"/><stop offset="1" stop-color="#526f60" stop-opacity="0"/></radialGradient>
</defs>
${lane('#263c31',58,'stroke-opacity=".24"')}${lane('#b0aa87',52,'stroke-opacity=".42"')}
<image href="./floor-base-imagegen.png" x="0" y="0" width="1280" height="800" preserveAspectRatio="none" filter="url(#worn-stone)" mask="url(#lanes)"/>
${lane('#a79a72',1.6,'stroke-opacity=".53"')}
${lane('#bcc8a8',.8,'stroke-dasharray="2 26" stroke-opacity=".28"')}
${pins}
<g fill="none"><ellipse cx="640" cy="400" rx="69" ry="49" stroke="#b7b08d" stroke-width="1.3" opacity=".65"/><ellipse cx="640" cy="400" rx="61" ry="44" stroke="#344f40" stroke-width="3" opacity=".55"/><ellipse cx="640" cy="400" rx="57" ry="41" stroke="#a2946e" stroke-width="2" opacity=".8"/>
<path d="M572 400h26M682 400h26M640 350v17M640 433v17" stroke="#a99a70" stroke-width="3" opacity=".75"/>
<ellipse cx="640" cy="400" rx="39" ry="28" stroke="#b5c0a1" stroke-width="1" opacity=".46"/>
</g>${locks}${etch}
<ellipse cx="640" cy="400" rx="31" ry="22" fill="url(#gate)"/>
<path d="M640 383c-21 0-26 23-7 29 16 5 30-6 22-16-5-7-18-6-20 1-2 6 5 10 11 7" fill="none" stroke="#b3c7ad" stroke-width="2.2" stroke-linecap="round" opacity=".66"/>
</svg>`;
await writeFile(new URL('./material-prototype-road.svg',import.meta.url),svg);
const source=await readFile(new URL('./floor-base-imagegen.png',import.meta.url));
const render=svg.replace('./floor-base-imagegen.png',`data:image/png;base64,${source.toString('base64')}`);
await sharp(Buffer.from(render)).png().toFile(new URL('./material-prototype-road.png',import.meta.url).pathname);
console.log('Built v5 same-source stone lanes and embedded jade-bronze core.');
