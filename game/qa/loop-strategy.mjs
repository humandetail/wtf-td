import {createGame} from '../engine.js';
import {ROAD_SEGMENTS} from '../geometry.js';

function seeded(seed){
 let value=seed;
 return ()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);
}
const roads=ROAD_SEGMENTS.flatMap(r=>{
 const count=Math.ceil(Math.hypot(r.x2-r.x1,r.y2-r.y1)/30);
 return Array.from({length:count},(_,i)=>{
  const x=r.x1+(r.x2-r.x1)*(i+.5)/count,y=r.y1+(r.y2-r.y1)*(i+.5)/count;
  return {x,y,weight:Math.hypot(x-640,y-400)<195?4:1};
 });
});
const positions=Array.from({length:450},(_,i)=>[160+(i%25)*40,125+Math.floor(i/25)*32]).filter(([,y])=>y<=675);
const preferred={
 physical:['T01','T06','T03','T32','T12','T17','T14','T16','T21','T25','T04','T07','T10'],
 magic:['T13','T06','T15','T05','T25','T34','T04','T02','T23','T16','T21','T07','T10'],
};

function bestPosition(game,card){
 const item=game.catalog.find(t=>t.code===card.code);
 const active=game.state.towers.map(t=>({...t,...game.statsFor(t)}));
 const samples=roads.map(p=>({...p,weight:p.weight/(1+active.filter(t=>t.damage>0&&Math.hypot(p.x-t.x,p.y-t.y)<=t.range).length*.65)}));
 let best=null;
 for(const [x,y] of positions){
  if(!game.canDeploy(card.id,x,y).ok)continue;
  const score=item.role==='support'
   ? active.filter(t=>t.damage>0&&Math.hypot(x-t.x,y-t.y)<item.range).length*100
   : samples.reduce((sum,p)=>sum+(Math.hypot(x-p.x,y-p.y)<=item.range?p.weight:0),0);
  if(!best||score>best.score)best={x,y,score};
 }
 return best;
}

export function playLoopStrategy(seed=1,style='physical',options={}){
 const game=createGame({random:seeded(Math.imul(seed,0x9e3779b1)),draftRandom:seeded(Math.imul(seed,0x85ebca6b)+1000),enemyHealthScale:options.enemyHealthScale,
  ...(options.noEpic?{towerFilter:t=>t.rarity!=='epic'}:{})});
 const state=game.state,milestones=[];
 const orders=preferred[style]??preferred.physical;
 const definitions=new Map(game.catalog.map(item=>[item.code,item]));
 const score=code=>{
  const t=definitions.get(code),position=orders.indexOf(code);
  const copies=state.towers.filter(x=>x.code===code).length;
  if(!t.damage)return (code==='T11'&&state.wave<10&&!copies&&state.populationUsed>=2?26:5)-copies*20;
  return (position<0?18:60-position*2)/Math.sqrt(t.population)-copies*11;
 };
 let lastDecision=-1,peak=0,endlessWave=0;
 const first={};
 game.start();game.openStarter();
 function buyPack(tier) {
  const purchase=game.draw(tier);
  if(!purchase.ok)return;
  first[tier]??=state.wave;
  const quality=definitions.get(state.cards.find(card=>card.id===purchase.cardId).code).population;
  first[['R','SR','SSR'][quality-1]+'Result']??=state.wave;
 }
 function buildEquipment(code) {
  const definition=game.equipment[code];
  if(!definition.components)return game.buyEquipment(code).ok;
  for(const component of definition.components)
   if(!state.inventory.some(item=>item.code===component)&&!buildEquipment(component))return false;
  if(!state.inventory.some(item=>item.code===definition.scroll)&&!game.buyEquipment(definition.scroll).ok)return false;
  return game.craftEquipment(code).ok;
 }
 for(let frame=0;frame<(options.endless?12000:5100)&&state.phase==='playing';frame++){
  if(state.elapsed>=lastDecision){
   lastDecision=state.elapsed+(options.decisionInterval??2);
   const main=state.towers[0];
   const credentialCode=main&&game.credentials[main.code];
   let credential=state.towers.find(tower=>tower.code===credentialCode);
   if(main&&!credential&&!main.awakened&&state.wave>=25&&!state.cards.some(card=>card.code===credentialCode)){
    const materials=state.cards.filter(card=>definitions.get(card.code).population===1).slice(0,5);
    if(materials.length===5)game.exchangeR(credentialCode,materials.map(card=>card.id));
   }
   const room=state.capacity-state.populationUsed;
   if(state.starter==='deployed'&&(room>0&&!state.cards.some(card=>game.canDeploy(card.id).ok)||state.wave>=18&&!credential&&!main?.awakened&&room>0&&!state.cards.some(card=>card.code===credentialCode)&&state.cards.length<5)){
    const tier=state.wave>=22&&room>=3&&!options.noEpic&&state.gold>=750?'SSR':state.wave>=(style==='magic'?7:10)&&room>=2&&state.gold>=450?'SR':'R';
    buyPack(tier);
   }
   for(const card of [...state.cards].sort((a,b)=>Number(b.code===credentialCode)-Number(a.code===credentialCode)||score(b.code)-score(a.code))){
    if(!game.canDeploy(card.id).ok)continue;
    const position=bestPosition(game,card);
    if(position)game.deploy(card.id,position.x,position.y);
   }
   if(options.challenges&&!state.challenge&&state.enemies.length<12){
    const current=game.challenges.find(c=>c.wave<=state.wave&&!state.usedChallenges.includes(c.code));
    if(current)game.startChallenge(current.code);
   }
   if(options.goldPriority||state.goldRush){
    for(const t of state.towers.filter(t=>definitions.get(t.code).damage)){
     const priority=options.goldPriority&&state.goldRush?'gold':'default';
     if(t.priority!==priority)game.setPriority(t.id,priority);
    }
   }
   if(main&&room===0&&!main.awakened&&!credential&&state.wave>=22&&state.cards.some(card=>card.code===credentialCode)){
    const extra=state.towers.filter(t=>t!==main&&!t.equipment.length).sort((a,b)=>score(a.code)-score(b.code))[0];
    if(extra)game.sell(extra.id);
   }
   if(main){
    credential=state.towers.find(tower=>tower.code===credentialCode);
    if(credential&&game.canBreakthrough(main.id,credential.id).ok&&game.breakthrough(main.id,credential.id).ok)first.breakthrough??=state.wave;
    const physical=definitions.get(main.code).damageType==='physical';
    const [white,green,blue,orange]=physical?['blade','repeater','splitter','arbalest']:['crystal','focus','embers','furnace'];
    const worn=new Set(main.equipment.map(item=>item.code));
    if(state.wave<3&&!worn.has(white)&&state.gold>=185){
     const bought=game.buyEquipment(white);
     if(bought.ok)game.equip(main.id,bought.itemId);
    }
    const target=main.awakened&&state.wave>=25&&!worn.has(orange)?orange:state.wave>=12&&!worn.has(blue)?blue:state.wave>=3&&!worn.has(green)?green:null;
    if(target&&(state.populationUsed===state.capacity||state.gold>=300)){
     if(!state.inventory.some(item=>item.code===target))buildEquipment(target);
     const item=state.inventory.find(item=>item.code===target);
     if(item&&game.equip(main.id,item.id).ok)first[game.equipment[target].grade]??=state.wave;
    }
    if(state.wave>=20&&state.gold>=500&&first.SR===undefined&&style==='magic')buyPack('SR');
    if(state.wave>=32&&state.gold>=1150&&first.SSR===undefined&&style==='physical'&&!options.noEpic)buyPack('SSR');
   }
  }
  game.tick(.5);
  peak=Math.max(peak,state.enemies.filter(e=>e.special!=='gold').length);
  for(const e of game.drainEvents())if(e.type==='wave'&&[5,10,15,20,25,30,35,40,45,50].includes(e.amount))milestones.push({wave:e.amount,gold:state.gold,population:state.populationUsed,levels:state.towers.map(t=>t.code+':'+t.level),peak});
  if(options.stopAtWave&&state.wave>=options.stopAtWave)break;
  if(options.endless&&state.phase==='victory'){game.continueEndless();endlessWave=state.wave;}
  if(state.endless)endlessWave=state.wave;
  if(state.endless&&state.wave>=115)break;
 }
 return {seed,style,outcome:state.phase,wave:state.wave,elapsed:Math.round(state.elapsed),peak,endlessWave,gold:state.gold,
  towers:state.towers.length,milestones,first,challenges:state.completedChallenges.length,
  goldRush:state.ledger.filter(entry=>entry.reason==='gold-rush').reduce((n,entry)=>n+entry.amount,0),reconciled:80+state.ledger.reduce((sum,e)=>sum+e.amount,0)===state.gold,game};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const seeds=process.argv.includes('--quick')?[1]:Array.from({length:10},(_,i)=>i+1);
 for(const style of ['physical','magic'])for(const seed of seeds){
  const {game,...report}=playLoopStrategy(seed,style,{noEpic:process.argv.includes('--no-epic'),endless:process.argv.includes('--endless'),challenges:process.argv.includes('--challenges'),goldPriority:process.argv.includes('--gold-priority')});
  console.log(JSON.stringify(report));
 }
}
