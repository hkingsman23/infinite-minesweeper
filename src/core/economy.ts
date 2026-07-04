const STORAGE_KEY = 'infinite-minesweeper-economy-v1';

export interface EconomyState {
  gems: number;
  sectorsCleared: number;
}

const DEFAULT_STATE: EconomyState = { gems: 15, sectorsCleared: 0 };

function load(): EconomyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      gems: parsed.gems ?? DEFAULT_STATE.gems,
      sectorsCleared: parsed.sectorsCleared ?? 0,
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
    const REWARD = 3; // flat sector-clear reward, see GEM_ECONOMY_AND_MONETIZATION.md
    this.state.sectorsCleared += 1;
    this.addGems(REWARD);
    return REWARD;
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

export const VAULT_REWARD = 25;
