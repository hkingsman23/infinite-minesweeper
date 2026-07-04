import { SECTOR_SIZE } from './types';

const N = SECTOR_SIZE * SECTOR_SIZE;

function neighborsOf(idx: number): number[] {
  const row = Math.floor(idx / SECTOR_SIZE);
  const col = idx % SECTOR_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < SECTOR_SIZE && nc >= 0 && nc < SECTOR_SIZE) {
        out.push(nr * SECTOR_SIZE + nc);
      }
    }
  }
  return out;
}

const NEIGHBOR_CACHE: number[][] = Array.from({ length: N }, (_, i) => neighborsOf(i));

/**
 * Pure logical solver used only for generation-time validation (never shown to
 * the player). `adjacent` is supplied by the caller rather than computed here —
 * sectorGenerator.ts computes it globally (own mines plus real mines from any
 * already-existing neighbouring sector), so the deduction below reasons about
 * the exact same numbers that will eventually be displayed.
 *
 * `external[i]` is the portion of `adjacent[i]` contributed by an
 * already-generated neighbouring sector rather than this sector's own
 * placement — i.e. mines this solver has no unknown cell to "find" for,
 * because they aren't inside the 64-cell array it reasons about at all. A
 * border cell's remaining-mines count must discount that portion before
 * comparing against local unknown/flagged counts; treating the *whole*
 * adjacent[i] as something to satisfy purely from local cells (the original
 * bug here) made the solver reject a large fraction of otherwise-fine
 * layouts — any border cell touching a neighbour's mine could never balance,
 * since nothing local could ever account for it.
 *
 * Deduction uses only single-point logic + pairwise subset logic (the same
 * techniques a human "no-guess" solver would use) — no global mine-count
 * inference, since the player is never shown a total mine count per sector.
 * Returns true iff the entire non-mine area can be revealed via pure deduction
 * starting from `entryIdx`, with zero guesses required.
 */
export function isSolvableFrom(mines: boolean[], adjacent: number[], external: number[], entryIdx: number): boolean {
  if (mines[entryIdx]) return false;

  const revealed = new Array<boolean>(N).fill(false);
  const flagged = new Array<boolean>(N).fill(false);

  const reveal = (idx: number) => {
    if (revealed[idx] || flagged[idx]) return;
    revealed[idx] = true;
    if (adjacent[idx] === 0) {
      for (const n of NEIGHBOR_CACHE[idx]) reveal(n);
    }
  };
  reveal(entryIdx);

  let changed = true;
  while (changed) {
    changed = false;

    // Single-point deduction.
    for (let i = 0; i < N; i++) {
      if (!revealed[i] || adjacent[i] <= 0) continue;
      const neighbors = NEIGHBOR_CACHE[i];
      const unknown = neighbors.filter((n) => !revealed[n] && !flagged[n]);
      if (unknown.length === 0) continue;
      const flaggedCount = neighbors.filter((n) => flagged[n]).length;
      const remaining = adjacent[i] - external[i] - flaggedCount;
      if (remaining === 0) {
        for (const u of unknown) reveal(u);
        changed = true;
      } else if (remaining === unknown.length) {
        for (const u of unknown) {
          if (!flagged[u]) {
            flagged[u] = true;
            changed = true;
          }
        }
      }
    }

    // Pairwise subset deduction (resolves classic 1-2-1 style chains).
    const constraints: { cells: number[]; remaining: number }[] = [];
    for (let i = 0; i < N; i++) {
      if (!revealed[i] || adjacent[i] <= 0) continue;
      const neighbors = NEIGHBOR_CACHE[i];
      const unknown = neighbors.filter((n) => !revealed[n] && !flagged[n]);
      if (unknown.length === 0) continue;
      const flaggedCount = neighbors.filter((n) => flagged[n]).length;
      constraints.push({ cells: unknown, remaining: adjacent[i] - external[i] - flaggedCount });
    }
    for (const a of constraints) {
      for (const b of constraints) {
        if (a === b) continue;
        if (a.cells.length >= b.cells.length) continue;
        if (!a.cells.every((c) => b.cells.includes(c))) continue;
        const diffCells = b.cells.filter((c) => !a.cells.includes(c));
        const diffMines = b.remaining - a.remaining;
        if (diffMines === 0) {
          for (const c of diffCells) reveal(c);
          changed = true;
        } else if (diffMines === diffCells.length) {
          for (const c of diffCells) {
            if (!flagged[c]) {
              flagged[c] = true;
              changed = true;
            }
          }
        }
      }
    }
  }

  for (let i = 0; i < N; i++) {
    if (!mines[i] && !revealed[i]) return false;
  }
  return true;
}
