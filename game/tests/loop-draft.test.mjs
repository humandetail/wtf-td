import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoopGame} from '../loop-session.js';

test('the free SR opens once and the timer starts after successful deployment', () => {
 const game=createLoopGame({draftRandom:()=>0});
 game.start();game.tick(5);
 assert.equal(game.state.elapsed,0);
 assert.equal(game.state.gold,200);
 const {cardId}=game.openStarter();
 assert.equal(game.state.cards[0].code,'T05');
 assert.equal(game.state.starter,'held');
 assert.equal(game.openStarter().ok,false);
 assert.equal(game.sellCard(cardId).ok,false);
 assert.equal(game.deploy(cardId,640,400).ok,false);
 game.tick(5);assert.equal(game.state.elapsed,0);
 assert.ok(game.deploy(cardId,500,300).ok);
 game.tick(.1);assert.ok(game.state.elapsed>0);
 assert.equal(game.state.starter,'deployed');
});

test('packs respect their tier ceilings, failures preserve pity, and the third SSR pack guarantees SSR', () => {
 const game=createLoopGame({startingGold:5000,draftRandom:()=>0,random:()=>{throw Error('drawing advanced the road RNG');}});
 game.start();
 for(let i=1;i<=2;i++){
  const result=game.draw('SSR');assert.ok(result.ok);
  assert.equal(game.state.cards.find(card=>card.id===result.cardId).refund,30);
  assert.equal(game.state.ssrMisses,i);
 }
 assert.ok(game.draw('SR').ok);
 assert.equal(game.state.ssrMisses,2);
 const before=game.state.gold;
 game.togglePause();assert.equal(game.draw('SSR').ok,false);game.togglePause();
 assert.equal(game.state.gold,before);assert.equal(game.state.ssrMisses,2);
 const result=game.draw('SSR');
 assert.equal(game.state.cards.find(card=>card.id===result.cardId).refund,187);
 assert.equal(game.state.ssrMisses,0);
 game.restart();assert.equal(game.state.ssrMisses,0);
});

test('three candidates persist and choosing a card never charges gold',()=>{
 const game=createLoopGame({startingGold:500,draftRandom:()=>0});
 game.start();
 assert.ok(game.openStarterPack().ok);
 assert.equal(new Set(game.state.draft.codes).size,3);
 assert.equal(game.state.gold,500);
 assert.ok(game.choosePackCard(game.state.draft.codes[1]).ok);
 assert.ok(game.buyPack('R').ok);
 const codes=[...game.state.draft.codes];
 const gold=game.state.gold;
 assert.equal(gold,380);
 assert.equal(new Set(codes).size,3);
 assert.equal(game.buyPack('SR').ok,false);
 assert.equal(game.choosePackCard('T36').ok,false);
 assert.deepEqual(game.state.draft.codes,codes);
 assert.equal(game.state.cards.length,1);
 assert.ok(game.choosePackCard(codes[2]).ok);
 assert.equal(game.choosePackCard(codes[2]).ok,false);
 assert.equal(game.state.cards.at(-1).code,codes[2]);
 assert.equal(game.state.gold,gold);
});

test('adjacent towers use real placement rules and five distinct R cards redeem one credential', () => {
 const game=createLoopGame({startingGold:2000,draftRandom:()=>0});
 game.start();game.openStarter();
 for(const [i,x] of [190,262,334].entries()){
  if(i)assert.ok(game.draw('R').ok);
  assert.ok(game.deploy(game.state.cards[0].id,x,140).ok);
 }
 assert.equal(game.state.populationUsed,30);
 const ids=Array.from({length:5},()=>game.draw('R').cardId);
 assert.equal(game.exchangeR('T13',ids).ok,false);
 game.state.wave=20;
 assert.equal(game.exchangeR('T13',[ids[0],ids[0],...ids.slice(2)]).ok,false);
 const {cardId}=game.exchangeR('T13',ids);
 assert.deepEqual(game.state.cards.map(card=>[card.id,card.code,card.refund]),[[cardId,'T13',0]]);
 assert.equal(game.deploy(cardId,190,140).ok,false);
 assert.ok(game.sellCard(cardId).ok);
});

test('SR and SSR use the same population and the 100 cap persists through endless',()=>{
 const game=createLoopGame({startingGold:5000,startingCapacity:100,difficulty:'hard',draftRandom:()=>0});
 game.start();game.openStarter();
 for(const [i,code] of ['T05','T04','T25','T03','T26'].entries()){
  if(i)game.state.cards.push({id:100+i,code,paid:false,refund:0});
  assert.ok(game.deploy(game.state.cards[0].id,190+i*72,140).ok);
 }
 assert.equal(game.state.capacity,100);
 assert.equal(game.state.populationUsed,100);
 const {cardId}=game.draw('R');
 assert.equal(game.deploy(cardId,550,140).message,'部署人口不足');
 assert.ok(game.state.cards.some(card=>card.id===cardId));
 assert.ok(game.sell(game.state.towers[0].id).ok);
 assert.equal(game.state.populationUsed,80);
 assert.ok(game.deploy(cardId,190,140).ok);
 assert.equal(game.state.populationUsed,85);
 const towers=[...game.state.towers];
 game.state.phase='victory';
 assert.ok(game.continueEndless().ok);
 assert.equal(game.state.capacity,100);
 assert.equal(game.state.populationUsed,85);
 assert.deepEqual(game.state.towers,towers);
});
