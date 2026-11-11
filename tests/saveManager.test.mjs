import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, saveGame, hasSave, enableAutosave, disableAutosave, scheduleAutosave, isAutosaveEnabled, hasAutosave, loadAutosave, clearAutosave, installAutosave } from '../src/state.js';
import { bus } from '../src/events.js';
import { exportSave, importSave, validateImportSave, commitImportSave, deleteSave, SAVE_TEXT_LIMIT } from '../src/core/saveManager.js';
import { SAVE_VERSION } from '../src/core/save.js';

const SAVE_KEY = 'nothaven-save';
const AUTOSAVE_KEY = 'nothaven-autosave';
const EGG_RE = /\b(egg|yolk|hatch|lay|nest|roost|brood|coop|fowl|flock|talon|beak|plumage|fledgling|peck|yoke|layer|ovoid|oval|ellipse|shell|crack|chick|hen|rooster|easter)\b/i;

function storage() {
  const data = new Map();
  return { data, getItem(k) { return data.get(k) ?? null; }, setItem(k, v) { data.set(k, String(v)); }, removeItem(k) { data.delete(k); } };
}

// --- exportSave tests ---

test('exportSave returns false when no save exists', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    assert.equal(exportSave(), false);
  } finally {
    globalThis.localStorage = old;
  }
});

test('exportSave returns true when save exists (mocked DOM)', () => {
  const st = storage();
  const state = createInitialState();
  state.gold = 999;
  st.setItem(SAVE_KEY, JSON.stringify(state));
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  const oldDoc = globalThis.document;
  const oldURL = globalThis.URL;
  globalThis.document = {
    createElement: () => ({ href: '', download: '', click() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
  try {
    assert.equal(exportSave(), true);
  } finally {
    globalThis.localStorage = old;
    globalThis.document = oldDoc;
    globalThis.URL = oldURL;
  }
});

test('exportSave output contains no egg words (format check)', () => {
  const state = createInitialState();
  const data = { ...state, combat: null, saveVersion: SAVE_VERSION };
  const json = JSON.stringify(data);
  assert.ok(!EGG_RE.test(json), 'save JSON format must not contain egg words');
});

// --- validateImportSave tests ---

test('validateImportSave rejects invalid JSON', () => {
  const result = validateImportSave('not valid json {{{');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Invalid JSON'));
});

test('validateImportSave rejects non-object JSON', () => {
  const result = validateImportSave('"just a string"');
  assert.equal(result.ok, false);
});

test('validateImportSave rejects null', () => {
  const result = validateImportSave('null');
  assert.equal(result.ok, false);
});

test('validateImportSave rejects empty object {}', () => {
  const result = validateImportSave('{}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('valid party'));
});

test('validateImportSave rejects object missing party', () => {
  const result = validateImportSave('{"gold": 100, "scene": "town"}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('valid party'));
});

test('validateImportSave rejects object with empty party', () => {
  const result = validateImportSave('{"gold": 100, "party": [], "scene": "town"}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('valid party'));
});

test('validateImportSave rejects object with __proto__ key', () => {
  const result = validateImportSave('{"__proto__": {}, "gold": 100, "party": [{"id":"h","name":"W"}], "scene": "town"}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('not a valid game state'));
});

test('validateImportSave rejects object missing scene', () => {
  const result = validateImportSave('{"gold": 100, "party": [{"id":"hero","name":"Wren"}]}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('scene'));
});

test('validateImportSave rejects object missing gold', () => {
  const result = validateImportSave('{"party": [{"id":"hero","name":"Wren"}], "scene": "town"}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('gold'));
});

test('validateImportSave migrates and accepts valid save', () => {
  const state = createInitialState();
  const json = JSON.stringify({ ...state, saveVersion: 1, scene: 'town' });
  const result = validateImportSave(json);
  assert.equal(result.ok, true);
  assert.ok(result.preview);
  assert.equal(result.preview.heroName, state.party[0].name);
  assert.equal(result.preview.scene, 'town');
});

test('validateImportSave returns correct preview data', () => {
  const state = createInitialState();
  state.gold = 250;
  state.location = 'ridge_road';
  state.scene = 'explore';
  state.party[0].level = 7;
  const json = JSON.stringify(state);
  const result = validateImportSave(json);
  assert.equal(result.ok, true);
  assert.equal(result.preview.heroName, state.party[0].name);
  assert.equal(result.preview.level, 7);
  assert.equal(result.preview.location, 'ridge_road');
  assert.equal(result.preview.scene, 'explore');
  assert.equal(result.preview.gold, 250);
  assert.equal(result.preview.partyCount, state.party.length);
});

test('validateImportSave rejects save with active combat', () => {
  const state = createInitialState();
  state.scene = 'town';
  state.combat = { active: true, enemy: 'test_fiend' };
  const json = JSON.stringify(state);
  const result = validateImportSave(json);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('combat'));
});

test('validateImportSave accepts save with null combat', () => {
  const state = createInitialState();
  state.scene = 'town';
  state.combat = null;
  const json = JSON.stringify(state);
  const result = validateImportSave(json);
  assert.equal(result.ok, true);
});

test('validateImportSave rejects oversized JSON', () => {
  const state = createInitialState();
  const json = JSON.stringify(state);
  const padded = json + ' ' + 'x'.repeat(SAVE_TEXT_LIMIT);
  const result = validateImportSave(padded);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('too large'));
});

test('validateImportSave rejects nested forbidden key at depth', () => {
  // Raw JSON so "__proto__" survives as an own key (object literals would
  // treat it as a prototype assignment and drop it from the stringified text).
  const json = '{"gold":100,"scene":"town","party":[{"id":"h","name":"W"}],"flags":{"quest":{"__proto__":{"polluted":true}}}}';
  const result = validateImportSave(json);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('not a valid game state'));
});

test('validateImportSave rejects deeply nested forbidden key', () => {
  const state = createInitialState();
  state.scene = 'town';
  state.flags = { a: { b: { c: { 'constructor': {} } } } };
  const json = JSON.stringify(state);
  const result = validateImportSave(json);
  assert.equal(result.ok, false);
});

test('commitImportSave writes exactly the passed migrated state (no re-parse)', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const migrated = createInitialState();
    migrated.scene = 'town';
    migrated.gold = 4242;
    const result = commitImportSave(migrated);
    assert.equal(result.ok, true);
    const written = JSON.parse(st.getItem(SAVE_KEY));
    assert.equal(written.gold, 4242);
    assert.equal(written.scene, 'town');
  } finally {
    globalThis.localStorage = old;
  }
});

// --- commitImportSave tests ---

test('commitImportSave writes to localStorage', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const state = createInitialState();
    state.scene = 'town';
    const result = commitImportSave(state);
    assert.equal(result.ok, true);
    assert.ok(st.getItem(SAVE_KEY), 'save should be written');
  } finally {
    globalThis.localStorage = old;
  }
});

test('commitImportSave backs up existing save before overwriting', () => {
  const st = storage();
  st.setItem(SAVE_KEY, '{"saveVersion":2,"scene":"town","party":[{"id":"hero","name":"Old"}],"gold":50}');
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const state = createInitialState();
    state.scene = 'explore';
    const result = commitImportSave(state);
    assert.equal(result.ok, true);
    const backup = st.getItem(SAVE_KEY + '.backup');
    assert.ok(backup, 'backup should exist');
    assert.equal(JSON.parse(backup).scene, 'town');
  } finally {
    globalThis.localStorage = old;
  }
});

// --- importSave (legacy single-step) tests ---

test('importSave rejects invalid JSON', () => {
  const result = importSave('not valid json {{{');
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('importSave rejects empty object {}', () => {
  const result = importSave('{}');
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('valid party'));
});

test('importSave migrates and accepts valid save', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const state = createInitialState();
    const json = JSON.stringify({ ...state, saveVersion: 1, scene: 'town' });
    const result = importSave(json);
    assert.equal(result.ok, true);
    assert.ok(result.data);
    assert.equal(result.data.saveVersion, SAVE_VERSION);
  } finally {
    globalThis.localStorage = old;
  }
});

test('importSave backs up existing save before overwriting', () => {
  const st = storage();
  st.setItem(SAVE_KEY, '{"saveVersion":2,"scene":"town","party":[{"id":"hero","name":"Old"}],"gold":50}');
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const state = createInitialState();
    state.scene = 'explore';
    const json = JSON.stringify(state);
    const result = importSave(json);
    assert.equal(result.ok, true);
    assert.ok(st.getItem(SAVE_KEY + '.backup'), 'backup should exist');
    assert.equal(JSON.parse(st.getItem(SAVE_KEY + '.backup')).scene, 'town');
  } finally {
    globalThis.localStorage = old;
  }
});

// --- deleteSave / hasSave tests ---

test('deleteSave removes save, backup, and autosave', () => {
  const st = storage();
  st.setItem(SAVE_KEY, '{}');
  st.setItem(SAVE_KEY + '.backup', '{}');
  st.setItem(AUTOSAVE_KEY, '{}');
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    deleteSave();
    assert.equal(st.getItem(SAVE_KEY), null, 'save should be removed');
    assert.equal(st.getItem(SAVE_KEY + '.backup'), null, 'backup should be removed');
    assert.equal(st.getItem(AUTOSAVE_KEY), null, 'autosave should be removed');
  } finally {
    globalThis.localStorage = old;
  }
});

test('hasSave returns false after deleteSave', () => {
  const st = storage();
  st.setItem(SAVE_KEY, '{}');
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    assert.equal(hasSave(), true);
    deleteSave();
    assert.equal(hasSave(), false);
  } finally {
    globalThis.localStorage = old;
  }
});

// --- autosave tests ---

test('autosave is initially disabled', () => {
  assert.equal(isAutosaveEnabled(), false);
});

test('enableAutosave sets enabled flag', () => {
  disableAutosave();
  enableAutosave();
  assert.equal(isAutosaveEnabled(), true);
  disableAutosave();
});

test('disableAutosave clears enabled flag', () => {
  enableAutosave();
  disableAutosave();
  assert.equal(isAutosaveEnabled(), false);
});

test('hasAutosave returns false when no autosave exists', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    assert.equal(hasAutosave(), false);
  } finally {
    globalThis.localStorage = old;
  }
});

test('scheduleAutosave does nothing when disabled', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  disableAutosave();
  try {
    const state = createInitialState();
    scheduleAutosave(state);
    setTimeout(() => {
      assert.equal(st.getItem(AUTOSAVE_KEY), null);
      done();
    }, 50);
  } finally {
    globalThis.localStorage = old;
  }
});

test('scheduleAutosave skips combat state', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  enableAutosave();
  try {
    const state = createInitialState();
    state.combat = { active: true };
    scheduleAutosave(state);
    setTimeout(() => {
      assert.equal(st.getItem(AUTOSAVE_KEY), null);
      disableAutosave();
      done();
    }, 100);
  } finally {
    globalThis.localStorage = old;
  }
});

test('loadAutosave returns null when no autosave exists', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    assert.equal(loadAutosave(), null);
  } finally {
    globalThis.localStorage = old;
  }
});

test('clearAutosave removes autosave key', () => {
  const st = storage();
  st.setItem(AUTOSAVE_KEY, '{"saveVersion":2}');
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    clearAutosave();
    assert.equal(st.getItem(AUTOSAVE_KEY), null);
  } finally {
    globalThis.localStorage = old;
  }
});

test('saveManager module source has no egg words', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/core/saveManager.js', import.meta.url), 'utf-8');
  assert.ok(!EGG_RE.test(src), 'saveManager.js must not contain egg words');
});

test('autosave writes to localStorage when enabled (controlled timer)', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  enableAutosave();
  const state = createInitialState();
  state.gold = 777;
  scheduleAutosave(state, 10);
  setTimeout(() => {
    try {
      const raw = st.getItem(AUTOSAVE_KEY);
      assert.ok(raw, 'autosave should be written to localStorage');
      const parsed = JSON.parse(raw);
      assert.equal(parsed.gold, 777, 'autosaved gold should match');
      assert.equal(parsed.combat, null, 'combat should be nullified');
    } finally {
      disableAutosave();
      globalThis.localStorage = old;
      done();
    }
  }, 50);
});

test('autosave does not write when disabled even with short interval', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  disableAutosave();
  try {
    const state = createInitialState();
    scheduleAutosave(state, 10);
    setTimeout(() => {
      assert.equal(st.getItem(AUTOSAVE_KEY), null, 'disabled autosave must not write');
      done();
    }, 50);
  } finally {
    globalThis.localStorage = old;
  }
});

// --- Autosave lifecycle test (GPT-6's concern #3) ---

test('autosave full lifecycle: opt-in → write → confirmed → load → clear', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;

  // Phase 1: Initially disabled, no autosave
  disableAutosave();
  assert.equal(isAutosaveEnabled(), false);
  assert.equal(hasAutosave(), false);

  // Phase 2: Opt in and write
  enableAutosave();
  assert.equal(isAutosaveEnabled(), true);

  const state = createInitialState();
  state.gold = 4321;
  state.scene = 'explore';
  state.location = 'beacon_tower';
  scheduleAutosave(state, 10);

  setTimeout(() => {
    try {
      // Phase 3: Confirm autosave was written with correct data
      assert.ok(st.getItem(AUTOSAVE_KEY), 'autosave should exist in storage');
      const parsed = JSON.parse(st.getItem(AUTOSAVE_KEY));
      assert.equal(parsed.gold, 4321);
      assert.equal(parsed.scene, 'explore');
      assert.equal(parsed.location, 'beacon_tower');
      assert.equal(parsed.combat, null);
      assert.equal(hasAutosave(), true);

      // Phase 4: Load autosave
      const loaded = loadAutosave();
      assert.ok(loaded);
      assert.equal(loaded.gold, 4321);

      // Phase 5: Disable and clear
      disableAutosave();
      clearAutosave();
      assert.equal(hasAutosave(), false);
      assert.equal(st.getItem(AUTOSAVE_KEY), null);
    } finally {
      globalThis.localStorage = old;
      done();
    }
  }, 50);
});

// --- Two-phase import lifecycle test ---

test('two-phase import: validate → preview → confirm writes save', () => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  try {
    const state = createInitialState();
    state.gold = 888;
    state.scene = 'town';
    const json = JSON.stringify(state);

    // Phase 1: validate
    const validation = validateImportSave(json);
    assert.equal(validation.ok, true);
    assert.equal(validation.preview.gold, 888);
    assert.equal(validation.preview.scene, 'town');

    // Phase 2: confirm
    const result = commitImportSave(validation.migrated);
    assert.equal(result.ok, true);

    // Phase 3: verify written data
    const written = JSON.parse(st.getItem(SAVE_KEY));
    assert.equal(written.gold, 888);
  } finally {
    globalThis.localStorage = old;
  }
});


// --- Stale-capture regression (GPT-6: same-scene state replacement) ---

test('autosave getter reads current state at fire time, not the scheduled snapshot', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  enableAutosave();
  try {
    let current = createInitialState();
    current.gold = 50;
    scheduleAutosave(() => current, 10);
    // Replace the state object before the timer fires (same scene).
    current = createInitialState();
    current.gold = 20;
    setTimeout(() => {
      try {
        const parsed = JSON.parse(st.getItem(AUTOSAVE_KEY));
        assert.equal(parsed.gold, 20, 'autosave must capture the replacement state');
      } finally {
        disableAutosave();
        globalThis.localStorage = old;
        done();
      }
    }, 60);
  } catch (e) {
    disableAutosave();
    globalThis.localStorage = old;
    throw e;
  }
});

test('installAutosave scene handler reads live game.state after replacement', (_, done) => {
  const st = storage();
  const old = globalThis.localStorage;
  globalThis.localStorage = st;
  const game = { bus, state: createInitialState() };
  game.state.gold = 50;
  installAutosave(game, 10);
  enableAutosave();
  try {
    // Trigger the scene handler, then swap state (a real quest transaction).
    bus.emit('scene:enter', { name: 'town' });
    game.state = createInitialState();
    game.state.gold = 20;
    setTimeout(() => {
      try {
        const parsed = JSON.parse(st.getItem(AUTOSAVE_KEY));
        assert.equal(parsed.gold, 20, 'autosave must read the live game.state');
      } finally {
        disableAutosave();
        globalThis.localStorage = old;
        done();
      }
    }, 60);
  } catch (e) {
    disableAutosave();
    globalThis.localStorage = old;
    throw e;
  }
});
