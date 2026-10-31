import {createLegionGame} from '../legion-session.js';

// Public commands and public own-side state only. No balance/test overrides.
export function playLegionMatch(seed=42,options={}){
 const game=createLegionGame({seed});game.start();
 const positions=[[600,370],[680,370],[595,510],[680,510],[510,430],[770,430],[510,550],[770,550],[430,400],[850,400],[430,540],[850,540],[350,400],[930,400],[350,550],[930,550],[270,400],[1010,400],[270,550],[1010,550]];
 game.build(...positions[0],'T01');game.build(...positions[1],'T01');game.build(...positions[2],'T04');game.build(...positions[3],'T02');
 for(let round=0;round<60&&game.state.phase==='playing';round++){
  const side=game.state.sides.player;
  if(options.workers&&round>=2&&side.workers<(round>=6?4:3)&&side.gold>=60)game.buyWorker();
  if(!side.research){
   if(side.tech.reinforcement<1||(side.tech.reinforcement<4&&side.tech.deployment>=1&&side.fighters.length>=6))game.startResearch('reinforcement');
   if(!side.research&&side.tech.deployment<3)game.startResearch('deployment');
  }
  for(const fighter of side.fighters.slice().sort((a,b)=>(b.kind==='splash'?1:0)-(a.kind==='splash'?1:0)))game.upgrade(fighter.id);
  while(side.fighters.length<positions.length){const n=side.fighters.length;const built=game.build(...positions[n],n%3===0?'T01':'T03');if(!built.ok)break;}
  if(side.king.hp<700)game.upgradeKing();
  // Save a coordinated armored push rather than feeding one raider every round.
  if(round%4===3||round>16)while(game.queueMercenary('X08').ok){/* normal queue cap */}
  game.startCombat();
  if(options.onFrame){
   for(let frame=0;frame<12000&&game.state.phase==='playing'&&game.state.turnPhase==='combat';frame++){game.tick(.05);options.onFrame(game.state,game.drainEvents());}
  }else game.tick(600);
  if(game.state.turnPhase==='combat'&&game.state.phase==='playing')throw new Error(`Stalled round ${round+1}`);
 }
 return {game,outcome:game.state.phase,wave:game.state.wave,playerHp:game.state.sides.player.king.hp,aiHp:game.state.sides.ai.king.hp,ledger:{player:game.state.sides.player.ledger.map(entry=>({...entry})),ai:game.state.sides.ai.ledger.map(entry=>({...entry}))}};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const {outcome,wave,playerHp,aiHp}=playLegionMatch(Number(process.argv[2]||42));console.log(JSON.stringify({outcome,wave,playerHp,aiHp}));if(outcome!=='victory')process.exitCode=1;
}
