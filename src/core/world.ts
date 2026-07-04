import { generateSector } from './sectorGenerator';
import { Economy, unlockPrice } from './economy';
import { CellState, SECTOR_SIZE, Sector, sectorKeyStr } from './types';

/** "Dreamy" ripple pace for cascade reveals — ms between each successive BFS
 * ring's flip, see NOTES.md. Exported so callers (e.g. pointerController's
 * per-tile flip sfx) can stay in lockstep with the visual cascade. */
export const RIPPLE_MS = 86;

export type RevealEvent =
  | { type: 'reveal'; sr: number; sc: number }
  | { type: 'mineHit'; sr: number; sc: number }
  | { type: 'sectorLocked'; sr: number; sc: number }
  | { type: 'sectorCleared'; sr: number; sc: number }
  | { type: 'gemsEarned'; amount: number }
  | { type: 'sectorAutoUnlocked'; sr: number; sc: number };

export class World {
  private sectors = new Map<string, Sector>();
  private firstSectorGenerated = false;
  // Gates direct taps to cells adjacent to already-revealed ground once the
  // player has made their first move (see canRevealAt) — before that, any
  // cell is fair game since nothing has been revealed yet.
  private everRevealed = false;
  // Global "row,col" keys that must stay mine-free whenever their sector
  // eventually generates — reserved the instant a neighbouring cell is
  // revealed and its displayed number is computed assuming 0 mines here (see
  // revealAdjacencyAt). Without this, a sector generated later could place a
  // mine that retroactively makes an already-shown number wrong.
  private reservedSafe = new Set<string>();
  readonly worldSeed: number;
  readonly economy = new Economy();
  private listeners: Array<(e: RevealEvent) => void> = [];

  constructor(worldSeed = Date.now() & 0xffffffff) {
    this.worldSeed = worldSeed;
  }

  on(fn: (e: RevealEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(e: RevealEvent) {
    for (const fn of this.listeners) fn(e);
  }

  getSector(sr: number, sc: number): Sector | undefined {
    return this.sectors.get(sectorKeyStr(sr, sc));
  }

  private ensureSector(sr: number, sc: number, entryRow: number, entryCol: number): Sector {
    const key = sectorKeyStr(sr, sc);
    let sector = this.sectors.get(key);
    if (!sector) {
      const isFirst = !this.firstSectorGenerated;
      this.firstSectorGenerated = true;
      sector = generateSector(
        this.worldSeed,
        sr,
        sc,
        entryRow,
        entryCol,
        isFirst,
        (row, col) => this.globalMineAt(row, col),
        (row, col) => this.reservedSafe.has(`${row},${col}`),
      );
      this.sectors.set(key, sector);
    }
    return sector;
  }

  private cellAt(sector: Sector, row: number, col: number): CellState {
    const localRow = ((row % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
    const localCol = ((col % SECTOR_SIZE) + SECTOR_SIZE) % SECTOR_SIZE;
    return sector.cells[localRow][localCol];
  }

  private globalMineAt(row: number, col: number): boolean | undefined {
    const sr = Math.floor(row / SECTOR_SIZE);
    const sc = Math.floor(col / SECTOR_SIZE);
    const sector = this.getSector(sr, sc);
    if (!sector) return undefined;
    return this.cellAt(sector, row, col).mine;
  }

  /** True global adjacency for a cell about to be revealed, computed fresh
   * from whatever neighbouring sectors currently exist. Any neighbour that
   * doesn't exist yet is permanently reserved mine-free (see reservedSafe)
   * the instant this runs, so the number can never be invalidated by a
   * sector generated later — it's correct now and stays correct forever. */
  private revealAdjacencyAt(row: number, col: number): number {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        const m = this.globalMineAt(nr, nc);
        if (m === true) count++;
        else if (m === undefined) this.reservedSafe.add(`${nr},${nc}`);
      }
    }
    return count;
  }

  /** Hitting a mine incidentally proves things about flags near it: for every
   * already-revealed numbered tile that has this mine as one of its 8
   * neighbours, that tile's own 8 neighbours are now known — so any flag
   * among them sitting on a cell that *isn't* actually a mine is provably
   * wrong. Marks it (flagWrong) so the renderer can show an "X" over it;
   * resolveWrongFlag() lets the player tap it away. */
  private markWrongFlagsNear(mineRow: number, mineCol: number) {
    for (let dr1 = -1; dr1 <= 1; dr1++) {
      for (let dc1 = -1; dc1 <= 1; dc1++) {
        if (dr1 === 0 && dc1 === 0) continue;
        const nr = mineRow + dr1;
        const nc = mineCol + dc1;
        const nSector = this.getSector(Math.floor(nr / SECTOR_SIZE), Math.floor(nc / SECTOR_SIZE));
        if (!nSector) continue;
        const numberCell = this.cellAt(nSector, nr, nc);
        if (!numberCell.revealed || numberCell.mine) continue; // not a revealed "number" tile

        for (let dr2 = -1; dr2 <= 1; dr2++) {
          for (let dc2 = -1; dc2 <= 1; dc2++) {
            if (dr2 === 0 && dc2 === 0) continue;
            const fr = nr + dr2;
            const fc = nc + dc2;
            const fSector = this.getSector(Math.floor(fr / SECTOR_SIZE), Math.floor(fc / SECTOR_SIZE));
            if (!fSector) continue;
            const flagCell = this.cellAt(fSector, fr, fc);
            if (flagCell.flagged && !flagCell.mine) flagCell.flagWrong = true;
          }
        }
      }
    }
  }

  /** Resolves a proven-wrong flag: unflags the tile and reveals it directly
   * (it's guaranteed safe — that's exactly what made the flag provably
   * wrong). Stays behind the lock like everything else in the sector — the
   * player has to unlock it first, same as any other tile there. No cascade
   * — just this one cell. Returns false if the given cell isn't a
   * marked-wrong flag, or its sector is still locked. */
  resolveWrongFlag(row: number, col: number, now: number): boolean {
    const sector = this.getSector(Math.floor(row / SECTOR_SIZE), Math.floor(col / SECTOR_SIZE));
    if (!sector || sector.locked) return false;
    const cell = this.cellAt(sector, row, col);
    if (!cell.flagWrong) return false;
    cell.flagged = false;
    cell.flagWrong = false;
    cell.revealed = true;
    cell.adjacent = this.revealAdjacencyAt(row, col);
    cell.flipStart = now;
    this.tryCompleteSector(sector, now);
    return true;
  }

  private isRevealedAt(row: number, col: number): boolean {
    const sr = Math.floor(row / SECTOR_SIZE);
    const sc = Math.floor(col / SECTOR_SIZE);
    const sector = this.getSector(sr, sc);
    if (!sector) return false;
    return this.cellAt(sector, row, col).revealed;
  }

  /** Direct taps are only allowed on the very first move (nothing revealed
   * yet) or on a cell touching at least one already-revealed cell — stops the
   * player from poking random far-away tiles instead of expanding the
   * frontier. Cascade-driven reveals aren't subject to this (see reveal()). */
  canRevealAt(row: number, col: number): boolean {
    if (!this.everRevealed) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (this.isRevealedAt(row + dr, col + dc)) return true;
      }
    }
    return false;
  }

  reveal(row: number, col: number, now: number): { revealedCount: number; maxDist: number; distances: number[] } | null {
    if (!this.canRevealAt(row, col)) return null;
    const sr = Math.floor(row / SECTOR_SIZE);
    const sc = Math.floor(col / SECTOR_SIZE);
    const sector = this.ensureSector(sr, sc, row, col);
    if (sector.locked) return null;

    const cell = this.cellAt(sector, row, col);
    if (cell.revealed || cell.flagged) return null;
    this.everRevealed = true;

    if (cell.mine) {
      cell.revealed = true;
      cell.exploded = true;
      cell.flipStart = now;
      this.markWrongFlagsNear(row, col);
      this.emit({ type: 'mineHit', sr, sc });
      setTimeout(() => {
        sector.locked = true;
        this.emit({ type: 'sectorLocked', sr, sc });
      }, 460);
      return null;
    }

    // Flood fill cascades freely across sector boundaries — sectors are just
    // the lock/economy unit, not a wall to the reveal itself. Crossing into a
    // not-yet-generated sector generates it on demand, using the specific
    // crossing cell as that sector's no-guess solvability entry point (see
    // NOTES.md), so the guarantee holds regardless of whether a sector was
    // entered by a direct tap or a cascade arriving from a neighbour. A
    // *locked* sector does act as a wall: the cascade can't pass through one.
    // Emergency-only safety valve against freezing the main thread on an
    // open region spanning many freshly-generated sectors. This must stay
    // high enough to (essentially) never engage in normal play: a "0" tile
    // is only ever correct on screen if *every* one of its 8 neighbours is
    // also revealed, and this cap can only be enforced by cutting the BFS
    // off mid-flood — there's no way to stop early "cleanly" at a cell
    // boundary, since any 0-cell whose neighbour-reveal gets interrupted
    // becomes a visible rule violation (a blank tile bordering a still-
    // covered *safe* tile). A previous version dropped this to 80 to make
    // reveals feel smaller, which is exactly what caused that bug — measured
    // 14 such violations after a single reveal. "Cascades feel big" needs a
    // fix that doesn't touch this cap (pacing/animation, see RIPPLE_MS and
    // Camera.triggerCascadeZoom) rather than truncating revealed state.
    const MAX_CASCADE_CELLS = 3000;

    const key = (r: number, c: number) => `${r},${c}`;
    const queue: [number, number, number][] = [[row, col, 0]];
    const seen = new Set<string>([key(row, col)]);
    const touchedSectors = new Map<string, Sector>();
    let maxDist = 0;
    let revealedCount = 0;
    const distances: number[] = [];

    while (queue.length) {
      if (revealedCount >= MAX_CASCADE_CELLS) break;
      const [r, c, dist] = queue.shift()!;
      const sr2 = Math.floor(r / SECTOR_SIZE);
      const sc2 = Math.floor(c / SECTOR_SIZE);
      const cellSector = this.ensureSector(sr2, sc2, r, c);
      if (cellSector.locked) continue; // cascade cannot pass through a locked sector

      const cs = this.cellAt(cellSector, r, c);
      if (cs.revealed || cs.flagged || cs.mine) continue;

      cs.revealed = true;
      cs.adjacent = this.revealAdjacencyAt(r, c);
      cs.flipStart = now + dist * RIPPLE_MS;
      revealedCount++;
      distances.push(dist);
      touchedSectors.set(sectorKeyStr(sr2, sc2), cellSector);
      if (dist > maxDist) maxDist = dist;

      if (cs.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            const k = key(nr, nc);
            if (!seen.has(k)) {
              seen.add(k);
              queue.push([nr, nc, dist + 1]);
            }
          }
        }
      }
    }

    for (const touched of touchedSectors.values()) {
      this.emit({ type: 'reveal', sr: touched.sr, sc: touched.sc });
      this.tryCompleteSector(touched, now);
    }

    return { revealedCount, maxDist, distances };
  }

  /** A sector is done as soon as either half of the classic minesweeper
   * completion condition holds — all its mines are accounted for (flagged, or
   * already revealed from a past mine hit) or all its safe tiles are
   * revealed — and auto-completes the other half, exactly like a classic
   * minesweeper "chord"/auto-solve once the count matches. */
  private tryCompleteSector(sector: Sector, now: number) {
    if (sector.cleared) return;
    const flat = sector.cells.flat();
    const allSafeRevealed = flat.every((c) => c.mine || c.revealed);
    const allMinesAccounted = flat.every((c) => !c.mine || c.flagged || c.revealed);
    if (!allSafeRevealed && !allMinesAccounted) return;

    if (allMinesAccounted && !allSafeRevealed) {
      // Every mine is flagged/revealed — whatever's left must be safe.
      for (let r = 0; r < SECTOR_SIZE; r++) {
        for (let c = 0; c < SECTOR_SIZE; c++) {
          const cell = sector.cells[r][c];
          if (!cell.mine && !cell.revealed) {
            cell.revealed = true;
            cell.adjacent = this.revealAdjacencyAt(sector.sr * SECTOR_SIZE + r, sector.sc * SECTOR_SIZE + c);
            cell.flipStart = now;
          }
        }
      }
    } else if (allSafeRevealed && !allMinesAccounted) {
      // Every safe tile is revealed — whatever's left must be mines.
      for (const row of sector.cells) {
        for (const cell of row) {
          if (cell.mine && !cell.flagged && !cell.revealed) cell.flagged = true;
        }
      }
    }

    sector.cleared = true;
    const reward = this.economy.recordSectorCleared();
    this.emit({ type: 'sectorCleared', sr: sector.sr, sc: sector.sc });
    this.emit({ type: 'gemsEarned', amount: reward });
    this.checkNeighboursForAutoUnlock(sector.sr, sector.sc);
  }

  /** Returns false (no-op) if the cell can't be flagged right now — a revealed
   * cell has nothing to flag. Locked/ungenerated sectors are checked by the
   * caller (pointerController) so it can show a more specific reason. */
  toggleFlag(row: number, col: number): boolean {
    const sr = Math.floor(row / SECTOR_SIZE);
    const sc = Math.floor(col / SECTOR_SIZE);
    const sector = this.getSector(sr, sc);
    if (!sector || sector.locked) return false;
    const cell = this.cellAt(sector, row, col);
    if (cell.revealed) return false;
    cell.flagged = !cell.flagged;
    if (!cell.flagged) cell.flagWrong = false;
    else this.tryCompleteSector(sector, performance.now());
    return true;
  }

  /** Of the 8 sectors surrounding (sr,sc), how many are fully cleared (or don't
   * exist / haven't been touched yet — an unexplored neighbour doesn't block
   * the free adjacency-unlock path in either direction; only a *locked* one does). */
  solvedNeighbourCount(sr: number, sc: number): { solved: number; total8: boolean[] } {
    let solved = 0;
    const total8: boolean[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const n = this.getSector(sr + dr, sc + dc);
        const isSolved = !!n && n.cleared;
        total8.push(isSolved);
        if (isSolved) solved++;
      }
    }
    return { solved, total8 };
  }

  private checkNeighboursForAutoUnlock(sr: number, sc: number) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const n = this.getSector(sr + dr, sc + dc);
        if (!n || !n.locked) continue;
        const { solved } = this.solvedNeighbourCount(n.sr, n.sc);
        if (solved === 8) {
          n.locked = false;
          this.emit({ type: 'sectorAutoUnlocked', sr: n.sr, sc: n.sc });
          this.tryCompleteSector(n, performance.now());
        }
      }
    }
  }

  unlockPriceFor(sr: number, sc: number): number {
    const sector = this.getSector(sr, sc);
    if (!sector) return 0;
    const { solved } = this.solvedNeighbourCount(sr, sc);
    const mineCount = sector.cells.flat().filter((c) => c.mine).length;
    return unlockPrice(solved, mineCount);
  }

  unlockWithGems(sr: number, sc: number): boolean {
    const price = this.unlockPriceFor(sr, sc);
    if (!this.economy.spendGems(price)) return false;
    const sector = this.getSector(sr, sc);
    if (sector) {
      sector.locked = false;
      this.tryCompleteSector(sector, performance.now());
    }
    return true;
  }

  unlockWithAd(sr: number, sc: number) {
    const sector = this.getSector(sr, sc);
    if (sector) {
      sector.locked = false;
      this.tryCompleteSector(sector, performance.now());
    }
  }

  claimVault(sr: number, sc: number, reward: number): boolean {
    const sector = this.getSector(sr, sc);
    if (!sector || !sector.isVault || sector.vaultClaimed || !sector.cleared) return false;
    sector.vaultClaimed = true;
    this.economy.addGems(reward);
    this.emit({ type: 'gemsEarned', amount: reward });
    return true;
  }
}
