import { Camera, MAX_ZOOM, MIN_ZOOM } from '../render/camera';
import { TILE } from '../render/renderer';
import { World, RIPPLE_MS } from '../core/world';
import { SECTOR_SIZE } from '../core/types';
import { playSfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { showToast } from '../ui/toast';

// Cascades revealing more tiles than this get their flip sfx thinned out
// evenly rather than one-per-cell, so an extreme cascade can't spawn
// thousands of overlapping audio nodes at once.
const MAX_FLIP_SOUNDS = 150;

interface DragState {
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  moved: boolean;
  id: number;
}

const LONG_PRESS_MS = 280;

interface PinchState {
  dist: number;
  zoom: number;
  midX: number;
  midY: number;
  worldX: number;
  worldY: number;
}

export class PointerController {
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: DragState | null = null;
  private pinch: PinchState | null = null;
  private longPressTimer: number | null = null;
  private longPressFired = false;
  // Both endless and daily modes share one canvas/pointer stream (see
  // main.ts) — only the active mode's controller should react, so each
  // handler bails immediately when disabled rather than the two modes
  // fighting over the same taps.
  enabled = true;
  // getBoundingClientRect() is a synchronous call into layout — cheap in
  // isolation, but a drag/pinch gesture fires pointermove far more often
  // than the canvas's box can actually change, so it's cached per-gesture
  // (cleared on each onDown, and on resize) instead of re-queried on every
  // single move event. Measurable on weaker mobile CPUs where per-call
  // overhead adds up during a long pan.
  private cachedRect: DOMRect | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private world: World,
    private worldW: number,
    private worldH: number,
    private onTapRevealed: (cellCount: number, maxDist: number) => void,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
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

  private cellAt(x: number, y: number) {
    const world = this.camera.screenToWorld(x, y);
    return { row: Math.floor(world.y / TILE), col: Math.floor(world.x / TILE) };
  }

  private toggleFlagAt(x: number, y: number) {
    const { row, col } = this.cellAt(x, y);
    const sector = this.world.getSector(Math.floor(row / SECTOR_SIZE), Math.floor(col / SECTOR_SIZE));
    if (!sector) {
      showToast("There's nothing to flag there yet");
      return;
    }
    if (sector.locked) {
      showToast('This sector is locked');
      return;
    }
    if (this.world.toggleFlag(row, col)) {
      playSfx('flag');
      vibrate('flag');
    } else {
      showToast("Can't flag an already-opened tile");
    }
  }

  /** Plays the flip sfx for every tile the cascade revealed, each timed to
   * land right as that tile's own flip animation starts (see RIPPLE_MS) — a
   * big reveal reads as a patter of flips rather than one blended tone.
   *
   * Haptics are deliberately NOT repeated per tile here (unlike the sound) —
   * navigator.vibrate() needs a live user gesture, and by the time a
   * setTimeout callback fires tens or hundreds of ms later that gesture may
   * no longer count, so a vibrate() buried in this loop can silently do
   * nothing. The single vibrate('flip') in onUp, called synchronously the
   * instant the tap is handled, is the one that actually has a chance of
   * firing on a real device. */
  private playCascadeFlips(distances: number[]) {
    if (distances.length <= 1) {
      playSfx('flip');
      return;
    }
    let toPlay = distances;
    if (toPlay.length > MAX_FLIP_SOUNDS) {
      const step = toPlay.length / MAX_FLIP_SOUNDS;
      toPlay = Array.from({ length: MAX_FLIP_SOUNDS }, (_, i) => distances[Math.floor(i * step)]);
    }
    for (const dist of toPlay) {
      const jitter = Math.random() * 15;
      window.setTimeout(() => playSfx('flip'), dist * RIPPLE_MS + jitter);
    }
  }

  private cancelLongPress() {
    if (this.longPressTimer != null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /** Client coords relative to the canvas's rendered CSS-pixel box. The
   * camera/renderer both operate in that same CSS-pixel space (canvas.style
   * width/height are set directly to window.innerWidth/innerHeight in
   * main.ts's resize()), so no devicePixelRatio conversion belongs here —
   * that ratio only describes the backing-store resolution used for crisp
   * rendering, not the input coordinate space. A previous version divided by
   * the *raw* devicePixelRatio while the backing store was built using a
   * clamped-to-2 dpr, so on any phone with a real ratio above 2 (most modern
   * phones are 3), taps landed on the wrong tile with more error the further
   * from the top-left corner — mixing the two silently mismatched the scale. */
  private relPos(e: PointerEvent) {
    const rect = this.rect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    // Refresh once at the start of each gesture so drift between gestures
    // (e.g. a layout change while the finger was up) self-corrects, without
    // paying the cost again on every move within this one gesture.
    this.cachedRect = null;
    if (e.button === 2) {
      // Right-click: toggle a flag immediately, no drag/reveal.
      const rp = this.relPos(e);
      this.toggleFlagAt(rp.x, rp.y);
      return;
    }
    const p = this.relPos(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers/webviews reject capture for pointer ids they consider
      // inactive; harmless to continue without capture in that case.
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
            this.toggleFlagAt(p.x, p.y);
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
      this.camera.clamp(this.worldW, this.worldH);
    } else if (this.drag && this.drag.id === e.pointerId) {
      const p = this.pointers.get(e.pointerId)!;
      const dx = p.x - this.drag.lastX;
      const dy = p.y - this.drag.lastY;
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.camera.clamp(this.worldW, this.worldH);
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
      if (!this.drag.moved && was) {
        const { row, col } = this.cellAt(was.x, was.y);
        const sector = this.world.getSector(Math.floor(row / SECTOR_SIZE), Math.floor(col / SECTOR_SIZE));
        if (this.world.resolveWrongFlag(row, col, performance.now())) {
          playSfx('flip');
          vibrate('flip');
        } else if (sector && sector.locked) {
          playSfx('denied');
          vibrate('denied');
          showToast('This sector is locked — unlock it first');
        } else if (!this.world.canRevealAt(row, col)) {
          playSfx('denied');
          vibrate('denied');
          showToast('Open a tile next to revealed ground first');
        } else {
          const now = performance.now();
          const result = this.world.reveal(row, col, now);
          if (result) {
            vibrate('flip');
            this.playCascadeFlips(result.distances);
            this.onTapRevealed(result.revealedCount, result.maxDist);
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
    this.camera.setZoomAround(nz, p.x, p.y, this.worldW, this.worldH);
  };
}
