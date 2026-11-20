const pinch = (a,b) => ({
  x:(a.x+b.x)/2, y:(a.y+b.y)/2,
  distance:Math.hypot(b.x-a.x,b.y-a.y), angle:Math.atan2(b.y-a.y,b.x-a.x)
});

export function bindBattleCamera(canvas, camera, {onTap, onClear, onEdgePan, onPitch, panel}) {
  const lifetime = new AbortController();
  const capture = {capture:true, signal:lifetime.signal};
  const touches = new Map();
  let touchMoved = false, drag = null, suppressTapUntil = 0, suppressOrbitClick = false;
  let mousePoint = null, sideKey = null;

  const position = event => {
    const rect = canvas.getBoundingClientRect();
    camera.resize(rect.width, rect.height);
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  };
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const zoom = factor => { camera.zoomBy(factor); onPitch(camera.pitch); };
  function reset(fit = false) {
    touches.clear(); drag = null; mousePoint = null; sideKey = null;
    camera.reset(fit); onPitch(camera.pitch);
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button === 0) suppressOrbitClick = false;
    if (event.pointerType === 'touch') {
      consume(event);
      mousePoint = null;
      document.documentElement.classList.add('touch-layout');
      if (!touches.size) touchMoved = false;
      touches.set(event.pointerId, position(event));
      if (touches.size > 1) touchMoved = true;
    } else if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      consume(event);
      drag = {...position(event), id:event.pointerId, button:event.button};
      mousePoint = null;
      suppressOrbitClick = event.button === 0;
    } else {
      return;
    }
    onClear();
    canvas.setPointerCapture(event.pointerId);
  }, capture);

  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') {
      consume(event);
      const previous = touches.get(event.pointerId);
      if (!previous) return;
      const next = position(event);
      const before = [...touches.values()];
      if (before.length === 1 && !touchMoved && Math.hypot(next.x-previous.x,next.y-previous.y) < 7) return;
      touchMoved = true;
      touches.set(event.pointerId, next);
      if (before.length === 1) camera.pan(previous.x,previous.y,next.x,next.y);
      if (before.length === 2) {
        const [first, second] = touches.values();
        const a = pinch(before[0],before[1]), b = pinch(first,second);
        camera.pan(a.x,a.y,b.x,b.y);
        if (a.distance > 8 && b.distance > 8) {
          camera.zoomBy(b.distance/a.distance,b.x,b.y);
          const angle = b.angle-a.angle;
          camera.orbit(Math.atan2(Math.sin(angle),Math.cos(angle))*180/Math.PI,0);
          onPitch(camera.pitch);
        }
      }
    } else if (drag?.id === event.pointerId) {
      consume(event);
      const next = position(event);
      if (drag.button === 0 || event.shiftKey) {
        camera.orbit((drag.x-next.x)*.45,(next.y-drag.y)*.32);
        onPitch(camera.pitch);
      } else {
        camera.pan(drag.x,drag.y,next.x,next.y);
      }
      drag = {...drag,...next};
    } else if (event.pointerType === 'mouse') {
      mousePoint = {clientX:event.clientX,clientY:event.clientY};
    }
  }, capture);
  canvas.addEventListener('pointerleave',()=>{mousePoint=null;},capture);

  function finish(event) {
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      consume(event);
      const previous = touches.get(event.pointerId), next = position(event);
      touches.delete(event.pointerId);
      suppressTapUntil = performance.now()+550;
      if (event.type === 'pointerup' && !touchMoved && Math.hypot(next.x-previous.x,next.y-previous.y) < 7) {
        canvas.focus({preventScroll:true});
        onTap(event);
      } else {
        onClear();
      }
    } else if (drag?.id === event.pointerId && (event.type !== 'pointerup' || event.button === drag.button)) {
      consume(event);
      drag = null;
      onClear();
    }
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,finish,capture);
  canvas.addEventListener('click', event => {
    if (suppressOrbitClick) { suppressOrbitClick = false; consume(event); return; }
    if (event.pointerType === 'touch' || (event.sourceCapabilities?.firesTouchEvents && performance.now() < suppressTapUntil)) consume(event);
  },capture);
  canvas.addEventListener('auxclick', event => { if (event.button === 1) consume(event); },capture);
  canvas.addEventListener('wheel', event => {
    consume(event);
    position(event);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = Math.max(-180,Math.min(180,event.deltaY*scale));
    onClear();
    zoom(Math.exp(-delta*.003));
  }, {...capture,passive:false});

  canvas.addEventListener('keydown',event=>{
    if (event.code === 'PageUp' || event.code === 'PageDown') {
      consume(event);
      onClear();
      zoom(event.code === 'PageUp' ? 1.18 : 1/1.18);
    } else if (event.code === 'Insert' || event.code === 'Delete') {
      consume(event);
      if (event.repeat) return;
      sideKey = event.code;
      onClear();
      camera.lookAside(event.code === 'Insert' ? -90 : 90);
    }
  },capture);
  window.addEventListener('keyup',event=>{
    if (event.code !== sideKey) return;
    consume(event);
    sideKey = null;
    onClear();
    camera.lookAside(0);
  },capture);

  panel.addEventListener('click', event => {
    const button = event.target.closest('button[data-camera]');
    if (!button) return;
    onClear();
    switch (button.dataset.camera) {
      case 'reset': reset(); return;
      case 'overview': reset(true); return;
      case 'zoom-in': zoom(1.18); return;
      case 'zoom-out': zoom(1/1.18); return;
      case 'left': camera.orbit(-30,0); break;
      case 'right': camera.orbit(30,0); break;
      case 'higher': camera.orbit(0,5); break;
      case 'lower': camera.orbit(0,-5); break;
    }
    onPitch(camera.pitch);
  }, {signal:lifetime.signal});
  window.addEventListener('blur', () => {
    touches.clear(); drag=null; mousePoint=null; sideKey=null;
    camera.lookAside(0); onClear();
  }, {signal:lifetime.signal});

  return {
    reset, dispose:()=>lifetime.abort(),
    edgeScroll({left,top,width,height},dt) {
      if (!mousePoint || drag || touches.size || dt<=0) return;
      const x = mousePoint.clientX-left, y = mousePoint.clientY-top;
      if (x<0 || y<0 || x>width || y>height) return;
      const edge = 17;
      const speed = (at,limit)=>at<edge ? at/edge-1 : at>limit-edge ? 1-(limit-at)/edge : 0;
      const dx = speed(x,width), dy = speed(y,height);
      if (!dx && !dy) return;
      const step = Math.min(width,height)*.86*dt;
      camera.pan(width/2,height/2,width/2-dx*step,height/2-dy*step);
      onEdgePan?.(mousePoint);
    }
  };
}
