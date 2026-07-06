import { generateSector } from './sectorGenerator';
import { hashInts } from './rng';
import { CellState, DAILY_SIZE, Sector } from './types';

// v4: board resized from 24x24 to 16x16 (DAILY_SIZE) — bumped so a v3 save
// (still shaped 24x24) never gets loaded and indexed as if it were 16x16.
// v3: startedAt/completedAt switched from performance.now() (relative to
// each page load's own navigation start, meaningless once persisted across a
// reload) to Date.now() (a real wall-clock epoch, safe to persist) — bumped
// so a v2 save's old-style timestamps never get subtracted against a
// fresh page's Date.now() and produce a nonsense multi-decade elapsed time.
// v2: board grew from 8x8 to 24x24 (DAILY_SIZE) — bumped so a v1 save (still
// shaped 8x8) never gets loaded and indexed as if it were 24x24.
export const DAILY_STORAGE_KEY = 'infinite-minesweeper-daily-v4';
const STORAGE_KEY = DAILY_STORAGE_KEY;

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

/** Fixed entry point: dead centre of the board, same for every daily
 * puzzle — matches the classic "click the middle first" convention and
 * gives the generator's first-sector 3x3 safe-patch treatment evenly. */
const ENTRY_ROW = Math.floor(DAILY_SIZE / 2);
const ENTRY_COL = Math.floor(DAILY_SIZE / 2);

/** Every daily puzzle has exactly this many mines — a fixed, comparable
 * number across days (like a fixed word length in Wordle), rather than
 * whatever a density roll happens to land on. */
const DAILY_MINE_COUNT = 60;

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
            lockedPrice: null,
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
        game.streak = stored.streak;
        game.lastCompletedDate = stored.lastCompletedDate;
        return game;
      }
    } catch {
      // Fall through to a fresh generation.
    }
    const game = DailyGame.generate(dateStr);
    game.carryStreakFromLegacySave();
    return game;
  }

  /** One-time migration for a storage-key bump (see DAILY_STORAGE_KEY's
   * comments): a pre-bump save is unreadable as a board (either the wrong
   * shape, or the wrong timestamp semantics), but its streak count is worth
   * preserving rather than silently resetting to 0 the first time a player
   * opens the game post-update. */
  private carryStreakFromLegacySave() {
    try {
      const raw =
        localStorage.getItem('infinite-minesweeper-daily-v3') ??
        localStorage.getItem('infinite-minesweeper-daily-v2') ??
        localStorage.getItem('infinite-minesweeper-daily-v1');
      if (!raw) return;
      const legacy = JSON.parse(raw) as { streak?: number; lastCompletedDate?: string | null };
      if (typeof legacy.streak === 'number') this.streak = legacy.streak;
      if (legacy.lastCompletedDate !== undefined) this.lastCompletedDate = legacy.lastCompletedDate ?? null;
    } catch {
      // Non-fatal — worst case the streak just restarts at 0.
    }
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
      DAILY_SIZE,
      DAILY_MINE_COUNT,
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
    if (row < 0 || row >= DAILY_SIZE || col < 0 || col >= DAILY_SIZE) return null;
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
   * count) is what's comparable across players, like a Wordle guess count.
   *
   * `now` here is an *animation* clock (performance.now(), matching the
   * rAF-driven flip timing elsewhere) — it never gets persisted. Elapsed
   * play time is tracked separately via startedAt/completedAt, which use
   * Date.now() instead precisely because they DO get persisted and need to
   * survive a reload (see getElapsedMs). */
  reveal(row: number, col: number, now: number): { revealedCount: number; maxDist: number; hitMine: boolean } | null {
    if (this.isComplete()) return null;
    const cell = this.cellAt(row, col);
    if (!cell || cell.revealed || cell.flagged) return null;
    if (this.startedAt == null) this.startedAt = Date.now();

    if (cell.mine) {
      this.revealCell(cell, now);
      cell.exploded = true;
      this.mistakes++;
      this.checkComplete();
      this.save();
      return { revealedCount: 1, maxDist: 0, hitMine: true };
    }

    // Small bounded flood fill — same adjacent===0 cascade rule as the
    // endless game, just clipped to this board's fixed size instead of
    // crossing sector boundaries.
    const queue: [number, number, number][] = [[row, col, 0]];
    const seen = new Set<string>([`${row},${col}`]);
    let revealedCount = 0;
    let maxDist = 0;

    while (queue.length) {
      const [r, c, dist] = queue.shift()!;
      const cs = this.cellAt(r, c);
      if (!cs || cs.revealed || cs.flagged || cs.mine) continue;
      cs.revealed = true;
      cs.flipStart = now + dist * 86;
      revealedCount++;
      if (dist > maxDist) maxDist = dist;
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

    this.checkComplete();
    this.save();
    return { revealedCount, maxDist, hitMine: false };
  }

  toggleFlag(row: number, col: number): boolean {
    if (this.isComplete()) return false;
    const cell = this.cellAt(row, col);
    if (!cell || cell.revealed) return false;
    cell.flagged = !cell.flagged;
    this.save();
    return true;
  }

  private checkComplete() {
    const allSafeRevealed = this.sector.cells.flat().every((c) => c.mine || c.revealed);
    if (!allSafeRevealed) return;
    this.completedAt = Date.now();
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

  /** startedAt/completedAt are Date.now()-based (see reveal()'s doc comment),
   * so this reads the wall clock directly rather than taking a caller-
   * supplied `now` — there's no legitimate performance.now() value that
   * could be subtracted against them correctly. */
  getElapsedMs(): number {
    if (this.startedAt == null) return 0;
    return (this.completedAt ?? Date.now()) - this.startedAt;
  }

  /** Classic minesweeper flag counter: total mines minus flags currently
   * placed. Recomputed from the board each call rather than tracked
   * incrementally — the board is only 64 cells, so scanning it every frame
   * is cheap, and this way it can never drift out of sync with the actual
   * cell state. Goes negative if the player over-flags, same as the classic
   * game. */
  minesRemaining(): number {
    let total = 0;
    let flagged = 0;
    for (const row of this.sector.cells) {
      for (const c of row) {
        if (c.mine) total++;
        if (c.flagged) flagged++;
      }
    }
    return total - flagged;
  }
}
