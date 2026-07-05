import { generateSector } from './sectorGenerator';
import { hashInts } from './rng';
import { CellState, SECTOR_SIZE, Sector } from './types';

const STORAGE_KEY = 'infinite-minesweeper-daily-v1';

/** Local calendar date, not UTC — like Wordle, the puzzle turns over at the
 * player's own midnight rather than a shared UTC instant. That means two
 * players in different timezones aren't ever *mid-puzzle* at the exact same
 * moment, but each gets a fresh one at a time that actually feels like "a
 * new day" to them, which matters more for a daily habit than perfect
 * simultaneity — and the puzzle itself is still identical for everyone who
 * opens it on a given calendar date. */
export function todayDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateSeed(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return hashInts(y, m, d, 0xda17); // fixed salt so this never collides with a worldSeed value
}

/** Fixed entry point: dead centre of the 8x8 board, same for every daily
 * puzzle — matches the classic "click the middle first" convention and
 * gives the generator's first-sector 3x3 safe-patch treatment evenly. */
const ENTRY_ROW = 4;
const ENTRY_COL = 4;

interface StoredDaily {
  dateStr: string;
  sector: {
    cells: Array<Array<Pick<CellState, 'mine' | 'adjacent' | 'revealed' | 'flagged' | 'exploded' | 'flagWrong'>>>;
  };
  mistakes: number;
  startedAt: number | null;
  completedAt: number | null;
  streak: number;
  lastCompletedDate: string | null;
}

export class DailyGame {
  readonly dateStr: string;
  private sector: Sector;
  mistakes = 0;
  startedAt: number | null = null;
  completedAt: number | null = null;
  streak = 0;
  private lastCompletedDate: string | null = null;

  private constructor(dateStr: string, sector: Sector) {
    this.dateStr = dateStr;
    this.sector = sector;
  }

  /** Loads today's puzzle from localStorage if it exists (resuming an
   * in-progress or completed attempt), otherwise generates a fresh one
   * deterministically from today's date — every player who opens the game
   * today gets this exact same board, same as everyone else. */
  static today(): DailyGame {
    const dateStr = todayDateStr();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredDaily = JSON.parse(raw);
        if (stored.dateStr === dateStr) {
          const cells: CellState[][] = stored.sector.cells.map((row) =>
            row.map((c) => ({ ...c, flipStart: null })),
          );
          const game = new DailyGame(dateStr, {
            sr: 0,
            sc: 0,
            cells,
            cleared: false,
            locked: false,
            isVault: false,
            vaultClaimed: false,
            genAttempts: 0,
          });
          game.mistakes = stored.mistakes;
          game.startedAt = stored.startedAt;
          game.completedAt = stored.completedAt;
          game.streak = stored.streak;
          game.lastCompletedDate = stored.lastCompletedDate;
          return game;
        }
        // Different day — carry the streak bookkeeping forward, but the
        // board itself needs regenerating fresh below.
        const game = DailyGame.generate(dateStr);
        const prevStreak = JSON.parse(raw) as StoredDaily;
        game.streak = prevStreak.streak;
        game.lastCompletedDate = prevStreak.lastCompletedDate;
        return game;
      }
    } catch {
      // Fall through to a fresh generation.
    }
    return DailyGame.generate(dateStr);
  }

  private static generate(dateStr: string): DailyGame {
    const seed = dateSeed(dateStr);
    const sector = generateSector(
      seed,
      0,
      0,
      ENTRY_ROW,
      ENTRY_COL,
      true, // isFirstSector — gives the classic 3x3 safe-patch opening
      () => undefined, // no neighbouring sectors ever exist — standalone board
      () => false,
    );
    return new DailyGame(dateStr, sector);
  }

  private save() {
    try {
      const data: StoredDaily = {
        dateStr: this.dateStr,
        sector: {
          cells: this.sector.cells.map((row) =>
            row.map((c) => ({
              mine: c.mine,
              adjacent: c.adjacent,
              revealed: c.revealed,
              flagged: c.flagged,
              exploded: c.exploded,
              flagWrong: c.flagWrong,
            })),
          ),
        },
        mistakes: this.mistakes,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        streak: this.streak,
        lastCompletedDate: this.lastCompletedDate,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Non-fatal — see World.save() for the same tolerance.
    }
  }

  getSector(): Sector {
    return this.sector;
  }

  isComplete(): boolean {
    return this.completedAt != null;
  }

  private cellAt(row: number, col: number): CellState | null {
    if (row < 0 || row >= SECTOR_SIZE || col < 0 || col >= SECTOR_SIZE) return null;
    return this.sector.cells[row][col];
  }

  /** True global adjacency doesn't apply here (no neighbouring sectors ever
   * exist), so the generator's own numbers are already final and correct —
   * no lazy recompute needed, unlike World.revealAdjacencyAt. */
  private revealCell(cell: CellState, now: number) {
    cell.revealed = true;
    cell.flipStart = now;
  }

  /** Mine hits never lock anything here — there's no neighbour-solve or
   * gem/ad economy to fairly gate a shared daily puzzle behind (see
   * dailyGame.ts module doc). Instead it's just revealed as a mistake and
   * play continues on the same board, so the final score (time + mistake
   * count) is what's comparable across players, like a Wordle guess count. */
  reveal(row: number, col: number, now: number): { revealedCount: number; hitMine: boolean } | null {
    if (this.isComplete()) return null;
    const cell = this.cellAt(row, col);
    if (!cell || cell.revealed || cell.flagged) return null;
    if (this.startedAt == null) this.startedAt = now;

    if (cell.mine) {
      this.revealCell(cell, now);
      cell.exploded = true;
      this.mistakes++;
      this.checkComplete(now);
      this.save();
      return { revealedCount: 1, hitMine: true };
    }

    // Small bounded flood fill — same adjacent===0 cascade rule as the
    // endless game, just clipped to the 8x8 board instead of crossing
    // sector boundaries.
    const queue: [number, number, number][] = [[row, col, 0]];
    const seen = new Set<string>([`${row},${col}`]);
    let revealedCount = 0;

    while (queue.length) {
      const [r, c, dist] = queue.shift()!;
      const cs = this.cellAt(r, c);
      if (!cs || cs.revealed || cs.flagged || cs.mine) continue;
      cs.revealed = true;
      cs.flipStart = now + dist * 86;
      revealedCount++;
      if (cs.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            const k = `${nr},${nc}`;
            if (!seen.has(k)) {
              seen.add(k);
              queue.push([nr, nc, dist + 1]);
            }
          }
        }
      }
    }

    this.checkComplete(now);
    this.save();
    return { revealedCount, hitMine: false };
  }

  toggleFlag(row: number, col: number): boolean {
    if (this.isComplete()) return false;
    const cell = this.cellAt(row, col);
    if (!cell || cell.revealed) return false;
    cell.flagged = !cell.flagged;
    this.save();
    return true;
  }

  private checkComplete(now: number) {
    const allSafeRevealed = this.sector.cells.flat().every((c) => c.mine || c.revealed);
    if (!allSafeRevealed) return;
    this.completedAt = now;
    this.sector.cleared = true;

    if (this.lastCompletedDate) {
      const prev = new Date(this.lastCompletedDate);
      const diffDays = Math.round((new Date(this.dateStr).getTime() - prev.getTime()) / 86400000);
      this.streak = diffDays === 1 ? this.streak + 1 : 1;
    } else {
      this.streak = 1;
    }
    this.lastCompletedDate = this.dateStr;
  }

  getElapsedMs(now: number): number {
    if (this.startedAt == null) return 0;
    return (this.completedAt ?? now) - this.startedAt;
  }
}
