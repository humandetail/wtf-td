// Touch gestures change the camera and call the same public commands as desktop.
import {WORLD} from './geometry.js';
export function createTouchControls(canvas, callbacks) {
 const byId=id=>document.getElementById(id);
 const zoomButton=byId('map-zoom-button'),panButton=byId('map-pan-button'),confirm=/** @type {HTMLButtonElement} */(byId('touch-confirm-button')),cancel=byId('touch-cancel-button');
 let zoom=1,pan=false,offset={x:0,y:0},gesture=null,point=null,suppressUntil=0;
 function camera(){
  if(callbacks.use3D?.())return;
  const width=canvas.offsetWidth,height=canvas.offsetHeight;
  offset.x=Math.max(-width*(zoom-1)/2,Math.min(width*(zoom-1)/2,offset.x));
  offset.y=Math.max(-height*(zoom-1)/2,Math.min(height*(zoom-1)/2,offset.y));
  canvas.style.transform=`translate(${offset.x}px,${offset.y}px) scale(${zoom})`;
  zoomButton.textContent=`${zoom}×`;zoomButton.setAttribute('aria-label',`地图缩放 ${zoom}倍，点击切换`);
  panButton.setAttribute('aria-pressed',String(pan));panButton.textContent=pan?'返回点选':'拖动地图';
 }
 function world(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*WORLD.width,y:(event.clientY-r.top)/r.height*WORLD.height};}
 function clear(){point=null;byId('touch-actions').hidden=true;}
 function tap(target){
  if(!target||!callbacks.canInteract()){clear();return;}
  point=target;
  if(callbacks.hasAction()){
   const status=callbacks.onPreview(point);byId('touch-actions').hidden=false;
   confirm.disabled=!status.ok;byId('touch-action-status').textContent=status.message||'确认目标';
  }else {callbacks.onActivate(point);clear();}
 }
 zoomButton.addEventListener('click',()=>{zoom=zoom===1?1.5:zoom===1.5?2:1;offset={x:0,y:0};pan=zoom>1;clear();camera();});
 panButton.addEventListener('click',()=>{pan=!pan;clear();camera();});
 byId('map-reset-button').addEventListener('click',()=>{zoom=1;pan=false;offset={x:0,y:0};clear();camera();});
 canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'||callbacks.use3D?.())return;
  document.documentElement.classList.add('touch-layout');
  event.preventDefault();event.stopImmediatePropagation();suppressUntil=performance.now()+800;
  if(gesture){gesture=null;clear();return;}
  clear();
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,start:{...offset},moved:false};canvas.setPointerCapture(event.pointerId);
 },true);
 canvas.addEventListener('pointermove',event=>{
  if(event.pointerType!=='touch'||callbacks.use3D?.())return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture.moved ||= Math.hypot(dx,dy)>10;
  if(pan){offset={x:gesture.start.x+dx,y:gesture.start.y+dy};camera();}
  else if(gesture.moved&&callbacks.canInteract()&&callbacks.hasAction())callbacks.onPreview(world(event));
 },true);
 canvas.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch'||callbacks.use3D?.())return;
  event.preventDefault();event.stopImmediatePropagation();suppressUntil=performance.now()+800;
  if(!gesture||event.pointerId!==gesture.id)return;
  const moved=gesture.moved;gesture=null;
  if(pan||!callbacks.canInteract()||(moved&&!callbacks.hasAction()))return;
  canvas.focus({preventScroll:true});tap(world(event));
 },true);
 canvas.addEventListener('pointercancel',()=>{gesture=null;clear();});
 canvas.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 confirm.addEventListener('click',()=>{if(point&&callbacks.canInteract()&&callbacks.hasAction())callbacks.onActivate(point);clear();});
 cancel.addEventListener('click',()=>{callbacks.onCancel();clear();});
 window.addEventListener('blur',clear);
 window.addEventListener('resize',()=>{offset={x:0,y:0};camera();});
 camera();
 return {clear,tap,reset(){clear();gesture=null;zoom=1;pan=false;offset={x:0,y:0};camera();}};
}
