import test from 'node:test';
import assert from 'node:assert/strict';
import { titleScene } from '../src/scenes/title.js';
import { townScene } from '../src/scenes/town.js';
import { createInitialState } from '../src/state.js';

function gameStub() {
  return {
    state: createInitialState(),
    storyDialogue: { speaker: 'Old conversation', location: 'greyhaven' },
    storyMessage: 'Old update',
    setScene(name) { this.enteredScene = name; this.state.scene = name; },
  };
}

test('new journey resets story transients and enters town', () => {
  const game = gameStub();
  titleScene.actions.newGame(game);
  assert.equal(game.storyDialogue, null);
  assert.equal(game.storyMessage, '');
  assert.equal(game.enteredScene, 'town');
  assert.equal(game.state.location, 'greyhaven');
});

test('continue clears story transients after loading a valid save', () => {
  const saved = createInitialState();
  saved.gold = 47;
  globalThis.localStorage = { getItem: key => key === 'nothaven-save' ? JSON.stringify(saved) : null };
  try {
    const game = gameStub();
    titleScene.actions.continue(game);
    assert.equal(game.state.gold, 47);
    assert.equal(game.storyDialogue, null);
    assert.equal(game.storyMessage, '');
    assert.equal(game.enteredScene, 'town');
  } finally {
    delete globalThis.localStorage;
  }
});

test('town renders the shared story panel and exposes its actions', () => {
  const game = gameStub();
  game.storyDialogue = null;
  game.storyMessage = '';
  const html = townScene.render(game);
  assert.match(html, /Speak to Warden Mara/);
  assert.match(html, /Quest journal/);
  assert.equal(typeof townScene.actions.storyTalk, 'function');
  townScene.actions.storyTalk(game, { dataset: { arg: 'mara' } });
  assert.equal(game.state.story.stage, 'road');
  assert.match(townScene.render(game), /story-dialogue/);
});

test('continue resumes a valid saved exploration in its current zone', () => {
  const saved = createInitialState();
  saved.scene = 'explore';
  saved.location = 'ridge_road';
  saved.map = {
    zoneId: 'ridge_road',
    x: 4,
    y: 2,
    visitedZones: { greyhaven: true, ridge_road: true },
    clearedEncounters: {},
    completedInteractions: {},
    log: [],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
  try {
    const game = gameStub();
    titleScene.actions.continue(game);
    assert.equal(game.enteredScene, 'explore');
    assert.equal(game.state.scene, 'explore');
    assert.equal(game.state.location, 'ridge_road');
    assert.equal(game.state.map.zoneId, 'ridge_road');
    assert.equal(game.state.map.x, 4);
    assert.equal(game.state.map.y, 2);
  } finally {
    delete globalThis.localStorage;
  }
});

test('continue synchronizes a non-exploration save to Greyhaven before town', () => {
  const saved = createInitialState();
  saved.scene = 'town';
  saved.location = 'ridge_road';
  saved.map = {
    zoneId: 'ridge_road',
    x: 4,
    y: 2,
    visitedZones: { greyhaven: true, ridge_road: true },
    clearedEncounters: {},
    completedInteractions: {},
    log: [],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
  try {
    const game = gameStub();
    titleScene.actions.continue(game);
    assert.equal(game.enteredScene, 'town');
    assert.equal(game.state.scene, 'town');
    assert.equal(game.state.location, 'greyhaven');
    assert.equal(game.state.map.zoneId, 'greyhaven');
    assert.equal(game.state.map.x, 2);
    assert.equal(game.state.map.y, 3);
  } finally {
    delete globalThis.localStorage;
  }
});

test('continue does not resume exploration when location and map disagree', () => {
  const saved = createInitialState();
  saved.scene = 'explore';
  saved.location = 'ridge_road';
  saved.map = { zoneId: 'greyhaven', x: 4, y: 2 };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
  try {
    const game = gameStub();
    titleScene.actions.continue(game);
    assert.equal(game.enteredScene, 'town');
    assert.equal(game.state.location, 'greyhaven');
    assert.equal(game.state.map.zoneId, 'greyhaven');
  } finally {
    delete globalThis.localStorage;
  }
});

test('inn rest restores gear-boosted max HP and clears statuses', () => {
  const game = gameStub();
  const hero = game.state.party[0];
  hero.equipment = { weapon: null, armor: null, trinket: 'storm_lantern' };
  hero.hp = 1; hero.mp = 0; hero.statuses = [{ id: 'bleeding', turns: 2 }];
  game.state.gold = 10;
  townScene.actions.rest(game);
  assert.equal(game.state.gold, 5);
  assert.equal(hero.hp, hero.maxHp + 8);
  assert.equal(hero.mp, hero.maxMp);
  assert.deepEqual(hero.statuses, []);
});

test('import preview escapes all field values against HTML injection', () => {
  globalThis.localStorage = { getItem: () => null };
  try {
  const game = gameStub();
  game.pendingImportPreview = {
    heroName: 'Wren',
    level: '<span data-import-markup="inert">not a level</span>',
    location: '<img src=x onerror=alert(1)>',
    scene: '<script>alert(1)</script>',
    gold: '<b>42</b>',
    partyCount: 2,
    saveVersion: '<i>2</i>',
  };
  const html = titleScene.render(game);
  // Raw markup must never survive into the preview block.
  assert.doesNotMatch(html, /<span data-import-markup="inert">/);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<b>42<\/b>/);
  assert.doesNotMatch(html, /<i>2<\/i>/);
  // Escaped forms are present instead.
  assert.match(html, /&lt;span data-import-markup=&quot;inert&quot;&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;42&lt;\/b&gt;/);
  assert.match(html, /&lt;i&gt;2&lt;\/i&gt;/);
  } finally {
    delete globalThis.localStorage;
  }
});
