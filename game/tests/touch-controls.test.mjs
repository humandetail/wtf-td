import test from 'node:test';
import assert from 'node:assert/strict';
import {createTouchControls} from '../touch-controls.js';
import {createLoopGame} from '../loop-session.js';
function harness(){
 class Node {
  constructor(){this.hidden=true;this.events={};this.style={setProperty(k,v){this[k]=v;}};this.attrs={};this.offsetWidth=400;this.offsetHeight=250;}
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(k,v){this.attrs[k]=v;}setPointerCapture(){}focus(){}
  getBoundingClientRect(){const m=this.style.transform?.match(/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/);const z=m?Number(m[3]):1;return {left:200+(m?Number(m[1]):0)-200*z,top:125+(m?Number(m[2]):0)-125*z,width:400*z,height:250*z};}
  emit(name,data={}){this.events[name]?.({pointerType:'touch',pointerId:1,clientX:60,clientY:43.75,preventDefault(){},stopImmediatePropagation(){},...data});}
 }
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 globalThis.document={getElementById:get,documentElement:{classList:{add(){}}}};const windowEvents={};globalThis.window={addEventListener:(name,fn)=>windowEvents[name]=fn};
 const canvas=new Node();canvas.parentElement=new Node();// Pin funds so these tests measure touch transactions, independent of balance tuning.
 const game=createLoopGame({startingGold:400,draftRandom:()=>0});game.start();let action=true,activations=0;
 game.openStarter();game.draw('R');
 const controls=createTouchControls(canvas,{
  canInteract:()=>game.state.phase==='playing'&&!game.state.paused,
  hasAction:()=>action,
  onCancel:()=>{action=false;},onPreview:p=>game.canDeploy(game.state.cards[0].id,p.x,p.y),
  onActivate:p=>{activations++;game.deploy(game.state.cards[0].id,p.x,p.y);}
 });
 return {canvas,get,game,controls,windowEvents,get activations(){return activations;}};
}
test('touch only previews until confirmation; cancellation and dragging never spend gold',()=>{
 const h=harness();h.canvas.emit('pointerdown');h.canvas.emit('pointerup');
 assert.equal(h.game.state.gold,280);assert.equal(h.game.state.cards.length,2);assert.equal(h.get('touch-actions').hidden,false);assert.equal(h.get('touch-confirm-button').disabled,false);
 h.get('touch-confirm-button').emit('click');assert.equal(h.game.state.gold,280);assert.equal(h.game.state.cards.length,1);assert.equal(h.game.state.towers.length,1);assert.ok(Math.abs(h.game.state.towers[0].x-192)<1e-8);
 h.canvas.emit('pointerdown',{clientX:110});h.canvas.emit('pointermove',{clientX:160});h.canvas.emit('pointerup',{clientX:160});
 assert.equal(h.activations,1);
 assert.equal(h.get('touch-actions').hidden,false);assert.equal(h.get('touch-confirm-button').disabled,false);
 assert.equal(h.game.state.gold,280);assert.equal(h.game.state.cards.length,1);
 h.canvas.emit('pointerdown',{clientX:140});h.canvas.emit('pointerup',{clientX:140});h.get('touch-cancel-button').emit('click');h.get('touch-confirm-button').emit('click');assert.equal(h.activations,1);
});
test('zoom and camera drag preserve world mapping and suppress synthetic purchase clicks',()=>{
 const h=harness();h.get('map-zoom-button').emit('click');assert.match(h.canvas.style.transform,/scale\(1.5\)/);
 h.canvas.emit('pointerdown');h.canvas.emit('pointermove',{clientX:160,clientY:90});h.canvas.emit('pointerup',{clientX:160,clientY:90});assert.equal(h.activations,0);assert.match(h.canvas.style.transform,/translate\(100px,46.25px\)/);
 let prevented=false;h.canvas.emit('click',{preventDefault(){prevented=true;}});assert.equal(prevented,true);
 h.get('map-pan-button').emit('click');h.canvas.emit('pointerdown',{clientX:90,clientY:49.375});h.canvas.emit('pointerup',{clientX:90,clientY:49.375});h.get('touch-confirm-button').emit('click');
 assert.equal(h.game.state.gold,280);assert.equal(h.game.state.cards.length,1);assert.ok(Math.abs(h.game.state.towers[0].x-192)<1e-8);assert.ok(Math.abs(h.game.state.towers[0].y-140)<1e-8);
 h.get('map-reset-button').emit('click');assert.equal(h.canvas.style.transform,'translate(0px,0px) scale(1)');assert.equal(h.get('touch-actions').hidden,true);
});
test('multitouch cancellation and paused confirmation cannot place towers',()=>{
 const h=harness();h.canvas.emit('pointerdown');h.canvas.emit('pointerdown',{pointerId:2});h.canvas.emit('pointerup');assert.equal(h.get('touch-actions').hidden,true);
 h.canvas.emit('pointerdown');h.canvas.emit('pointerup');h.game.togglePause();h.get('touch-confirm-button').emit('click');assert.equal(h.activations,0);assert.equal(h.game.state.gold,280);assert.equal(h.game.state.cards.length,2);
});
