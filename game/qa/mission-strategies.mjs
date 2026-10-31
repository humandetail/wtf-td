// Repeatable public-command playthroughs with default resources and enemy stats.
import {createGame} from '../engine.js';

export function playMission(mode,onFrame=()=>{},step=.5){
 if(!['harvest','storm'].includes(mode))throw Error('Expected harvest or storm');
 const game=createGame({mode}),state=game.state;
 game.start();
 for(const [x,y,code] of [[500,280,'T06'],[780,450,'T06'],[500,450,'T01']]){
  if(!game.build(x,y,code).ok)throw Error('Opening placement rejected');
 }
 const stormActions=[
  ['r','reinforcement'],['u',1],['u',2],['u',3],['r','deployment'],['b',780,280,'T03'],
  ['r','reinforcement'],['u',1],['u',2],['u',4],['b',400,280,'T03'],['b',880,450,'T03'],
  ['u',5],['u',6],['u',5],['u',6],['r','reinforcement'],
 ];
 const expansion=[[780,280,'T03'],[400,280,'T11'],[880,280,'T03'],[400,450,'T03'],[880,450,'T03']];
 let action=0,pulses=0,steps=0;
 while(state.phase==='playing'&&steps++<Math.ceil(1000/step)){
  if(mode==='harvest'){
   if(state.extractionRemaining===null){
    if(state.harvested>=240)game.evacuate();
    else if(!state.harvest)game.startHarvest(state.deposits.findIndex(count=>count>0));
   }
   if(!state.tech.reinforcement)game.startResearch('reinforcement');
   else if(state.towers[0].level<2)game.upgrade(1);
   else if(!state.tech.deployment)game.startResearch('deployment');
   else if(action<expansion.length){const [x,y,code]=expansion[action];if(game.build(x,y,code).ok)action++;}
   else {
    const tower=state.towers.find(tower=>tower.level<=state.tech.reinforcement);
    if(tower)game.upgrade(tower.id);else if(state.tech.reinforcement<4)game.startResearch('reinforcement');
   }
  }else{
   const next=stormActions[action];
   if(next){
    const result=next[0]==='r'?game.startResearch(next[1]):next[0]==='u'?game.upgrade(next[1]):game.build(next[1],next[2],next[3]);
    if(result.ok)action++;
   }else{
    const tower=state.towers.filter(tower=>game.canUpgrade(tower.id).ok).sort((a,b)=>a.level-b.level)[0];
    if(tower)game.upgrade(tower.id);else if(!state.research)game.startResearch('reinforcement');
   }
   if(state.pulseRemaining<=1e-9&&state.enemies.length>=14&&game.overloadPulse().ok)pulses++;
  }
  const commands=game.drainEvents();
  game.tick(step);
  onFrame(state,[...commands,...game.drainEvents()]);
  if(state.gold<0)throw Error('Strategy overspent earned funds');
 }
 return {state,pulses};
}
