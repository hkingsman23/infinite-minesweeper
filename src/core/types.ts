export const SECTOR_SIZE = 8;
// The daily challenge is one single, standalone board (no stitched
// neighbours, no lock/gem economy) rather than a tile of the endless world's
// infinite sector grid — this is its own fixed size, unrelated to
// SECTOR_SIZE. Shared between dailyGame.ts (generation/bounds), the renderer,
// and the daily pointer controller so all three stay in lockstep.
export const DAILY_SIZE = 16;
// Nominal starting density fed to the generator's retry loop — the no-guess
// solver constraint means actual placed density converges to a ceiling well
// below this regardless of how much higher it's set (see sectorGenerator.ts);
// this value just needs to be comfortably above that ceiling so the generator
// reliably climbs to it instead of settling for an easier, lower-density
// board on early tries.
export const MINE_DENSITY = 0.34;
export const VAULT_CHANCE = 0.05;

export interface CellState {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  /** ms timestamp (performance.now) the flip animation should start; null = not yet triggered */
  flipStart: number | null;
  exploded: boolean;
  /** Marked when a mine hit nearby proves this flag is on a non-mine cell —
   * see World.markWrongFlagsNear. Tapping the tile clears this, unflags it,
   * and reveals it (see World.resolveWrongFlag). */
  flagWrong: boolean;
}

export interface SectorKey {
  sr: number;
  sc: number;
}

export function sectorKeyStr(sr: number, sc: number): string {
  return `${sr},${sc}`;
}

export function cellToSector(row: number, col: number): SectorKey {
  return { sr: Math.floor(row / SECTOR_SIZE), sc: Math.floor(col / SECTOR_SIZE) };
}

export interface Sector {
  sr: number;
  sc: number;
  cells: CellState[][]; // [SECTOR_SIZE][SECTOR_SIZE]
  cleared: boolean;
  locked: boolean;
  isVault: boolean;
  vaultClaimed: boolean;
  /** attempts the generator needed; kept for diagnostics */
  genAttempts: number;
  /** Gem unlock price frozen at the instant this sector locked (see
   * World's mine-hit handler) — null whenever the sector isn't locked.
   * Without freezing it, the price (which scales with solved-neighbour
   * count) would keep climbing while the player solves the sectors around
   * a locked one, which reads as a moving target rather than a price they
   * can decide against. */
  lockedPrice: number | null;
}
