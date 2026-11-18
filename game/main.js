import {towerUpgradeDuration} from './tower-upgrades.js';
import { createTouchControls } from './touch-controls.js';
import { createGame } from './engine.js';
import { TOWERS, effectiveTowerStats } from './catalog.js';
import { TECHNOLOGIES, deploymentStats, towerUnlockLevel } from './research.js';
import { MODE_DETAILS } from './modes.js';
import { gemPlacementStatus } from './gem-geometry.js';
import { GEM_RULES, GEM_PROBABILITIES, gemStats } from './gem-catalog.js';
import { HERO_SKILLS, HERO_EQUIPMENT, HERO_CONFIG } from './hero-catalog.js';
import { LEGION_MERCENARIES, LEGION_RULES } from './legion-catalog.js';
import { WORLD } from './geometry.js';
import { DEFENSE_LANES } from './defense-geometry.js';
import { createAudio } from './audio.js';
import { loadArtwork, createRenderer, loopSpriteUrl } from './render.js';

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`界面缺少必要元素：${id}`);
  return /** @type {T} */ (found);
}

const canvas = /** @type {HTMLCanvasElement} */ (element('game-canvas'));
const touchPointer = globalThis.matchMedia?.('(pointer: coarse)');
const help = /** @type {HTMLDialogElement} */ (element('help-dialog'));
const sessions = { loop: createGame(), defense: createGame({ mode: 'defense' }), escort: createGame({ mode: 'escort' }), maze: createGame({ mode: 'maze' }), gem: createGame({ mode: 'gem' }), hero: createGame({ mode: 'hero' }), legion: createGame({ mode: 'legion' }) };
const modeNames = Object.keys(sessions);
/** Active sessions expose mode-specific command and state extensions. @type {any} */
let game = sessions.loop;
const audio = createAudio();
const WALL = { code: 'WALL', name: '能量路障', price: 20, description: '改变敌人路径；不能封死通路，拆除返还 15 金币。', kind: 'wall' };
const catalog = () => game.catalog || TOWERS;
const technologies = () => game.technologies || TECHNOLOGIES;
const cardLoop = () => game.state.mode === 'loop';
const buildItemsFor = () => [...catalog(), ...(game.state.mode === 'maze' ? [WALL] : [])];
let buildItems = buildItemsFor();
let artworkCache;
let legionView = 'player';
let pendingGem = null;
let armedSkill = null;
const moveKeys = new Set();
let touchControls = null;
function stopHero() { touchControls?.stop(); moveKeys.clear(); if (game.state.mode === 'hero') game.setMoveVector(0, 0); }
function editable() { return game.state.phase === 'playing' && !game.state.paused && (!game.state.turnPhase || game.state.turnPhase === 'planning'); }
const roles = {
  wall: '改变行军路线', magic: '单体灼烧', multi: '多目标输出',
  direct: '单体输出', splash: '范围输出', chain: '连锁输出', slow: '减速控制',
  root: '定身控制', frost: '范围减速', radar: '射程增伤', overclock: '攻速辅助',
  supply: '金币补给', barrier: '区域减速', aura: '范围强化', pierce: '单体输出 · 首领增伤', boss: '首领克星', matrix: '连锁强化', echo: '协同回响', tank: '近战前排', support: '伤害辅助', healer: '修复友军',
};
function buildCategories(tower) {
  if (tower.code === 'T06') return 'damage control';
  if (['slow', 'frost', 'root', 'barrier'].includes(tower.kind)) return 'control';
  if (['direct', 'splash', 'chain', 'magic', 'multi'].includes(tower.kind)) return 'damage';
  return 'support';
}
let renderer;
let selectedTowerId = null;
let selectedEnemyId = null;
let loopPanelSignature = '';
let loopCardsSignature = '';
let loopCardSelection = '';
let shopSelection = '';
let loopEquipmentSignature = '';
let loopChallengeSignature = '';
let armedCardId = null;
let armedCode = null;
let relocatingId = null;
let placement = null;
let buildArea = null;
let pointerPosition = null;
let keyboardMode = false;
const keyboardPointer = { x: 190, y: 140 };
let view = 'menu';
let lastPhase = 'menu';
let noticeUntil = 0;
let helpPaused = false;
let selectedSignature = '';
let drawerTrigger = canvas;
let inspectedTowerId = null;
const towerSections = ['properties', 'skills', 'equipment', 'management'];

function showTowerSection(active = null) {
  for (const section of towerSections) {
    element(`tower-${section}`).hidden = active !== section;
    element(`tower-${section}-button`).setAttribute('aria-expanded', String(active === section));
  }
}

function setBuildDock(open) {
  if(open)touchControls?.clear();
  const dock = element('build-dock');
  const restoreFocus = !open && dock.contains(document.activeElement);
  if (open) { stopHero(); setDrawer(); }
  if (!open && !dock.hidden) {
    loopCardSelection = '';
    loopCardsSignature = '';
    shopSelection = '';
  }
  dock.hidden = !open;
  const button = element('focus-button');
  button.setAttribute('aria-pressed', String(!open));
  button.setAttribute('aria-expanded', String(open));
  const label = cardLoop() ? '卡牌' : '建造';
  button.textContent = open ? `收起${label}` : label;
  button.title = open ? `收起${label}面板` : `展开${label}面板`;
  if (restoreFocus) canvas.focus({ preventScroll: true });
}

function setDrawer(mode = null, trigger = canvas) {
  if(mode)touchControls?.clear();
  if (mode) { stopHero(); setBuildDock(false); }
  const drawer = element('command-drawer');
  const restoreFocus = drawer.contains(document.activeElement);
  if (mode === 'tower' && (drawer.dataset.view !== 'tower' || inspectedTowerId !== selectedTowerId)) showTowerSection();
  inspectedTowerId = mode === 'tower' ? selectedTowerId : null;
  drawer.hidden = !mode;
  drawer.dataset.view = mode || '';
  element('research-panel').hidden = mode !== 'research';
  element('loop-equipment-shop').hidden = mode !== 'equipment';
  element('loop-encyclopedia').hidden = mode !== 'encyclopedia';
  element('selection-panel').hidden = mode !== 'tower';
  element('mission-panel').hidden = mode !== 'mission';
  element('settings-panel').hidden = mode !== 'settings';
  element('more-button').setAttribute('aria-expanded', String(mode === 'settings'));
  element('more-button').setAttribute('aria-current', mode === 'mission' ? 'true' : 'false');
  element('drawer-title').textContent = mode === 'tower' ? '工事详情' : mode === 'mission' ? (game.state.mode==='loop'?'战场情报':'任务指挥') : mode === 'settings' ? '对局菜单' : mode === 'equipment' ? '装备商店与背包' : mode === 'encyclopedia' ? '塔卡与怪物图鉴' : '科技研究';
  element('research-button').setAttribute('aria-expanded', String(mode === 'research' || mode === 'equipment'));
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
    const sideSpace = Math.floor((width - fittedWidth) / 2) - 10;
    frame.parentElement.style.setProperty('--map-side-space', `${sideSpace}px`);
    frame.parentElement.classList.toggle('has-map-gutter', sideSpace >= 168);
  }).observe(frame);
}

function showView(name) {
  touchControls?.clear();
  if (name !== 'game') { stopHero(); setDrawer(); }
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
    if (['wave', 'core-hit', 'wave-clear', 'checkpoint', 'convoy-toggle', 'convoy-repair', 'relocate', 'hero-death', 'hero-respawn', 'hero-level', 'camp-clear', 'camp-reward','challenge-end','gold-rush','gold-rush-end'].includes(event.type)) notice(event.message || (event.type === 'core-hit' ? `防线受到 ${event.amount} 点伤害` : '战场状态已更新'), event.type === 'core-hit' ? 4 : 2.5);
    if (event.type === 'research-complete') {
      notice(event.message, 4);
      selectedSignature = '';
      updateUI();
    }
  }
}

function resultMessage(result) {
  notice(result?.message || (result?.ok ? '操作完成' : '当前不能执行此操作'));
  syncEvents();
  selectedSignature = '';
  updateUI();
}

function refreshPlacement() {
  const card = armedCardId === null ? null : game.state.cards?.find(item => item.id === armedCardId);
  const pending = buildItems.find(item => item.code === (card?.code ?? armedCode));
  const moving = game.state.towers.find(item => item.id === relocatingId);
  const gem = pendingGem?.kind === 'draft' ? game.state.draft?.candidates[pendingGem.id]
    : pendingGem ? game.state.inventory.find(t => t.id === pendingGem.id) : null;
  const eligibility = card ? game.canDeploy(card.id) : pending ? game.canBuildType(pending.code) : null;
  const gemHasRoom = gem && game.state.towers.length < technologies().deployment.levels[game.state.tech.deployment].capacity;
  buildArea = moving ? { code: moving.code, towerId: moving.id, relocating: true }
    : eligibility?.ok ? { code: pending.code }
    : gemHasRoom ? { code: gem.code } : null;
  placement = pointerPosition && (card || armedCode || moving)
    ? { ...pointerPosition, code: moving?.code || pending?.code,
      ...(moving ? { towerId: moving.id, relocating: true, ...game.canRelocate(moving.id, pointerPosition.x, pointerPosition.y) }
        : card ? game.canDeploy(card.id, pointerPosition.x, pointerPosition.y) : game.canBuild(pointerPosition.x, pointerPosition.y, armedCode)) }
    : null;
  if (gem && pointerPosition) {
    placement = { ...pointerPosition, code: gem.code, level: gem.level, ...(gemHasRoom
      ? gemPlacementStatus(pointerPosition.x, pointerPosition.y, game.state.towers)
      : { ok: false, message: '部署容量已满' }) };
  }
  if (armedSkill && pointerPosition) placement = { ...pointerPosition, skill: armedSkill, ok: true };
  const name = moving ? `搬迁${TOWERS.find(item => item.code === moving.code).name}`
    : pending?.name ?? (gem && catalog().find(item => item.code === gem.code)?.name);
  const problem = placement && !placement.ok ? placement.message
    : eligibility && !eligibility.ok ? eligibility.message : gem && !gemHasRoom ? '部署容量已满' : '';
  const price = moving ? 25 : card ? 0 : pending?.price;
  const hint = touchPointer?.matches ? '点按或拖动亮处预览，再确认' : '移到亮处预览，点击放置';
  const message = name ? [name, price && `${price} 金币`, problem || (placement?.ok ? '可在此放置' : hint)].filter(Boolean).join(' · ') : '';
  const status = element('build-status');
  status.hidden = !message;
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('invalid', !!problem);
}

function cancelBuild() {
  touchControls?.clear();
  armedCardId = null;
  armedCode = null;
  pendingGem = null;
  armedSkill = null;
  relocatingId = null;
  placement = null;
  updateUI();
}

function activatePoint(point) {
  pointerPosition = point;
  if (game.state.mode === 'legion' && legionView !== 'player') { notice('正在侦察敌方；请先返回己方战场。'); return; }
  if (armedCardId !== null) {
    const result = game.deploy(armedCardId, point.x, point.y);
    if (result.ok) {
      armedCardId = null;
      selectedTowerId = result.towerId;
      touchControls?.clear();
    }
    resultMessage(result);
    return;
  }
  if (pendingGem) {
    const result = pendingGem.kind === 'draft' ? game.keep(pendingGem.id, point) : game.deployInventory(pendingGem.id, point.x, point.y);
    if (result.ok) { pendingGem = null; selectedTowerId = result.towerId || null; }
    resultMessage(result); return;
  }
  if (armedSkill) { const result = game.castSkill(armedSkill, point.x, point.y); if (result.ok) armedSkill = null; resultMessage(result); return; }
  if (relocatingId !== null) {
    const result = game.relocate(relocatingId, point.x, point.y);
    if (result.ok) relocatingId = null;
    resultMessage(result);
  } else if (armedCode) {
    const result = game.build(point.x, point.y, armedCode);
    if (result.ok) {
      selectedTowerId = result.towerId;
      armedCode = null;
      touchControls?.clear();
    }
    resultMessage(result);
  } else {
    selectedTowerId = renderer.hitTest(point.x, point.y, [...game.state.towers, ...game.state.walls]);
    if (selectedTowerId) {selectedEnemyId=null;setDrawer('tower', canvas);}
    else {
      selectedEnemyId=game.state.mode==='loop'?game.state.enemies.find(e=>Math.hypot(e.x-point.x,e.y-point.y)<32)?.id:null;
      setDrawer(selectedEnemyId?'tower':null,canvas);
      if (!selectedEnemyId) setBuildDock(false);
    }
    updateUI();
  }
}

function updateSelection() {
  const tower = [...game.state.towers, ...game.state.walls, ...(game.state.mode === 'gem' ? game.state.inventory : [])].find(tower => tower.id === selectedTowerId);
  if (element('command-drawer').dataset.view === 'tower' && !tower && !game.state.enemies.some(enemy => enemy.id === selectedEnemyId)) {
    selectedTowerId = null;
    selectedEnemyId = null;
    setDrawer();
  }
  const signature = `${game.state.mode}/${JSON.stringify(game.state.inventory || [])}/${selectedTowerId}/${game.state.towers.map(item => `${item.id}:${item.level}:${item.x}:${item.y}:${item.readyAt > game.state.elapsed}`).join(',')}/${game.state.gold}/${armedCode}/${armedCardId}/${game.state.tech?.deployment}:${game.state.tech?.reinforcement}/${game.state.phase}/${relocatingId}/${tower?.readyAt > game.state.elapsed}/${tower?.upgrading?.remaining.toFixed(1)}/${game.state.endless}/${tower?.route}/${game.state.mode==='loop'?game.state.towers.filter(t=>t.pulseUntil>game.state.elapsed).map(t=>t.id).join(','):''}`;
  if (selectedSignature === signature) return;
  selectedSignature = signature;
  element('tower-panel').hidden = !tower;
  if (!tower) return;
  const wall = tower.code === 'WALL';
  element('tower-skills-button').hidden = !cardLoop();
  element('tower-equipment-button').hidden = !cardLoop();
  element('loop-targeting').hidden = !cardLoop();
  element('upgrade-button').hidden = wall || game.state.mode === 'gem' || cardLoop();
  element('gem-selection-actions').hidden = true;
  const relocate = /** @type {HTMLButtonElement} */ (element('relocate-button'));
  relocate.hidden = wall || game.state.mode !== 'escort';
  relocate.disabled = !!tower.upgrading || game.state.phase !== 'playing' || game.state.gold < 25 || tower.readyAt > game.state.elapsed;
  relocate.textContent = tower.readyAt > game.state.elapsed ? '搬迁停机中 · 3 秒后恢复' : '搬迁 · 25 金币 / 停机 3 秒';
  if (wall) {
    element('tower-title').textContent = WALL.name;
    element('tower-description').textContent = WALL.description;
    element('tower-stats').replaceChildren();
    /** @type {HTMLButtonElement} */ (element('sell-button')).disabled = !!tower.upgrading || game.state.phase !== 'playing' || ['gem','legion'].includes(game.state.mode) && !editable();
    element('sell-button').textContent = '拆除 · 回收 15 金币';
    return;
  }
  const stats = game.statsFor ? game.statsFor(tower) : effectiveTowerStats(tower, game.state.towers.filter(item => !(item.readyAt > game.state.elapsed)));
  element('gem-selection-actions').hidden = game.state.mode !== 'gem';
  if (game.state.mode === 'gem') renderGemSelection(tower);
  element('tower-title').textContent = `${stats.name} · Lv.${tower.level}`;
  element('tower-description').textContent = `${stats.description || ''}${tower.readyAt > game.state.elapsed ? ' · 搬迁停机中，暂停攻击、辅助与收入。' : ''}`;
  const details = stats.damage > 0
    ? [`伤害 ${Math.round(stats.damage)}`, `间隔 ${(stats.interval || 0).toFixed(2)} 秒`, `射程 ${Math.round(stats.range)}`]
    : stats.kind === 'supply' ? [`每 ${stats.supplyInterval??8} 秒 +${stats.supplyIncome??stats.income} 金币`]
      : stats.kind === 'echo' ? [`作用半径 ${Math.round(stats.range)}`, `每四次命中回响 ${stats.echoDamage} 伤害`]
      : stats.kind === 'aura' ? [`作用半径 ${Math.round(stats.range)}`, '附近攻击宝石伤害与射程光环']
      : [`作用半径 ${stats.range}`, stats.kind === 'barrier' ? `减速 ${Math.round((1 - stats.slow) * 100)}%` : `强化 ${Math.round((stats.boost||0) * 100)}%`];
  if(stats.kind==='magic')details.push(`灼烧 ${Math.round(stats.burnDps)}/秒 · ${stats.burnDuration}秒（刷新不叠加）`);
  if(stats.kind==='multi')details.push(`同时独立攻击 ${stats.targetCount} 个目标`);
  if (game.state.mode === 'legion') details.push(`生命 ${Math.ceil(tower.hp || 0)} / ${Math.ceil(tower.maxHp || stats.maxHp)}`, `移速 ${stats.speed}`);
  element('tower-stats').replaceChildren(...details.map(detail => {
    const span = document.createElement('span');
    span.textContent = detail;
    return span;
  }));
  const upgrade = /** @type {HTMLButtonElement} */ (element('upgrade-button'));
  const eligibility = cardLoop() ? {ok:false,message:''} : game.canUpgrade(tower.id);
  upgrade.textContent = tower.upgrading ? `升级中 · ${Math.floor((1-tower.upgrading.remaining/tower.upgrading.duration)*100+1e-6)}% · ${tower.upgrading.remaining.toFixed(1)}秒` : eligibility.ok ? `升级 · ${stats.upgradeCost} 金币 · ${stats.upgradeDuration ?? towerUpgradeDuration(tower.level)}秒` : eligibility.message;
  upgrade.style.setProperty('--progress',`${tower.upgrading ? (1-tower.upgrading.remaining/tower.upgrading.duration)*100 : 0}%`);
  upgrade.classList.toggle('progress-button',!!tower.upgrading);
  upgrade.title = eligibility.message;
  upgrade.disabled = !eligibility.ok;
  if (!cardLoop()) {
    /** @type {HTMLButtonElement} */ (element('sell-button')).disabled = !!tower.upgrading || game.state.phase !== 'playing' || ['gem','legion'].includes(game.state.mode) && !editable();
    element('sell-button').textContent = `出售 · 回收 ${stats.sellValue} 金币`;
  }
}

function updateLoopPanels() {
  const loop=cardLoop(),root=element('loop-controls'),forecast=element('loop-forecast'),enemyInfo=element('loop-enemy-info');
  root.hidden=!loop;forecast.hidden=!loop;enemyInfo.hidden=true;
  element('loop-skill-status').hidden=true;
  if(loop)updateCardLoopPanels(root,forecast,enemyInfo);
}

function updateResearch() {
  const { state } = game;
  if (cardLoop()) {
    const population = state.populationUsed??state.towers.reduce((total,tower)=>total+(catalog().find(def=>def.code===tower.code)?.population??1),0);
    element('tower-capacity').textContent = `人口 ${population} / ${state.capacity}`;
    const shortcut = element('research-button');
    shortcut.textContent = '装备';
    shortcut.title = '装备商店与背包';
    shortcut.classList.toggle('progress-button',false);
    return;
  }
  const defs = technologies();
  const capacity = defs.deployment.levels[state.tech.deployment].capacity;
  element('tower-capacity').textContent = `容量 ${state.towers.length} / ${capacity}`;
  for (const kind of /** @type {const} */ (['deployment', 'reinforcement'])) {
    const technology = defs[kind];
    const level = state.tech[kind];
    const next = technology.levels[level + 1];
    element(`${kind}-level`).textContent = `${technology.name} · Lv.${level}`;
    element(`${kind}-details`).textContent = next
      ? `${next.cost} 金币 · ${next.duration} 秒 · ${kind === 'deployment'
        ? `容量 ${next.capacity}，解锁 ${next.unlocks.map(code => catalog().find(tower => tower.code === code)?.name || code).join('、')}`
        : `所有塔可升至 ${next.maxTowerLevel} 级（需另付升级费用）`}`
      : `已满级 · ${kind === 'deployment' ? `容量 ${capacity}，全部塔种已解锁` : `所有塔可升至 ${technology.levels[level].maxTowerLevel} 级`}`;
    const eligibility = game.canResearch(kind);
    const button = /** @type {HTMLButtonElement} */ (element(`${kind}-research-button`));
    const active = state.research?.kind === kind ? state.research : null;
    const frozen = state.phase !== 'playing' || state.paused || state.turnPhase === 'planning';
    button.textContent = active ? `Lv.${active.level} · ${Math.floor((1-active.remaining/active.duration)*100+1e-6)}% · ${frozen ? '已暂停 · ' : ''}${active.remaining.toFixed(1)}秒` : eligibility.ok ? `研究 Lv.${level + 1}` : eligibility.message;
    button.style.setProperty('--progress',`${active ? (1-active.remaining/active.duration)*100 : 0}%`);
    button.classList.toggle('progress-button',!!active);
    button.title = eligibility.message;
    button.disabled = !eligibility.ok;
  }
  const research = state.research;
  const shortcut = element('research-button');
  const percent = research ? Math.floor((1-research.remaining/research.duration)*100+1e-6) : 0;
  shortcut.textContent = research ? `科技 ${percent}%` : '科技';
  shortcut.style.setProperty('--progress', `${percent}%`);
  shortcut.classList.toggle('progress-button', !!research);
  shortcut.title = research ? `${defs[research.kind].name} · ${research.remaining.toFixed(1)} 秒${state.paused?' · 已暂停':''}` : '科技研究';
  const progress = /** @type {HTMLProgressElement} */ (element('research-progress'));
  progress.hidden = true;
  progress.max = research?.duration || 1;
  progress.value = research ? research.duration - research.remaining : 0;
  element('research-status').hidden = true;
  const cancel = /** @type {HTMLButtonElement} */ (element('cancel-research-button'));
  cancel.hidden = !research;
  cancel.disabled = state.phase !== 'playing';
  cancel.textContent = research ? `取消研究 · 退还 ${research.cost} 金币` : '取消研究';
}

function commandButton(label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'button compact'; button.textContent = label; button.disabled = disabled;
  button.addEventListener('click', action); return button;
}

function armCard(cardId) {
  const eligibility = game.canDeploy(cardId);
  if (!eligibility.ok) { notice(eligibility.message); return; }
  armedCardId = cardId;
  pointerPosition = null;
  selectedTowerId = null;
  selectedEnemyId = null;
  setBuildDock(false);
  updateUI();
  canvas.focus({ preventScroll: true });
}

function renderLoopCards() {
  const root = element('loop-cards');
  const enabled = cardLoop();
  root.hidden = !enabled;
  element('build-filters').hidden = enabled;
  element('shop-list').hidden = enabled;
  if (enabled) element('shop-tower-preview').hidden = true;
  element('build-dock').dataset.mode = enabled ? 'cards' : 'shop';
  const { draft, cards, gold, paused, phase, capacity } = game.state;
  element('build-heading').textContent = !enabled ? '防御工事'
    : draft ? (draft.cost ? '抽卡三选一' : '免费三选一') : `卡包 · ${cards.length} 张`;
  if (!enabled) { loopCardsSignature = ''; return; }
  if (element('build-dock').hidden) return;
  const disabled = phase !== 'playing' || paused;
  const signature = JSON.stringify([draft,cards,gold>=150,disabled,capacity,game.state.towers.map(tower=>tower.code)]);
  if (signature === loopCardsSignature) return;
  loopCardsSignature = signature;
  const restoreFocus = root.contains(document.activeElement);
  root.replaceChildren();
  const choices = document.createElement('div');
  choices.className = 'card-choices';
  const preview = document.createElement('div');
  preview.id = 'loop-card-preview';
  preview.className = 'card-preview';
  const icons = [];
  function addChoice(strip, group, key, code, actions) {
    const definition = catalog().find(item=>item.code===code);
    const label = definition?.name ?? code;
    const button = commandButton('', () => {
      loopCardSelection = loopCardSelection === key ? '' : key;
      showSelection();
    });
    button.className = 'card-choice';
    button.title = label;
    button.dataset.rarity = definition?.rarity ?? 'common';
    button.dataset.group = group;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-controls', preview.id);
    const fallback = document.createElement('span');
    fallback.textContent = code;
    button.append(fallback);
    loopPortrait(button,code,definition?.assetCode);
    icons.push({ button, key, code, actions });
    strip.append(button);
  }
  function showSelection() {
    const choice = icons.find(icon => icon.key === loopCardSelection);
    for (const icon of icons) icon.button.setAttribute('aria-pressed', String(icon === choice));
    preview.hidden = !choice;
    preview.replaceChildren();
    if (!choice) { loopCardSelection = ''; return; }
    const detail = loopCardDetails(choice.code, true);
    const actions = document.createElement('div');
    actions.className = 'card-preview-actions';
    choice.actions(actions);
    preview.append(detail, actions);
  }
  const strip = (label) => {
    const group = document.createElement('div');
    group.className = 'card-choice-strip';
    group.setAttribute('role','group');
    group.setAttribute('aria-label',label);
    choices.append(group);
    return group;
  };
  if (draft) {
    const offers = strip(draft.cost ? '候选卡' : '免费起手卡');
    for (const [index,code] of draft.codes.entries()) {
      addChoice(offers,'draft',`draft:${index}:${code}`,code, actions => {
        actions.append(commandButton('选留到卡包',()=>resultMessage(game.chooseCard(index)),disabled));
      });
    }
  }
  let drawButton;
  if (!draft || cards.length) {
    if (draft) paragraph(choices,`卡包 · ${cards.length} 张`);
    const bag = strip(`卡包 · ${cards.length} 张`);
    if (!draft) {
      drawButton = commandButton('', () => {
        const result = game.draw();
        if (result.ok) loopCardSelection = '';
        resultMessage(result);
      }, disabled || gold < 150);
      drawButton.className = 'card-choice card-draw';
      drawButton.setAttribute('aria-label','抽卡 · 150 金币');
      const label = document.createElement('strong');
      label.textContent = '抽卡';
      const cost = document.createElement('span');
      cost.textContent = '150 金';
      drawButton.append(label,cost);
      bag.append(drawButton);
    }
    for (const card of cards) {
      addChoice(bag,'bag',`bag:${card.id}`,card.code, actions => {
        const eligible = game.canDeploy(card.id);
        if (!eligible.ok) paragraph(actions,eligible.message);
        actions.append(commandButton('部署',()=>armCard(card.id),disabled||!eligible.ok),commandButton(`售卡 · +${card.paid?75:0} 金币`,()=>resultMessage(game.sellCard(card.id)),disabled));
      });
    }
  }
  root.append(choices,preview);
  showSelection();
  if (restoreFocus) ((icons.find(icon => icon.key === loopCardSelection) ?? icons[0])?.button ?? drawButton)?.focus({ preventScroll: true });
}

function loopPortrait(card,code,assetCode) {
  const unit = artworkCache?.units.get(assetCode ?? code);
  const portrait = unit?.masterImage?.src ?? unit?.masterUrl.href;
  const source = loopSpriteUrl(code)?.href;
  if (!source && !portrait) return;
  const image = document.createElement('img');
  setPortrait(image, source, portrait);
  card.append(image);
}

/** @param {HTMLImageElement} image */
function setPortrait(image, source, fallback) {
  image.alt = '';
  image.loading = 'lazy';
  if (source && fallback) image.addEventListener('error', () => { image.src = fallback; }, { once: true });
  if (source || fallback) image.src = source ?? fallback;
}

function loopCardDetails(code, compact = false) {
  const tower = catalog().find(item=>item.code===code);
  const card = document.createElement('article');
  card.className = 'loop-content-card';
  card.dataset.rarity = tower?.rarity ?? 'common';
  const title = document.createElement('h4');
  title.textContent = tower?.name ?? code;
  if (!compact) loopPortrait(card,code,tower?.assetCode);
  card.append(title);
  paragraph(card,`${({common:'普通',rare:'稀有',epic:'史诗'})[card.dataset.rarity]} · ${tower?.population??1} 人口`);
  if (compact && tower?.skills?.length > 1) {
    paragraph(card,`1级 · ${tower.skills[0]}`);
    const extra = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = '后续技能';
    extra.append(label);
    for (const [index, skill] of tower.skills.slice(1).entries()) paragraph(extra,`${2*index+3}级 · ${skill}`);
    card.append(extra);
    return card;
  }
  for (const [index,skill] of (tower?.skills??[]).entries()) paragraph(card,`${2*index+1}级 · ${skill}`);
  return card;
}

function renderLoopEncyclopedia() {
  const filter = /** @type {HTMLSelectElement} */ (element('loop-encyclopedia-filter'));
  const category=filter.value||'T';
  const items=category==='T'?catalog().map(tower=>loopCardDetails(tower.code)) :
    Object.keys(game.enemyCatalog).filter(code=>code.startsWith(category)).map(code=>{
      const enemy=game.enemyCatalog[code];
      const card=document.createElement('article');
      card.className='loop-content-card';
      const title=document.createElement('h4');
      title.textContent=enemy.name;
      loopPortrait(card,code,enemy.assetCode);
      card.append(title);
      paragraph(card,enemy.description);
      paragraph(card,`应对 · ${enemy.counter}`);
      return card;
    });
  element('loop-encyclopedia-count').textContent=`共 ${items.length} 项`;
  element('loop-encyclopedia-list').replaceChildren(...items);
}

function renderLoopCrafting(root, items, towerId) {
  const recipes = Object.values(/** @type {Record<string,{name:string,cost:number,description:string,components?:string[]}>} */ (game.equipment??{}));
  for (const recipe of recipes) {
    if (!recipe.components?.length) continue;
    const [firstCode, secondCode] = recipe.components;
    const first = items.find(item=>item.code===firstCode);
    const second = items.find(item=>item.code===secondCode&&item.id!==first?.id);
    if (towerId!==undefined && (!first || !second)) continue;
    const panel = document.createElement('article');
    panel.className = 'loop-content-card';
    paragraph(panel,`${recipe.components.map(code=>game.equipment[code]?.name??code).join('＋')} · ${recipe.description}`);
    const disabled = !first || !second || game.state.gold < recipe.cost || !editable();
    const reason = !first || !second ? ' · 缺少组件' : game.state.gold < recipe.cost ? ' · 金币不足' : '';
    panel.append(commandButton(`合成${recipe.name} · ${recipe.cost} 金币${reason}`,()=>resultMessage(game.craft(first.id,second.id,towerId)),disabled));
    root.append(panel);
  }
}

function renderLoopEquipmentShop() {
  const root = element('loop-equipment-shop');
  if (root.hidden || !cardLoop()) return;
  const { inventory, gold, phase, paused } = game.state;
  const entries = Object.entries(/** @type {Record<string,{name:string,cost:number,description:string,components?:string[]}>} */ (game.equipment??{}));
  const signature = JSON.stringify([inventory,entries.map(([,item])=>gold>=item.cost),phase,paused,entries.length]);
  if (signature===loopEquipmentSignature) return;
  loopEquipmentSignature=signature;
  root.replaceChildren();
  paragraph(root,inventory.length ? `背包 · ${inventory.map(item=>game.equipment[item.code]?.name??item.code).join('、')}` : '背包为空');
  paragraph(root,'点选战场上的塔装配装备。');
  for (const [code,item] of entries) {
    if (item.components?.length) continue;
    const panel = document.createElement('article');
    panel.className = 'loop-content-card';
    paragraph(panel,item.description);
    panel.append(commandButton(`购买${item.name} · ${item.cost} 金币`,()=>resultMessage(game.buyEquipment(code)),!editable()||gold<item.cost));
    root.append(panel);
  }
  renderLoopCrafting(root,inventory,undefined);
}

function updateCardLoopPanels(root, forecast, enemyInfo) {
  const { enemies,towers,elapsed,inventory,phase,paused } = game.state;
  const lines = game.forecasts().map(next=>{
    const types = (next.types??[]).map(code=>game.enemyCatalog?.[code]?.name??code);
    const boss = next.boss && Object.values(game.enemyCatalog??{}).find(item=>item.name===next.bossName);
    return `第${next.wave}波 · ${next.count}只${next.elites?` · 精英 ${next.elites}`:''}${next.boss?` · 首领 ${next.bossName??'将出现'}`:''}${next.summonLimit?` · 最多额外召唤 ${next.summonLimit}只`:''}${types.length?`\n${types.join('、')}`:''}${boss?.description?`\n${boss.description}`:''}`;
  });
  const forecastText = lines.join('\n') || (phase==='playing'?'最终波已投入':'对局结束');
  if (forecast.textContent!==forecastText) forecast.textContent=forecastText;
  const enemy = enemies.find(item=>item.id===selectedEnemyId);
  if (enemy) {
    enemyInfo.hidden=false;
    const layerCount=enemy.hitShield??enemy.shieldHits??0;
    const stats = [enemy.name,`生命 ${Math.ceil(enemy.hp)} / ${Math.ceil(enemy.maxHp)}`];
    if (enemy.shield>0) stats.push(`耐久盾 ${Math.ceil(enemy.shield)}`);
    if (layerCount>0) stats.push(`次数盾 ${layerCount} 层`);
    if (enemy.immuneUntil>elapsed) stats.push('硬控保护');
    const definition=game.enemyCatalog?.[enemy.code];
    if(definition?.description)stats.push(definition.description);
    if(definition?.counter)stats.push(`应对 · ${definition.counter}`);
    enemyInfo.textContent=stats.join(' · ');
  }
  const tower = towers.find(item=>item.id===selectedTowerId);
  if (!tower) { root.hidden=true;loopPanelSignature='';return; }
  const definition = catalog().find(item=>item.code===tower.code);
  const remaining = Math.max(0,(tower.combatUntil??0)-elapsed);
  const occupied = tower.equipment??[];
  const status = element('loop-skill-status');
  const levelCap = [0,10,30,70,130][tower.level];
  status.hidden=false;
  status.textContent = `${tower.level>=5?'经验已满':`经验 ${tower.xp??0} / ${levelCap}`} · ${remaining>0?`脱战还需 ${Math.ceil(remaining)} 秒`:'已脱战'}`;
  const sell = /** @type {HTMLButtonElement} */ (element('sell-button'));
  const canSell = editable() && (!occupied.length || remaining===0);
  sell.disabled = !canSell;
  sell.title = occupied.length && remaining>0 ? '须脱战后出售带装备的塔' : '';
  sell.textContent = sell.title || `出售 · 回收 ${tower.paid?75:0} 金币`;
  root.hidden=false;
  const signature = JSON.stringify([tower.id,tower.level,tower.priority,occupied,inventory,remaining>0,phase,paused,game.state.gold>=60]);
  if(signature===loopPanelSignature)return;
  loopPanelSignature=signature;
  root.replaceChildren();
  const skills = element('loop-skills');
  skills.replaceChildren();
  for(const [index,skill] of (definition?.skills??[]).entries()){
    const level=2*index+1;
    paragraph(skills,`${level}级 · ${tower.level>=level?'已解锁':'待解锁'} · ${skill}`);
  }
  const targeting = element('loop-targeting');
  targeting.replaceChildren();
  if (definition?.role !== 'support') {
    const label=document.createElement('label');
    label.textContent='选敌优先级';
    const select=document.createElement('select');
    select.setAttribute('aria-label','选敌优先级');
    for(const [key,name] of Object.entries(game.priorities??{})){
      const option=document.createElement('option');
      option.value=key;
      option.textContent=String(name);
      select.append(option);
    }
    select.value=tower.priority??'default';
    select.addEventListener('change',()=>resultMessage(game.setPriority(tower.id,select.value)));
    label.append(select);
    targeting.append(label);
  }
  const slots=document.createElement('div');
  slots.className='loop-panel-list';
  for (let index=0;index<3;index++){
    const slot=document.createElement('article');
    slot.className='loop-content-card';
    const item=occupied[index],definition=game.equipment?.[item?.code];
    paragraph(slot,`槽位 ${index+1} · ${definition?.name??'空槽'}`);
    if(item && definition) {
      paragraph(slot,definition.description);
      slot.append(commandButton(`卸下${definition.name}`,()=>resultMessage(game.unequip(tower.id,item.id)),!editable()||remaining>0));
    }
    slots.append(slot);
  }
  root.append(slots);
  renderLoopCrafting(root,occupied,tower.id);
  if(inventory.length)paragraph(root,occupied.length<3?'从背包装配':'装备槽已满');
  const equippedCodes = new Set(occupied.map(item=>item.code));
  for (const item of inventory) {
    const definition=game.equipment?.[item.code];
    if (!definition) continue;
    const button=commandButton(`装配${definition.name}`,()=>resultMessage(game.equip(tower.id,item.id)),!editable()||occupied.length>=3||equippedCodes.has(item.code));
    button.title=definition.description;
    root.append(button);
  }
}

function updateLoopEvents(activeCount) {
  const root=element('loop-challenges'),status=element('loop-event-status');
  const live=element('loop-live-event');
  const enabled=cardLoop();
  root.hidden=!enabled;
  status.hidden=!enabled;
  element('loop-encyclopedia-button').hidden=!enabled;
  if(!enabled){live.hidden=true;loopChallengeSignature='';return;}
  const {challenge,goldRush,wave,endless,phase} = game.state;
  const active = game.challenges?.find(item=>item.code===challenge?.code);
  const parts = [`待投放 ${game.state.pendingSpawns??0} 只`];
  if(challenge)parts.push(`挑战 · ${active?.name??challenge.code} · ${Math.ceil(challenge.remaining)} 秒`);
  if(goldRush)parts.push(`打金 · 剩余 ${Math.ceil(goldRush.remaining)} 秒 · 伤害 ${Math.floor(goldRush.damage)} · 奖金 ${Math.floor(goldRush.reward)} / ${goldRush.maxReward}`);
  else if(game.state.goldRushQueued) parts.push('金币怪等待投放');
  const content=parts.join(' · ');
  if(status.textContent!==content)status.textContent=content;
  live.hidden=parts.length===1;
  const summary=parts.slice(1).join(' · ');
  if(live.textContent!==summary)live.textContent=summary;
  if(element('mission-panel').hidden)return;
  const unavailable = !!challenge || phase!=='playing' || game.state.paused || activeCount>=45 || wave>=20 || endless;
  const completed = game.state.usedChallenges??game.state.completedChallenges??[];
  const signature=JSON.stringify([Math.min(wave,20),endless,unavailable,completed,game.challenges?.length]);
  if(signature===loopChallengeSignature)return;
  loopChallengeSignature=signature;
  root.replaceChildren();
  const title=document.createElement('h3');
  title.textContent='主动挑战';
  root.append(title);
  if(endless){
    paragraph(root,'挑战仅在常规关开放。');
    return;
  }
  if(activeCount>=45)paragraph(root,'在场达到 45 只，暂时无法开启挑战。');
  for(const item of game.challenges??[]){
    const panel=document.createElement('article');
    panel.className='loop-content-card';
    paragraph(panel,`${item.name} · 第 ${item.wave} 波开放`);
    if(item.description)paragraph(panel,item.description);
    if(typeof item.reward==='string')paragraph(panel,`奖励 · ${item.reward}`);
    const done=completed.includes(item.code);
    panel.append(commandButton(done?'本局已开启':`开启${item.name}`,()=>resultMessage(game.startChallenge(item.code)),unavailable||wave<item.wave||done));
    root.append(panel);
  }
}
function paragraph(parent, value) { const p = document.createElement('p'); p.textContent = value; parent.append(p); }
function gemLabel(tower) { return `${catalog().find(def => def.code === tower.code)?.name || tower.code} ${tower.level}阶 · #${tower.id}`; }
function gemPortrait(code){
  const index=catalog().findIndex(tower=>tower.code===code),icon=document.createElement('span');
  icon.className='gem-portrait';icon.setAttribute('aria-hidden','true');
  icon.style.backgroundPosition=`${index%4/3*100}% ${Math.floor(index/4)/2*100}%`;
  return icon;
}
function gemEffectText(tower, field = []) {
  const stats = gemStats(tower, field);
  const combat = stats.damage > 0 ? `伤害 ${stats.damage.toFixed(1)} · 间隔 ${stats.interval.toFixed(2)}秒` : stats.kind === 'echo' ? `每四次友军命中回响 ${stats.echoDamage} 伤害` : '自身不攻击';
  return `${roles[stats.kind]}：${stats.description} ${combat} · 射程／作用半径 ${Math.round(stats.range)}${stats.kind === 'chain' ? ` · 连锁${stats.chainCount}目标／${Math.round(stats.chainRange)}距离` : ''}`;
}
function gemAuraText(tower, field) {
  const stats = gemStats(tower, field), base = gemStats(tower);
  const values = [];
  if (base.damage > 0 && Math.abs(stats.damage - base.damage) > .001) values.push(`伤害+${Math.round((stats.damage / base.damage - 1) * 100)}%`);
  if (Math.abs(stats.range - base.range) > .001) values.push(`射程+${Math.round((stats.range / base.range - 1) * 100)}%`);
  if (stats.kind === 'chain' && stats.chainCount !== base.chainCount) values.push(`连锁目标+${stats.chainCount - base.chainCount}`);
  if (stats.kind === 'chain' && Math.abs(stats.chainRange - base.chainRange) > .001) values.push(`连锁距离+${Math.round((stats.chainRange / base.chainRange - 1) * 100)}%`);
  const echoes = field.filter(source => source.id !== tower.id && gemStats(source).kind === 'echo' && Math.hypot(source.x - tower.x, source.y - tower.y) <= gemStats(source).range);
  if (stats.damage > 0 && echoes.length) values.push(`回响覆盖 #${echoes.map(source=>source.id).join('/#')}`);
  return values.join('、') || '无外部光环';
}
function gemFusionPreview(primary, materials, recipe = null) {
  const { towers, inventory, tech } = game.state;
  const removed = new Set(materials.map(tower=>tower.id));
  const output = { ...primary, code: recipe?.code || primary.code, level: recipe?.level || primary.level + 1 };
  const transform = items => items.filter(tower=>!removed.has(tower.id)).map(tower=>tower.id === primary.id ? output : tower);
  const after = transform(towers), reserveAfter = transform(inventory);
  const deployed = towers.some(tower=>tower.id === primary.id);
  const auraChanges = [];
  for (const tower of after) {
    const before = towers.find(item=>item.id === tower.id);
    const previous = before ? gemAuraText(before, towers) : '不在场';
    const next = gemAuraText(tower, after);
    if (previous !== next) auraChanges.push(`#${tower.id} ${previous} → ${next}`);
  }
  const sources = towers.filter(tower=>removed.has(tower.id) || tower.id === primary.id && tower.code !== output.code).filter(tower=>['aura','matrix','echo'].includes(gemStats(tower).kind));
  if (sources.length) auraChanges.unshift(`失去原光环源：${sources.map(tower=>gemLabel(tower)).join('、')}`);
  if (deployed && ['aura','matrix','echo'].includes(gemStats(output).kind)) auraChanges.push(`结果光环源：${gemLabel(output)}（按保留位置计算覆盖）`);
  return `消耗 ${[primary,...materials].map(tower=>gemLabel(tower)+(towers.includes(tower)?'／场上':'／备选')).join(' + ')} → ${gemLabel(output)}。`+
    `容量：在场 ${towers.length}/${technologies().deployment.levels[tech.deployment].capacity} → ${after.length}/${technologies().deployment.levels[tech.deployment].capacity}；备选 ${inventory.length}/${GEM_RULES.reserveSlots} → ${reserveAfter.length}/${GEM_RULES.reserveSlots}。`+
    `结果${deployed ? '留在场上，保留主宝石位置与ID' : '留在备选，不攻击也不提供光环；另行部署至合法位置后才生效'}。${gemEffectText(output,deployed?after:[])}。`+
    `光环变化（按真实前后场上集合）：${auraChanges.join('；') || '其余场上宝石的光环加成不变'}。`;
}
function armGem(kind, id) {
  pendingGem = { kind, id }; armedCode = null; armedSkill = null; setDrawer();
  notice('已选择宝石，请在地图合法区域点击部署；右键或Esc取消。'); canvas.focus({ preventScroll: true }); updateUI();
}
function renderGemSelection(tower) {
  const parent = element('gem-selection-actions'); parent.replaceChildren();
  parent.append(commandButton('收回备选栏（仅普通宝石）', () => resultMessage(game.store(tower.id)), !editable() || !tower.code.startsWith('G') || game.state.inventory.includes(tower) || game.state.inventory.length >= GEM_RULES.reserveSlots));
  const matches = [...game.state.towers, ...game.state.inventory].filter(item => item.id !== tower.id && item.code === tower.code && item.level === tower.level);
  paragraph(parent, '普通合成：选择实际同系同阶材料，确认后消耗；主宝石保留位置与ID。');
  if (tower.level >= game.state.tech.reinforcement + 1) paragraph(parent, '当前阶位已达科技上限，需要先完成更高强化科技。');
  for (const material of matches) parent.append(commandButton(`预览：消耗 ${gemLabel(material)}`, () => {
    const confirm = commandButton(`确认合成 #${tower.id} + #${material.id} → ${tower.level + 1}阶`, () => resultMessage(game.merge(tower.id, material.id)), !editable());
    parent.replaceChildren();
    paragraph(parent, gemFusionPreview(tower, [material]));
    parent.append(confirm);
  }, !editable() || !tower.code.startsWith('G') || tower.level >= game.state.tech.reinforcement + 1));
  if (!matches.length) paragraph(parent, '当前没有同系同阶材料。');
}
let specialSignature = '';
function updateSpecialMission() {
  const state = game.state;
  // Keep focused material selectors intact until their underlying transaction state changes.
  const signature = JSON.stringify([state.mode,state.phase,state.turnPhase,state.paused,state.wave,state.gold,state.tech,state.draft,state.inventory,state.towers.map(t=>[t.id,t.code,t.level]),state.pity,state.hero?.equipment,state.hero?.level,state.pendingCampReward,state.sides?.player.orders,state.sides?.player.mythium,state.sides?.player.workers,state.reports?.length]);
  if (signature === specialSignature) return;
  specialSignature = signature;
  const parent = element('special-mission'); parent.replaceChildren();
  if (state.mode === 'gem') {
    element('mission-objective').textContent = '万象宝石 · 准备时鉴定、选留和融合；准备完毕主动开战，守住20波。';
    paragraph(parent, `${state.turnPhase === 'planning' ? '准备阶段' : '战斗阶段'} · 本轮鉴定机会 ${state.draftCredits} · 种子 ${state.seed} · 合成保底 ${state.pity}/3 · 碎片 ${state.scraps}/${GEM_RULES.scrapThreshold}`);
    paragraph(parent, `当前1–5阶概率：${GEM_PROBABILITIES[state.tech.reinforcement].join('% / ')}%`);
    parent.append(commandButton('鉴定五选一 · 60金币', () => resultMessage(game.draw()), !editable() || !!state.draft || state.draftCredits < 1 || state.gold < GEM_RULES.draftCost));
    const cost = state.draft && GEM_RULES.rerollCosts[state.draft.rerolls];
    parent.append(commandButton(state.draft ? cost === undefined ? '本次刷新已用完' : `刷新候选 · ${cost}金币` : '刷新候选 · 20 / 40 / 80金币', () => resultMessage(game.reroll()), !editable() || !state.draft || cost === undefined || state.gold < cost));
    for (const [index, candidate] of (state.draft?.candidates || []).entries()) {
      const card = document.createElement('div'); card.className = 'draft-card';
      paragraph(card, `候选${index + 1} · ${gemLabel(candidate).replace(' · #undefined','')}`);
      card.append(gemPortrait(candidate.code));
      paragraph(card, gemEffectText(candidate));
      card.append(commandButton('选留并部署', () => armGem('draft', index), !editable()), commandButton('选留到备选', () => resultMessage(game.keep(index, { inventory: true })), !editable() || state.inventory.length >= GEM_RULES.reserveSlots)); parent.append(card);
    }
    paragraph(parent, `备选 ${state.inventory.length}/${GEM_RULES.reserveSlots}`);
    for (const tower of state.inventory) parent.append(commandButton(`部署 ${gemLabel(tower)}`, () => armGem('inventory', tower.id), !editable()), commandButton(`查看／合成／出售 #${tower.id}`, () => { selectedTowerId = tower.id; selectedSignature = ''; setDrawer('tower'); updateUI(); }));
    paragraph(parent, '五种融合配方 · 每个材料槽显示真实可用实体；第一个材料为保留ID与位置的主宝石。');
    const items = [...state.towers, ...state.inventory];
    for (const recipe of game.recipes) {
      const group = document.createElement('div'); group.className = 'recipe-card';
      paragraph(group, `${recipe.name} ${recipe.level}阶 ← ${recipe.inputs.map(([code,level]) => `${catalog().find(t=>t.code===code)?.name || code}${level}阶`).join(' + ')} · 部署${recipe.deployment}/强化${recipe.reinforcement}`);
      group.append(gemPortrait(recipe.code));
      paragraph(group, `结果效果：${gemEffectText({ code:recipe.code, level:recipe.level })}`);
      const selectors = recipe.inputs.map(([code,level], index) => {
        const select = document.createElement('select'); select.setAttribute('aria-label', `${recipe.name} ${index === 0 ? '主宝石' : '材料'+index}`);
        const available = items.filter(t=>t.code===code && t.level===level);
        const option = document.createElement('option'); option.value = ''; option.textContent = `请选择${index === 0 ? '主宝石' : '材料'}（${available.length}个可用）`; select.append(option);
        for (const tower of available) { const o = document.createElement('option'); o.value = String(tower.id); o.textContent = gemLabel(tower) + (state.inventory.includes(tower) ? ' / 备选' : ' / 场上'); select.append(o); }
        group.append(select); return select;
      });
      const preview = document.createElement('p');
      const confirm = commandButton('确认消耗以上实体并融合', () => { const ids = selectors.map(select => Number(select.value)); resultMessage(game.forge(recipe.code, ids[0], ids.slice(1))); }, true);
      const reset = () => { confirm.disabled = true; preview.textContent = '材料更改后请重新预览。'; }; selectors.forEach(select => select.addEventListener('change', reset));
      group.append(commandButton('预览融合', () => {
        const ids = selectors.map(select=>Number(select.value));
        const ready = editable() && selectors.every(select=>select.value !== '') && new Set(ids).size===ids.length && state.tech.deployment>=recipe.deployment && state.tech.reinforcement>=recipe.reinforcement;
        preview.textContent = ready ? gemFusionPreview(items.find(tower=>tower.id===ids[0]), ids.slice(1).map(id=>items.find(tower=>tower.id===id)), recipe) : '请选择全部且不重复的材料，并完成所需科技。'; confirm.disabled = !ready;
      }, !editable()), preview, confirm); parent.append(group);
    }
    parent.append(commandButton('准备完毕 · 开始下一波', () => resultMessage(game.startCombat()), !editable() || !!state.draft));
  } else if (state.mode === 'hero') {
    element('mission-objective').textContent = '守卫灵姬 · 神女存活且清空十五波；营地为可选挑战。';
    paragraph(parent, 'WASD持续移动；右键地面移动／敌人锁定；Q/E/R选技能后在地图点击目标。');
    for (const [key, skill] of Object.entries(HERO_SKILLS)) parent.append(commandButton(`${key} ${skill.name} · Lv.${skill.level} / ${skill.mana}法力 / ${skill.cooldown}秒`, () => armHeroSkill(key), state.phase !== 'playing' || state.paused || !state.hero.alive || state.hero.level < skill.level));
    for (const camp of state.camps) paragraph(parent, `${camp.id==='west'?'西侧':'东侧'}营地 · ${camp.cleared ? camp.rewardClaimed ? '奖励已领取' : '已清理，待领奖' : '尚未清理'}`);
    const reward = state.pendingCampReward;
    paragraph(parent, reward ? `营地奖励：${reward.kind === 'equipment' ? '三件装备选一' : '选择补给'}` : '靠近营地并击败精英后可领奖。');
    if (reward?.kind === 'equipment') for (const equipment of HERO_EQUIPMENT) parent.append(commandButton(`${equipment.name} · ${equipment.description}`, () => resultMessage(game.chooseCampReward(equipment.code)), !editable()));
    if (reward?.kind === 'supplies') for (const [code,label] of [['gold','100金币'],['mana','40法力']]) parent.append(commandButton(label, () => resultMessage(game.chooseCampReward(code)), !editable()));
    const equipment = state.hero.equipment;
    paragraph(parent, equipment ? `${HERO_EQUIPMENT.find(item=>item.code===equipment.code).name} Lv.${equipment.level}` : '尚未装备');
    parent.append(commandButton(`强化装备 · ${HERO_CONFIG.equipmentUpgrades.map(step=>`Lv.${step.heroLevel}/${step.cost}金`).join(' → ')}`, () => resultMessage(game.upgradeEquipment()), !editable() || !equipment || equipment.level >= 3));
  } else if (state.mode === 'legion') {
    element('mission-objective').textContent = '机关军团 · 单人对战AI · 一方国王倒下结束，双方同时倒下为平局。';
    const side = state.sides.player;
    paragraph(parent, `${state.turnPhase === 'planning' ? '准备阶段（不产资源／研究暂停）' : '战斗阶段（双方阵容与订单锁定）'} · 军需 ${side.mythium} · 工人 ${side.workers}/${LEGION_RULES.maxWorkers} · 永久收入 ${side.income}`);
    parent.append(commandButton(`购买工人 · ${LEGION_RULES.workerCost}金币`, () => resultMessage(game.buyWorker()), !editable() || side.workers >= LEGION_RULES.maxWorkers || side.gold < LEGION_RULES.workerCost), commandButton(`国王强化 Lv.${side.king.level}/${LEGION_RULES.king.maxLevel} · ${LEGION_RULES.king.upgradeCost}军需`, () => resultMessage(game.upgradeKing()), !editable() || side.king.level >= LEGION_RULES.king.maxLevel || side.mythium < LEGION_RULES.king.upgradeCost));
    for (const merc of LEGION_MERCENARIES) parent.append(commandButton(`${merc.name} · ${merc.cost}军需 / 成交收入+${merc.income} · ${merc.description}`, () => resultMessage(game.queueMercenary(merc.code)), !editable() || side.mythium < merc.cost || side.orders.length >= LEGION_RULES.maxOrders));
    paragraph(parent, `未成交 ${side.orders.length}/${LEGION_RULES.maxOrders} · 军需已预付 ${side.orders.reduce((sum,o)=>sum+(LEGION_MERCENARIES.find(m=>m.code===o.code)?.cost || 0),0)} · 成交后永久收入 +${side.orders.reduce((sum,o)=>sum+(LEGION_MERCENARIES.find(m=>m.code===o.code)?.income || 0),0)}`);
    for (const order of side.orders) parent.append(commandButton(`取消 ${LEGION_MERCENARIES.find(m=>m.code===order.code)?.name || order.code} #${order.id} · 全退军需`, () => resultMessage(game.cancelMercenary(order.id)), !editable()));
    parent.append(commandButton('锁定双方阵容与订单 · 开战', () => resultMessage(game.startCombat()), !editable()));
    const report = state.reports.at(-1);
    if (report) for (const id of ['player','ai']) { const r=report.sides[id]; paragraph(parent, `${id === 'player' ? '己方' : 'AI'}上轮：漏怪${r.leaks}，国王损伤${Math.round(r.kingDamage)}，击杀金币${r.gold}，回合收入${r.goldIncome}，军需+${r.mythiumIncome}`); }
  }
}
function heroInputAllowed() {
  return view === 'game' && !help.open && game.state.mode === 'hero' && game.state.phase === 'playing' && !game.state.paused && element('command-drawer').hidden && element('build-dock').hidden && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName);
}
function updateHeroMovement() {
  if (game.state.mode !== 'hero') return;
  const dx = Number(moveKeys.has('d'))-Number(moveKeys.has('a')), dy=Number(moveKeys.has('s'))-Number(moveKeys.has('w'));
  game.setMoveVector(heroInputAllowed() ? dx : 0, heroInputAllowed() ? dy : 0);
}
function heroSkillStatus(key) {
  const { state } = game, skill = HERO_SKILLS[key], hero = state.hero;
  if (state.mode !== 'hero' || state.phase !== 'playing') return { ok:false, message:'对局未进行' };
  if (state.paused) return { ok:false, message:'已暂停' };
  if (!hero.alive) return { ok:false, message:`复活 ${Math.ceil(hero.respawnIn)}秒` };
  if (hero.level < skill.level) return { ok:false, message:`${skill.level}级解锁` };
  if (hero.skillCooldowns[key] > 1e-9) return { ok:false, message:`冷却 ${hero.skillCooldowns[key].toFixed(1)}秒` };
  if (hero.mana < skill.mana) return { ok:false, message:`法力不足（需${skill.mana}）` };
  return { ok:true, message:armedSkill === key ? '点击地图目标' : `就绪 · ${skill.mana}法力` };
}
function armHeroSkill(key) {
  const status = heroSkillStatus(key);
  if (!status.ok) { resultMessage(status); return; }
  stopHero(); cancelBuild(); armedSkill = key; setDrawer(); setBuildDock(false);
  notice(`${key} ${HERO_SKILLS[key].name}：在战场点击目标；右键或Esc取消。`); updateUI(); canvas.focus({preventScroll:true});
}
function updateModeHud() {
  const state=game.state;
  element('hero-move-pad').hidden=state.mode!=='hero'; element('hero-hud').hidden=state.mode!=='hero'; element('legion-hud').hidden=state.mode!=='legion';
  if(state.mode==='hero') { const h=state.hero; element('hero-status').textContent=`${h.alive ? `英雄 Lv.${h.level} · HP ${Math.ceil(h.hp)}/${h.maxHp}` : `复活 ${Math.ceil(h.respawnIn)}秒`} · MP ${Math.floor(h.mana)}/${h.maxMana} · XP ${h.xp}${armedSkill?' · 待施放 '+armedSkill:''}`;
    for (const [key, skill] of Object.entries(HERO_SKILLS)) {
      const status = heroSkillStatus(key), button = /** @type {HTMLButtonElement} */ (element(`hero-${key.toLowerCase()}-button`));
      button.disabled = !status.ok;
      button.setAttribute('aria-pressed', String(armedSkill === key));
      const description = `${key} ${skill.name}，${skill.level}级解锁，${skill.mana}法力，冷却${skill.cooldown}秒，射程${skill.range}。${status.message}。点击后在地图选择目标，右键或Esc取消。`;
      button.setAttribute('aria-label', description); button.title = description;
      element(`hero-${key.toLowerCase()}-state`).textContent = status.message;
    }
  }
  element('build-dock').classList.toggle('hero-build-dock', state.mode === 'hero');
  if(state.mode==='legion') { const p=state.sides.player.king,a=state.sides.ai.king; element('legion-kings').textContent=`己王 ${Math.max(0,Math.ceil(p.hp))}/${p.maxHp} · AI王 ${Math.max(0,Math.ceil(a.hp))}/${a.maxHp} · 第${state.wave}回合 · ${legionView==='player'?'己方战场':'侦察AI战场'}`; element('scout-button').textContent=legionView==='player'?'侦察AI':'返回己方'; }
  if(['gem','legion'].includes(state.mode)) { element('next-wave-label').textContent='回合阶段'; element('next-wave-value').textContent=state.turnPhase==='planning'?'准备 · 任务面板主动开战':'战斗中'; }
  if(state.mode==='hero') element('pressure-label').textContent='神女耐久';
}

function updateMission() {
  const state = game.state;
  const escort = state.mode === 'escort';
  const maze = state.mode === 'maze';
  const playable = state.phase === 'playing';
  const special = ['gem', 'hero', 'legion'].includes(state.mode);
  element('mission-button').hidden = !escort && !maze && !special && state.mode!=='loop';
  element('mission-button').textContent=state.mode==='loop'?'情报':'任务';
  if(state.mode==='loop')element('mission-objective').textContent='看未来两波特性，安排破甲、破盾、控场与集火。';
  element('special-mission').hidden = !special;
  if (special) updateSpecialMission();
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
  const waveCap = state.mode==='maze'?12:state.mode==='hero'?15:20;
  const waitingForCard = cardLoop() && state.wave===0 && state.draft?.cost===0;
  const counting = !['gem','legion'].includes(state.mode) && Number.isFinite(state.nextWaveIn) && (state.endless || state.wave<waveCap) && (state.mode==='loop'||!state.waveActive);
  element('wave-label').textContent = waitingForCard ? '选择起手卡' : counting ? `${state.wave?'下波':'备战'} ${Math.max(0,Math.ceil(state.nextWaveIn))}s` : '波次';
  const placing = armedCardId!==null || !!armedCode || !!pendingGem || !!armedSkill || relocatingId!==null;
  const action = cardLoop() ? '卡牌' : '建造';
  element('focus-button').textContent = placing ? '取消放置' : element('build-dock').hidden ? action : `收起${action}`;
  element('focus-button').classList.toggle('cancel-placement',placing);
  element('wave-value').textContent = state.endless ? `∞ ${state.wave}` : state.mode === 'escort' ? String(state.wave) : `${state.wave} / ${state.mode === 'maze' ? 12 : state.mode === 'hero' ? 15 : state.mode === 'legion' ? '∞' : 20}`;
  const activeCount=cardLoop() ? state.enemies.filter(enemy=>enemy.special!=='gold').length : state.enemies.length;
  element('enemy-value').textContent = String(activeCount);
  element('enemy-limit').textContent = String(state.limit);
  element('kill-value').textContent = String(state.kills);
  const defense = state.mode !== 'loop';
  element('current-mode').textContent = MODE_DETAILS[state.mode].name;
  canvas.setAttribute('aria-label', `${MODE_DETAILS[state.mode].name}战场。${cardLoop()?'打开卡牌并选择部署，再在地图亮处选点。':'点“建造”选择工事，再在地图亮处选点。'}方向键移动光标，Shift 加方向键微调，Enter 放置，Esc 取消。`);
  element('pressure-label').textContent = state.mode === 'escort' ? '载具耐久' : state.mode === 'maze' ? '出口耐久' : defense ? '核心耐久' : '环路积怪';
  element('loop-pressure-value').hidden = defense;
  element('core-pressure-value').hidden = !defense;
  element('defense-enemy-status').hidden = !defense;
  element('core-health-value').textContent = String(Math.max(0,Math.ceil(state.coreHealth)));
  element('core-health-limit').textContent = String(state.maxCoreHealth || state.sides?.player.king.maxHp || 20);
  element('defense-enemy-value').textContent = String(state.enemies.length);
  element('next-wave-label').textContent = defense && state.waveActive ? '本波进攻' : '下一波';
  element('next-wave-value').textContent = defense
    ? state.waveActive ? `${DEFENSE_LANES[state.attackLane]?.name || '作战中'}`
      : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒 · ${DEFENSE_LANES[state.wave % DEFENSE_LANES.length].name}`
    : waitingForCard ? '选择起手卡后开始倒计时'
      : state.wave >= 20 && !state.endless
        ? state.goldRush || state.goldRushQueued ? '金币奖励结算中' : '清理剩余敌人'
        : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒`;
  const pressure = defense ? 1 - state.coreHealth / (state.maxCoreHealth || state.sides?.player.king.maxHp || 20) : activeCount / state.limit;
  const fill = element('pressure-fill');
  fill.style.width = `${Math.max(0, Math.min(1, defense ? 1 - pressure : pressure)) * 100}%`;
  fill.classList.toggle('warning', pressure >= .55 && pressure < .8);
  fill.classList.toggle('danger', pressure >= .8);
  element('pause-button').textContent = state.paused ? '继续' : '暂停';
  element('pause-button').setAttribute('aria-pressed', String(state.paused));
  element('speed-button').textContent = `${state.speed}× 速度`;
  element('mute-button').textContent = audio.muted ? '声音关' : '声音开';
  element('mute-button').setAttribute('aria-pressed', String(audio.muted));
  if (!cardLoop() && !element('build-dock').hidden) updateShopSelection();
  updateResearch();
  renderLoopCards();
  renderLoopEquipmentShop();
  updateLoopPanels();
  updateMission();
  updateLoopEvents(activeCount);
  updateModeHud();
  refreshPlacement();
  updateSelection();
  if (lastPhase !== state.phase) {
    lastPhase = state.phase;
    if (['victory', 'defeat', 'draw'].includes(state.phase)) showEnd();
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
  endings.gem = ['万象宝石通关', '宝石防线失守', '二十波已清场，鉴定与融合防线完成。', '出口耐久耗尽。调整选留与融合策略再试。'];
  endings.hero = ['守卫灵姬成功', '灵姬神殿失守', '十五波已清场，英雄与防线守住了神殿。', '神女耐久耗尽。配合英雄走位、打断与护盾再试。'];
  endings.legion = ['机关军团获胜', '机关军团落败', '对手国王已倒下，双边攻防结束。', '己方国王已倒下，调整经济、阵型与派兵再试。'];
  const ending = state.phase === 'draw' ? ['双方国王同时倒下', '机关军团平局', '双方同一步受到致命伤害。', '双方同一步受到致命伤害。'] : endings[state.mode];
  element('end-title').textContent = ending[success ? 0 : 1];
  element('end-description').textContent = ending[success ? 2 : 3];
  element('end-stats').innerHTML = [
    ...(state.mode !== 'loop' ? [[state.mode === 'escort' ? '载具耐久' : state.mode === 'maze' ? '出口耐久' : '核心耐久', `${Math.max(0,Math.ceil(state.coreHealth))} / ${state.maxCoreHealth || state.sides?.player.king.maxHp || 20}`], ...(state.mode === 'escort' ? [] : [['漏过敌人', state.leaks ?? state.sides?.player.lastLeaks ?? 0]])] : []),
    ...(state.mode === 'escort' ? [['护送距离', `${Math.floor(state.convoy.progress)} / ${state.convoy.length}`]] : []),
    ...(state.mode === 'legion' ? [['AI国王耐久', `${Math.max(0,Math.ceil(state.sides.ai.king.hp))} / ${state.sides.ai.king.maxHp}`]] : []),
    ['抵御波次', state.wave], ['击杀敌人', state.kills], ['守卫时间', `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`],
  ].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  const endlessAvailable = success && ['loop', 'defense', 'maze'].includes(state.mode);
  element('endless-button').hidden = !endlessAvailable;
  showView('end');
  element(endlessAvailable ? 'endless-button' : 'restart-button').focus();
}

function clearTransient() {
  selectedEnemyId=null;loopPanelSignature='';loopCardsSignature='';loopCardSelection='';shopSelection='';loopEquipmentSignature='';loopChallengeSignature='';armedCardId=null;
  stopHero();
  pendingGem = null; armedSkill = null; legionView = 'player';
  selectedTowerId = null;
  relocatingId = null;
  armedCode = null;
  placement = null;
  pointerPosition = null;
  keyboardMode = false;
  keyboardPointer.x = 190;
  keyboardPointer.y = 140;
  selectedSignature = ''; specialSignature = '';
  element('notice').hidden = true;
  noticeUntil = 0;
  setBuildDock(false);
  setDrawer();
  touchControls?.reset();
  renderer.reset();
}

function updateMenu() {
  for (const mode of modeNames) element(`mode-${mode}-button`).setAttribute('aria-pressed', String(game === sessions[mode]));
  element('mode-description').textContent = MODE_DETAILS[game.state.mode].description;
  element('start-button').textContent = game.state.phase === 'menu' ? '开始布防 →'
    : game.state.phase === 'playing' ? '继续布防 →' : '查看战报 →';
}

function returnToMenu() {
  if (view === 'game' && !window.confirm('返回主菜单？本局将暂停并保留，可点“继续游戏”返回。')) return;
  stopHero();
  if (game.state.phase === 'playing' && !game.state.paused) game.togglePause();
  clearTransient();
  showView('menu');
  element('start-button').focus();
}

function selectMode(mode) {
  if (view !== 'menu' || game === sessions[mode]) return;
  stopHero();
  if (game.state.phase === 'playing' && !game.state.paused) game.togglePause();
  clearTransient();
  game = sessions[mode];
  buildItems = buildItemsFor();
  if (artworkCache) renderShop();
  lastPhase = game.state.phase;
  updateMenu();
  updateUI();
}

function enterGame(restart = false) {
  void audio.unlock();
  if (!restart && ['victory', 'defeat', 'draw'].includes(game.state.phase)) {
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
  if (freshSession) setBuildDock(cardLoop() && !!game.state.draft);
  showView('game');
  if (freshSession && !cardLoop()) notice(['gem', 'hero', 'legion'].includes(game.state.mode) ? ({gem:'点击“建造”鉴定宝石；菜单内查看任务。',hero:'WASD移动，右键移动或指定敌人；Q/E/R后点击目标，菜单内查看装备和营地奖励。',legion:'单人对战AI：建造守军，菜单内管理经济派兵并主动开战；侦察按钮切换战场。'})[game.state.mode] : `点击“建造”选择工事；“科技”打开研究。${['escort', 'maze'].includes(game.state.mode) ? '菜单内查看任务与主动指令。' : ''}`, 3);
  lastPhase = game.state.phase;
  updateUI();
  canvas.focus({ preventScroll: true });
}

function armBuild(code) {
  selectedEnemyId=null;
  if (game.state.mode === 'gem') { setDrawer('mission'); notice('宝石只能通过任务面板鉴定选留。'); return; }
  if (game.state.mode === 'legion' && legionView !== 'player') { notice('返回己方战场后才能部署。'); return; }
  const eligibility = game.canBuildType(code);
  if (!eligibility.ok) { notice(eligibility.message); return; }
  pendingGem = null; armedSkill = null;
  setDrawer();
  armedCode = code;
  relocatingId = null;
  selectedTowerId = null;
  pointerPosition = null;
  setBuildDock(false);
  void audio.unlock();
  updateUI();
  canvas.focus({ preventScroll: true });
}

function bindControls() {
  for (const section of towerSections) element(`tower-${section}-button`).addEventListener('click', () => {
    showTowerSection(element(`tower-${section}`).hidden ? section : null);
  });
  for (const key of ['Q','E','R']) element(`hero-${key.toLowerCase()}-button`).addEventListener('click', () => armHeroSkill(key));
  element('research-button').addEventListener('click', () => {
    const isOpen = element('research-button').getAttribute('aria-expanded') === 'true';
    setDrawer(isOpen ? null : cardLoop() ? 'equipment' : 'research', element('research-button'));
    updateUI();
  });
  element('more-button').addEventListener('click', () => {
    const open = element('more-button').getAttribute('aria-expanded') === 'true';
    setDrawer(open ? null : 'settings', element('more-button'));
  });
  element('close-drawer-button').addEventListener('click', () => {
    if (!element('loop-encyclopedia').hidden) {
      setDrawer('mission', element('more-button'));
      element('loop-encyclopedia-button').focus({preventScroll:true});
    } else {
      if (element('command-drawer').dataset.view === 'tower') { selectedTowerId = null; selectedEnemyId = null; }
      setDrawer();
    }
  });
  element('loop-encyclopedia-button').addEventListener('click', () => {
    setDrawer('encyclopedia',element('more-button'));
    renderLoopEncyclopedia();
  });
  element('loop-encyclopedia-filter').addEventListener('change',renderLoopEncyclopedia);
  element('focus-button').addEventListener('click', () => {
    if (armedCardId!==null || armedCode || pendingGem || armedSkill || relocatingId!==null) { cancelBuild(); return; }
    if (game.state.mode === 'gem') { setDrawer('mission', element('focus-button')); return; }
    setBuildDock(element('build-dock').hidden);
    updateUI();
  });
  element('start-button').addEventListener('click', () => enterGame());
  element('restart-button').addEventListener('click', () => enterGame(true));
  element('endless-button').addEventListener('click', () => {
    void audio.unlock();
    const result = game.continueEndless ? game.continueEndless() : { ok: false, message: '本模式没有无尽挑战。' };
    if (!result.ok) { resultMessage(result); return; }
    touchControls?.reset();
  renderer.reset();
    lastPhase = 'playing';
    showView('game');
    resultMessage(result);
    canvas.focus({ preventScroll: true });
  });
  element('pause-button').addEventListener('click', () => { stopHero(); game.togglePause(); updateUI(); });
  element('speed-button').addEventListener('click', () => { game.setSpeed(game.state.speed % 3 + 1); updateUI(); });
  element('mute-button').addEventListener('click', () => { void audio.unlock(); audio.setMuted(!audio.muted); updateUI(); });
  element('menu-button').addEventListener('click', returnToMenu);
  element('home-button').addEventListener('click', returnToMenu);
  element('choose-mode-button').addEventListener('click', returnToMenu);
  for (const mode of modeNames) element(`mode-${mode}-button`).addEventListener('click', () => selectMode(mode));
  element('mission-button').addEventListener('click', () => {
    const open = element('mission-button').getAttribute('aria-expanded') === 'true';
    setDrawer(open ? null : 'mission', element('more-button'));
    updateUI();
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
    stopHero();
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
  element('build-filters').addEventListener('click', event => {
    const filter = /** @type {HTMLElement} */ (event.target).closest('button[data-category]');
    if (filter) filterShop(/** @type {HTMLElement} */ (filter).dataset.category);
  });
  element('shop-list').addEventListener('click', event => {
    const card = /** @type {HTMLElement} */ (event.target).closest('button[data-code]');
    if (!card) return;
    const code = /** @type {HTMLButtonElement} */ (card).dataset.code;
    shopSelection = shopSelection === code ? '' : code;
    updateShopSelection();
  });
  element('shop-build-button').addEventListener('click', () => { if (shopSelection) armBuild(shopSelection); });
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
  canvas.addEventListener('pointerleave', event => {
    if(event.pointerType==='touch')return;
    pointerPosition = null;
    refreshPlacement();
  });
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    const hadAction = armedCardId!==null || !!armedCode || !!pendingGem || !!armedSkill || relocatingId !== null;
    cancelBuild();
    if (hadAction) return;
    if (game.state.mode === 'hero' && heroInputAllowed()) {
      stopHero(); const point = pointer(event);
      const id = renderer.hitTest(point.x, point.y, game.state.enemies);
      resultMessage(id !== null && id !== undefined ? game.targetEnemy(id) : game.moveHeroTo(point.x, point.y));
    }
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
    const key = event.key.toLowerCase();
    if (game.state.mode === 'hero' && heroInputAllowed()) {
      if (['w','a','s','d'].includes(key)) { event.preventDefault(); moveKeys.add(key); updateHeroMovement(); return; }
      if (['q','e','r'].includes(key) && !event.repeat) { event.preventDefault(); armHeroSkill(key.toUpperCase()); return; }
    }
    if (event.key === ' ' && !['BUTTON', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); stopHero(); game.togglePause(); updateUI();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const hadDrawer = !element('command-drawer').hidden;
      setDrawer();
      setBuildDock(false);
      selectedTowerId = null; selectedEnemyId = null; cancelBuild();
      if (!hadDrawer) canvas.focus({ preventScroll: true });
    }
  });
  document.addEventListener('focusin', () => { if (game.state.mode === 'hero' && !heroInputAllowed()) stopHero(); });
  document.addEventListener('keyup', event => { if (['w','a','s','d'].includes(event.key.toLowerCase())) { moveKeys.delete(event.key.toLowerCase()); updateHeroMovement(); } });
  globalThis.window?.addEventListener?.('blur', stopHero);
  element('scout-button').addEventListener('click', () => { cancelBuild(); legionView = legionView === 'player' ? 'ai' : 'player'; selectedTowerId = null; setDrawer(); updateUI(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHero();
    if (document.hidden && game.state.phase === 'playing' && !game.state.paused) {
      game.togglePause(); notice('离开页面，已自动暂停。'); updateUI();
    }
  });
}

function filterShop(category) {
  const shop = element('shop-list');
  for (const filter of element('build-filters').querySelectorAll('button[data-category]')) {
    filter.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (filter).dataset.category === category));
  }
  for (const card of shop.querySelectorAll('.tower-card')) {
    const button = /** @type {HTMLButtonElement} */ (card);
    button.hidden = category !== 'all' && !button.dataset.categories.split(' ').includes(category);
    if (button.hidden && button.dataset.code === shopSelection) shopSelection = '';
  }
  updateShopSelection();
  shop.scrollLeft = 0;
  element('build-dock').scrollTop = 0;
}

function updateShopSelection() {
  for (const card of element('shop-list').querySelectorAll('.tower-card')) {
    const button = /** @type {HTMLButtonElement} */ (card);
    const eligibility = game.canBuildType(button.dataset.code);
    button.setAttribute('aria-pressed', String(shopSelection === button.dataset.code));
    button.classList.toggle('locked', !eligibility.ok);
  }
  const tower = buildItems.find(item => item.code === shopSelection);
  element('shop-tower-preview').hidden = !tower;
  if (!tower) return;
  const eligibility = game.canBuildType(tower.code);
  const role = tower.code === 'T06' ? '范围输出 · 减速' : roles[tower.kind];
  element('shop-tower-name').textContent = `${tower.name} · ${tower.price} 金币`;
  element('shop-tower-description').textContent = [role,tower.description,eligibility.ok ? '' : eligibility.message].filter(Boolean).join(' · ');
  const button = /** @type {HTMLButtonElement} */ (element('shop-build-button'));
  button.disabled = !eligibility.ok || game.state.paused || (game.state.mode === 'legion' && legionView !== 'player');
}

function renderShop() {
  const shop = element('shop-list');
  shop.setAttribute('aria-label',`${buildItems.length}种可查看的防御单位`);
    shop.replaceChildren();
    if(cardLoop())return;
    const levels = technologies().deployment.levels;
    const unlockLevel = tower => levels.findIndex(level => level.unlocks.includes(tower.code));
    for (const tower of [...buildItems].sort((a, b) => unlockLevel(a) - unlockLevel(b))) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'tower-card'; card.dataset.code = tower.code;
      card.dataset.categories = buildCategories(tower);
      card.setAttribute('aria-pressed', 'false');
      const image = document.createElement(tower.code === 'WALL'||['T13','T14'].includes(tower.code) ? 'span' : 'img');
      if(['T13','T14'].includes(tower.code)){image.className='gem-portrait';image.style.backgroundPosition=tower.code==='T13'?'66.6667% 0%':'33.3333% 50%';image.style.float='none';image.setAttribute('aria-hidden','true');}
      else if (tower.code === 'WALL') { image.className = 'wall-icon'; image.textContent = '▥'; image.setAttribute('aria-hidden', 'true'); }
      else {
        const unit = artworkCache.units.get(tower.assetCode || tower.code);
        setPortrait(/** @type {HTMLImageElement} */ (image), unit?.masterImage?.src ?? unit?.masterUrl.href, undefined);
      }
      const name = document.createElement('strong'); name.textContent = tower.name;
      card.setAttribute('aria-controls','shop-tower-preview');
      card.append(image, name); shop.append(card);
    }
    filterShop('all');
}

async function boot() {
  try {
    const artwork = await loadArtwork(undefined, undefined, { progressive: true });
    renderer = createRenderer(canvas, artwork);
    artworkCache = artwork;
    renderShop();
    bindControls();
    fitBattlefield();
    touchControls=createTouchControls(canvas,{
      canInteract:()=>view==='game'&&game.state.phase==='playing'&&!game.state.paused&&(element('command-drawer').hidden||element('command-drawer').dataset.view==='tower')&&(cardLoop()||element('build-dock').hidden),
      hasAction:()=>armedCardId!==null||!!armedCode||!!pendingGem||!!armedSkill||relocatingId!==null,
      isHero:()=>game.state.mode==='hero',
      onMove:(x,y)=>{if(game.state.mode==='hero')game.setMoveVector(x,y);},
      onCancel:cancelBuild,
      onPreview:point=>{pointerPosition=point;refreshPlacement();return placement||{ok:false,message:'先选择操作'};},
      onActivate:point=>{
        void audio.unlock();
        if(game.state.mode==='hero'&&!armedCode&&!pendingGem&&!armedSkill&&relocatingId===null){
          const id=renderer.hitTest(point.x,point.y,game.state.enemies);
          const tower=renderer.hitTest(point.x,point.y,game.state.towers);
          if(tower!==null)activatePoint(point);
          else resultMessage(id!==null?game.targetEnemy(id):game.moveHeroTo(point.x,point.y));
        }else activatePoint(point);
      }
    });
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
        renderer.draw(game.state.mode === 'legion' ? { ...game.state, viewSide: legionView } : game.state, selectedTowerId, placement, dt, keyboardMode ? keyboardPointer : null, buildArea);
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
