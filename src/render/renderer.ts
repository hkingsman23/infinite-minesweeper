import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';
import { drawEmoji } from './emoji';
import { Theme } from './theme';
import { DAILY_SIZE, Sector, SECTOR_SIZE, sectorKeyStr } from '../core/types';
import { World } from '../core/world';

const TILE = 32;
const FLIP_MS = 340;

export interface ShakeState {
  flashAlpha: number;
  shakeMag: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const CLEAR_PULSE_MS = 550;

/** The daily board's own world-pixel extent (TILE-sized cells, DAILY_SIZE on
 * a side) — shared by Renderer.drawDaily and the daily input controller so
 * both agree on the same camera-clamp bounds and hit-testing math. */
export const DAILY_WORLD_SIZE = DAILY_SIZE * TILE;

/** Zoom/pan that frames the whole board within ~86% of the smaller viewport
 * dimension — the same "fits nicely, centred" look the board always opened
 * with before pan/zoom existed, just expressed as a starting camera state
 * instead of a fixed layout. */
export function dailyInitialZoom(viewportW: number, viewportH: number): number {
  const fit = (Math.min(viewportW, viewportH) * 0.86) / DAILY_WORLD_SIZE;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));
}

export class Renderer {
  shake: ShakeState = { flashAlpha: 0, shakeMag: 0 };
  private clearPulses = new Map<string, number>(); // sectorKey -> start time

  constructor(
    private ctx: CanvasRenderingContext2D,
    public viewportW: number,
    public viewportH: number,
  ) {}

  resize(w: number, h: number) {
    this.viewportW = w;
    this.viewportH = h;
  }

  triggerMineFlash() {
    this.shake.flashAlpha = 0.55;
    this.shake.shakeMag = 9;
  }

  triggerSectorClearPulse(sr: number, sc: number, now: number) {
    this.clearPulses.set(`${sr},${sc}`, now);
  }

  private visibleRange(camera: Camera) {
    const hw = this.viewportW / 2 / camera.zoom;
    const hh = this.viewportH / 2 / camera.zoom;
    const c0 = Math.floor((camera.x - hw) / TILE) - 1;
    const c1 = Math.ceil((camera.x + hw) / TILE) + 1;
    const r0 = Math.floor((camera.y - hh) / TILE) - 1;
    const r1 = Math.ceil((camera.y + hh) / TILE) + 1;
    return { c0, c1, r0, r1 };
  }

  /** Screen rect for a whole sector, used both for drawing and for positioning
   * the HTML unlock/vault cards on top of the canvas. */
  sectorScreenRect(camera: Camera, sr: number, sc: number) {
    const lw = SECTOR_SIZE * TILE * camera.zoom;
    const p = camera.worldToScreen(sc * SECTOR_SIZE * TILE, sr * SECTOR_SIZE * TILE);
    return { x: p.x, y: p.y, w: lw, h: lw };
  }

  visibleSectors(camera: Camera): { sr: number; sc: number }[] {
    const { c0, c1, r0, r1 } = this.visibleRange(camera);
    const s0c = Math.floor(c0 / SECTOR_SIZE);
    const s1c = Math.floor(c1 / SECTOR_SIZE);
    const s0r = Math.floor(r0 / SECTOR_SIZE);
    const s1r = Math.floor(r1 / SECTOR_SIZE);
    const out: { sr: number; sc: number }[] = [];
    for (let sr = s0r; sr <= s1r; sr++) {
      for (let sc = s0c; sc <= s1c; sc++) out.push({ sr, sc });
    }
    return out;
  }

  draw(world: World, camera: Camera, theme: Theme, now: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewportW, this.viewportH);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.viewportW, this.viewportH);

    const shakeX = this.shake.shakeMag > 0.3 ? (Math.random() * 2 - 1) * this.shake.shakeMag : 0;
    const shakeY = this.shake.shakeMag > 0.3 ? (Math.random() * 2 - 1) * this.shake.shakeMag : 0;
    this.shake.shakeMag *= 0.86;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const ts = TILE * camera.zoom;
    const { c0, c1, r0, r1 } = this.visibleRange(camera);

    // The slot background and grid lines are the exact same colour for every
    // tile, so fill the whole viewport once and batch every tile's grid rect
    // into a single Path2D/stroke() call instead of one fillRect+strokeRect
    // per tile. At low zoom this loop covers 1000+ tiles, and on weaker
    // mobile GPUs it's the number of canvas calls — not the fill area — that
    // actually costs time. The grid line sits right at each tile's edge and
    // the cap/revealed face is always inset from it, so drawing every grid
    // line up front (before any cap) doesn't change how anything overlaps.
    ctx.fillStyle = theme.slot;
    ctx.fillRect(0, 0, this.viewportW, this.viewportH);
    const gridPath = new Path2D();

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const sr = Math.floor(r / SECTOR_SIZE);
        const sc = Math.floor(c / SECTOR_SIZE);
        const sector = world.getSector(sr, sc);
        const p = camera.worldToScreen(c * TILE, r * TILE);
        gridPath.rect(p.x + 0.5, p.y + 0.5, ts - 1, ts - 1);

        if (!sector) {
          // Not-yet-generated territory: still draw a normal covered-tile cap so
          // the whole board reads as covered, not blank — the mines/numbers just
          // haven't been procedurally generated yet (happens on-demand when a
          // cascade or tap actually reaches this cell).
          this.drawCap(p.x, p.y, ts, { flagged: false }, theme);
          continue;
        }
        const localRow = r - sr * SECTOR_SIZE;
        const localCol = c - sc * SECTOR_SIZE;
        const cell = sector.cells[localRow][localCol];

        if (!cell.revealed) {
          this.drawCap(p.x, p.y, ts, cell, theme);
          continue;
        }
        const prog = cell.flipStart != null ? (now - cell.flipStart) / FLIP_MS : 1;
        if (prog <= 0) {
          this.drawCap(p.x, p.y, ts, cell, theme);
          continue;
        }
        if (prog >= 1) {
          this.drawRevealed(p.x, p.y, ts, 1, cell, theme);
          continue;
        }
        const fx = Math.abs(Math.cos(prog * Math.PI));
        if (prog < 0.5) {
          this.drawFace(p.x, p.y, ts, fx, theme.cap, ts * 0.13);
        } else {
          this.drawRevealed(p.x, p.y, ts, fx, cell, theme);
        }
      }
    }

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.stroke(gridPath);

    // Sector overlays: lock dim + gridlines.
    const s0c = Math.floor(c0 / SECTOR_SIZE);
    const s1c = Math.floor(c1 / SECTOR_SIZE);
    const s0r = Math.floor(r0 / SECTOR_SIZE);
    const s1r = Math.floor(r1 / SECTOR_SIZE);
    for (let sr = s0r; sr <= s1r; sr++) {
      for (let sc = s0c; sc <= s1c; sc++) {
        const sector = world.getSector(sr, sc);
        if (!sector) continue;
        const rect = this.sectorScreenRect(camera, sr, sc);
        if (sector.locked) {
          ctx.fillStyle = theme.lockOverlay;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        } else if (sector.isVault && sector.cleared && !sector.vaultClaimed) {
          // Static, not pulsing — and opaque enough (matches doneOverlay's
          // alpha) to keep the "Watch ad to collect" card readable against
          // the board behind it, same reasoning as the lock/done overlays.
          ctx.fillStyle = 'rgba(214,170,54,0.85)';
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        } else if (sector.cleared) {
          // Same dim *treatment* as a locked sector (just without the card),
          // but a neutral tone rather than lockOverlay's red — cleared means
          // done, not dangerous.
          ctx.fillStyle = theme.doneOverlay;
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }

        // Gold border hint: shown the instant a sector is known to be a
        // vault (i.e. as soon as it's generated at all — isVault is decided
        // at generation time, so an ungenerated sector simply has no vault
        // status yet to leak) and until it's actually claimed. Independent
        // of the fill above so it layers over in-progress, locked, *and*
        // cleared-ready-to-collect states alike.
        if (sector.isVault && !sector.vaultClaimed) {
          ctx.strokeStyle = 'rgba(214,170,54,0.95)';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
        }

        const pulseStart = this.clearPulses.get(sectorKeyStr(sr, sc));
        if (pulseStart != null) {
          const t = now - pulseStart;
          if (t >= CLEAR_PULSE_MS) {
            this.clearPulses.delete(sectorKeyStr(sr, sc));
          } else {
            const alpha = 0.4 * (1 - t / CLEAR_PULSE_MS);
            ctx.fillStyle = theme.clearPulse.replace('ALPHA', alpha.toFixed(3));
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          }
        }
      }
    }

    ctx.strokeStyle = theme.sector;
    ctx.lineWidth = 2;
    for (let sc = s0c - 1; sc <= s1c + 1; sc++) {
      const x = camera.worldToScreen(sc * SECTOR_SIZE * TILE, 0).x;
      ctx.beginPath();
      ctx.moveTo(x, -20);
      ctx.lineTo(x, this.viewportH + 20);
      ctx.stroke();
    }
    for (let sr = s0r - 1; sr <= s1r + 1; sr++) {
      const y = camera.worldToScreen(0, sr * SECTOR_SIZE * TILE).y;
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.lineTo(this.viewportW + 20, y);
      ctx.stroke();
    }

    ctx.restore();

    if (this.shake.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(220,30,50,${this.shake.flashAlpha})`;
      ctx.fillRect(0, 0, this.viewportW, this.viewportH);
      this.shake.flashAlpha *= 0.9;
    }
  }

  /** Renders the daily challenge's single fixed board — pannable/zoomable via
   * `camera`, same as endless mode's draw(), just against a bounded
   * DAILY_SIZE x DAILY_SIZE grid instead of an infinite one, so (unlike
   * draw()) there's no not-yet-generated placeholder to paint outside it —
   * outside this one bounded board there's no more puzzle, so it should read
   * as empty, not more covered ground. Reuses the same per-cell drawing (and
   * thus the exact same flip animation, bevel, and number/emoji rendering)
   * via drawCap/drawFace/drawRevealed. */
  drawDaily(sector: Sector, camera: Camera, now: number, theme: Theme) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewportW, this.viewportH);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.viewportW, this.viewportH);

    const shakeX = this.shake.shakeMag > 0.3 ? (Math.random() * 2 - 1) * this.shake.shakeMag : 0;
    const shakeY = this.shake.shakeMag > 0.3 ? (Math.random() * 2 - 1) * this.shake.shakeMag : 0;
    this.shake.shakeMag *= 0.86;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const ts = TILE * camera.zoom;
    const topLeft = camera.worldToScreen(0, 0);
    const boardSize = DAILY_SIZE * ts;

    ctx.fillStyle = theme.slot;
    ctx.fillRect(topLeft.x, topLeft.y, boardSize + 0.5, boardSize + 0.5);
    const gridPath = new Path2D();

    for (let r = 0; r < DAILY_SIZE; r++) {
      for (let c = 0; c < DAILY_SIZE; c++) {
        const cell = sector.cells[r][c];
        const p = camera.worldToScreen(c * TILE, r * TILE);
        const sx = p.x;
        const sy = p.y;
        gridPath.rect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);

        if (!cell.revealed) {
          this.drawCap(sx, sy, ts, cell, theme);
          continue;
        }
        const prog = cell.flipStart != null ? (now - cell.flipStart) / FLIP_MS : 1;
        if (prog <= 0) {
          this.drawCap(sx, sy, ts, cell, theme);
          continue;
        }
        if (prog >= 1) {
          this.drawRevealed(sx, sy, ts, 1, cell, theme);
          continue;
        }
        const fx = Math.abs(Math.cos(prog * Math.PI));
        if (prog < 0.5) {
          this.drawFace(sx, sy, ts, fx, theme.cap, ts * 0.13);
        } else {
          this.drawRevealed(sx, sy, ts, fx, cell, theme);
        }
      }
    }

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.stroke(gridPath);

    ctx.strokeStyle = theme.sector;
    ctx.lineWidth = 2;
    ctx.strokeRect(topLeft.x, topLeft.y, boardSize, boardSize);

    ctx.restore();

    if (this.shake.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(220,30,50,${this.shake.flashAlpha})`;
      ctx.fillRect(0, 0, this.viewportW, this.viewportH);
      this.shake.flashAlpha *= 0.9;
    }
  }

  private drawFace(sx: number, sy: number, ts: number, fx: number, color: string, rad: number) {
    const ctx = this.ctx;
    const cx = sx + ts / 2;
    const w = ts * fx;
    const ins = ts * 0.05;
    roundRect(ctx, cx - w / 2 + ins * fx, sy + ins, Math.max(0.1, w - ins * 2 * fx), ts - ins * 2, rad * Math.abs(fx));
    ctx.fillStyle = color;
    ctx.fill();
    if (fx < 0.999) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - fx) * 0.3})`;
      ctx.fill();
    }
  }

  private drawCap(
    sx: number,
    sy: number,
    ts: number,
    cell: { flagged: boolean; flagWrong?: boolean },
    theme: Theme,
  ) {
    const ctx = this.ctx;
    roundRect(ctx, sx + ts * 0.05, sy + ts * 0.05, ts * 0.9, ts * 0.9, ts * 0.13);
    ctx.fillStyle = theme.cap;
    ctx.fill();
    ctx.strokeStyle = theme.hi;
    ctx.lineWidth = Math.max(1, ts * 0.035);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(sx + ts * 0.17, sy + ts * 0.08);
    ctx.lineTo(sx + ts * 0.83, sy + ts * 0.08);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const es = ts * 0.52;
    if (cell.flagged) {
      drawEmoji(ctx, '🚩', sx + ts / 2, sy + ts / 2, es);
      if (cell.flagWrong) {
        // A mine hit elsewhere proved this flag wrong — stamp a red "X" over
        // it in front of the flag (see World.markWrongFlagsNear).
        ctx.strokeStyle = '#e5342e';
        ctx.lineWidth = Math.max(2, ts * 0.09);
        ctx.lineCap = 'round';
        const pad = ts * 0.22;
        ctx.beginPath();
        ctx.moveTo(sx + pad, sy + pad);
        ctx.lineTo(sx + ts - pad, sy + ts - pad);
        ctx.moveTo(sx + ts - pad, sy + pad);
        ctx.lineTo(sx + pad, sy + ts - pad);
        ctx.stroke();
      }
    }
  }

  private drawRevealed(
    sx: number,
    sy: number,
    ts: number,
    fx: number,
    cell: { exploded: boolean; adjacent: number },
    theme: Theme,
  ) {
    this.drawFace(sx, sy, ts, fx, theme.revealed, ts * 0.1);
    if (Math.abs(fx) < 0.05) return;
    const ctx = this.ctx;
    if (cell.exploded) {
      ctx.save();
      ctx.translate(sx + ts / 2, sy + ts / 2);
      ctx.scale(fx, 1);
      drawEmoji(ctx, '💥', 0, 0, ts * 0.56);
      ctx.restore();
    } else if (cell.adjacent > 0) {
      ctx.save();
      ctx.translate(sx + ts / 2, sy + ts / 2);
      ctx.scale(fx, 1);
      ctx.fillStyle = theme.num;
      ctx.font = `800 ${ts * 0.56}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(cell.adjacent), 0, ts * 0.03);
      ctx.restore();
    }
  }
}

export { TILE, FLIP_MS };
