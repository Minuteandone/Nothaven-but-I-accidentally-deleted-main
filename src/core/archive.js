import { createInitialState } from '../state.js';
import { migrateSave, SAVE_VERSION } from './save.js';

export const ARCHIVE_SLOTS = Object.freeze(['1', '2', '3']);
const validSlot = id => typeof id === 'string' && ARCHIVE_SLOTS.includes(id);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const key = id => `nothaven.archive.v1.${id}`;
const storageFor = storage => storage === undefined ? globalThis.localStorage : storage;
const validState = state => object(state) && ['town', 'explore'].includes(state.scene)
  && !state.combat && Array.isArray(state.party) && state.party.length > 0 && state.party.every(object);

/** Portable text is local, editable data, not an authenticated record. */
export const ARCHIVE_TEXT_LIMIT = 250000;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
export function boundedTree(value) {
  const queue = [[value, 0]];
  let nodes = 0;
  while (queue.length) {
    const [item, depth] = queue.pop();
    if (++nodes > 20000 || depth > 40) return false;
    if (item && typeof item === 'object') {
      for (const name of Object.keys(item)) {
        if (forbiddenKeys.has(name)) return false;
        queue.push([item[name], depth + 1]);
      }
    }
  }
  return true;
}

/** Shared format checks and migration; deliberately not exhaustive game-state validation. */
export function parseArchiveText(raw) {
  if (typeof raw !== 'string' || raw.length > ARCHIVE_TEXT_LIMIT) return { status: 'invalid' };
  try {
    const envelope = JSON.parse(raw);
    if (!boundedTree(envelope) || !object(envelope) || envelope.version !== 1
      || typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))
      || !validState(envelope.state)) return { status: 'invalid' };
    const state = migrateSave(envelope.state, createInitialState);
    if (!state) return { status: 'invalid' };
    return { status: 'ready', savedAt: envelope.savedAt, state };
  } catch { return { status: 'invalid' }; }
}
function portableText(slot) {
  return JSON.stringify({ version: 1, savedAt: slot.savedAt, state: slot.state });
}

/** Read-only slot inspection. The raw token protects later confirmations from stale writes. */
export function readArchiveSlot(id, storage) {
  if (!validSlot(id)) return { status: 'invalid-slot' };
  let raw;
  try { raw = storageFor(storage).getItem(key(id)); }
  catch { return { status: 'unavailable' }; }
  if (raw === null) return { status: 'empty', raw };
  return { ...parseArchiveText(raw), raw };
}

export function exportArchiveSlot(id, storage) {
  const slot = readArchiveSlot(id, storage);
  if (slot.status !== 'ready') return { ok: false, reason: slot.status };
  const text = portableText(slot);
  if (parseArchiveText(text).status !== 'ready') return { ok: false, reason: 'invalid' };
  return { ok: true, text };
}

/** Import into one explicitly selected checkpoint. Never resume it or write a quick save. */
export function importArchiveSlot(id, text, expectedRaw, storage) {
  if (!validSlot(id) || !(expectedRaw === null || typeof expectedRaw === 'string')) return { ok: false, reason: 'invalid' };
  const slot = parseArchiveText(text);
  if (slot.status !== 'ready') return { ok: false, reason: 'invalid' };
  const raw = portableText(slot);
  if (parseArchiveText(raw).status !== 'ready') return { ok: false, reason: 'invalid' };
  try {
    const target = storageFor(storage);
    if (target.getItem(key(id)) !== expectedRaw) return { ok: false, reason: 'changed' };
    target.setItem(key(id), raw);
    return { ok: true };
  } catch { return { ok: false, reason: 'unavailable' }; }
}

/** Save only a noncombat Town/Explore snapshot; never alter the quick-save key or live state. */
export function writeArchiveSlot(id, state, expectedRaw, { storage, now = () => new Date() } = {}) {
  if (!validSlot(id) || !validState(state) || !(expectedRaw === null || typeof expectedRaw === 'string')) {
    return { ok: false, reason: 'invalid' };
  }
  try {
    const target = storageFor(storage);
    if (target.getItem(key(id)) !== expectedRaw) return { ok: false, reason: 'changed' };
    const raw = JSON.stringify({ version: 1, savedAt: now().toISOString(), state: { ...state, combat: null, saveVersion: SAVE_VERSION } });
    if (parseArchiveText(raw).status !== 'ready') return { ok: false, reason: 'invalid' };
    target.setItem(key(id), raw);
    return { ok: true };
  } catch { return { ok: false, reason: 'unavailable' }; }
}

export function deleteArchiveSlot(id, expectedRaw, storage) {
  if (!validSlot(id) || typeof expectedRaw !== 'string') return { ok: false, reason: 'invalid' };
  try {
    const target = storageFor(storage);
    if (target.getItem(key(id)) !== expectedRaw) return { ok: false, reason: 'changed' };
    target.removeItem(key(id));
    return { ok: true };
  } catch { return { ok: false, reason: 'unavailable' }; }
}
