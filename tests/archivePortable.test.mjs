import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { migrateSave } from '../src/core/save.js';
import { ARCHIVE_TEXT_LIMIT, parseArchiveText, readArchiveSlot, writeArchiveSlot, exportArchiveSlot, importArchiveSlot } from '../src/core/archive.js';
import { archiveScene } from '../src/scenes/archive.js';

const key = id => `nothaven.archive.v1.${id}`;
const savedAt = '2026-11-05T17:00:00.000Z';
const state = () => ({ ...createInitialState(), scene: 'town' });
const text = (s = state()) => JSON.stringify({ version: 1, savedAt, state: s });
const copy = v => structuredClone(v);
function storage() {
  const data = new Map([['nothaven-save', 'quick save untouched']]);
  return { data, getItem(k) { return data.get(k) ?? null; }, setItem(k, v) { data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}
function setup(origin = 'town') {
  const input = { value: '' };
  const g = { state: state(), archiveStorage: storage(), root: { querySelector: () => input },
    scenes: { title: {}, town: {}, explore: {}, archive: archiveScene },
    setScene(name) { this.state.scene = name; } };
  g.state.scene = 'archive'; archiveScene.onEnter(g, { returnScene: origin });
  return { g, input };
}
const act = (g, name, arg) => archiveScene.actions[name](g, { dataset: { arg } });

test('portable round trips preserve migrated state, timestamp and independent keys without mutating source', () => {
  const store = storage(), s = state(); s.story.flags.calibration_reward = true;
  s.reserve = { bram: { ...s.party[0], id: 'bram', tactic: 'conserve', temper: { weapon: 2, armor: 3 } } };
  s.ledger = { victories: 7 }; s.pinnedQuestId = 'signal-calibration';
  const before = copy(s);
  assert.equal(writeArchiveSlot('1', s, null, { storage: store, now: () => new Date(savedAt) }).ok, true);
  const first = store.getItem(key('1')); const exported = exportArchiveSlot('1', store);
  assert.equal(exported.ok, true); assert.equal(parseArchiveText(exported.text).savedAt, savedAt);
  assert.equal(importArchiveSlot('2', exported.text, null, store).ok, true);
  assert.deepEqual(readArchiveSlot('2', store).state, migrateSave(before, createInitialState));
  assert.equal(readArchiveSlot('2', store).savedAt, savedAt);
  assert.equal(store.getItem(key('1')), first); assert.equal(store.getItem(key('3')), null);
  assert.equal(store.getItem('nothaven-save'), 'quick save untouched'); assert.deepEqual(s, before);
  const old = { scene: 'explore', party: [{ name: 'Earlier Warden' }], gold: 3 };
  assert.equal(importArchiveSlot('3', text(old), null, store).ok, true);
  assert.deepEqual(readArchiveSlot('3', store).state, migrateSave(old, createInitialState));
});

test('parser rejects unsupported envelopes, invalid state, oversized/deep/wide input and dangerous keys', () => {
  const good = JSON.parse(text());
  const values = [undefined, null, 5, {}, '', 'null', '[]', '{}', '{bad', ' '.repeat(ARCHIVE_TEXT_LIMIT + 1)];
  for (const change of [{ version: 2 }, { savedAt: 'never' }, { savedAt: 42 }, { state: null },
    ...[{ scene: 'combat' }, { combat: {} }, { party: [] }, { party: [null] }, { party: [7] }, { saveVersion: 999 }].map(v => ({ state: { ...good.state, ...v } }))]) values.push(JSON.stringify({ ...good, ...change }));
  const deep = state(); let p = deep; for (let i = 0; i < 42; i++) p = p.child = {}; values.push(text(deep));
  const wide = state(); wide.extra = Array(20001).fill(0); values.push(text(wide));
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    const s = state(); s.extra = JSON.parse(`{"${name}":{"polluted":true}}`); values.push(text(s));
  }
  for (const raw of values) {
    assert.equal(parseArchiveText(raw).status, 'invalid');
    const store = storage(), before = [...store.data];
    assert.equal(importArchiveSlot('1', raw, null, store).reason, 'invalid');
    assert.deepEqual([...store.data], before);
  }
  assert.equal({}.polluted, undefined);
  assert.equal(parseArchiveText(text()).status, 'ready');
});

test('export/import whitelist slots, reject stale tokens and tolerate unavailable storage', () => {
  const store = storage(); store.setItem(key('1'), text()); const before = [...store.data];
  for (const id of [1, null, undefined, {}, [], 'constructor', '__proto__', '01', '4']) {
    assert.equal(exportArchiveSlot(id, store).ok, false); assert.equal(importArchiveSlot(id, text(), null, store).reason, 'invalid');
  }
  assert.equal(exportArchiveSlot('2', store).ok, false);
  assert.equal(importArchiveSlot('1', text(), null, store).reason, 'changed');
  assert.equal(importArchiveSlot('2', text(), undefined, store).reason, 'invalid');
  const brokenGet = { getItem() { throw Error('blocked'); } };
  const brokenSet = { getItem: () => null, setItem() { throw Error('quota'); } };
  assert.equal(exportArchiveSlot('1', brokenGet).ok, false);
  for (const broken of [brokenGet, brokenSet]) assert.equal(importArchiveSlot('2', text(), null, broken).reason, 'unavailable');
  assert.deepEqual([...store.data], before);
});

test('new saves cannot create an archive that the shared bounded parser refuses', () => {
  for (const extra of [{ constructor: 'bad' }, { huge: 'x'.repeat(ARCHIVE_TEXT_LIMIT) }]) {
    const store = storage(), before = [...store.data];
    assert.equal(writeArchiveSlot('1', { ...state(), extra }, null, { storage: store }).reason, 'invalid');
    assert.deepEqual([...store.data], before);
  }
});

test('Title and journey imports always preview and confirm empty, occupied and invalid destinations', () => {
  for (const origin of ['title', 'town', 'explore']) for (const prior of [null, text(), '{corrupt']) {
    const { g, input } = setup(origin); if (prior !== null) g.archiveStorage.setItem(key('2'), prior);
    const incoming = state(); incoming.gold = 321; input.value = text(incoming);
    const before = copy(g.state), stored = [...g.archiveStorage.data];
    act(g, 'previewArchiveImport', '2'); assert.equal(g.archivePending.operation, 'import');
    assert.deepEqual(g.state, before); assert.deepEqual([...g.archiveStorage.data], stored);
    const html = archiveScene.render(g); assert.match(html, /Confirm import slot 2/); assert.match(html, /Incoming journey/); assert.match(html, /321/);
    act(g, 'cancelArchive'); assert.equal(g.archivePending, null); assert.deepEqual([...g.archiveStorage.data], stored);
    act(g, 'previewArchiveImport', '2'); act(g, 'confirmArchive');
    assert.equal(readArchiveSlot('2', g.archiveStorage).state.gold, 321); assert.deepEqual(g.state, before);
    assert.equal(g.archiveStorage.getItem('nothaven-save'), 'quick save untouched');
    assert.equal(g.archiveStorage.getItem(key('1')), null); assert.equal(g.archiveStorage.getItem(key('3')), null);
    assert.equal(g.archiveImportDraft, ''); assert.equal(g.archivePending, null);
  }
});

test('confirmation imports the preview snapshot, not later edits; stale destination is never replaced', () => {
  const { g, input } = setup(); const incoming = state(); incoming.gold = 123;
  input.value = text(incoming); act(g, 'previewArchiveImport', '1'); input.value = '{later edits';
  act(g, 'confirmArchive'); assert.equal(readArchiveSlot('1', g.archiveStorage).state.gold, 123);
  input.value = text(); act(g, 'previewArchiveImport', '2');
  g.archiveStorage.setItem(key('2'), 'other tab'); const before = copy(g.state);
  act(g, 'confirmArchive'); assert.match(g.archiveMessage, /slot changed/);
  assert.equal(g.archiveStorage.getItem(key('2')), 'other tab'); assert.deepEqual(g.state, before);
});

test('export and render are readonly and textarea content cannot become HTML', () => {
  const { g, input } = setup(); const s = state(); s.party[0].name = '</textarea><img src=x onerror=alert(1)>';
  g.archiveStorage.setItem(key('1'), text(s)); input.value = '</textarea><script>bad</script>';
  const before = copy(g.state), stored = [...g.archiveStorage.data];
  act(g, 'exportArchive', '1'); const html = archiveScene.render(g);
  assert.equal(g.archiveImportDraft, input.value); assert.equal(parseArchiveText(g.archiveExportText).status, 'ready');
  assert.match(html, /id="archive-export-text" readonly/); assert.match(html, /&lt;\/textarea&gt;/);
  assert.doesNotMatch(html, /<img src=x|<script>bad/); assert.deepEqual(g.state, before); assert.deepEqual([...g.archiveStorage.data], stored);
  act(g, 'closeArchiveExport'); assert.equal(g.archiveExportText, undefined); assert.equal(g.archiveImportDraft, input.value);
  act(g, 'previewArchiveImport', '1'); assert.equal(g.archivePending, null); assert.match(g.archiveMessage, /not supported/);
  assert.deepEqual([...g.archiveStorage.data], stored);
  act(g, 'clearArchiveImport'); assert.equal(g.archiveImportDraft, '');
});

test('portable actions reject stale scenes, combat and bad slots; exit/entry clears transfer drafts', () => {
  for (const condition of ['town', 'combat']) {
    const { g, input } = setup(); input.value = text();
    if (condition === 'town') g.state.scene = 'town'; else g.state.combat = {};
    const before = copy(g.state), stored = [...g.archiveStorage.data];
    for (const action of ['exportArchive', 'closeArchiveExport', 'previewArchiveImport', 'clearArchiveImport', 'confirmArchive']) act(g, action, '1');
    assert.deepEqual(g.state, before); assert.deepEqual([...g.archiveStorage.data], stored); assert.equal(g.archiveImportDraft, undefined);
  }
  const { g, input } = setup(); input.value = text();
  for (const id of ['constructor', '__proto__', 1, '4']) { act(g, 'previewArchiveImport', id); act(g, 'exportArchive', id); }
  assert.equal(g.archivePending, null); assert.equal(g.archiveImportDraft, undefined);
  act(g, 'previewArchiveImport', '1'); g.archiveExportText = 'temporary'; act(g, 'leaveArchive');
  for (const prop of ['archiveReturn', 'archivePending', 'archiveMessage', 'archiveImportDraft', 'archiveExportText']) assert.equal(g[prop], undefined);
  g.archiveImportDraft = 'old'; g.archiveExportText = 'old'; archiveScene.onEnter(g, { returnScene: 'title' });
  assert.equal(g.archiveImportDraft, undefined); assert.equal(g.archiveExportText, undefined);
});
