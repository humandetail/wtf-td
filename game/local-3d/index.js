import { createBattleCamera, pickActor } from './camera.js';
import { bindBattleCamera } from './input.js';
import { createScene } from './scene.js';
import { createBattleOverlay } from './overlay.js';
import { findLocalYoshino, loadYoshino, createYoshinoRenderer } from './boss.js';

function loadScript(name) {
  return new Promise((resolve,reject)=>{
    const script = document.createElement('script');
    script.src = new URL(`./vendor/${name}.js`,import.meta.url).href;
    script.onload = () => { script.remove(); resolve(undefined); };
    script.onerror = () => { script.remove(); reject(Error('本地 3D 依赖加载失败，请先运行 npm ci。')); };
    document.head.append(script);
  });
}

export async function loadLoop3D() {
  await Promise.all([loadScript('gl-matrix'),loadScript('war3-model')]);
  const {glMatrix:math,war3model:library} = /** @type {any} */ (window);
  if (!math || !library) throw Error('本地 3D 依赖缺失。');
  return {
    findLocalModel:findLocalYoshino,
    loadModel:files=>loadYoshino(files,library),
    mount:options=>mount(options,math,library)
  };
}

function mount({canvas,cameraPanel,artwork,onTap,onClear,onEdgePan,onPitch,onLost,onModelError},math,library) {
  const surface = document.createElement('canvas');
  surface.className = 'loop-webgl';
  surface.setAttribute('aria-hidden','true');
  const gl = surface.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
  if (!gl) throw Error('浏览器未能创建 WebGL 2 画布。');
  const scene = createScene(gl);
  const camera = createBattleCamera(math), overlay = createBattleOverlay(canvas,camera);
  const lifetime = new AbortController();
  let model = null, deaths = [];
  canvas.style.transform = 'none';
  canvas.before(surface);
  canvas.parentElement.classList.add('has-loop-3d');
  cameraPanel.hidden = false;
  surface.addEventListener('webglcontextlost',event=>{event.preventDefault();onLost();},{signal:lifetime.signal});
  const controls = bindBattleCamera(canvas,camera,{onTap,onClear,onEdgePan,onPitch,panel:cameraPanel});
  onPitch(camera.pitch);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.resize(rect.width,rect.height);
    return rect;
  }

  return {
    camera,
    point(event,state,select = false) {
      const rect = resize();
      if (!rect) return null;
      const x = event.clientX-rect.left, y = event.clientY-rect.top;
      if (x<0 || x>rect.width || y<0 || y>rect.height) return null;
      const hit = select ? pickActor(camera.ray(x,y),state) : null;
      const ground = camera.ground(x,y);
      if (!ground && !hit) return null;
      return {...(ground || {x:hit.x,y:hit.y}),actor:hit};
    },
    setModel(asset) {
      model?.dispose();
      model = null;
      deaths = [];
      if (!asset) return;
      try { model = createYoshinoRenderer(gl,library,math,asset); }
      catch (error) { onModelError(error); }
    },
    event(event,state) {
      overlay.event(event,state.elapsed);
      if (model && event.type==='kill') {
        deaths.push({...event,at:state.elapsed});
        if (deaths.length>8) deaths.shift();
      }
    },
    draw(state,ui,dt = 0) {
      const rect = resize();
      if (!rect) return;
      controls.edgeScroll(rect,dt);
      const dpr = Math.min(window.devicePixelRatio||1,1.5);
      const w = Math.round(rect.width*dpr), h = Math.round(rect.height*dpr);
      if (surface.width!==w || surface.height!==h) {
        surface.width = w;surface.height = h;
      }
      if (surface.style.width!==`${rect.width}px` || surface.style.height!==`${rect.height}px`) {
        surface.style.width = `${rect.width}px`;surface.style.height = `${rect.height}px`;
      }
      scene.draw(camera,state,artwork.ground,!!model);
      if (model) {
        for (const enemy of state.enemies) if (enemy.hp>0) model.draw(camera,enemy,state.elapsed);
        deaths = deaths.filter(death=>state.elapsed-death.at<.85);
        for (const death of deaths) model.draw(camera,death,state.elapsed,state.elapsed-death.at);
      }
      overlay.draw(state,{width:rect.width,height:rect.height,...ui});
    },
    reset() { controls.reset();overlay.reset();deaths=[]; },
    dispose() {
      lifetime.abort();controls.dispose();
      surface.remove();canvas.parentElement.classList.remove('has-loop-3d');
      cameraPanel.hidden = true;
      if (!gl.isContextLost()) {
        model?.dispose();
        scene.dispose();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }
  };
}
