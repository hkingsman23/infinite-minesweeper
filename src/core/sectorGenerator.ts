import { hashInts, mulberry32 } from './rng';
import { isSolvableFrom } from './solver';
import { CellState, MINE_DENSITY, SECTOR_SIZE, Sector, VAULT_CHANCE } from './types';

const MAX_ATTEMPTS = 800;
// Floor the backoff can descend to. Heavily-explored "gap" sectors (most of
// their border forced mine-free by already-revealed neighbours, see
// isReservedSafe below) have much less room for mines and the solver has to
// settle for a sparser layout to keep them logically solvable — but we still
// want a reasonable minimum rather than crawling all the way down.
const DENSITY_FLOOR = 0.18;

function entryIndexFor(entryRow: number, entryCol: number, size: number): number {
  const localRow = ((entryRow % size) + size) % size;
  const localCol = ((entryCol % size) + size) % size;
  return localRow * size + localCol;
}

/** True mine count for cell `idx`'s 8 neighbours, counting real mines from
 * already-existing neighbouring sectors (via `globalMineAt`) for cells on this
 * sector's border — not just this sector's own mines. Neighbours that don't
 * exist yet contribute 0, which `World`'s reserved-safe mechanism (see
 * world.ts) guarantees will hold true forever once this cell is revealed.
 * Standalone boards (globalMineAt always returning undefined) never hit the
 * `external` branch at all, so every cell's count is just its own mines.
 *
 * Also returns `external`: the portion of each cell's count that comes from
 * an already-generated neighbouring sector rather than this sector's own
 * placement. The solver needs this split — see isSolvableFrom's `external`
 * parameter for why conflating the two made the solver wrongly reject a lot
 * of perfectly fine layouts. */
function computeAdjacent(
  mines: boolean[],
  sr: number,
  sc: number,
  size: number,
  globalMineAt: (row: number, col: number) => boolean | undefined,
): { adjacent: number[]; external: number[] } {
  const n = size * size;
  const adjacent = new Array<number>(n);
  const external = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (mines[i]) {
      adjacent[i] = -1;
      continue;
    }
    const row = Math.floor(i / size);
    const col = i % size;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (mines[nr * size + nc]) count++;
        } else if (globalMineAt(sr * size + nr, sc * size + nc) === true) {
          count++;
          external[i]++;
        }
      }
    }
    adjacent[i] = count;
  }
  return { adjacent, external };
}

/**
 * Generates one sector's mine layout, deterministic from (worldSeed, sr, sc),
 * rejecting any layout that isn't solvable via pure logical deduction from the
 * given entry cell (see solver.ts) — this is the "no-guess" guarantee. Retries
 * with a fresh shuffle on rejection; backs off mine density if it can't find a
 * solvable layout within MAX_ATTEMPTS (keeps generation from ever hanging).
 *
 * `size` defaults to SECTOR_SIZE (8) — the endless mode's per-sector grid,
 * stitched together via `globalMineAt`/`isReservedSafe` as the player
 * explores (see world.ts). The daily challenge instead generates a single
 * larger standalone board (`globalMineAt` always undefined, `isReservedSafe`
 * always false) by passing its own `size`.
 *
 * Adjacency numbers are computed *globally*: a border cell's count includes
 * real mines from any neighbouring sector that already exists, not just this
 * sector's own mines (see computeAdjacent). `isReservedSafe` forces this
 * sector's own cells to stay mine-free wherever an already-revealed
 * neighbouring cell's displayed number already assumed 0 mines from here —
 * without that, this sector could retroactively make an already-shown number
 * wrong. Together these two make cross-sector-boundary numbers always
 * accurate (see NOTES.md — this replaces the earlier sector-local scheme).
 *
 * `mineCount`, when given, places exactly that many mines (a shuffle over
 * all eligible cells) instead of rolling each cell independently against a
 * density — used by the daily challenge, which wants a fixed, comparable
 * mine count every day rather than a roughly-density-sized one. Endless mode
 * always omits it and keeps the density-based roll (and its backoff), since
 * per-sector mine count there was never meant to be a fixed, player-facing
 * number.
 */
export function generateSector(
  worldSeed: number,
  sr: number,
  sc: number,
  entryRow: number,
  entryCol: number,
  isFirstSector: boolean,
  globalMineAt: (row: number, col: number) => boolean | undefined,
  isReservedSafe: (row: number, col: number) => boolean,
  size: number = SECTOR_SIZE,
  mineCount?: number,
): Sector {
  const n = size * size;
  const entryIdx = entryIndexFor(entryRow, entryCol, size);
  const baseSeed = hashInts(worldSeed, sr, sc);

  const forcedSafeIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    if (isReservedSafe(sr * size + row, sc * size + col)) forcedSafeIdx.push(i);
  }

  const er = Math.floor(entryIdx / size);
  const ec = entryIdx % size;
  const excludedIdx = new Set<number>(forcedSafeIdx);
  excludedIdx.add(entryIdx);
  if (isFirstSector) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = er + dr;
        const nc = ec + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) excludedIdx.add(nr * size + nc);
      }
    }
  }
  const eligibleIdx: number[] = [];
  for (let i = 0; i < n; i++) if (!excludedIdx.has(i)) eligibleIdx.push(i);

  let mines: boolean[] = [];
  let adjacent: number[] = [];
  let external: number[] = [];
  let attempts = 0;
  let density = MINE_DENSITY;

  for (; attempts < MAX_ATTEMPTS; attempts++) {
    const rnd = mulberry32(hashInts(baseSeed, attempts));
    mines = new Array(n).fill(false);

    if (mineCount != null) {
      // Fisher-Yates shuffle of the eligible cells, then mine the first
      // `mineCount` of them — guarantees the exact count regardless of seed,
      // rather than a density roll that only averages out to one.
      const shuffled = eligibleIdx.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (let k = 0; k < Math.min(mineCount, shuffled.length); k++) mines[shuffled[k]] = true;
    } else {
      for (let i = 0; i < n; i++) mines[i] = rnd() < density;
      // Never place a mine on the entry cell; on the very first sector of a
      // game, clear a 3x3 safe patch around the entry cell (classic
      // first-click safety).
      mines[entryIdx] = false;
      if (isFirstSector) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = er + dr;
            const nc = ec + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
              mines[nr * size + nc] = false;
            }
          }
        }
      }
      for (const idx of forcedSafeIdx) mines[idx] = false;
    }

    ({ adjacent, external } = computeAdjacent(mines, sr, sc, size, globalMineAt));
    if (isSolvableFrom(mines, adjacent, external, entryIdx, size)) break;
    // Progressive back-off: the no-guess constraint makes higher densities
    // exponentially harder to satisfy, so ease off gradually every 40 attempts
    // rather than once — this reliably converges on a solvable board instead
    // of exhausting the whole budget at a density that's just too high. Only
    // meaningful for the density-based path — a fixed mineCount has nothing
    // to back off (the count doesn't change), it just reshuffles and retries.
    if (mineCount == null && attempts > 0 && attempts % 40 === 0) density = Math.max(DENSITY_FLOOR, density - 0.02);
  }

  const vaultRoll = mulberry32(hashInts(baseSeed, 777001))();
  const isVault = !isFirstSector && vaultRoll < VAULT_CHANCE;

  const cells: CellState[][] = [];
  for (let r = 0; r < size; r++) {
    const row: CellState[] = [];
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row.push({
        mine: mines[idx],
        // Best-known value as of generation time; World.reveal() overwrites
        // this with a fresh lazy computation the instant the cell is actually
        // revealed, so it's always exactly correct at display time regardless
        // of what neighbours existed when this sector itself was generated.
        adjacent: Math.max(0, adjacent[idx]),
        revealed: false,
        flagged: false,
        flipStart: null,
        exploded: false,
        flagWrong: false,
      });
    }
    cells.push(row);
  }

  return {
    sr,
    sc,
    cells,
    cleared: false,
    locked: false,
    isVault,
    vaultClaimed: false,
    genAttempts: attempts + 1,
    lockedPrice: null,
  };
}
