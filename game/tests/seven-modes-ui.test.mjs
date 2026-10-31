import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

async function harness() {
  const imports = Object.assign({}, ...await Promise.all(['engine','catalog','research','geometry','defense-geometry','modes','gem-catalog','gem-geometry','hero-catalog','legion-catalog'].map(name=>import(new URL(`../${name}.js`,import.meta.url)))));
  const nodes=new Map(), events={}; let document;
  class Element {
    constructor(tag='button') { this.tagName=tag.toUpperCase();this.hidden=true;this.style={};this.dataset={};this.attrs={};this.events={};this.children=[];this.textContent='';this.classes=new Set();this.classList={toggle:(key,on)=>{if(on)this.classes.add(key);else this.classes.delete(key);}};this.isConnected=true;this.value=''; }
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
    addEventListener(k,fn){this.events[k]=fn;} append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parent=this;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);} contains(node){return this===node||this.children.some(child=>child.contains(node));}
    closest(){return null;} querySelectorAll(){return [];} focus(){document.activeElement=this;}
    click(){if(!this.disabled)this.events.click?.({target:this});} getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}
  }
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [,tag,id] of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)){const el=new Element(tag);el.id=id;nodes.set(id,el);}
  document={getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},activeElement:null,createElement:tag=>new Element(tag),addEventListener:(k,fn)=>events[k]=fn};
  const context=vm.createContext({...imports,document,window:{addEventListener(){}},console,performance,createAudio:()=>({unlock:async()=>{},play(){},muted:false}),loadArtwork(){},createRenderer(){},ResizeObserver:class{},requestAnimationFrame(){}});
  let source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('void boot();','');
  source+='\nrenderer={reset(){},event(){},hitTest(x,y,items){return items.find(t=>Math.hypot(t.x-x,t.y-y)<35)?.id??null}};globalThis.ui={sessions,get game(){return game},get view(){return view},get pendingGem(){return pendingGem},get armedSkill(){return armedSkill},get placement(){return placement},get legionView(){return legionView},bindControls,updateUI,returnToMenu,activatePoint,armBuild,showEnd};';
  vm.runInContext(source,context);const ui=context.ui;ui.bindControls();
  const node=id=>nodes.get(id),click=id=>node(id).click();
  const go=mode=>{ui.returnToMenu();click('mode-'+mode+'-button');click('start-button');};
  const descendants=parent=>parent.children.flatMap(child=>[child,...descendants(child)]);
  const buttons=(id='special-mission')=>descendants(node(id)).filter(el=>el.tagName==='BUTTON');
  const command=label=>{const found=buttons().find(el=>el.textContent.includes(label));assert.ok(found,'missing command '+label);found.click();return found;};
  const key=(type,key)=>events[type]({key,preventDefault(){}});
  return {ui,node,click,go,command,key,events,buttons,descendants};
}

test('seven actual sessions preserve isolation and terminal reports including legion draw',async()=>{
  const {ui,node,click,go}=await harness(); assert.equal(Object.keys(ui.sessions).length,7);
  for(const [index,mode] of Object.keys(ui.sessions).entries()){go(mode);assert.equal(ui.game.state.mode,mode);ui.game.state.gold=510+index;}
  for(const [index,mode] of Object.keys(ui.sessions).entries()){go(mode);assert.equal(ui.game.state.gold,510+index);}
  for(const mode of ['gem','hero','legion']){go(mode);ui.game.state.phase=mode==='legion'?'draw':'victory';ui.updateUI();assert.equal(ui.view,'end');assert.equal(node('endless-button').hidden,true);ui.returnToMenu();click('start-button');assert.equal(ui.view,'end');click('restart-button');assert.equal(ui.game.state.phase,'playing');assert.equal(ui.view,'game');}
});

test('gem drawer drives five choices, reserve deployment and explicit multi-material recipe confirmation',async()=>{
  const {ui,node,go,command,descendants}=await harness();go('gem');
  command('鉴定五选一'); assert.equal(ui.game.state.draft.candidates.length,5);
  const drafts=descendants(node('special-mission')).filter(el=>el.className==='draft-card');assert.equal(drafts.length,5);
  for(const card of drafts)assert.match(card.children.map(el=>el.textContent).join(' '),/射程／作用半径/);
  assert.equal(descendants(node('special-mission')).filter(el=>el.className==='recipe-card').length,5);
  command('选留到备选');assert.equal(ui.game.state.inventory.length,1);command('部署 ');assert.ok(ui.pendingGem);ui.activatePoint({x:180,y:240});assert.equal(ui.game.state.inventory.length,0);assert.equal(ui.game.state.towers.length,1);
  // Give the UI a valid transaction fixture, then exercise its actual selectors and confirm button.
  const state=ui.game.state;state.tech.deployment=2;state.tech.reinforcement=3;
  state.towers=[['G03',2],['G05',2],['G06',2]].map(([code,level],i)=>({id:100+i,code,level,x:180+i*90,y:240,spent:60}));ui.updateUI();
  const group=descendants(node('special-mission')).find(el=>el.className==='recipe-card'&&el.children[0].textContent.includes('天工矩阵'));
  const selectors=group.children.filter(el=>el.tagName==='SELECT');selectors.forEach((el,i)=>el.value=String(100+i));
  const preview=group.children.find(el=>el.textContent==='预览融合'),confirm=group.children.find(el=>el.textContent==='确认消耗以上实体并融合');
  const unchanged=JSON.stringify([state.towers,state.inventory,state.gold]);
  assert.ok(group.children.some(child=>/结果效果：.*连锁距离/.test(child.textContent)));
  assert.equal(confirm.disabled,true);preview.click();assert.equal(confirm.disabled,false);assert.equal(JSON.stringify([state.towers,state.inventory,state.gold]),unchanged);
  const explanation=group.children.map(el=>el.textContent).join(' ');assert.match(explanation,/容量：在场 3\/12 → 1\/12/);assert.match(explanation,/失去原光环源.*翠晶/);assert.match(explanation,/结果光环源.*天工矩阵/);assert.equal(state.towers.length,3);confirm.click();assert.equal(state.towers.length,1);assert.equal(state.towers[0].code,'F04');
  command('准备完毕');assert.equal(state.turnPhase,'combat');assert.equal(node('mission-button').hidden,false);assert.equal(ui.game.store(100).ok,false);
});

test('hero WASD persists until keyup, menu/dialog suppress input, skills target world and right click cancels armed action',async()=>{
  const {ui,node,go,key,click}=await harness();go('hero');const state=ui.game.state;
  const x=state.hero.x;key('keydown','d');ui.game.tick(.1);assert.ok(state.hero.x>x);key('keyup','d');const stopped=state.hero.x;ui.game.tick(.1);assert.equal(state.hero.x,stopped);
  key('keydown','Q');assert.equal(ui.armedSkill,'Q');const mana=state.hero.mana;ui.activatePoint({x:640,y:250});assert.ok(state.hero.mana<mana);assert.equal(ui.armedSkill,null);
  node('game-canvas').focus();node('game-canvas').events.contextmenu({clientX:700,clientY:560,preventDefault(){}});ui.game.tick(.1);assert.ok(state.hero.x>stopped);
  click('mission-button');key('keydown','d');const frozen=state.hero.x;ui.game.tick(.1);assert.equal(state.hero.x,frozen);
  click('close-drawer-button');node('game-canvas').focus();key('keydown','d');ui.returnToMenu();const menuX=state.hero.x;go('hero');ui.game.tick(.1);assert.equal(state.hero.x,menuX);
  ui.returnToMenu();key('keydown','q');assert.equal(ui.armedSkill,null);go('hero');node('help-dialog').open=true;key('keydown','q');assert.equal(ui.armedSkill,null);node('help-dialog').open=false;
});

test('legion actual economy, queue cancel, scout and manual battle controls use independent boards',async()=>{
  const {ui,node,go,command,click}=await harness();go('legion');const state=ui.game.state,p=state.sides.player;
  command('购买工人');assert.equal(p.workers,3);command('突袭者');assert.equal(p.orders.length,1);assert.equal(p.mythium,10);command('取消 ');assert.equal(p.orders.length,0);assert.equal(p.mythium,20);
  click('scout-button');assert.equal(ui.legionView,'ai');ui.armBuild('T01');ui.activatePoint({x:640,y:500});assert.equal(p.fighters.length,0);assert.match(node('notice').textContent,/侦察|己方/);
  click('scout-button');ui.armBuild('T01');ui.activatePoint({x:640,y:500});assert.equal(p.fighters.length,1);command('锁定双方');assert.equal(state.turnPhase,'combat');assert.equal(ui.game.buyWorker().ok,false);assert.ok(state.sides.ai.invaders.length>0);assert.match(node('legion-kings').textContent,/AI王/);
});


test('ordinary gem preview computes field and reserve capacity plus real aura changes, and Escape consumes nothing',async()=>{
  const {ui,node,go,buttons,descendants,key}=await harness();go('gem');const state=ui.game.state;state.tech.reinforcement=2;
  state.towers=[{id:100,code:'G05',level:2,x:180,y:240,spent:60},{id:102,code:'G06',level:1,x:360,y:240,spent:60}];
  state.inventory=[{id:101,code:'G05',level:2,x:0,y:0,spent:60}];ui.activatePoint({x:180,y:240});
  const before=JSON.stringify([state.towers,state.inventory,state.gold]);
  buttons('gem-selection-actions').find(button=>button.textContent.startsWith('预览：')).click();
  const text=descendants(node('gem-selection-actions')).map(el=>el.textContent).join(' ');
  assert.match(text,/容量：在场 2\/4 → 2\/4；备选 1\/2 → 0\/2/);assert.match(text,/#102 伤害\+27%、射程\+27% → 伤害\+34%、射程\+34%/);
  assert.match(text,/结果留在场上/);assert.equal(JSON.stringify([state.towers,state.inventory,state.gold]),before);
  key('keydown','Escape');assert.equal(JSON.stringify([state.towers,state.inventory,state.gold]),before);
  // Reverse primary/material location: result stays in reserve and removes the field aura.
  ui.updateUI();node('mission-button').click();
  buttons().find(button=>button.textContent==='查看／合成／出售 #101').click();
  buttons('gem-selection-actions').find(button=>button.textContent.startsWith('预览：')).click();
  const reserve=descendants(node('gem-selection-actions')).map(el=>el.textContent).join(' ');
  assert.match(reserve,/在场 2\/4 → 1\/4；备选 1\/2 → 1\/2/);assert.match(reserve,/结果留在备选，不攻击也不提供光环/);assert.match(reserve,/#102 伤害\+27%、射程\+27% → 无外部光环/);
});

test('hero right click cancels armed build or skill without movement, then a second click moves or targets',async()=>{
  const {ui,node,go,key}=await harness();go('hero');const h=ui.game.state.hero;
  const right=()=>node('game-canvas').events.contextmenu({clientX:800,clientY:550,preventDefault(){}});
  for(const action of [()=>ui.armBuild('T01'),()=>key('keydown','q')]){
    node('game-canvas').focus();action();node('game-canvas').events.pointermove({clientX:800,clientY:550});
    if(ui.armedSkill)assert.equal(ui.placement.skill,'Q');
    const x=h.x,y=h.y,mana=h.mana,gold=ui.game.state.gold;right();assert.equal(ui.armedSkill,null);assert.equal(ui.placement,null);ui.game.tick(.1);
    assert.equal(h.x,x);assert.equal(h.y,y);assert.equal(h.mana,mana);assert.equal(ui.game.state.gold,gold);
  }
  right();ui.game.tick(.1);assert.ok(h.x>640);
  ui.game.setMoveVector(0,0);ui.game.state.enemies.push({id:999,code:'X01',hp:100,maxHp:100,x:800,y:550,progress:0,lane:0,speed:0,reward:0,ai:'rush',attackCooldown:1,slowUntil:0,rootUntil:0,castCooldown:0,castRemaining:0});right();assert.equal(h.targetId,999);
});


test('persistent hero skill buttons expose cooldown, mana and level locks, focus canvas after arming, and hide on mode switch',async()=>{
  const {ui,node,go,click,key}=await harness();go('hero');const state=ui.game.state,h=state.hero;
  assert.equal(node('hero-hud').hidden,false);assert.match(node('hero-status').textContent,/HP 300\/300.*MP 100\/100/);
  assert.equal(node('hero-q-button').disabled,false);assert.equal(node('hero-e-button').disabled,true);assert.equal(node('hero-r-button').disabled,true);
  assert.match(node('hero-e-state').textContent,/2级解锁/);assert.match(node('hero-r-state').textContent,/6级解锁/);assert.match(node('hero-q-button').getAttribute('aria-label'),/25法力.*冷却8秒.*地图选择目标/);
  click('focus-button');assert.equal(node('build-dock').hidden,false);assert.equal(node('build-dock').classes.has('hero-build-dock'),true);
  click('hero-q-button');assert.equal(node('build-dock').hidden,true);assert.equal(ui.armedSkill,'Q');assert.equal(node('hero-q-button').getAttribute('aria-pressed'),'true');assert.equal(node('game-canvas').getAttribute('aria-label').includes('战场'),true);
  // Arming restores canvas keyboard control, including movement and click-to-cast.
  key('keydown','d');ui.game.tick(.1);key('keyup','d');assert.ok(h.x>640);ui.activatePoint({x:640,y:250});assert.equal(ui.armedSkill,null);assert.equal(node('hero-q-button').disabled,true);assert.match(node('hero-q-state').textContent,/冷却 8.0秒/);
  ui.game.tick(1);ui.updateUI();assert.match(node('hero-q-state').textContent,/冷却 7.0秒/);ui.game.tick(7);ui.updateUI();assert.equal(node('hero-q-button').disabled,false);
  h.mana=0;ui.updateUI();assert.match(node('hero-q-state').textContent,/法力不足/);assert.equal(node('hero-q-button').disabled,true);ui.game.tick(9);ui.updateUI();assert.equal(node('hero-q-button').disabled,false);
  h.level=6;h.mana=100;ui.updateUI();assert.equal(node('hero-e-button').disabled,false);assert.equal(node('hero-r-button').disabled,false);
  click('pause-button');assert.equal(node('hero-q-button').disabled,true);assert.match(node('hero-q-state').textContent,/已暂停/);node('hero-q-button').events.click();assert.equal(ui.armedSkill,null);click('pause-button');
  h.alive=false;h.respawnIn=5;ui.updateUI();assert.equal(node('hero-r-button').disabled,true);assert.match(node('hero-r-state').textContent,/复活 5秒/);
  h.alive=true;state.phase='victory';ui.updateUI();assert.equal(node('hero-q-button').disabled,true);node('hero-q-button').events.click();assert.equal(ui.armedSkill,null);
  go('legion');assert.equal(node('hero-hud').hidden,true);assert.equal(node('build-dock').classes.has('hero-build-dock'),false);go('gem');assert.equal(node('hero-hud').hidden,true);
});
