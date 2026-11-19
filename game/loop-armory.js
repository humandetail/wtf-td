import {LOOP_EQUIPMENT, LOOP_CREDENTIALS} from './loop-equipment.js';
import {loopTower} from './loop-catalog.js';

const controlTowers = new Set(['T06','T07','T08','T17','T18','T19','T21','T26','T27']);
const ok = {ok:true};
const fail = message=>({ok:false,message});
const done = (message,extra={})=>({ok:true,message,...extra});

function compatible(tower, item) {
 const base=loopTower(tower.code);
 if(item.isScroll||tower.code==='T11'||item.grade==='orange'&&(!tower.awakened||base.rarity==='common'))return false;
 if(item.role==='attack')return base.damage>0;
 if(item.role==='physical'||item.role==='magic')return base.damageType===item.role||tower.code==='T31';
 if(item.role==='control')return controlTowers.has(tower.code);
 if(item.role==='support')return base.role==='support';
 return true;
}

export function createLoopArmory(state,{editable,newId,changeGold,combat,emit}) {
 const towerById=id=>state.towers.find(tower=>tower.id===id);
 const inBag=id=>state.inventory.find(item=>item.id===id);
 const definition=code=>Object.hasOwn(LOOP_EQUIPMENT,code)?LOOP_EQUIPMENT[code]:null;
 const itemInstance=(code,invested)=>({id:newId(),code,invested,readyAt:0,manual:false});

 function canBuyEquipment(code) {
  const item=definition(code);
  if(!editable())return fail('当前不能购买');
  if(!item||item.components)return fail('该装备需要合成');
  if(state.wave<(item.availableWave??0))return fail(`第 ${item.availableWave} 波开放`);
  return state.gold<item.cost?fail('金币不足'):ok;
 }

 function craftParts(code,towerId) {
  const tower=towerId==null?null:towerById(towerId);
  const items=towerId==null?state.inventory:tower?.equipment;
  const recipe=definition(code);
  const parts=recipe?.components?.map(component=>items?.find(item=>item.code===component));
  const scroll=state.inventory.find(item=>item.code===recipe?.scroll);
  return {tower,items,recipe,parts,scroll};
 }
 function canCraft(code,towerId=undefined) {
  const {tower,items,recipe,parts,scroll}=craftParts(code,towerId);
  if(!editable()||!items||!recipe?.components)return fail('当前无法合成此装备');
  if(!parts.every(Boolean)||!scroll)return fail('缺少组件或卷轴');
  if(tower&&(!compatible(tower,recipe)||items.some(item=>item.code===code)))return fail('工事不适用或已装同名装备');
  return ok;
 }
 function canEquip(towerId,itemId) {
  const tower=towerById(towerId),item=inBag(itemId);
  if(!editable()||!tower||!item)return fail('请选择背包装备');
  if(tower.equipment.length>=(loopTower(tower.code).rarity==='common'?3:6))return fail('装备槽已满');
  if(!compatible(tower,definition(item.code)))return fail('工事不适用或尚未突破');
  return tower.equipment.some(i=>i.code===item.code)?fail('已装同名装备'):ok;
 }
 function canBreakthrough(towerId,credentialTowerId) {
  const tower=towerById(towerId),credential=towerById(credentialTowerId);
  if(!editable()||!tower||!LOOP_CREDENTIALS[tower.code]||tower.awakened)return fail('当前不能突破');
  if(tower.level<5)return fail('主力须达到 5 级');
  if(credential?.code!==LOOP_CREDENTIALS[tower.code]||credential.level<5||credential.qualifiedUsed)return fail('需要指定的未使用 5 级 R 塔');
  return state.gold<180?fail('突破需要 180 金币'):ok;
 }
 function canCastEquipment(towerId,itemId,x=undefined,y=undefined) {
  const tower=towerById(towerId),item=tower?.equipment.find(gear=>gear.id===itemId);
  if(!editable()||state.starter!=='deployed'||!item||!item.manual||!definition(item.code)?.active)return fail('请选择手动装备技能');
  if(tower.silenceUntil>state.elapsed)return fail('工事当前无法施放');
  if(item.readyAt>state.elapsed)return fail('装备技能冷却中');
  if(definition(item.code).active.targeted&&x===undefined&&y===undefined)return ok;
  return combat.equipmentTarget(tower,item,x,y)?ok:fail('没有合法施放目标');
 }
 return {
  canBuyEquipment,
  buyEquipment(code) {
   const status=canBuyEquipment(code);if(!status.ok)return status;
   const {name,cost}=definition(code),item=itemInstance(code,cost);
   state.inventory.push(item);changeGold(-cost,'equipment');return done('已购买'+name,{itemId:item.id});
  },
  canCraft,
  craftEquipment(code,towerId=undefined) {
   const status=canCraft(code,towerId);if(!status.ok)return status;
   const {tower,parts,scroll,recipe}=craftParts(code,towerId);
   const used=new Set([...parts,scroll].map(item=>item.id));
   const invested=[...parts,scroll].reduce((sum,item)=>sum+(item.invested??0),0);
   const output=itemInstance(code,invested);
   state.inventory=state.inventory.filter(item=>!used.has(item.id));
   if(tower)tower.equipment=[...tower.equipment.filter(item=>!used.has(item.id)),output];
   else state.inventory.push(output);
   return done('已合成'+recipe.name,{itemId:output.id});
  },
  canEquip,
  equip(towerId,itemId) {
   const status=canEquip(towerId,itemId);if(!status.ok)return status;
   towerById(towerId).equipment.push(inBag(itemId));
   state.inventory=state.inventory.filter(item=>item.id!==itemId);
   return done('已装配');
  },
  unequip(towerId,itemId) {
   const tower=towerById(towerId),item=tower?.equipment.find(gear=>gear.id===itemId);
   if(!editable()||!item)return fail('请选择已装配的装备');
   if(tower.combatUntil>state.elapsed)return fail('脱战后才能卸装');
   tower.equipment=tower.equipment.filter(gear=>gear.id!==itemId);state.inventory.push(item);
   return done('已退回背包');
  },
  sellEquipment(itemId) {
   const item=inBag(itemId);
   if(!editable()||!item)return fail('请选择背包装备');
   const refund=Math.floor((item.invested??0)/4);
   state.inventory=state.inventory.filter(gear=>gear!==item);changeGold(refund,'sell-equipment');
   return done(`已出售装备 · 回收 ${refund} 金币`,{refund});
  },
  canBreakthrough,
  breakthrough(towerId,credentialTowerId) {
   const status=canBreakthrough(towerId,credentialTowerId);if(!status.ok)return status;
   const tower=towerById(towerId);
   tower.awakened=true;towerById(credentialTowerId).qualifiedUsed=true;changeGold(-180,'breakthrough');
   emit({type:'upgrade',x:tower.x,y:tower.y,code:tower.code,amount:tower.level});
   return done('突破完成 · 可佩戴橙装');
  },
  toggleEquipmentMode(towerId,itemId) {
   const item=towerById(towerId)?.equipment.find(gear=>gear.id===itemId);
   if(!editable()||!item||!definition(item.code)?.active)return fail('该装备没有主动技能');
   item.manual=!item.manual;return done(item.manual?'手动施放':'自动施放');
  },
  canCastEquipment,
  castEquipment(towerId,itemId,x=undefined,y=undefined) {
   const status=canCastEquipment(towerId,itemId,x,y);if(!status.ok)return status;
   const tower=towerById(towerId),item=tower.equipment.find(gear=>gear.id===itemId);
   const target=combat.equipmentTarget(tower,item,x,y);
   if(!target)return fail('请先选择施放目标');
   combat.useEquipment(tower,item,target);
   return done('装备技能已施放');
  },
 };
}
