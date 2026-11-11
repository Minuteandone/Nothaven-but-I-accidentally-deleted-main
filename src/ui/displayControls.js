export const DISPLAY_STORAGE_KEY = 'nothaven.display.v1';
export const TEXT_SCALES = Object.freeze([100, 115, 130]);
export const DEFAULT_DISPLAY_PREFERENCES = Object.freeze({ textScale: 100, highContrast: false, reducedMotion: false, characterShortcuts: true });

const DISPLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/></svg>';

export function normalizeDisplayPreferences(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const scale = Number(input.textScale);
  return {
    textScale: TEXT_SCALES.includes(scale) ? scale : 100,
    highContrast: input.highContrast === true,
    reducedMotion: input.reducedMotion === true,
    characterShortcuts: input.characterShortcuts !== false,
  };
}

/** Character commands can be disabled without disabling native keyboard navigation. */
export function characterShortcutsEnabled(doc) {
  return doc?.documentElement?.getAttribute?.('data-character-shortcuts') !== 'off';
}

export function loadDisplayPreferences(storage) {
  try {
    const saved = storage?.getItem?.(DISPLAY_STORAGE_KEY);
    return normalizeDisplayPreferences(saved ? JSON.parse(saved) : null);
  } catch {
    return normalizeDisplayPreferences(null);
  }
}

export function saveDisplayPreferences(storage, value) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(normalizeDisplayPreferences(value)));
    return true;
  } catch {
    return false;
  }
}

export function applyDisplayPreferences(doc, value) {
  const preferences = normalizeDisplayPreferences(value);
  const root = doc?.documentElement;
  if (root) {
    root.setAttribute('data-text-size', String(preferences.textScale));
    root.setAttribute('data-contrast', preferences.highContrast ? 'high' : 'standard');
    root.setAttribute('data-motion', preferences.reducedMotion ? 'reduced' : 'default');
    root.setAttribute('data-character-shortcuts', preferences.characterShortcuts ? 'on' : 'off');
  }
  return preferences;
}

function clearAppliedPreferences(doc) {
  const root = doc?.documentElement;
  root?.removeAttribute?.('data-text-size');
  root?.removeAttribute?.('data-contrast');
  root?.removeAttribute?.('data-motion');
  root?.removeAttribute?.('data-character-shortcuts');
}

/** Install persistent, interface controls into the existing game-control dock. */
export function installDisplayControls(game, options = {}) {
  const doc = options.document || globalThis.document;
  const dock = doc?.querySelector?.('.audio-dock');
  const bar = dock?.querySelector?.('.audio-dock__inner');
  if (!doc?.createElement || !bar || !doc.documentElement) return null;

  const view = doc.defaultView || globalThis;
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = view.localStorage; } catch { storage = null; }
  }
  let preferences = loadDisplayPreferences(storage);
  applyDisplayPreferences(doc, preferences);
  dock.setAttribute('aria-label', 'Game controls');

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.className = 'audio-toggle display-toggle';
  toggle.dataset.focusKey = 'display-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'display-settings');
  toggle.setAttribute('aria-label', 'Display settings');
  toggle.innerHTML = `${DISPLAY_ICON}<span>Display</span>`;
  bar.append(toggle);

  const panel = doc.createElement('section');
  panel.className = 'display-settings';
  panel.id = 'display-settings';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'display-settings-title');
  panel.innerHTML = `
    <div class="display-settings__header">
      <div><h2 id="display-settings-title">Display &amp; controls</h2><p>Adjust the interface without changing your journey. Settings are saved on this device.</p></div>
      <button type="button" class="audio-toggle" data-display-done>Done</button>
    </div>
    <div class="display-settings__options">
      <div class="display-option display-option--select">
        <label for="display-text-size"><strong>Text size</strong><span>Scale interface text and controls.</span></label>
        <select id="display-text-size" data-display-scale data-focus-key="display-text-size">
          <option value="100">100% — Default</option>
          <option value="115">115% — Large</option>
          <option value="130">130% — Largest</option>
        </select>
      </div>
      <label class="display-option" for="display-high-contrast">
        <input id="display-high-contrast" data-display-contrast data-focus-key="display-high-contrast" type="checkbox">
        <span><strong>High contrast</strong><span>Brighter text, stronger borders, and solid surfaces.</span></span>
      </label>
      <label class="display-option" for="display-reduced-motion">
        <input id="display-reduced-motion" data-display-motion data-focus-key="display-reduced-motion" type="checkbox">
        <span><strong>Reduce motion</strong><span>Stops pulsing and shortens transitions. Device settings are always respected.</span></span>
      </label>
      <label class="display-option" for="display-character-shortcuts">
        <input id="display-character-shortcuts" data-display-shortcuts data-focus-key="display-character-shortcuts" type="checkbox">
        <span><strong>Letter &amp; number shortcuts</strong><span>Use WASD, E, combat letters, and numbered actions. Turn off for speech input; arrow keys and buttons still work.</span></span>
      </label>
    </div>
    <div class="display-settings__footer">
      <button type="button" class="action-button action-button--ghost" data-display-reset>Reset display</button>
      <span class="display-settings__status" data-display-status role="status" aria-live="polite"></span>
    </div>`;
  dock.append(panel);

  const scale = panel.querySelector('[data-display-scale]');
  const contrast = panel.querySelector('[data-display-contrast]');
  const motion = panel.querySelector('[data-display-motion]');
  const shortcuts = panel.querySelector('[data-display-shortcuts]');
  const reset = panel.querySelector('[data-display-reset]');
  const done = panel.querySelector('[data-display-done]');
  const status = panel.querySelector('[data-display-status]');

  function update() {
    scale.value = String(preferences.textScale);
    contrast.checked = preferences.highContrast;
    motion.checked = preferences.reducedMotion;
    shortcuts.checked = preferences.characterShortcuts;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    dock.dataset.display = panel.hidden ? 'closed' : 'open';
  }

  function commit(message) {
    applyDisplayPreferences(doc, preferences);
    saveDisplayPreferences(storage, preferences);
    update();
    status.textContent = message;
  }

  const toggleHandler = () => {
    panel.hidden = !panel.hidden;
    update();
    status.textContent = '';
    if (panel.hidden) toggle.focus({ preventScroll: true });
  };
  const scaleHandler = () => {
    preferences = normalizeDisplayPreferences({ ...preferences, textScale: Number(scale.value) });
    commit(`Text size ${preferences.textScale} percent.`);
  };
  const contrastHandler = () => {
    preferences = normalizeDisplayPreferences({ ...preferences, highContrast: contrast.checked });
    commit(`High contrast ${preferences.highContrast ? 'on' : 'off'}.`);
  };
  const motionHandler = () => {
    preferences = normalizeDisplayPreferences({ ...preferences, reducedMotion: motion.checked });
    commit(`Reduced motion ${preferences.reducedMotion ? 'on' : 'off'}.`);
  };
  const shortcutsHandler = () => {
    preferences = normalizeDisplayPreferences({ ...preferences, characterShortcuts: shortcuts.checked });
    commit(`Letter and number shortcuts ${preferences.characterShortcuts ? 'on' : 'off'}.`);
    game.render?.();
  };
  const resetHandler = () => {
    preferences = normalizeDisplayPreferences(null);
    commit('Display settings reset to defaults.');
    game.render?.();
  };
  const doneHandler = () => {
    panel.hidden = true;
    update();
    status.textContent = '';
    toggle.focus({ preventScroll: true });
  };
  const keyHandler = (event) => {
    if (event.key !== 'Escape' || panel.hidden) return;
    event.preventDefault?.();
    doneHandler();
  };

  toggle.addEventListener('click', toggleHandler);
  scale.addEventListener('change', scaleHandler);
  contrast.addEventListener('change', contrastHandler);
  motion.addEventListener('change', motionHandler);
  shortcuts.addEventListener('change', shortcutsHandler);
  reset.addEventListener('click', resetHandler);
  done.addEventListener('click', doneHandler);
  doc.addEventListener('keydown', keyHandler);
  update();

  return {
    toggle,
    panel,
    get preferences() { return { ...preferences }; },
    destroy() {
      toggle.removeEventListener('click', toggleHandler);
      scale.removeEventListener('change', scaleHandler);
      contrast.removeEventListener('change', contrastHandler);
      motion.removeEventListener('change', motionHandler);
      shortcuts.removeEventListener('change', shortcutsHandler);
      reset.removeEventListener('click', resetHandler);
      done.removeEventListener('click', doneHandler);
      doc.removeEventListener('keydown', keyHandler);
      toggle.remove();
      panel.remove();
      delete dock.dataset.display;
      clearAppliedPreferences(doc);
    },
  };
}
