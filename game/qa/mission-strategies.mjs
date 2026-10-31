// Default-resource public-command strategies, used by checks and offline frames.
import {createGame} from '../engine.js';
import {pointOnEscortRoute} from '../escort-geometry.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function playMission(mode,onFrame=()=>{},step=.5){
 if(!['maze','escort'].includes(mode))throw Error('Expected maze or escort');
 const game=createGame({mode}),state=game.state;game.start();let moves=0,repairs=0,secondWall=0;
 if(mode==='maze'){
  for(const y of [130,198,266,334,402,470])game.build(450,y,'WALL');
  game.build(380,560,'T06');game.build(570,560,'T01');
 }else{
  for(const [x,y]of[[185,585],[491,317],[493,475],[802,531]])if(!game.build(x,y,'T01').ok)throw Error('Opening placement rejected');
  game.toggleConvoy();
 }
 for(let count=0;state.phase==='playing'&&count<Math.ceil(1200/step);count++){
  if(mode==='maze'){
   if(!state.tech.reinforcement)game.startResearch('reinforcement');
   else if(state.towers.some(t=>t.level===1)){game.upgrade(state.towers.find(t=>t.level===1).id);}
   else if(secondWall<6){if(game.build(850,[670,602,534,466,398,330][secondWall],'WALL').ok)secondWall++;}
   else if(state.towers.length<3)game.build(780,230,'T06');
   else if(state.towers.length<4)game.build(980,230,'T01');
   else if(state.tech.reinforcement===1)game.startResearch('reinforcement');
   else if(state.towers.some(t=>t.level===2))game.upgrade(state.towers.find(t=>t.level===2).id);
   else if(!state.tech.deployment)game.startResearch('deployment');
   else if(state.towers.length<5)game.build(670,410,'T03');
   else if(state.tech.reinforcement===2)game.startResearch('reinforcement');
   else if(state.towers.some(t=>t.level===3))game.upgrade(state.towers.find(t=>t.level===3).id);
  }else{
   if(!state.convoy.moving)game.toggleConvoy();
   if(state.convoy.progress>2200&&state.coreHealth<30&&state.gold>=60){game.toggleConvoy();if(game.repairConvoy().ok)repairs++;game.toggleConvoy();}
   if(!state.tech.reinforcement&&state.gold>=125&&!state.research)game.startResearch('reinforcement');
   if(state.tech.reinforcement)for(const tower of state.towers)if(tower.level<2&&state.gold>=140)game.upgrade(tower.id);
   const center=pointOnEscortRoute(state.convoy.progress+289);
   for(const tower of state.towers){
    if(distance(tower,state.convoy)<228)continue;
    // Retain coverage of any upcoming segment before spending to move a tower.
    if(Array.from({length:Math.ceil((2480-state.convoy.progress)/50)},(_,i)=>pointOnEscortRoute(state.convoy.progress+i*50)).some(point=>distance(point,tower)<190))continue;
    let best=null,bestScore=-Infinity;
    for(let x=center.x-200;x<=center.x+200;x+=25)for(let y=center.y-175;y<=center.y+175;y+=25){
     if(!game.canRelocate(tower.id,x,y).ok)continue;
     const point={x,y};let score=-distance(point,center)-.2*distance(point,state.convoy);
     for(const enemy of state.enemies)if(distance(point,enemy)<180)score+=35;
     if(score>bestScore){best={x,y};bestScore=score;}
    }
    if(best&&distance(best,center)<distance(tower,center)-35&&game.relocate(tower.id,best.x,best.y).ok)moves++;
   }
  }
  const events=game.drainEvents();game.tick(step);onFrame(state,[...events,...game.drainEvents()]);
  if(state.gold<0)throw Error('Strategy overspent');
 }
 return {state,moves,repairs};
}
