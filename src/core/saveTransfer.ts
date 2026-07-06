import { ECONOMY_STORAGE_KEY } from './economy';
import { WORLD_STORAGE_KEY } from './world';
import { DAILY_STORAGE_KEY } from './dailyGame';

/** Camera position is plain localStorage bookkeeping owned by main.ts (no
 * "core" module of its own), but this is the one other place that needs to
 * know every key worth carrying across a save transfer — so this is the
 * canonical export, and main.ts imports it from here instead of keeping a
 * second copy of the literal. */
export const CAMERA_STORAGE_KEY = 'infinite-minesweeper-camera-v1';

const TRANSFERABLE_KEYS = [ECONOMY_STORAGE_KEY, WORLD_STORAGE_KEY, CAMERA_STORAGE_KEY, DAILY_STORAGE_KEY];

/** Bundles every piece of saved progress into one opaque backup code the
 * player can copy out of one browser/app context and paste into another.
 * This is the only way to carry progress across contexts that don't share
 * localStorage — notably a regular Safari tab vs. this same site "Added to
 * Home Screen" on iOS, which WebKit keeps in a fully separate storage
 * partition with no API to bridge them. Deliberately not short or
 * memorable, just something you can copy-paste or share. */
export function exportSave(): string {
  const data: Record<string, string> = {};
  for (const key of TRANSFERABLE_KEYS) {
    const v = localStorage.getItem(key);
    if (v != null) data[key] = v;
  }
  const json = JSON.stringify({ v: 1, data });
  return btoa(encodeURIComponent(json));
}

/** Returns false (and touches no storage at all) if the code is malformed,
 * so the caller can show an error instead of partially overwriting
 * whatever progress the player already had. */
export function importSave(code: string): boolean {
  try {
    const json = decodeURIComponent(atob(code.trim()));
    const parsed = JSON.parse(json);
    if (!parsed || parsed.v !== 1 || typeof parsed.data !== 'object') return false;
    for (const key of TRANSFERABLE_KEYS) {
      const v = parsed.data[key];
      if (typeof v === 'string') localStorage.setItem(key, v);
    }
    return true;
  } catch {
    return false;
  }
}
