import {loopStats} from './loop-catalog.js';
import {gemStats,GEM_TOWERS} from './gem-catalog.js';
import {GEM_ROUTE,GEM_ENTRY,GEM_EXIT} from './gem-geometry.js';
import {HERO_ROUTES,HERO_GODDESS,HERO_TERRAIN,heroPositionStatus} from './hero-geometry.js';
import {HERO_SKILLS} from './hero-catalog.js';
import {legionStats} from './legion-catalog.js';
import {LEGION_DEPLOYMENT} from './legion-geometry.js';

// The generated objective sheet has uneven rows; explicit crops avoid borrowing
// the bottom of a shrine when drawing a camp. Source coordinates are 1254×1254.
export const OBJECTIVE_FRAMES=[[24,10,590,704],[633,10,615,707],[18,770,596,457],[652,700,580,535]];
export const HERO_ROW_BOUNDS=[0,214,410,618,826,992];

export function projectBattleState(state){
 if(state.mode!=='legion')return state;
 const side=state.sides[state.viewSide||'player'];
 return {...state,towers:side.fighters.filter(f=>f.hp>0),enemies:side.invaders.filter(e=>e.hp>0),gold:side.gold,tech:side.tech,research:side.research,coreHealth:side.king.hp,maxCoreHealth:side.king.maxHp,walls:[],convoy:null,king:side.king};
}

export function specialStats(tower,state){
 return state.mode==='loop'?loopStats(tower,state):state.mode==='gem'?gemStats(tower,state.towers):state.mode==='legion'?legionStats(tower):null;
}

export function createSpecialPainter(ctx,artwork,{text,ring,traceRoute,reduceMotion}){
 function cell(image,index,cols,rows,x,y,size,anchor=.84){
  if(!image)return;
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  ctx.drawImage(image,index%cols*width/cols,Math.floor(index/cols)*height/rows,width/cols,height/rows,x-size/2,y-size*anchor,size,size);
 }
 function objective(index,x,y,size){
  const image=artwork.objectivesAtlas;if(!image)return;
  const [sx,sy,sw,sh]=OBJECTIVE_FRAMES[index],factor=size/Math.max(sw,sh),w=sw*factor,h=sh*factor;
  ctx.drawImage(image,sx,sy,sw,sh,x-w/2,y-h*.84,w,h);
 }
 function heroCell(row,direction,x,y,size,alive){
  const image=artwork.heroAtlas;if(!image)return;
  const sw=(image.naturalWidth||image.width)/8,sy=HERO_ROW_BOUNDS[row],sh=HERO_ROW_BOUNDS[row+1]-sy,h=size*sh/sw;
  ctx.drawImage(image,direction*sw,sy,sw,sh,x-size/2,y-h*(alive?.96:.8),size,h);
 }
 function circle(x,y,radius,color,fill){
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle=color;ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
 }
 function ground(state,placement){
  if(state.mode==='gem'){
   const points=GEM_ROUTE.map(([x,y])=>({x,y}));traceRoute(points,'#836d9d22',48);traceRoute(points,'#30243f99',6,[12,8]);traceRoute(points,'#e7cbefcc',2.5,[12,8]);
   ring(GEM_ENTRY.x,GEM_ENTRY.y,26,'#dab7f5',.9,2);ring(GEM_EXIT.x,GEM_EXIT.y,29,'#bdeed3',.9,3);
   text('鉴定之径',160,76,'#e5d1ed',15);text('封印出口',1160,710,'#c4ead5',14);
   if(state.turnPhase==='planning')text('准备阶段 · 鉴定 / 合成后主动开战',640,36,'#ead8b0',15);
  }else if(state.mode==='hero'){
   for(const route of HERO_ROUTES){const points=route.points.map(([x,y])=>({x,y}));traceRoute(points,'#8ccbb31f',42);traceRoute(points,'#c3d9a680',2,[10,10]);}
   for(const rect of HERO_TERRAIN){
    ctx.fillStyle='#304b3b48';ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
    for(const [dx,dy]of [[.2,.25],[.72,.25],[.25,.75],[.75,.75]])if(artwork.ruinsImage)ctx.drawImage(artwork.ruinsImage,rect.x+rect.width*dx-48,rect.y+rect.height*dy-65,96,96);
   }
   for(const camp of state.camps){ring(camp.x,camp.y,45,camp.cleared?'#9bb69b':'#d7b77f',.8,2);text(camp.cleared?'营地已清理':'精英营地',camp.x,camp.y+48,'#ded0a3',13);}
   if(state.coreShield>0)circle(HERO_GODDESS.x,HERO_GODDESS.y,64,'#91e6f1','#91e6f119');
   for(const marker of state.telegraphs)circle(marker.x,marker.y,marker.radius,'#ff9b88','#f36a5040');
   if(placement?.skill){
    const h=state.hero,skill=HERO_SKILLS[placement.skill];
    if(placement.skill==='R'){circle(h.x,h.y,skill.range,'#9debd870','#9debd808');circle(placement.x,placement.y,skill.radius,'#9debd8','#9debd818');}
    else {
     const dx=placement.x-h.x,dy=placement.y-h.y,d=Math.hypot(dx,dy)||1;
     let range=skill.range;
     if(placement.skill==='E'){range=0;for(let n=5;n<=Math.min(d,skill.range);n+=5){if(!heroPositionStatus(h.x+dx/d*n,h.y+dy/d*n,state.towers).ok)break;range=n;}}
     const end={x:h.x+dx/d*range,y:h.y+dy/d*range};
     traceRoute([h,end],'#91e9cf30',placement.skill==='Q'?skill.width*2:30);traceRoute([h,end],'#b9ffdf',2,[8,6]);circle(end.x,end.y,placement.skill==='Q'?12:15,'#b9ffdf','#b9ffdf18');
    }
   }
  }else if(state.mode==='legion'){
   const box=LEGION_DEPLOYMENT;
   if(state.turnPhase==='planning'){ctx.save();ctx.strokeStyle='#d8c39270';ctx.lineWidth=2;ctx.setLineDash([7,8]);ctx.strokeRect(box.left,box.top,box.right-box.left,box.bottom-box.top);ctx.restore();}
   text(state.viewSide==='ai'?'侦察 · AI军团阵地':'我方军团阵地',640,38,state.viewSide==='ai'?'#ffc2a8':'#bfead5',17);
   text(state.turnPhase==='planning'?'准备阶段 · 布阵 / 经济 / 派兵':'双方同步交战',640,72,'#e3d2a7',14);
   ring(640,690,49,state.viewSide==='ai'?'#f3b5a3':'#bce9d1',.9,3);
  }
 }
 function actors(state){
  if(state.mode==='hero')return [{...HERO_GODDESS,special:'goddess'},...state.camps.map((c,i)=>({...c,special:'camp',atlasIndex:i+2})),{...state.hero,special:'hero'}];
  if(state.mode==='legion')return [{...state.king,special:'king'}];
  return [];
 }
 function actor(entity,state){
  if(['T13','T14'].includes(entity.code)){cell(artwork.gemAtlas,entity.code==='T13'?2:5,4,3,entity.x,entity.y,128);if(entity.code==='T14'){ctx.fillStyle='#ffe29b';for(const dx of [-23,0,23]){ctx.beginPath();ctx.arc(entity.x+dx,entity.y-72-Math.abs(dx)*.3,5,0,Math.PI*2);ctx.fill();}}else ring(entity.x,entity.y+2,30,'#d59bff',.8,2);text(`${entity.code==='T13'?'符焰':'三联'} · Lv.${entity.level||1}${entity.route?' · '+entity.route:''}`,entity.x,entity.y+27,entity.code==='T13'?'#d59bff':'#f6d085',12);return true;}
  if(state.mode==='gem'&&/^[GF]\d\d$/.test(entity.code)){
   const stats=gemStats(entity,state.towers),index=GEM_TOWERS.findIndex(t=>t.code===entity.code);
   ring(entity.x,entity.y+3,30,stats.color,.55,1.5);
   cell(artwork.gemAtlas,index,4,3,entity.x,entity.y,140);
   text(`${stats.name} · ${entity.level}阶`,entity.x,entity.y+28,stats.color,12);return true;
  }
  if(entity.special==='goddess'){objective(0,entity.x,entity.y,182);text('灵姬神殿',entity.x,entity.y+48,'#bcebd5',14);return true;}
  if(entity.special==='king'){
   objective(1,entity.x,entity.y,174);text(`${state.viewSide==='ai'?'AI':'我方'}国王 · ${Math.max(0,Math.ceil(entity.hp))}`,entity.x,entity.y+44,'#e9d49a',14);return true;
  }
  if(entity.special==='camp'){ctx.save();ctx.globalAlpha=entity.cleared?.4:.9;objective(entity.atlasIndex,entity.x,entity.y,110);ctx.restore();return true;}
  if(entity.special==='hero'){
   const direction=((Math.round((entity.angle||0)/(Math.PI/4))%8)+8)%8;
   const action=entity.action||'idle';
   const row=!entity.alive?4:action.startsWith('cast')?3:action==='attack'?2:action==='move'&&(!reduceMotion&&Math.floor(state.elapsed*8)%2)?1:0;
   ctx.save();if(action==='hurt')ctx.globalAlpha=.55;
   const bob=action==='move'&&!reduceMotion?Math.sin(state.elapsed*16)*1.6:0;
   ring(entity.x,entity.y+3,25,entity.alive?'#b6efd8':'#99aaa1',.9,2);
   heroCell(row,direction,entity.x,entity.y+bob,125,entity.alive);
   ctx.restore();
   if(entity.shield>0)circle(entity.x,entity.y-35,43,'#94e5ed','#94e5ed14');
   const top=entity.y-126;ctx.fillStyle='#15241ed9';ctx.fillRect(entity.x-27,top,54,7);ctx.fillStyle='#9bdcb2';ctx.fillRect(entity.x-26,top+1,52*entity.hp/entity.maxHp,5);
   text(entity.alive?`游侠 Lv.${entity.level}`:`复活 ${Math.ceil(entity.respawnIn)} 秒`,entity.x,entity.y+22,'#bdeedb',12);return true;
  }
  return false;
 }
 function particle(item,progress){
  if(item.type==='fusion'){cell(artwork.gemAtlas,11,4,3,item.x,item.y,100+progress*80,.6);return true;}
  if(item.type==='echo'){traceRoute([{x:item.x,y:item.y-45},{x:item.tx,y:item.ty-20}],'#f3c6ff',5);return true;}
  if(item.type==='hero-skill'){
   const dx=item.tx-item.x,dy=item.ty-item.y,length=Math.hypot(dx,dy)||1;
   if(item.key==='Q')traceRoute([{x:item.x,y:item.y-25},{x:item.x+dx/length*280,y:item.y+dy/length*280-25}],'#93f5d6',8*(1-progress)+2);
   else if(item.key==='E'){traceRoute([{x:item.x,y:item.y-30},{x:item.tx,y:item.ty-30}],'#a4f6e3',12*(1-progress)+2);circle(item.tx,item.ty,25+progress*25,'#9aeada','#9aeada20');}
   else circle(item.tx,item.ty,170,'#9aeada','#9aeada20');
   return true;
  }
  if(item.type==='unit-death'){
   const sprite=artwork.units.get(item.code)?.masterImage;
   if(sprite){ctx.save();ctx.translate(item.x,item.y);ctx.rotate(progress*.45);ctx.scale(1,1-progress*.75);ctx.drawImage(sprite,-54,-68,108,108);ctx.restore();}
   return true;
  }
  if(item.type==='heal'){text(`+${Math.round(Math.abs(item.damage||0))}`,item.x,item.y-40-progress*20,'#a6e7bf',14);return true;}
  return false;
 }
 return {ground,actors,actor,particle};
}
