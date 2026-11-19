import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

async function harness(loopFixture = null) {
  const imports = Object.assign({}, ...await Promise.all(['battle-visuals','render','tower-upgrades','engine','catalog','research','geometry','defense-geometry','modes','gem-catalog','gem-geometry','hero-catalog','legion-catalog'].map(name=>import(new URL(`../${name}.js`,import.meta.url)))));
  const nodes=new Map(), events={}; let document;
  const confirmation={answer:true,messages:[]};
  class Element {
    constructor(tag='button') { this.tagName=tag.toUpperCase();this.hidden=true;this.style={setProperty(){}};this.dataset={};this.attrs={};this.events={};this.children=[];this.textContent='';this.classes=new Set();this.classList={add:key=>this.classes.add(key),toggle:(key,on)=>{if(on)this.classes.add(key);else this.classes.delete(key);}};this.isConnected=true;this.value=''; }
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
    addEventListener(k,fn){this.events[k]=fn;} append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parent=this;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);} contains(node){return this===node||this.children.some(child=>child.contains(node));}
    closest(){return null;} querySelectorAll(){return [];} focus(){document.activeElement=this;}
    showModal(){this.open=true;} close(){this.open=false;this.events.close?.();}
    click(){if(!this.disabled)this.events.click?.({target:this});} getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}
  }
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [,tag,id] of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g)){const el=new Element(tag);el.id=id;nodes.set(id,el);}
  document={getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},activeElement:null,createElement:tag=>new Element(tag),addEventListener:(k,fn)=>events[k]=fn};
  const context=vm.createContext({...imports,document,window:{addEventListener(){},confirm(message){confirmation.messages.push(message);return confirmation.answer;}},console,performance,createAudio:()=>({unlock:async()=>{},play(){},muted:false}),loadArtwork(){},createRenderer(){},ResizeObserver:class{},requestAnimationFrame(){}});
  if(loopFixture)context.createGame=options=>options?.mode?imports.createGame(options):loopFixture;
  let source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('void boot();','');
  source+='\nrenderer={reset(){},event(){},hitTest(x,y,items){return items.find(t=>Math.hypot(t.x-x,t.y-y)<35)?.id??null}};globalThis.ui={sessions,get game(){return game},get view(){return view},get pendingGem(){return pendingGem},get armedSkill(){return armedSkill},get placement(){return placement},get legionView(){return legionView},bindControls,updateUI,returnToMenu,activatePoint,armBuild,showEnd};';
  vm.runInContext(source,context);const ui=context.ui;ui.bindControls();
  const node=id=>nodes.get(id),click=id=>node(id).click();
  const go=mode=>{ui.returnToMenu();click('mode-'+mode+'-button');click('start-button');};
  const descendants=parent=>parent.children.flatMap(child=>[child,...descendants(child)]);
  const buttons=(id='special-mission')=>descendants(node(id)).filter(el=>el.tagName==='BUTTON');
  const panelButton=(id,match)=>{const button=buttons(id).find(match);assert.ok(button,'missing button in '+id);return button;};
  const command=label=>{const found=buttons().find(el=>el.textContent.includes(label));assert.ok(found,'missing command '+label);found.click();return found;};
  const key=(type,key)=>events[type]({key,preventDefault(){}});
  return {ui,node,click,go,command,key,events,buttons,panelButton,descendants,confirmation};
}


test('loop shop previews tiers, opens guaranteed starter and confirms a deployment once',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0});
 const {ui,node,go,panelButton,descendants,buttons}=await harness(loop);go('loop');
 const cardButton=match=>panelButton('loop-cards',match);
 assert.equal(node('build-dock').hidden,false);
 assert.match(node('wave-label').textContent,/开启起手 SR/);
 assert.match(node('wave-value').textContent,/0 \/ 50/);
 assert.equal(node('research-button').textContent,'装备');
 cardButton(button=>button.dataset.choice==='SSR').click();
 const preview=()=>descendants(node('loop-cards')).find(child=>child.id==='loop-card-preview');
 assert.ok(descendants(preview()).some(node=>node.textContent.includes('SSR 35%')));
 assert.equal(cardButton(button=>button.textContent==='购买 SSR 包').disabled,true);
 assert.ok(descendants(preview()).some(node=>node.textContent.includes('最多再 3 包')));
 cardButton(button=>button.textContent==='开启免费 SR 起手卡').click();
 const [starter]=loop.state.cards;
 assert.equal(loop.state.starter,'held');
 assert.equal(loop.catalog.find(tower=>tower.code===starter.code).rarity,'rare');
 assert.match(node('wave-label').textContent,/部署起手 SR/);
 assert.ok(descendants(preview()).some(node=>node.className==='skill-icon'&&node.dataset.icon));
 assert.equal(cardButton(button=>button.textContent.startsWith('售卡')).disabled,true);
 cardButton(button=>button.textContent==='部署').click();
 ui.activatePoint({x:-1,y:140});
 assert.equal(ui.placement.ok,false);
 assert.equal(loop.state.cards.length,1);
 ui.activatePoint({x:190,y:140});
 assert.equal(ui.placement,null);
 assert.equal(loop.state.cards.length,0);
 assert.equal(loop.state.towers.length,1);
 assert.match(node('wave-label').textContent,/备战 30s/);
 ui.activatePoint({x:190,y:140});
 assert.equal(node('tower-properties').hidden,true);
 assert.equal(node('tower-skills').hidden,false);
 assert.equal(node('tower-equipment').hidden,false);
 assert.equal(buttons('loop-skills').length,3);
 assert.equal(buttons('loop-controls').filter(button=>button.dataset.slot).length,6);
 assert.equal(node('loop-skill-detail').hidden,true);
 node('tower-properties-button').click();assert.equal(node('tower-properties').hidden,false);
 panelButton('loop-skills',button=>button.dataset.choice==='1').click();
 assert.equal(node('tower-properties').hidden,true);
 assert.match(node('loop-skill-detail').textContent,/3级 · 待解锁/);
 panelButton('loop-skills',button=>button.dataset.choice==='0').click();
 assert.match(node('loop-skill-detail').textContent,/1级 · 已解锁/);
 panelButton('loop-controls',button=>button.dataset.choice==='empty:0').click();
 assert.equal(node('loop-skill-detail').hidden,true);
 assert.equal(node('tower-bag-button').getAttribute('aria-expanded'),'true');
});

test('the help manual uses the loop catalog from the menu and resumes only a running battle',async()=>{
 const {node,go,click,ui,descendants}=await harness();
 const text=id=>descendants(node(id)).map(child=>child.textContent).join(' ');
 click('help-button');
 assert.equal(node('help-dialog').open,true);
 assert.equal(node('help-rules').hidden,false);
 click('help-towers-tab');
 assert.equal(node('help-rules').hidden,true);
 assert.equal(node('help-tower-list').children.length,36);
 assert.match(text('help-tower-list'),/电弧线圈.*20 人口.*5级/);
 node('help-tower-rarity').value='epic';node('help-tower-rarity').events.change();
 assert.equal(node('help-tower-list').children.length,9);
 click('help-equipment-tab');
 assert.equal(node('help-towers').hidden,true);
 assert.equal(node('help-equipment-list').children.length,23);
 assert.match(text('help-equipment-list'),/裂焰炉.*665 金.*第 25 波.*余烬阵列 ＋ 导能机芯 ＋ 橙装卷轴.*冷却 24 秒/);
 node('help-equipment-grade').value='orange';node('help-equipment-grade').events.change();
 assert.equal(node('help-equipment-list').children.length,6);
 click('close-help');
 go('defense');click('more-button');click('game-help-button');
 assert.equal(ui.game.state.paused,true);
 assert.equal(node('help-rules').hidden,false);
 click('help-towers-tab');
 assert.match(text('help-tower-list'),/激光跟踪塔/);
 click('close-help');assert.equal(ui.game.state.paused,false);
 click('pause-button');click('game-help-button');click('close-help');
 assert.equal(ui.game.state.paused,true);
});

test('loop command deck keeps intelligence and deployed towers directly reachable',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0});
 const {node,go,click,ui,buttons}=await harness(loop);
 go('loop');
 assert.equal(node('loop-intel-button').hidden,false);
 loop.openStarter();
 const {towerId}=loop.deploy(loop.state.cards[0].id,190,140);
 ui.updateUI();
 assert.match(node('tower-capacity').textContent,/人口 20 \/ 100/);
 click('loop-intel-button');
 assert.equal(node('mission-panel').hidden,false);
 click('loop-encyclopedia-button');
 click('close-drawer-button');
 assert.equal(node('mission-panel').hidden,false);
 click('loop-intel-button');
 assert.equal(node('command-drawer').hidden,true);
 buttons('loop-ready-towers')[0].click();
 assert.equal(node('selection-panel').hidden,false);
 assert.match(node('tower-title').textContent,/Lv\.1/);
 loop.sell(towerId);
 ui.updateUI();
 assert.equal(node('command-drawer').hidden,true);
 assert.equal(buttons('loop-ready-towers').length,0);
 go('defense');
 assert.equal(node('loop-intel-button').hidden,true);
 assert.equal(node('loop-ready-panel').hidden,true);
});

test('reading a purchased tower announces the pause and keeps deployment available',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0,startingGold:300});
 const {ui,node,go,click,panelButton}=await harness(loop);
 go('loop');
 const cardButton=match=>panelButton('loop-cards',match);
 cardButton(button=>button.textContent.startsWith('开启免费 SR')).click();
 cardButton(button=>button.textContent==='部署').click();
 ui.activatePoint({x:190,y:140});
 click('focus-button');
 cardButton(button=>button.dataset.tab==='shop').click();
 cardButton(button=>button.dataset.choice==='R').click();
 cardButton(button=>button.textContent==='购买 R 包').click();
 assert.equal(node('wave-label').textContent,'阅卡暂停');
 assert.equal(cardButton(button=>button.textContent==='部署').disabled,false);
 assert.equal(loop.state.paused,false);
 click('focus-button');
 assert.match(node('wave-label').textContent,/备战/);
});

test('loop equipment storefront, recipe and six slots remain usable through detachment cooldown',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0,startingGold:800});
 const {ui,node,go,click,panelButton,buttons,descendants}=await harness(loop);go('loop');
 const shopButton=match=>panelButton('loop-equipment-shop',match);
 const slotButton=match=>panelButton('loop-controls',match);
 loop.openStarter();
 const {towerId}=loop.deploy(loop.state.cards[0].id,190,140);
 const tower=loop.state.towers.find(t=>t.id===towerId);
 Object.assign(tower,{level:3,xp:59,combatUntil:5});
 loop.state.wave=3;
 click('research-button');
 assert.equal(node('research-panel').hidden,true);
 assert.equal(node('loop-equipment-shop').hidden,false);
 for(const code of ['crystal','lens']){
  shopButton(button=>button.dataset.choice===code).click();
  shopButton(button=>button.textContent.startsWith('购买')).click();
 }
 shopButton(button=>button.dataset.tab==='recipes').click();
 shopButton(button=>button.dataset.choice==='focus').click();
 const materials=descendants(node('loop-equipment-shop')).filter(node=>node.className==='equipment-recipe-part');
 assert.equal(materials.filter(node=>node.dataset.missing==='false').length,2);
 shopButton(button=>button.textContent.includes('买卷轴')).click();
 shopButton(button=>button.textContent==='合成装备').click();
 assert.equal(loop.state.inventory.length,1);
 assert.equal(loop.state.inventory[0].code,'focus');
 click('close-drawer-button');
 ui.activatePoint({x:190,y:140});
 assert.match(node('loop-skill-status').textContent,/59.*160.*脱战.*5/);
 assert.equal(buttons('loop-controls').filter(button=>button.dataset.slot).length,6);
 click('tower-bag-button');
 slotButton(button=>button.dataset.choice===`inventory:${loop.state.inventory[0].id}`).click();
 slotButton(button=>button.textContent==='装配导能机芯').click();
 assert.equal(tower.equipment[0].code,'focus');
 slotButton(button=>button.dataset.choice===`slot:${tower.equipment[0].id}`).click();
 assert.equal(slotButton(button=>button.textContent==='卸下导能机芯').disabled,true);
 loop.state.elapsed=5;ui.updateUI();
 slotButton(button=>button.textContent==='卸下导能机芯').click();
 assert.equal(tower.equipment.length,0);
});

test('loop SSR opening and R exchange remain visible through their tabs',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0,startingGold:900});
 const {ui,node,go,panelButton,descendants}=await harness(loop);go('loop');
 const cardButton=match=>panelButton('loop-cards',match);
 loop.state.ssrMisses=2;ui.updateUI();
 cardButton(button=>button.dataset.choice==='SSR').click();
 assert.ok(descendants(node('loop-cards')).some(node=>node.textContent.includes('本包必出 SSR')));
 cardButton(button=>button.textContent==='购买 SSR 包').click();
 assert.equal(loop.state.ssrMisses,0);
 assert.equal(loop.catalog.find(tower=>tower.code===loop.state.cards[0].code).rarity,'epic');
 loop.state.wave=15;
 for(let id=100;id<105;id++)loop.state.cards.push({id,code:'T01',paid:true,refund:30});
 ui.updateUI();cardButton(button=>button.dataset.tab==='exchange').click();
 for(let id=100;id<105;id++)cardButton(button=>button.dataset.choice===String(id)).click();
 cardButton(button=>button.textContent==='兑换指定 R').click();
 assert.equal(loop.state.cards.length,2);
 assert.equal(loop.state.cards.at(-1).refund,0);
 assert.equal(loop.state.cards.at(-1).code,'T01');
 assert.equal(node('build-dock').hidden,false);
});

test('loop tower controls activate a credential and keep targeting after an invalid gear cast',async()=>{
 const loop=(await import('../engine.js')).createGame({draftRandom:()=>0,startingGold:800,enemySpeedScale:0,enemyHealthScale:100});
 const {ui,node,go,click,panelButton}=await harness(loop);go('loop');
 const slots=match=>panelButton('loop-controls',match);
 loop.openStarter();
 const main=loop.deploy(loop.state.cards[0].id,500,300);
 assert.ok(main.ok);
 const tower=loop.state.towers.find(item=>item.id===main.towerId);
 loop.state.cards.push({id:102,code:loop.credentials[tower.code],paid:true,refund:30});
 const support=loop.deploy(102,190,140);
 assert.ok(support.ok);
 for(const unit of loop.state.towers)unit.level=5;
 loop.state.inventory.push({id:103,code:'furnace',invested:665,readyAt:0,manual:false});
 ui.activatePoint({x:500,y:300});click('tower-management-button');
 panelButton('loop-targeting',button=>button.textContent.startsWith('突破')).click();
 assert.equal(tower.awakened,true);
 assert.equal(loop.state.towers.find(t=>t.id===support.towerId).qualifiedUsed,true);
 click('tower-bag-button');
 slots(button=>button.dataset.choice==='inventory:103').click();
 slots(button=>button.textContent.startsWith('装配')).click();
 slots(button=>button.dataset.choice==='slot:103').click();
 slots(button=>button.textContent==='切换为手动').click();
 assert.equal(tower.equipment[0].manual,true);
 slots(button=>button.textContent==='施放装备技').click();
 assert.equal(node('focus-button').textContent,'取消施放');
 ui.activatePoint({x:0,y:0});
 assert.equal(ui.placement.ok,false);
 assert.equal(tower.equipment[0].readyAt,0);
 loop.launchWave();loop.tick(.05);
 const {x,y}=loop.state.enemies[0];
 ui.activatePoint({x,y});
 assert.ok(tower.equipment[0].readyAt>loop.state.elapsed);
 assert.equal(node('focus-button').textContent,'卡牌');
});

test('loop encyclopedia lists every tower and enemy family before drawing any card',async()=>{
 const {node,go,click}=await harness();go('loop');
 click('more-button');click('mission-button');click('loop-encyclopedia-button');
 const items=node('loop-encyclopedia-list'),filter=node('loop-encyclopedia-filter');
 assert.equal(items.children.length,36);
 for(const [key,count] of [['X',24],['E',10],['B',12],['C',8],['G',4]]){
  filter.value=key;filter.events.change();assert.equal(items.children.length,count);
  assert.ok(items.children[0].children.some(el=>el.textContent.includes('应对')));
 }
 click('close-drawer-button');
 assert.equal(node('mission-panel').hidden,false);
 go('escort');assert.equal(node('loop-encyclopedia-button').hidden,true);
});

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

test('home and menu preserve the exact seven sessions, funds and structures on return',async()=>{
 const {ui,go,click}=await harness();
 for(const mode of ['loop','defense','escort','maze','gem','hero','legion']){
  go(mode);const game=ui.game,state=game.state;const gold=state.gold,wave=state.wave;
  click('home-button');assert.equal(ui.view,'menu');assert.equal(state.paused,true);
  click('start-button');assert.equal(ui.game,game);assert.equal(ui.game.state,state);assert.equal(state.gold,gold);assert.equal(state.wave,wave);assert.equal(state.paused,false);
  click('menu-button');click('start-button');assert.equal(ui.game,game);assert.equal(state.gold,gold);
 }
});

 test('in-game menu and home require confirmation; cancelling preserves play and selection',async()=>{
 const {ui,go,click,confirmation}=await harness();
 for(const mode of ['loop','defense','escort','maze','gem','hero','legion']){
  go(mode);const game=ui.game,state=game.state;
  for(const button of ['menu-button','home-button']){
   confirmation.answer=false;const count=confirmation.messages.length;click(button);
   assert.equal(confirmation.messages.length,count+1);assert.equal(ui.view,'game');assert.equal(state.paused,false);assert.equal(ui.game,game);
   confirmation.answer=true;click(button);assert.equal(ui.view,'menu');assert.equal(state.paused,true);
   click('start-button');assert.equal(ui.game,game);assert.equal(state.paused,false);
  }
 }
});

test('building succeeds once per selection; rejected placement remains armed in every build mode',async()=>{
 const {ui,go}=await harness();
 for(const mode of ['defense','escort','maze','hero','legion']){
  go(mode);const state=ui.game.state;
  ui.armBuild('T01');ui.activatePoint({x:-100,y:-100});
  assert.ok(ui.placement,'invalid position keeps preview');assert.equal(state.towers.length,0);
  const findPoint=()=>{for(let y=40;y<800;y+=40)for(let x=40;x<1280;x+=40)if(ui.game.canBuild(x,y,'T01').ok)return {x,y};throw new Error('No valid build point: '+mode);};
  ui.activatePoint(findPoint());assert.equal(state.towers.length,1);assert.equal(ui.placement,null);
  const gold=state.gold,next=findPoint();ui.activatePoint(next);
  assert.equal(state.towers.length,1,'another map tap must not build '+mode);assert.equal(state.gold,gold);
  ui.armBuild('T01');ui.activatePoint(next);assert.equal(state.towers.length,2);
 }
});

test('research and tower upgrade buttons contain live progress without a separate research bar',async()=>{
 const {ui,go,click,node}=await harness();go('defense');
 assert.ok(ui.game.startResearch('reinforcement').ok);ui.updateUI();
 assert.match(node('reinforcement-research-button').textContent,/0%.*10.0秒/);
 assert.equal(node('research-progress').hidden,true);assert.equal(node('research-status').hidden,true);
 ui.game.tick(5);ui.updateUI();assert.match(node('reinforcement-research-button').textContent,/50%.*5.0秒/);
 ui.game.tick(5);ui.armBuild('T01');ui.activatePoint({x:190,y:140});click('upgrade-button');
 assert.match(node('upgrade-button').textContent,/升级中.*0%.*5.0秒/);
 ui.game.tick(2);ui.updateUI();assert.match(node('upgrade-button').textContent,/升级中.*40%.*3.0秒/);
 assert.equal(node('upgrade-button').disabled,true);assert.equal(node('sell-button').disabled,true);
 ui.game.tick(3);ui.updateUI();assert.equal(ui.game.state.towers[0].level,2);assert.doesNotMatch(node('upgrade-button').textContent,/升级中/);
});

test('loop intelligence shows challenge eligibility and gold scoring without counting gold targets as pressure',async()=>{
 const {ui,go,click,node,buttons}=await harness();go('loop');const g=ui.game;
 g.state.starter='deployed';g.state.wave=3;click('more-button');click('mission-button');
 assert.match(node('loop-forecast').textContent,/第4波.*18只/);
 assert.match(node('loop-forecast').textContent,/破阵山魈/);
 const challenge=buttons('loop-challenges').find(button=>button.textContent==='开启硬壳犀');
 assert.ok(challenge && !challenge.disabled);
 challenge.click();
 assert.match(node('loop-event-status').textContent,/硬壳犀.*28 秒/);
 g.state.goldRush={code:'G01',remaining:11,damage:200,reward:12,maxReward:90};
 g.state.enemies.push({id:90,special:'gold'});
 ui.updateUI();
 assert.equal(node('enemy-value').textContent,'0');
 assert.match(node('loop-live-event').textContent,/打金.*11 秒.*12 \/ 90/);
 g.state.wave=23;ui.updateUI();
 const forecast=node('loop-forecast').textContent;
 assert.match(forecast,/第24波.*50只/);
 assert.match(forecast,/第25波.*铜索狱卒/);
 assert.match(forecast,/应对.*干扰器中断读条/);
 assert.ok(forecast.indexOf('应对')<forecast.indexOf('第24波'));
 g.state.phase='victory';ui.updateUI();assert.equal(ui.view,'end');
 assert.equal(node('endless-button').hidden,false);
 click('endless-button');assert.equal(ui.view,'game');assert.equal(g.state.endless,true);
});

test('loop support details show actual aura percentages and reduced endless income',async()=>{
 const {ui,go,click,node,buttons,panelButton}=await harness();go('loop');const g=ui.game;
 g.state.starter='deployed';
 g.state.cards=[{id:101,code:'T09',paid:true,refund:75},{id:102,code:'T11',paid:true,refund:30}];
 ui.updateUI();panelButton('loop-cards',button=>button.dataset.tab==='bag').click();
 buttons('loop-cards').find(b=>b.dataset.group==='bag').click();
 buttons('loop-cards').find(b=>b.textContent==='部署').click();ui.activatePoint({x:190,y:140});
 const text=()=>node('tower-stats').children.map(n=>n.textContent).join(' ');
 assert.doesNotMatch(text(),/NaN|undefined/);assert.match(text(),/12%/);
 click('focus-button');buttons('loop-cards').find(b=>b.dataset.group==='bag').click();buttons('loop-cards').find(b=>b.textContent==='部署').click();ui.activatePoint({x:390,y:140});
 assert.match(text(),/每 18 秒 \+3/);
 g.state.endless=true;ui.updateUI();assert.match(text(),/每 20 秒 \+1/);
});

test('compact menu switches secondary panels and shows live research progress',async()=>{
 const {node,go,click,key,ui}=await harness();go('escort');
 click('more-button');assert.equal(node('settings-panel').hidden,false);assert.equal(node('research-panel').hidden,true);assert.equal(node('more-button').getAttribute('aria-expanded'),'true');
 click('mission-button');assert.equal(node('settings-panel').hidden,true);assert.equal(node('mission-panel').hidden,false);
 key('keydown','Escape');assert.equal(node('command-drawer').hidden,true);
 click('research-button');click('deployment-research-button');assert.match(node('research-button').textContent,/科技 0%/);
 ui.game.tick(6);ui.updateUI();assert.match(node('research-button').textContent,/科技 50%/);
 click('more-button');assert.equal(node('research-panel').hidden,true);assert.equal(node('settings-panel').hidden,false);
 click('more-button');assert.equal(node('command-drawer').hidden,true);
});

test('quiet HUD keeps automatic wave timing and one-tap placement cancellation visible',async()=>{
 const {node,go,click,ui,panelButton}=await harness();go('loop');
 const cardButton=match=>panelButton('loop-cards',match);
 cardButton(button=>button.textContent==='开启免费 SR 起手卡').click();
 assert.match(node('wave-label').textContent,/部署起手 SR/);
 cardButton(button=>button.textContent==='部署').click();
 assert.equal(node('focus-button').textContent,'取消放置');
 const gold=ui.game.state.gold;
 click('focus-button');
 assert.equal(node('focus-button').textContent,'卡牌');
 assert.equal(ui.game.state.gold,gold);
 assert.equal(ui.game.state.towers.length,0);
 assert.equal(ui.game.state.cards.length,1);
 ui.game.tick(30);ui.updateUI();assert.match(node('wave-label').textContent,/部署起手 SR/);
 click('focus-button');
 cardButton(button=>button.dataset.group==='bag').click();
 cardButton(button=>button.textContent==='部署').click();
 ui.activatePoint({x:190,y:140});
 assert.match(node('wave-label').textContent,/备战 30s/);
 ui.game.tick(30);ui.updateUI();assert.match(node('wave-label').textContent,/下波 36s/);
});
