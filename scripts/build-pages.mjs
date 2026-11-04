// Only runtime files enter the public Pages artifact. Originals stay byte-identical.
import {mkdir,readdir,readFile,copyFile,writeFile,rm,lstat} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),destination=resolve(root,'_site');
const files=new Set(['game/index.html','game/styles.css','game/mobile.css','outputs/manifest.json']);
for(const file of await readdir(resolve(root,'game')))if(file.endsWith('.js'))files.add(`game/${file}`);
for(const map of ['v5','core-defense','escort','maze','gem','hero','legion'])files.add(`game/assets/maps/${map}/scene.webp`);
for(const file of ['hero/atlas.png','gem/atlas.png','shared/objectives.png'])files.add(`game/assets/modes/${file}`);
const manifest=JSON.parse(await readFile(resolve(root,'outputs/manifest.json'),'utf8'));
for(const unit of manifest.units)for(const path of [unit.master,...Object.values(unit.directions)])files.add(`outputs/${path}`);
for(const effect of manifest.effects)files.add(`outputs/${effect.path}`);
for(const file of ['P01-tech-supply-crate.png','P02-portable-generator.png','P04-broken-stone-stele.png'])files.add(`outputs/props/${file}`);
const baseline=JSON.parse(await readFile(resolve(root,'game/assets/original-assets.sha256.json'),'utf8'));
await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
let size=0;
for(const file of files){
 const source=resolve(root,file),target=resolve(destination,file);
 assert(!relative(root,source).startsWith('..')&&!relative(destination,target).startsWith('..'),'Asset path escapes project');
 assert((await lstat(source)).isFile(),`Missing runtime file: ${file}`);
 const bytes=await readFile(source);size+=bytes.length;
 if(file.startsWith('outputs/'))assert.equal(createHash('sha256').update(bytes).digest('hex'),baseline[file],`Original asset changed: ${file}`);
 await mkdir(dirname(target),{recursive:true});await copyFile(source,target);
}
// Relative redirect works at /wtf-td/ as well as a custom-domain root, preserving mobile links.
await writeFile(resolve(destination,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>环界</title><script>location.replace("./game/"+location.search+location.hash)</script><a href="./game/">进入环界</a></html>\n');
await writeFile(resolve(destination,'.nojekyll'),'');
console.log(`GitHub Pages: ${files.size} runtime files, ${(size/1024/1024).toFixed(1)} MiB → _site/`);
