import { LOOP_ENEMIES, LOOP_TOWERS } from '../loop-catalog.js';
import { initModelRenderer } from './boss.js';
import { load3DVendors } from './index.js';
import { MODEL_ASSIGNMENTS_KEY, MODEL_EFFECTS, assignedModel, canAssignModel, loadLibraryAsset, readAssignments, readModelCatalog } from './model-library.js';

const get = id=>document.getElementById(id);
const list = get('entries'), search = get('search'), group = get('group'), unit = get('unit'), clips = get('clips');
const assign = get('assign'), restore = get('restore'), assignmentStatus = get('assignment-status');
const libraryStatus = get('library-status'), counts = get('counts'), issue = get('issue'), canvas = get('preview');
let catalog, preview, active, selection, request;

function updateAssignment(message = '') {
  const defaultModel = assignedModel(catalog,selection,unit.value)?.model;
  assign.disabled = !canAssignModel(active,unit.value) || !preview || !!request;
  restore.disabled = !Object.hasOwn(selection,unit.value);
  assignmentStatus.textContent = message || `当前外观 · ${defaultModel?.name ?? (unit.value.startsWith('fx:') ? '原特效' : '低模')}`;
}

function saveAssignment(reset = false) {
  const next = readAssignments();
  if (reset) delete next[unit.value];
  else next[unit.value] = active.id;
  try {
    localStorage.setItem(MODEL_ASSIGNMENTS_KEY,JSON.stringify(next));
    selection = next;
    updateAssignment(reset ? '已恢复默认外观。' : `已应用 ${active.name}。`);
  } catch {
    updateAssignment('浏览器未能保存外观设置。');
  }
}

function showIssue(message) {
  issue.textContent = message;
  issue.hidden = !message;
}

function filterModels() {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalog.models.filter(model=>(!group.value || group.value === model.group) &&
    terms.every(term=>model.source.toLocaleLowerCase().includes(term)));
  const selected = active?.id;
  list.replaceChildren(...matches.map(model=>new Option(
    model.source.split('/').slice(-2).join('/') + (model.issue ? ' · 需转换' : model.missing.length ? ' · 缺贴图' : ''),
    model.id
  )));
  counts.textContent = `${matches.length} / ${catalog.models.length}`;
  list.value = matches.some(model=>model.id===selected) ? selected : matches[0]?.id ?? '';
  if (list.value !== selected || (!preview && !request)) void showModel(list.value);
}

async function showModel(id) {
  request?.abort();
  request = null;
  active = catalog.byId.get(id);
  preview?.dispose();
  preview = null;
  clips.replaceChildren(new Option('无可用动作'));
  clips.disabled = true;
  get('model-name').textContent = active?.name ?? '没有匹配的模型';
  get('source').textContent = active?.source ?? '';
  const gl = canvas.getContext('webgl2');
  gl?.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  showIssue(active?.issue ?? '');
  updateAssignment();
  if (!active || active.issue) return;
  if (!gl) return showIssue('浏览器无法创建 WebGL 2 预览。');
  const pending = new AbortController();
  request = pending;
  showIssue('正在读取模型和贴图…');
  try {
    const {math,library} = await vendors;
    const asset = await loadLibraryAsset(active,library,pending.signal);
    if (pending.signal.aborted) return;
    preview = mountPreview(gl,math,library,asset);
    clips.replaceChildren(...asset.model.Sequences.map(({Name},index)=>new Option(Name,index)));
    clips.value=String(asset.indexes.stand);
    clips.disabled=clips.length<2;
    showIssue(asset.missing.length ? '已使用占位贴图 · '+asset.missing.join('、') : '');
  } catch (error) {
    if (!pending.signal.aborted) showIssue(error.message || '模型无法预览。');
  } finally {
    if (!pending.signal.aborted) {
      request = null;
      updateAssignment();
    }
  }
}

function mountPreview(gl,{mat4,quat},library,asset) {
  const renderer = initModelRenderer(gl,library,asset);
  const {min,max} = asset.bounds;
  const center = min.map((value,axis)=>(value+max[axis])/2);
  const size = Math.max(1,...min.map((value,axis)=>max[axis]-value));
  const view=mat4.create(), projection=mat4.create(), inverse=mat4.create(), rotation=quat.create();
  let angle = -.9, previous, frame;
  let pointer = null;
  const controls = new AbortController();
  const {signal} = controls;
  canvas.addEventListener('pointerdown',event=>{
    pointer=event.clientX;
    canvas.setPointerCapture(event.pointerId);
  },{signal});
  canvas.addEventListener('pointermove',event=>{
    if (pointer === null) return;
    angle+=(pointer-event.clientX)*.012;
    pointer=event.clientX;
  },{signal});
  canvas.addEventListener('lostpointercapture',()=>{pointer=null;},{signal});
  renderer.setSequence(asset.indexes.stand);

  function draw(now) {
    const rect=canvas.getBoundingClientRect(), ratio=Math.min(window.devicePixelRatio || 1,1.5);
    const width=Math.max(1,Math.round(rect.width*ratio)), height=Math.max(1,Math.round(rect.height*ratio));
    if (canvas.width!==width) canvas.width=width;
    if (canvas.height!==height) canvas.height=height;
    gl.viewport(0,0,width,height);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(.056,.083,.149,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const eye=[center[0]+Math.cos(angle)*size*1.55,center[1]+Math.sin(angle)*size*1.55,center[2]+size*.58];
    mat4.lookAt(view,eye,center,[0,0,1]);
    mat4.invert(inverse,view);
    mat4.getRotation(rotation,inverse);
    mat4.perspective(projection,.74,width/height,Math.max(.01,size*.005),size*12);
    renderer.setCamera(eye,rotation);
    renderer.update(Math.min(50,now-(previous ?? now)));
    renderer.render(view,projection,{wireframe:false});
    previous=now;
  }
  function animate(now) {
    try { draw(now); frame=requestAnimationFrame(animate); }
    catch (error) {
      showIssue(error.message || '模型无法预览。');
      preview?.dispose();
      preview=null;
      updateAssignment();
    }
  }
  try { draw(performance.now()); }
  catch (error) { controls.abort();renderer.destroy();throw error; }
  frame=requestAnimationFrame(animate);
  return {
    select:index=>renderer.setSequence(index),
    dispose() { cancelAnimationFrame(frame); controls.abort(); renderer.destroy(); }
  };
}

let vendors;
async function initialize() {
  catalog=await readModelCatalog();
  if (!catalog) throw Error('找不到本机模型库。请在项目目录运行 python3 scripts/import-models.py。');
  vendors=load3DVendors();
  selection=readAssignments();
  const units=[...LOOP_TOWERS,...Object.values(LOOP_ENEMIES)];
  const effectOptions=document.createElement('optgroup');
  effectOptions.label='战斗特效';
  effectOptions.append(...Object.entries(MODEL_EFFECTS).map(([event,name])=>new Option(name,'fx:'+event)));
  unit.replaceChildren(...units.map(model=>new Option(`${model.code} ${model.name}`,model.code)),effectOptions);
  unit.value='T05';
  const groups=[...new Set(catalog.models.map(model=>model.group))].sort((a,b)=>a.localeCompare(b,'zh'));
  group.append(...groups.map(name=>new Option(name,name)));
  const missing = catalog.models.filter(model=>model.missing.length).length;
  const conversions = catalog.models.filter(model=>model.issue).length;
  libraryStatus.textContent = `${catalog.models.length} 个文件 · ${missing} 个贴图待补 · ${conversions} 个待转换`;
  get('library').hidden=false;
  active=catalog.defaults.get('T05')?.model;
  filterModels();
  search.addEventListener('input',filterModels);
  group.addEventListener('change',filterModels);
  list.addEventListener('change',()=>void showModel(list.value));
  unit.addEventListener('change',()=>updateAssignment());
  clips.addEventListener('change',()=>preview?.select(Number(clips.value)));
  assign.addEventListener('click',()=>saveAssignment());
  restore.addEventListener('click',()=>saveAssignment(true));
  window.addEventListener('storage',event=>{
    if (event.key===MODEL_ASSIGNMENTS_KEY) { selection=readAssignments();updateAssignment(); }
  });
}

initialize().catch(error=>{libraryStatus.textContent=error.message;});
