import {createGemGame} from '../gem-session.js';
import {GEM_RECIPES,GEM_RULES} from '../gem-catalog.js';
import {gemPlacementStatus} from '../gem-geometry.js';
import {fileURLToPath} from 'node:url';
const priority={G01:6,G02:3,G03:7,G04:8,G05:1,G06:9};
// This player uses only paid commands and public state; no injected gold or tech.
export function playGem(seed=2026,{choice='balanced',recipeTarget=null,onFrame=null}={}){
 const game=createGemGame({seed});game.start();const s=game.state,initialGold=s.gold,log=[],commands=[],forges=[],shotsByCode={},echoes=[];
 const recipes=recipeTarget==='F05'?GEM_RECIPES.filter(r=>['F01','F03','F05'].includes(r.code)):GEM_RECIPES.filter(r=>r.code===recipeTarget);
 if(recipeTarget&&!recipes.length)throw Error('unknown recipe target');
 const act=(name,...args)=>{const gold=s.gold,kept=name==='keep'?{...s.draft.candidates[args[0]]}:null,result=game[name](...args);if(result.ok)commands.push({wave:s.wave,name,args,goldBefore:gold,goldAfter:s.gold,...(kept?{kept,towerId:result.towerId}:{}),...(['draw','reroll'].includes(name)?{candidates:s.draft.candidates.map(t=>({...t}))}:{})});return result;};
 const all=()=>[...s.towers,...s.inventory];
 function needs(){if(all().some(t=>t.code===recipeTarget))return [];return recipes.filter(r=>!all().some(t=>t.code===r.code)&&r.inputs.every(([code])=>code.startsWith('G'))).flatMap(r=>r.inputs).filter(([code,level])=>!all().some(t=>t.code===code&&t.level===level));}
 function forge(){if(all().some(t=>t.code===recipeTarget))return;for(const recipe of recipes){if(all().some(t=>t.code===recipe.code))continue;const used=[];for(const [code,level] of recipe.inputs){const t=all().find(t=>t.code===code&&t.level===level&&!used.includes(t));if(t)used.push(t);}
  if(used.length!==recipe.inputs.length)continue;
  // F05 consumes two crafted towers only after each fought at least one real round.
  if(recipe.code==='F05'&&used.some(t=>forges.find(f=>f.id===t.id)?.wave>=s.wave))continue;
  const materials=used.map(t=>({id:t.id,code:t.code,level:t.level}));
  const result=act('forge',recipe.code,used[0].id,used.slice(1).map(t=>t.id));if(result.ok)forges.push({code:recipe.code,id:used[0].id,wave:s.wave,materials});
 }}
 function spot(){
  // Cover the two parallel road sections from their shared firing corridor.
  for(const y of [270,510,570,235,450,710])for(const x of [640,530,750,420,860,310,970,1080])if(gemPlacementStatus(x,y,s.towers).ok)return {x,y};
  return null;
 }
 function merges(){
  let again=true;while(again){again=false;const all=[...s.towers,...s.inventory];
   for(const a of all){if(recipeTarget&&!all.some(t=>t.code===recipeTarget)&&a.level===2&&recipes.some(r=>!all.some(t=>t.code===r.code)&&r.inputs.some(([code,level])=>code===a.code&&level===a.level)))continue;const b=all.find(t=>t.id!==a.id&&t.code===a.code&&t.level===a.level);if(b&&act('merge',a.id,b.id).ok){again=true;break;}}
  }
 }
 function research(){
  if(s.research)return;
  let kind=recipeTarget&&s.tech.reinforcement<2?'reinforcement':s.tech.deployment<1?'deployment':s.tech.reinforcement<2?'reinforcement':s.tech.deployment<2?'deployment':s.tech.reinforcement<4?'reinforcement':s.tech.deployment<3?'deployment':null;
  if(kind)act('startResearch',kind);
 }
 function deploy(){for(const t of [...s.inventory]){const p=spot();if(p)act('deployInventory',t.id,p.x,p.y);}}
 while(s.phase==='playing'&&s.wave<GEM_RULES.waveCount){
  forge();merges();forge();deploy();
  while(s.draftCredits&&s.gold>=GEM_RULES.draftCost){
   if(!act('draw').ok)break;
   const existing=[...s.towers,...s.inventory];
   const rank=()=>s.draft.candidates.map((t,i)=>({i,t,score:(needs().some(([code,level])=>t.code===code&&t.level===level)?200:needs().some(([code,level])=>t.code===code&&t.level===level-1)?70:0)+((choice==='balanced'?priority[t.code]:10-priority[t.code])??0)*Math.pow(2,t.level-1)+(existing.some(a=>a.code===t.code&&a.level===t.level&&t.level<s.tech.reinforcement+1)?20:0)-(t.code==='G05'&&existing.some(a=>a.code==='G05')?10:0)})).sort((a,b)=>b.score-a.score);
   let ranked=rank();
   if(recipeTarget&&!all().some(t=>t.code===recipeTarget)&&(commands.every(c=>c.name!=='reroll')||ranked[0].score<60)&&s.gold>=140){if(act('reroll').ok)ranked=rank();}
   let p=spot();
   if(s.towers.length>=game.capacity()&&s.inventory.length>=2){
    const worst=[...existing].sort((a,b)=>game.statsFor(a).damage-game.statsFor(b).damage)[0];act('sell',worst.id);p=spot();
   }
   const destination=s.towers.length<game.capacity()&&p?p:{inventory:true};
   if(!act('keep',ranked[0].i,destination).ok)throw Error('strategy could not keep paid candidate');
   forge();merges();forge();deploy();
  }
  research();forge();const before=s.coreHealth;act('startCombat');let ticks=0;
  while(s.phase==='playing'&&s.turnPhase==='combat'&&ticks++<10000){game.tick(.5);const events=game.drainEvents();for(const event of events){if(event.type==='shot')shotsByCode[event.code]=(shotsByCode[event.code]||0)+1;if(event.type==='echo')echoes.push({wave:s.wave,...event});}onFrame?.(s,events);}
  if(ticks>=10000)throw Error('combat timeout');
  log.push({wave:s.wave,health:s.coreHealth,leaked:before-s.coreHealth,gold:s.gold,tech:{...s.tech},towers:s.towers.map(t=>`${t.code}:${t.level}`)});
 }
 return {seed,initialGold,phase:s.phase,wave:s.wave,health:s.coreHealth,kills:s.kills,gold:s.gold,elapsed:s.elapsed,recipeTarget,commands,forges,shotsByCode,echoes,log};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--recipes')){
  const runs=GEM_RECIPES.map(recipe=>playGem(42,{recipeTarget:recipe.code}));
  console.log(JSON.stringify({purpose:'Default-resource legal recipe acquisition and combat examples; seed42 is a fixed example, not balance evidence. Original twenty-seed baseline remains separate.',strategy:'pay one opening reroll and reroll weak hands while targeting missing level2 ingredients; preserve real recipe materials, pay reinforcement2 first then deployment and later technologies; forge prerequisites before F05; corridor placement',runs},null,2));
 }else{
 const seeds=[1,42,2026,...Array.from({length:17},(_,i)=>i+2)];
 const runs=seeds.map(seed=>playGem(seed));
 console.log(JSON.stringify({strategy:'paid five-choice; merge matching ordinary gems; deployment then reinforcement research; corridor placement',wins:runs.filter(r=>r.phase==='victory').length,total:runs.length,runs},null,2));
 }
}
