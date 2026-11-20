import { createTouchControls } from './touch-controls.js';
import { createLoopGame } from './loop-session.js';
import { WORLD } from './geometry.js';
import { createAudio } from './audio.js';
import { loadArtwork, createRenderer, loopSpriteUrl } from './render.js';
import { ICON_ATLAS, towerSkillCell, towerSkillIcon, towerVisual } from './battle-visuals.js';
import { affixApplies } from './loop-catalog.js';
import { equipmentCraftCost, equipmentPurchasePrice, LOOP_DEPUTY_LEVELS } from './loop-equipment.js';

/** @template {HTMLElement} T @param {string} id @returns {T} */
function element(id) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`界面缺少必要元素：${id}`);
  return /** @type {T} */ (found);
}

const canvas = /** @type {HTMLCanvasElement} */ (element('game-canvas'));
const touchPointer = globalThis.matchMedia?.('(pointer: coarse)');
const help = /** @type {HTMLDialogElement} */ (element('help-dialog'));
const game = createLoopGame();
const audio = createAudio();
let artworkCache;
let armedEquipment = null;
let touchControls = null;
function editable() { return game.state.phase === 'playing' && !game.state.paused; }

let renderer;
let loop3D = null;
let battle3D = null;
let wants3D = false;
let yoshinoAsset = null;
let readyTowerSignature = '';
let selectedTowerId = null;
let selectedEnemyId = null;
let loopPanelSignature = '';
let refreshTowerEquipment = null;
let loopCardsSignature = '';
let loopCardSelection = '';
let loopCardTab = 'shop';
let loopExchangeCode = '';
let loopExchangeCards = [];
let equipmentTab = 'shop';
let equipmentSelection = '';
let towerEquipmentSelection = '';
let towerSkillSelection = '';
let loopEquipmentSignature = '';
let loopChallengeSignature = '';
let armedCardId = null;
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
/** @type {HTMLElement} */
let drawerTrigger = canvas;
let inspectedTowerId = null;
function setBuildDock(open) {
  if(open)touchControls?.clear();
  const dock = element('build-dock');
  const opening = open && dock.hidden;
  const restoreFocus = !open && dock.contains(document.activeElement);
  if (open) setDrawer();
  if (!open && !dock.hidden) {
    loopCardSelection = '';
    loopCardsSignature = '';
  }
  dock.hidden = !open;
  if (opening) dock.scrollTop = 0;
  const button = element('focus-button');
  button.setAttribute('aria-pressed', String(open));
  button.setAttribute('aria-expanded', String(open));
  if (restoreFocus) canvas.focus({ preventScroll: true });
}

/** @param {HTMLElement} trigger */
function setDrawer(mode = null, trigger = canvas) {
  if(mode)touchControls?.clear();
  if (mode) setBuildDock(false);
  const drawer = element('command-drawer');
  const restoreFocus = drawer.contains(document.activeElement);
  const changingView = drawer.dataset.view !== (mode || '');
  const changingTower = mode === 'tower' && (changingView || inspectedTowerId !== selectedTowerId);
  if (changingTower) {
    towerEquipmentSelection = '';
    towerSkillSelection = '';
  }
  inspectedTowerId = mode === 'tower' ? selectedTowerId : null;
  drawer.hidden = !mode;
  drawer.dataset.view = mode || '';
  element('loop-equipment-shop').hidden = mode !== 'equipment';
  element('loop-encyclopedia').hidden = mode !== 'encyclopedia';
  element('selection-panel').hidden = mode !== 'tower';
  element('mission-panel').hidden = mode !== 'mission';
  element('settings-panel').hidden = mode !== 'settings';
  element('more-button').setAttribute('aria-expanded', String(mode === 'settings'));
  element('drawer-title').textContent = mode === 'tower' ? '工事详情' : mode === 'mission' ? '战场情报' : mode === 'settings' ? '对局菜单' : mode === 'equipment' ? '装备' : '塔卡与怪物图鉴';
  element('equipment-button').setAttribute('aria-expanded', String(mode === 'equipment'));
  element('loop-intel-button').setAttribute('aria-expanded', String(mode === 'mission' || mode === 'encyclopedia'));
  if (mode) {
    if (changingView || changingTower) drawer.scrollTop = 0;
    drawerTrigger = trigger;
    if (mode !== 'tower') element('close-drawer-button').focus({ preventScroll: true });
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
    canvas.style.setProperty('--battle-fit-width', `${fittedWidth}px`);
    canvas.style.setProperty('--battle-fit-height', `${fittedWidth * WORLD.height / WORLD.width}px`);
  }).observe(frame);
}

function showView(name) {
  touchControls?.clear();
  if (name !== 'game') setDrawer();
  if (name === 'menu') updateMenu();
  view = name;
  document.body.classList.toggle('in-game', name === 'game');
  for (const screen of ['menu', 'game', 'end']) element(`${screen}-screen`).hidden = name !== screen;
  applyBattleView();
}

function clearCameraPoint() {
  touchControls?.clear();
  pointerPosition = null;
  keyboardMode = false;
  refreshPlacement();
}

function fallBackTo2D(error) {
  wants3D = false;
  applyBattleView();
  notice('3D 渲染不可用，已回到同一局的 2D。', 5);
  if (error) console.warn(error);
}

function applyBattleView() {
  if (!loop3D) return;
  const settings = element('loop-3d-settings');
  const toggle = element('loop-3d-toggle');
  settings.hidden = false;
  const active = wants3D && view === 'game';
  if (active && !battle3D) {
    try {
      clearCameraPoint();
      touchControls?.reset();
      battle3D = loop3D.mount({
        canvas, cameraPanel:element('loop-camera-tools'), artwork:artworkCache,
        onTap:event=>touchControls.tap(battle3D.point(event,game.state,!hasMapAction())),
        onClear:clearCameraPoint,
        onEdgePan:event=>{
          pointerPosition = battle3D.point(event,game.state);
          refreshPlacement();
        },
        onPitch:pitch=>{ element('loop-camera-pitch').textContent = `${pitch}°`; },
        onLost:fallBackTo2D,
        onModelError:error=>{
          yoshinoAsset = null;
          element('loop-3d-status').textContent = '模型无法渲染，当前使用低模怪物。';
          console.warn(error);
        }
      });
      battle3D.setModel(yoshinoAsset);
    } catch (error) {
      fallBackTo2D(error);
    }
  } else if (!active && battle3D) {
    const previous = battle3D;
    battle3D = null;
    previous.dispose();
    clearCameraPoint();
    touchControls?.reset();
    renderer.reset();
  }
  toggle.textContent = battle3D ? '切回 2D' : '开启 3D';
  settings.parentElement.classList.toggle('has-loop-3d',!!battle3D);
}

async function enableLocal3D() {
  try {
    const module = await import('./local-3d/index.js');
    loop3D = await module.loadLoop3D();
    wants3D = true;
    element('loop-3d-toggle').addEventListener('click',()=>{
      wants3D = !wants3D;
      applyBattleView();
      setDrawer();
    });
    const input = /** @type {HTMLInputElement} */ (element('loop-3d-model'));
    const status = element('loop-3d-status');
    async function loadEnemyModel(files) {
      input.disabled = true;
      status.textContent = '正在读取本地模型…';
      try {
        const selected = await files;
        if (!selected) {
          status.textContent = '请在这里选择四糸乃模型与两张贴图，当前使用低模怪物。';
          return;
        }
        yoshinoAsset = await loop3D.loadModel(selected);
        status.textContent = '四糸乃已加载，暂用于所有怪物。';
        battle3D?.setModel(yoshinoAsset);
      } catch (error) {
        status.textContent = error.message || '模型加载失败。请重新选择三个文件。';
      } finally {
        input.value = '';
        input.disabled = false;
      }
    }
    input.addEventListener('change',()=>{
      if (input.files.length) void loadEnemyModel(input.files);
    });
    applyBattleView();
    void loadEnemyModel(loop3D.findLocalModel().catch(()=>null));
  } catch (error) {
    console.warn('本地 3D 未启动',error);
  }
}

function notice(message, seconds = 2.8) {
  element('notice').textContent = message;
  element('notice').hidden = false;
  noticeUntil = performance.now() + seconds * 1000;
}

function syncEvents() {
  for (const event of game.drainEvents()) {
    if (battle3D) battle3D.event(event,game.state);
    else renderer.event(event);
    audio.play(event);
    if (['wave', 'wave-clear', 'challenge-end', 'gold-rush', 'gold-rush-end'].includes(event.type)) notice(event.message || '战场状态已更新', 2.5);
  }
}

function resultMessage(result) {
  notice(result?.message || (result?.ok ? '操作完成' : '当前不能执行此操作'));
  syncEvents();
  selectedSignature = '';
  updateUI();
}

function hasMapAction() {
  return armedCardId !== null || armedEquipment !== null;
}

function refreshPlacement() {
  const card = game.state.cards.find(item => item.id === armedCardId);
  const pending = game.catalog.find(item => item.code === card?.code);
  const eligibility = card ? game.canDeploy(card.id) : null;
  buildArea = eligibility?.ok ? { code: card.code } : null;
  placement = card && pointerPosition
    ? { ...pointerPosition, code: card.code, ...game.canDeploy(card.id, pointerPosition.x, pointerPosition.y) }
    : null;
  if (armedEquipment && pointerPosition) {
    placement={...pointerPosition,skill:armedEquipment.name,
      ...game.canCastEquipment(armedEquipment.towerId,armedEquipment.itemId,pointerPosition.x,pointerPosition.y)};
  }
  const name = armedEquipment?.name ?? pending?.name;
  const problem = placement && !placement.ok ? placement.message : eligibility && !eligibility.ok ? eligibility.message : '';
  const hint = armedEquipment ? '点选目标施放' : touchPointer?.matches ? (battle3D ? '点按地图预览，再确认' : '点按或拖动亮处预览，再确认') : '移到亮处预览，点击放置';
  const message = name ? [name, pending && `${pending.population} 人口`, problem || (!armedEquipment && placement?.ok ? '可在此放置' : hint)].filter(Boolean).join(' · ') : '';
  const status = element('build-status');
  status.hidden = !message;
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('invalid', !!problem);
}

function clearMapAction() {
  touchControls?.clear();
  armedCardId = null;
  armedEquipment = null;
  placement = null;
}

function cancelBuild() {
  const returnToTower = armedEquipment !== null && selectedTowerId !== null;
  clearMapAction();
  if (returnToTower) setDrawer('tower');
  updateUI();
}

function activatePoint(point) {
  pointerPosition = point;
  if (armedCardId !== null) {
    const waitingForStarter = game.state.starter !== 'deployed';
    const result = game.deploy(armedCardId, point.x, point.y);
    if (result.ok && 'towerId' in result) {
      armedCardId = null;
      selectedTowerId = result.towerId;
      touchControls?.clear();
      if (battle3D) setDrawer('tower');
    }
    resultMessage(result.ok && waitingForStarter && game.state.starter === 'deployed'
      ? { ...result, message: `起手塔已部署 · ${Math.ceil(game.state.nextWaveIn)} 秒后开始首波` }
      : result);
    return;
  }
  if (armedEquipment) {
    const result=game.castEquipment(armedEquipment.towerId,armedEquipment.itemId,point.x,point.y);
    if(result.ok) {armedEquipment=null;touchControls?.clear();setDrawer('tower');}
    resultMessage(result);
    return;
  }
  const picked = point.actor;
  selectedTowerId = picked !== undefined ? (picked?.kind === 'tower' ? picked.id : null)
    : renderer.hitTest(point.x, point.y, game.state.towers);
  selectedEnemyId = selectedTowerId ? null : picked !== undefined ? (picked?.kind === 'enemy' ? picked.id : null)
    : game.state.enemies.find(enemy => Math.hypot(enemy.x - point.x, enemy.y - point.y) < 32)?.id ?? null;
  setDrawer(selectedTowerId || selectedEnemyId ? 'tower' : null, canvas);
  if (!selectedTowerId && !selectedEnemyId) setBuildDock(false);
  updateUI();
}

function updateSelection() {
  const tower = game.state.towers.find(tower => tower.id === selectedTowerId);
  if (element('command-drawer').dataset.view === 'tower' && !tower && !game.state.enemies.some(enemy => enemy.id === selectedEnemyId)) {
    selectedTowerId = null;
    selectedEnemyId = null;
    setDrawer();
  }
  const signature = tower ? JSON.stringify([tower.id, tower.level, tower.awakened, tower.equipment.map(item=>item.code), game.state.endless,
    game.state.towers.map(item => [item.id, item.level, item.pulseUntil > game.state.elapsed])]) : '';
  if (selectedSignature === signature) return;
  selectedSignature = signature;
  element('tower-panel').hidden = !tower;
  if (!tower) return;
  const stats = game.statsFor(tower);
  element('tower-title').textContent = `${stats.name} · ${loopTier[stats.rarity]} · ${towerLevelLabel(tower)}`;
  const portrait = element('loop-selected-portrait');
  if (portrait.dataset.code !== tower.code) {
    portrait.dataset.code = tower.code;
    portrait.replaceChildren();
    loopPortrait(portrait, tower.code, tower.assetCode);
  }
  const details = stats.damage > 0
    ? [`伤害 ${Math.round(stats.damage)}`, `间隔 ${(stats.interval || 0).toFixed(2)} 秒`, `射程 ${Math.round(stats.range)}`]
    : stats.kind === 'supply' ? [`每 ${stats.supplyInterval} 秒 +${stats.supplyIncome} 金币`]
      : stats.kind === 'aura' ? [`作用半径 ${Math.round(stats.range)}`, '附近攻击宝石伤害与射程光环']
      : [`作用半径 ${stats.range}`, stats.kind === 'barrier' ? `减速 ${Math.round((1 - stats.slow) * 100)}%` : `强化 ${Math.round((stats.boost||0) * 100)}%`];
  if(stats.kind==='magic')details.push(`灼烧 ${Math.round(stats.burnDps)}/秒 · ${stats.burnDuration}秒（刷新不叠加）`);
  if(stats.kind==='multi')details.push(`同时独立攻击 ${stats.targetCount} 个目标`);
  element('tower-stats').replaceChildren(...details.map(detail => {
    const span = document.createElement('span');
    span.textContent = detail;
    return span;
  }));
}

/** @type {[RegExp, string][]} */
const actionIcons = [
  [/^部署/, 'deploy'], [/^售卡|^出售/, 'gold'],
  [/^合成/, 'merge'], [/^购买/, 'gold'], [/^卸下/, 'remove'], [/^装配|装备/, 'gear'],
  [/^开启/, 'play'],
  [/^取消/, 'remove'], [/^确认/, 'check'],
];

function setText(node,text) {
  if (node.textContent!==text) node.textContent=text;
}

function commandButton(label, action, disabled = false, icon = actionIcons.find(([pattern]) => pattern.test(label))?.[1]) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'button compact'; button.textContent = label; button.disabled = disabled;
  if (icon) button.dataset.icon = String(icon);
  button.addEventListener('click', action); return button;
}

/** @param {HTMLElement} node @param {number} cell */
function setIconCell(node, cell) {
  const sprite = String(cell);
  if (node.dataset.sprite === sprite) return;
  const columns = ICON_ATLAS.columns;
  node.dataset.sprite = sprite;
  node.style.setProperty('--icon-x', `${cell % columns / (columns - 1) * 100}%`);
  node.style.setProperty('--icon-y', `${Math.floor(cell / columns) / (columns - 1) * 100}%`);
}

function skillGlyph(code, index) {
  const icon = document.createElement('span');
  icon.className = 'skill-icon';
  icon.dataset.icon = towerSkillIcon(code, index);
  icon.style.color = towerVisual(code).color;
  icon.setAttribute('aria-hidden','true');
  const cell = towerSkillCell(code, index);
  if (cell !== undefined) setIconCell(icon, cell);
  return icon;
}

function skillLine(parent, code, index, label) {
  const line = document.createElement('p');
  const copy = document.createElement('span');
  line.className = 'skill-line';
  copy.textContent = label;
  line.append(skillGlyph(code,index),copy);
  parent.append(line);
}

function armCard(cardId) {
  const eligibility = game.canDeploy(cardId);
  if (!eligibility.ok) { notice(eligibility.message); return; }
  armedEquipment=null;
  armedCardId = cardId;
  pointerPosition = null;
  selectedTowerId = null;
  selectedEnemyId = null;
  setBuildDock(false);
  updateUI();
  canvas.focus({ preventScroll: true });
}

const loopTier = { common: 'R', rare: 'SR', epic: 'SSR' };
const attributeLabel = {strength:'力量',agility:'敏捷',intelligence:'智力'};
const dutyLabel = {damage:'输出',control:'控场',support:'辅助'};
const towerLevelLabel = tower => tower.deputyStage===undefined ? 'Lv.'+tower.level : tower.deputyStage+' 阶';
const skillLevel = index => index===3?30:2*index+1;
function skillRequirement(code,index) {
  const level=skillLevel(index);
  return Object.values(game.credentials).includes(code)?LOOP_DEPUTY_LEVELS.indexOf(level)+' 阶':level+' 级';
}
function towerIdentity(tower) {
  const damage = !tower.damage?'无直接伤害':tower.damageType==='physical'?'物理':tower.damageType==='magic'?'法术':'双系';
  return `${attributeLabel[tower.attribute]} · ${damage} · ${dutyLabel[tower.duty]}`;
}

function panelTabs(tabs, active, onSelect, label) {
  const group = document.createElement('div');
  group.className = 'loop-tabs';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [key, name] of tabs) {
    const button = commandButton(name, () => onSelect(key));
    button.dataset.tab = key;
    button.setAttribute('aria-pressed', String(key === active));
    group.append(button);
  }
  return group;
}

function panelChoice(name, key, selected, onSelect) {
  const button = commandButton('', () => onSelect(key));
  button.className = 'card-choice';
  button.dataset.choice = String(key);
  button.title = name;
  button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(key === selected));
  return button;
}

function choiceStrip(label) {
  const strip = document.createElement('div');
  strip.className = 'card-choice-strip';
  strip.setAttribute('role','group');
  strip.setAttribute('aria-label', label);
  return strip;
}

function keepEquipmentShelf(current, content) {
  const shelf=current?.children[1], nextShelf=content.children[1];
  if (shelf?.className!=='card-choice-strip' || nextShelf?.className!=='card-choice-strip') return false;
  const options=/** @type {HTMLElement[]} */ ([...shelf.children]);
  const nextOptions=/** @type {HTMLElement[]} */ ([...nextShelf.children]);
  if (options.length!==nextOptions.length || options.some((option,i)=>
    option.dataset.choice!==nextOptions[i].dataset.choice ||
    option.getAttribute('aria-label')!==nextOptions[i].getAttribute('aria-label'))) return false;
  options.forEach((option,i)=>option.setAttribute('aria-pressed',nextOptions[i].getAttribute('aria-pressed')));
  while (current.children.length>2) current.lastElementChild.remove();
  current.append(...[...content.children].slice(2));
  return true;
}

function replacePanel(root, content, keepShelf = false) {
  const focused = /** @type {HTMLElement} */ (document.activeElement);
  const inside = root.contains(focused);
  const current=root.firstElementChild;
  const samePanel=current && current.getAttribute('data-panel')===content.getAttribute('data-panel');
  const container=root.closest('#build-dock, #command-drawer');
  const scrollTop=samePanel?container?.scrollTop:undefined;
  let disclosure;
  if (samePanel) {
    const oldPreview=root.querySelector('.card-preview');
    const newPreview=content.querySelector('.card-preview');
    if (oldPreview && newPreview && oldPreview.getAttribute('data-card')===newPreview.getAttribute('data-card')) {
      disclosure=newPreview.querySelector('details');
      if (disclosure) disclosure.open=oldPreview.querySelector('details')?.open??false;
    }
  }
  if (!keepShelf || !samePanel || !keepEquipmentShelf(current,content)) {
    const scrollers = samePanel ? [...root.querySelectorAll('.card-choice-strip')].map(node=>node.scrollLeft) : [];
    root.replaceChildren(content);
    [...root.querySelectorAll('.card-choice-strip')].forEach((node,index)=>{
      if (scrollers[index]) node.scrollLeft=scrollers[index];
    });
  }
  if (inside && !root.contains(focused)) {
    const buttons = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll('button')]);
    const next = (focused.tagName==='SUMMARY'?disclosure?.querySelector('summary'):null) ?? buttons.find(button => !button.disabled &&
      (focused.dataset.choice ? button.dataset.choice === focused.dataset.choice :
        focused.dataset.tab ? button.dataset.tab === focused.dataset.tab : button.textContent === focused.textContent))
      ?? buttons.find(button => button.getAttribute('aria-pressed') === 'true')
      ?? buttons.find(button => !button.disabled);
    next?.focus({preventScroll:true});
  }
  if (scrollTop!==undefined && container.scrollTop!==scrollTop) container.scrollTop=scrollTop;
}

function revealPanelContent(node) {
  const container=node?.closest('#build-dock, #command-drawer');
  if (!container) return;
  const viewport=container.getBoundingClientRect();
  const target=node.getBoundingClientRect();
  if (!target.height) return;
  const heading=container.querySelector('.drawer-heading');
  const top=heading&&getComputedStyle(heading).position==='sticky'
    ? Math.max(viewport.top,heading.getBoundingClientRect().bottom) : viewport.top;
  const visible=Math.min(target.height,56,Math.max(0,container.clientHeight-(top-viewport.top)));
  if (target.top<top) container.scrollTop+=target.top-top;
  else if (target.top+visible>viewport.bottom) container.scrollTop+=target.top+visible-viewport.bottom;
}

function renderLoopCards() {
  const root = element('loop-cards');
  if (element('build-dock').hidden) return;

  const {cards, draft, starter, ssrMisses, wave, paused, phase, capacity, populationUsed} = game.state;
  element('build-dock').dataset.starter=starter??'';
  const packs = game.shopPacks ?? [];
  const canBuy = packs.map(pack => game.canDraw(pack.tier));
  const rCards = cards.filter(card => game.catalog.find(tower=>tower.code===card.code)?.rarity==='common');
  loopExchangeCards = loopExchangeCards.filter(id => rCards.some(card=>card.id===id));
  const signature = JSON.stringify([loopCardTab,loopCardSelection,loopExchangeCode,loopExchangeCards,cards,draft,starter,ssrMisses,canBuy,paused,phase,capacity,populationUsed,wave>=game.exchangeWave]);
  if (signature === loopCardsSignature) return;
  loopCardsSignature = signature;

  const panel = document.createElement('div');
  panel.className = 'loop-card-panel';
  panel.setAttribute('data-panel',loopCardTab);
  const tabs = [['shop','卡铺'],['bag',`卡包 ${cards.length}`]];
  if (draft) tabs.push(['draft','三选一']);
  if (wave >= game.exchangeWave) tabs.push(['exchange','换卡']);
  panel.append(panelTabs(tabs,loopCardTab,tab=>{loopCardTab=tab;loopCardSelection='';renderLoopCards();},'卡牌操作'));

  const contents = document.createElement('div');
  contents.className = 'loop-card-content';
  panel.append(contents);
  const preview = document.createElement('div');
  preview.id = 'loop-card-preview';
  preview.className = 'card-preview';
  preview.setAttribute('data-card',loopCardSelection);
  preview.hidden = true;
  const detail = document.createElement('article');
  detail.className = 'loop-content-card';
  const actions = document.createElement('div');
  actions.className = 'card-preview-actions';
  preview.append(detail,actions);
  const select = key => {
    loopCardSelection = loopCardSelection===key ? '' : key;
    renderLoopCards();
    if (loopCardSelection && (loopCardTab==='bag'||loopCardTab==='draft')) {
      revealPanelContent(root.querySelector('.card-preview-actions'));
    }
  };

  if (loopCardTab === 'draft' && draft) {
    const choices = choiceStrip(`${draft.starter?'起手 SR':draft.tier+' 卡包'}候选，免费选择一张`);
    for (const code of draft.codes) choices.append(loopCardChoice(code,code,loopCardSelection,select,'draft'));
    contents.append(choices);
    if (draft.codes.includes(loopCardSelection)) {
      preview.hidden=false;
      preview.replaceChildren(actions,loopCardDetails(loopCardSelection,true));
      actions.append(commandButton('领取这张卡',()=>{
        const result=game.choosePackCard(loopCardSelection);
        if (result.ok) {loopCardTab='bag';loopCardSelection=String(result.cardId);}
        resultMessage(result);
        if (result.ok) revealPanelContent(root.querySelector('.card-preview-actions'));
      },!editable(),'cards'));
    }
  } else if (loopCardTab === 'shop') {
    if (starter === 'unopened') {
      const open = game.canOpenStarter();
      const starterAction = commandButton('开启免费 SR 起手卡',()=>{
        const result=game.openStarterPack();
        if (result.ok) {loopCardTab='draft';loopCardSelection='';}
        resultMessage(result);
      },!open.ok,'cards');
      starterAction.classList.add('primary');
      contents.append(starterAction);
    } else if (starter === 'held') {
      paragraph(contents,'先部署起手 SR，首波才会倒计时。');
    }
    const choices = choiceStrip('卡包价位');
    for (const pack of packs) {
      const choice = panelChoice(`${pack.tier} 包，${pack.price} 金`,pack.tier,loopCardSelection,select);
      choice.classList.add('card-draw');
      choice.dataset.group='pack';
      choice.dataset.rarity=pack.tier==='SSR'?'epic':pack.tier==='SR'?'rare':'common';
      choice.dataset.icon='cards';
      const tier = document.createElement('strong');
      tier.textContent=pack.tier;
      const price = document.createElement('span');
      price.textContent=`${pack.price} 金`;
      choice.append(tier,price);
      choices.append(choice);
    }
    contents.append(choices);
    const selected = packs.find(pack=>pack.tier===loopCardSelection);
    if (selected) {
      const status = canBuy[packs.indexOf(selected)];
      const pity = selected.tier === 'SSR';
      const guarantee = pity && ssrMisses >= game.ssrGuarantee - 1;
      preview.hidden=false;
      detail.setAttribute('aria-label',`${selected.tier} 包 · ${selected.price} 金`);
      paragraph(detail,guarantee?'本包必出 SSR':Object.entries(selected.odds).filter(([,chance])=>Number(chance)>0).map(([tier,chance])=>`${tier} ${chance}%`).join('　'));
      if (pity && !guarantee) paragraph(detail,`连续 ${ssrMisses??0} 包未出 SSR · 最多再 ${game.ssrGuarantee-(ssrMisses??0)} 包`);
      if (!status.ok) paragraph(detail,status.message);
      const buy=commandButton(`购买 ${selected.tier} 包`,()=>{
        const result=game.buyPack(selected.tier);
        if (result.ok) {loopCardTab='draft';loopCardSelection='';}
        resultMessage(result);
      },!status.ok);
      buy.hidden=starter==='unopened'&&!status.ok;
      actions.append(buy);
    }
  } else if (loopCardTab === 'bag') {
    const choices = choiceStrip('持有塔卡');
    for (const card of cards) {
      choices.append(loopCardChoice(card.code, String(card.id),loopCardSelection,select,'bag'));
    }
    if (!cards.length) paragraph(contents,'卡包为空。前往卡铺开启或购买。');
    else contents.append(choices);
    const card = cards.find(item=>String(item.id)===loopCardSelection);
    if (card) {
      preview.hidden=false;
      preview.replaceChildren(actions,loopCardDetails(card.code,true));
      const eligibility = game.canDeploy(card.id);
      if (!eligibility.ok) paragraph(actions,eligibility.message);
      const sale = game.canSellCard?.(card.id) ?? {ok: card.paid || starter==='deployed'};
      const deploy = commandButton('部署',()=>armCard(card.id),!editable()||!eligibility.ok);
      deploy.classList.add('loop-card-deploy');
      actions.append(
        deploy,
        commandButton(`售卡 · +${card.refund??0} 金`,()=>resultMessage(game.sellCard(card.id)),!editable()||!sale.ok)
      );
    }
  } else {
    const rTowers = game.catalog.filter(tower=>tower.rarity==='common');
    if (!rTowers.some(tower=>tower.code===loopExchangeCode)) loopExchangeCode=rTowers[0]?.code;
    const target = document.createElement('select');
    target.setAttribute('aria-label','换取的 R 塔');
    for (const tower of rTowers) {
      const option=document.createElement('option');
      option.value=tower.code;
      option.textContent=String(tower.name);
      target.append(option);
    }
    target.value=loopExchangeCode;
    target.addEventListener('change',()=>{loopExchangeCode=target.value;renderLoopCards();});
    const choices=choiceStrip('作为材料的 R 塔卡');
    for (const card of rCards) {
      const cardId=String(card.id);
      const button=loopCardChoice(card.code,cardId,loopExchangeCards.includes(card.id)?cardId:'',()=>{
        if (loopExchangeCards.includes(card.id)) loopExchangeCards=loopExchangeCards.filter(id=>id!==card.id);
        else if (loopExchangeCards.length<5) loopExchangeCards=[...loopExchangeCards,card.id];
        renderLoopCards();
      },'exchange');
      choices.append(button);
    }
    paragraph(contents,`选择 5 张 R 卡 · ${loopExchangeCards.length} / 5`);
    contents.append(choices,target);
    const eligibility = game.canExchangeR(loopExchangeCode,loopExchangeCards);
    preview.hidden=false;
    detail.hidden=true;
    actions.append(commandButton('兑换指定 R',()=>{
      const result=game.exchangeR(loopExchangeCode,loopExchangeCards);
      if (result.ok) {loopExchangeCards=[];loopCardTab='bag';loopCardSelection=String(result.cardId);}
      resultMessage(result);
    },!eligibility.ok,'refresh'));
    if (loopExchangeCards.length===5&&!eligibility.ok) paragraph(actions,eligibility.message);
  }
  contents.append(preview);
  replacePanel(root,panel);
}

function loopCardChoice(code, key, selected, onSelect, group) {
  const definition = game.catalog.find(item=>item.code===code);
  const tier = loopTier[definition?.rarity] ?? 'R';
  const button=panelChoice(`${tier} ${definition?.name??code}${definition?' · '+towerIdentity(definition):''}`,key,selected,onSelect);
  button.dataset.group=group;
  button.dataset.rarity=String(definition?.rarity??'common');
  const fallback=document.createElement('span');
  fallback.textContent=tier;
  button.append(fallback);
  loopPortrait(button,code,definition?.assetCode);
  if (definition) {
    const attribute=document.createElement('small');
    attribute.className='tower-attribute';
    attribute.dataset.attribute=definition.attribute;
    attribute.textContent=attributeLabel[definition.attribute];
    button.append(attribute);
  }
  return button;
}

function addDetailTitle(parent,label) {
  const title=document.createElement('h4');
  title.textContent=label;
  parent.append(title);
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
  const towers = game.catalog;
  const tower = towers.find(item=>item.code===code);
  const card = document.createElement('article');
  card.className = 'loop-content-card';
  card.dataset.rarity = String(tower?.rarity ?? 'common');
  const title = document.createElement('h4');
  title.textContent = String(tower?.name ?? code);
  if (!compact) loopPortrait(card,code,tower?.assetCode);
  card.append(title);
  if (tower) paragraph(card,`${loopTier[tower.rarity]} · ${tower.population} 人口`);
  if (tower) paragraph(card,towerIdentity(tower));
  if (tower && !compact) {
    const role = ({melee:'近战',ranged:'远程',support:'辅助'})[tower.role];
    if (tower.damage > 0) paragraph(card,`${role} · 1 级伤害 ${tower.damage} · 射程 ${tower.range}`);
  }
  const credential = game.credentials?.[code];
  const qualifiesFor = Object.entries(game.credentials??{}).filter(([,item])=>item===code).map(([main])=>towers.find(tower=>tower.code===main)?.name??main);
  if (credential) paragraph(card,`指定副塔 · ${towers.find(tower=>tower.code===credential)?.name??credential} 三阶`);
  if (qualifiesFor.length) paragraph(card,`可给 ${qualifiesFor.join('、')} 提供突破资格`);
  if (compact && tower?.skills?.length > 1) {
    skillLine(card, code, 0, `${skillRequirement(code,0)} · ${tower.skills[0]}`);
    const extra = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = '后续技能';
    extra.append(label);
    for (const [index, skill] of tower.skills.slice(1).entries()) skillLine(extra, code, index + 1, `${skillRequirement(code,index+1)} · ${skill}`);
    card.append(extra);
    return card;
  }
  for (const [index,skill] of (tower?.skills??[]).entries()) skillLine(card, code, index, `${skillRequirement(code,index)} · ${skill}`);
  return card;
}

function renderLoopEncyclopedia() {
  const filter = /** @type {HTMLSelectElement} */ (element('loop-encyclopedia-filter'));
  const category=filter.value||'T';
  const items=category==='T'?game.catalog.map(tower=>loopCardDetails(tower.code)) :
    Object.keys(game.enemyCatalog).filter(code=>code.startsWith(category)).map(code=>{
      const enemy=game.enemyCatalog[code];
      const card=document.createElement('article');
      card.className='loop-content-card';
      const title=document.createElement('h4');
      title.textContent=String(enemy.name);
      loopPortrait(card,code,enemy.assetCode);
      card.append(title);
      paragraph(card,enemy.description);
      paragraph(card,`应对 · ${enemy.counter}`);
      return card;
    });
  element('loop-encyclopedia-count').textContent=`共 ${items.length} 项`;
  element('loop-encyclopedia-list').replaceChildren(...items);
}

const equipmentGrade = {white:'白装',green:'绿装',blue:'蓝装',orange:'橙装'};

function equipmentGlyph(item) {
  const glyph = document.createElement('span');
  glyph.className='equipment-glyph';
  glyph.dataset.icon='gear';
  glyph.setAttribute('aria-hidden','true');
  if (Number.isInteger(item?.icon)) setIconCell(glyph, ICON_ATLAS.equipmentStart + item.icon);
  return glyph;
}

function equipmentChoice(item, key, selected, onSelect, itemInstance = null) {
  const grade = equipmentGrade[item?.grade];
  const name = item?.name??'空装备槽';
  const button = panelChoice([name,grade].filter(Boolean).join(' · '),key,selected,onSelect);
  button.classList.add('equipment-choice');
  button.dataset.grade=item?.grade??'empty';
  if (item?.description) button.title += `\n${item.description}`;
  const label = document.createElement('span');
  label.className='equipment-legend';
  label.textContent=grade||'空';
  button.append(equipmentGlyph(item),label);
  if (item?.active && itemInstance) refreshEquipmentBadge(button,item,itemInstance);
  return button;
}

const equipmentCooldown = instance => Math.max(0,Math.ceil((instance.readyAt??0)-game.state.elapsed));

function refreshEquipmentBadge(button,item,instance) {
  const remaining=equipmentCooldown(instance);
  if (button.dataset.cooldown===String(remaining)) return;
  button.dataset.cooldown=String(remaining);
  setText(button.lastElementChild,`${instance.manual?'手':'自'}${remaining||''}`);
  const label=`${item.name} · ${equipmentGrade[item.grade]} · ${instance.manual?'手动':'自动'} · ${remaining?`冷却 ${remaining} 秒`:'就绪'}`;
  button.setAttribute('aria-label',label);
  button.title=`${label}\n${item.description}`;
}

function equipmentDetail(title,item,onBack,tower=undefined) {
  const detail=document.createElement('article');
  detail.className='equipment-detail loop-content-card';
  const copy=document.createElement('div');
  copy.className='equipment-detail-copy';
  addDetailTitle(copy,title);
  const back=commandButton('返回列表',onBack,false,'remove');
  back.classList.add('gear-list-back');
  back.title='返回装备列表';
  copy.append(back);
  if (item?.description && (!tower || item.grade==='blue' || item.grade==='orange')) {
    const description=document.createElement('p');
    description.textContent=item.description;
    const effects=Object.keys(affixNames).filter(key=>item[key]===true);
    if (tower && effects.length && effects.every(key=>!affixApplies(tower,key))) {
      description.className='equipment-affix';
      description.dataset.inactive='true';
    }
    copy.append(description);
  }
  if (tower) renderAffixes(copy,item,tower);
  const actions=document.createElement('div');
  actions.className='equipment-actions';
  detail.append(copy,actions);
  return {detail,copy,actions};
}

const affixNames={physical:'物理伤害',magic:'法术伤害',rate:'攻击频率',control:'控制时长',range:'射程或支援半径',boss:'首领直伤',
  sunder:'叠加破甲',breach:'破盾重击',shieldBreaker:'额外破盾',scatter:'分矢',embers:'余烬爆炸',cinders:'传递余烬',
  stall:'重复减速触发定身',relay:'协作攻速',nexus:'集火合击',prism:'法术蓄能',flywheel:'收割加速',scope:'远距增伤',
  bounty:'额外赏金',reveal:'揭露隐匿',disruptor:'削弱支援',refraction:'外圈折射',capacitor:'友塔附伤',sluice:'补漏减速'};

function renderAffixes(copy,item,tower) {
  for (const [key,label] of Object.entries(affixNames)) {
    const value=item[key];
    if (!value) continue;
    const active=affixApplies(tower,key);
    const line=document.createElement('small');
    line.className='equipment-affix';
    line.dataset.inactive=String(!active);
    line.textContent=label+(typeof value==='number'?' +' + Math.round(value*100) + '%':'')+(active?'':' · 当前塔不生效');
    copy.append(line);
  }
}

function recipeMaterials(copy,code,towerId,onPart) {
  const {recipe,parts}=game.craftParts(code,towerId);
  if (!recipe?.components) return;
  const chain=document.createElement('div');
  chain.className='equipment-recipe-line';
  const grouped=new Map();
  for (const [index,ingredient] of recipe.components.entries()) {
    const part=grouped.get(ingredient)??{required:0,owned:0};
    part.required++;
    if (parts[index]) part.owned++;
    grouped.set(ingredient,part);
  }
  for (const [ingredient,{required,owned}] of grouped) {
    const definition=game.equipment[ingredient];
    const locations=game.state.towers.filter(t=>t.equipment.some(item=>item.code===ingredient)).map(t=>game.catalog.find(entry=>entry.code===t.code)?.name??t.code);
    const part=onPart&&definition.components?commandButton('',()=>onPart(ingredient)):document.createElement('div');
    part.className='equipment-recipe-part';
    part.dataset.missing=String(owned<required);
    const label=document.createElement('small');
    label.textContent=definition.name+' '+owned+'/'+required+(owned<required?' · 缺 '+(required-owned)+' 件':'');
    part.append(equipmentGlyph(definition),label);
    if (locations.length) {
      const location=document.createElement('small');
      location.textContent='已装配 · '+locations.join('、');
      part.append(location);
    }
    chain.append(part);
  }
  copy.append(chain);
}

function equipmentRecipe(code,onBack,towerId=undefined,onPart=undefined) {
  const recipe=game.equipment[code];
  const {detail,copy,actions}=equipmentDetail(recipe.name,null,onBack);
  recipeMaterials(copy,code,towerId,onPart);
  paragraph(copy,recipe.description);
  paragraph(copy,'从零合成 '+equipmentCraftCost(code)+' 金');
  const status=game.canCraft(code,towerId);
  if (!status.ok) paragraph(copy,status.message);
  if (towerId===undefined) {
    const sale=game.canBuyEquipment(code);
    actions.append(commandButton('直购 · '+equipmentPurchasePrice(code)+' 金',()=>resultMessage(game.buyEquipment(code)),!sale.ok,'gold'));
  }
  actions.append(commandButton(`合成装备 · ${recipe.craftFee} 金`,()=>resultMessage(game.craftEquipment(code,towerId)),!status.ok));
  return detail;
}

function renderLoopEquipmentShop() {
  const root = element('loop-equipment-shop');
  if (root.hidden) return;
  const {inventory,gold,phase,paused} = game.state;
  const entries = Object.entries(game.equipment);
  const materials=game.state.towers.map(t=>[t.id,t.equipment.map(item=>item.code)]);
  const canPayCraftFee=gold>=(game.equipment[equipmentSelection]?.craftFee??0);
  const signature = JSON.stringify([equipmentTab,equipmentSelection,inventory,materials,entries.map(([code])=>gold>=equipmentPurchasePrice(code)),canPayCraftFee,phase,paused]);
  if (signature===loopEquipmentSignature) return;
  loopEquipmentSignature=signature;
  const panel=document.createElement('div');
  panel.className='equipment-panel';
  panel.setAttribute('data-panel',equipmentTab);
  panel.append(panelTabs([['shop','基础装备'],['recipes','成品装备'],['bag','背包']],equipmentTab,tab=>{
    equipmentTab=tab;equipmentSelection='';renderLoopEquipmentShop();
  },'装备操作'));
  const select = key => {
    equipmentSelection=equipmentSelection===key?'':key;
    renderLoopEquipmentShop();
    revealPanelContent(root.querySelector('.equipment-detail'));
  };
  const list = choiceStrip(equipmentTab==='bag'?'背包装备':equipmentTab==='recipes'?'成品装备':'基础装备');
  if (equipmentTab==='bag') {
    for (const entry of inventory) {
      if (game.equipment[entry.code]) list.append(equipmentChoice(game.equipment[entry.code],String(entry.id),equipmentSelection,select));
    }
    panel.append(list);
    if (!inventory.length) paragraph(panel,'背包为空。');
    const selected=inventory.find(entry=>String(entry.id)===equipmentSelection);
    if (selected && game.equipment[selected.code]) {
      const item=game.equipment[selected.code];
      const {detail,copy,actions}=equipmentDetail(item.name,item,()=>select(equipmentSelection));
      const refund=Math.floor((selected.invested??0)/4);
      recipeMaterials(copy,selected.code,undefined,code=>{equipmentTab='recipes';equipmentSelection=code;renderLoopEquipmentShop();});
      actions.append(commandButton('为场上塔装配',()=>{
        notice('点选塔并打开装备页，再从背包取用。');
        setDrawer();
      },false,'gear'));
      actions.append(commandButton(`出售 · 回收 ${refund} 金`,()=>resultMessage(game.sellEquipment(selected.id)),!editable()));
      panel.append(detail);
    }
  } else {
    for (const [code,item] of entries) {
      if ((equipmentTab==='recipes')!==!!item.components) continue;
      list.append(equipmentChoice(item,code,equipmentSelection,select));
    }
    panel.append(list);
    const item=game.equipment[equipmentSelection];
    if (item?.components) panel.append(equipmentRecipe(equipmentSelection,()=>select(equipmentSelection),undefined,select));
    else if (item) {
      const {detail,copy,actions}=equipmentDetail(item.name,item,()=>select(equipmentSelection));
      const status=game.canBuyEquipment(equipmentSelection);
      if (!status.ok) paragraph(copy,status.message);
      actions.append(commandButton(`购买 · ${item.cost} 金`,()=>resultMessage(game.buyEquipment(equipmentSelection)),!status.ok));
      panel.append(detail);
    }
  }
  replacePanel(root,panel,true);
}

function selectTowerEquipment(key) {
  towerSkillSelection = '';
  towerEquipmentSelection = towerEquipmentSelection === key ? '' : key;
  updateUI();
  const root = element('loop-controls');
  const detail = root.querySelector?.('.equipment-detail') ?? root.querySelector?.('[aria-label="可装配的背包装备"]');
  revealPanelContent(detail);
}

function renderTowerEquipment(root,tower,definition) {
  const occupied=tower.equipment??[];
  const slotCount=definition?.rarity==='common'?3:6;
  const panel=document.createElement('div');
  panel.className='equipment-panel';
  const select=selectTowerEquipment;
  const slots=choiceStrip(`塔装备槽 · ${occupied.length} / ${slotCount}`);
  const refresh=[];
  slots.classList.add('equipment-slots');
  for (let i=0;i<slotCount;i++) {
    const item=occupied[i];
    const key=item?`slot:${item.id}`:`empty:${i}`;
    const slot=equipmentChoice(game.equipment[item?.code],key,towerEquipmentSelection,select,item);
    if (game.equipment[item?.code]?.active) refresh.push(()=>refreshEquipmentBadge(slot,game.equipment[item.code],item));
    slot.dataset.slot=String(i+1);
    slots.append(slot);
  }
  panel.append(slots);
  const inventory=game.state.inventory.filter(item=>game.equipment[item.code]);
  const [group,key]=towerEquipmentSelection.split(':');
  const bagOpen = ['bag','empty','inventory'].includes(group);
  const bagButton = element('tower-bag-button');
  bagButton.textContent = `背包 ${inventory.length}`;
  bagButton.setAttribute('aria-expanded',String(bagOpen));
  if (bagOpen && inventory.length) {
    const bag=choiceStrip('可装配的背包装备');
    for (const item of inventory) {
      bag.append(equipmentChoice(game.equipment[item.code],`inventory:${item.id}`,towerEquipmentSelection,select));
    }
    panel.append(bag);
  }
  const selected=(group==='slot'?occupied:inventory).find(item=>String(item.id)===key);
  if ((group==='slot'||group==='inventory') && selected) {
    const item=game.equipment[selected.code];
    const {detail,copy,actions}=equipmentDetail(item.name,item,()=>select(towerEquipmentSelection),tower);
    recipeMaterials(copy,selected.code,tower.id,undefined);
    if (group==='inventory') {
      const status=game.canEquip(tower.id,selected.id);
      if (!status.ok) paragraph(copy,status.message);
      actions.append(commandButton(`装配${item.name}`,()=>resultMessage(game.equip(tower.id,selected.id)),!status.ok));
    } else {
      const detachStatus=document.createElement('p');
      copy.append(detachStatus);
      const remove=commandButton(`卸下${item.name}`,()=>resultMessage(game.unequip(tower.id,selected.id)));
      remove.dataset.compactLabel='卸下';
      actions.append(remove);
      refresh.push(remaining=>{
        setText(detachStatus,remaining>0?`脱战 ${Math.ceil(remaining)} 秒后可卸下`:'已脱战');
        const disabled=!editable()||remaining>0;
        if (remove.disabled!==disabled) remove.disabled=disabled;
      });
      if (item.active) {
        actions.dataset.active='true';
        const castStatus=document.createElement('p');
        copy.append(castStatus);
        const mode=commandButton(selected.manual?'切换为自动':'切换为手动',()=>resultMessage(game.toggleEquipmentMode(tower.id,selected.id)),!editable(),'controls');
        mode.dataset.compactLabel=selected.manual?'自动':'手动';
        const cast=commandButton('施放装备技',()=>armEquipment(tower.id,selected,item),false,'slash');
        cast.dataset.compactLabel='施放';
        actions.append(mode,cast);
        refresh.push(()=>{
          const status=game.canCastEquipment(tower.id,selected.id);
          const cooldown=equipmentCooldown(selected);
          setText(castStatus,cooldown?`冷却 ${cooldown} 秒`:selected.manual&&!status.ok?status.message:'技能就绪');
          const disabled=!selected.manual||!status.ok;
          if (cast.disabled!==disabled) cast.disabled=disabled;
        });
      }
    }
    panel.append(detail);
  }
  if (bagOpen && !inventory.length) paragraph(panel,'背包暂无可装配的装备。');
  const recipes=Object.keys(game.equipment).filter(code=>{
    const ingredients=game.equipment[code].components;
    return ingredients?.some(part=>occupied.some(item=>item.code===part)) && game.craftParts(code,tower.id).parts.every(Boolean);
  });
  if (recipes.length) {
    const options=choiceStrip('可用同塔组件制作的配方');
    for (const code of recipes) options.append(equipmentChoice(game.equipment[code],`recipe:${code}`,towerEquipmentSelection,select));
    paragraph(panel,'原地合成');
    panel.lastElementChild?.classList.add('equipment-shelf-label');
    panel.append(options);
    if (group==='recipe'&&recipes.includes(key)) panel.append(equipmentRecipe(key,()=>select(towerEquipmentSelection),tower.id));
  }
  replacePanel(root,panel);
  return remaining=>refresh.forEach(update=>update(remaining));
}

function renderBreakthrough(panel,tower) {
  panel.replaceChildren();
  if (tower.deputyStage!==undefined) {
    panel.hidden=false;
    const status=game.canUpgradeDeputy(tower.id);
    if (tower.deputyStage===3) { paragraph(panel,'副塔已升满 · 三阶');return; }
    const label='升至 '+(tower.deputyStage+1)+' 阶'+(status.cost===undefined?'':' · '+status.cost+' 金');
    const button=commandButton(label,()=>resultMessage(game.upgradeDeputy(tower.id)),!status.ok,'upgrade');
    if (!status.ok) button.title=status.message;
    panel.append(button);
    return;
  }
  const code=game.credentials?.[tower.code];
  panel.hidden = !code || !!tower.awakened;
  if (panel.hidden) return;
  const name=game.catalog.find(item=>item.code===code)?.name??code;
  const status=game.canBreakthrough(tower.id);
  const label = tower.level < 20 ? '突破 · 20 级' : '突破';
  const button = commandButton(label,()=>resultMessage(game.breakthrough(tower.id)),!status.ok,'upgrade');
  button.title = `指定副塔 · 三阶${name}${status.ok ? '' : `\n${status.message}`}`;
  panel.append(button);
}

function armEquipment(towerId,item,definition) {
  const status=game.canCastEquipment(towerId,item.id);
  if (!status.ok) {notice(status.message);return;}
  if (!definition.active.targeted) {
    resultMessage(game.castEquipment(towerId,item.id));
    return;
  }
  cancelBuild();
  armedEquipment={towerId,itemId:item.id,name:definition.name};
  pointerPosition=null;
  setDrawer();
  setBuildDock(false);
  updateUI();
  canvas.focus({preventScroll:true});
}

function updateLoopPanels() {
  const root = element('loop-controls');
  const forecast = element('loop-forecast');
  const enemyInfo = element('loop-enemy-info');
  const { enemies,towers,elapsed,inventory,phase,paused } = game.state;
  const waves = game.forecasts().sort((a,b)=>Number(b.boss)-Number(a.boss));
  const lines = waves.map(next=>{
    const types = (next.types??[]).map(code=>game.enemyCatalog?.[code]?.name??code);
    const boss = game.enemyCatalog?.[next.bossCode];
    const summary = `第${next.wave}波 · ${next.count}只${next.elites?` · 精英 ${next.elites}`:''}${boss?` · 首领 ${boss.name}`:''}${next.summonLimit?` · 最多额外召唤 ${next.summonLimit}只`:''}`;
    return [summary,boss?.description,boss?.counter&&`应对 · ${boss.counter}`,types.join('、')].filter(Boolean).join('\n');
  });
  const forecastText = lines.join('\n') || (phase==='playing'?'最终波已投入':'对局结束');
  if (forecast.textContent!==forecastText) forecast.textContent=forecastText;
  const enemy = enemies.find(item=>item.id===selectedEnemyId);
  enemyInfo.hidden = !enemy;
  if (enemy) {
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
  element('loop-skill-status').hidden = !tower;
  if (!tower) { root.hidden=true;loopPanelSignature='';refreshTowerEquipment=null;return; }
  const definition = game.catalog.find(item=>item.code===tower.code);
  const remaining = Math.max(0,(tower.combatUntil??0)-elapsed);
  const occupied = tower.equipment??[];
  const status = element('loop-skill-status');
  const levelCap = game.xpThresholds?.[tower.level] ?? 0;
  const qualification = tower.awakened ? '已突破 · ' : '';
  const progress = tower.deputyStage!==undefined ? '副塔 '+tower.deputyStage+'/3 阶'
    : tower.level>=game.levelCap(tower) ? (tower.level===20?'等待突破':'经验已满') : '经验 '+(tower.xp??0)+' / '+levelCap;
  setText(status,[towerIdentity(definition),qualification+progress,remaining>0?'脱战还需 '+Math.ceil(remaining)+' 秒':'已脱战'].join(' · '));
  const sell = /** @type {HTMLButtonElement} */ (element('sell-button'));
  const sellDisabled=!editable() || occupied.length>0&&remaining>0;
  if (sell.disabled!==sellDisabled) sell.disabled=sellDisabled;
  const sellRestriction=occupied.length&&remaining>0?'须脱战后出售带装备的塔':'';
  if (sell.title!==sellRestriction) sell.title=sellRestriction;
  setText(sell,sellRestriction || `出售 · 回收 ${tower.refund??0} 金币`);
  root.hidden=false;
  const slots=occupied.map(item=>[item.id,item.code,item.manual]);
  const materials=towers.map(t=>[t.id,t.code,t.deputyStage,t.equipment.map(item=>item.code)]);
  const recipe=towerEquipmentSelection.startsWith('recipe:')?game.equipment[towerEquipmentSelection.slice(7)]:null;
  const canPayCraftFee=game.state.gold>=(recipe?.craftFee??0);
  const signature = JSON.stringify([tower.id,tower.level,tower.priority,tower.awakened,tower.deputyStage,slots,inventory.map(item=>item.id),phase,paused,
    towerSkillSelection,towerEquipmentSelection,game.canUpgradeDeputy(tower.id).ok,canPayCraftFee,materials]);
  if(signature===loopPanelSignature){refreshTowerEquipment?.(remaining);return;}
  loopPanelSignature=signature;
  const skills = element('loop-skills');
  const skillDetail = element('loop-skill-detail');
  const skillChoices = document.createElement('div');
  skillChoices.className = 'tower-skill-row';
  skillDetail.hidden = true;
  for (const [index, skill] of (definition?.skills ?? []).entries()) {
    const key = String(index);
    const level = skillLevel(index);
    const requirement = skillRequirement(tower.code,index);
    const unlocked = tower.level >= level;
    const label = requirement+' · '+(index===3?'终极技能 · ':'')+(unlocked?'已解锁':'待解锁');
    const button = panelChoice(label, key, towerSkillSelection, () => {
      towerSkillSelection = towerSkillSelection === key ? '' : key;
      towerEquipmentSelection = '';
        updateUI();
      if (towerSkillSelection) revealPanelContent(skillDetail);
    });
    button.classList.add('tower-skill-choice');
    button.dataset.locked = String(!unlocked);
    button.title = `${label}\n${skill}`;
    button.setAttribute('aria-controls','loop-skill-detail');
    const badge = document.createElement('small');
    badge.textContent = requirement;
    if (index===3) button.dataset.ultimate='true';
    button.append(skillGlyph(tower.code,index),badge);
    skillChoices.append(button);
    if (towerSkillSelection === key) {
      skillDetail.hidden = false;
      skillDetail.textContent = `${label} · ${skill}`;
    }
  }
  replacePanel(skills,skillChoices);
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
  renderBreakthrough(element('loop-breakthrough'),tower);
  refreshTowerEquipment=renderTowerEquipment(root,tower,definition);
  refreshTowerEquipment(remaining);
}

const loopHudCommands = {
  'loop-hud-deploy': '#build-dock .loop-card-deploy',
  'loop-hud-bag': '#tower-bag-button',
  'loop-hud-cast': '#loop-controls button[data-compact-label="施放"]',
  'loop-hud-sell': '#sell-button'
};

function updateLoopHud(towers) {
  element('loop-hud-overview').hidden = false;
  element('loop-hud-actions').hidden = !battle3D;
  for (const [id, value] of [
    ['loop-hud-next-wave', element('next-wave-value').textContent],
    ['loop-hud-population', `${game.state.populationUsed} / ${game.state.capacity}`],
    ['loop-hud-card-count', `${game.state.cards.length} 张`]
  ]) {
    const field = element(id);
    if (field.textContent !== value) field.textContent = value;
  }
  if (!battle3D) return;
  const selectingTower = !element('selection-panel').hidden && towers.some(tower=>tower.id===selectedTowerId);
  const selectingCard = !element('build-dock').hidden;
  for (const [id, selector] of Object.entries(loopHudCommands)) {
    const source = /** @type {HTMLButtonElement} */ (document.querySelector(selector));
    const button = /** @type {HTMLButtonElement} */ (element(id));
    button.hidden = !source || !(id === 'loop-hud-deploy' ? selectingCard : selectingTower);
    if (button.hidden) continue;
    button.disabled = source.disabled;
    button.title = source.title || source.textContent;
    if (id === 'loop-hud-bag') button.setAttribute('aria-expanded', source.getAttribute('aria-expanded'));
  }
  element('loop-hud-cancel').hidden = !hasMapAction() || !element('touch-actions').hidden;
}

function updateLoopConsole() {
  const towersButton = element('loop-towers-button');
  const { towers } = game.state;
  towersButton.hidden = !!battle3D;
  element('loop-ready-panel').hidden = !!battle3D && !towers.length;
  updateLoopHud(towers);
  towersButton.setAttribute('aria-expanded', String(!battle3D && element('command-drawer').hidden && element('build-dock').hidden && !hasMapAction()));
  const signature = towers.map(tower => `${tower.id}:${tower.code}:${tower.level}`).join(',');
  if (signature === readyTowerSignature) return;
  readyTowerSignature = signature;
  element('loop-ready-hint').hidden = !!towers.length;
  element('loop-ready-towers').replaceChildren(...towers.map(tower => {
    const name = game.catalog.find(def => def.code === tower.code)?.name ?? tower.code;
    const button = document.createElement('button');
    button.className = 'ready-tower';
    button.type = 'button';
    button.title = `${name} · ${towerLevelLabel(tower)}`;
    loopPortrait(button, tower.code, tower.assetCode);
    const label = document.createElement('span');
    label.textContent = button.title;
    button.append(label);
    button.addEventListener('click', () => {
      if (hasMapAction()) clearMapAction();
      selectedEnemyId = null;
      selectedTowerId = tower.id;
      setDrawer('tower', button);
      updateUI();
    });
    return button;
  }));
}

function updateLoopEvents(activeCount) {
  const root=element('loop-challenges'),status=element('loop-event-status');
  const live=element('loop-live-event');
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
  const unavailable = !!challenge || phase!=='playing' || game.state.paused || activeCount>=45 || wave>=(game.state.waveCount??50) || endless;
  const completed = game.state.usedChallenges??game.state.completedChallenges??[];
  const signature=JSON.stringify([Math.min(wave,game.state.waveCount??50),endless,unavailable,completed,game.challenges?.length]);
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
function updateUI() {
  const state = game.state;
  element('gold-value').textContent = String(Math.floor(state.gold));
  const waveCap = state.waveCount;
  const waitingForCard = state.starter !== 'deployed';
  const counting = Number.isFinite(state.nextWaveIn) && (state.endless || state.wave < waveCap);
  element('wave-label').textContent = waitingForCard ? (state.starter==='held'?'部署起手 SR':state.draft?.starter?'选择起手 SR':'开启起手 SR') : counting ? `${state.wave?'下波':'备战'} ${Math.max(0,Math.ceil(state.nextWaveIn))}s` : '波次';
  element('wave-value').textContent = state.endless ? `∞ ${state.wave}` : `${state.wave} / ${waveCap}`;
  const rail = element('campaign-rail');
  rail.hidden = state.endless;
  rail.style.setProperty('--campaign-progress', `${state.wave / waveCap * 100}%`);
  const activeCount = state.enemies.filter(enemy => enemy.special !== 'gold').length;
  element('enemy-value').textContent = String(activeCount);
  element('enemy-limit').textContent = String(state.limit);
  element('kill-value').textContent = String(state.kills);
  element('next-wave-value').textContent = waitingForCard ? '部署起手 SR 后倒计时'
    : state.wave >= waveCap && !state.endless
      ? state.goldRush || state.goldRushQueued ? '金币奖励结算中' : '清理剩余敌人'
      : `${Math.max(0, Math.ceil(state.nextWaveIn))} 秒`;
  const pressure = activeCount / state.limit;
  const fill = element('pressure-fill');
  fill.style.width = `${Math.min(1, pressure) * 100}%`;
  fill.classList.toggle('warning', pressure >= .55 && pressure < .8);
  fill.classList.toggle('danger', pressure >= .8);
  const pauseButton = element('pause-button');
  setText(pauseButton, state.paused ? '继续' : '暂停');
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  setIconCell(pauseButton, ICON_ATLAS.hudStart + (state.paused ? ICON_ATLAS.hudButtons.length : ICON_ATLAS.hudButtons.indexOf('pause-button')));
  element('speed-button').textContent = `${state.speed}× 速度`;
  element('mute-button').textContent = audio.muted ? '声音关' : '声音开';
  element('mute-button').setAttribute('aria-pressed', String(audio.muted));
  element('tower-capacity').textContent = `人口 ${state.populationUsed} / ${state.capacity}`;
  renderLoopCards();
  renderLoopEquipmentShop();
  updateLoopPanels();
  updateLoopEvents(activeCount);
  refreshPlacement();
  updateSelection();
  updateLoopConsole();
  if (lastPhase !== state.phase) {
    lastPhase = state.phase;
    if (['victory', 'defeat'].includes(state.phase)) showEnd();
  }
}

function showEnd() {
  const state = game.state;
  const success = state.phase === 'victory';
  element('end-title').textContent = success ? '环路守卫成功' : '防线失守';
  element('end-description').textContent = success
    ? `常规 ${state.waveCount} 波已清场。保留防线，迎接无尽挑战。`
    : `场上怪物达到 ${state.limit} 只。调整火力覆盖与升级节奏，再守一局。`;
  element('end-stats').innerHTML = [
    ['抵御波次', state.wave], ['击杀敌人', state.kills], ['守卫时间', `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`],
  ].map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  element('endless-button').hidden = !success;
  showView('end');
  element(success ? 'endless-button' : 'restart-button').focus();
}

function clearTransient() {
  selectedEnemyId=null;loopPanelSignature='';loopCardsSignature='';loopCardSelection='';loopEquipmentSignature='';loopChallengeSignature='';
  loopCardTab='shop';loopExchangeCode='';loopExchangeCards=[];equipmentTab='shop';equipmentSelection='';towerEquipmentSelection='';
  selectedTowerId = null;
  clearMapAction();
  pointerPosition = null;
  keyboardMode = false;
  keyboardPointer.x = 190;
  keyboardPointer.y = 140;
  selectedSignature = '';
  element('tower-panel').hidden = true;
  element('notice').hidden = true;
  noticeUntil = 0;
  setBuildDock(false);
  setDrawer();
  touchControls?.reset();
  renderer.reset();
  battle3D?.reset();
}

function updateMenu() {
  element('start-button').textContent = game.state.phase === 'menu' ? '开始布防 →'
    : game.state.phase === 'playing' ? '继续布防 →' : '查看战报 →';
}

function returnToMenu() {
  if (view === 'game' && !window.confirm('返回主菜单？本局将暂停并保留，可点“继续游戏”返回。')) return;
  if (game.state.phase === 'playing' && !game.state.paused) game.togglePause();
  clearTransient();
  showView('menu');
  element('start-button').focus();
}

function enterGame(restart = false) {
  void audio.unlock();
  if (!restart && ['victory', 'defeat'].includes(game.state.phase)) {
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
  if (game.state.starter !== 'deployed') {
    loopCardTab=game.state.starter==='held'?'bag':'shop';
    if(loopCardTab==='bag')loopCardSelection=String(game.state.cards.find(card=>card.starter)?.id??'');
    setBuildDock(true);
  } else if (freshSession) setBuildDock(false);
  showView('game');
  lastPhase = game.state.phase;
  updateUI();
  canvas.focus({ preventScroll: true });
}

function openLoopTab(tab, trigger) {
  if (hasMapAction()) clearMapAction();
  selectedTowerId = null;
  selectedEnemyId = null;
  if (tab === 'cards') {
    setBuildDock(true);
  } else if (tab === 'towers') {
    setBuildDock(false);
    setDrawer();
  } else if (element('command-drawer').dataset.view !== tab) {
    setDrawer(tab, trigger);
  }
  updateUI();
}

function renderHelpTowers() {
  const rarity = /** @type {HTMLSelectElement} */ (element('help-tower-rarity')).value || 'all';
  const towers = game.catalog.filter(tower=>rarity==='all'||tower.rarity===rarity);
  element('help-tower-count').textContent = `共 ${towers.length} 座塔`;
  element('help-tower-list').replaceChildren(...towers.map(tower=>loopCardDetails(tower.code,false)));
}

function renderHelpEquipment() {
  const grade = /** @type {HTMLSelectElement} */ (element('help-equipment-grade')).value || 'all';
  const definitions = game.equipment;
  const entries = Object.entries(definitions).filter(([,item])=>grade==='all'||item.grade===grade);
  element('help-equipment-count').textContent = `共 ${entries.length} 项`;
  element('help-equipment-list').replaceChildren(...entries.map(([code,item])=>{
    const article = document.createElement('article');
    article.className = 'loop-content-card help-item';
    article.dataset.grade = item.grade;
    const heading = document.createElement('div');
    heading.className = 'help-item-heading';
    heading.append(equipmentGlyph(item));
    addDetailTitle(heading,item.name);
    article.append(heading);
    const price='直购 '+equipmentPurchasePrice(code)+' 金';
    paragraph(article,[equipmentGrade[item.grade],price].join(' · '));
    paragraph(article,item.description);
    if (item.components) paragraph(article,`合成 · ${item.craftFee} 金 · ${item.components.map(part=>definitions[part].name).join(' ＋ ')}`);
    if (item.active) paragraph(article,`主动技能 · 冷却 ${item.active.cooldown} 秒${item.active.targeted?' · 需选目标':''}`);
    return article;
  }));
}

const helpPages = ['rules','towers','equipment'];

function selectHelpPage(page) {
  for (const name of helpPages) {
    element(`help-${name}`).hidden = name !== page;
    element(`help-${name}-tab`).setAttribute('aria-pressed',String(name===page));
  }
  if (page==='towers' && !element('help-tower-list').children.length) renderHelpTowers();
  if (page==='equipment' && !element('help-equipment-list').children.length) renderHelpEquipment();
  element('help-content').scrollTop = 0;
}

function openHelp() {
  if (help.open) return;
  helpPaused = view === 'game' && game.state.phase === 'playing' && !game.state.paused;
  if (helpPaused) game.togglePause();
  selectHelpPage('rules');
  help.showModal();
}

function bindControls() {
  ICON_ATLAS.hudButtons.forEach((id, index) => setIconCell(element(id), ICON_ATLAS.hudStart + index));
  element('tower-bag-button').addEventListener('click', () => {
    const open = element('tower-bag-button').getAttribute('aria-expanded') === 'true';
    selectTowerEquipment(open ? towerEquipmentSelection : 'bag');
  });
  for (const [id, selector] of Object.entries(loopHudCommands)) {
    element(id).addEventListener('click',()=>{
      const source = /** @type {HTMLButtonElement} */ (document.querySelector(selector));
      source?.click();
    });
  }
  element('loop-hud-cancel').addEventListener('click',cancelBuild);
  element('equipment-button').addEventListener('click', event => openLoopTab('equipment', event.currentTarget));
  element('more-button').addEventListener('click', event => openLoopTab('settings', event.currentTarget));
  element('close-drawer-button').addEventListener('click', () => {
    if (!element('loop-encyclopedia').hidden) {
      setDrawer('mission', element('loop-intel-button'));
      element('loop-encyclopedia-button').focus({preventScroll:true});
    } else {
      if (element('command-drawer').dataset.view === 'tower') { selectedTowerId = null; selectedEnemyId = null; }
      setDrawer();
      updateUI();
    }
  });
  element('loop-encyclopedia-button').addEventListener('click', () => {
    setDrawer('encyclopedia', element('loop-intel-button'));
    renderLoopEncyclopedia();
  });
  element('loop-encyclopedia-filter').addEventListener('change',renderLoopEncyclopedia);
  element('focus-button').addEventListener('click', event => openLoopTab('cards', event.currentTarget));
  element('start-button').addEventListener('click', () => enterGame());
  element('restart-button').addEventListener('click', () => enterGame(true));
  element('endless-button').addEventListener('click', () => {
    void audio.unlock();
    const result = game.continueEndless();
    if (!result.ok) { resultMessage(result); return; }
    touchControls?.reset();
    renderer.reset();
    battle3D?.reset();
    lastPhase = 'playing';
    showView('game');
    resultMessage(result);
    canvas.focus({ preventScroll: true });
  });
  element('pause-button').addEventListener('click', () => { touchControls?.clear(); game.togglePause(); updateUI(); });
  element('speed-button').addEventListener('click', () => { game.setSpeed(game.state.speed % 3 + 1); updateUI(); });
  element('mute-button').addEventListener('click', () => { void audio.unlock(); audio.setMuted(!audio.muted); updateUI(); });
  element('menu-button').addEventListener('click', returnToMenu);
  element('home-button').addEventListener('click', returnToMenu);
  element('return-menu-button').addEventListener('click', returnToMenu);
  element('loop-intel-button').addEventListener('click', () => {
    openLoopTab('mission', element('loop-intel-button'));
  });
  element('loop-towers-button').addEventListener('click', () => {
    openLoopTab('towers', element('loop-towers-button'));
  });
  element('sell-button').addEventListener('click', () => resultMessage(game.sell(selectedTowerId)));
  element('help-button').addEventListener('click',openHelp);
  element('game-help-button').addEventListener('click',openHelp);
  for (const page of helpPages) element(`help-${page}-tab`).addEventListener('click',()=>selectHelpPage(page));
  element('help-tower-rarity').addEventListener('change',renderHelpTowers);
  element('help-equipment-grade').addEventListener('change',renderHelpEquipment);
  element('close-help').addEventListener('click', () => help.close());
  help.addEventListener('close', () => {
    if (helpPaused && view === 'game' && game.state.paused) game.togglePause();
    helpPaused = false;
    updateUI();
  });
  function pointer(event,select = false) {
    if (battle3D) return battle3D.point(event,game.state,select);
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * WORLD.width,
      y: (event.clientY - bounds.top) / bounds.height * WORLD.height,
    };
  }
  canvas.addEventListener('click', event => {
    keyboardMode = false;
    void audio.unlock();
    const point = pointer(event,!hasMapAction());
    if (!point) { clearCameraPoint(); return; }
    Object.assign(keyboardPointer, point);
    activatePoint(point);
  });
  canvas.addEventListener('pointermove', event => {
    keyboardMode = false;
    pointerPosition = pointer(event);
    if (pointerPosition) Object.assign(keyboardPointer, pointerPosition);
    refreshPlacement();
  });
  canvas.addEventListener('pointerleave', event => {
    if(event.pointerType==='touch')return;
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
      battle3D?.camera.reveal(keyboardPointer.x,keyboardPointer.y);
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
      event.preventDefault(); touchControls?.clear(); game.togglePause(); updateUI();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (hasMapAction()) { cancelBuild(); canvas.focus({ preventScroll: true }); return; }
      const hadDrawer = !element('command-drawer').hidden;
      setDrawer();
      setBuildDock(false);
      selectedTowerId = null; selectedEnemyId = null; cancelBuild();
      if (!hadDrawer) canvas.focus({ preventScroll: true });
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) touchControls?.clear();
    if (document.hidden && game.state.phase === 'playing' && !game.state.paused) {
      game.togglePause(); notice('离开页面，已自动暂停。'); updateUI();
    }
  });
}

async function boot() {
  try {
    const iconAtlas = new Image();
    iconAtlas.onload = () => {
      const root = document.documentElement;
      root.style.setProperty('--icon-atlas', `url("${iconAtlas.src}")`);
      root.style.setProperty('--icon-atlas-size', `${ICON_ATLAS.columns * 100}%`);
      root.classList.add('icon-art-loaded');
    };
    iconAtlas.src = `./${ICON_ATLAS.path}`;
    const artwork = await loadArtwork(undefined, undefined, { progressive: true });
    renderer = createRenderer(canvas, artwork);
    artworkCache = artwork;
    bindControls();
    fitBattlefield();
    touchControls=createTouchControls(canvas,{
      canInteract:()=>view==='game' && editable(),
      hasAction:hasMapAction,
      use3D:()=>!!battle3D,
      onCancel:cancelBuild,
      onPreview:point=>{pointerPosition=point;refreshPlacement();return placement||{ok:false,message:'先选择操作'};},
      onActivate:point=>{
        void audio.unlock();
        activatePoint(point);
      }
    });
    element('loading-screen').hidden = true;
    showView('menu');
    updateUI();
    if (new URLSearchParams(globalThis.location?.search).get('view') === '3d') {
      void enableLocal3D();
    }
    let previous = performance.now();
    let uiIn = 0;
    const frame = now => {
      const dt = Math.min(.1, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (view === 'game') {
        game.tick(dt);
        syncEvents();
        const cursor = keyboardMode ? keyboardPointer : null;
        if (battle3D) {
          try { battle3D.draw(game.state,{selectedTowerId,selectedEnemyId,placement,cursor,buildArea},dt); }
          catch (error) { fallBackTo2D(error); }
        }
        if (!battle3D) renderer.draw(game.state, selectedTowerId, placement, dt, cursor, buildArea);
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
