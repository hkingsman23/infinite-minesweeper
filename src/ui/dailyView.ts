import { DailyGame } from '../core/dailyGame';
import { icons } from './icons';
import { showToast } from './toast';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Thin header (date + live mistake/time counters + back button) plus a
 * completion modal with a shareable result — the two bits of UI daily mode
 * needs beyond the board itself, which the canvas already handles via
 * Renderer.drawDaily. */
export class DailyView {
  private headerEl: HTMLElement;
  private modalEl: HTMLElement | null = null;

  constructor(
    private host: HTMLElement,
    private game: DailyGame,
    private onExit: () => void,
  ) {
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'daily-header';
    this.host.appendChild(this.headerEl);
    this.renderHeader();
    if (game.isComplete()) this.showResults();
  }

  private renderHeader() {
    const elapsed = this.game.getElapsedMs();
    this.headerEl.innerHTML = `
      <button class="hud-btn daily-back" aria-label="Back to endless">${icons.back}</button>
      <span class="daily-date">Daily · ${this.game.dateStr}</span>
      <span class="daily-spacer"></span>
      <span class="daily-stat">${icons.flag}${this.game.minesRemaining()}</span>
      <span class="daily-stat">💥${this.game.mistakes}</span>
      <span class="daily-stat">${icons.clock}${formatTime(elapsed)}</span>
    `;
    this.headerEl.querySelector('.daily-back')!.addEventListener('click', () => this.onExit());
  }

  /** Call every frame — cheaply re-renders the live timer/mistake counters,
   * and shows the results modal exactly once the moment completion flips. */
  update() {
    if (this.game.isComplete()) {
      if (!this.modalEl) {
        this.renderHeader();
        this.showResults();
      }
      return;
    }
    this.renderHeader();
  }

  private showResults() {
    if (this.modalEl) return;
    const elapsed = this.game.getElapsedMs();
    const shareText = this.buildShareText(elapsed);

    const backdrop = document.createElement('div');
    backdrop.className = 'daily-results-backdrop';
    backdrop.innerHTML = `
      <div class="daily-results">
        <p class="daily-results-title">Daily cleared! 🎉</p>
        <div class="daily-results-stats">
          <div class="daily-results-stat"><span class="daily-results-num">${formatTime(elapsed)}</span><span class="daily-results-label">time</span></div>
          <div class="daily-results-stat"><span class="daily-results-num">${this.game.mistakes}</span><span class="daily-results-label">mistakes</span></div>
          <div class="daily-results-stat"><span class="daily-results-num">${this.game.streak}</span><span class="daily-results-label">streak</span></div>
        </div>
        <button class="card-btn daily-share-btn">${icons.share} Share result</button>
        <button class="card-btn daily-close-btn">Back to endless</button>
      </div>
    `;
    this.host.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));

    backdrop.querySelector('.daily-share-btn')!.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ text: shareText });
        } else {
          await navigator.clipboard.writeText(shareText);
          showToast('Result copied to clipboard!');
        }
      } catch {
        // User cancelled the share sheet, or clipboard permission denied — non-fatal.
      }
    });
    backdrop.querySelector('.daily-close-btn')!.addEventListener('click', () => this.onExit());
    this.modalEl = backdrop;
  }

  private buildShareText(elapsedMs: number): string {
    const n = this.game.mistakes;
    const mistakeText = n === 0 ? 'no mistakes' : `${n} mistake${n === 1 ? '' : 's'}`;
    const streakText = this.game.streak > 1 ? ` · 🔥 ${this.game.streak}-day streak` : '';
    return `Minesweeper Beyond — Daily ${this.game.dateStr}\n⏱ ${formatTime(elapsedMs)} · ${mistakeText}${streakText}\n${location.origin}`;
  }

  destroy() {
    this.headerEl.remove();
    this.modalEl?.remove();
  }
}
