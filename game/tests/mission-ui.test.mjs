import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import fs from 'node:fs';

test('actual controls preserve four distinct sessions, drive and repair, relocate, build and sell walls, and reopen reports', async () => {
  const base = fileURLToPath(new URL('../', import.meta.url));
  const imports = Object.assign({}, ...await Promise.all(['engine', 'catalog', 'research', 'geometry', 'defense-geometry', 'modes'].map(name => import(pathToFileURL(base + name + '.js')))));
  const html = fs.readFileSync(base + 'index.html', 'utf8');
  const nodes = new Map();
  class Element {
    constructor(id = '') { this.id = id; this.hidden = true; this.attrs = {}; this.events = {}; this.style = {}; this.dataset = {}; this.classList = { toggle() {} }; this.isConnected = true; this.tagName = 'BUTTON'; this.textContent = ''; }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
    addEventListener(k, fn) { this.events[k] = fn; } querySelectorAll() { return []; } contains() { return false; } closest() { return null; }
    focus() { document.activeElement = this; } replaceChildren() {} click() { if (!this.disabled) this.events.click?.({ target: this }); }
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, new Element(id));
  const documentEvents = {};
  const document = { getElementById: id => nodes.get(id), body: { classList: { toggle() {} } }, activeElement: null, addEventListener: (type, fn) => { documentEvents[type] = fn; }, createElement: () => new Element() };
  const context = vm.createContext({ ...imports, document, window: { confirm: () => true }, console, performance, createAudio: () => ({ unlock: async () => {}, play() {}, muted: false }), loadArtwork() {}, createRenderer() {}, ResizeObserver: class {}, requestAnimationFrame() {} });
  let source = fs.readFileSync(base + 'main.js', 'utf8').replace(/^import .*;\n/gm, '').replace('void boot();', '');
  source += '\nrenderer={reset(){},event(){},hitTest(x,y,items){return items.find(item=>Math.hypot(item.x-x,item.y-y)<40)?.id??null}}; globalThis.test={sessions,get game(){return game},get view(){return view},get placement(){return placement},get relocatingId(){return relocatingId},bindControls,updateUI,showEnd,returnToMenu,activatePoint,armBuild};';
  vm.runInContext(source, context);
  const ui = context.test; ui.bindControls();
  const node = id => nodes.get(id), click = id => node(id).click();
  const go = mode => { ui.returnToMenu(); click('mode-' + mode + '-button'); click('start-button'); };
  const escape = () => documentEvents.keydown({ key: 'Escape', preventDefault() {} });
  click('start-button'); ui.game.state.gold = 417;
  go('defense'); ui.game.state.gold = 418;
  go('escort');
  assert.equal(ui.game.state.gold, 400);
  assert.equal(ui.game.state.convoy.moving, false);
  click('mission-button');
  assert.equal(node('mission-panel').hidden, false);
  assert.equal(node('escort-mission').hidden, false);
  assert.equal(node('research-panel').hidden, true);
  assert.equal(node('convoy-repair-button').disabled, true);
  ui.game.state.coreHealth = 80; ui.updateUI(); click('convoy-repair-button');
  assert.equal(ui.game.state.coreHealth, 86);
  assert.equal(ui.game.state.gold, 340);
  click('convoy-toggle-button'); assert.equal(ui.game.state.convoy.moving, true);
  assert.equal(node('convoy-repair-button').disabled, true);
  ui.game.tick(1); ui.updateUI(); assert.ok(node('convoy-progress').value > 0);
  click('pause-button'); const distance = ui.game.state.convoy.progress;
  ui.game.tick(3); assert.equal(ui.game.state.convoy.progress, distance);
  ui.updateUI(); assert.match(node('convoy-status').textContent, /冻结/);
  click('pause-button'); click('convoy-toggle-button');
  assert.equal(ui.game.state.convoy.moving, false);
  // Real build validation finds continuous legal coordinates; no tower slots are used.
  const legal = code => {
    for (let y = 140; y <= 660; y += 20) for (let x = 100; x <= 1180; x += 20) if (ui.game.canBuild(x, y, code).ok) return { x, y };
    assert.fail('expected legal position for ' + code);
  };
  const code = imports.TOWERS[0].code;
  ui.game.state.gold = 1000;
  const point = legal(code); ui.armBuild(code); ui.activatePoint(point); escape(); ui.activatePoint(point);
  ui.game.state.tech.reinforcement = 1; ui.updateUI(); click('upgrade-button');
  const tower = ui.game.state.towers[0], id = tower.id, level = tower.level;
  assert.equal(level, 2);
  click('relocate-button'); assert.equal(ui.relocatingId, id);
  ui.activatePoint({ x: 80, y: 660 });
  assert.equal(ui.relocatingId, id); assert.equal(ui.placement.ok, false);
  let next;
  for (let y = 140; y <= 660 && !next; y += 20) for (let x = 100; x <= 1180; x += 20) if (Math.hypot(x - tower.x, y - tower.y) > 100 && ui.game.canRelocate(id, x, y).ok) { next = { x, y }; break; }
  assert.ok(next);
  const gold = ui.game.state.gold; ui.activatePoint(next);
  assert.equal(ui.relocatingId, null); assert.equal(tower.id, id); assert.equal(tower.level, level);
  assert.equal(ui.game.state.gold, gold - 25); assert.equal(tower.readyAt, ui.game.state.elapsed + 3);
  assert.equal(node('relocate-button').disabled, true);
  ui.game.tick(3.1); ui.updateUI(); ui.activatePoint(next); click('relocate-button'); escape(); assert.equal(ui.relocatingId, null);
  ui.game.state.gold = 419;
  go('maze'); ui.game.state.gold = 420;
  click('mission-button'); assert.equal(node('maze-mission').hidden, false);
  click('maze-wall-button'); assert.match(node('build-status').textContent, /路障/);
  ui.activatePoint({ x: 50, y: 390 }); assert.equal(ui.game.state.walls.length, 0); assert.equal(ui.game.state.gold, 420);
  const wallPoint = legal('WALL'); ui.activatePoint(wallPoint);
  assert.equal(ui.game.state.walls.length, 1); assert.equal(ui.game.state.gold, 400);
  const wall = ui.game.state.walls[0]; assert.ok(wall.id < 0);
  escape(); ui.activatePoint(wallPoint);
  assert.equal(node('upgrade-button').hidden, true); assert.equal(node('relocate-button').hidden, true);
  assert.match(node('sell-button').textContent, /15/); click('sell-button');
  assert.equal(ui.game.state.walls.length, 0); assert.equal(ui.game.state.gold, 415);
  ui.game.state.gold = 420;
  for (const [mode, expected] of [['loop', 417], ['defense', 418], ['escort', 419], ['maze', 420]]) { go(mode); assert.equal(ui.game.state.gold, expected); }
  for (const mode of ['loop', 'defense', 'escort', 'maze']) {
    go(mode); ui.game.state.phase = 'victory'; ui.showEnd(); assert.equal(ui.view, 'end'); assert.equal(node('endless-button').hidden, mode === 'escort');
    ui.returnToMenu(); click('mode-' + (mode === 'loop' ? 'defense' : 'loop') + '-button'); click('mode-' + mode + '-button');
    assert.match(node('start-button').textContent, /查看战报/); click('start-button'); assert.equal(ui.view, 'end');
    if (mode !== 'escort') {
      const state = ui.game.state, towers = JSON.stringify(state.towers), walls = JSON.stringify(state.walls), health = state.coreHealth, gold = state.gold, tech = JSON.stringify(state.tech);
      click('endless-button'); assert.equal(ui.view, 'game'); assert.equal(state.endless, true);
      assert.equal(JSON.stringify(state.towers), towers); assert.equal(JSON.stringify(state.walls), walls);
      assert.equal(state.coreHealth, health); assert.equal(state.gold, gold); assert.equal(JSON.stringify(state.tech), tech);
    }
    else { assert.equal(ui.game.continueEndless().ok, false); click('restart-button'); assert.equal(ui.game.state.convoy.progress, 0); assert.equal(ui.game.state.convoy.moving, false); assert.equal(ui.game.state.gold, 400); }
  }
});
