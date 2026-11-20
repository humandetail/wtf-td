import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

async function harness(loopFixture = null) {
  const imports = Object.assign({}, ...await Promise.all(['battle-visuals','render','loop-session','geometry','loop-catalog','loop-equipment'].map(name=>import(new URL(`../${name}.js`,import.meta.url)))));
  const nodes=new Map(), events={}; let document;
  const confirmation={answer:true,messages:[]};
  class Element {
    constructor(tag='button') { this.tagName=tag.toUpperCase();this.hidden=true;this.style={setProperty(){}};this.dataset={};this.attrs={};this.events={};this.children=[];this.textContent='';this.classes=new Set();this.classList={add:key=>this.classes.add(key),toggle:(key,on)=>{if(on)this.classes.add(key);else this.classes.delete(key);}};this.isConnected=true;this.value=''; }
    setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
    addEventListener(k,fn){this.events[k]=fn;} append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parent=this;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);} contains(node){return this===node||this.children.some(child=>child.contains(node));}
    closest(){return null;} querySelectorAll(){return [];} focus(){document.activeElement=this;}
    showModal(){this.open=true;} close(){this.open=false;this.events.close?.();}
    click(){if(!this.disabled)this.events.click?.({target:this,currentTarget:this});} getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}
  }
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [markup,tag,id] of html.matchAll(/<(\w+)[^>]*?\bid="([^"]+)"[^>]*>/g)){const el=new Element(tag);el.id=id;el.hidden=markup.includes(' hidden');el.textContent=html.slice(html.indexOf(markup)+markup.length).match(/^([^<]*)/)?.[1]??'';nodes.set(id,el);}
  document={getElementById:id=>nodes.get(id),body:{classList:{toggle(){}}},activeElement:null,createElement:tag=>new Element(tag),addEventListener:(k,fn)=>events[k]=fn};
  const context=vm.createContext({...imports,document,window:{addEventListener(){},confirm(message){confirmation.messages.push(message);return confirmation.answer;}},console,performance,createAudio:()=>({unlock:async()=>{},play(){},muted:false}),loadArtwork(){},createRenderer(){},ResizeObserver:class{},requestAnimationFrame(){}});
  if(loopFixture)context.createLoopGame=()=>loopFixture;
  let source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('void boot();','');
  source+='\nrenderer={reset(){},event(){},hitTest(x,y,items){return items.find(t=>Math.hypot(t.x-x,t.y-y)<35)?.id??null}};globalThis.ui={game,get view(){return view},get placement(){return placement},bindControls,updateUI,returnToMenu,activatePoint,showEnd};';
  vm.runInContext(source,context);const ui=context.ui;ui.bindControls();
  const node=id=>nodes.get(id),click=id=>node(id).click();
  const go=()=>click('start-button');
  const descendants=parent=>parent.children.flatMap(child=>[child,...descendants(child)]);
  const buttons=id=>descendants(node(id)).filter(el=>el.tagName==='BUTTON');
  const panelButton=(id,match)=>{const button=buttons(id).find(match);assert.ok(button,'missing button in '+id);return button;};
  const key=(type,key)=>events[type]({key,preventDefault(){}});
  return {ui,node,click,go,key,events,buttons,panelButton,descendants,confirmation};
}


test('loop shop previews tiers, opens guaranteed starter and confirms a deployment once',async()=>{
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0});
 const {ui,node,go,panelButton,descendants,buttons}=await harness(loop);go();
 const cardButton=match=>panelButton('loop-cards',match);
 const choose=()=>{ cardButton(button=>button.dataset.group==='draft').click();cardButton(button=>button.textContent==='领取这张卡').click(); };
 assert.equal(node('build-dock').hidden,false);
 assert.match(node('wave-label').textContent,/开启起手 SR/);
 assert.match(node('wave-value').textContent,/0 \/ 50/);
 assert.equal(node('equipment-button').textContent,'装备');
 cardButton(button=>button.dataset.choice==='SSR').click();
 const preview=()=>descendants(node('loop-cards')).find(child=>child.id==='loop-card-preview');
 assert.ok(descendants(preview()).some(node=>node.textContent.includes('SSR 35%')));
 assert.equal(cardButton(button=>button.textContent==='购买 SSR 包').disabled,true);
 assert.ok(descendants(preview()).some(node=>node.textContent.includes('最多再 3 包')));
 cardButton(button=>button.textContent==='开启免费 SR 起手卡').click();
 choose();
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
 assert.match(node('notice').textContent,/起手塔已部署.*30 秒后开始首波/);
 ui.activatePoint({x:190,y:140});
 assert.equal(node('tower-properties').hidden,false);
 assert.equal(node('tower-management').hidden,false);
 assert.equal(node('tower-skills').hidden,false);
 assert.equal(node('tower-equipment').hidden,false);
 assert.equal(buttons('loop-skills').length,4);
 assert.equal(buttons('loop-controls').filter(button=>button.dataset.slot).length,6);
 assert.equal(node('loop-skill-detail').hidden,true);
 panelButton('loop-skills',button=>button.dataset.choice==='1').click();
 assert.equal(node('tower-properties').hidden,false);
 assert.match(node('loop-skill-detail').textContent,/3 级 · 待解锁/);
 panelButton('loop-skills',button=>button.dataset.choice==='0').click();
 assert.match(node('loop-skill-detail').textContent,/1 级 · 已解锁/);
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
 assert.match(text('help-tower-list'),/电弧线圈.*20 人口.*30 级/);
 node('help-tower-rarity').value='epic';node('help-tower-rarity').events.change();
 assert.equal(node('help-tower-list').children.length,9);
 click('help-equipment-tab');
 assert.equal(node('help-towers').hidden,true);
 assert.equal(node('help-equipment-list').children.length,30);
 assert.match(text('help-equipment-list'),/裂焰炉.*直购.*余烬阵列 ＋ 滞行力场 ＋ 导能晶 ＋ 导能晶/);
 node('help-equipment-grade').value='orange';node('help-equipment-grade').events.change();
 assert.equal(node('help-equipment-list').children.length,8);
 click('close-help');
 go();click('more-button');click('game-help-button');
 assert.equal(ui.game.state.paused,true);
 assert.equal(node('help-rules').hidden,false);
 click('help-towers-tab');
 assert.match(text('help-tower-list'),/激光跟踪塔/);
 click('close-help');assert.equal(ui.game.state.paused,false);
 click('pause-button');click('game-help-button');click('close-help');
 assert.equal(ui.game.state.paused,true);
});

test('loop command deck keeps intelligence and deployed towers directly reachable',async()=>{
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0});
 const {node,go,click,ui,buttons}=await harness(loop);
 go();
 assert.equal(node('loop-intel-button').hidden,false);
 loop.openStarter();
 const {towerId}=loop.deploy(loop.state.cards[0].id,190,140);
 ui.updateUI();
 assert.match(node('tower-capacity').textContent,/人口 20 \/ 100/);
 click('loop-intel-button');
 assert.equal(node('mission-panel').hidden,false);
 click('loop-encyclopedia-button');
 node('command-drawer').scrollTop=250;
 click('loop-intel-button');
 assert.equal(node('mission-panel').hidden,false);
 assert.equal(node('command-drawer').scrollTop,0);
 click('loop-intel-button');
 assert.equal(node('mission-panel').hidden,false);
 click('equipment-button');
 assert.equal(node('loop-equipment-shop').hidden,false);
 click('equipment-button');
 assert.equal(node('loop-equipment-shop').hidden,false);
 click('more-button');
 assert.equal(node('settings-panel').hidden,false);
 click('more-button');
 assert.equal(node('settings-panel').hidden,false);
 click('loop-intel-button');
 assert.equal(node('mission-panel').hidden,false);
 click('loop-towers-button');
 assert.equal(node('command-drawer').hidden,true);
 assert.equal(node('build-dock').hidden,true);
 assert.equal(node('loop-towers-button').getAttribute('aria-expanded'),'true');
 buttons('loop-ready-towers')[0].click();
 assert.equal(node('selection-panel').hidden,false);
 assert.equal(node('loop-towers-button').getAttribute('aria-expanded'),'false');
 assert.match(node('tower-title').textContent,/Lv\.1/);
 loop.sell(towerId);
 ui.updateUI();
 assert.equal(node('command-drawer').hidden,true);
 assert.equal(buttons('loop-ready-towers').length,0);

});

test('reading a purchased tower keeps the live countdown and deployment available',async()=>{
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0,startingGold:300});
 const {ui,node,go,click,panelButton}=await harness(loop);
 go();
 const cardButton=match=>panelButton('loop-cards',match);
 const choose=()=>{ cardButton(button=>button.dataset.group==='draft').click();cardButton(button=>button.textContent==='领取这张卡').click(); };
 cardButton(button=>button.textContent.startsWith('开启免费 SR')).click();
 choose();
 cardButton(button=>button.textContent==='部署').click();
 ui.activatePoint({x:190,y:140});
 click('focus-button');
 cardButton(button=>button.dataset.tab==='shop').click();
 cardButton(button=>button.dataset.choice==='R').click();
 cardButton(button=>button.textContent==='购买 R 包').click();
 choose();
 assert.match(node('wave-label').textContent,/备战/);
 assert.equal(cardButton(button=>button.textContent==='部署').disabled,false);
 assert.equal(loop.state.paused,false);
 click('focus-button');
 assert.match(node('wave-label').textContent,/备战/);
});

test('loop equipment storefront, recipe and six slots remain usable through detachment cooldown',async()=>{
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0,startingGold:800});
 const {ui,node,go,click,panelButton,buttons,descendants}=await harness(loop);go();
 const shopButton=match=>panelButton('loop-equipment-shop',match);
 const slotButton=match=>panelButton('loop-controls',match);
 loop.openStarter();
 const {towerId}=loop.deploy(loop.state.cards[0].id,190,140);
 const tower=loop.state.towers.find(t=>t.id===towerId);
 Object.assign(tower,{level:3,xp:59,combatUntil:5});
 loop.state.wave=3;
 click('equipment-button');
 assert.equal(node('loop-equipment-shop').hidden,false);
 for(const code of ['crystal','lens']){
  shopButton(button=>button.dataset.choice===code).click();
  shopButton(button=>button.textContent.startsWith('购买')).click();
 }
 shopButton(button=>button.dataset.tab==='recipes').click();
 shopButton(button=>button.dataset.choice==='focus').click();
 const materials=descendants(node('loop-equipment-shop')).filter(node=>node.className==='equipment-recipe-part');
 assert.equal(materials.filter(node=>node.dataset.missing==='false').length,2);
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
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0,startingGold:900});
 const {ui,node,go,panelButton,descendants}=await harness(loop);go();
 const cardButton=match=>panelButton('loop-cards',match);
 const choose=()=>{ cardButton(button=>button.dataset.group==='draft').click();cardButton(button=>button.textContent==='领取这张卡').click(); };
 loop.state.ssrMisses=2;ui.updateUI();
 cardButton(button=>button.dataset.choice==='SSR').click();
 assert.ok(descendants(node('loop-cards')).some(node=>node.textContent.includes('本包必出 SSR')));
 cardButton(button=>button.textContent==='购买 SSR 包').click();
 choose();
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
 const loop=(await import('../loop-session.js')).createLoopGame({draftRandom:()=>0,startingGold:800,enemySpeedScale:0,enemyHealthScale:100});
 const {ui,node,go,click,panelButton,key}=await harness(loop);go();
 const slots=match=>panelButton('loop-controls',match);
 loop.openStarter();
 const main=loop.deploy(loop.state.cards[0].id,500,300);
 assert.ok(main.ok);
 const tower=loop.state.towers.find(item=>item.id===main.towerId);
 loop.state.cards.push({id:102,code:loop.credentials[tower.code],paid:true,refund:30});
 const support=loop.deploy(102,190,140);
 assert.ok(support.ok);
 tower.level=20;
 for(const _ of [0,1,2]) assert.ok(loop.upgradeDeputy(support.towerId).ok);
 loop.state.inventory.push({id:103,code:'anchor',invested:450,readyAt:0,manual:false});
 ui.activatePoint({x:500,y:300});
 panelButton('loop-breakthrough',button=>button.textContent.startsWith('突破')).click();
 assert.equal(tower.awakened,true);
 assert.equal(loop.state.towers.find(t=>t.id===support.towerId).deputyStage,3);
 click('tower-bag-button');
 slots(button=>button.dataset.choice==='inventory:103').click();
 slots(button=>button.textContent.startsWith('装配')).click();
 slots(button=>button.dataset.choice==='slot:103').click();
 slots(button=>button.textContent==='切换为手动').click();
 assert.equal(tower.equipment[0].manual,true);
 slots(button=>button.textContent==='施放装备技').click();
 assert.equal(node('focus-button').textContent,'卡牌');
 ui.activatePoint({x:0,y:0});
 assert.equal(ui.placement.ok,false);
 assert.equal(tower.equipment[0].readyAt,0);
 key('keydown','Escape');
 assert.equal(node('selection-panel').hidden,false);
 assert.equal(node('focus-button').textContent,'卡牌');
 slots(button=>button.dataset.choice==='slot:103').click();
 slots(button=>button.textContent==='施放装备技').click();
 loop.launchWave();loop.tick(.05);
 const {x,y}=loop.state.enemies[0];
 ui.activatePoint({x,y});
 assert.ok(tower.equipment[0].readyAt>loop.state.elapsed);
 assert.equal(node('selection-panel').hidden,false);
 assert.equal(node('focus-button').textContent,'卡牌');
});

test('loop encyclopedia lists every tower and enemy family before drawing any card',async()=>{
 const {node,go,click}=await harness();go();
 click('loop-intel-button');click('loop-encyclopedia-button');
 const items=node('loop-encyclopedia-list'),filter=node('loop-encyclopedia-filter');
 assert.equal(items.children.length,36);
 for(const [key,count] of [['X',24],['E',10],['B',12],['C',8],['G',4]]){
  filter.value=key;filter.events.change();assert.equal(items.children.length,count);
  assert.ok(items.children[0].children.some(el=>el.textContent.includes('应对')));
 }
 click('close-drawer-button');
 assert.equal(node('mission-panel').hidden,false);
 assert.equal(node('loop-encyclopedia').hidden,true);
});

test('home and menu confirm, pause and preserve the same loop session and structures',async()=>{
 const {ui,go,click,confirmation}=await harness();
 go();
 const {game}=ui,state=game.state;
 game.openStarter();
 game.deploy(state.cards[0].id,190,140);
 const [tower]=state.towers, gold=state.gold, wave=state.wave;
 for(const button of ['menu-button','home-button']){
  confirmation.answer=false;
  const count=confirmation.messages.length;
  click(button);
  assert.equal(confirmation.messages.length,count+1);
  assert.equal(ui.view,'game');
  assert.equal(state.paused,false);
  confirmation.answer=true;
  click(button);
  assert.equal(ui.view,'menu');
  assert.equal(state.paused,true);
  go();
  assert.equal(ui.game.state,state);
  assert.equal(state.towers[0],tower);
  assert.equal(state.gold,gold);
  assert.equal(state.wave,wave);
  assert.equal(state.paused,false);
 }
});

test('loop intelligence shows challenge eligibility and gold scoring without counting gold targets as pressure',async()=>{
 const {ui,go,click,node,buttons}=await harness();go();const g=ui.game;
 g.state.starter='deployed';g.state.wave=3;click('loop-intel-button');
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
 const {ui,go,click,node,buttons,panelButton}=await harness();go();const g=ui.game;
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

test('loop cards and equipment replace the placement preview on the first click',async()=>{
 const {node,go,click,ui,panelButton}=await harness();go();
 const cardButton=match=>panelButton('loop-cards',match);
 const choose=()=>{ cardButton(button=>button.dataset.group==='draft').click();cardButton(button=>button.textContent==='领取这张卡').click(); };
 cardButton(button=>button.textContent==='开启免费 SR 起手卡').click();
 choose();
 assert.match(node('wave-label').textContent,/部署起手 SR/);
 cardButton(button=>button.textContent==='部署').click();
 assert.equal(node('build-dock').hidden,true);
 const gold=ui.game.state.gold;
 click('focus-button');
 assert.equal(node('focus-button').textContent,'卡牌');
 assert.equal(node('build-dock').hidden,false);
 click('focus-button');
 assert.equal(node('build-dock').hidden,false);
 assert.equal(ui.game.state.gold,gold);
 assert.equal(ui.game.state.towers.length,0);
 assert.equal(ui.game.state.cards.length,1);
 ui.game.tick(30);ui.updateUI();assert.match(node('wave-label').textContent,/部署起手 SR/);
 ui.activatePoint({x:190,y:140});
 assert.equal(ui.game.state.towers.length,0);
 click('focus-button');
 cardButton(button=>button.dataset.group==='bag').click();
 cardButton(button=>button.textContent==='部署').click();
 click('equipment-button');
 assert.equal(node('loop-equipment-shop').hidden,false);
 ui.activatePoint({x:190,y:140});
 assert.equal(ui.game.state.towers.length,0);
 click('focus-button');
 cardButton(button=>button.dataset.group==='bag').click();
 cardButton(button=>button.textContent==='部署').click();
 ui.activatePoint({x:190,y:140});
 assert.match(node('wave-label').textContent,/备战 30s/);
 ui.game.tick(30);ui.updateUI();assert.match(node('wave-label').textContent,/下波 36s/);
});
