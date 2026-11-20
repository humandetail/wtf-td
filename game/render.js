import { WORLD, LOOP_FOOTPRINT, LOOP_BUILD_AREA, ENTRY, ROAD_SEGMENTS, ROAD_WIDTH } from './geometry.js';
import { loopStats } from './loop-catalog.js';
import {effectColor,towerVisual} from './battle-visuals.js';

const DIRECTIONS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const ORIGINALS = new URL('../outputs/', import.meta.url);
const MAPS = new URL('./assets/maps/v5/', import.meta.url);
const LOOP_SPRITES = new Set([
  'T13', 'T14',
  ...Array.from({length:22},(_,i)=>'T'+(i+15)),
  ...'X13 X14 X15 X17 X19 X20 X21 X22 X23 X24 E02 E05 E06 E08 E10 B05 B06 B07 B08 B09 B10 B11 B12 C01 C02 C03 C06 C07 C08 G01 G02 G04'.split(' '),
]);
export function loopSpriteUrl(code){
  return LOOP_SPRITES.has(code)?new URL('./assets/modes/loop/'+code+'.png',import.meta.url):null;
}

// A fresh URL lets the browser retry a dropped or cached failed request.
export async function loadImage(url,{attempts=3,retryDelay=400,timeoutMs=120000,onRetry=(url,attempt,total)=>{}}={}) {
  const original=new URL(url);
  for(let attempt=0;attempt<attempts;attempt++){
    const source=new URL(original);
    if(attempt)source.searchParams.set('asset_retry',String(attempt));
    try {
      return await new Promise((resolve,reject)=>{
        const picture=new Image();
        const finish=(ok)=>{
          clearTimeout(timer);picture.onload=null;picture.onerror=null;
          if(ok)resolve(picture);else {picture.removeAttribute?.('src');reject(new Error(`图片无法加载：${original.pathname}`));}
        };
        const timer=setTimeout(()=>finish(false),timeoutMs);
        picture.decoding='async';picture.onload=()=>finish(true);picture.onerror=()=>finish(false);picture.src=source.href;
      });
    }catch(error){
      if(attempt===attempts-1)throw new Error(`图片无法加载：${original.pathname}（已尝试${attempts}次，请检查网络后重新加载）`);
      onRetry(original,attempt+2,attempts);
      await new Promise(resolve=>setTimeout(resolve,retryDelay*(attempt+1)));
    }
  }
}

/** Load artwork independently so a failed image cannot prevent the other assets from appearing. */
export async function loadArtwork(onProgress=(done,total)=>{}, onRetry=(url,attempt,total)=>{}, { progressive = false } = {}) {
  const response = await fetch(new URL('manifest.json', ORIGINALS));
  if (!response.ok) throw new Error('原素材清单无法读取，请从项目根目录启动服务。');
  const manifest = await response.json();
  const units = new Map();
  const effects = new Map();
  const tasks = [];
  const result = { units, effects, ground: null };
  const queue = (url, store) => tasks.push({ url, store });
  queue(new URL('scene.webp', MAPS), image => { result.ground = image; });
  for (const entry of manifest.units) {
    const masterUrl = new URL(entry.master, ORIGINALS);
    const unit = { ...entry, masterUrl, masterImage: null, images: new Map(), requested: new Set() };
    units.set(entry.code, unit);
    queue(masterUrl, image => { unit.masterImage = image; });
  }
  for (const entry of manifest.effects) {
    queue(new URL(entry.path, ORIGINALS), image => effects.set(entry.code, image));
  }
  const total=tasks.length;
  let complete = 0;
  // Three concurrent requests limit mobile decode and network pressure.
  const worker = async () => {
    while (tasks.length) {
      const { url, store } = tasks.shift();
      try {
        store(await loadImage(url, { timeoutMs: 15000, onRetry }));
      } catch (error) {
        console.warn(error.message);
      }
      onProgress(++complete,total);
    }
  };
  const ready = Promise.all(Array.from({ length: 3 }, worker));
  if (!progressive) await ready;
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
  const base = ordered.find(tower => Math.abs(tower.x-x) <= LOOP_FOOTPRINT.width/2 && Math.abs(tower.y-y) <= LOOP_FOOTPRINT.height/2);
  const sprite = base || ordered.find(tower => Math.abs(tower.x-x) <= 45 && y >= tower.y-65 && y <= tower.y+25);
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

  const background = document.createElement('canvas');
  background.width = WORLD.width; background.height = WORLD.height;
  const backdrop = background.getContext('2d');
  let paintedGround;

  function drawBackground() {
    const { ground } = artwork;
    if (ground !== paintedGround) {
      paintedGround = ground;
      backdrop.fillStyle = '#252c43';
      backdrop.fillRect(0, 0, WORLD.width, WORLD.height);
      if (ground) {
        backdrop.save();
        backdrop.filter = 'saturate(.52)';
        backdrop.drawImage(ground, 0, 0, WORLD.width, WORLD.height);
        backdrop.restore();
      } else {
        backdrop.strokeStyle = '#776b52';
        backdrop.lineWidth = ROAD_WIDTH;
        backdrop.lineCap = 'round';
        for (const {x1,y1,x2,y2} of ROAD_SEGMENTS) {
          backdrop.beginPath();
          backdrop.moveTo(x1,y1);
          backdrop.lineTo(x2,y2);
          backdrop.stroke();
        }
      }
      backdrop.fillStyle = '#27395b50';
      backdrop.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    ctx.drawImage(background, 0, 0);
  }
  const loopSprites = new Map();
  function loopSprite(code) {
    const url=loopSpriteUrl(code);
    if(!url)return null;
    if(!loopSprites.has(code)){
      loopSprites.set(code,null);
      void loadImage(url,{attempts:2,timeoutMs:5000}).then(sprite=>loopSprites.set(code,sprite)).catch(()=>{});
    }
    return loopSprites.get(code);
  }
  const buildMask = document.createElement('canvas');
  buildMask.width = WORLD.width; buildMask.height = WORLD.height;
  const mask = buildMask.getContext('2d');
  const { bounds, exclusions } = LOOP_BUILD_AREA;
  mask.fillStyle = '#fff';
  mask.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  for (const area of exclusions) mask.clearRect(area.x, area.y, area.width, area.height);
  const freeMask = document.createElement('canvas');
  freeMask.width = WORLD.width; freeMask.height = WORLD.height;
  const free = freeMask.getContext('2d');

  /** @type {any[]} */
  let particles = [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frameState;

  function drawMarker(x, y, label, color, size = 16) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y-size, size, 0, Math.PI * 2);
    ctx.fillStyle = '#172721';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(label, x, y-size, color, size*.85);
    ctx.restore();
  }

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

  function traceRoute(points,color,width,dash=[]){
    if(!points?.length)return;
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();ctx.restore();
  }

  function drawRegions(regions) {
    for(const region of regions){
      const color=region.kind==='mine'?'#ffd398':effectColor(region.kind==='suppress'?'suppress':'fire');
      ctx.save();
      ctx.fillStyle=color+'16';
      ctx.strokeStyle=color+'ad';
      ctx.lineWidth=1.6;
      if(region.kind==='mine'||region.kind==='suppress')ctx.setLineDash([6,5]);
      ctx.beginPath();ctx.arc(region.x,region.y,region.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(region.kind==='mine')text('×',region.x,region.y,color,17);
      ctx.restore();
    }
  }

  function drawTowerVariant(entity) {
    const rune = entity.code === 'T13';
    const color = rune ? '#d59bff' : '#f6d085';
    const name = rune ? '符焰' : '三联';
    const sprite = loopSprite(entity.code);
    if (sprite) ctx.drawImage(sprite, entity.x-64, entity.y-128*.84, 128, 128);
    else drawMarker(entity.x, entity.y, name, color, 22);
    if (rune) ring(entity.x, entity.y+2, 30, color, .8, 2);
    else {
      ctx.fillStyle = '#ffe29b';
      for (const dx of [-23, 0, 23]) {
        ctx.beginPath();
        ctx.arc(entity.x+dx, entity.y-72-Math.abs(dx)*.3, 5, 0, Math.PI*2);
        ctx.fill();
      }
    }
    text(`${name} · Lv.${entity.level||1}${entity.route?' · '+entity.route:''}`, entity.x, entity.y+27, color, 12);
  }

  function drawUnit(entity, tower, elapsed) {
    if (entity.code === 'T13' || entity.code === 'T14') {
      drawTowerVariant(entity);
      return;
    }
    const unit = artwork.units.get(entity.assetCode || entity.code);
    const model = loopSprite(entity.code);
    const size = tower ? 128 : entity.boss ? 184 : 126;
    ctx.fillStyle = tower ? '#18271b3d' : '#18271b66';
    ctx.beginPath();
    ctx.ellipse(entity.x, entity.y + 3, tower ? 31 : entity.boss ? 31 : 19, tower ? 11 : entity.boss ? 9 : 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const sprite = model || (unit && spriteFor(unit, entity.angle || 0));
    if (sprite) {
      const bob = !tower && !reduceMotion ? Math.sin((entity.progress??elapsed*40) * .13) * 1.6 : 0;
      const recoil = model&&tower&&!reduceMotion ? Math.max(0,1-(elapsed-(entity.lastAttack??-1))/.14)*5 : 0;
      const x=entity.x-Math.cos(entity.angle||0)*recoil;
      ctx.save();
      if(entity.hidden)ctx.globalAlpha=.35;
      if(model&&Math.cos(entity.angle||0)<-.2){
        ctx.translate(x,0);ctx.scale(-1,1);
        ctx.drawImage(sprite,-size*.5,entity.y-size*.625+bob,size,size);
      }else ctx.drawImage(sprite, x - size * .5, entity.y - size * .625 + bob, size, size);
      ctx.restore();
    } else {
      const color = tower ? '#b9ecd1' : entity.boss ? '#ffd175' : '#f3a593';
      ctx.save();
      if(entity.hidden)ctx.globalAlpha=.35;
      drawMarker(entity.x, entity.y, entity.code, color, tower || entity.boss ? 22 : 17);
      ctx.restore();
    }
    if (tower) {
      text(entity.deputyStage===undefined?`Lv.${entity.level}`:`${entity.deputyStage}阶`, entity.x, entity.y + 27, '#f3d88e', 12);
      const stats = loopStats(entity, frameState);
      if (['radar', 'overclock', 'barrier', 'supply','support','healer'].includes(stats.kind)) {
        ring(entity.x, entity.y + 2, 34, stats.color, .45, 1.5);
      }
    }
    if (!tower) {
      const width = entity.boss ? 66 : 39;
      const top = entity.y - (entity.boss ? 78 : 53);
      ctx.fillStyle = '#15241ee0';
      ctx.fillRect(entity.x - width / 2 - 1, top - 1, width + 2, 7);
      ctx.fillStyle = entity.boss ? '#e8b35a' : entity.slowUntil > elapsed ? '#a6d9be' : '#8cc58c';
      ctx.fillRect(entity.x - width / 2, top, width * Math.max(0, entity.hp / entity.maxHp), 5);
      if(entity.shield>0){ctx.fillStyle='#80c8ed';ctx.fillRect(entity.x-width/2,top+7,width*Math.min(1,entity.shield/(entity.maxShield||1)),3);}
      const labels=[entity.elite?'◆':'',entity.special==='gold'?'金':entity.special==='challenge'?'挑战':'',
        entity.shieldHits>0?'盾×'+entity.shieldHits:'',entity.hidden?'隐':'',entity.armor>0?'甲':'',entity.healer?'疗':'',
        entity.mirrorType==='magic'||entity.magicUntil>elapsed?'法抗':'',entity.immuneUntil>elapsed?'免控':'',
        ...(entity.statuses||[]).filter(s=>s.until>elapsed&&['wet','armor','vulnerable','haste','magicArmor'].includes(s.kind)).map(s=>({wet:'浸',armor:'破',vulnerable:'标',haste:'疾',magicArmor:'法抗'})[s.kind])];
      text([...new Set(labels)].filter(Boolean).join('·'),entity.x,top-5,'#bfdfda',10);
      if(entity.channel){
        ctx.fillStyle='#f6bc66';ctx.fillRect(entity.x-width/2,top+12,width*Math.max(0,(elapsed-entity.channel.start)/(entity.channel.until-entity.channel.start)),2);
        const {kind,targetId}=entity.channel;
        const target=kind==='aid'?frameState.enemies.find(enemy=>enemy.id===targetId):frameState.towers.find(tower=>tower.id===targetId);
        const color=kind?.includes('heal')||kind==='aid'||kind==='reverse'?'#a8eed0':'#ffc391';
        if(target)traceRoute([{x:entity.x,y:entity.y-18},{x:target.x,y:target.y-18}],color+'aa',2,[7,5]);
        ring(entity.x,entity.y,26,color,.7,2);
      }
      if(entity.special==='gold')ring(entity.x,entity.y,23+(reduceMotion?0:2*Math.sin(elapsed*6)),'#f6cf66',.75,2);
      if(entity.special==='challenge')ring(entity.x,entity.y,24,'#ec8e67',.8,2);
      if (entity.boss) text('首领', entity.x, top - 14, '#ffe09e', 13);
    }
  }

  function event(event) {
    const lifetimes = { shot: .16, hit: .18, kill: .8, build: .65, upgrade: .8, sell: .55, income: .8, heal: .7,
      'shield-hit':.26,'boss-cast':.65,interrupt:.45,
      'skill-pulse':.42,'skill-link':.38,'skill-sector':.35,'skill-ray':.30 };
    if (!(event.type in lifetimes)) return;
    particles.push({ ...event, age: 0, life: lifetimes[event.type] });
    if (particles.length > 240) particles = particles.slice(-240);
  }

  function drawLoopEffect(item, progress) {
    const kind = item.kind ?? towerVisual(item.code).icon;
    const color = kind==='dual' && item.damageType==='magic' ? effectColor('beam') : effectColor(kind);
    const t = reduceMotion ? .5 : Math.max(0, Math.min(1, progress));
    ctx.lineWidth=2.5;
    ctx.strokeStyle=color;
    ctx.fillStyle=color;
    ctx.lineCap='round';
    if (item.type==='skill-pulse') {
      const outer=item.radius;
      ctx.beginPath();ctx.arc(item.x,item.y,outer,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.arc(item.x,item.y,outer*(.25+.7*t),0,Math.PI*2);ctx.stroke();
      if(kind==='net'||kind==='frost'){
        ctx.beginPath();
        for(let i=0;i<(kind==='frost'?6:4);i++){
          const angle=i*Math.PI/(kind==='frost'?3:2);
          ctx.moveTo(item.x,item.y);ctx.lineTo(item.x+Math.cos(angle)*outer*.7,item.y+Math.sin(angle)*outer*.7);
        }
        ctx.stroke();
      }
      return;
    }
    if (item.type==='skill-sector') {
      const half=item.degrees*Math.PI/360;
      for(const direction of item.reverse?[item.angle,item.angle+Math.PI]:[item.angle]){
        ctx.fillStyle=color+'24';
        ctx.beginPath();ctx.moveTo(item.x,item.y);ctx.arc(item.x,item.y,item.radius,direction-half,direction+half);ctx.closePath();ctx.fill();ctx.stroke();
      }
      return;
    }
    if (item.type==='skill-ray') {
      const end={x:item.x+Math.cos(item.angle)*item.radius,y:item.y+Math.sin(item.angle)*item.radius};
      traceRoute([item,end],color+'37',item.width);
      traceRoute([item,end],color,4);
      return;
    }
    if (item.code==='T25') return;
    const a={x:item.x,y:item.y-20},b={x:item.tx,y:item.ty-15};
    if(item.type==='skill-link'||['beam','arc','suppress','dual'].includes(kind)){
      const points=[a];
      if(kind==='arc'){
        const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
        for(let i=1;i<5;i++){
          const offset=(i%2?1:-1)*Math.min(10,length*.13);
          points.push({x:a.x+dx*i/5-dy/length*offset,y:a.y+dy*i/5+dx/length*offset});
        }
      }
      points.push(b);
      traceRoute(points,color+'55',item.type==='skill-link'?12:8);
      traceRoute(points,color,item.type==='skill-link'?3.5:2.5,kind==='radar'||kind==='charge'?[7,5]:[]);
      return;
    }
    const trail={x:a.x+(b.x-a.x)*Math.max(0,t-.27),y:a.y+(b.y-a.y)*Math.max(0,t-.27)};
    const tip={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    traceRoute([trail,tip],color,kind==='burst'?5:3);
    ctx.beginPath();ctx.arc(tip.x,tip.y,kind==='burst'?4:2.8,0,Math.PI*2);ctx.fill();
  }

  function drawParticles(dt) {
    for (const item of particles) {
      item.age += dt;
      if(item.age>=item.life)continue;
      const progress = item.age / item.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      if(['shot','skill-pulse','skill-link','skill-sector','skill-ray'].includes(item.type)){
        drawLoopEffect(item,progress);ctx.restore();continue;
      }
      const color = item.color || '#e6c779';
      if (item.type === 'hit') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x, item.y - 16, 4 + progress * 15, 0, Math.PI * 2);
        ctx.stroke();
        const effect = artwork.effects.get('F04');
        if (effect) ctx.drawImage(effect, item.x - 24, item.y - 40, 48, 48);
      } else if (['shield-hit','boss-cast','interrupt'].includes(item.type)) {
        const color=item.type==='shield-hit'?'#8cdbff':item.type==='interrupt'?'#beffe6':'#ffab62';
        ring(item.x,item.y,18+progress*26,color,1-progress,2);
      } else if (item.type === 'kill' || item.type === 'income' || item.type === 'sell') {
        text(`+${item.amount}`, item.x, item.y - 45 - progress * 24, '#ffe08b', 16);
        if (item.type === 'kill') {
          const sprite = loopSprite(item.code);
          if(sprite)ctx.drawImage(sprite,item.x-43,item.y-55+progress*15,86,86);
          const effect = artwork.effects.get('F06');
          if (effect) ctx.drawImage(effect, item.x - 35, item.y - 50, 70, 70);
        }
      } else if (item.type === 'heal') {
        text(`+${Math.round(item.amount)}`,item.x,item.y-40-progress*20,'#a6e7bf',14);
      } else {
        ring(item.x, item.y, 30 + progress * 25, item.type === 'upgrade' ? '#b2f4d5' : '#f3d177', 1, 3);
        text(item.type === 'upgrade' ? '升级' : '部署', item.x, item.y - 65 - progress * 10, '#fff0b5', 16);
      }
      ctx.restore();
    }
    particles = particles.filter(item => item.age < item.life);
  }

  function draw(state, selectedTowerId, placement, dt = 0, cursor = null, buildArea = placement) {
    frameState = state;
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawBackground();
    if (buildArea?.code) {
      free.clearRect(0, 0, WORLD.width, WORLD.height);
      free.drawImage(buildMask, 0, 0);
      const {width, height, gap} = LOOP_FOOTPRINT;
      const halfX = width + gap, halfY = height + gap;
      for (const tower of state.towers) {
        free.clearRect(tower.x-halfX,tower.y-halfY,halfX*2,halfY*2);
      }
      // Keep the terrain color where the building's center can go.
      free.save();
      free.globalCompositeOperation = 'source-out';
      free.fillStyle = '#101c17ac';
      free.fillRect(0, 0, WORLD.width, WORLD.height);
      free.restore();
      ctx.drawImage(freeMask, 0, 0);
    }
    drawRegions(state.regions);
    ctx.save();
    ctx.globalAlpha = reduceMotion ? .16 : .16 + Math.sin(state.elapsed * 2) * .05;
    ctx.strokeStyle = '#d0c39c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(ENTRY.x, ENTRY.y, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text('出怪核心', ENTRY.x, ENTRY.y + 73, '#ded8b8', 14);
    const selected = state.towers.find(tower => tower.id === selectedTowerId);
    if (selected) ring(selected.x, selected.y, 45, '#ffe39b', 1, 2.5);
    const position = placement || selected;
    const focus = placement?.code ? {...placement, level: 1} : selected;
    const range = focus ? loopStats(focus, state).range : 0;
    if (position && range && (!placement || placement.ok)) {
      ctx.save();
      ctx.fillStyle = '#f7df8612';
      ctx.strokeStyle = placement ? '#f7df86d9' : '#f7df8680';
      ctx.lineWidth = placement ? 2.5 : 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(position.x, position.y, range, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const actors = [
      ...state.towers.map(entity => ({ entity, tower: true })),
      ...state.enemies.map(entity => ({ entity, tower: false })),
    ].sort((a, b) => a.entity.y - b.entity.y);
    for (const actor of actors) drawUnit(actor.entity, actor.tower, state.elapsed);
    if (placement&&!placement.skill) {
      const color = placement.ok ? '#a4e6ae' : '#f29a84';
      const variant = placement.code === 'T13' || placement.code === 'T14';
      ctx.save();
      ctx.globalAlpha = placement.ok ? .78 : .45;
      if (variant) drawTowerVariant(placement);
      else {
        const sprite = loopSprite(placement.code) || artwork.units.get(placement.code)?.masterImage;
        if (sprite) ctx.drawImage(sprite, placement.x - 64, placement.y - 80, 128, 128);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = placement.ok ? '#71cf8b35' : '#e7786635';
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      if (!placement.ok) ctx.setLineDash([6,4]);
      const size = LOOP_FOOTPRINT;
      ctx.fillRect(placement.x-size.width/2,placement.y-size.height/2,size.width,size.height);
      ctx.strokeRect(placement.x-size.width/2,placement.y-size.height/2,size.width,size.height);
      const labelX = Math.max(130, Math.min(WORLD.width - 130, placement.x));
      const labelY = placement.y > 100 ? placement.y - 91 : placement.y + 49;
      text(placement.ok ? '可放置' : '不可放置', labelX, labelY, color, 17);
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
