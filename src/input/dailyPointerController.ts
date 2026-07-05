import { dailyBoardLayout } from '../render/renderer';
import { DailyGame } from '../core/dailyGame';
import { DAILY_SIZE } from '../core/types';
import { playSfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { showToast } from '../ui/toast';

const LONG_PRESS_MS = 280;

/** Much simpler than the endless mode's PointerController — the daily board
 * is fixed-size, centred, and never pans or zooms, so there's no camera
 * transform, inertia, or pinch handling to do. Just tap-to-reveal and
 * long-press/right-click-to-flag on a static grid. */
export class DailyPointerController {
  private downId: number | null = null;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private longPressTimer: number | null = null;
  private longPressFired = false;
  // Shares a canvas with the endless mode's PointerController (see
  // main.ts) — gated the same way, see that class for why.
  enabled = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: DailyGame,
    private onChange: (revealedCount: number, hitMine: boolean) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private relPos(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private cellAt(x: number, y: number): { row: number; col: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const { ts, originX, originY } = dailyBoardLayout(rect.width, rect.height);
    const col = Math.floor((x - originX) / ts);
    const row = Math.floor((y - originY) / ts);
    if (row < 0 || row >= DAILY_SIZE || col < 0 || col >= DAILY_SIZE) return null;
    return { row, col };
  }

  private cancelLongPress() {
    if (this.longPressTimer != null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private flagAt(x: number, y: number) {
    const cell = this.cellAt(x, y);
    if (!cell) return;
    if (this.game.toggleFlag(cell.row, cell.col)) {
      playSfx('flag');
      vibrate('flag');
    } else {
      showToast("Can't flag an already-opened tile");
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.button === 2) {
      const p = this.relPos(e);
      this.flagAt(p.x, p.y);
      return;
    }
    const p = this.relPos(e);
    this.downId = e.pointerId;
    this.downX = p.x;
    this.downY = p.y;
    this.moved = false;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Same tolerance as the endless controller — harmless without capture.
    }
    if (e.pointerType === 'touch') {
      this.longPressFired = false;
      this.cancelLongPress();
      this.longPressTimer = window.setTimeout(() => {
        if (this.downId === e.pointerId && !this.moved) {
          this.longPressFired = true;
          this.flagAt(p.x, p.y);
        }
      }, LONG_PRESS_MS);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (this.downId !== e.pointerId) return;
    const p = this.relPos(e);
    if (Math.hypot(p.x - this.downX, p.y - this.downY) > 6) {
      this.moved = true;
      this.cancelLongPress();
    }
  };

  private onCancel = () => {
    this.cancelLongPress();
    this.downId = null;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.cancelLongPress();
    if (this.downId !== e.pointerId) return;
    this.downId = null;

    if (this.longPressFired) {
      this.longPressFired = false;
      return;
    }
    if (this.moved) return;

    const p = this.relPos(e);
    const cell = this.cellAt(p.x, p.y);
    if (!cell) return;
    const result = this.game.reveal(cell.row, cell.col, performance.now());
    if (result) {
      if (result.hitMine) {
        playSfx('explosion');
        vibrate('explosion');
      } else {
        playSfx('flip');
        vibrate('flip');
      }
      this.onChange(result.revealedCount, result.hitMine);
    }
  };
}
