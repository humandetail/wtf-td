// Touch gestures change the camera and call the same public commands as desktop.
import {WORLD} from './geometry.js';
export function createTouchControls(canvas, callbacks) {
 const byId=id=>document.getElementById(id);
 const zoomButton=byId('map-zoom-button'),panButton=byId('map-pan-button'),confirm=/** @type {HTMLButtonElement} */(byId('touch-confirm-button')),cancel=byId('touch-cancel-button'),pad=byId('hero-move-pad');
 let zoom=1,pan=false,offset={x:0,y:0},gesture=null,point=null,suppressUntil=0,padId=null;
 function camera(){
  const width=canvas.offsetWidth,height=canvas.offsetHeight;
  offset.x=Math.max(-width*(zoom-1)/2,Math.min(width*(zoom-1)/2,offset.x));
  offset.y=Math.max(-height*(zoom-1)/2,Math.min(height*(zoom-1)/2,offset.y));
  canvas.style.transform=`translate(${offset.x}px,${offset.y}px) scale(${zoom})`;
  zoomButton.textContent=`${zoom}×`;zoomButton.setAttribute('aria-label',`地图缩放 ${zoom}倍，点击切换`);
  panButton.setAttribute('aria-pressed',String(pan));panButton.textContent=pan?'返回点选':'拖动地图';
 }
 function world(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*WORLD.width,y:(event.clientY-r.top)/r.height*WORLD.height};}
 function clear(){point=null;byId('touch-actions').hidden=true;}
 function stop(){padId=null;pad.style.setProperty('--stick-x','0px');pad.style.setProperty('--stick-y','0px');callbacks.onMove(0,0);}
 zoomButton.addEventListener('click',()=>{zoom=zoom===1?1.5:zoom===1.5?2:1;offset={x:0,y:0};pan=zoom>1;clear();camera();});
 panButton.addEventListener('click',()=>{pan=!pan;clear();camera();});
 byId('map-reset-button').addEventListener('click',()=>{zoom=1;pan=false;offset={x:0,y:0};clear();camera();});
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;
  document.documentElement.classList.add('touch-layout');
  event.preventDefault();event.stopImmediatePropagation();suppressUntil=performance.now()+800;
  if(gesture){gesture=null;clear();return;}
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,start:{...offset},moved:false};canvas.setPointerCapture(event.pointerId);
 },true);
 canvas.addEventListener('pointermove',event=>{
  if(event.pointerType!=='touch')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture.moved ||= Math.hypot(dx,dy)>10;
  if(pan){offset={x:gesture.start.x+dx,y:gesture.start.y+dy};camera();}
 },true);
 canvas.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch')return;
  event.preventDefault();event.stopImmediatePropagation();suppressUntil=performance.now()+800;
  if(!gesture||event.pointerId!==gesture.id)return;
  const moved=gesture.moved;gesture=null;
  if(pan||moved||!callbacks.canInteract())return;
  canvas.focus({preventScroll:true});point=world(event);
  if(callbacks.hasAction()){
   const status=callbacks.onPreview(point);byId('touch-actions').hidden=false;
   confirm.disabled=!status.ok;byId('touch-action-status').textContent=status.message||'确认目标';
  }else {callbacks.onActivate(point);clear();}
 },true);
 canvas.addEventListener('pointercancel',()=>{gesture=null;clear();});
 canvas.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 confirm.addEventListener('click',()=>{if(point&&callbacks.canInteract()&&callbacks.hasAction())callbacks.onActivate(point);clear();});
 cancel.addEventListener('click',()=>{callbacks.onCancel();clear();});
 function move(event){
  if(event.pointerId!==padId)return;
  const r=pad.getBoundingClientRect(),dx=(event.clientX-r.left-r.width/2)/28,dy=(event.clientY-r.top-r.height/2)/28,n=Math.max(1,Math.hypot(dx,dy));
  pad.style.setProperty('--stick-x',`${dx/n*24}px`);pad.style.setProperty('--stick-y',`${dy/n*24}px`);
  if(callbacks.canInteract()&&callbacks.isHero())callbacks.onMove(dx/n,dy/n);else stop();
 }
 pad.addEventListener('pointerdown',event=>{event.preventDefault();if(!callbacks.canInteract())return;padId=event.pointerId;pad.setPointerCapture(event.pointerId);move(event);});
 pad.addEventListener('pointermove',move);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,event=>{if((/** @type {PointerEvent} */(event)).pointerId===padId)stop();});
 window.addEventListener('blur',()=>{stop();clear();});
 window.addEventListener('resize',()=>{offset={x:0,y:0};camera();});
 camera();
 return {stop,clear,reset(){stop();clear();zoom=1;pan=false;offset={x:0,y:0};camera();}};
}
