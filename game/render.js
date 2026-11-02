import { WORLD, FOOTPRINT, BUILD_BOUNDS, BUILD_CENTER_BOUNDS, BUILD_EXCLUSIONS, ENTRY } from './geometry.js';
import { TOWERS, towerStats, effectiveTowerStats } from './catalog.js';
import { DEFENSE_CORE, DEFENSE_LANES, DEFENSE_BUILD_EXCLUSIONS } from './defense-geometry.js';
import {ESCORT_POINTS,ESCORT_CHECKPOINTS,ESCORT_BUILD_EXCLUSIONS,pointOnEscortRoute} from './escort-geometry.js';
import {MAZE_ENTRY,MAZE_EXIT,WALL_FOOTPRINT} from './maze-geometry.js';
import {BUILD_EXCLUSIONS as GEM_BUILD_EXCLUSIONS} from './gem-geometry.js';
import {heroPlacementStatus} from './hero-geometry.js';
import {LEGION_DEPLOYMENT,LEGION_RADIUS} from './legion-geometry.js';
import {createSpecialPainter,projectBattleState,specialStats} from './special-render.js';

const DIRECTIONS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const ORIGINALS = new URL('../outputs/', import.meta.url);
const MAPS = new URL('./assets/maps/v5/', import.meta.url);

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图片无法加载：${new URL(url).pathname}`));
    image.src = String(url);
  });
}

/** Load the real original sprites without rewriting or rescaling their files. */
export async function loadArtwork(onProgress) {
  const response = await fetch(new URL('manifest.json', ORIGINALS));
  if (!response.ok) throw new Error('原素材清单无法读取，请从项目根目录启动服务。');
  const manifest = await response.json();
  const units = new Map();
  const effects = new Map();
  const tasks = [];
  const result = { units, effects, ground: null, defenseGround: null,escortGround:null,mazeGround:null,gemGround:null,heroGround:null,legionGround:null,convoyImage:null,wallImage:null,ruinsImage:null,heroAtlas:null,gemAtlas:null,objectivesAtlas:null };
  for (const entry of manifest.units) {
    const unit = { ...entry, masterImage: null, images: new Map(), requested: new Set() };
    units.set(entry.code, unit);
    tasks.push(async () => { unit.masterImage = await loadImage(new URL(entry.master, ORIGINALS)); });
  }
  for (const entry of manifest.effects) {
    tasks.push(async () => { effects.set(entry.code, await loadImage(new URL(entry.path, ORIGINALS))); });
  }
  tasks.push(async () => { result.ground = await loadImage(new URL('scene.png', MAPS)); });
  tasks.push(async () => { result.defenseGround = await loadImage(new URL('./assets/maps/core-defense/scene.png', import.meta.url)); });
  for(const mode of ['escort','maze','gem','hero','legion'])tasks.push(async()=>{result[`${mode}Ground`]=await loadImage(new URL(`./assets/maps/${mode}/scene.png`,import.meta.url));});
  tasks.push(async()=>{result.convoyImage=await loadImage(new URL('props/P01-tech-supply-crate.png',ORIGINALS));});
  tasks.push(async()=>{result.wallImage=await loadImage(new URL('props/P02-portable-generator.png',ORIGINALS));});
  tasks.push(async()=>{result.ruinsImage=await loadImage(new URL('props/P04-broken-stone-stele.png',ORIGINALS));});
  for(const [key,path]of [['heroAtlas','hero/atlas.png'],['gemAtlas','gem/atlas.png'],['objectivesAtlas','shared/objectives.png']])tasks.push(async()=>{result[key]=await loadImage(new URL(`./assets/modes/${path}`,import.meta.url));});
  const total=tasks.length;
  let complete = 0;
  // ponytail: six concurrent image decodes keep the initial menu responsive.
  const worker = async () => {
    while (tasks.length) {
      await tasks.shift()();
      onProgress(++complete,total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return result;
}

function spriteFor(unit, angle) {
  const direction = DIRECTIONS[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8];
  if (unit.images.has(direction)) return unit.images.get(direction);
  if (unit.directions?.[direction] && !unit.requested.has(direction)) {
    unit.requested.add(direction);
    loadImage(new URL(unit.directions[direction], ORIGINALS))
      .then(image => unit.images.set(direction, image))
      .catch(() => { console.warn(`方向图加载失败，使用该单位主图：${unit.code}/${direction}`); });
  }
  return unit.masterImage;
}

// The canvas and non-browser interaction checks use the same picking boundary.
export function hitTest(x, y, towers) {
  const ordered = [...towers].sort((a,b)=>b.y-a.y);
  const base = ordered.find(tower => tower.homeX!==undefined ? Math.hypot(tower.x-x,tower.y-y)<=LEGION_RADIUS : Math.abs(tower.x-x) <= (tower.code==='WALL'?30:FOOTPRINT.width/2) && Math.abs(tower.y-y) <= (tower.code==='WALL'?30:FOOTPRINT.height/2));
  const sprite = base || ordered.find(tower => tower.code!=='WALL' && Math.abs(tower.x-x) <= FOOTPRINT.width/2 && y >= tower.y-65 && y <= tower.y+FOOTPRINT.height/2);
  return sprite?.id ?? null;
}

/** @param {HTMLCanvasElement} canvas */
export function createRenderer(canvas, artwork) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此浏览器无法创建二维画布。');
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WORLD.width * ratio;
  canvas.height = WORLD.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const backgrounds = {}, buildMasks = {};
  for (const {mode, ground, exclusions} of [
    {mode:'loop', ground:artwork.ground, exclusions:BUILD_EXCLUSIONS},
    {mode:'defense', ground:artwork.defenseGround, exclusions:DEFENSE_BUILD_EXCLUSIONS},
    {mode:'escort', ground:artwork.escortGround, exclusions:ESCORT_BUILD_EXCLUSIONS},
    {mode:'maze', ground:artwork.mazeGround, exclusions:[]},
    {mode:'gem', ground:artwork.gemGround, exclusions:GEM_BUILD_EXCLUSIONS},
    {mode:'hero', ground:artwork.heroGround, exclusions:[]},
    {mode:'legion', ground:artwork.legionGround, exclusions:[]},
  ]) {
    const background = document.createElement('canvas');
    background.width = WORLD.width; background.height = WORLD.height;
    const backdrop = background.getContext('2d');
    if(ground)backdrop.drawImage(ground, 0, 0, WORLD.width, WORLD.height);
    backdrop.fillStyle = '#7580671f';
    backdrop.fillRect(0, 0, WORLD.width, WORLD.height);
    backgrounds[mode] = background;
    const buildMask = document.createElement('canvas');
    buildMask.width = WORLD.width; buildMask.height = WORLD.height;
    const mask = buildMask.getContext('2d');
    mask.fillStyle = '#9ae6ad45';
    if(mode==='hero'){
      // The preview samples continuous authoritative geometry; these are not build slots.
      for(let y=0;y<WORLD.height;y+=4)for(let x=0;x<WORLD.width;x+=4)if(heroPlacementStatus(x+2,y+2).ok)mask.fillRect(x,y,4,4);
    }else if(mode==='legion'){
      const b=LEGION_DEPLOYMENT;mask.fillRect(b.left,b.top,b.right-b.left,b.bottom-b.top);
    }else mask.fillRect(BUILD_CENTER_BOUNDS.x, BUILD_CENTER_BOUNDS.y, BUILD_CENTER_BOUNDS.width, BUILD_CENTER_BOUNDS.height);
    for (const area of exclusions) mask.clearRect(area.x, area.y, area.width, area.height);
    buildMasks[mode] = buildMask;
  }
  const freeMask = document.createElement('canvas');
  freeMask.width = WORLD.width; freeMask.height = WORLD.height;
  const free = freeMask.getContext('2d');

  /** @type {any[]} */
  let particles = [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frameState;
  const special=createSpecialPainter(ctx,artwork,{text,ring,traceRoute,reduceMotion});

  function ring(x, y, radius, color, alpha = 1, width = 2) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * .55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function text(label, x, y, color, size = 15) {
    ctx.font = `600 ${size}px "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#18271ce6';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = color;
    ctx.fillText(label, x, y);
  }

  function drawWall(x,y){
    ctx.save();
    ctx.fillStyle='#172c2860';ctx.beginPath();ctx.ellipse(x,y+8,32,14,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#9adad0';ctx.fillStyle='#9adad022';ctx.lineWidth=2;
    ctx.beginPath();
    for(const [index,[dx,dy]]of [[-30,-15],[-15,-30],[15,-30],[30,-15],[30,15],[15,30],[-15,30],[-30,15]].entries()){
      if(index===0)ctx.moveTo(x+dx,y+dy);else ctx.lineTo(x+dx,y+dy);
    }
    ctx.closePath();ctx.fill();ctx.stroke();
    if(artwork.wallImage)ctx.drawImage(artwork.wallImage,x-48,y-60,96,96);
    ring(x,y+5,31,'#9adad0',.6,1.5);
    ctx.restore();
  }

  function drawConvoy(entity){
    ring(entity.x,entity.y+3,39,'#a7f3df',.95,3);
    ctx.fillStyle='#192b2380';ctx.beginPath();ctx.ellipse(entity.x,entity.y+5,30,10,0,0,Math.PI*2);ctx.fill();
    if(artwork.convoyImage)ctx.drawImage(artwork.convoyImage,entity.x-64,entity.y-80,128,128);
  }

  function traceRoute(points,color,width,dash=[]){
    if(!points?.length)return;
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();ctx.restore();
  }

  function drawTacticalGround(state,placement){
    special.ground(state,placement);
    if(state.mode==='escort'){
      const points=ESCORT_POINTS.map(([x,y])=>({x,y}));
      traceRoute(points,'#4ac8ae24',48);
      traceRoute(points,'#1b443bb3',6,[12,9]);
      traceRoute(points,'#d0ebc3e6',2.5,[12,9]);
      for(const [index,progress] of ESCORT_CHECKPOINTS.entries()){
        const point=pointOnEscortRoute(progress);
        ring(point.x,point.y,27,index<state.convoy.checkpointIndex?'#9aa888':'#e3c785',.8,2);
        text(`补给 ${index+1}`,point.x+70,point.y,'#e7d8a3',12);
      }
      for(const progress of state.ambushPoints){const point=pointOnEscortRoute(progress);ring(point.x,point.y,23,'#edb391',.65,2);}
      const end=pointOnEscortRoute(Infinity);
      ring(end.x,end.y,34,'#b9e9c1',.9,3);text('交付终点',end.x-20,end.y-52,'#d4f1cd',14);
    }else if(state.mode==='maze'){
      const structures=[...state.towers,...state.walls];
      // Adjacent emitters visibly seal the same narrow gaps as the flow field.
      for(let i=0;i<structures.length;i++)for(const other of structures.slice(i+1)){
        const unit=structures[i];if(unit.code!=='WALL'&&other.code!=='WALL')continue;
        const a=unit.code==='WALL'?WALL_FOOTPRINT:FOOTPRINT,b=other.code==='WALL'?WALL_FOOTPRINT:FOOTPRINT;
        const dx=Math.abs(unit.x-other.x)-(a.width+b.width)/2,dy=Math.abs(unit.y-other.y)-(a.height+b.height)/2;
        if(dx>20||dy>20)continue;
        const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
        const from={x:clamp(other.x,unit.x-a.width/2,unit.x+a.width/2),y:clamp(other.y,unit.y-a.height/2,unit.y+a.height/2)};
        const to={x:clamp(unit.x,other.x-b.width/2,other.x+b.width/2),y:clamp(unit.y,other.y-b.height/2,other.y+b.height/2)};
        traceRoute([from,to],'#9ae6d755',12);traceRoute([from,to],'#b4f8e2cc',3);
      }
      traceRoute(state.mazeRoute,'#dcc48025',16);
      traceRoute(state.mazeRoute,'#e7dba8aa',3,[9,7]);
      if(placement?.ok&&placement.route)traceRoute(placement.route,'#98ead9',3,[5,5]);
      ring(MAZE_ENTRY.x,MAZE_ENTRY.y,25,'#e6b58e',.9,3);
      ring(MAZE_EXIT.x,MAZE_EXIT.y,25,'#acf1d2',.9,3);
      text('入侵',MAZE_ENTRY.x+25,MAZE_ENTRY.y-48,'#f6d4aa',14);
      text('守住出口',MAZE_EXIT.x-42,MAZE_EXIT.y-48,'#b5f2d8',14);
    }
  }

  function drawUnit(entity, tower, elapsed) {
    if(special.actor(entity,frameState))return;
    if(entity.code==='WALL'){drawWall(entity.x,entity.y);return;}
    if(entity.convoy){drawConvoy(entity);return;}
    if(entity.burnRemaining>0)ring(entity.x,entity.y+3,23,'#d59bff',.8,2);
    const unit = artwork.units.get(entity.assetCode||entity.code);
    const size = frameState.mode==='legion'?96:tower ? 128 : entity.boss ? 184 : 126;
    ctx.fillStyle = tower ? '#18271b3d' : '#18271b66';
    ctx.beginPath();
    ctx.ellipse(entity.x, entity.y + 3, tower ? 31 : entity.boss ? 31 : 19, tower ? 11 : entity.boss ? 9 : 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (unit) {
      const sprite = spriteFor(unit, entity.angle || 0);
      const bob = (!tower||frameState.mode==='legion') && !reduceMotion ? Math.sin((entity.progress??elapsed*40) * .13) * 1.6 : 0;
      ctx.drawImage(sprite, entity.x - size * .5, entity.y - size * .625 + bob, size, size);
    }
    if (tower) {
      text((entity.readyAt??0)>elapsed?`搬迁 ${(entity.readyAt-elapsed).toFixed(1)}s`:`Lv.${entity.level}`, entity.x, entity.y + 27, '#f3d88e', 12);
      const stats=specialStats(entity,frameState)||towerStats(entity);
      if (['radar', 'overclock', 'barrier', 'supply','support','healer'].includes(stats.kind)) {
        ring(entity.x, entity.y + 2, 34, stats.color, .45, 1.5);
      }
    }
    if(!tower||frameState.mode==='legion'){
      const width = entity.boss ? 66 : 39;
      const top = entity.y - (entity.boss ? 78 : 53);
      ctx.fillStyle = '#15241ee0';
      ctx.fillRect(entity.x - width / 2 - 1, top - 1, width + 2, 7);
      ctx.fillStyle = entity.boss ? '#e8b35a' : entity.slowUntil > elapsed ? '#a6d9be' : '#8cc58c';
      ctx.fillRect(entity.x - width / 2, top, width * Math.max(0, entity.hp / entity.maxHp), 5);
      if (entity.boss) text('首领', entity.x, top - 14, '#ffe09e', 13);
    }
  }

  function event(event) {
    if(['attack','king-attack','hero-attack'].includes(event.type))event={...event,type:'shot',tx:event.tx??event.targetX,ty:event.ty??event.targetY,color:event.side==='ai'?'#e8b08d':'#a4ead5'};
    if(['damage','hero-hit'].includes(event.type))event={...event,type:'hit',amount:event.damage??event.amount,color:'#e89d8c'};
    const lifetimes = { shot: .16, hit: .18, kill: .8, build: .65, upgrade: .8, sell: .55, income: .8, 'core-hit': .65,relocate:.65,fusion:.9,echo:.3,'hero-skill':.5,'unit-death':.7,heal:.7 };
    if (!(event.type in lifetimes)) return;
    particles.push({ ...event, age: 0, life: lifetimes[event.type] });
    if (particles.length > 240) particles = particles.slice(-240);
  }

  function drawParticles(dt) {
    for (const item of particles) {
      item.age += dt;
      if(frameState.mode==='legion'&&item.side&&item.side!==(frameState.viewSide||'player'))continue;
      const progress = item.age / item.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      if(special.particle(item,progress)){ctx.restore();continue;}
      const color = item.color || '#e6c779';
      if (item.type === 'shot') {
        ctx.lineWidth = item.code === 'T03' ? 5 : 2.5;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(item.x, item.y - 25);
        if (item.code === 'T05') {
          ctx.lineTo((item.x + item.tx) / 2 + 9, (item.y + item.ty) / 2 - 18);
          ctx.lineTo((item.x + item.tx) / 2 - 7, (item.y + item.ty) / 2);
        }
        ctx.lineTo(item.tx, item.ty - 16);
        ctx.stroke();
        const muzzle = artwork.effects.get(item.code === 'T05' ? 'F02' : 'F01');
        if (muzzle) ctx.drawImage(muzzle, item.x - 24, item.y - 49, 48, 48);
      } else if (item.type === 'hit') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y - 16, 4 + progress * 15, 0, Math.PI * 2);
        ctx.stroke();
        const effect = artwork.effects.get('F04');
        if (effect) ctx.drawImage(effect, item.x - 24, item.y - 40, 48, 48);
      } else if (item.type === 'kill' || item.type === 'income' || item.type === 'sell') {
        text(`+${item.amount}`, item.x, item.y - 45 - progress * 24, '#ffe08b', 16);
        if (item.type === 'kill') {
          const effect = artwork.effects.get('F06');
          if (effect) ctx.drawImage(effect, item.x - 35, item.y - 50, 70, 70);
        }
      } else if (item.type === 'core-hit') {
        ring(item.x, item.y, 32 + progress * 36, '#ff947e', 1, 3);
        text(`${item.label||'核心'} -${item.amount}`, item.x, item.y - 60 - progress * 18, '#ffd0b8', 16);
      } else {
        ring(item.x, item.y, 30 + progress * 25, item.type === 'upgrade' ? '#b2f4d5' : '#f3d177', 1, 3);
        text(item.type === 'upgrade' ? '升级' : item.type==='relocate'?'搬迁':'部署', item.x, item.y - 65 - progress * 10, '#fff0b5', 16);
      }
      ctx.restore();
    }
    particles = particles.filter(item => item.age < item.life);
  }

  function draw(state, selectedTowerId, placement, dt = 0, cursor = null) {
    state=projectBattleState(state);frameState=state;
    const mode = state.mode;
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(backgrounds[mode], 0, 0);
    drawTacticalGround(state,placement);
    if (placement&&!placement.skill) {
      free.clearRect(0, 0, WORLD.width, WORLD.height);
      const footprint=mode==='legion'?{width:LEGION_RADIUS*2,height:LEGION_RADIUS*2}:placement.code==='WALL'?WALL_FOOTPRINT:FOOTPRINT;
      if(mode==='maze'){
        free.fillStyle='#9ae6ad45';
        free.fillRect(BUILD_BOUNDS.x+footprint.width/2,BUILD_BOUNDS.y+footprint.height/2,BUILD_BOUNDS.width-footprint.width,BUILD_BOUNDS.height-footprint.height);
      }else free.drawImage(buildMasks[mode], 0, 0);
      for (const tower of [...state.towers,...state.walls||[]]) {
        if(placement.relocating&&tower.id===placement.towerId)continue;
        if(mode==='legion'){free.save();free.globalCompositeOperation='destination-out';free.beginPath();free.arc(tower.x,tower.y,LEGION_RADIUS*2+8,0,Math.PI*2);free.fill();free.restore();continue;}
        const other=tower.code==='WALL'?WALL_FOOTPRINT:FOOTPRINT;
        const halfX=(footprint.width+other.width)/2+8,halfY=(footprint.height+other.height)/2+8;
        free.clearRect(tower.x-halfX,tower.y-halfY,halfX*2,halfY*2);
      }
      if(mode==='hero')for(const entity of [state.hero,...state.enemies]){
        if(entity.hp<=0)continue;
        free.clearRect(entity.x-60,entity.y-40,120,80);
      }
      ctx.drawImage(freeMask, 0, 0);
    }
    if(mode==='loop'||mode==='defense'){
    ctx.save();
    ctx.globalAlpha = reduceMotion ? .16 : .16 + Math.sin(state.elapsed * 2) * .05;
    ctx.strokeStyle = '#d0c39c'; ctx.lineWidth = 1.5;
    const core = mode === 'defense' ? DEFENSE_CORE : ENTRY;
    ctx.beginPath(); ctx.ellipse(core.x, core.y, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text(mode === 'defense' ? '防守核心' : '出怪核心', core.x, core.y + 73, '#ded8b8', 14);
    if (mode === 'defense') {
      const lane = DEFENSE_LANES[state.waveActive ? state.attackLane : state.wave % 4];
      const [x,y] = lane.points[0];
      ring(x,y,27,state.waveActive ? '#ffb68a' : '#bddbd0',.8);
      text(`${lane.name}路${state.waveActive ? '来袭' : '预告'}`, x, y + 46, '#ffe1b5', 13);
    }
    }
    const selected = [...state.towers,...state.walls||[]].find(tower => tower.id === selectedTowerId);
    if (selected) ring(selected.x, selected.y, 45, '#ffe39b', 1, 2.5);
    const position = placement || selected;
    const movingTower=placement?.relocating?state.towers.find(t=>t.id===placement.towerId):null;
    const active=state.towers.filter(t=>(t.readyAt??0)<=state.elapsed);
    const focus=movingTower?{...movingTower,x:placement.x,y:placement.y}:placement?.code?{...placement,level:placement.level||1}:selected;
    const range=focus&&focus.code!=='WALL'?(specialStats(focus,state)?.range??(placement&&!movingTower?TOWERS.find(t=>t.code===focus.code)?.range:effectiveTowerStats(focus,active).range)):0;
    if (position && range) {
      ctx.save();
      ctx.fillStyle = '#f7df8612';
      ctx.strokeStyle = '#f7df8680';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(position.x, position.y, range, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const actors = [
      ...state.towers.map(entity => ({ entity, tower: true })),
      ...(state.walls||[]).map(entity=>({entity,tower:true})),
      ...state.enemies.map(entity => ({ entity, tower: false })),
      ...(state.convoy?[{entity:{...state.convoy,convoy:true},tower:false}]:[]),
      ...special.actors(state).map(entity=>({entity,tower:false})),
    ].sort((a, b) => a.entity.y - b.entity.y);
    for (const actor of actors) drawUnit(actor.entity, actor.tower, state.elapsed);
    if(state.convoy){const convoy=state.convoy;text(convoy.moving?'护送载具 · 行进':'护送载具 · 停车',Math.max(100,Math.min(1180,convoy.x)),convoy.y+40,'#c4ffdf',14);}
    if (placement&&!placement.skill) {
      const color = placement.ok ? '#a4e6ae' : '#f29a84';
      const unit = artwork.units.get(placement.code);
      ctx.save();
      ctx.globalAlpha = .52;
      if(placement.code==='WALL')drawWall(placement.x,placement.y);
      if(mode==='gem'||['T13','T14'].includes(placement.code))special.actor({...placement,level:placement.level||1},state);
      if (unit?.masterImage) ctx.drawImage(unit.masterImage, placement.x - 64, placement.y - 80, 128, 128);
      ctx.globalAlpha = 1;
      ctx.fillStyle = placement.ok ? '#71cf8b35' : '#e7786635';
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      const size=mode==='legion'?{width:LEGION_RADIUS*2,height:LEGION_RADIUS*2}:placement.code==='WALL'?WALL_FOOTPRINT:FOOTPRINT;
      ctx.fillRect(placement.x-size.width/2,placement.y-size.height/2,size.width,size.height);
      ctx.strokeRect(placement.x-size.width/2,placement.y-size.height/2,size.width,size.height);
      const labelX = Math.max(130, Math.min(WORLD.width - 130, placement.x));
      const labelY = placement.y > 100 ? placement.y - 91 : placement.y + 49;
      text(placement.ok ? placement.relocating?'点击搬迁':'点击建造' : placement.message, labelX, labelY, color, 15);
      ctx.restore();
    } else if(placement?.skill){text(`点击施放 ${placement.skill}`,Math.max(130,Math.min(1150,placement.x)),Math.max(30,placement.y-40),'#b5efda',14);
    } else if (cursor) {
      ctx.save();ctx.strokeStyle = '#f4d789';ctx.lineWidth = 2;
      ctx.beginPath();ctx.moveTo(cursor.x - 10, cursor.y);ctx.lineTo(cursor.x + 10, cursor.y);ctx.moveTo(cursor.x, cursor.y - 10);ctx.lineTo(cursor.x, cursor.y + 10);ctx.stroke();ctx.restore();
    }
    drawParticles(state.paused ? 0 : dt);
    if (state.paused) {
      ctx.fillStyle = '#10201952';
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      ctx.fillStyle = '#13271ce8';
      ctx.fillRect(510, 348, 260, 90);
      text('对局已暂停', 640, 385, '#f8e4ab', 25);
      text('空格或点击“继续”恢复', 640, 415, '#d0d7c1', 13);
    }
  }

  return {
    draw, event,
    reset() { particles = []; },
    hitTest,
  };
}
