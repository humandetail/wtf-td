import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../engine.js';

test('loop draft keeps a paid card until valid deployment and returns the fixed resale', () => {
  const game = createGame({draftRandom: () => 0});
  game.start();
  game.tick(5);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.draft.cost, 0);
  assert.equal(game.chooseCard(0).ok, true);
  assert.equal(game.draw().ok, true);
  assert.equal(game.state.gold, 300);
  assert.equal(new Set(game.state.draft.codes).size, 3);
  assert.equal(game.draw().ok, false);
  assert.equal(game.chooseCard(0).ok, true);
  const paid = game.state.cards.find(card => card.paid);
  assert.equal(game.deploy(paid.id, 640, 400).ok, false);
  assert.equal(game.state.cards.length, 2);
  const build = game.deploy(paid.id, 500, 300);
  assert.equal(build.ok, true);
  assert.equal(game.state.towers[0].level, 1);
  assert.equal(game.state.towers[0].xp, 0);
  assert.equal(game.sell(build.towerId).ok, true);
  assert.equal(game.state.gold, 375);
});

test('a full population leaves an unplaced card sellable and the draft independent of road randomness', () => {
  const game = createGame({startingGold:600,draftRandom: () => 0,random: () => {throw Error('drawing may not advance the road generator');}});
  game.start();
  game.chooseCard(0);
  const points = [[500,300],[780,300],[500,500],[780,500]];
  for(const [i,[x,y]] of points.entries()){
    if(i){assert.ok(game.draw().ok);game.chooseCard(0);}
    assert.ok(game.deploy(game.state.cards[0].id,x,y).ok);
  }
  assert.equal(game.state.populationUsed,4);
  assert.equal(game.state.gold,150);
  assert.ok(game.draw().ok);
  game.chooseCard(0);
  const card=game.state.cards[0];
  assert.equal(game.deploy(card.id,190,140).ok,false);
  assert.deepEqual(game.state.cards.map(c=>c.id),[card.id]);
  assert.ok(game.sellCard(card.id).ok);
  assert.equal(game.state.gold,75);
  assert.equal(game.state.populationUsed,4);
});
