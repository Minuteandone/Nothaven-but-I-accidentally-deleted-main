import { createStoryState } from './story/index.js';
import { SAVE_VERSION, migrateSave } from './core/save.js';
const SAVE_KEY = 'nothaven-save';
const AUTOSAVE_KEY = 'nothaven-autosave';
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _autosaveTimer = null;
let _autosaveEnabled = false;

export function createInitialState() {
  return {
    saveVersion: SAVE_VERSION,
    scene: 'title',
    party: [
      { id: 'hero', name: 'Wren', hp: 30, maxHp: 30, mp: 10, maxMp: 10, atk: 6, def: 3, spd: 5, level: 1, xp: 0 },
    ],
    gold: 20,
    inventory: [],   // [{ id, qty }] — see src/items/
    flags: {},       // story flags — see src/story/
    questLog: {},    // { questId: stage }
    location: 'greyhaven',
    story: createStoryState(),
    combat: null,
  };
}

export function saveGame(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, combat: null, saveVersion: SAVE_VERSION }));
}
export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return migrateSave(JSON.parse(raw), createInitialState);
  } catch {
    return null; // corrupt save
  }
}
export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }

// --- Autosave (separate key, does not touch manual save) ---

export function isAutosaveEnabled() {
  return _autosaveEnabled;
}

export function enableAutosave() {
  _autosaveEnabled = true;
}

export function disableAutosave() {
  _autosaveEnabled = false;
  if (_autosaveTimer !== null) {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = null;
  }
}

export function hasAutosave() {
  return !!localStorage.getItem(AUTOSAVE_KEY);
}

export function loadAutosave() {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    return migrateSave(JSON.parse(raw), createInitialState);
  } catch {
    return null;
  }
}

/**
 * Schedule a debounced autosave. Call this on scene transitions when
 * autosave is enabled. The save fires after a quiet period (no calls
 * to scheduleAutosave for AUTOSAVE_INTERVAL_MS).
 *
 * Pass either a state object or a getter function `() => state`. When a
 * getter is supplied, the callback reads the *current* state at fire time
 * so that a same-scene state replacement (e.g. a quest transaction that
 * swaps game.state) is never saved stale.
 */
export function scheduleAutosave(stateOrGetter, _testInterval) {
  if (!_autosaveEnabled) return;
  if (_autosaveTimer !== null) clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => {
    const state = typeof stateOrGetter === 'function' ? stateOrGetter() : stateOrGetter;
    // Don't autosave during combat
    if (state && state.combat) return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...state, combat: null, saveVersion: SAVE_VERSION }));
    } catch { /* storage full — silently skip */ }
  }, _testInterval ?? AUTOSAVE_INTERVAL_MS);
}

export function clearAutosave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}

export function installAutosave(game, _testInterval) {
  if (!game?.bus) return;
  game.bus.on('scene:enter', () => {
    scheduleAutosave(() => game.state, _testInterval);
  });
  // Start disabled; player opts in via UI
  _autosaveEnabled = false;
}
