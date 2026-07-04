export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 1.9;

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private zoomTarget = 1;
  private savedZoom = 1;
  private autoReturnAt = 0;
  inertiaX = 0;
  inertiaY = 0;
  // Set by PointerController while a finger/pointer is actively dragging —
  // update()'s inertia-coast branch is skipped in that window (see below).
  dragging = false;

  constructor(
    private viewportW: number,
    private viewportH: number,
  ) {}

  resize(w: number, h: number) {
    this.viewportW = w;
    this.viewportH = h;
  }

  clamp(worldW: number, worldH: number) {
    const hw = this.viewportW / 2 / this.zoom;
    const hh = this.viewportH / 2 / this.zoom;
    this.x = worldW < 2 * hw ? worldW / 2 : Math.min(Math.max(this.x, hw), worldW - hw);
    this.y = worldH < 2 * hh ? worldH / 2 : Math.min(Math.max(this.y, hh), worldH - hh);
  }

  setZoomAround(nz: number, px: number, py: number, worldW: number, worldH: number) {
    nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz));
    const wx = (px - this.viewportW / 2) / this.zoom + this.x;
    const wy = (py - this.viewportH / 2) / this.zoom + this.y;
    this.zoom = nz;
    this.zoomTarget = nz;
    this.autoReturnAt = 0; // a manual zoom always overrides any pending cascade auto-return
    this.x = wx - (px - this.viewportW / 2) / this.zoom;
    this.y = wy - (py - this.viewportH / 2) / this.zoom;
    this.clamp(worldW, worldH);
  }

  /** Sets zoom directly without the "keep a screen point fixed" math above —
   * for pinch, which already does its own fixed-anchor math against the
   * pinch-start world point (see PointerController). Also cancels any
   * pending cascade auto-return, same reasoning as setZoomAround. */
  setZoomImmediate(z: number) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    this.zoomTarget = this.zoom;
    this.autoReturnAt = 0;
  }

  /** Conditional cascade zoom-out: only triggers for big reveals, eases out then
   * auto-returns. Default ON, see NOTES.md. */
  triggerCascadeZoom(cellCount: number, maxRingDelayMs: number, now: number) {
    if (cellCount <= 6) return;
    this.savedZoom = this.zoomTarget;
    const pullback = Math.min(0.32, cellCount * 0.01);
    this.zoomTarget = Math.max(MIN_ZOOM, this.zoom * (1 - pullback));
    this.autoReturnAt = now + maxRingDelayMs + 260;
  }

  update(now: number, worldW: number, worldH: number) {
    if (Math.abs(this.zoom - this.zoomTarget) > 0.001) {
      this.zoom += (this.zoomTarget - this.zoom) * 0.12;
      this.clamp(worldW, worldH);
    }
    if (this.autoReturnAt && now > this.autoReturnAt) {
      this.zoomTarget = this.savedZoom;
      this.autoReturnAt = 0;
    }
    // Skip while actively dragging: PointerController already applies the
    // 1:1 finger-tracked movement directly during a drag and only wants
    // inertia's momentum-coast *after* release — applying both at once made
    // every drag move twice as far as the finger did, which read as
    // "slippery"/overshooting rather than a firm 1:1 grip.
    if (!this.dragging && (Math.abs(this.inertiaX) > 0.1 || Math.abs(this.inertiaY) > 0.1)) {
      this.x -= this.inertiaX / this.zoom;
      this.y -= this.inertiaY / this.zoom;
      this.inertiaX *= 0.85;
      this.inertiaY *= 0.85;
      this.clamp(worldW, worldH);
    }
  }

  screenToWorld(px: number, py: number) {
    return {
      x: (px - this.viewportW / 2) / this.zoom + this.x,
      y: (py - this.viewportH / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.x) * this.zoom + this.viewportW / 2,
      y: (wy - this.y) * this.zoom + this.viewportH / 2,
    };
  }
}
