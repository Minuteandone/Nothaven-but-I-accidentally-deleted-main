import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, saveGame, loadGame } from '../src/state.js';
import { applyStoryEvent } from '../src/story/index.js';
import { getPinnedQuest, pinQuest, unpinQuest } from '../src/story/pinnedQuest.js';
import { renderPinnedQuest } from '../src/ui/pinnedQuest.js';
import { questJournalScene, renderQuestEntry } from '../src/scenes/quests.js';
import { townScene } from '../src/scenes/town.js';
import { exploreScene } from '../src/map/exploreScene.js';
import { ensureMapState } from '../src/map/mapState.js';
import { readArchiveSlot, writeArchiveSlot, ARCHIVE_SLOTS } from '../src/core/archive.js';

const clone = value => structuredClone(value);
const el = arg => ({ dataset: { arg } });
function state(scene = 'town') { const s = createInitialState(); s.scene = scene; ensureMapState(s); return s; }
function event(s, e) { s.story = applyStoryEvent(s.story, e).state; }
function completeRoad(s) {
  event(s, { type: 'talk', npcId: 'mara' });
  event(s, { type: 'visit', locationId: 'ridge_road' });
  event(s, { type: 'victory', encounterId: 'ridge_patrol' });
  event(s, { type: 'talk', npcId: 'mara' });
}
function store() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}

test('old saves and malformed or unknown pins render nothing without mutation', () => {
  const s = state(), before = clone(s);
  assert.equal(getPinnedQuest(s), null); assert.equal(renderPinnedQuest(s), '');
  assert.deepEqual(s, before); assert.equal(Object.hasOwn(s, 'pinnedQuestId'), false);
  for (const id of [null, undefined, 1, true, {}, [], ['road'], 'constructor', '__proto__', 'toString', 'road\n', 'lens', 'not_a_job']) {
    const candidate = { ...clone(s), pinnedQuestId: id }, saved = clone(candidate);
    assert.equal(getPinnedQuest(candidate), null); assert.equal(renderPinnedQuest(candidate), '');
    assert.deepEqual(candidate, saved);
    assert.equal(pinQuest(candidate, id), false); assert.deepEqual(candidate, saved);
  }
  assert.equal(getPinnedQuest(null), null); assert.equal(pinQuest(null, 'road'), false);
  assert.equal(unpinQuest(null, 'road'), false);
});

test('pinning and removing change only the optional field; stale removal cannot clear a new pin', () => {
  const s = state(); event(s, { type: 'talk', npcId: 'tamsin' });
  const before = clone(s);
  assert.equal(pinQuest(s, 'road'), true);
  assert.deepEqual(s, { ...before, pinnedQuestId: 'road' });
  assert.equal(pinQuest(s, 'dispatches'), true);
  assert.deepEqual(s, { ...before, pinnedQuestId: 'dispatches' });
  assert.equal(unpinQuest(s, 'road'), false);
  assert.equal(unpinQuest(s, ['dispatches']), false);
  assert.deepEqual(s, { ...before, pinnedQuestId: 'dispatches' });
  assert.equal(unpinQuest(s, 'dispatches'), true); assert.deepEqual(s, before);
});

test('the current objective follows real story events and completion does not switch or clear the pin', () => {
  const s = state(); pinQuest(s, 'road');
  assert.match(getPinnedQuest(s).objective, /Speak to Warden Mara/);
  event(s, { type: 'talk', npcId: 'mara' });
  assert.match(getPinnedQuest(s).objective, /Visit the ridge road/);
  event(s, { type: 'visit', locationId: 'ridge_road' });
  event(s, { type: 'victory', encounterId: 'ridge_patrol' });
  assert.match(getPinnedQuest(s).objective, /Return to Mara/);
  event(s, { type: 'talk', npcId: 'mara' });
  const before = clone(s);
  assert.equal(getPinnedQuest(s).status, 'complete'); assert.equal(s.pinnedQuestId, 'road');
  assert.match(renderPinnedQuest(s), /Pinned objective · Completed/);
  assert.equal(pinQuest(s, 'road'), false); assert.deepEqual(s, before);
  assert.equal(pinQuest(s, 'lens'), true); assert.equal(getPinnedQuest(s).id, 'lens');
});

test('pin preference survives quick save and each Archive slot; no automatic storage writes', t => {
  const storage = store(), previous = globalThis.localStorage;
  globalThis.localStorage = storage;
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const s = state('explore');
  saveGame(s); const oldQuick = storage.getItem('nothaven-save');
  pinQuest(s, 'road'); renderPinnedQuest(s);
  assert.equal(storage.getItem('nothaven-save'), oldQuick);
  saveGame(s); const quick = storage.getItem('nothaven-save');
  assert.deepEqual(loadGame(), s);
  for (const id of ARCHIVE_SLOTS) {
    assert.equal(writeArchiveSlot(id, s, null, { storage }).ok, true);
    assert.deepEqual(readArchiveSlot(id, storage).state, s);
    assert.equal(getPinnedQuest(readArchiveSlot(id, storage).state).id, 'road');
  }
  unpinQuest(s, 'road');
  assert.equal(storage.getItem('nothaven-save'), quick);
  assert.equal(readArchiveSlot('1', storage).state.pinnedQuestId, 'road');
});

test('journal native toggles revalidate active entries and refuse stale or combat actions', () => {
  const s = state('quests'), game = { state: s };
  const before = clone(s);
  questJournalScene.actions.pinObjective(game, el('road'));
  assert.deepEqual(s, { ...before, pinnedQuestId: 'road' });
  const selected = questJournalScene.render(game);
  assert.match(selected, /data-action="pinObjective" data-arg="road" aria-pressed="true"/);
  assert.match(selected, /Pinned: A Light in the Storm/);
  assert.match(selected, /aria-label="Pin objective: A Light in the Storm"/);
  questJournalScene.actions.pinObjective(game, el('road')); assert.deepEqual(s, before);
  for (const id of [[], {}, null, undefined, 0, 'lens', 'constructor', 'road\n']) {
    questJournalScene.actions.pinObjective(game, el(id)); assert.deepEqual(s, before);
  }
  for (const scene of ['town', 'explore', 'combat', 'title']) {
    s.scene = scene; const snapshot = clone(s);
    questJournalScene.actions.pinObjective(game, el('road')); assert.deepEqual(s, snapshot);
  }
  s.scene = 'quests'; s.combat = {}; const battling = clone(s);
  questJournalScene.actions.pinObjective(game, el('road')); assert.deepEqual(s, battling);
  s.combat = null; pinQuest(s, 'road'); completeRoad(s); const complete = clone(s);
  questJournalScene.actions.pinObjective(game, el('road')); assert.deepEqual(s, complete);
  game.questJournalFilter = 'all';
  assert.match(questJournalScene.render(game), /data-action="unpinObjective" data-arg="road"/);
  assert.doesNotMatch(renderQuestEntry(getPinnedQuest(s)), /data-action="pinObjective"/);
  questJournalScene.actions.unpinObjective(game, el('road'));
  const expected = clone(complete); delete expected.pinnedQuestId; assert.deepEqual(s, expected);
});

test('unpin actions are scene-guarded and cannot remove a different current pin', () => {
  for (const [scene, implementation] of [['quests', questJournalScene], ['town', townScene], ['explore', exploreScene]]) {
    const s = state(scene), game = { state: s }; pinQuest(s, 'road');
    for (const arg of [null, [], {}, 'dispatches', 'constructor']) {
      const before = clone(s); implementation.actions.unpinObjective(game, el(arg)); assert.deepEqual(s, before);
    }
    s.combat = {}; let before = clone(s);
    implementation.actions.unpinObjective(game, el('road')); assert.deepEqual(s, before);
    s.combat = null; s.scene = 'title'; before = clone(s);
    implementation.actions.unpinObjective(game, el('road')); assert.deepEqual(s, before);
    s.scene = scene; before = clone(s); delete before.pinnedQuestId;
    implementation.actions.unpinObjective(game, el('road')); assert.deepEqual(s, before);
  }
});

test('Town and Explore show a read-only pin with a conditional journal link', () => {
  for (const [scene, implementation, action] of [['town', townScene, 'questJournal'], ['explore', exploreScene, 'openQuests']]) {
    const s = state(scene); pinQuest(s, 'road');
    const game = { state: s, scenes: { quests: questJournalScene } }, before = clone(s);
    const html = implementation.render(game);
    assert.match(html, /class="panel pinned-objective"/);
    assert.match(html, /Speak to Warden Mara in Greyhaven\./);
    assert.match(html, new RegExp(`data-action="${action}"`));
    assert.match(html, /data-action="unpinObjective" data-arg="road"/);
    assert.deepEqual(s, before);
    game.scenes = {};
    const without = implementation.render(game);
    assert.match(without, /class="panel pinned-objective"/);
    assert.doesNotMatch(without, new RegExp(`data-action="${action}"`)); assert.deepEqual(s, before);
  }
});

test('journal controls and tracker action attributes escape dynamic text; rendering stays read-only', () => {
  const entry = { id: '"><img src=x>', title: '<script>unsafe</script>', objective: '<b>unsafe</b>', status: 'active' };
  const before = clone(entry), html = renderQuestEntry(entry, entry.id);
  assert.doesNotMatch(html, /<script>|<img|<b>/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;b&gt;/);
  assert.match(html, /data-arg="&quot;&gt;&lt;img src=x&gt;"/); assert.deepEqual(entry, before);
  const s = state(); pinQuest(s, 'road'); const saved = clone(s);
  const tracker = renderPinnedQuest(s, { journalAction: '"><img src=x>' });
  assert.doesNotMatch(tracker, /<img/); assert.match(tracker, /data-action="&quot;&gt;&lt;img src=x&gt;"/);
  assert.deepEqual(s, saved);
});
