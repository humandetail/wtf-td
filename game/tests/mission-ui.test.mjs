import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
test('actual mission controls preserve four sessions, freeze progress and reopen terminal reports',async()=>{
const base=fileURLToPath(new URL('../',import.meta.url));
const imports=Object.assign({}, ...await Promise.all(['engine','catalog','research','geometry','defense-geometry','modes'].map(name=>import(pathToFileURL(base+name+'.js')))));
const html=fs.readFileSync(base+'index.html','utf8');
const nodes=new Map();
class Element {
 constructor(id=''){this.id=id;this.hidden=true;this.attrs={};this.events={};this.style={};this.dataset={};this.classList={toggle(){}};this.isConnected=true;this.tagName='BUTTON';this.textContent='';}
 setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
 addEventListener(k,fn){this.events[k]=fn;} querySelectorAll(){return [];} contains(){return false;} closest(){return null;}
 focus(){document.activeElement=this;} replaceChildren(){} click(){this.events.click?.({target:this});}
}
for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,new Element(id));
const document={getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},activeElement:null,addEventListener(){},createElement:()=>new Element()};
const context=vm.createContext({...imports,document,console,performance,createAudio:()=>({unlock:async()=>{},play(){},muted:false}),loadArtwork(){},createRenderer(){},ResizeObserver:class{},requestAnimationFrame(){}});
let source=fs.readFileSync(base+'main.js','utf8').replace(/^import .*;\n/gm,'').replace('void boot();','');
source+='\nrenderer={reset(){},event(){}}; globalThis.test={sessions,get game(){return game},get view(){return view},bindControls,updateUI,showEnd,returnToMenu};';
vm.runInContext(source,context);
const {test}=context; test.bindControls();
const node=id=>nodes.get(id),click=id=>node(id).click();
const go=mode=>{test.returnToMenu();click('mode-'+mode+'-button');click('start-button');};
assert.equal(test.game,test.sessions.loop);click('start-button');test.game.state.gold=417;
go('defense');test.game.state.gold=418;
go('harvest');assert.equal(test.game.state.gold,400);test.game.state.gold=419;
click('mission-button');assert.equal(node('mission-panel').hidden,false);assert.equal(node('research-panel').hidden,true);
click('harvest-site-0');assert.equal(test.game.state.harvest.site,0);test.game.tick(1);test.updateUI();assert.ok(node('harvest-progress').value>0);
click('pause-button');const remaining=test.game.state.harvest.remaining;test.game.tick(3);assert.equal(test.game.state.harvest.remaining,remaining);test.updateUI();assert.match(node('harvest-status').textContent,/冻结/);
click('harvest-site-1');assert.equal(test.game.state.harvest.site,1);click('stop-harvest-button');assert.equal(test.game.state.harvest,null);
assert.equal(node('evacuate-button').disabled,true);test.game.state.harvested=240;test.updateUI();assert.equal(node('evacuate-button').disabled,false);click('evacuate-button');assert.equal(test.game.state.extractionRemaining,20);assert.equal(node('harvest-site-0').disabled,true);
test.returnToMenu();const extraction=test.game.state.extractionRemaining;test.game.tick(3);assert.equal(test.game.state.extractionRemaining,extraction);
click('mode-storm-button');click('start-button');test.game.state.gold=420;click('mission-button');assert.equal(node('storm-mission').hidden,false);assert.equal(node('pulse-button').disabled,true);
test.game.launchWave();test.game.tick(1);test.updateUI();assert.ok(test.game.state.enemies.length);assert.equal(node('pulse-button').disabled,false);click('pulse-button');assert.equal(test.game.state.pulseRemaining,30);assert.equal(node('pulse-button').disabled,true);click('pause-button');test.game.tick(3);assert.equal(test.game.state.pulseRemaining,30);
for(const [mode,gold] of [['loop',417],['defense',418],['harvest',419],['storm',420]]){go(mode);assert.equal(test.game.state.gold,gold);}
for(const mode of ['loop','defense','harvest','storm']){
 go(mode);test.game.state.phase='victory';test.showEnd();assert.equal(test.view,'end');assert.equal(node('endless-button').hidden,mode==='harvest');
 test.returnToMenu();click('mode-'+(mode==='loop'?'defense':'loop')+'-button');click('mode-'+mode+'-button');assert.match(node('start-button').textContent,/查看战报/);click('start-button');assert.equal(test.view,'end');
 if(mode!=='harvest'){click('endless-button');assert.equal(test.view,'game');assert.equal(test.game.state.endless,true);}
 else {assert.equal(test.game.continueEndless().ok,false);click('restart-button');assert.equal(test.game.state.harvested,0);assert.equal(test.game.state.harvest,null);assert.equal(test.game.state.gold,400);}
}
});
