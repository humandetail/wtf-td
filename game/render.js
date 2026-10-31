import { WORLD, FOOTPRINT, BUILD_CENTER_BOUNDS, BUILD_EXCLUSIONS, ENTRY } from './geometry.js';
import { TOWERS, towerStats, effectiveTowerStats } from './catalog.js';
import { DEFENSE_CORE, DEFENSE_LANES, DEFENSE_BUILD_EXCLUSIONS } from './defense-geometry.js';
import { HARVEST_SITES, HARVEST_DURATION } from './modes.js';

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
  const result = { units, effects, ground: null, defenseGround: null };
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
  let complete = 0;
  // ponytail: six concurrent image decodes keep the initial menu responsive.
  const worker = async () => {
    while (tasks.length) {
      await tasks.shift()();
      onProgress(++complete, manifest.units.length + manifest.effects.length + 2);
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
  const base = ordered.find(tower => Math.abs(tower.x-x) <= FOOTPRINT.width/2 && Math.abs(tower.y-y) <= FOOTPRINT.height/2);
  const sprite = base || ordered.find(tower => Math.abs(tower.x-x) <= FOOTPRINT.width/2 && y >= tower.y-65 && y <= tower.y+FOOTPRINT.height/2);
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
  ]) {
    const background = document.createElement('canvas');
    background.width = WORLD.width; background.height = WORLD.height;
    const backdrop = background.getContext('2d');
    backdrop.drawImage(ground, 0, 0, WORLD.width, WORLD.height);
    backdrop.fillStyle = '#7580671f';
    backdrop.fillRect(0, 0, WORLD.width, WORLD.height);
    backgrounds[mode] = background;
    const buildMask = document.createElement('canvas');
    buildMask.width = WORLD.width; buildMask.height = WORLD.height;
    const mask = buildMask.getContext('2d');
    mask.fillStyle = '#9ae6ad45';
    mask.fillRect(BUILD_CENTER_BOUNDS.x, BUILD_CENTER_BOUNDS.y, BUILD_CENTER_BOUNDS.width, BUILD_CENTER_BOUNDS.height);
    for (const area of exclusions) mask.clearRect(area.x, area.y, area.width, area.height);
    buildMasks[mode] = buildMask;
  }
  const freeMask = document.createElement('canvas');
  freeMask.width = WORLD.width; freeMask.height = WORLD.height;
  const free = freeMask.getContext('2d');

  /** @type {any[]} */
  let particles = [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function drawUnit(entity, tower, elapsed) {
    const unit = artwork.units.get(entity.code);
    const size = tower ? 128 : entity.boss ? 184 : 126;
    ctx.fillStyle = tower ? '#18271b3d' : '#18271b66';
    ctx.beginPath();
    ctx.ellipse(entity.x, entity.y + 3, tower ? 31 : entity.boss ? 31 : 19, tower ? 11 : entity.boss ? 9 : 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (unit) {
      const sprite = spriteFor(unit, entity.angle || 0);
      const bob = !tower && !reduceMotion ? Math.sin(entity.progress * .13) * 1.6 : 0;
      ctx.drawImage(sprite, entity.x - size * .5, entity.y - size * .625 + bob, size, size);
    }
    if (tower) {
      text(`Lv.${entity.level}`, entity.x, entity.y + 27, '#f3d88e', 12);
      if (['radar', 'overclock', 'barrier', 'supply'].includes(towerStats(entity).kind)) {
        ring(entity.x, entity.y + 2, 34, towerStats(entity).color, .45, 1.5);
      }
    } else {
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
    const lifetimes = { shot: .16, hit: .18, kill: .8, build: .65, upgrade: .8, sell: .55, income: .8, 'core-hit': .65, pulse: .8 };
    if (!(event.type in lifetimes)) return;
    particles.push({ ...event, age: 0, life: lifetimes[event.type] });
    if (particles.length > 240) particles = particles.slice(-240);
  }

  function drawParticles(dt) {
    for (const item of particles) {
      item.age += dt;
      const progress = item.age / item.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
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
      } else if (item.type === 'pulse') {
        ring(item.x, item.y, 45 + progress * 720, '#d5c1ff', 1, 4);
        ring(item.x, item.y, 30 + progress * 540, '#a8eaff', .7, 2);
      } else if (item.type === 'core-hit') {
        ring(item.x, item.y, 32 + progress * 36, '#ff947e', 1, 3);
        text(`核心 -${item.amount}`, item.x, item.y - 60 - progress * 18, '#ffd0b8', 16);
      } else {
        ring(item.x, item.y, 30 + progress * 25, item.type === 'upgrade' ? '#b2f4d5' : '#f3d177', 1, 3);
        text(item.type === 'upgrade' ? '升级' : '部署', item.x, item.y - 65 - progress * 10, '#fff0b5', 16);
      }
      ctx.restore();
    }
    particles = particles.filter(item => item.age < item.life);
  }

  function drawMission(state) {
    if (state.mode === 'harvest') {
      for (const [index,site] of HARVEST_SITES.entries()) {
        const [x,y] = DEFENSE_LANES[site.lane].points[0];
        const active = state.harvest?.site === index;
        const remaining = state.deposits[index];
        const color = remaining ? active ? '#a0f4e1' : '#e1cf9d' : '#a1aaa1';
        ring(x,y,active && !reduceMotion ? 28 + Math.sin(state.elapsed * 2) * 3 : 28,color,remaining ? .9 : .4,active ? 3 : 1.5);
        text(`${site.name} · ${remaining}${active ? ' · 采集中' : ''}`,Math.max(110,Math.min(1170,x)),y+46,color,13);
        if (active) {
          ctx.save(); ctx.strokeStyle = '#a0f4e1'; ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x,y,33,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-state.harvest.remaining/HARVEST_DURATION));
          ctx.stroke(); ctx.restore();
        }
      }
      if (state.extractionRemaining !== null) {
        ring(DEFENSE_CORE.x,DEFENSE_CORE.y,reduceMotion ? 65 : 65 + Math.sin(state.elapsed*2)*7,'#a0f4e1',.85,3);
        text(`撤离 · ${Math.ceil(state.extractionRemaining)} 秒`,DEFENSE_CORE.x,DEFENSE_CORE.y-83,'#bbffe6',18);
      }
    } else if (state.mode === 'storm') {
      if (state.stormActive) {
        ctx.fillStyle = '#60419322'; ctx.fillRect(0,0,WORLD.width,WORLD.height);
        ctx.save(); ctx.strokeStyle = '#c9b9f2'; ctx.globalAlpha = .22; ctx.lineWidth = 2;
        for (let i=0;i<15;i++) {
          const x=(i*97+(reduceMotion ? 0 : state.elapsed*32))%WORLD.width;
          const y=(i*137)%WORLD.height;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-35,y+15);ctx.stroke();
        }
        ctx.restore();
        ring(DEFENSE_CORE.x,DEFENSE_CORE.y,79,'#d3b9ff',.65,2);
      }
      text(state.stormActive ? '裂隙风暴 · 敌速 +25%' : '风暴间歇',640,34,state.stormActive ? '#e4ceff' : '#c8d5c2',15);
      const lanes=state.wave>0 && state.wave%2===0 ? [1,3] : [0,2];
      for (const lane of lanes) {
        const [x,y]=DEFENSE_LANES[lane].points[0];
        ring(x,y,27,'#cfb4fb',.8,2);
        text(`${DEFENSE_LANES[lane].name}路裂隙`,Math.max(100,Math.min(1180,x)),y+46,'#dfceff',13);
      }
    }
  }

  function draw(state, selectedTowerId, placement, dt = 0, cursor = null) {
    const mode = state.mode === 'loop' ? 'loop' : 'defense';
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(backgrounds[mode], 0, 0);
    drawMission(state);
    if (placement) {
      free.clearRect(0, 0, WORLD.width, WORLD.height);
      free.drawImage(buildMasks[mode], 0, 0);
      for (const tower of state.towers) {
        free.clearRect(tower.x - FOOTPRINT.width - FOOTPRINT.gap, tower.y - FOOTPRINT.height - FOOTPRINT.gap, (FOOTPRINT.width + FOOTPRINT.gap) * 2, (FOOTPRINT.height + FOOTPRINT.gap) * 2);
      }
      ctx.drawImage(freeMask, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = reduceMotion ? .16 : .16 + Math.sin(state.elapsed * 2) * .05;
    ctx.strokeStyle = '#d0c39c'; ctx.lineWidth = 1.5;
    const core = mode === 'defense' ? DEFENSE_CORE : ENTRY;
    ctx.beginPath(); ctx.ellipse(core.x, core.y, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    const coreLabel = {loop:'出怪核心',defense:'防守核心',harvest:'撤离核心',storm:'风暴核心'};
    text(coreLabel[state.mode] || '防守核心', core.x, core.y + 73, '#ded8b8', 14);
    if (state.mode === 'defense') {
      const lane = DEFENSE_LANES[state.waveActive ? state.attackLane : state.wave % 4];
      const [x,y] = lane.points[0];
      ring(x,y,27,state.waveActive ? '#ffb68a' : '#bddbd0',.8);
      text(`${lane.name}路${state.waveActive ? '来袭' : '预告'}`, x, y + 46, '#ffe1b5', 13);
    }
    const selected = state.towers.find(tower => tower.id === selectedTowerId);
    if (selected) ring(selected.x, selected.y, 45, '#ffe39b', 1, 2.5);
    const position = placement || selected;
    const range = placement ? TOWERS.find(tower => tower.code === placement.code)?.range : selected ? effectiveTowerStats(selected, state.towers).range : 0;
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
      ...state.enemies.map(entity => ({ entity, tower: false })),
    ].sort((a, b) => a.entity.y - b.entity.y);
    for (const actor of actors) drawUnit(actor.entity, actor.tower, state.elapsed);
    if (placement) {
      const color = placement.ok ? '#a4e6ae' : '#f29a84';
      const unit = artwork.units.get(placement.code);
      ctx.save();
      ctx.globalAlpha = .52;
      if (unit?.masterImage) ctx.drawImage(unit.masterImage, placement.x - 64, placement.y - 80, 128, 128);
      ctx.globalAlpha = 1;
      ctx.fillStyle = placement.ok ? '#71cf8b35' : '#e7786635';
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.fillRect(placement.x - FOOTPRINT.width / 2, placement.y - FOOTPRINT.height / 2, FOOTPRINT.width, FOOTPRINT.height);
      ctx.strokeRect(placement.x - FOOTPRINT.width / 2, placement.y - FOOTPRINT.height / 2, FOOTPRINT.width, FOOTPRINT.height);
      const labelX = Math.max(130, Math.min(WORLD.width - 130, placement.x));
      const labelY = placement.y > 100 ? placement.y - 91 : placement.y + 49;
      text(placement.ok ? '点击建造' : placement.message, labelX, labelY, color, 15);
      ctx.restore();
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
