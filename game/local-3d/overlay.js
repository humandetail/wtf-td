import { ENTRY, LOOP_BUILD_AREA, LOOP_FOOTPRINT } from '../geometry.js';
import { loopStats } from '../loop-catalog.js';
import { actorSize } from './camera.js';

const lifetimes = {
  shot:.16, hit:.21, kill:.65, build:.42, sell:.55, income:.7,
  'shield-hit':.28, interrupt:.4, 'skill-pulse':.42, 'skill-link':.32,
  'skill-sector':.35, 'skill-ray':.30
};

export function createBattleOverlay(canvas,camera) {
  const ctx = canvas.getContext('2d');
  let effects = [];
  const point = (x,y,z = 0) => camera.project(x,y,z);
  const move = p => ctx.moveTo(p.x,p.y);
  const line = p => ctx.lineTo(p.x,p.y);

  function shape(points) {
    if (points.some(p=>!p.visible)) return false;
    move(points[0]);
    for (const p of points.slice(1)) line(p);
    ctx.closePath();
    return true;
  }
  function rectangle({x,y,width,height}) {
    return shape([point(x,y),point(x+width,y),point(x+width,y+height),point(x,y+height)]);
  }
  function ring(x,y,radius,stroke,fill = null) {
    if (!(radius>0)) return;
    ctx.beginPath();
    if (!shape(Array.from({length:32},(_,i)=>{
      const a = i*Math.PI/16;
      return point(x+Math.cos(a)*radius,y+Math.sin(a)*radius);
    }))) return;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.stroke();
  }
  function segment(a,b,color,width = 2) {
    if (!a.visible||!b.visible) return;
    ctx.strokeStyle=color;ctx.lineWidth=width;
    ctx.beginPath();move(a);line(b);ctx.stroke();ctx.lineWidth=1;
  }
  function label(content,x,y,color,size = 11) {
    if (!content) return;
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px system-ui,sans-serif`;
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#101e1c';
    ctx.strokeText(content,x,y);ctx.fillText(content,x,y);ctx.lineWidth = 1;
  }
  const bar = (x,y,w,h,ratio,color) => {
    ctx.fillStyle = '#0c1715e8';
    ctx.fillRect(x-w/2-1,y-1,w+2,h+2);
    ctx.fillStyle = color;
    ctx.fillRect(x-w/2,y,w*Math.max(0,Math.min(1,ratio)),h);
  };

  function drawEffects(elapsed) {
    effects = effects.filter(e=>elapsed-e.at<lifetimes[e.type]);
    for (const e of effects) {
      const progress = (elapsed-e.at)/lifetimes[e.type];
      const color = e.color || (e.type === 'interrupt' ? '#fde3a0' : '#a2def1');
      ctx.globalAlpha = 1-progress;
      if (e.type==='shot'||e.type==='skill-link') {
        segment(point(e.x,e.y,38),point(e.tx,e.ty,14),color);
      } else if (e.type==='skill-ray') {
        segment(point(e.x,e.y,26),point(e.x+Math.cos(e.angle)*e.radius,e.y+Math.sin(e.angle)*e.radius,26),color,3);
      } else if (e.type==='skill-sector') {
        const half = (e.degrees||60)*Math.PI/360;
        const points = [point(e.x,e.y)];
        for (let i=0;i<=12;i++) {
          const a = e.angle-half+i*half/6;
          points.push(point(e.x+Math.cos(a)*e.radius,e.y+Math.sin(a)*e.radius));
        }
        ctx.beginPath(); if (shape(points)) {ctx.strokeStyle=color;ctx.stroke();}
      } else if (e.type==='skill-pulse') {
        ring(e.x,e.y,e.radius*(.4+progress*.6),color);
      } else if (['income','kill','sell'].includes(e.type)) {
        const p = point(e.x,e.y,35+progress*22);
        if (p.visible && e.amount>0) label(`+${e.amount}`,p.x,p.y,'#ffe2a0');
      } else {
        ring(e.x,e.y,10+progress*26,color);
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    event(event,elapsed) {
      if (!lifetimes[event.type] || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
      effects.push({...event,at:elapsed});
      if (effects.length > 160) effects.shift();
    },
    reset() { effects = []; },
    draw(state,{width,height,selectedTowerId,selectedEnemyId,placement,cursor,buildArea}) {
      ctx.save();
      ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
      ctx.clearRect(0,0,width,height);
      ctx.textAlign = 'center';
      ctx.lineWidth = 1;
      if (buildArea) {
        ctx.beginPath();
        if (rectangle(LOOP_BUILD_AREA.bounds)) {
          ctx.strokeStyle = '#bddea0aa';ctx.stroke();
        }
        ctx.beginPath();
        for (const exclusion of LOOP_BUILD_AREA.exclusions) rectangle(exclusion);
        ctx.fillStyle = '#10252076';ctx.fill();
      }
      for (const region of state.regions ?? []) ring(region.x,region.y,region.radius,'#a6cde288','#51a0bc25');
      ring(ENTRY.x,ENTRY.y,27,'#f2ce8388');

      const selected = state.towers.find(unit=>unit.id===selectedTowerId);
      const target = placement?.code ? {...placement,level:1} : selected;
      if (target && (!placement || placement.ok)) {
        ctx.setLineDash([5,4]);
        ring(target.x,target.y,loopStats(target,state).range,'#f7da8abd','#efce7312');
        ctx.setLineDash([]);
      }
      if (selected) ring(selected.x,selected.y,34,'#fff0a9');
      if (placement) {
        const color = placement.ok ? '#b4f7bc' : '#ffa897';
        if (placement.code) {
          const {width:w,height:h} = LOOP_FOOTPRINT;
          ctx.beginPath();
          if (rectangle({x:placement.x-w/2,y:placement.y-h/2,width:w,height:h})) {
            ctx.fillStyle = placement.ok ? '#82ee7966' : '#f47d655e';ctx.fill();
            ctx.strokeStyle = color;ctx.stroke();
          }
        } else {
          ring(placement.x,placement.y,21,color);
        }
        const p = point(placement.x,placement.y,26);
        if (p.visible) label(placement.ok ? (placement.skill||'可部署') : '不可部署',p.x,p.y,color);
      }
      if (cursor && !placement) {
        const p = point(cursor.x,cursor.y,3);
        if (p.visible) {
          segment({...p,x:p.x-7},{...p,x:p.x+7},'#ffdf92',1);
          segment({...p,y:p.y-7},{...p,y:p.y+7},'#ffdf92',1);
        }
      }

      drawEffects(state.elapsed);
      for (const tower of state.towers) {
        const p = point(tower.x,tower.y,actorSize(tower,true)[2]);
        if (p.visible && p.x>=0 && p.x<=width && p.y>=0 && p.y<=height) label(`Lv.${tower.level}`,p.x,p.y,'#f5ddaa',10);
      }
      for (const enemy of state.enemies) {
        if (enemy.hp<=0) continue;
        const p = point(enemy.x,enemy.y,actorSize(enemy,false)[2]);
        if (!p.visible || p.x<-30 || p.x>width+30 || p.y<-35 || p.y>height+35) continue;
        const w = enemy.boss ? 48 : 24;
        bar(p.x,p.y,w,4,enemy.hp/enemy.maxHp,enemy.boss?'#f6bd66':'#a5db9b');
        if (enemy.shield>0) bar(p.x,p.y+6,w,3,enemy.shield/(enemy.maxShield||1),'#7cc9fa');
        if (enemy.boss || enemy.elite || enemy.special || enemy.shieldHits>0) {
          const kind = enemy.boss ? '首领' : enemy.special==='gold' ? '金' : enemy.elite ? '精英' : '';
          label([kind,enemy.shieldHits>0?`盾×${enemy.shieldHits}`:''].filter(Boolean).join(' · '),p.x,p.y-5,'#ffdda2');
        }
        if (enemy.id===selectedEnemyId) ring(enemy.x,enemy.y,enemy.boss?34:17,'#ffd58f');
        if (enemy.channel) {
          const {start,until,kind,targetId} = enemy.channel;
          const charge = (state.elapsed-start)/(until-start);
          bar(p.x,p.y+12,w,3,charge,'#ffac6b');
          ring(enemy.x,enemy.y,27,'#ffc390');
          if (kind==='charge') {
            const a = enemy.angle||0;
            const along = (distance,offset=0)=>point(enemy.x+Math.cos(a)*distance-Math.sin(a)*offset,enemy.y+Math.sin(a)*distance+Math.cos(a)*offset,4);
            segment(along(20),along(69),'#ffd091',2.5);
            segment(along(69),along(55,10),'#ffd091');
            segment(along(69),along(55,-10),'#ffd091');
          } else if (targetId!=null) {
            const units = kind==='aid'?state.enemies:state.towers;
            const aim = units.find(unit=>unit.id===targetId);
            if (aim) segment(p,point(aim.x,aim.y,27),'#ffc391');
          }
        }
      }
      if (state.paused) {
        ctx.fillStyle='#101e2052';ctx.fillRect(0,0,width,height);
        ctx.fillStyle='#112a23ed';ctx.fillRect(width/2-69,height/2-20,138,40);
        label('对局已暂停',width/2,height/2+5,'#ffebb8',15);
      }
      ctx.restore();
    }
  };
}
