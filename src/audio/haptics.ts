/** Vibration patterns paired to each sfx cue, mirroring its "weight" — a
 * quick tick for a flip, a strong buzz for a mine hit. No-ops silently on
 * devices/browsers without navigator.vibrate (most desktop browsers, iOS
 * Safari as of this writing) — it's a bonus feel on top of sound, not a
 * dependency.
 *
 * Callers must invoke this directly inside a synchronous user-gesture
 * handler (pointerup, click) — never from a setTimeout/rAF callback.
 * navigator.vibrate() requires live "user activation", which a deferred
 * callback has typically already lost by the time it runs, even at a short
 * delay; calling it there just silently does nothing. This is why it's kept
 * separate from playSfx() rather than bundled into it — playSfx is also
 * called from cascade's per-tile setTimeout-scheduled sounds, where a
 * bundled vibrate call would never actually fire. */
import type { SfxName } from './sfx';

const PATTERNS: Record<SfxName, number | number[]> = {
  flip: 6,
  gem: 12,
  explosion: 220,
  flag: 18,
  denied: [25, 35, 25],
  sectorClear: [15, 25, 15, 25, 35],
  unlock: 20,
  vault: [15, 25, 15, 25, 45],
};

export function vibrate(name: SfxName) {
  try {
    navigator.vibrate?.(PATTERNS[name]);
  } catch {
    // Non-fatal — vibration is a bonus, never required for the action to work.
  }
}
