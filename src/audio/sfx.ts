/** Small synthesized SFX via raw Web Audio oscillators — no audio files to ship,
 * fits a light PWA. (Howler is for playing audio *files*; since these are
 * generated tones we don't need it — see NOTES.md.) */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType, gainPeak: number, delay = 0) {
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ac.destination);
  const t0 = ac.currentTime + delay;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const SFX = {
  flip: () => tone(520, 0.05, 'sine', 0.05),
  gem: () => {
    tone(880, 0.08, 'triangle', 0.06);
    tone(1320, 0.1, 'triangle', 0.05, 0.05);
  },
  explosion: () => {
    tone(90, 0.35, 'sawtooth', 0.14);
    tone(55, 0.4, 'square', 0.08, 0.03);
  },
  flag: () => tone(340, 0.05, 'square', 0.05),
  denied: () => tone(180, 0.07, 'square', 0.05),
  sectorClear: () => {
    tone(494, 0.08, 'triangle', 0.06);
    tone(659, 0.1, 'triangle', 0.06, 0.07);
    tone(880, 0.14, 'triangle', 0.06, 0.14);
  },
  unlock: () => {
    tone(440, 0.09, 'triangle', 0.07);
    tone(660, 0.12, 'triangle', 0.06, 0.06);
  },
  vault: () => {
    tone(523, 0.1, 'triangle', 0.07);
    tone(659, 0.1, 'triangle', 0.07, 0.08);
    tone(784, 0.16, 'triangle', 0.07, 0.16);
  },
};

export type SfxName = keyof typeof SFX;

export function playSfx(name: SfxName) {
  try {
    SFX[name]();
  } catch {
    // Audio can fail before first user gesture unlocks the AudioContext — non-fatal.
  }
}
