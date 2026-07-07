import { World } from '../core/world';
import { icons } from './icons';

export class Hud {
  private gemEl: HTMLElement;
  private clearedEl: HTMLElement;
  private themeBtn: HTMLElement;
  private isDark: boolean;

  constructor(
    host: HTMLElement,
    private world: World,
    onThemeToggle: () => void,
    onRecenter: () => void,
    onOpenDaily: () => void,
    onResetAll: () => void,
    onOpenGemShop: () => void,
    initialIsDark: boolean,
  ) {
    this.isDark = initialIsDark;
    host.innerHTML = `
      <div class="hud-bar">
        <button class="hud-stat hud-gem-stat"><b class="hud-gems">0</b> 💎</button>
        <span class="hud-sep">·</span>
        <span class="hud-stat"><b class="hud-cleared">0</b> cleared</span>
        <div class="hud-spacer"></div>
        <button class="hud-btn daily-btn" aria-label="Daily challenge">${icons.calendar}</button>
        <button class="hud-btn theme-btn" aria-label="Toggle theme"></button>
        <button class="hud-btn recenter-btn" aria-label="Recenter">${icons.crosshair}</button>
        <button class="hud-btn reset-btn" aria-label="Start fresh">${icons.refresh}</button>
      </div>
    `;
    this.gemEl = host.querySelector('.hud-gems')!;
    this.clearedEl = host.querySelector('.hud-cleared')!;
    this.themeBtn = host.querySelector('.theme-btn')!;
    this.themeBtn.addEventListener('click', onThemeToggle);
    host.querySelector('.hud-gem-stat')!.addEventListener('click', onOpenGemShop);
    host.querySelector('.recenter-btn')!.addEventListener('click', onRecenter);
    host.querySelector('.daily-btn')!.addEventListener('click', onOpenDaily);
    host.querySelector('.reset-btn')!.addEventListener('click', onResetAll);
    world.economy.onChange(() => this.refresh());
    this.updateThemeIcon();
    this.refresh();
  }

  /** Shows the icon of the mode you'll switch *to* (moon while in light mode,
   * sun while in dark mode) — call after the theme actually changes. */
  setThemeIsDark(isDark: boolean) {
    this.isDark = isDark;
    this.updateThemeIcon();
  }

  private updateThemeIcon() {
    this.themeBtn.innerHTML = this.isDark ? icons.sun : icons.moon;
  }

  refresh() {
    this.gemEl.textContent = String(this.world.economy.state.gems);
    this.clearedEl.textContent = String(this.world.economy.state.sectorsCleared);
  }

  /** Spawns `amount` individual 💎 emoji in quick succession — each one pops
   * in and holds at the centre of the viewport long enough to actually be
   * read, then eases over to the gem stat and fades in on arrival. Purely
   * cosmetic — the count itself already updated via refresh(). */
  flyGems(amount: number) {
    const target = this.gemEl.getBoundingClientRect();
    const sx = window.innerWidth / 2;
    const sy = window.innerHeight / 2;
    const tx = target.left + target.width / 2 - sx;
    const ty = target.top + target.height / 2 - sy;

    const APPEAR_MS = 200;
    const HOLD_MS = 350;
    const FLY_MS = 700;
    // Stagger each gem's start so a big reward still reads as "quick
    // succession" rather than dragging out linearly with the amount.
    const stagger = Math.max(25, Math.min(90, Math.round(500 / amount)));

    for (let i = 0; i < amount; i++) {
      setTimeout(() => {
        const jitterX = (Math.random() - 0.5) * 46;
        const jitterY = (Math.random() - 0.5) * 46;

        const el = document.createElement('div');
        el.className = 'gem-fly';
        el.textContent = '💎';
        el.style.left = `${sx + jitterX}px`;
        el.style.top = `${sy + jitterY}px`;
        el.style.transform = 'translate(-50%, -50%) scale(0.3)';
        el.style.opacity = '0';
        el.style.transition = `transform ${APPEAR_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${APPEAR_MS}ms ease-out`;
        document.body.appendChild(el);

        // Phase 1: pop in and hold near centre, clearly visible.
        requestAnimationFrame(() => {
          el.style.transform = 'translate(-50%, -50%) scale(1)';
          el.style.opacity = '1';
        });

        // Phase 2: after the hold, ease over to the gem stat and fade on arrival.
        setTimeout(() => {
          el.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${FLY_MS}ms ease-in ${FLY_MS * 0.5}ms`;
          el.style.transform = `translate(-50%, -50%) translate(${tx - jitterX}px, ${ty - jitterY}px) scale(0.5)`;
          el.style.opacity = '0';
        }, APPEAR_MS + HOLD_MS);

        setTimeout(() => el.remove(), APPEAR_MS + HOLD_MS + FLY_MS + 50);
      }, i * stagger);
    }
  }
}
