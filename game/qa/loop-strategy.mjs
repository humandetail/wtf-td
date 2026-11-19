import {createGame} from '../engine.js';
import {LOOP_RARITY} from '../loop-equipment.js';
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
 const trace=options.trace;
 const game=createGame({random:seeded(Math.imul(seed,0x9e3779b1)),draftRandom:seeded(Math.imul(seed,0x85ebca6b)+1000),enemyHealthScale:options.enemyHealthScale,
  ...(options.noEpic?{towerFilter:t=>t.rarity!=='epic'}:{})});
 const state=game.state,milestones=[];
 const strategy=options.strategy??'gear';
 const seekEpic=strategy==='epic'&&!options.noEpic;
 const orders=preferred[style]??preferred.physical;
 const definitions=new Map(game.catalog.map(item=>[item.code,item]));
 const rPopulation=game.catalog.find(t=>t.rarity==='common').population;
 const heroPopulation=game.catalog.find(t=>t.rarity==='rare').population;
 const score=code=>{
  const t=definitions.get(code),position=orders.indexOf(code);
  const copies=state.towers.filter(x=>x.code===code).length;
  if(!t.damage)return (['T09','T10','T22','T36'].includes(code)&&!copies?32:6)-copies*20;
  return (position<0?22:60-position*2)/Math.sqrt(t.population/rPopulation)-copies*8;
 };
 let lastDecision=-1,peak=0,endlessWave=0,postTwentyPeak=0,epicId=null,epicFoughtLate=false;
 const first={};
 function act(command,...args){
  const result=game[command](...args);
  if(result?.ok)trace?.push({at:state.elapsed,command,args});
  return result;
 }
 act('start');act('openStarter');
 function buyPack(tier) {
  const purchase=act('draw',tier);
  if(!purchase.ok)return false;
  first[tier]??=state.wave;
  const {rarity}=definitions.get(state.cards.find(card=>card.id===purchase.cardId).code);
  first[LOOP_RARITY[rarity]+'Result']??=state.wave;
  return true;
 }
 function buildEquipment(code) {
  const definition=game.equipment[code];
  if(!definition.components)return act('buyEquipment',code).ok;
  const reserved=new Set();
  for(const component of definition.components){
   let available=state.inventory.find(item=>item.code===component&&!reserved.has(item.id));
   if(!available){
    if(!buildEquipment(component))return false;
    available=state.inventory.find(item=>item.code===component&&!reserved.has(item.id));
   }
   if(!available)return false;
   reserved.add(available.id);
  }
  if(!state.inventory.some(item=>item.code===definition.scroll)&&!act('buyEquipment',definition.scroll).ok)return false;
  return act('craftEquipment',code).ok;
 }
 function equip(tower,code){
  if(tower.equipment.some(item=>item.code===code))return false;
  if(!state.inventory.some(item=>item.code===code)&&!buildEquipment(code))return false;
  const item=state.inventory.find(item=>item.code===code);
  if(!item||!act('equip',tower.id,item.id).ok)return false;
  first[game.equipment[code].grade]??=state.wave;
  return true;
 }
 function gearFor(tower){
  return definitions.get(tower.code).damageType==='magic'
   ?['crystal','focus','embers','furnace']:['blade','repeater','splitter','arbalest'];
 }
 for(let frame=0;frame<(options.endless?12000:5600)&&state.phase==='playing';frame++){
  if(state.elapsed>=lastDecision){
   lastDecision=state.elapsed+(options.decisionInterval??2);
   if(!options.freezeAtWave||state.wave<=options.freezeAtWave){
    const starter=state.towers[0];
    const rivals=state.towers.filter(t=>t!==starter&&definitions.get(t.code).damage>0);
    const epic=state.towers.find(t=>t.id===epicId);
    const main=epic&&definitions.get(epic.code).damage>0?epic:starter;
    const credentialCode=main&&game.credentials[main.code];
    let credential=state.towers.find(tower=>tower.code===credentialCode&&!tower.qualifiedUsed);
    const pending=()=>state.cards.find(card=>card.code===credentialCode);
    if(main&&!credential&&!main.awakened&&state.wave>=game.exchangeWave&&!pending()){
     const materials=state.cards.filter(card=>definitions.get(card.code).rarity==='common').slice(0,5);
     if(materials.length===5)act('exchangeR',credentialCode,materials.map(card=>card.id));
    }
    if(credential&&act('breakthrough',main.id,credential.id).ok)first.breakthrough??=state.wave;

    const pressure=state.enemies.filter(enemy=>enemy.special!=='gold').length;
    const room=()=>state.capacity-state.populationUsed;
    const pursuingEpic=seekEpic&&!epic&&state.wave>=11;
    const seekingCredential=main&&!credential&&!pending()&&!main.awakened&&(!pursuingEpic||state.wave>=32)&&state.wave>=(strategy==='credential'?7:15);
    const playable=state.cards.some(card=>game.canDeploy(card.id).ok);
    const desiredR=options.onlyR?Infinity:state.wave<10?3:state.wave<17?5:state.wave<25?7:Infinity;
    const commons=state.towers.filter(t=>definitions.get(t.code).rarity==='common').length;
    if(starter&&room()>=rPopulation){
     if(pursuingEpic&&room()>=heroPopulation&&state.gold>=game.shopPacks.find(pack=>pack.tier==='SSR').price&&
        !state.cards.some(card=>definitions.get(card.code).rarity==='epic'))buyPack('SSR');
     else if(seekingCredential&&(!playable||strategy==='credential')&&state.gold>=(strategy==='credential'?120:360))buyPack('R');
     else if(!playable&&(!pursuingEpic||pressure>=34||state.wave<15)&&commons<desiredR&&
        (commons<2||pressure>=30||state.gold>=180||options.onlyR)) {
      const heroes=state.towers.length-commons;
      const wantSR=!options.onlyR&&!pursuingEpic&&state.wave>=14&&heroes<3&&room()>=heroPopulation&&state.gold>=450&&commons>=3;
      buyPack(wantSR?'SR':'R');
     }
    }
    for(const card of [...state.cards].sort((a,b)=>
      Number(definitions.get(b.code).rarity==='epic')-Number(definitions.get(a.code).rarity==='epic')||
      Number(b.code===credentialCode)-Number(a.code===credentialCode)||score(b.code)-score(a.code))){
     const kind=definitions.get(card.code);
     if(options.onlyR&&!card.starter&&kind.rarity!=='common')continue;
     if(!game.canDeploy(card.id).ok&&pursuingEpic&&kind.rarity==='epic'){
      for(const extra of [...rivals].filter(t=>t!==credential&&definitions.get(t.code).rarity==='common')
        .sort((a,b)=>score(a.code)-score(b.code))){
       if(room()>=kind.population)break;
       act('sell',extra.id);
      }
     }
     if(!game.canDeploy(card.id).ok)continue;
     if(pursuingEpic&&kind.rarity!=='epic'&&room()-kind.population<heroPopulation&&pressure<34)continue;
     if(seekingCredential&&card.code!==credentialCode&&kind.rarity==='common'&&commons>=desiredR&&pressure<34)continue;
     const position=bestPosition(game,card);
     if(!position)continue;
     const deployment=act('deploy',card.id,position.x,position.y);
     if(deployment.ok&&kind.rarity==='epic'){
      epicId??=deployment.towerId;
      first.epicDeployment??=state.wave;
     }
    }
    if(options.challenges&&!state.challenge&&pressure<12){
     const current=game.challenges.find(c=>c.wave<=state.wave&&!state.usedChallenges.includes(c.code));
     if(current)act('startChallenge',current.code);
    }
    if(main&&!options.onlyR){
     const [,green,blue,orange]=gearFor(main);
     if(state.wave>=3&&(!pursuingEpic||state.wave<12||pressure>=34)&&
        (strategy!=='credential'||state.gold>=220||pressure>=20)){
      if(!main.equipment.some(item=>item.code===green))equip(main,green);
      if(state.wave>=12&&(!seekingCredential||strategy!=='credential'||pressure>=34))equip(main,blue);
      if(main.awakened&&state.wave>=25)equip(main,orange);
     }
     if(state.wave>=19&&!pursuingEpic){
      const second=[...rivals,starter].filter(t=>t!==main&&t.equipment.length<3)
        .sort((a,b)=>Number(definitions.get(b.code).rarity!=='common')-Number(definitions.get(a.code).rarity!=='common')||score(b.code)-score(a.code));
      for(const tower of second.slice(0,3)){
       if(state.gold<350)break;
       const [,base,improved]=gearFor(tower);
       equip(tower,base);
       if(state.wave>=28&&state.gold>=425)equip(tower,improved);
      }
      if(state.wave>=21&&state.gold>=350){
       if(!main.equipment.some(item=>item.code==='gear')&&
         !main.equipment.some(item=>game.equipment[item.code]?.rate))equip(main,'gear');
       if(state.wave>=26)equip(main,'siege');
      }
     }
    }
   }
   const priority=options.goldPriority!==false&&state.goldRush?'gold':'default';
   for(const tower of state.towers.filter(t=>definitions.get(t.code).damage)){
    if(tower.priority!==priority)act('setPriority',tower.id,priority);
   }
  }
  game.tick(.5);
  if(epicId!==null&&state.wave>=26&&!epicFoughtLate){
   epicFoughtLate=state.towers.some(t=>t.id===epicId&&t.combatUntil>state.elapsed);
  }
  const inPlay=state.enemies.filter(e=>e.special!=='gold').length;
  peak=Math.max(peak,inPlay);
  if(state.wave>=20)postTwentyPeak=Math.max(postTwentyPeak,inPlay);
  for(const e of game.drainEvents())if(e.type==='wave'&&[5,10,15,20,25,30,35,40,45,50].includes(e.amount))milestones.push({wave:e.amount,gold:state.gold,population:state.populationUsed,levels:state.towers.map(t=>t.code+':'+t.level),peak});
  if(options.stopAtWave&&state.wave>=options.stopAtWave)break;
  if(options.endless&&state.phase==='victory'){game.continueEndless();endlessWave=state.wave;}
  if(state.endless)endlessWave=state.wave;
  if(state.endless&&state.wave>=115)break;
 }
 const mainTower=state.towers.find(t=>t.id===epicId&&definitions.get(t.code).damage>0)??state.towers[0];
 const mainRarity=mainTower&&LOOP_RARITY[definitions.get(mainTower.code).rarity];
 return {seed,style,strategy,outcome:state.phase,wave:state.wave,elapsed:Math.round(state.elapsed),peak,postTwentyPeak,endlessWave,gold:state.gold,
  towers:state.towers.length,milestones,first,epicFoughtLate,mainRarity,mainCode:mainTower?.code,mainLevel:mainTower?.level,mainLastCombat:mainTower?.combatUntil,
  challenges:state.completedChallenges.length,
  goldRush:state.ledger.filter(entry=>entry.reason==='gold-rush').reduce((n,entry)=>n+entry.amount,0),reconciled:80+state.ledger.reduce((sum,e)=>sum+e.amount,0)===state.gold,game};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const seeds=process.argv.includes('--quick')?[1]:Array.from({length:10},(_,i)=>i+1);
 for(const strategy of ['gear','credential','epic','frozen','onlyR'])for(const seed of seeds){
  const {game,...report}=playLoopStrategy(seed,seed%2?'physical':'magic',{
   strategy:strategy==='frozen'||strategy==='onlyR'?'gear':strategy,
   freezeAtWave:strategy==='frozen'?20:0,onlyR:strategy==='onlyR',
   noEpic:strategy!=='epic'||process.argv.includes('--no-epic'),endless:process.argv.includes('--endless'),
   challenges:process.argv.includes('--challenges'),
  });
  console.log(JSON.stringify({...report,strategy}));
 }
}
