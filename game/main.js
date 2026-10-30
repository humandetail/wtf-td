import { createGame } from './engine.js';
import { TOWERS, effectiveTowerStats, MAX_LEVEL } from './catalog.js';
import { SLOTS, WORLD } from './geometry.js';
import { createAudio } from './audio.js';
import { loadArtwork, createRenderer } from './render.js';

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`界面缺少必要元素：${id}`);
  return /** @type {T} */ (found);
}

const canvas = /** @type {HTMLCanvasElement} */ (element('game-canvas'));
const help = /** @type {HTMLDialogElement} */ (element('help-dialog'));
const game = createGame();
const audio = createAudio();
const roles = {
  direct: '单体输出', splash: '范围输出', chain: '连锁输出', slow: '减速控制',
  root: '定身控制', frost: '范围减速', radar: '射程增伤', overclock: '攻速辅助',
  supply: '金币补给', barrier: '区域减速',
};
let renderer;
let selectedSlot = null;
let armedCode = null;
let view = 'menu';
let lastPhase = 'menu';
let noticeUntil = 0;
let helpPaused = false;
let selectedSignature = '';

function showView(name) {
  view = name;
  for (const screen of ['menu', 'game', 'end']) element(`${screen}-screen`).hidden = name !== screen;
}

function notice(message, seconds = 2.8) {
  element('notice').textContent = message;
  element('notice').hidden = false;
  noticeUntil = performance.now() + seconds * 1000;
}

function syncEvents() {
  for (const event of game.drainEvents()) {
    renderer.event(event);
    audio.play(event);
    if (event.type === 'wave') notice(event.message, 2.5);
  }
}

function resultMessage(result) {
  notice(result.message);
  syncEvents();
  selectedSignature = '';
  updateUI();
}

function chooseSlot(slotId) {
  selectedSlot = slotId;
  selectedSignature = '';
  const occupied = game.state.towers.some(tower => tower.slotId === slotId);
  if (armedCode && !occupied) {
    const result = game.build(slotId, armedCode);
    if (result.ok) armedCode = null;
    resultMessage(result);
  } else {
    if (occupied) armedCode = null;
    updateUI();
  }
}

function updateSelection() {
  const tower = game.state.towers.find(tower => tower.slotId === selectedSlot);
  const signature = `${selectedSlot}/${tower?.code}/${tower?.level}/${game.state.gold}/${armedCode}`;
  if (selectedSignature === signature) return;
  selectedSignature = signature;
  element('selected-slot-label').textContent = selectedSlot ? `塔位 ${String(selectedSlot).padStart(2, '0')}` : '防线指挥';
  element('tower-panel').hidden = !tower;
  element('selection-hint').hidden = !!tower;
  if (!tower) {
    const pending = TOWERS.find(item => item.code === armedCode);
    element('selection-hint').textContent = pending
      ? `已选${pending.name}（${pending.price} 金币），点击空塔位部署。`
      : selectedSlot ? '塔位已选中，点击右侧防御单位即可建造。' : '点击地图空塔位，再选择防御单位；也可以先选单位。';
    return;
  }
  const stats = effectiveTowerStats(tower, game.state.towers);
  element('tower-title').textContent = `${stats.name} · Lv.${tower.level}`;
  element('tower-description').textContent = stats.description;
  const details = stats.damage > 0
    ? [`伤害 ${Math.round(stats.damage)}`, `间隔 ${stats.interval.toFixed(2)} 秒`, `射程 ${Math.round(stats.range)}`]
    : stats.kind === 'supply' ? [`每 8 秒 +${stats.income} 金币`]
      : [`作用半径 ${stats.range}`, stats.kind === 'barrier' ? `减速 ${Math.round((1 - stats.slow) * 100)}%` : `强化 ${Math.round(stats.boost * 100)}%`];
  element('tower-stats').replaceChildren(...details.map(detail => {
    const span = document.createElement('span');
    span.textContent = detail;
    return span;
  }));
  const upgrade = /** @type {HTMLButtonElement} */ (element('upgrade-button'));
  upgrade.textContent = tower.level === MAX_LEVEL ? '已达最高等级' : `升级 · ${stats.upgradeCost} 金币`;
  upgrade.disabled = tower.level === MAX_LEVEL || game.state.gold < stats.upgradeCost;
  element('sell-button').textContent = `出售 · 回收 ${stats.sellValue} 金币`;
}

function updateUI() {
  const state = game.state;
  element('gold-value').textContent = String(Math.floor(state.gold));
  element('wave-value').textContent = state.endless ? `∞ ${state.wave}` : `${state.wave} / 20`;
  element('enemy-value').textContent = String(state.enemies.length);
  element('enemy-limit').textContent = String(state.limit);
  element('kill-value').textContent = String(state.kills);
  element('next-wave-value').textContent = state.wave >= 20 && !state.endless
    ? '清理剩余敌人' : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒`;
  const pressure = state.enemies.length / state.limit;
  const fill = element('pressure-fill');
  fill.style.width = `${Math.min(1, pressure) * 100}%`;
  fill.classList.toggle('warning', pressure >= .55 && pressure < .8);
  fill.classList.toggle('danger', pressure >= .8);
  element('pause-button').textContent = state.paused ? '继续' : '暂停';
  element('pause-button').setAttribute('aria-pressed', String(state.paused));
  element('speed-button').textContent = `${state.speed}× 速度`;
  element('mute-button').textContent = audio.muted ? '声音关' : '声音开';
  element('mute-button').setAttribute('aria-pressed', String(audio.muted));
  for (const card of element('shop-list').querySelectorAll('.tower-card')) {
    const code = /** @type {HTMLButtonElement} */ (card).dataset.code;
    const definition = TOWERS.find(item => item.code === code);
    card.setAttribute('aria-pressed', String(armedCode === code));
    card.classList.toggle('unaffordable', state.gold < definition.price);
  }
  updateSelection();
  if (lastPhase !== state.phase) {
    lastPhase = state.phase;
    if (state.phase === 'victory' || state.phase === 'defeat') showEnd();
  }
}

function showEnd() {
  const state = game.state;
  const success = state.phase === 'victory';
  element('end-title').textContent = success ? '环路守卫成功' : '防线失守';
  element('end-description').textContent = success
    ? '常规二十波已清场。你可以保留防线，迎接无尽挑战。'
    : `场上怪物达到 ${state.limit} 只。调整火力覆盖与升级节奏，再守一局。`;
  element('end-stats').innerHTML = [
    ['抵御波次', state.wave], ['击杀敌人', state.kills], ['守卫时间', `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`],
  ].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  element('endless-button').hidden = !success;
  showView('end');
  element(success ? 'endless-button' : 'restart-button').focus();
}

function enterGame(restart = false) {
  void audio.unlock();
  if (restart) {
    game.restart();
    selectedSlot = null;
    armedCode = null;
    renderer.reset();
  } else if (game.state.phase === 'menu') game.start();
  else if (game.state.paused) game.togglePause();
  showView('game');
  lastPhase = game.state.phase;
  updateUI();
  canvas.focus({ preventScroll: true });
}

function bindControls() {
  element('start-button').addEventListener('click', () => enterGame());
  element('restart-button').addEventListener('click', () => enterGame(true));
  element('endless-button').addEventListener('click', () => {
    void audio.unlock();
    const result = game.continueEndless();
    if (!result.ok) return;
    renderer.reset();
    lastPhase = 'playing';
    showView('game');
    resultMessage(result);
    canvas.focus({ preventScroll: true });
  });
  element('pause-button').addEventListener('click', () => { game.togglePause(); updateUI(); });
  element('speed-button').addEventListener('click', () => { game.setSpeed(game.state.speed % 3 + 1); updateUI(); });
  element('mute-button').addEventListener('click', () => { void audio.unlock(); audio.setMuted(!audio.muted); updateUI(); });
  element('menu-button').addEventListener('click', () => {
    if (!game.state.paused) game.togglePause();
    element('start-button').textContent = '继续布防 →';
    showView('menu');
    element('start-button').focus();
  });
  element('upgrade-button').addEventListener('click', () => resultMessage(game.upgrade(selectedSlot)));
  element('sell-button').addEventListener('click', () => resultMessage(game.sell(selectedSlot)));
  element('help-button').addEventListener('click', () => {
    helpPaused = game.state.phase === 'playing' && !game.state.paused;
    if (helpPaused) game.togglePause();
    help.showModal();
  });
  element('close-help').addEventListener('click', () => help.close());
  help.addEventListener('close', () => {
    if (helpPaused && view === 'game' && game.state.paused) game.togglePause();
    helpPaused = false;
    updateUI();
  });
  element('shop-list').addEventListener('click', event => {
    const card = /** @type {HTMLElement} */ (event.target).closest('button[data-code]');
    if (!card) return;
    const code = /** @type {HTMLButtonElement} */ (card).dataset.code;
    void audio.unlock();
    const occupied = game.state.towers.some(tower => tower.slotId === selectedSlot);
    if (selectedSlot && !occupied) {
      const result = game.build(selectedSlot, code);
      if (result.ok) armedCode = null;
      resultMessage(result);
    } else {
      armedCode = code;
      if (occupied) selectedSlot = null;
      notice(`已选${TOWERS.find(tower => tower.code === code).name}，点击空塔位部署。`);
      updateUI();
    }
  });
  function pointer(event) {
    const bounds = canvas.getBoundingClientRect();
    return renderer.hitTest((event.clientX - bounds.left) / bounds.width * WORLD.width, (event.clientY - bounds.top) / bounds.height * WORLD.height);
  }
  canvas.addEventListener('click', event => {
    const slot = pointer(event);
    void audio.unlock();
    if (slot) chooseSlot(slot);
    else { selectedSlot = null; updateUI(); }
  });
  canvas.addEventListener('pointermove', event => renderer.setHover(pointer(event)));
  canvas.addEventListener('pointerleave', () => renderer.setHover(null));
  canvas.addEventListener('keydown', event => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const index = SLOTS.findIndex(slot => slot.id === selectedSlot);
      const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      selectedSlot = SLOTS[(index + delta + SLOTS.length) % SLOTS.length].id;
      selectedSignature = '';
      updateUI();
    } else if (event.key === 'Enter' && selectedSlot && armedCode) {
      event.preventDefault(); chooseSlot(selectedSlot);
    }
  });
  document.addEventListener('keydown', event => {
    if (help.open || view !== 'game') return;
    if (event.key === ' ' && !['BUTTON', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); game.togglePause(); updateUI();
    } else if (event.key === 'Escape') {
      selectedSlot = null; armedCode = null; updateUI();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.phase === 'playing' && !game.state.paused) {
      game.togglePause(); notice('离开页面，已自动暂停。'); updateUI();
    }
  });
}

async function boot() {
  try {
    const artwork = await loadArtwork((done, total) => {
      element('loading-progress').textContent = `读取防御单位与地图 · ${done} / ${total}`;
    });
    renderer = createRenderer(canvas, artwork);
    const shop = element('shop-list');
    for (const tower of TOWERS) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'tower-card'; card.dataset.code = tower.code;
      card.setAttribute('aria-pressed', 'false');
      card.title = tower.description;
      const image = document.createElement('img');
      image.src = artwork.units.get(tower.code).masterImage.src; image.alt = '';
      const name = document.createElement('strong'); name.textContent = tower.name;
      const price = document.createElement('span'); price.className = 'price'; price.textContent = `${tower.price} 金币`;
      const role = document.createElement('small'); role.className = 'role'; role.textContent = roles[tower.kind];
      card.append(image, name, price, role); shop.append(card);
    }
    bindControls();
    element('loading-screen').hidden = true;
    showView('menu');
    updateUI();
    let previous = performance.now();
    let uiIn = 0;
    const frame = now => {
      const dt = Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (view === 'game') {
        game.tick(dt);
        syncEvents();
        renderer.draw(game.state, selectedSlot, armedCode, dt);
        uiIn -= dt;
        if (uiIn <= 0) { updateUI(); uiIn = .1; }
        if (performance.now() > noticeUntil) element('notice').hidden = true;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch (error) {
    element('loading-progress').textContent = `加载失败：${error.message}`;
    const retry = document.createElement('button');
    retry.className = 'button primary'; retry.textContent = '重新加载';
    retry.addEventListener('click', () => window.location.reload());
    element('loading-screen').append(retry);
    console.error(error);
  }
}

void boot();
