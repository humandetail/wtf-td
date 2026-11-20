import { createLoopGame } from '../loop-session.js';
import { advanceOnRoad, createRoadPosition } from '../geometry.js';
import { loopEnemy } from '../loop-catalog.js';
import { loadLoop3D } from './index.js';

const canvas = document.querySelector('#battle');
const controls = document.querySelector('#controls');
const status = document.querySelector('#result');
const form = document.querySelector('#fixture');
const modelInput = document.querySelector('#model');
const button = document.querySelector('#start');
const noop = ()=>{};
const game = createLoopGame({startingGold:3000,draftRandom:()=>0});
const state = game.state;
const ground = new Image();
let asset = null, battle, running = false;
let seed = 0;
const random = ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
setUpTowers();

function setUpTowers() {
  game.start();
  game.deploy(game.openStarter().cardId,560,317);
  for (const [x,y] of [[720,509],[190,140],[190,315],[210,620],[1030,640],[900,315],[1040,150]]) {
    const {cardId} = game.draw('R');
    game.deploy(cardId,x,y);
  }
}

function populate() {
  seed = 183;
  const codes = ['X01','X02','X03','X05','X06','X08','X14'];
  state.enemies = Array.from({length:59},(_,i)=>{
    const boss=i===58;
    const unit=loopEnemy({code:boss?'B01':codes[i%codes.length],wave:5,boss},i+1,createRoadPosition(random));
    advanceOnRoad(unit,85+i*41,random);
    return unit;
  });
  state.elapsed = 0;
  battle.reset();
}

async function initialize() {
  ground.src = new URL('../assets/maps/v5/scene.webp',import.meta.url).href;
  const feature = await loadLoop3D();
  await ground.decode();
  battle = feature.mount({canvas,cameraPanel:controls,artwork:{ground},onTap:noop,onClear:noop,onEdgePan:noop,onPitch:noop,
    onLost:()=>{running=false;button.disabled=true;status.textContent='WebGL 已断开，刷新页面可重测。';},
    onModelError:error=>{asset=null;status.textContent=error.message;}
  });
  populate();
  battle.draw(state,{});
  status.textContent='载入模型后开始测试。请保持此页面在前台。';
  modelInput.addEventListener('change',async()=>{
    button.disabled = true;
    modelInput.disabled = true;
    try {
      asset = await feature.loadModel(modelInput.files);
      battle.setModel(asset);
      if (asset) status.textContent='四糸乃已载入。';
    } catch (error) {
      asset=null;
      battle.setModel(null);
      status.textContent=error.message;
    } finally {
      modelInput.disabled = false;
      button.disabled = !asset;
    }
  });
}

form.addEventListener('submit',event=>{
  event.preventDefault();
  if (!asset || running) return;
  populate();
  running = true;
  modelInput.disabled = true;
  button.disabled = true;
  const intervals = [];
  let beginning, last, nextEffects=0, lastSecond=-1;
  const boss = state.enemies.at(-1);

  function frame(now) {
    if (!running) return;
    beginning ??= now;
    const duration = now-beginning;
    const dt = last===undefined?0:now-last;
    if (last!==undefined && duration>=2000) intervals.push(dt);
    last = now;
    state.elapsed += Math.min(.1,dt/1000);
    const elapsed = state.elapsed;
    boss.channel = elapsed%4>=3 ? {kind:'charge',start:Math.floor(elapsed/4)*4+3,until:Math.floor(elapsed/4)*4+4} : null;
    for (const unit of state.enemies) {
      unit.actualSpeed = unit.channel?0:unit.speed;
      const travel = Math.min(.1,dt/1000)*unit.actualSpeed;
      advanceOnRoad(unit,travel,random);
      unit.progress += travel;
    }
    if (elapsed>=nextEffects) {
      nextEffects = elapsed+.16;
      for (const [index,tower] of state.towers.entries()) {
        const target = state.enemies[(index*17+Math.floor(elapsed*6))%state.enemies.length];
        battle.event({type:'shot',x:tower.x,y:tower.y,tx:target.x,ty:target.y,color:'#92e1f6'},state);
      }
      battle.event({type:'skill-pulse',x:boss.x,y:boss.y,radius:58,color:'#f9cb7e'},state);
    }
    battle.draw(state,{});
    const seconds = Math.max(0,Math.floor((duration-2000)/1000));
    if (seconds!==lastSecond) {
      lastSecond=seconds;
      status.textContent=`测试中 · ${seconds} / 120 秒 · 59 个敌人`;
    }
    if (duration<122000) {
      requestAnimationFrame(frame);
      return;
    }
    running = false;
    modelInput.disabled = false;
    button.disabled = false;
    const values = intervals.sort((a,b)=>a-b);
    const p95 = values[Math.ceil(values.length*.95)-1];
    const render = document.querySelector('.loop-webgl');
    const passed = p95 <= 1000/30;
    status.textContent=`测试完成 · ${passed?'达标':'未达标'} · P95 ${p95.toFixed(2)} ms · ${values.length} 帧 · ${render.width} × ${render.height}`;
  }
  requestAnimationFrame(frame);
});

document.addEventListener('visibilitychange',()=>{
  if (document.hidden && running) {
    running=false;
    modelInput.disabled=false;
    button.disabled=false;
    status.textContent='测试已中止。请保持页面在前台后重新开始。';
  }
});
initialize().catch(error=>{ status.textContent=error.message; });
