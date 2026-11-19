import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';

test('the free SR opens once and the timer starts after successful deployment', () => {
 const game=createGame({draftRandom:()=>0});
 game.start();game.tick(5);
 assert.equal(game.state.elapsed,0);
 assert.equal(game.state.gold,80);
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

test('packs respect their tier ceilings, failures preserve pity, and the fifth SSR pack guarantees SSR', () => {
 const game=createGame({startingGold:5000,draftRandom:()=>0,random:()=>{throw Error('drawing advanced the road RNG');}});
 game.start();
 for(let i=1;i<=4;i++){
  const result=game.draw('SSR');assert.ok(result.ok);
  assert.equal(game.state.cards.find(card=>card.id===result.cardId).refund,30);
  assert.equal(game.state.ssrMisses,i);
 }
 assert.ok(game.draw('SR').ok);
 assert.equal(game.state.ssrMisses,4);
 const before=game.state.gold;
 game.togglePause();assert.equal(game.draw('SSR').ok,false);game.togglePause();
 assert.equal(game.state.gold,before);assert.equal(game.state.ssrMisses,4);
 const result=game.draw('SSR');
 assert.equal(game.state.cards.find(card=>card.id===result.cardId).refund,187);
 assert.equal(game.state.ssrMisses,0);
 game.restart();assert.equal(game.state.ssrMisses,0);
});

test('adjacent towers use real placement rules and five distinct R cards redeem one credential', () => {
 const game=createGame({startingGold:2000,draftRandom:()=>0});
 game.start();game.openStarter();
 for(const [i,x] of [190,262,334].entries()){
  if(i)assert.ok(game.draw('R').ok);
  assert.ok(game.deploy(game.state.cards[0].id,x,140).ok);
 }
 assert.equal(game.state.populationUsed,4);
 const ids=Array.from({length:5},()=>game.draw('R').cardId);
 assert.equal(game.exchangeR('T13',ids).ok,false);
 game.state.wave=25;
 assert.equal(game.exchangeR('T13',[ids[0],ids[0],...ids.slice(2)]).ok,false);
 const {cardId}=game.exchangeR('T13',ids);
 assert.deepEqual(game.state.cards.map(card=>[card.id,card.code,card.refund]),[[cardId,'T13',0]]);
 assert.equal(game.deploy(cardId,406,140).ok,false);
 assert.ok(game.sellCard(cardId).ok);
});
