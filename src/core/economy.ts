export const ECONOMY_STORAGE_KEY = 'infinite-minesweeper-economy-v1';
const STORAGE_KEY = ECONOMY_STORAGE_KEY;

export interface EconomyState {
  gems: number;
  sectorsCleared: number;
  /** Local calendar date (YYYY-MM-DD) the ad-for-gems cap below last reset. */
  adGemsDate: string | null;
  adGemsCountToday: number;
}

const DEFAULT_STATE: EconomyState = { gems: 15, sectorsCleared: 0, adGemsDate: null, adGemsCountToday: 0 };

// Rewarded "watch an ad for gems" top-up (see
// GEM_ECONOMY_AND_MONETIZATION.md §3.1) — separate from the sector-unlock/
// vault-claim ad flows, which grant their own specific rewards rather than
// raw gems. Capped per calendar day so it can't be farmed for unlimited
// free currency.
const AD_GEM_REWARD = 5;
const AD_DAILY_CAP = 5;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): EconomyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      gems: parsed.gems ?? DEFAULT_STATE.gems,
      sectorsCleared: parsed.sectorsCleared ?? 0,
      adGemsDate: parsed.adGemsDate ?? null,
      adGemsCountToday: parsed.adGemsCountToday ?? 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export class Economy {
  state: EconomyState = load();
  private listeners: Array<() => void> = [];

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private emit() {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  addGems(n: number) {
    this.state.gems += n;
    this.emit();
  }

  spendGems(n: number): boolean {
    if (this.state.gems < n) return false;
    this.state.gems -= n;
    this.emit();
    return true;
  }

  recordSectorCleared(): number {
    // Flat sector-clear reward (see GEM_ECONOMY_AND_MONETIZATION.md §1.1).
    // Lowered 3→1: at 3, and with a single tap often auto-completing several
    // sectors at once (3× each), the balance climbed fast enough that the
    // ~22–50 gem unlock sink stopped feeling considered. At 1 a median
    // unlock is ~30 clears of passive earning, which keeps gems scarce and
    // nudges players toward the free neighbour-solve path, rewarded ads, or
    // the Gem Vault — the intended monetisation pressure.
    const REWARD = 1;
    this.state.sectorsCleared += 1;
    this.addGems(REWARD);
    return REWARD;
  }

  /** Resets the counter on first use of a new calendar day, then grants the
   * top-up if today's cap isn't already used up. Returns the amount granted,
   * or null if the player has already hit today's cap (caller should treat
   * null as "don't show a reward, the ad button should already be disabled"). */
  claimAdGems(): number | null {
    const today = todayStr();
    if (this.state.adGemsDate !== today) {
      this.state.adGemsDate = today;
      this.state.adGemsCountToday = 0;
    }
    if (this.state.adGemsCountToday >= AD_DAILY_CAP) return null;
    this.state.adGemsCountToday += 1;
    this.addGems(AD_GEM_REWARD);
    return AD_GEM_REWARD;
  }

  adGemsRemainingToday(): number {
    if (this.state.adGemsDate !== todayStr()) return AD_DAILY_CAP;
    return Math.max(0, AD_DAILY_CAP - this.state.adGemsCountToday);
  }
}

/** GRYKUBY-style unlock pricing: price rises with how invested the player is —
 * i.e. with how many of the 8 neighbouring sectors are already solved.
 * See GEM_ECONOMY_AND_MONETIZATION.md §2.1-2.3 for the full rationale. */
export function unlockPrice(solvedNeighbours: number, mineCount: number): number {
  const INVEST_BASE = 22;
  const PER_SOLVED = 3;
  const difficultyMult = Math.min(1.2, Math.max(0.9, 0.95 + (mineCount / 64 - 0.16) * 1.5));
  const raw = (INVEST_BASE + solvedNeighbours * PER_SOLVED) * difficultyMult;
  return Math.min(50, Math.round(raw));
}

export const VAULT_REWARD = 5;
