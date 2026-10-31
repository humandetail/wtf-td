/** Original, short synthesized feedback. No media requests or autoplay. */
export function createAudio() {
  /** @type {AudioContext | null} */
  let context = null;
  /** @type {GainNode | null} */
  let master = null;
  let muted = false;
  /** @type {Set<OscillatorNode>} */
  const voices = new Set();
  const lastPlayed = new Map();
  const cooldowns = { shot: 0.065, hit: 0.09, kill: 0.08, build: 0.12, upgrade: 0.12, sell: 0.12, wave: 0.8, 'core-hit': 0.3, 'wave-clear': 0.8, 'research-complete': 0.12, checkpoint: 0.8, 'convoy-toggle': 0.3, 'convoy-repair': 0.3, relocate: 0.3, supply: 0.2, victory: 2, defeat: 2 };

  async function unlock() {
    try {
      if (!context) {
        const audioWindow = /** @type {Window & {webkitAudioContext?: typeof AudioContext}} */ (window);
        const AudioConstructor = window.AudioContext || audioWindow.webkitAudioContext;
        if (!AudioConstructor) return;
        context = new AudioConstructor();
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.28;
        master.connect(context.destination);
      }
      if (context.state === 'suspended') await context.resume();
    } catch {
      // Audio may be unavailable in embedded or restricted browser contexts.
    }
  }

  function stopVoices() {
    for (const voice of voices) {
      try { voice.stop(); } catch { /* An already ended voice needs no cleanup. */ }
      voice.disconnect();
    }
    voices.clear();
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (!context || !master) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(muted ? 0 : 0.28, context.currentTime);
    if (muted) stopVoices();
  }

  /** @param {number} frequency @param {number} endFrequency @param {number} duration @param {OscillatorType} type @param {number} volume @param {number} [delay] */
  function tone(frequency, endFrequency, duration, type, volume, delay = 0) {
    if (!context || !master || voices.size >= 36) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.008, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    voices.add(oscillator);
    oscillator.onended = () => {
      voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  /** @param {{type: string, code?: string} | string} event */
  function play(event) {
    if (!context || context.state !== 'running' || muted) return;
    const type = typeof event === 'string' ? event : event.type;
    if (!(type in cooldowns)) return;
    const now = context.currentTime;
    if (now - (lastPlayed.get(type) ?? -Infinity) < cooldowns[type]) return;
    lastPlayed.set(type, now);
    switch (type) {
      case 'shot':
        tone(460, 140, 0.075, 'triangle', 0.16);
        tone(100, 55, 0.055, 'sine', 0.16);
        break;
      case 'hit':
        tone(150, 45, 0.065, 'triangle', 0.17);
        break;
      case 'kill':
        tone(640, 950, 0.10, 'sine', 0.14);
        tone(960, 1200, 0.09, 'sine', 0.09, 0.035);
        break;
      case 'build':
        tone(110, 65, 0.18, 'triangle', 0.35);
        tone(330, 440, 0.13, 'sine', 0.25, 0.04);
        tone(660, 660, 0.20, 'sine', 0.18, 0.10);
        break;
      case 'upgrade':
        [440, 554.37, 659.25, 880].forEach((note, index) => tone(note, note, 0.24, 'triangle', 0.23, index * 0.065));
        break;
      case 'research-complete':
        [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => tone(note, note, 0.3, 'sine', 0.22, index * 0.09));
        break;
      case 'sell':
        [660, 440, 330].forEach((note, index) => tone(note, note * 0.85, 0.16, 'sine', 0.22, index * 0.055));
        break;
      case 'wave':
        tone(164.81, 164.81, 0.35, 'triangle', 0.30);
        tone(220, 220, 0.38, 'triangle', 0.25, 0.18);
        tone(329.63, 329.63, 0.40, 'sine', 0.18, 0.18);
        break;
      case 'convoy-toggle':
        tone(130.81, 196, 0.4, 'triangle', 0.25);
        tone(196, 130.81, 0.4, 'triangle', 0.25, 0.22);
        break;
      case 'relocate':
        tone(880, 110, 0.5, 'sine', 0.32);
        tone(220, 55, 0.4, 'triangle', 0.2);
        break;
      case 'core-hit':
        tone(98, 42, 0.3, 'triangle', 0.32);
        break;
      case 'checkpoint':
      case 'convoy-repair':
      case 'supply':
      case 'wave-clear':
        tone(130.81, 196, 0.25, 'sine', 0.25);
        tone(196, 261.63, 0.3, 'sine', 0.2, 0.12);
        break;
      case 'victory':
        stopVoices();
        [261.63, 329.63, 392, 523.25, 659.25].forEach((note, index) => tone(note, note, 0.55, 'triangle', 0.24, index * 0.14));
        tone(261.63, 261.63, 0.95, 'sine', 0.20, 0.56);
        break;
      case 'defeat':
        stopVoices();
        [220, 196, 164.81, 110].forEach((note, index) => tone(note, note * 0.9, 0.55, 'triangle', 0.25, index * 0.18));
        break;
    }
  }

  return { unlock, play, setMuted, get muted() { return muted; } };
}
