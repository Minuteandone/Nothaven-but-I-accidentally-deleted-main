import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, saveGame, hasSave, clearAutosave } from '../src/state.js';
import { deleteSave } from '../src/core/saveManager.js';
import { readArchiveSlot, writeArchiveSlot } from '../src/core/archive.js';
import { saveAudioPreferences } from '../src/audio/soundscape.js';
import { saveDisplayPreferences } from '../src/ui/displayControls.js';
import { saveGuidancePreferences } from '../src/ui/guidance.js';

test('Nothaven saves and preferences never overwrite original Stormhaven browser storage', () => {
  const originalKeys = [
    'stormhaven-save', 'stormhaven-autosave', 'stormhaven-save.backup',
    'stormhaven.archive.v1.1', 'stormhaven.audio.v1',
    'stormhaven.display.v1', 'stormhaven.guidance.v1',
  ];
  const contents = new Map(originalKeys.map((key) => [key, 'untouched original']));
  const storage = {
    getItem(key) { return contents.get(key) ?? null; },
    setItem(key, value) { contents.set(key, String(value)); },
    removeItem(key) { contents.delete(key); },
  };
  const before = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    const state = createInitialState();
    state.scene = 'town';
    saveGame(state);
    assert.equal(hasSave(), true);
    assert.ok(contents.has('nothaven-save'));
    assert.deepEqual(writeArchiveSlot('1', state, null, { storage }), { ok: true });
    assert.equal(readArchiveSlot('1', storage).status, 'ready');
    assert.ok(contents.has('nothaven.archive.v1.1'));
    saveAudioPreferences(storage, { muted: false, volume: 0.5 });
    saveDisplayPreferences(storage, { textScale: 115 });
    saveGuidancePreferences(storage, { dismissed: { title: true } });
    assert.ok(contents.has('nothaven.audio.v1'));
    assert.ok(contents.has('nothaven.display.v1'));
    assert.ok(contents.has('nothaven.guidance.v1'));
    clearAutosave();
    assert.equal(deleteSave(), true);
    assert.equal(contents.has('nothaven-save'), false);
    for (const key of originalKeys) assert.equal(contents.get(key), 'untouched original', key);
  } finally {
    globalThis.localStorage = before;
  }
});
