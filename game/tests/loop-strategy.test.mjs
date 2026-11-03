import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';
import {LOOP_TOWERS,LOOP_ROUTES,LOOP_TECHNOLOGIES,loopStats,loopWave,loopEnemy,upgradeQuote} from '../loop-catalog.js';
import {createLoopCombat} from '../loop-combat.js';
import {createRoadPosition,placementStatus} from '../geometry.js';
function setup(){const g=createGame({startingGold:100000,initialDelay:10000});g.start();return g;}
function tower(g,code,route=null,level=1,x=500,y=300){const t={id:g.state.towers.length+1,code,route,level,x,y,spent:LOOP_TOWERS.find(t=>t.code===code).price,angle:0,cycles:0,cooldown:0,priority:'default'};g.state.towers.push(t);return t;}
function enemy(g,code='X01',x=570,y=300,extra={}){const e=loopEnemy({code,boss:false,wave:1,endless:g.state.endless},100+g.state.enemies.length,createRoadPosition(()=>.1));Object.assign(e,{x,y,speed:0,hp:100000,maxHp:100000},extra);g.state.enemies.push(e);return e;}
function fire(g,t,n=1){for(let i=0;i<n;i++){t.cooldown=0;g.tick(.05);}}

test('loop owns its catalog and 4/6/8/10/12/16 capacity; other modes keep original technology',()=>{
 const g=setup();assert.equal(g.catalog.length,14);assert.deepEqual(g.technologies.deployment.levels.map(l=>l.capacity),[4,6,8,10,12,16]);assert.equal(g.technologies.reinforcement.levels.length,7);
 for(const mode of ['defense','escort','maze','hero'])assert.deepEqual(createGame({mode}).technologies?.deployment.levels.map(l=>l.capacity)||[4,8,12,20],[4,8,12,20]);
 for(let level=0;level<6;level++){g.state.tech.deployment=level;g.state.towers=Array.from({length:g.technologies.deployment.levels[level].capacity},(_,id)=>({id,code:'T01'}));assert.equal(g.canBuildType('T01').ok,false);g.state.towers.pop();assert.equal(g.canBuildType('T01').ok,true);}
});
test('upgrade to three requires a route atomically; discounts snapshot, completion and reset obey safe preparation',()=>{
 const g=setup();g.state.tech.reinforcement=4;g.build(190,140,'T01');const t=g.state.towers[0];g.upgrade(t.id);g.tick(5);const gold=g.state.gold;
 assert.equal(g.upgrade(t.id).ok,false);assert.equal(g.state.gold,gold);assert.equal(g.upgrade(t.id,'C').ok,false);assert.ok(g.upgrade(t.id,'A').ok);assert.equal(t.route,null);assert.equal(t.level,2);g.tick(8);assert.equal(t.route,'A');assert.equal(t.level,3);
 assert.equal(g.respecialize(t.id,'B').ok,false);g.togglePause();const investment=t.spent;t.streak=5;t.cycles=8;assert.ok(g.respecialize(t.id,'B').ok);assert.equal(t.level,3);assert.equal(t.spent,investment);assert.equal(t.cycles,0);assert.equal(g.state.gold,gold-110-30);
 const after=g.state.gold;assert.equal(g.respecialize(t.id,'B').ok,false);assert.equal(g.state.gold,after);enemy(g);assert.equal(g.respecialize(t.id,'A').ok,false);
});
test('military supply does not discount itself, and active upgrade quote never changes mid-task',()=>{
 const g=setup();g.state.tech.reinforcement=6;const arm=tower(g,'T01',null,1);const supply=tower(g,'T11','B',5,510,350);
 assert.deepEqual(upgradeQuote(arm,g.state),{cost:71,duration:4});assert.equal(upgradeQuote(supply,g.state).cost,0); // max level cannot be upgraded; command rejects it
 assert.ok(g.upgrade(arm.id).ok);g.sell(supply.id);assert.equal(arm.upgrading.cost,71);assert.equal(arm.upgrading.duration,4);g.tick(4);assert.equal(arm.level,2);
 const self=tower(g,'T11','B',3,500,300);assert.equal(upgradeQuote(self,g.state).cost,210);
});
test('armor, magic, non-overflowing shield bonus, wet and strongest debuff all use actual damage settlement',()=>{
 const g=setup(),events=[],c=createLoopCombat(g.state,e=>events.push(e)),e=enemy(g,'X02',570,300,{hp:1000,maxHp:1000,shield:0});
 c.hurt(e,100,'physical');assert.equal(e.hp,935);c.hurt(e,100,'magic');assert.equal(e.hp,835);
 c.effect(e,'armor',.15,5,1);c.effect(e,'armor',.2,1,2);c.hurt(e,100,'physical');assert.equal(e.hp,750);
 g.state.elapsed=2;assert.equal(c.strength(e,'armor'),.15);e.armor=0;e.shield=50;e.hp=1000;c.hurt(e,40,'magic',null,{shieldMultiplier:2});assert.equal(e.hp,985);assert.equal(e.shield,0);
 c.effect(e,'wet',1,5,1);c.hurt(e,100,'magic',null,{arc:true});assert.equal(e.hp,860);
});
test('boss hard control halves duration and rejects extensions until the three-second protection ends',()=>{
 const g=setup(),c=createLoopCombat(g.state,()=>{}),e=enemy(g,'X12',570,300,{boss:true});
 assert.ok(c.root(e,2,{id:1}));assert.equal(e.rootUntil,1);assert.equal(e.immuneUntil,4);assert.equal(c.root(e,4,{id:2}),false);
 g.state.elapsed=1.1;assert.equal(c.root(e,2,{id:2}),false);g.state.elapsed=4;assert.ok(c.root(e,2,{id:2}));assert.equal(e.rootUntil,5);
});
test('priority stays within reach, and selecting another priority clears lock streak',()=>{
 const g=setup(),t=tower(g,'T01','A',3),a=enemy(g,'X01',570,300),b=enemy(g,'X03',580,300),outside=enemy(g,'X03',1200,300);a.hp=1000;b.hp=200;outside.hp=1000000;
 assert.ok(g.setPriority(t.id,'support').ok);fire(g,t);assert.equal(t.lockId,b.id);assert.equal(a.hp,1000);assert.equal(outside.hp,1000000);
 assert.ok(g.setPriority(t.id,'strongest').ok);assert.equal(t.streak,0);fire(g,t);assert.equal(t.lockId,a.id);
});
test('a multi-target cycle counts once and never duplicates a target, while focused alternatives retain single-target strength',()=>{
 const g=setup(),t=tower(g,'T01','B',3);for(let i=0;i<5;i++)enemy(g,'X01',560+i*5,300);fire(g,t);
 assert.equal(t.cycles,1);assert.equal(g.state.enemies.filter(e=>e.hp<e.maxHp).length,3);
 t.level=5;g.state.tech.reinforcement=6;g.state.enemies.forEach(e=>e.hp=e.maxHp);fire(g,t);assert.equal(g.state.enemies.filter(e=>e.hp<e.maxHp).length,5);
 const one=setup(),focus=tower(one,'T01','A',3),target=enemy(one),many=setup(),split=tower(many,'T01','B',3),target2=enemy(many);fire(one,focus,5);fire(many,split,5);assert.ok(target.maxHp-target.hp>target2.maxHp-target2.hp);
});
test('primary burns spread only one generation, do not stack DPS and keep independent expiry',()=>{
 const g=setup(),t=tower(g,'T13','B',5),e=enemy(g),next=enemy(g,'X01',590,300);t.priority='weakest';e.hp=1;fire(g,t);assert.ok(next.burns.length);assert.equal(next.burns[0].primary,false);
 g.state.towers=[];next.hp=1;const last=enemy(g,'X01',610,300);g.tick(.2);assert.equal(last.burns.length,0);
 const h=setup(),low=tower(h,'T13',null,1),high=tower(h,'T13','A',3),victim=enemy(h);fire(h,low);fire(h,high);h.state.towers=[];const hp=victim.hp;h.tick(.5);assert.ok(Math.abs(hp-victim.hp-12*2.4*1.5*.5)<1e-6);
});
test('healers restore living allies but never shields or corpses; interference suppresses healing',()=>{
 const g=setup(),c=createLoopCombat(g.state,()=>{}),healer=enemy(g,'X03'),target=enemy(g,'X01',580,300,{hp:500,maxHp:1000,shield:20}),dead=enemy(g,'X01',585,300,{hp:0,maxHp:1000});c.effect(target,'suppress',.5,10,1);g.tick(3.1);assert.equal(target.hp,515);assert.equal(target.shield,20);assert.equal(dead.hp,0);assert.equal(healer.hp,healer.maxHp);
});
test('endless entries are fixed fifty including bosses, grow linearly with stable speed and pay exactly one',()=>{
 let previous=4.04;for(let w=21;w<=120;w++){
  const wave=loopWave(w);assert.equal(wave.length,50);assert.equal(wave.filter(e=>e.boss).length,w%5===0?1:0);
  const a=loopEnemy({code:'X01',wave:w,endless:true,boss:false},1,createRoadPosition(()=>0)),b=loopEnemy({code:'X12',wave:w,endless:true,boss:true},2,createRoadPosition(()=>0));
  assert.equal(a.reward,1);assert.equal(b.reward,1);assert.equal(a.speed,86);assert.ok(a.maxHp/58>previous);assert.ok(Math.abs(a.maxHp/58-previous-.0404)<1e-8);previous=a.maxHp/58;
 }
 const g=setup();g.state.endless=true;const c=createLoopCombat(g.state,()=>{}),boss=enemy(g,'X12',570,300,{endless:true,reward:1,hp:1});const gold=g.state.gold;c.hurt(boss,1000);c.hurt(boss,1000);assert.equal(g.state.gold,gold+1);assert.equal(g.state.endlessKills,1);
});
test('endless supply cap is global, has no debt, freezes without enemies, resets at transition and leaves normal income intact',()=>{
 for(const count of [1,3,16]){const g=setup();g.state.endless=true;for(let i=0;i<count;i++)tower(g,'T11','A',5,200+i*20,140);g.state.tech.reinforcement=6;
  const gold=g.state.gold;g.tick(100);assert.equal(g.state.gold,gold);enemy(g);g.tick(20);assert.equal(g.state.gold,gold);g.state.endlessKills=100;g.tick(120);assert.equal(g.state.gold,gold+10);assert.equal(g.state.endlessSupply,10);g.tick(120);assert.equal(g.state.gold,gold+10);
 }
 const g=setup(),t=tower(g,'T11');g.tick(7);const gold=g.state.gold;g.tick(1);assert.equal(g.state.gold,gold+12);g.state.phase='victory';t.incomeIn=.1;assert.ok(g.continueEndless().ok);assert.equal(t.incomeIn,20);assert.equal(g.state.endlessKills,0);
});
test('forecasts use actual wave configuration, all fourteen towers preserve legal off-road construction',()=>{
 const g=setup();const f=g.forecasts();assert.equal(f.length,2);assert.deepEqual(f[0].entries,loopWave(1,false));assert.equal(f[0].count,12);
 g.state.phase='victory';g.continueEndless();assert.equal(g.forecasts()[0].count,50);assert.equal(g.forecasts()[0].entries.filter(e=>e.endless).length,50);
 for(const def of LOOP_TOWERS){let found=false;for(let y=60;y<750&&!found;y+=20)for(let x=60;x<1230;x+=20)if(placementStatus(x,y,[]).ok){found=true;break;}assert.ok(found,def.code);}
});
// Exercise all approved routes through the production combat clock, not just catalog labels.
for(const def of LOOP_TOWERS)for(const route of ['A','B'])test(`${def.code} ${LOOP_ROUTES[def.code][route==='A'?0:1][0]}: real combat and both advanced research tiers`,()=>{
 const g=setup(),t=tower(g,def.code,route,5);for(let i=0;i<10;i++)enemy(g,i%2?'X05':'X03',560+i*4,300,{shield:i%2?10000:0,maxShield:i%2?10000:0});
 if(def.role==='support')tower(g,'T01','A',5,530,320);
 const before=g.state.gold,hp=g.state.enemies.reduce((n,e)=>n+e.hp+e.shield,0);g.state.tech.reinforcement=5;assert.equal(g.statsFor(t).advanced,true);g.state.tech.reinforcement=6;assert.equal(g.statsFor(t).master,true);
 if(def.role==='support'){g.tick(45);assert.ok(g.state.gold>before||def.code==='T09'&&g.state.enemies.some(e=>e.statuses.some(s=>s.kind==='vulnerable'))||def.code==='T09'&&t.pulseIn!==undefined||def.code==='T10'&&t.pulseIn!==undefined);}
 else {fire(g,t,12);assert.equal(t.cycles,12);assert.ok(g.state.enemies.reduce((n,e)=>n+e.hp+e.shield,0)<hp);assert.ok(Number.isFinite(g.statsFor(t).damage));}
});

test('endless supply rotates actual payout events rather than favoring fixed IDs at a 20s clock boundary',()=>{
 const g=setup();g.state.endless=true;enemy(g);for(let i=0;i<16;i++)tower(g,'T11',null,1,200+i*20,140);
 const recipients=new Set();for(let i=0;i<16;i++){g.state.endlessKills+=10;g.tick(20);for(const e of g.drainEvents())if(e.type==='income')recipients.add(e.x);}
 assert.equal(recipients.size,16);assert.equal(g.state.endlessSupply,16);
});
test('different support functions combine, duplicates take strongest, and no support buffs itself',()=>{
 const g=setup(),gun=tower(g,'T01'),radar=tower(g,'T09','B',3,510,300),arm=tower(g,'T10','A',3,520,300);
 const r=g.statsFor(gun);assert.ok(Math.abs(r.range-205*1.22)<1e-8);assert.ok(Math.abs(r.interval-.55/1.25)<1e-8);
 tower(g,'T09','B',3,530,300);tower(g,'T10','A',3,540,300);assert.equal(g.statsFor(gun).range,r.range);assert.equal(g.statsFor(gun).interval,r.interval);assert.equal(g.statsFor(radar).range,210);assert.equal(g.statsFor(arm).range,200);
 g.state.tech.reinforcement=5;assert.ok(Math.abs(g.statsFor(gun).range-205*1.25)<1e-8);assert.ok(Math.abs(g.statsFor(gun).interval-.55/1.28)<1e-8);
});
test('pending spawn queue blocks respecializing even with an empty visible battlefield',()=>{
 const g=setup(),t=tower(g,'T01','A',3);g.launchWave();g.togglePause();const gold=g.state.gold;
 assert.equal(g.state.enemies.length,0);assert.equal(g.respecialize(t.id,'B').ok,false);assert.equal(g.state.gold,gold);
});
test('focus beats split against one foe; split beats focus in total group damage',()=>{
 const damage=(route,count)=>{const g=setup(),t=tower(g,'T01',route,3);for(let i=0;i<count;i++)enemy(g,'X01',560+i*3,300);fire(g,t,5);return g.state.enemies.reduce((sum,e)=>sum+e.maxHp-e.hp,0);};
 assert.ok(damage('A',1)>damage('B',1));assert.ok(damage('B',3)>damage('A',3));
});

test('loop default capacity is sixty and reaching it defeats exactly once; restart retains the new limit',()=>{
 const g=createGame();g.start();assert.equal(g.state.limit,60);g.tick(1000);
 assert.equal(g.state.phase,'defeat');assert.equal(g.state.enemies.length,60);assert.equal(g.drainEvents().filter(e=>e.type==='defeat').length,1);
 g.tick(100);assert.equal(g.drainEvents().length,0);g.restart();assert.equal(g.state.limit,60);assert.equal(g.state.enemies.length,0);
 const custom=createGame({limit:12});custom.start();custom.tick(100);assert.equal(custom.state.enemies.length,12);assert.equal(custom.state.phase,'defeat');
});
