import { createBattleCamera, pickActor } from './camera.js';
import { bindBattleCamera } from './input.js';
import { createScene } from './scene.js';
import { createBattleOverlay } from './overlay.js';
import { findLocalYoshino, loadYoshino, createYoshinoRenderer } from './boss.js';
import { loadSampleModels } from './sample-models.js';
import { MODEL_ASSIGNMENTS_KEY, MODEL_EFFECTS, createBattleLibrary, readModelCatalog } from './model-library.js';

function loadScript(name) {
  return new Promise((resolve,reject)=>{
    const script = document.createElement('script');
    script.src = new URL(`./vendor/${name}.js`,import.meta.url).href;
    script.onload = () => { script.remove(); resolve(undefined); };
    script.onerror = () => { script.remove(); reject(Error('本地 3D 依赖加载失败，请先运行 npm ci。')); };
    document.head.append(script);
  });
}

export async function load3DVendors() {
  await Promise.all([loadScript('gl-matrix'),loadScript('war3-model')]);
  const {glMatrix:math,war3model:library} = /** @type {any} */ (window);
  if (!math || !library) throw Error('本地 3D 依赖缺失。');
  return {math,library};
}

export async function loadLoop3D() {
  const {math,library} = await load3DVendors();
  return {
    findLocalModel:findLocalYoshino,
    loadModel:files=>loadYoshino(files,library),
    loadSamples:()=>loadSampleModels(library),
    assignmentKey:MODEL_ASSIGNMENTS_KEY,
    readCatalog:readModelCatalog,
    battleLibrary:catalog=>createBattleLibrary(catalog,library),
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
  const models = new Map();
  const enemyModelKey = code => models.has(code) ? code : '*';
  const hasEnemyModel = code => models.has(enemyModelKey(code));
  const hasTowerModel = code => models.has(code);
  const pending = new Set(), unavailable = new Set(), lastSeen = new Map(), effects = new Map();
  let modelLibrary = null, uploads = new AbortController();
  let deaths = [];
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

  function installModel(code,asset) {
    try { models.set(code,createYoshinoRenderer(gl,library,math,asset)); }
    catch (error) { unavailable.add(code); onModelError(error); }
  }

  function updateLibraryModels(state) {
    const codes = new Set(state.towers.map(tower=>tower.code));
    for (const enemy of state.enemies) if (enemy.hp>0) codes.add(enemy.code);
    for (const death of deaths) codes.add(death.code);
    for (const [code,effect] of effects) {
      if (state.elapsed-effect.at<.7) codes.add(code);
      else effects.delete(code);
    }
    for (const [code,model] of models) {
      if (codes.has(code) || state.elapsed-(lastSeen.get(code) ?? 0)<8) continue;
      model.dispose();
      models.delete(code);
      lastSeen.delete(code);
    }
    for (const code of codes) {
      lastSeen.set(code,state.elapsed);
      if (pending.size>=2 || models.has(code) || pending.has(code) || unavailable.has(code) || !modelLibrary.has(code)) continue;
      const {signal} = uploads;
      pending.add(code);
      void modelLibrary.load(code,signal).then(asset=>{
        if (asset && !signal.aborted) installModel(code,asset);
      }).catch(error=>{
        if (!signal.aborted) { unavailable.add(code); onModelError(error); }
      }).finally(()=>{
        if (!signal.aborted) pending.delete(code);
      });
    }
  }

  function drawModel(code,actor,elapsed,deathAge = null) {
    const model = models.get(code);
    if (!model) return;
    try { model.draw(camera,actor,elapsed,deathAge); }
    catch (error) {
      models.delete(code);
      unavailable.add(code);
      model.dispose();
      onModelError(error);
    }
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
      uploads.abort();
      uploads = new AbortController();
      pending.clear();
      unavailable.clear();
      lastSeen.clear();
      for (const model of models.values()) model.dispose();
      models.clear();
      effects.clear();
      deaths = [];
      modelLibrary = asset?.load && asset?.has ? asset : null;
      if (modelLibrary) return;
      const entries = asset instanceof Map ? asset : asset ? [['*',asset]] : [];
      for (const [code,modelAsset] of entries) installModel(code,modelAsset);
    },
    event(event,state) {
      overlay.event(event,state.elapsed);
      if (modelLibrary && Object.hasOwn(MODEL_EFFECTS,event.type) && Number.isFinite(event.x) && Number.isFinite(event.y)) {
        const code = 'fx:'+event.type;
        if (modelLibrary.has(code)) effects.set(code,{...event,at:state.elapsed});
      }
      if (event.type==='kill' && hasEnemyModel(event.code)) {
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
      deaths = deaths.filter(death=>state.elapsed-death.at<.85);
      if (modelLibrary) updateLibraryModels(state);
      scene.draw(camera,state,artwork.ground,hasEnemyModel,hasTowerModel);
      if (models.size) {
        for (const tower of state.towers) drawModel(tower.code,tower,state.elapsed);
        for (const enemy of state.enemies) if (enemy.hp>0) drawModel(enemyModelKey(enemy.code),enemy,state.elapsed);
        for (const death of deaths) drawModel(enemyModelKey(death.code),death,state.elapsed,state.elapsed-death.at);
        for (const [code,effect] of effects) drawModel(code,effect,state.elapsed);
      }
      overlay.draw(state,{width:rect.width,height:rect.height,...ui});
    },
    reset() {
      controls.reset();overlay.reset();effects.clear();deaths=[];
      if (modelLibrary) this.setModel(modelLibrary);
    },
    dispose() {
      uploads.abort();
      lifetime.abort();controls.dispose();
      surface.remove();canvas.parentElement.classList.remove('has-loop-3d');
      cameraPanel.hidden = true;
      if (!gl.isContextLost()) {
        for (const model of models.values()) model.dispose();
        scene.dispose();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }
  };
}
