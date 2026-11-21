import { decodeModelTexture } from './boss.js';
import { LIBRARY_DEFAULTS } from './model-defaults.js';

export const MODEL_ASSIGNMENTS_KEY = 'loop-3d-models-v1';
export const MODEL_EFFECTS = {build:'建造特效',hit:'命中特效','skill-pulse':'范围技能特效'};
const directory = new URL('./local-library/',import.meta.url);
export const isEffectTarget = code=>code.startsWith('fx:') && Object.hasOwn(MODEL_EFFECTS,code.slice(3));
export const canAssignModel = (model,code)=>!!model?.drawable && !model.issue &&
  (model.geometry || isEffectTarget(code));

export async function readModelCatalog() {
  if (!['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname)) return null;
  const response = await fetch(new URL('catalog.json',directory),{signal:AbortSignal.timeout(5000)});
  if (response.status !== 200) return null;
  const catalog = await response.json();
  const byId = new Map(catalog.models.map(model=>[model.id,model]));
  const defaults = new Map();
  for (const [code,[suffix,scale,elevation]] of Object.entries(LIBRARY_DEFAULTS)) {
    const model = catalog.models.find(model=>model.source.endsWith('/'+suffix) && canAssignModel(model,code));
    if (model) defaults.set(code,{model,scale,elevation});
  }
  return {...catalog,byId,defaults};
}

export function readAssignments() {
  try {
    const stored = JSON.parse(localStorage.getItem(MODEL_ASSIGNMENTS_KEY));
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored;
  } catch {}
  return {};
}

export function assignedModel(catalog,assignments,code) {
  if (Object.hasOwn(assignments,code)) {
    if (assignments[code] === null) return null;
    const model = catalog.byId.get(assignments[code]);
    if (canAssignModel(model,code)) return {model};
  }
  return catalog.defaults.get(code);
}

export function createBattleLibrary(catalog,library) {
  const assignments = readAssignments();
  return {
    has:code=>!!assignedModel(catalog,assignments,code),
    async load(code,signal) {
      const profile = assignedModel(catalog,assignments,code);
      if (!profile) return null;
      const asset = await loadLibraryAsset(profile.model,library,signal);
      const {min,max} = asset.bounds;
      const width = Math.max(1,max[0]-min[0],max[1]-min[1]);
      const height = Math.max(1,max[2]-min[2]);
      const tower = /^[NT]/.test(code);
      const effect = isEffectTarget(code);
      const size = effect ? 68 : tower ? 50 : code.startsWith('B') ? 67 : code.startsWith('E') || code.startsWith('C') ? 45 : 31;
      const scale = profile.scale ?? Math.min(size/width,(tower ? 62 : size*1.25)/height);
      return {...asset,scale,effect,elevation:profile.elevation ?? (tower ? 11 : effect ? 10 : 0)-min[2]*scale};
    }
  };
}

async function assetResponse(file,signal) {
  const url = new URL('assets/'+file,directory);
  const response = await fetch(url,{signal});
  if (response.status !== 200) throw Error('模型库文件缺失。');
  return response;
}

function modelBounds(model) {
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  for (const {Vertices:vertices} of model.Geosets) {
    for (let pos = 0; pos < vertices.length; pos += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const value = vertices[pos+axis];
        if (!Number.isFinite(value)) continue;
        min[axis] = Math.min(min[axis],value);
        max[axis] = Math.max(max[axis],value);
      }
    }
  }
  if (max.every(Number.isFinite) && max.some((value,axis)=>value>min[axis])) return {min,max};
  const {MinimumExtent:low,MaximumExtent:high} = model.Info;
  if (low?.length === 3 && high?.length === 3 && high.every(Number.isFinite) && low.every(Number.isFinite) &&
      high.some((value,axis)=>value>low[axis])) return {min:Array.from(low),max:Array.from(high)};
  return {min:[-64,-64,0],max:[64,64,128]};
}

function animationIndexes(sequences) {
  function find(name) {
    const exact = sequences.findIndex(clip=>clip.Name.trim().toLowerCase() === name);
    if (exact >= 0) return exact;
    const variant = sequences.findIndex(clip=>clip.Name.trim().toLowerCase().startsWith(name+' '));
    return variant >= 0 ? variant : undefined;
  }
  return {stand:find('stand') ?? find('birth') ?? 0,walk:find('walk'),channel:find('spell'),death:find('death'),
    effect:find('birth') ?? find('spell') ?? find('stand') ?? 0};
}

function missingTexture(geometry) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (geometry) {
    ctx.fillStyle = '#9caab7';
    ctx.fillRect(0,0,32,32);
    ctx.fillStyle = '#6b7684';
    ctx.fillRect(0,0,16,16);
    ctx.fillRect(16,16,16,16);
  } else {
    const glow = ctx.createRadialGradient(16,16,0,16,16,16);
    glow.addColorStop(0,'white');
    glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0,0,32,32);
  }
  return canvas;
}

export async function loadLibraryAsset(entry,library,signal) {
  if (entry.issue) throw Error(entry.issue);
  const response = await assetResponse(entry.asset,signal);
  const model = entry.format==='mdl' ? library.parseMDL(await response.text()) : library.parseMDX(await response.arrayBuffer());
  if (model.Version !== 800) throw Error('需要转换为经典版模型。');
  if (!model.Sequences.length) model.Sequences.push({Name:'静态',Interval:[0,1000]});
  const textures = new Map(), missing = [];
  const references = [...new Set(model.Textures.map(texture=>texture.Image).filter(Boolean))];
  let placeholder = null, glow = null;
  await Promise.all(references.map(async reference=>{
    try {
      const file = entry.textures[reference];
      if (!file) throw Error('找不到贴图。');
      const texture = await assetResponse(file,signal);
      if (file.endsWith('.blp')) {
        textures.set(reference,decodeModelTexture(await texture.arrayBuffer(),library));
      } else {
        const bitmap = await createImageBitmap(await texture.blob());
        try {
          if (bitmap.width > 2048 || bitmap.height > 2048) throw Error('贴图尺寸超过 2048 × 2048。');
          const canvas = document.createElement('canvas');
          canvas.width=bitmap.width;canvas.height=bitmap.height;
          canvas.getContext('2d').drawImage(bitmap,0,0);
          textures.set(reference,canvas);
        } finally {
          bitmap.close();
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      const material = model.Materials.some(material=>material.Layers.some(layer=>
        typeof layer.TextureID!=='number' || model.Textures[layer.TextureID]?.Image===reference));
      if (material) {
        placeholder ??= missingTexture(true);
        textures.set(reference,placeholder);
      } else {
        glow ??= missingTexture(false);
        textures.set(reference,glow);
      }
      missing.push(reference);
    }
  }));
  return {model,textures,indexes:animationIndexes(model.Sequences),bounds:modelBounds(model),missing:missing.sort()};
}
