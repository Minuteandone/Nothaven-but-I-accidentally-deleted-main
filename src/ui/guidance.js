import { SKILLS, SKILL_UNLOCKS } from '../combat/rules.js';
import { escapeHTML, uiButton } from './components.js';

export const GUIDANCE_STORAGE_KEY = 'nothaven.guidance.v1';
export const GUIDANCE_TOPICS = Object.freeze(['title', 'town', 'explore', 'combat', 'levelup']);

const CONTROLLER = Symbol('stormhavenGuidanceController');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const TOPIC_COPY = Object.freeze({
  title: Object.freeze({
    title: 'Your first watch',
    text: 'Start a New journey, then follow The road ahead in Greyhaven. How to play contains the full rules; quick briefings wait for you to dismiss them.',
  }),
  town: Object.freeze({
    title: 'Prepare in Greyhaven',
    text: 'The road ahead names your current objective. Visit Hesta for supplies, open your bag to equip gear, then Explore the wilds. Save journey stores progress on this device.',
  }),
  explore: Object.freeze({
    title: 'Read the ground, choose your route',
    text: 'Use the arrow buttons or W, A, S and D to move. Adjacent people, landmarks and foes appear under Nearby actions; E surveys and number keys activate the visible actions. Each step in the wilds can stir up an encounter. Letter and number shortcuts can be disabled in Display settings.',
  }),
  combat: Object.freeze({
    title: 'One command, then a reply',
    text: 'Choose Attack, Skills, Items, Defend or Flee. Damage and recovery previews describe immediate effects before you commit. Defend halves damage to Wren during the next enemy action, bosses cannot be fled, and Beacon Burst becomes available when its gauge is full.',
  }),
  levelup: Object.freeze({
    title: 'The watch grows stronger',
    text: 'Each level raises maximum HP and MP, attack, defense and speed, and restores that traveler’s HP and MP. Open Skills during your turn to use newly learned techniques.',
  }),
});

/** Only explicit dismissals for known topics are retained on this device. */
export function normalizeGuidancePreferences(value) {
  const dismissed = {};
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value.dismissed : null;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    for (const topic of GUIDANCE_TOPICS) {
      if (own(source, topic) && source[topic] === true) dismissed[topic] = true;
    }
  }
  return { dismissed };
}

export function loadGuidancePreferences(storage) {
  try {
    const raw = storage?.getItem?.(GUIDANCE_STORAGE_KEY);
    return normalizeGuidancePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeGuidancePreferences(null);
  }
}

export function saveGuidancePreferences(storage, value) {
  try {
    if (!storage?.setItem) return false;
    storage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(normalizeGuidancePreferences(value)));
    return true;
  } catch {
    return false;
  }
}

function reachedLevel(line, name = null) {
  const text = typeof line === 'string' ? line : '';
  const prefix = name === null ? '' : `${String(name)} reached level `;
  if (name !== null && !text.startsWith(prefix)) return null;
  const match = name === null
    ? /^.+ reached level ([1-9]\d*)!/.exec(text)
    : /^([1-9]\d*)!/.exec(text.slice(prefix.length));
  if (!match) return null;
  const level = Number(match[1]);
  return Number.isSafeInteger(level) ? level : null;
}

/** Summarize real progression lines; skill metadata always comes from the rules registry. */
export function createLevelUpBriefing(lines, hero) {
  if (!Array.isArray(lines) || !lines.some((line) => reachedLevel(line) !== null)) return null;
  const levels = [];
  if (hero && typeof hero === 'object' && typeof hero.name === 'string') {
    for (const line of lines) {
      const level = reachedLevel(line, hero.name);
      if (level !== null) levels.push(level);
    }
  }
  const skills = Object.entries(SKILL_UNLOCKS)
    .filter(([id, level]) => levels.includes(level) && own(SKILLS, id))
    .map(([id, level]) => ({ ...SKILLS[id], unlockLevel: level }))
    .sort((a, b) => a.unlockLevel - b.unlockLevel || a.name.localeCompare(b.name));
  return { levels, skills };
}

function skillList(skills) {
  if (!Array.isArray(skills) || !skills.length) return '';
  const rows = skills.filter((skill) => skill && typeof skill === 'object'
    && typeof skill.name === 'string' && typeof skill.description === 'string'
    && Number.isFinite(Number(skill.mp))).map((skill) => `<li><strong>${escapeHTML(skill.name)} · ${escapeHTML(Number(skill.mp))} MP</strong><br><span>${escapeHTML(skill.description)}</span></li>`);
  return rows.length ? `<ul class="guidance-card__skills">${rows.join('')}</ul>` : '';
}

export function renderGuidanceCard(topic, data = {}) {
  if (!GUIDANCE_TOPICS.includes(topic)) return '';
  const copy = TOPIC_COPY[topic];
  return `<section class="panel guidance-card" aria-labelledby="guidance-${topic}-title" data-guidance-topic="${topic}">
    <p class="eyebrow">Quick briefing</p>
    <h2 id="guidance-${topic}-title">${escapeHTML(copy.title)}</h2>
    <p>${escapeHTML(copy.text)}</p>
    ${topic === 'levelup' ? skillList(data.skills) : ''}
    <div class="guidance-card__actions">${uiButton({ action: 'dismissGuidance', arg: topic, label: topic === 'levelup' ? 'Got it' : 'Dismiss tip', variant: 'ghost' })}</div>
    <p class="quiet-note">Replay quick tips from How to play on the title screen.</p>
  </section>`;
}

function injectAfterDiv(html, addition, className) {
  const marker = `<div class="${className}">`;
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) return `${html.slice(0, tags.lastIndex)}${addition}${html.slice(tags.lastIndex)}`;
  }
  return null;
}

function injectGuidance(html, addition, headingRow = '') {
  if (!addition) return html;
  const text = String(html ?? '');
  if (headingRow) {
    const injected = injectAfterDiv(text, addition, headingRow);
    if (injected !== null) return injected;
  }
  const headerEnd = text.indexOf('</header>');
  if (headerEnd >= 0) {
    const insertion = headerEnd + '</header>'.length;
    return `${text.slice(0, insertion)}${addition}${text.slice(insertion)}`;
  }
  return /\<\/main\>\s*$/.test(text)
    ? text.replace(/\<\/main\>\s*$/, `${addition}</main>`)
    : `${text}${addition}`;
}

function guideReplayPanel(message) {
  return `<section class="panel guidance-replay" aria-labelledby="guidance-replay-title">
    <h2 id="guidance-replay-title">Quick briefings</h2>
    <p>Show the title, town, exploration, combat and level-up briefings again. This changes only guidance preferences on this device.</p>
    ${uiButton({ action: 'replayGuidance', label: 'Replay quick tips', variant: 'ghost' })}
    ${message ? `<p role="status" class="guidance-replay__status">${escapeHTML(message)}</p>` : ''}
  </section>`;
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

/** Add contextual, inline help without altering scene actions, RNG or journey state. */
export function installGuidance(game, options = {}) {
  if (!game || !game.scenes) return null;
  game[CONTROLLER]?.destroy?.();
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let preferences = loadGuidancePreferences(storage);
  let pendingLevelUp = null;
  let replayMessage = '';
  const restorations = [];

  function visibleTopic(sceneName) {
    let topic = null;
    if (sceneName === 'title' || sceneName === 'town' || sceneName === 'explore') topic = sceneName;
    if (sceneName === 'combat') {
      const combat = game.state?.combat;
      if (combat && !combat.over) topic = 'combat';
      else if (combat?.over === 'victory' && pendingLevelUp) topic = 'levelup';
    }
    return topic && !preferences.dismissed[topic] ? topic : null;
  }

  function wrapScene(sceneName) {
    const scene = game.scenes[sceneName];
    if (!scene || typeof scene.render !== 'function') return;
    const originalRender = scene.render;
    const hadActions = own(scene, 'actions');
    const originalActions = scene.actions;
    scene.render = function wrappedGuidanceRender(...args) {
      const base = originalRender.apply(this, args);
      const topic = visibleTopic(sceneName);
      const headingRow = sceneName === 'explore' || sceneName === 'combat' ? `${sceneName}-heading-row` : '';
      return injectGuidance(base, topic ? renderGuidanceCard(topic, pendingLevelUp || {}) : '', headingRow);
    };
    scene.actions = {
      ...(originalActions || {}),
      dismissGuidance(_game, element) {
        if (game.state?.scene !== sceneName) return;
        const topic = element?.dataset?.arg;
        if (visibleTopic(sceneName) !== topic) return;
        preferences = normalizeGuidancePreferences({
          dismissed: { ...preferences.dismissed, [topic]: true },
        });
        saveGuidancePreferences(storage, preferences);
        if (topic === 'levelup') pendingLevelUp = null;
      },
    };
    restorations.push(() => {
      scene.render = originalRender;
      if (hadActions) scene.actions = originalActions;
      else delete scene.actions;
    });
  }

  for (const name of ['title', 'town', 'explore', 'combat']) wrapScene(name);

  const guide = game.scenes.guide;
  if (guide && typeof guide.render === 'function') {
    const originalRender = guide.render;
    const hadActions = own(guide, 'actions');
    const originalActions = guide.actions;
    guide.render = function wrappedGuidanceGuide(...args) {
      return injectGuidance(originalRender.apply(this, args), guideReplayPanel(replayMessage));
    };
    guide.actions = {
      ...(originalActions || {}),
      replayGuidance() {
        if (game.state?.scene !== 'guide') return;
        preferences = normalizeGuidancePreferences(null);
        saveGuidancePreferences(storage, preferences);
        replayMessage = 'Quick tips will appear again as you play.';
      },
    };
    restorations.push(() => {
      guide.render = originalRender;
      if (hadActions) guide.actions = originalActions;
      else delete guide.actions;
    });
  }

  const levelHandler = (event = {}) => {
    pendingLevelUp = createLevelUpBriefing(event.lines, game.state?.party?.[0]);
  };
  const sceneHandler = ({ name } = {}) => {
    pendingLevelUp = null;
    if (name !== 'guide') replayMessage = '';
  };
  game.bus?.on?.('party:levelup', levelHandler);
  game.bus?.on?.('scene:enter', sceneHandler);

  const controller = {
    get preferences() { return normalizeGuidancePreferences(preferences); },
    get pendingLevelUp() {
      return pendingLevelUp ? {
        levels: [...pendingLevelUp.levels],
        skills: pendingLevelUp.skills.map((skill) => ({ ...skill })),
      } : null;
    },
    destroy() {
      game.bus?.off?.('party:levelup', levelHandler);
      game.bus?.off?.('scene:enter', sceneHandler);
      for (const restore of restorations.reverse()) restore();
      if (game[CONTROLLER] === controller) delete game[CONTROLLER];
    },
  };
  game[CONTROLLER] = controller;
  return controller;
}
