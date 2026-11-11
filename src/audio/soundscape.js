export const AUDIO_STORAGE_KEY = 'nothaven.audio.v1';
export const DEFAULT_AUDIO_PREFERENCES = Object.freeze({ muted: true, volume: 0.35 });

export function normalizeAudioPreferences(value) {
  return {
    muted: typeof value?.muted === 'boolean' ? value.muted : DEFAULT_AUDIO_PREFERENCES.muted,
    volume: Math.min(1, Math.max(0, Number.isFinite(Number(value?.volume))
      ? Number(value.volume)
      : DEFAULT_AUDIO_PREFERENCES.volume)),
  };
}

export function loadAudioPreferences(storage) {
  try {
    const raw = storage?.getItem(AUDIO_STORAGE_KEY);
    return normalizeAudioPreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveAudioPreferences(storage, preferences) {
  try {
    storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(normalizeAudioPreferences(preferences)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

// All sounds are synthesized locally. Constructing this class is silent: an
// AudioContext is created only by start(), which the controls call from a click.
export class StormSoundscape {
  constructor({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, random = Math.random, startTimeoutMs = 1500 } = {}) {
    this.AudioContextClass = AudioContextClass;
    this.random = random;
    this.startTimeoutMs = startTimeoutMs;
    this.context = null;
    this.muted = true;
    this.volume = DEFAULT_AUDIO_PREFERENCES.volume;
    this.scene = 'title';
    this.ambience = null;
    this.sources = [];
  }

  get available() { return typeof this.AudioContextClass === 'function'; }
  get started() { return Boolean(this.context); }

  async start() {
    if (!this.available) return false;
    if (!this.context) {
      this.context = new this.AudioContextClass();
      this.buildAmbience();
    }
    if (typeof this.context.resume === 'function') {
      let timeout;
      try {
        await Promise.race([
          this.context.resume(),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Audio resume timed out')), this.startTimeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
    this.applyVolume();
    this.applySceneMix();
    return true;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    this.applyVolume();
  }

  setVolume(value) {
    this.volume = normalizeAudioPreferences({ muted: this.muted, volume: value }).volume;
    this.applyVolume();
  }

  setScene(name) {
    this.scene = String(name || 'title');
    this.applySceneMix();
  }

  applyVolume() {
    if (!this.context || !this.ambience) return;
    const gain = this.ambience.master.gain;
    const target = this.muted ? 0 : this.volume;
    gain.setTargetAtTime(target, this.context.currentTime, 0.045);
  }

  applySceneMix() {
    if (!this.context || !this.ambience) return;
    const mixes = {
      title: { wind: 0.055, sea: 0.04, drone: 0.008, cutoff: 720 },
      town: { wind: 0.026, sea: 0.018, drone: 0.004, cutoff: 520 },
      explore: { wind: 0.065, sea: 0.034, drone: 0.007, cutoff: 840 },
      combat: { wind: 0.082, sea: 0.025, drone: 0.018, cutoff: 1080 },
      ending: { wind: 0.022, sea: 0.026, drone: 0.005, cutoff: 620 },
    };
    const mix = mixes[this.scene] || { wind: 0.036, sea: 0.022, drone: 0.005, cutoff: 620 };
    const now = this.context.currentTime;
    this.ambience.windGain.gain.setTargetAtTime(mix.wind, now, 0.8);
    this.ambience.seaGain.gain.setTargetAtTime(mix.sea, now, 1.1);
    this.ambience.droneGain.gain.setTargetAtTime(mix.drone, now, 0.7);
    this.ambience.windFilter.frequency.setTargetAtTime(mix.cutoff, now, 0.65);
  }

  buildAmbience() {
    const ctx = this.context;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const white = this.random() * 2 - 1;
      last = (last + 0.025 * white) / 1.025;
      samples[i] = Math.max(-1, Math.min(1, last * 3.2));
    }

    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 720;
    windFilter.Q.value = 0.65;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.055;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);

    const gust = ctx.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.085;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.012;
    gust.connect(gustDepth);
    gustDepth.connect(windGain.gain);

    const sea = ctx.createBufferSource();
    sea.buffer = noiseBuffer;
    sea.loop = true;
    sea.playbackRate.value = 0.72;
    const seaFilter = ctx.createBiquadFilter();
    seaFilter.type = 'bandpass';
    seaFilter.frequency.value = 260;
    seaFilter.Q.value = 0.45;
    const seaGain = ctx.createGain();
    seaGain.gain.value = 0.04;
    sea.connect(seaFilter);
    seaFilter.connect(seaGain);
    seaGain.connect(master);

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.008;
    droneGain.connect(master);
    const lowDrone = ctx.createOscillator();
    lowDrone.type = 'sine';
    lowDrone.frequency.value = 43;
    lowDrone.connect(droneGain);
    const upperDrone = ctx.createOscillator();
    upperDrone.type = 'triangle';
    upperDrone.frequency.value = 64.5;
    const upperGain = ctx.createGain();
    upperGain.gain.value = 0.24;
    upperDrone.connect(upperGain);
    upperGain.connect(droneGain);

    this.ambience = { master, windGain, seaGain, droneGain, windFilter, noiseBuffer };
    this.sources = [wind, sea, gust, lowDrone, upperDrone];
    for (const source of this.sources) source.start();
  }

  tone({ frequency, endFrequency = frequency, duration = 0.12, type = 'sine', level = 0.045, delay = 0 }) {
    const ctx = this.context;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.linearRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(level, start + Math.min(0.018, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.ambience.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  noiseBurst({ duration = 0.09, level = 0.04, frequency = 900 } = {}) {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this.ambience.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(level, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.ambience.master);
    source.start(now);
    source.stop(now + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  playCue(name) {
    if (!this.context || this.muted || this.context.state === 'suspended') return false;
    if (name === 'attack') {
      this.tone({ frequency: 145, endFrequency: 68, duration: 0.14, type: 'sawtooth', level: 0.065 });
      this.noiseBurst({ duration: 0.08, level: 0.035, frequency: 1050 });
    } else if (name === 'skill') {
      this.tone({ frequency: 340, endFrequency: 660, duration: 0.22, type: 'triangle', level: 0.05 });
      this.tone({ frequency: 510, endFrequency: 880, duration: 0.18, level: 0.028, delay: 0.055 });
    } else if (name === 'defend') {
      this.tone({ frequency: 180, endFrequency: 125, duration: 0.18, type: 'triangle', level: 0.055 });
      this.noiseBurst({ duration: 0.12, level: 0.022, frequency: 320 });
    } else if (name === 'item') {
      this.tone({ frequency: 520, endFrequency: 690, duration: 0.13, level: 0.038 });
    } else if (name === 'victory') {
      [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
        this.tone({ frequency, duration: 0.3, type: 'triangle', level: 0.048, delay: index * 0.105 });
      });
    } else if (name === 'levelup') {
      [440, 554.37, 659.25].forEach((frequency, index) => {
        this.tone({ frequency, endFrequency: frequency * 1.01, duration: 0.28, level: 0.04, delay: index * 0.09 });
      });
    } else {
      this.tone({ frequency: 260, endFrequency: 340, duration: 0.065, level: 0.025 });
    }
    return true;
  }

  async destroy() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already stopped. */ }
    }
    this.sources = [];
    this.ambience = null;
    if (this.context && typeof this.context.close === 'function') await this.context.close();
    this.context = null;
  }
}
