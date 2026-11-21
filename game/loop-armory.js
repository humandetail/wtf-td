import {LOOP_EQUIPMENT, LOOP_CREDENTIALS, equipmentPurchasePrice} from './loop-equipment.js';
import {loopTower} from './loop-catalog.js';

const ok = {ok:true};
const fail = message=>({ok:false,message});
const done = (message,extra={})=>({ok:true,message,...extra});

export function createLoopArmory(state,{editable,newId,changeGold,combat,emit}) {
 const towerById=id=>state.towers.find(tower=>tower.id===id);
 const inBag=id=>state.inventory.find(item=>item.id===id);
 const definition=code=>Object.hasOwn(LOOP_EQUIPMENT,code)?LOOP_EQUIPMENT[code]:null;
 const itemInstance=(code,invested)=>({id:newId(),code,invested,readyAt:0,manual:!!definition(code).active});
 const equippedLimit=tower=>loopTower(tower.code).rarity==='common'?3:6;
 function attach(tower,item){
  if(definition(item.code).prism)tower.prismEquippedAt=state.elapsed;
  tower.equipment.push(item);
 }

 function qualification(tower){
  const code=LOOP_CREDENTIALS[tower.code];
  return code?state.towers.find(t=>t.code===code&&t.deputyStage===3):undefined;
 }
 function equipStatus(tower,item){
  if(!item)return fail('未知装备');
  if(item.grade!=='orange')return ok;
  if(!tower.awakened)return fail('主塔突破后可穿戴橙装');
  const code=LOOP_CREDENTIALS[tower.code];
  const name=loopTower(code)?.name??'指定副塔';
  return qualification(tower)?ok:fail('穿戴橙装需要三阶'+name+'在场');
 }
 function canBuyEquipment(code) {
  if(!editable())return fail('当前不可购买');
  if(!definition(code))return fail('未知装备');
  return state.gold<equipmentPurchasePrice(code)?fail('金币不足'):ok;
 }
 function craftParts(code,towerId) {
  const tower=towerId==null?null:towerById(towerId);
  const available=[...(tower?.equipment??[]),...state.inventory];
  const recipe=definition(code);
  const parts=recipe?.components?.map(component=>{
   const index=available.findIndex(item=>item.code===component);
   return index<0?null:available.splice(index,1)[0];
  });
  return {tower,recipe,parts};
 }
 function canCraft(code,towerId=undefined) {
  const {tower,recipe,parts}=craftParts(code,towerId);
  if(!editable()||towerId!=null&&!tower||!recipe?.components)return fail('当前无法合成此装备');
  if(!parts.every(Boolean))return fail('缺少合成材料');
  if(tower){
   const status=equipStatus(tower,recipe);if(!status.ok)return status;
   if(tower.equipment.filter(item=>!parts.includes(item)).length>=equippedLimit(tower))return fail('装备槽已满');
  }
  return state.gold<recipe.craftFee?fail('金币不足'):ok;
 }
 function canEquip(towerId,itemId) {
  const tower=towerById(towerId),item=inBag(itemId);
  if(!editable()||!tower||!item)return fail('请选择背包装备');
  if(tower.equipment.length>=equippedLimit(tower))return fail('装备槽已满');
  return equipStatus(tower,definition(item.code));
 }
 function canBreakthrough(towerId,credentialTowerId=undefined) {
  const tower=towerById(towerId);
  if(!editable()||!tower||!LOOP_CREDENTIALS[tower.code]||tower.awakened)return fail('当前不能突破');
  if(tower.level<20)return fail('主塔须达到 20 级');
  const credential=credentialTowerId===undefined?qualification(tower):towerById(credentialTowerId);
  if(credential?.code!==LOOP_CREDENTIALS[tower.code]||credential.deputyStage!==3)return fail('需要指定的三阶副塔在场');
  return ok;
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
   const {name}=definition(code),cost=equipmentPurchasePrice(code),item=itemInstance(code,cost);
   state.inventory.push(item);changeGold(-cost,'equipment');return done('已购买'+name,{itemId:item.id});
  },
  canCraft, craftParts,
  craftEquipment(code,towerId=undefined) {
   const status=canCraft(code,towerId);if(!status.ok)return status;
   const {tower,parts,recipe}=craftParts(code,towerId);
   const used=new Set(parts.map(item=>item.id));
   const invested=parts.reduce((sum,item)=>sum+(item.invested??0),recipe.craftFee);
   const output=itemInstance(code,invested);
   state.inventory=state.inventory.filter(item=>!used.has(item.id));
   if(tower){
    tower.equipment=tower.equipment.filter(item=>!used.has(item.id));
    attach(tower,output);
   }else state.inventory.push(output);
   changeGold(-recipe.craftFee,'craft-equipment');
   return done(`已合成${recipe.name} · 支付 ${recipe.craftFee} 金`,{itemId:output.id});
  },
  canEquip,
  equip(towerId,itemId) {
   const status=canEquip(towerId,itemId);if(!status.ok)return status;
   attach(towerById(towerId),inBag(itemId));
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
  breakthrough(towerId,credentialTowerId=undefined) {
   const status=canBreakthrough(towerId,credentialTowerId);if(!status.ok)return status;
   const tower=towerById(towerId);
   tower.awakened=true;
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
