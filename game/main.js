import { createGame } from './engine.js';
import { TOWERS, effectiveTowerStats } from './catalog.js';
import { TECHNOLOGIES, deploymentStats, towerUnlockLevel } from './research.js';
import { MODE_DETAILS } from './modes.js';
import { WORLD } from './geometry.js';
import { DEFENSE_LANES } from './defense-geometry.js';
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
const sessions = { loop: createGame(), defense: createGame({ mode: 'defense' }), escort: createGame({ mode: 'escort' }), maze: createGame({ mode: 'maze' }) };
const modeNames = Object.keys(sessions);
let game = sessions.loop;
const audio = createAudio();
const WALL = { code: 'WALL', name: '能量路障', price: 20, description: '改变敌人路径；不能封死通路，拆除返还 15 金币。', kind: 'wall' };
const buildItems = [...TOWERS, WALL];
const roles = {
  wall: '改变行军路线',
  direct: '单体输出', splash: '范围输出', chain: '连锁输出', slow: '减速控制',
  root: '定身控制', frost: '范围减速', radar: '射程增伤', overclock: '攻速辅助',
  supply: '金币补给', barrier: '区域减速',
};
let renderer;
let selectedTowerId = null;
let armedCode = null;
let relocatingId = null;
let placement = null;
let pointerPosition = null;
let keyboardMode = false;
const keyboardPointer = { x: 190, y: 140 };
let view = 'menu';
let lastPhase = 'menu';
let noticeUntil = 0;
let helpPaused = false;
let selectedSignature = '';
let drawerTrigger = canvas;

function setBuildDock(open) {
  const dock = element('build-dock');
  const restoreFocus = !open && dock.contains(document.activeElement);
  if (open) setDrawer();
  dock.hidden = !open;
  const button = element('focus-button');
  button.setAttribute('aria-pressed', String(!open));
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? '收起建造' : '建造';
  button.title = open ? '收起建造浮层' : '展开建造浮层，选择防御工事';
  if (restoreFocus) canvas.focus({ preventScroll: true });
}

function setDrawer(mode = null, trigger = canvas) {
  if (mode) setBuildDock(false);
  const drawer = element('command-drawer');
  const restoreFocus = drawer.contains(document.activeElement);
  drawer.hidden = !mode;
  element('research-panel').hidden = mode !== 'research';
  element('selection-panel').hidden = mode !== 'tower';
  element('mission-panel').hidden = mode !== 'mission';
  element('drawer-title').textContent = mode === 'tower' ? '工事详情' : mode === 'mission' ? '任务指挥' : '科技指挥';
  element('research-button').setAttribute('aria-expanded', String(mode === 'research'));
  element('mission-button').setAttribute('aria-expanded', String(mode === 'mission'));
  if (mode) {
    drawerTrigger = trigger;
    element('close-drawer-button').focus({ preventScroll: true });
  } else if (restoreFocus) {
    const target = drawerTrigger.isConnected && !drawerTrigger.closest('[hidden]') ? drawerTrigger : canvas;
    target.focus({ preventScroll: true });
  }
}

function fitBattlefield() {
  const frame = canvas.parentElement;
  new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    const fittedWidth = Math.max(0, Math.min(width, height * WORLD.width / WORLD.height));
    canvas.style.width = `${fittedWidth}px`;
    canvas.style.height = `${fittedWidth * WORLD.height / WORLD.width}px`;
  }).observe(frame);
}

function showView(name) {
  if (name !== 'game') setDrawer();
  if (name === 'menu') updateMenu();
  view = name;
  document.body.classList.toggle('in-game', name === 'game');
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
    if (['wave', 'core-hit', 'wave-clear', 'checkpoint', 'convoy-toggle', 'convoy-repair', 'relocate', 'supply'].includes(event.type)) notice(event.message, event.type === 'core-hit' ? 4 : 2.5);
    if (event.type === 'research-complete') {
      notice(event.message, 4);
      selectedSignature = '';
      updateUI();
    }
  }
}

function resultMessage(result) {
  notice(result.message);
  syncEvents();
  selectedSignature = '';
  updateUI();
}

function refreshPlacement() {
  const pending = buildItems.find(item => item.code === armedCode);
  const moving = game.state.towers.find(item => item.id === relocatingId);
  placement = pointerPosition && (armedCode || moving)
    ? { ...pointerPosition, code: moving?.code || armedCode,
      ...(moving ? { towerId: moving.id, relocating: true, ...game.canRelocate(moving.id, pointerPosition.x, pointerPosition.y) }
        : game.canBuild(pointerPosition.x, pointerPosition.y, armedCode)) }
    : null;
  const eligibility = pending ? game.canBuildType(pending.code) : null;
  const message = moving ? `搬迁 ${TOWERS.find(item => item.code === moving.code).name} · 25 金币 · ${placement?.message || '选择新位置，保留等级，停机 3 秒；右键或 Esc 取消'}`
    : pending ? `${pending.name} · ${pending.price} 金币 · ${placement ? placement.message : !eligibility.ok ? eligibility.message : '移动到绿色区域放置，可连续建造'}`
      : '先点顶部“建造”选择工事，再在绿色区域放置。';
  const status = element('build-status');
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('invalid', !!placement && !placement.ok || !!pending && !eligibility.ok);
  element('cancel-build-button').hidden = !armedCode && !moving;
}

function cancelBuild() {
  armedCode = null;
  relocatingId = null;
  placement = null;
  updateUI();
}

function activatePoint(point) {
  pointerPosition = point;
  if (relocatingId !== null) {
    const result = game.relocate(relocatingId, point.x, point.y);
    if (result.ok) relocatingId = null;
    resultMessage(result);
  } else if (armedCode) {
    const result = game.build(point.x, point.y, armedCode);
    if (result.ok) selectedTowerId = result.towerId;
    resultMessage(result);
  } else {
    selectedTowerId = renderer.hitTest(point.x, point.y, [...game.state.towers, ...game.state.walls]);
    if (selectedTowerId) setDrawer('tower', canvas);
    else { setDrawer(); notice('先点顶部“建造”选择工事，再在绿色区域放置。'); }
    updateUI();
  }
}

function updateSelection() {
  const tower = [...game.state.towers, ...game.state.walls].find(tower => tower.id === selectedTowerId);
  const signature = `${selectedTowerId}/${game.state.towers.map(item => `${item.id}:${item.level}:${item.x}:${item.y}:${item.readyAt > game.state.elapsed}`).join(',')}/${game.state.gold}/${armedCode}/${game.state.tech.deployment}:${game.state.tech.reinforcement}/${game.state.phase}/${relocatingId}/${tower?.readyAt > game.state.elapsed}`;
  if (selectedSignature === signature) return;
  selectedSignature = signature;
  element('selected-slot-label').textContent = armedCode ? '建造模式' : tower ? '已选防御单位' : '防线指挥';
  element('tower-panel').hidden = !tower;
  element('selection-hint').hidden = !!tower;
  if (!tower) {
    const pending = buildItems.find(item => item.code === armedCode);
    element('selection-hint').textContent = pending
      ? `已选${pending.name}（${pending.price} 金币），在绿色区域任意放置。右键或 Esc 取消建造。`
      : '先点顶部“建造”选择工事，再在绿色区域放置；点击已有工事查看属性。';
    return;
  }
  const wall = tower.code === 'WALL';
  element('upgrade-button').hidden = wall;
  const relocate = /** @type {HTMLButtonElement} */ (element('relocate-button'));
  relocate.hidden = wall || game.state.mode !== 'escort';
  relocate.disabled = game.state.phase !== 'playing' || game.state.gold < 25 || tower.readyAt > game.state.elapsed;
  relocate.textContent = tower.readyAt > game.state.elapsed ? '搬迁停机中 · 3 秒后恢复' : '搬迁 · 25 金币 / 停机 3 秒';
  if (wall) {
    element('tower-title').textContent = WALL.name;
    element('tower-description').textContent = WALL.description;
    element('tower-stats').replaceChildren();
    /** @type {HTMLButtonElement} */ (element('sell-button')).disabled = game.state.phase !== 'playing';
    element('sell-button').textContent = '拆除 · 回收 15 金币';
    return;
  }
  const stats = effectiveTowerStats(tower, game.state.towers.filter(item => !(item.readyAt > game.state.elapsed)));
  element('tower-title').textContent = `${stats.name} · Lv.${tower.level}`;
  element('tower-description').textContent = `${stats.description}${tower.readyAt > game.state.elapsed ? ' · 搬迁停机中，暂停攻击、辅助与收入。' : ''}`;
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
  const eligibility = game.canUpgrade(tower.id);
  upgrade.textContent = eligibility.ok ? `升级 · ${stats.upgradeCost} 金币` : eligibility.message;
  upgrade.title = eligibility.message;
  upgrade.disabled = !eligibility.ok;
  /** @type {HTMLButtonElement} */ (element('sell-button')).disabled = game.state.phase !== 'playing';
  element('sell-button').textContent = `出售 · 回收 ${stats.sellValue} 金币`;
}

function updateResearch() {
  const { state } = game;
  const capacity = deploymentStats(state.tech.deployment).capacity;
  element('tower-capacity').textContent = `容量 ${state.towers.length} / ${capacity}`;
  for (const kind of /** @type {const} */ (['deployment', 'reinforcement'])) {
    const technology = TECHNOLOGIES[kind];
    const level = state.tech[kind];
    const next = technology.levels[level + 1];
    element(`${kind}-level`).textContent = `${technology.name} · Lv.${level}`;
    element(`${kind}-details`).textContent = next
      ? `${next.cost} 金币 · ${next.duration} 秒 · ${kind === 'deployment'
        ? `容量 ${next.capacity}，解锁 ${next.unlocks.map(code => TOWERS.find(tower => tower.code === code).name).join('、')}`
        : `所有塔可升至 ${next.maxTowerLevel} 级（需另付升级费用）`}`
      : `已满级 · ${kind === 'deployment' ? `容量 ${capacity}，全部塔种已解锁` : `所有塔可升至 ${technology.levels[level].maxTowerLevel} 级`}`;
    const eligibility = game.canResearch(kind);
    const button = /** @type {HTMLButtonElement} */ (element(`${kind}-research-button`));
    button.textContent = eligibility.ok ? `研究 Lv.${level + 1}` : eligibility.message;
    button.title = eligibility.message;
    button.disabled = !eligibility.ok;
  }
  const research = state.research;
  const progress = /** @type {HTMLProgressElement} */ (element('research-progress'));
  progress.hidden = !research;
  progress.max = research?.duration || 1;
  progress.value = research ? research.duration - research.remaining : 0;
  const frozen = state.phase !== 'playing' || state.paused;
  const status = research
    ? `${TECHNOLOGIES[research.kind].name} Lv.${research.level} · ${frozen ? '已冻结 · ' : ''}剩余 ${research.remaining.toFixed(1)} 秒`
    : '研究位空闲 · 同时研究一项';
  if (element('research-status').textContent !== status) element('research-status').textContent = status;
  const cancel = /** @type {HTMLButtonElement} */ (element('cancel-research-button'));
  cancel.hidden = !research;
  cancel.disabled = state.phase !== 'playing';
  cancel.textContent = research ? `取消研究 · 退还 ${research.cost} 金币` : '取消研究';
}

function updateMission() {
  const state = game.state;
  const escort = state.mode === 'escort';
  const maze = state.mode === 'maze';
  const playable = state.phase === 'playing';
  element('mission-button').hidden = !escort && !maze;
  element('escort-mission').hidden = !escort;
  element('maze-mission').hidden = !maze;
  if (escort) {
    const convoy = state.convoy;
    const frozen = !playable || state.paused ? ' · 已冻结' : '';
    element('mission-objective').textContent = '将灵枢载具送到终点；停车时敌人仍会追赶、攻击。';
    element('convoy-status').textContent = `${convoy.moving ? '行进中' : '已停车'} · ${Math.floor(convoy.progress)} / ${convoy.length} · 补给站 ${convoy.checkpointIndex} / 2${frozen}`;
    const progress = /** @type {HTMLProgressElement} */ (element('convoy-progress'));
    progress.max = convoy.length;
    progress.value = convoy.progress;
    /** @type {HTMLButtonElement} */ (element('convoy-toggle-button')).disabled = !playable;
    element('convoy-toggle-button').textContent = convoy.moving ? '停车布防' : '启程 / 继续前进';
    /** @type {HTMLButtonElement} */ (element('convoy-repair-button')).disabled = !playable || convoy.moving || state.coreHealth >= state.maxCoreHealth || state.gold < 60;
    element('next-wave-label').textContent = '下一次伏击';
    element('next-wave-value').textContent = `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒 · 前后夹击`;
  } else if (maze) {
    element('mission-objective').textContent = '守住右侧出口，清空十二波；布置工事改变敌人的真实路线。';
    element('maze-route-status').textContent = `当前路线 ${Math.round(state.mazeLength)} · 路障 ${state.walls.length} / 24`;
    const eligibility = game.canBuildType('WALL');
    /** @type {HTMLButtonElement} */ (element('maze-wall-button')).disabled = !eligibility.ok;
    element('maze-wall-button').title = eligibility.message;
    element('next-wave-label').textContent = state.waveActive ? '本波进攻' : '下一波';
    element('next-wave-value').textContent = state.waveActive ? '左侧入口 → 右侧出口' : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒`;
  }
}

function updateUI() {
  const state = game.state;
  element('gold-value').textContent = String(Math.floor(state.gold));
  element('wave-value').textContent = state.endless ? `∞ ${state.wave}` : state.mode === 'escort' ? String(state.wave) : `${state.wave} / ${state.mode === 'maze' ? 12 : 20}`;
  element('enemy-value').textContent = String(state.enemies.length);
  element('enemy-limit').textContent = String(state.limit);
  element('kill-value').textContent = String(state.kills);
  const defense = state.mode !== 'loop';
  element('current-mode').textContent = MODE_DETAILS[state.mode].name;
  canvas.setAttribute('aria-label', `${MODE_DETAILS[state.mode].name}战场。先点顶部“建造”选择工事，再在绿色区域放置。方向键移动光标，Shift 加方向键微调，Enter 放置，Esc 取消。`);
  element('pressure-label').textContent = state.mode === 'escort' ? '载具耐久' : state.mode === 'maze' ? '出口耐久' : defense ? '核心耐久' : '环路积怪';
  element('loop-pressure-value').hidden = defense;
  element('core-pressure-value').hidden = !defense;
  element('defense-enemy-status').hidden = !defense;
  element('core-health-value').textContent = String(Math.ceil(state.coreHealth));
  element('core-health-limit').textContent = String(state.maxCoreHealth);
  element('defense-enemy-value').textContent = String(state.enemies.length);
  element('next-wave-label').textContent = defense && state.waveActive ? '本波进攻' : '下一波';
  element('next-wave-value').textContent = defense
    ? state.waveActive ? `${DEFENSE_LANES[state.attackLane]?.name || '作战中'}`
      : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒 · ${DEFENSE_LANES[state.wave % DEFENSE_LANES.length].name}`
    : state.wave >= 20 && !state.endless ? '清理剩余敌人' : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒`;
  const pressure = defense ? 1 - state.coreHealth / state.maxCoreHealth : state.enemies.length / state.limit;
  const fill = element('pressure-fill');
  fill.style.width = `${Math.max(0, Math.min(1, defense ? 1 - pressure : pressure)) * 100}%`;
  fill.classList.toggle('warning', pressure >= .55 && pressure < .8);
  fill.classList.toggle('danger', pressure >= .8);
  element('pause-button').textContent = state.paused ? '继续' : '暂停';
  element('pause-button').setAttribute('aria-pressed', String(state.paused));
  element('speed-button').textContent = `${state.speed}× 速度`;
  element('mute-button').textContent = audio.muted ? '声音关' : '声音开';
  element('mute-button').setAttribute('aria-pressed', String(audio.muted));
  for (const card of element('shop-list').querySelectorAll('.tower-card')) {
    const code = /** @type {HTMLButtonElement} */ (card).dataset.code;
    const definition = buildItems.find(item => item.code === code);
    /** @type {HTMLButtonElement} */ (card).hidden = code === 'WALL' && state.mode !== 'maze';
    card.setAttribute('aria-pressed', String(armedCode === code));
    const eligibility = game.canBuildType(code);
    card.classList.toggle('unaffordable', !eligibility.ok);
    card.classList.toggle('locked', code !== 'WALL' && state.tech.deployment < towerUnlockLevel(code));
    card.querySelector('.availability').textContent = eligibility.ok ? '可建造' : eligibility.message;
    card.setAttribute('title', `${definition.description} · ${eligibility.message}`);
  }
  updateResearch();
  updateMission();
  refreshPlacement();
  updateSelection();
  if (lastPhase !== state.phase) {
    lastPhase = state.phase;
    if (state.phase === 'victory' || state.phase === 'defeat') showEnd();
  }
}

function showEnd() {
  const state = game.state;
  const success = state.phase === 'victory';
  const endings = {
    loop: ['环路守卫成功', '防线失守', '常规二十波已清场。保留防线，迎接无尽挑战。', `场上怪物达到 ${state.limit} 只。调整火力覆盖与升级节奏，再守一局。`],
    defense: ['核心守卫成功', '核心已被击破', '二十波进攻已全部清场，核心仍然屹立。进入无尽保留剩余耐久与研究进度。', '漏过的敌人耗尽了核心耐久。调整入口布防与升级节奏，再守一局。'],
    escort: ['灵枢护送成功', '载具已被摧毁', '载具已平安抵达终点。启停、维修与搬迁共同完成护送，本任务无无尽。', '载具耐久耗尽。提前把升级塔搬至下一段路线，停车维修后再启程。'],
    maze: ['自由迷宫通关', '出口防线失守', '十二波已清场。进入无尽保留迷宫、塔、耐久与科技。', '出口耐久耗尽。利用路障增加绕行距离，并保留一条可达通路。'],
  };
  const ending = endings[state.mode];
  element('end-title').textContent = ending[success ? 0 : 1];
  element('end-description').textContent = ending[success ? 2 : 3];
  element('end-stats').innerHTML = [
    ...(state.mode !== 'loop' ? [[state.mode === 'escort' ? '载具耐久' : state.mode === 'maze' ? '出口耐久' : '核心耐久', `${Math.ceil(state.coreHealth)} / ${state.maxCoreHealth}`], ...(state.mode === 'escort' ? [] : [['漏过敌人', state.leaks]])] : []),
    ...(state.mode === 'escort' ? [['护送距离', `${Math.floor(state.convoy.progress)} / ${state.convoy.length}`]] : []),
    ['抵御波次', state.wave], ['击杀敌人', state.kills], ['守卫时间', `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`],
  ].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  const endlessAvailable = success && state.mode !== 'escort';
  element('endless-button').hidden = !endlessAvailable;
  showView('end');
  element(endlessAvailable ? 'endless-button' : 'restart-button').focus();
}

function clearTransient() {
  selectedTowerId = null;
  relocatingId = null;
  armedCode = null;
  placement = null;
  pointerPosition = null;
  keyboardMode = false;
  keyboardPointer.x = 190;
  keyboardPointer.y = 140;
  selectedSignature = '';
  element('notice').hidden = true;
  noticeUntil = 0;
  setBuildDock(false);
  setDrawer();
  renderer.reset();
}

function updateMenu() {
  for (const mode of modeNames) element(`mode-${mode}-button`).setAttribute('aria-pressed', String(game === sessions[mode]));
  element('mode-description').textContent = MODE_DETAILS[game.state.mode].description;
  element('start-button').textContent = game.state.phase === 'menu' ? '开始布防 →'
    : game.state.phase === 'playing' ? '继续布防 →' : '查看战报 →';
}

function returnToMenu() {
  if (game.state.phase === 'playing' && !game.state.paused) game.togglePause();
  clearTransient();
  showView('menu');
  element('start-button').focus();
}

function selectMode(mode) {
  if (view !== 'menu' || game === sessions[mode]) return;
  if (game.state.phase === 'playing' && !game.state.paused) game.togglePause();
  clearTransient();
  game = sessions[mode];
  lastPhase = game.state.phase;
  updateMenu();
  updateUI();
}

function enterGame(restart = false) {
  void audio.unlock();
  if (!restart && (game.state.phase === 'victory' || game.state.phase === 'defeat')) {
    lastPhase = game.state.phase;
    showEnd();
    return;
  }
  const freshSession = restart || game.state.phase === 'menu';
  if (restart) {
    game.restart();
    clearTransient();
  } else if (game.state.phase === 'menu') game.start();
  else if (game.state.paused) game.togglePause();
  if (freshSession) setBuildDock(false);
  showView('game');
  if (freshSession) notice(`点击顶部“建造”选择工事；“科技”打开研究。${['escort', 'maze'].includes(game.state.mode) ? '“任务”查看目标与主动指令。' : ''}`, 5);
  lastPhase = game.state.phase;
  updateUI();
  canvas.focus({ preventScroll: true });
}

function armBuild(code) {
  setDrawer();
  armedCode = code;
  relocatingId = null;
  selectedTowerId = null;
  setBuildDock(false);
  void audio.unlock();
  const eligibility = game.canBuildType(code);
  notice(`已选${buildItems.find(tower => tower.code === code).name} · ${eligibility.ok ? '在绿色区域放置，右键或 Esc 取消。' : eligibility.message}`);
  updateUI();
  canvas.focus({ preventScroll: true });
}

function bindControls() {
  element('research-button').addEventListener('click', () => {
    const isOpen = element('research-button').getAttribute('aria-expanded') === 'true';
    setDrawer(isOpen ? null : 'research', element('research-button'));
  });
  element('close-drawer-button').addEventListener('click', () => setDrawer());
  element('focus-button').addEventListener('click', () => {
    setBuildDock(element('build-dock').hidden);
  });
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
  element('menu-button').addEventListener('click', returnToMenu);
  element('choose-mode-button').addEventListener('click', returnToMenu);
  for (const mode of modeNames) element(`mode-${mode}-button`).addEventListener('click', () => selectMode(mode));
  element('mission-button').addEventListener('click', () => {
    const open = element('mission-button').getAttribute('aria-expanded') === 'true';
    setDrawer(open ? null : 'mission', element('mission-button'));
  });
  element('convoy-toggle-button').addEventListener('click', () => { void audio.unlock(); resultMessage(game.toggleConvoy()); });
  element('convoy-repair-button').addEventListener('click', () => { void audio.unlock(); resultMessage(game.repairConvoy()); });
  element('maze-wall-button').addEventListener('click', () => armBuild('WALL'));
  element('relocate-button').addEventListener('click', () => {
    relocatingId = selectedTowerId;
    armedCode = null;
    setDrawer();
    notice('搬迁：选择新位置，保留等级，25 金币，停机 3 秒。右键或 Esc 取消。');
    updateUI();
    canvas.focus({ preventScroll: true });
  });
  for (const kind of /** @type {const} */ (['deployment', 'reinforcement'])) {
    element(`${kind}-research-button`).addEventListener('click', () => {
      void audio.unlock();
      resultMessage(game.startResearch(kind));
    });
  }
  element('cancel-research-button').addEventListener('click', () => {
    void audio.unlock();
    resultMessage(game.cancelResearch());
  });
  element('upgrade-button').addEventListener('click', () => resultMessage(game.upgrade(selectedTowerId)));
  element('sell-button').addEventListener('click', () => resultMessage(game.sell(selectedTowerId)));
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
  element('cancel-build-button').addEventListener('click', cancelBuild);
  element('shop-list').addEventListener('click', event => {
    const card = /** @type {HTMLElement} */ (event.target).closest('button[data-code]');
    if (!card) return;
    armBuild(/** @type {HTMLButtonElement} */ (card).dataset.code);
  });
  function pointer(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * WORLD.width,
      y: (event.clientY - bounds.top) / bounds.height * WORLD.height,
    };
  }
  canvas.addEventListener('click', event => {
    keyboardMode = false;
    void audio.unlock();
    const point = pointer(event);
    Object.assign(keyboardPointer, point);
    activatePoint(point);
  });
  canvas.addEventListener('pointermove', event => {
    keyboardMode = false;
    pointerPosition = pointer(event);
    Object.assign(keyboardPointer, pointerPosition);
    refreshPlacement();
  });
  canvas.addEventListener('pointerleave', () => {
    pointerPosition = null;
    refreshPlacement();
  });
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    cancelBuild();
  });
  canvas.addEventListener('keydown', event => {
    if (event.key.startsWith('Arrow')) {
      keyboardMode = true;
      event.preventDefault();
      const step = event.shiftKey ? 4 : 16;
      if (event.key === 'ArrowLeft') keyboardPointer.x -= step;
      if (event.key === 'ArrowRight') keyboardPointer.x += step;
      if (event.key === 'ArrowUp') keyboardPointer.y -= step;
      if (event.key === 'ArrowDown') keyboardPointer.y += step;
      keyboardPointer.x = Math.max(0, Math.min(WORLD.width, keyboardPointer.x));
      keyboardPointer.y = Math.max(0, Math.min(WORLD.height, keyboardPointer.y));
      pointerPosition = { ...keyboardPointer };
      refreshPlacement();
    } else if (event.key === 'Enter') {
      keyboardMode = true;
      event.preventDefault();
      void audio.unlock();
      activatePoint({ ...keyboardPointer });
    }
  });
  document.addEventListener('keydown', event => {
    if (help.open || view !== 'game') return;
    if (event.key === ' ' && !['BUTTON', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); game.togglePause(); updateUI();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const hadDrawer = !element('command-drawer').hidden;
      setDrawer();
      selectedTowerId = null; cancelBuild();
      if (!hadDrawer) canvas.focus({ preventScroll: true });
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
    for (const tower of buildItems) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'tower-card'; card.dataset.code = tower.code;
      card.setAttribute('aria-pressed', 'false');
      card.title = tower.description;
      const image = document.createElement(tower.code === 'WALL' ? 'span' : 'img');
      if (tower.code === 'WALL') { image.className = 'wall-icon'; image.textContent = '▥'; image.setAttribute('aria-hidden', 'true'); }
      else { /** @type {HTMLImageElement} */ (image).src = artwork.units.get(tower.code).masterImage.src; /** @type {HTMLImageElement} */ (image).alt = ''; }
      const name = document.createElement('strong'); name.textContent = tower.name;
      const price = document.createElement('span'); price.className = 'price'; price.textContent = `${tower.price} 金币`;
      const role = document.createElement('small'); role.className = 'role'; role.textContent = roles[tower.kind];
      const availability = document.createElement('small'); availability.className = 'availability';
      card.append(image, name, price, role, availability); shop.append(card);
    }
    bindControls();
    fitBattlefield();
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
        renderer.draw(game.state, selectedTowerId, placement, dt, keyboardMode ? keyboardPointer : null);
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
