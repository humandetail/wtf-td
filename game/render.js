import { WORLD, FOOTPRINT, BUILD_CENTER_BOUNDS, BUILD_EXCLUSIONS, ENTRY } from './geometry.js';
import { TOWERS, towerStats, effectiveTowerStats } from './catalog.js';

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
  const result = { units, effects, ground: null };
  for (const entry of manifest.units) {
    const unit = { ...entry, masterImage: null, images: new Map(), requested: new Set() };
    units.set(entry.code, unit);
    tasks.push(async () => { unit.masterImage = await loadImage(new URL(entry.master, ORIGINALS)); });
  }
  for (const entry of manifest.effects) {
    tasks.push(async () => { effects.set(entry.code, await loadImage(new URL(entry.path, ORIGINALS))); });
  }
  tasks.push(async () => { result.ground = await loadImage(new URL('scene.png', MAPS)); });
  let complete = 0;
  // ponytail: six concurrent image decodes keep the initial menu responsive.
  const worker = async () => {
    while (tasks.length) {
      await tasks.shift()();
      onProgress(++complete, manifest.units.length + manifest.effects.length + 1);
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

  const background = document.createElement('canvas');
  background.width = WORLD.width;
  background.height = WORLD.height;
  const backdrop = background.getContext('2d');
  backdrop.drawImage(artwork.ground, 0, 0, WORLD.width, WORLD.height);
  // One scene-wide stone tint calms texture without creating patch boundaries.
  backdrop.fillStyle = '#7580671f';
  backdrop.fillRect(0, 0, WORLD.width, WORLD.height);

  const buildMask = document.createElement('canvas');
  buildMask.width = WORLD.width; buildMask.height = WORLD.height;
  const mask = buildMask.getContext('2d');
  mask.fillStyle = '#9ae6ad45';
  mask.fillRect(BUILD_CENTER_BOUNDS.x, BUILD_CENTER_BOUNDS.y, BUILD_CENTER_BOUNDS.width, BUILD_CENTER_BOUNDS.height);
  for (const area of BUILD_EXCLUSIONS) mask.clearRect(area.x, area.y, area.width, area.height);
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
    const lifetimes = { shot: .16, hit: .18, kill: .8, build: .65, upgrade: .8, sell: .55, income: .8 };
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
      } else {
        ring(item.x, item.y, 30 + progress * 25, item.type === 'upgrade' ? '#b2f4d5' : '#f3d177', 1, 3);
        text(item.type === 'upgrade' ? '升级' : '部署', item.x, item.y - 65 - progress * 10, '#fff0b5', 16);
      }
      ctx.restore();
    }
    particles = particles.filter(item => item.age < item.life);
  }

  function draw(state, selectedTowerId, placement, dt = 0, cursor = null) {
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(background, 0, 0);
    if (placement) {
      free.clearRect(0, 0, WORLD.width, WORLD.height);
      free.drawImage(buildMask, 0, 0);
      for (const tower of state.towers) {
        free.clearRect(tower.x - FOOTPRINT.width - FOOTPRINT.gap, tower.y - FOOTPRINT.height - FOOTPRINT.gap, (FOOTPRINT.width + FOOTPRINT.gap) * 2, (FOOTPRINT.height + FOOTPRINT.gap) * 2);
      }
      ctx.drawImage(freeMask, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = reduceMotion ? .16 : .16 + Math.sin(state.elapsed * 2) * .05;
    ctx.strokeStyle = '#d0c39c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(ENTRY.x, ENTRY.y, 29, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    text('出怪核心', ENTRY.x, ENTRY.y + 73, '#ded8b8', 14);
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
