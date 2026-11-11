import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, saveGame } from '../src/state.js';
import { migrateSave } from '../src/core/save.js';
import { ARCHIVE_SLOTS, readArchiveSlot, writeArchiveSlot, deleteArchiveSlot } from '../src/core/archive.js';
import { resumeJourney } from '../src/core/resume.js';
import { archiveScene, installJourneyArchive } from '../src/scenes/archive.js';
import { titleScene } from '../src/scenes/title.js';
import { townScene } from '../src/scenes/town.js';
import { exploreScene } from '../src/map/exploreScene.js';
import { ensureMapState } from '../src/map/mapState.js';
import { createCompanionMember, dismissCompanion } from '../src/party/companions.js';

const key = id => `nothaven.archive.v1.${id}`;
const date = () => new Date('2026-11-05T17:00:00.000Z');
function storage() {
  const data = new Map();
  return { data, getItem(k) { return data.get(k) ?? null; }, setItem(k, v) { data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}
function state(scene = 'town') { const s = createInitialState(); s.scene = scene; ensureMapState(s); return s; }
function setup(origin = 'town') {
  const game = { state: state(origin), archiveStorage: storage(), scenes: { title: {}, town: {}, explore: {}, archive: archiveScene },
    setScene(name, data) { this.state.scene = name; this.lastScene = { name, data }; if (name === 'archive') archiveScene.onEnter(this, data); } };
  game.setScene('archive', { returnScene: origin });
  return game;
}
const act = (g, action, arg) => archiveScene.actions[action](g, { dataset: { arg } });
const copy = value => structuredClone(value);

test('three archive slots preserve optional journey data and the independent quick save', () => {
  const store = storage(), s = state('explore');
  s.ledger = { victories: 7 };
  s.party[0].temper = { weapon: 2, armor: 1 };
  const sela = createCompanionMember('sela', 4);
  sela.tactic = 'conserve'; sela.temper = { weapon: 1, armor: 2 };
  const bram = createCompanionMember('bram', 4);
  bram.tactic = 'conserve'; bram.temper = { weapon: 3, armor: 3 };
  s.party.push(sela, bram);
  assert.equal(dismissCompanion(s, 'bram').ok, true);
  assert.deepEqual(s.reserve, { bram });
  s.story.ending = 'protect_town'; s.map.x = 3; s.map.y = 2;
  const before = copy(s); store.setItem('nothaven-save', 'original quick save');
  for (const id of ARCHIVE_SLOTS) {
    assert.deepEqual(writeArchiveSlot(id, s, null, { storage: store, now: date }), { ok: true });
    const read = readArchiveSlot(id, store);
    assert.equal(read.status, 'ready'); assert.equal(read.savedAt, date().toISOString());
    assert.deepEqual(read.state, migrateSave(copy(s), createInitialState));
    assert.deepEqual(read.state.reserve, { bram });
    assert.deepEqual(read.state.party[0].temper, { weapon: 2, armor: 1 });
    assert.deepEqual(read.state.party[1], sela);
    assert.equal(Object.hasOwn(read.state, 'reserves'), false);
  }
  assert.deepEqual(s, before); assert.equal(store.getItem('nothaven-save'), 'original quick save');
  assert.equal(store.data.size, 4);
  const raw = store.getItem(key('2'));
  assert.deepEqual(deleteArchiveSlot('2', raw, store), { ok: true });
  assert.equal(readArchiveSlot('2', store).status, 'empty');
  assert.equal(readArchiveSlot('1', store).status, 'ready'); assert.equal(readArchiveSlot('3', store).status, 'ready');
});

test('slot IDs are strict and invalid operations never touch storage', () => {
  const store = storage(), s = state();
  for (const id of [1, 2, null, undefined, {}, [], '0', '4', '01', '1\n', 'constructor', '__proto__']) {
    assert.equal(readArchiveSlot(id, store).status, 'invalid-slot');
    assert.equal(writeArchiveSlot(id, s, null, { storage: store }).ok, false);
    assert.equal(deleteArchiveSlot(id, 'data', store).ok, false);
  }
  assert.equal(store.data.size, 0);
  for (const scene of ['title', 'archive', 'combat']) assert.equal(writeArchiveSlot('1', { ...s, scene }, null, { storage: store }).ok, false);
  assert.equal(writeArchiveSlot('1', { ...s, combat: {} }, null, { storage: store }).ok, false);
  assert.equal(writeArchiveSlot('1', s, undefined, { storage: store }).ok, false);
});

test('empty, corrupt, future, malformed and unavailable archives are distinguished', () => {
  const store = storage(); assert.equal(readArchiveSlot('1', store).status, 'empty');
  const good = { version: 1, savedAt: date().toISOString(), state: state() };
  for (const raw of ['', '{broken', 'null', '[]', '{}', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, savedAt: 'not a date' }), JSON.stringify({ ...good, state: { ...good.state, saveVersion: 99 } }), JSON.stringify({ ...good, state: { ...good.state, party: [] } }), JSON.stringify({ ...good, state: { ...good.state, scene: 'archive' } })]) {
    store.setItem(key('1'), raw); assert.equal(readArchiveSlot('1', store).status, 'invalid'); assert.equal(store.getItem(key('1')), raw);
  }
  const broken = { getItem() { throw new Error('disabled'); } };
  assert.equal(readArchiveSlot('1', broken).status, 'unavailable');
  assert.deepEqual(writeArchiveSlot('1', state(), null, { storage: broken }), { ok: false, reason: 'unavailable' });
});

test('failed writes/deletes and stale tokens preserve the existing checkpoint', () => {
  const store = storage(); writeArchiveSlot('1', state(), null, { storage: store, now: date });
  const raw = store.getItem(key('1'));
  assert.equal(writeArchiveSlot('1', state(), null, { storage: store }).reason, 'changed');
  assert.equal(deleteArchiveSlot('1', 'stale', store).reason, 'changed');
  const broken = { getItem: store.getItem.bind(store), setItem() { throw new Error('quota'); }, removeItem() { throw new Error('disabled'); } };
  assert.equal(writeArchiveSlot('1', state(), raw, { storage: broken }).reason, 'unavailable');
  assert.equal(deleteArchiveSlot('1', raw, broken).reason, 'unavailable');
  assert.equal(store.getItem(key('1')), raw);
});

test('empty save uses source scene, not archive, without changing live state', () => {
  for (const origin of ['town', 'explore']) {
    const g = setup(origin), before = copy(g.state);
    act(g, 'saveArchive', '1'); assert.deepEqual(g.state, before);
    assert.equal(readArchiveSlot('1', g.archiveStorage).state.scene, origin);
    assert.equal(g.archivePending, null); assert.match(g.archiveMessage, /quick save is unchanged/);
  }
});

test('overwrite and delete require confirmation; cancel is state/storage neutral', () => {
  const g = setup(); act(g, 'saveArchive', '1'); const raw = g.archiveStorage.getItem(key('1'));
  g.state.gold = 81; const before = copy(g.state);
  act(g, 'saveArchive', '1'); assert.equal(g.archivePending.operation, 'save');
  assert.equal(g.archiveStorage.getItem(key('1')), raw); act(g, 'cancelArchive');
  assert.deepEqual(g.state, before); assert.equal(g.archiveStorage.getItem(key('1')), raw);
  act(g, 'saveArchive', '1'); act(g, 'confirmArchive');
  assert.equal(readArchiveSlot('1', g.archiveStorage).state.gold, 81); assert.deepEqual(g.state, before);
  const changed = g.archiveStorage.getItem(key('1'));
  act(g, 'deleteArchive', '1'); assert.equal(g.archiveStorage.getItem(key('1')), changed);
  act(g, 'cancelArchive'); assert.equal(g.archiveStorage.getItem(key('1')), changed);
  act(g, 'deleteArchive', '1'); act(g, 'confirmArchive'); assert.equal(g.archiveStorage.getItem(key('1')), null);
  assert.deepEqual(g.state, before);
});

test('loading requires confirmation and restores field coordinates without writing quick save', () => {
  const g = setup('explore'); g.state.map.x = 3; g.state.map.y = 2;
  g.archiveStorage.setItem('nothaven-save', 'untouched'); act(g, 'saveArchive', '1');
  g.state.gold = 1; g.state.map.x = 1; const before = copy(g.state);
  act(g, 'loadArchive', '1'); assert.deepEqual(g.state, before); act(g, 'cancelArchive'); assert.deepEqual(g.state, before);
  act(g, 'loadArchive', '1'); act(g, 'confirmArchive');
  assert.equal(g.state.scene, 'explore'); assert.equal(g.state.map.x, 3); assert.equal(g.state.map.y, 2); assert.equal(g.state.gold, 20);
  assert.equal(g.archiveStorage.getItem('nothaven-save'), 'untouched');
  assert.equal(g.archiveReturn, undefined); assert.equal(g.archivePending, undefined); assert.equal(g.storyDialogue, null);
});

test('all confirmation kinds refuse slots changed after selection', () => {
  for (const operation of ['save', 'load', 'delete']) {
    const g = setup(); act(g, 'saveArchive', '1'); act(g, `${operation}Archive`, '1');
    g.archiveStorage.setItem(key('1'), 'another tab changed this'); const before = copy(g.state);
    act(g, 'confirmArchive'); assert.deepEqual(g.state, before);
    assert.equal(g.archiveStorage.getItem(key('1')), 'another tab changed this'); assert.match(g.archiveMessage, /slot changed/);
  }
});

test('title saves, malformed arguments, stale actions and active combat are rejected', () => {
  const title = setup('title'); act(title, 'saveArchive', '1'); assert.equal(title.archiveStorage.data.size, 0);
  for (const id of [1, '', null, 'constructor', '01', '1\n']) {
    const g = setup(), before = copy(g.state);
    for (const action of ['saveArchive', 'loadArchive', 'deleteArchive']) act(g, action, id);
    assert.deepEqual(g.state, before); assert.equal(g.archiveStorage.data.size, 0);
  }
  for (const condition of ['town', 'combat']) {
    const g = setup(); if (condition === 'town') g.state.scene = 'town'; else g.state.combat = { turn: 1 };
    const before = copy(g.state);
    act(g, 'saveArchive', '1'); act(g, 'loadArchive', '1'); act(g, 'deleteArchive', '1'); act(g, 'confirmArchive'); act(g, 'leaveArchive');
    assert.deepEqual(g.state, before); assert.equal(g.archiveStorage.data.size, 0);
  }
});

test('corrupt slots require explicit overwrite/delete and storage failures do not change journey', () => {
  const g = setup(); g.archiveStorage.setItem(key('1'), '{broken'); const before = copy(g.state);
  act(g, 'loadArchive', '1'); assert.equal(g.archivePending, null);
  act(g, 'saveArchive', '1'); assert.equal(g.archiveStorage.getItem(key('1')), '{broken'); act(g, 'confirmArchive');
  assert.equal(readArchiveSlot('1', g.archiveStorage).status, 'ready'); assert.deepEqual(g.state, before);
  g.archiveStorage.setItem = () => { throw new Error('quota'); };
  act(g, 'saveArchive', '2'); assert.match(g.archiveMessage, /unavailable/); assert.deepEqual(g.state, before);
});

test('rendering escapes previews and messages, has native labelled controls, and is read-only', () => {
  const g = setup(); g.state.party[0].name = '<script>alert(1)</script>'; act(g, 'saveArchive', '1');
  g.archiveMessage = '<img onerror=x>'; const before = copy(g.state), keys = [...g.archiveStorage.data];
  const html = archiveScene.render(g);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img onerror=x&gt;/); assert.doesNotMatch(html, /<script>|<img onerror/);
  assert.match(html, /Save to slot 1/); assert.match(html, /Load slot 1/); assert.match(html, /Delete slot 1/); assert.match(html, /role="status"/);
  assert.deepEqual(g.state, before); assert.deepEqual([...g.archiveStorage.data], keys);
  act(g, 'loadArchive', '1'); const pending = archiveScene.render(g);
  assert.match(pending, /role="group" aria-label="Confirm archive action"/); assert.match(pending, /current unsaved journey/); assert.match(pending, /Confirm load slot 1/);
});

test('archive Back clears transients and returns without storage or journey changes', () => {
  for (const origin of ['title', 'town', 'explore']) {
    const g = setup(origin), before = copy(g.state); before.scene = origin;
    act(g, 'leaveArchive'); assert.deepEqual(g.state, before); assert.equal(g.archiveStorage.data.size, 0);
    assert.equal(g.archiveReturn, undefined); assert.equal(g.archiveMessage, undefined);
  }
});

test('optional entry actions and installer preserve scene contracts', () => {
  const g = setup(); const calls = []; g.registerScene = (id, scene) => calls.push([id, scene]);
  installJourneyArchive(g); assert.deepEqual(calls, [['archive', archiveScene]]);
  for (const [scene, action, origin] of [[titleScene, 'archive', 'title'], [townScene, 'archive', 'town'], [exploreScene, 'openArchive', 'explore']]) {
    g.state.scene = 'bag'; scene.actions[action](g); assert.equal(g.state.scene, 'bag');
    g.state.scene = origin; scene.actions[action](g); assert.equal(g.archiveReturn, origin); assert.equal(g.state.scene, 'archive');
    delete g.scenes.archive; g.state.scene = origin; scene.actions[action](g); assert.equal(g.state.scene, origin); g.scenes.archive = archiveScene;
  }
});

test('shared resume follows existing Continue fallback and leaves quick save unchanged', t => {
  const store = storage(); const old = globalThis.localStorage; globalThis.localStorage = store;
  t.after(() => { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; });
  const original = state('town'); original.gold = 73; saveGame(original); const quick = store.getItem('nothaven-save');
  const g = setup('title'); titleScene.actions.continue(g);
  assert.equal(g.state.scene, 'town'); assert.equal(g.state.gold, 73); assert.equal(g.state.map.zoneId, 'greyhaven');
  assert.equal(store.getItem('nothaven-save'), quick);
  const malformed = state('explore'); malformed.map.zoneId = 'constructor'; malformed.location = 'constructor';
  resumeJourney(g, malformed); assert.equal(g.state.scene, 'town'); assert.equal(g.state.location, 'greyhaven');
});
