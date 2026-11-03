import {createGame} from '../engine.js';
import {ROAD_SEGMENTS,placementStatus} from '../geometry.js';
let seed;
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const samples=ROAD_SEGMENTS.flatMap(r=>Array.from({length:Math.ceil(Math.hypot(r.x2-r.x1,r.y2-r.y1)/20)},(_,i)=>{const f=i/Math.ceil(Math.hypot(r.x2-r.x1,r.y2-r.y1)/20);return {x:r.x1+(r.x2-r.x1)*f,y:r.y1+(r.y2-r.y1)*f,weight:r.x1===640||r.y1===400?3:1};}));
function position(g,code){const def=g.catalog.find(t=>t.code===code);let best=null;
 const active=g.state.towers.map(t=>({...t,...g.statsFor(t)}));
 const weights=samples.map(p=>p.weight/(1+active.filter(t=>t.damage>0&&Math.hypot(t.x-p.x,t.y-p.y)<t.range).length*.5));
 for(let y=120;y<=680;y+=20)for(let x=130;x<=1150;x+=20){if(!placementStatus(x,y,g.state.towers).ok)continue;const range=def.range;
  let score=0;for(const [i,p] of samples.entries())if(Math.hypot(x-p.x,y-p.y)<=range)score+=weights[i];
  if(def.role==='support')score=active.filter(t=>t.damage>0&&Math.hypot(t.x-x,t.y-y)<range).length*100;
  if(!best||score>best.score)best={x,y,score};
 }return best;
}
export function playLoopStrategy(seedValue=1,style='physical',options={}){
 seed=seedValue;const g=createGame({random});g.start();const s=g.state;let peak=0;
 const order=style==='mono'?Array(12).fill('T01'):style==='physical'?['T01','T12','T06','T01','T03','T09','T07','T13','T10','T02','T14','T03']:['T13','T06','T01','T13','T03','T09','T05','T02','T08','T07','T10','T04'];
 const routes=style==='physical'?{T01:'A',T12:'A',T06:'A',T03:'A',T09:'A',T07:'B',T13:'B',T10:'B',T02:'A',T14:'A'}:{T13:'A',T06:'B',T01:'B',T03:'A',T09:'B',T05:'A',T02:'B',T08:'B',T07:'A',T10:'A',T04:'A'};
 const goals=[...order.slice(0,4).map(code=>['build',code]),['research','reinforcement',1],['upgrade',0,2],['upgrade',2,2],['research','deployment',1],['build',order[4]],['build',order[5]],['upgrade',4,2],['research','reinforcement',2],['upgrade',0,3],['upgrade',4,3],['upgrade',2,3],['research','deployment',2],['build',order[6]],['build',order[7]],['research','reinforcement',3],['upgrade',0,4],['upgrade',4,4],['upgrade',2,4],['research','reinforcement',4],['upgrade',0,5],['upgrade',4,5],['research','deployment',3],['build',order[8]],['build',order[9]],['upgrade',6,2],['upgrade',6,3],['upgrade',7,2],['upgrade',7,3],['upgrade',2,5]];
 const initialGold=s.gold,income={kills:0,supply:0,clear:0},spent={build:0,research:0,upgrade:0};let goal=0,nextActionAt=0;const milestones=[];
 for(let frame=0;frame<2200&&s.phase==='playing';frame++){
  const beforeGold=s.gold,decisionReady=s.elapsed>=nextActionAt,action=goals[goal];if(action&&decisionReady){const [kind,arg,target]=action;
   if(kind==='build'&&g.canBuildType(arg).ok){const p=position(g,arg);if(p&&g.build(p.x,p.y,arg).ok)goal++;}
   if(kind==='research'){if(s.tech[arg]>=target)goal++;else if(!s.research)g.startResearch(arg);}
   if(kind==='upgrade'){const t=s.towers[arg];if(t.level>=target)goal++;else if(!t.upgrading)g.upgrade(t.id,t.level===2?routes[t.code]||'A':null);}
  }
  if(action&&beforeGold>s.gold){spent[action[0]]+=beforeGold-s.gold;nextActionAt=s.elapsed+(options.decisionInterval??.5);}
  for(const t of s.towers)if(decisionReady&&g.statsFor(t).damage>0){const priority=t.route==='A'&&['T01','T13','T04'].includes(t.code)?'strongest':s.enemies.some(e=>e.support)?'support':t.code==='T03'?'default':'weakest';if(t.priority!==priority)g.setPriority(t.id,priority);}
  g.tick(.5);for(const e of g.drainEvents()){if(e.type==='kill')income.kills+=e.amount;if(e.type==='income')income.supply+=e.amount;if(e.type==='wave-clear')income.clear+=e.amount;if(e.type==='wave')milestones.push({wave:s.wave,elapsed:Math.round(s.elapsed),towers:s.towers.length,gold:s.gold,tech:{...s.tech},kills:s.kills,spent:{...spent}});}peak=Math.max(peak,s.enemies.length);if(options.stopAtWave&&s.wave>=options.stopAtWave)break;
 }
 return {seed:seedValue,style,decisionInterval:options.decisionInterval??.5,milestones,outcome:s.phase,wave:s.wave,elapsed:Math.round(s.elapsed),peak,gold:s.gold,towers:s.towers.length,levels:s.towers.map(t=>`${t.code}:${t.level}${t.route||''}`),tech:{...s.tech},goal,income,spent,initialGold,reconciled:initialGold+income.kills+income.supply+income.clear-spent.build-spent.research-spent.upgrade===s.gold,game:g};
}
export function compareEndlessSupply(seedValue=1){
 const results=[];
 for(const count of [0,1,3]){
  const {game:g}=playLoopStrategy(seedValue,'physical'),s=g.state;if(s.phase!=='victory')throw new Error('Normal game must finish before endless');g.continueEndless();
  for(let i=0;i<count;i++){
   const unit=s.towers.filter(t=>!t.upgrading&&g.statsFor(t).damage>0).sort((a,b)=>a.level-b.level||a.id-b.id)[0];if(!g.sell(unit.id).ok)throw new Error('Cannot free supply capacity');
   const p=position(g,'T11');if(!p||!g.build(p.x,p.y,'T11').ok)throw new Error('Cannot build supply');
  }
  const startGold=s.gold,start=s.elapsed;
  for(let i=0;i<14400&&s.phase==='playing';i++){g.tick(.25);g.drainEvents();}
  results.push({seed:seedValue,supplies:count,phase:s.phase,wave:s.wave,endlessSeconds:Math.round(s.elapsed-start),kills:s.endlessKills,supplyIncome:s.endlessSupply,gold:s.gold,startGold,cap:Math.floor(s.endlessKills/10),capRespected:s.endlessSupply<=Math.floor(s.endlessKills/10),reconciled:s.gold===startGold+s.endlessKills+s.endlessSupply});
 }return results;
}
if(import.meta.url===`file://${process.argv[1]}`){
 if(process.argv.includes('--endless')){const rows=compareEndlessSupply();console.log(JSON.stringify(rows,null,2));process.exitCode=rows.every(r=>r.capRespected&&r.reconciled)?0:1;}
 else {const results=[];for(const style of process.argv.includes('--pressure')?['mono']:['physical','magic'])for(const n of process.argv.includes('--pressure')?[1,2,3]:[1,2,3,4,5,6,7,8,9,10]){const {game,...row}=playLoopStrategy(n,style,process.argv.includes('--early')?{decisionInterval:20,stopAtWave:10}:{});results.push(row);console.log(JSON.stringify(row));}process.exitCode=results.every(r=>(process.argv.includes('--early')?r.wave===10&&r.towers>=6:r.outcome==='victory')&&r.reconciled)?0:1;}
}
