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
 const game=createGame({random:seeded(seed),draftRandom:seeded(seed+1000),
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
 game.start();
 for(let frame=0;frame<(options.endless?6500:4000)&&state.phase==='playing';frame++){
  if(state.elapsed>=lastDecision){
   lastDecision=state.elapsed+(options.decisionInterval??2);
   if(!state.draft&&state.populationUsed<state.capacity&&state.cards.length<2&&state.gold>=150)game.draw();
   if(state.draft){
    const index=state.draft.codes.map((code,i)=>({i,score:score(code)})).sort((a,b)=>b.score-a.score)[0].i;
    game.chooseCard(index);
   }
   for(const card of [...state.cards].sort((a,b)=>score(b.code)-score(a.code))){
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
   if(state.populationUsed<state.capacity&&state.cards.length===2&&state.cards.every(card=>!game.canDeploy(card.id).ok)){
    game.sellCard(state.cards.at(-1).id);
   }
   if((state.populationUsed===state.capacity||state.gold>=450)&&state.gold>=80){
    const candidates=state.towers.filter(t=>definitions.get(t.code).damage&&t.equipment.length<3)
     .sort((a,b)=>a.equipment.length-b.equipment.length||b.level-a.level);
    for(const tower of candidates){
     const owned=new Set(tower.equipment.map(e=>e.code));
     const targetCount=game.statsFor(tower).targetCount;
     const recipe=targetCount>1?'scatter':'siege';
     const components=game.equipment[recipe].components;
     const targets=owned.has(recipe)?['core','gear','lens']:components;
     const wanted=targets.find(code=>!owned.has(code));
     if(!wanted)continue;
     let component=state.inventory.find(e=>e.code===wanted);
     if(!component&&game.buyEquipment(wanted).ok)component=state.inventory.at(-1);
     if(!component||!game.equip(tower.id,component.id).ok)continue;
     const parts=components.map(code=>tower.equipment.find(e=>e.code===code));
     if(!owned.has(recipe)&&parts.every(Boolean)&&state.gold>=60)game.craft(parts[0].id,parts[1].id,tower.id);
     break;
    }
   }
  }
  game.tick(.5);
  peak=Math.max(peak,state.enemies.filter(e=>e.special!=='gold').length);
  for(const e of game.drainEvents())if(e.type==='wave'&&[5,10,15,20].includes(e.amount))milestones.push({wave:e.amount,gold:state.gold,population:state.populationUsed,levels:state.towers.map(t=>t.code+':'+t.level),peak});
  if(options.stopAtWave&&state.wave>=options.stopAtWave)break;
  if(options.endless&&state.phase==='victory'){game.continueEndless();endlessWave=20;}
  if(state.endless)endlessWave=state.wave;
  if(state.endless&&state.wave>=85)break;
 }
 return {seed,style,outcome:state.phase,wave:state.wave,elapsed:Math.round(state.elapsed),peak,endlessWave,gold:state.gold,
  towers:state.towers.length,milestones,challenges:state.completedChallenges.length,
  goldRush:state.ledger.filter(entry=>entry.reason==='gold-rush').reduce((n,entry)=>n+entry.amount,0),reconciled:450+state.ledger.reduce((sum,e)=>sum+e.amount,0)===state.gold,game};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const seeds=process.argv.includes('--quick')?[1]:Array.from({length:10},(_,i)=>i+1);
 for(const style of ['physical','magic'])for(const seed of seeds){
  const {game,...report}=playLoopStrategy(seed,style,{noEpic:process.argv.includes('--no-epic'),endless:process.argv.includes('--endless'),challenges:process.argv.includes('--challenges'),goldPriority:process.argv.includes('--gold-priority')});
  console.log(JSON.stringify(report));
 }
}
