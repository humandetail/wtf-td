import {TECHNOLOGIES} from './research.js';

// The three new sessions share research transactions; their clocks stay local.
export function createResearchControls(state,emit,definitions=TECHNOLOGIES,allowed=()=>state.phase==='playing'){
 const result=(ok,message)=>({ok,message});
 function canResearch(kind){
  if(!allowed())return result(false,'当前阶段不能研究');
  const definition=Object.hasOwn(definitions,kind)?definitions[kind]:null;
  if(!definition)return result(false,'无效科技');
  if(state.research)return result(false,'已有研究进行中');
  const next=definition.levels[state.tech[kind]+1];
  if(!next)return result(false,'科技已达最高等级');
  if(state.gold<next.cost)return result(false,'金币不足');
  return result(true,'可以开始研究');
 }
 return {
  canResearch,
  startResearch(kind){
   const status=canResearch(kind);if(!status.ok)return status;
   const level=state.tech[kind]+1,{cost,duration}=definitions[kind].levels[level];
   state.gold-=cost;state.research={kind,level,cost,duration,remaining:duration};
   const message=`${definitions[kind].name} ${level} 级开始研究`;
   emit({type:'research-start',kind,message});return result(true,message);
  },
  cancelResearch(){
   if(!allowed()||!state.research)return result(false,'当前不能取消研究');
   const {kind,cost}=state.research;state.gold+=cost;state.research=null;
   const message=`${definitions[kind].name}已取消，退还 ${cost} 金币`;
   emit({type:'research-cancel',kind,message});return result(true,message);
  },
  advanceResearch(dt){
   if(!state.research)return;
   state.research.remaining=Math.max(0,state.research.remaining-dt);
   if(state.research.remaining<=1e-9){
    const {kind,level}=state.research;state.tech[kind]=level;state.research=null;
    emit({type:'research-complete',kind,message:`${definitions[kind].name} ${level} 级研究完成`});
   }
  },
 };
}
