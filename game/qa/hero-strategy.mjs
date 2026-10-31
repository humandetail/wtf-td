import {createHeroGame} from '../hero-session.js';
import {HERO_ROUTES,HERO_GODDESS} from '../hero-geometry.js';
import {effectiveTowerStats} from '../catalog.js';
import {pathToFileURL} from 'node:url';
export function runHeroStrategy({camp=false,useShield=true,onFrame}={}){
 const game=createHeroGame(),s=game.state;game.start();let moves=0,casts=0,researches=0,builds=0;const skills={Q:0,E:0,R:0};const shields=[];const positions=[];let campStage=0,equipmentUpgrades=0,shieldDamageAbsorbed=0;const equipmentTransactions=[];const qCooldowns=new Set();const campRoute=[{x:220,y:450},{x:220,y:300},{x:220,y:450},{x:640,y:470}];
 for(let x=440;x<=840;x+=20)for(let y=310;y<=590;y+=20){if(game.canBuild(x,y,'T06').ok){let score=0;for(const r of HERO_ROUTES)for(let i=1;i<r.points.length;i++){const [ax,ay]=r.points[i-1],[bx,by]=r.points[i];for(let t=0;t<=1;t+=.05)if(Math.hypot(x-ax-(bx-ax)*t,y-ay-(by-ay)*t)<205)score++;}positions.push({x,y,score});}}
 positions.sort((a,b)=>b.score-a.score);
 for(let frame=0;frame<24000&&s.phase==='playing';frame++){
  if(!s.research){const kind=s.tech.deployment<1?'deployment':s.tech.reinforcement<3?'reinforcement':s.tech.deployment<2?'deployment':null;if(kind&&game.startResearch(kind).ok)researches++;}
  if(s.towers.length<8){const code=s.tech.deployment>=1&&s.towers.length>=2?'T03':'T06';for(const p of positions)if(game.build(p.x,p.y,code).ok){builds++;break;}}
  for(const t of s.towers)game.upgrade(t.id);
  if(camp&&s.pendingCampReward?.kind==='equipment')game.chooseCampReward('core');if(camp){const gold=s.gold;if(game.upgradeEquipment().ok){equipmentUpgrades++;equipmentTransactions.push({heroLevel:s.hero.level,equipmentLevel:s.hero.equipment.level,cost:gold-s.gold});}}
  if(s.hero.alive){const h=s.hero,enemy=s.enemies.filter(e=>!e.campId).sort((a,b)=>a.remaining-b.remaining)[0];const telegraph=s.telegraphs.find(t=>Math.hypot(t.x-h.x,t.y-h.y)<t.radius+25);
   if(camp&&campStage<campRoute.length){const p=campRoute[campStage];if(Math.hypot(h.x-p.x,h.y-p.y)<6){if(campStage!==1||s.camps[0].cleared)campStage++;else {game.setMoveVector(0,0);const elite=s.enemies.find(e=>e.campId==='west');if(elite&&game.castSkill('Q',elite.x,elite.y).ok){casts++;skills.Q++;qCooldowns.add(Number(h.skillCooldowns.Q.toFixed(2)));}}}else{game.moveHeroTo(p.x,p.y);moves++;}}
   else if(telegraph){if(game.castSkill('E',h.x+170,h.y).ok){casts++;skills.E++;}game.setMoveVector(1,0);moves++;}
   else if(enemy){const d=Math.hypot(enemy.x-h.x,enemy.y-h.y);if(d>80){game.moveHeroTo(enemy.x,enemy.y);moves++;}else game.setMoveVector(0,0);if(d<270&&game.castSkill('Q',enemy.x,enemy.y).ok){casts++;skills.Q++;qCooldowns.add(Number(h.skillCooldowns.Q.toFixed(2)));}if(useShield&&h.level>=6&&s.coreHealth<95){const health=s.coreHealth;if(game.castSkill('R',HERO_GODDESS.x,HERO_GODDESS.y).ok){casts++;skills.R++;shields.push({healthBefore:health,healthAfter:s.coreHealth,coreShield:s.coreShield,heroShield:h.shield,expiresIn:s.coreShieldUntil-s.elapsed,castDistance:Math.hypot(h.x-640,h.y-650)});}}}
   else {game.moveHeroTo(640,470);moves++;}
  }
  const shieldBefore=s.coreShield,shieldUntil=s.coreShieldUntil;game.tick(.1);if(shieldUntil>s.elapsed)shieldDamageAbsorbed+=Math.max(0,shieldBefore-s.coreShield);const events=game.drainEvents();onFrame?.(s,events);
 }
 return {phase:s.phase,wave:s.wave,coreHealth:s.coreHealth,level:s.hero.level,gold:s.gold,elapsed:s.elapsed,moves,casts,skills,shields,researches,builds,campsCleared:s.camps.filter(c=>c.cleared).length,equipment:s.hero.equipment,equipmentUpgrades,equipmentTransactions,qCooldowns:[...qCooldowns],shieldDamageAbsorbed,towers:s.towers.map(t=>({code:t.code,x:t.x,y:t.y,level:t.level,damage:effectiveTowerStats(t,s.towers).damage}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const outcome=runHeroStrategy({camp:process.argv.includes('--camp')});console.log(JSON.stringify(outcome,null,2));if(outcome.phase!=='victory')process.exitCode=1;}
