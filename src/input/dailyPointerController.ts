import { Camera, MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { DAILY_WORLD_SIZE, FLIP_MS, TILE } from '../render/renderer';
import { DailyGame } from '../core/dailyGame';
import { RIPPLE_MS } from '../core/world';
import { DAILY_SIZE } from '../core/types';
import { playSfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { showFlagCue, showToast } from '../ui/toast';

const LONG_PRESS_MS = 280;

interface DragState {
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: boolean;
  id: number;
}

interface PinchState {
  dist: number;
  zoom: number;
  midX: number;
  midY: number;
  worldX: number;
  worldY: number;
}

/** Pan/pinch/wheel mirror PointerController's endless-mode implementation
 * (see that file for the reasoning behind the cached-rect and drag/inertia
 * approach) against a Camera bounded to the fixed DAILY_WORLD_SIZE board
 * instead of an infinite one. Reveal/flag logic stays much simpler than
 * endless mode — no sector lock/adjacency-gating concepts exist here (see
 * dailyGame.ts module doc), just tap-to-reveal and long-press/right-click-
 * to-flag. Shares a canvas with the endless mode's PointerController (see
 * main.ts) — gated the same way, see that class for why. */
export class DailyPointerController {
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: DragState | null = null;
  private pinch: PinchState | null = null;
  private longPressTimer: number | null = null;
  private longPressFired = false;
  enabled = true;
  private cachedRect: DOMRect | null = null;
  // See PointerController's identical field — ignores reveal taps until the
  // current cascade's ripple animation finishes.
  private revealLockedUntil = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private game: DailyGame,
    private onChange: (revealedCount: number, hitMine: boolean) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => {
      this.cachedRect = null;
    });
  }

  private rect(): DOMRect {
    if (!this.cachedRect) this.cachedRect = this.canvas.getBoundingClientRect();
    return this.cachedRect;
  }

  private relPos(e: PointerEvent) {
    const rect = this.rect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private cellAt(x: number, y: number): { row: number; col: number } | null {
    const world = this.camera.screenToWorld(x, y);
    const row = Math.floor(world.y / TILE);
    const col = Math.floor(world.x / TILE);
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
      showFlagCue();
    } else {
      showToast("Can't flag an already-opened tile");
    }
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.cachedRect = null;
    if (e.button === 2) {
      const p = this.relPos(e);
      this.flagAt(p.x, p.y);
      return;
    }
    const p = this.relPos(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Same tolerance as the endless controller — harmless without capture.
    }
    const keys = [...this.pointers.keys()];
    if (keys.length === 1) {
      this.drag = { lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, moved: false, id: e.pointerId };
      this.camera.inertiaX = 0;
      this.camera.inertiaY = 0;
      this.camera.dragging = true;
      this.canvas.style.cursor = 'grabbing';
      if (e.pointerType === 'touch') {
        this.longPressFired = false;
        this.cancelLongPress();
        this.longPressTimer = window.setTimeout(() => {
          if (this.drag && !this.drag.moved && this.drag.id === e.pointerId) {
            this.longPressFired = true;
            this.flagAt(p.x, p.y);
            this.drag = null;
          }
        }, LONG_PRESS_MS);
      }
    } else if (keys.length === 2) {
      this.cancelLongPress();
      const [a, b] = keys.map((k) => this.pointers.get(k)!);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const world = this.camera.screenToWorld(midX, midY);
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.camera.zoom, midX, midY, worldX: world.x, worldY: world.y };
      this.drag = null;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this.relPos(e));
    const keys = [...this.pointers.keys()];

    if (keys.length >= 2 && this.pinch) {
      const rect = this.rect();
      const [a, b] = keys.map((k) => this.pointers.get(k)!);
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.pinch.zoom * (nd / this.pinch.dist)));
      this.camera.setZoomImmediate(nz);
      this.camera.x = this.pinch.worldX - (mx - rect.width / 2) / nz;
      this.camera.y = this.pinch.worldY - (my - rect.height / 2) / nz;
      this.camera.clamp(DAILY_WORLD_SIZE, DAILY_WORLD_SIZE);
    } else if (this.drag && this.drag.id === e.pointerId) {
      const p = this.pointers.get(e.pointerId)!;
      const dx = p.x - this.drag.lastX;
      const dy = p.y - this.drag.lastY;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.camera.clamp(DAILY_WORLD_SIZE, DAILY_WORLD_SIZE);
      this.camera.inertiaX = dx;
      this.camera.inertiaY = dy;
      this.drag.lastX = p.x;
      this.drag.lastY = p.y;
      if (Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > 6) {
        this.drag.moved = true;
        this.cancelLongPress();
      }
    }
  };

  private onUp = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.cancelLongPress();
    const was = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const keys = [...this.pointers.keys()];
    if (keys.length < 2) this.pinch = null;
    this.camera.dragging = false;

    if (this.longPressFired) {
      this.longPressFired = false;
      this.drag = null;
      if (keys.length === 1) {
        const rid = keys[0];
        const rp = this.pointers.get(rid)!;
        this.drag = { lastX: rp.x, lastY: rp.y, startX: rp.x, startY: rp.y, moved: true, id: rid };
        this.camera.dragging = true;
      }
      this.canvas.style.cursor = 'grab';
      return;
    }

    if (this.drag && this.drag.id === e.pointerId) {
      if (!this.drag.moved && was && performance.now() >= this.revealLockedUntil) {
        const cell = this.cellAt(was.x, was.y);
        if (cell) {
          const now = performance.now();
          const result = this.game.reveal(cell.row, cell.col, now);
          if (result) {
            if (result.hitMine) {
              playSfx('explosion');
              vibrate('explosion');
            } else {
              playSfx('flip');
              vibrate('flip');
              this.revealLockedUntil = now + result.maxDist * RIPPLE_MS + FLIP_MS;
            }
            this.onChange(result.revealedCount, result.hitMine);
          }
        }
      }
      this.drag = null;
    }
    if (keys.length === 1) {
      const rid = keys[0];
      const rp = this.pointers.get(rid)!;
      this.drag = { lastX: rp.x, lastY: rp.y, startX: rp.x, startY: rp.y, moved: true, id: rid };
      this.camera.dragging = true;
    }
    this.canvas.style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this.relPos(e as unknown as PointerEvent);
    const nz = this.camera.zoom * Math.exp(-e.deltaY * 0.0015);
    this.camera.setZoomAround(nz, p.x, p.y, DAILY_WORLD_SIZE, DAILY_WORLD_SIZE);
  };
}
