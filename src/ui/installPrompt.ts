/** Replaces the browser's own automatic "Add to Home Screen" banner (whose
 * position/timing/styling we can't control at all — it's browser chrome, not
 * part of our page) with a small bar we fully own, anchored to the bottom so
 * it never covers the HUD.
 *
 * No dismissal or install state is ever persisted — by design. Chrome fires
 * `beforeinstallprompt` exactly when it currently believes the PWA isn't
 * installed, so on Android that event firing (or not) *is* the "installed?"
 * signal — no localStorage bookkeeping needed, and it can't go stale. iOS
 * Safari has no such event (or any API to ask "is this installed") at all,
 * so there we just always show the banner in a regular browser tab, every
 * session — the user asked for exactly this since there's no reliable way
 * for us to know better. Either way, a plain page reload always gets a fresh
 * decision instead of remembering a past dismissal.
 */
import { icons } from './icons';

let deferredEvent: { prompt: () => void; userChoice: Promise<unknown> } | null = null;
let bannerEl: HTMLElement | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
}

function showBanner() {
  if (bannerEl) return;
  const el = document.createElement('div');
  el.className = 'install-banner';
  el.innerHTML = `
    <span class="install-banner-text">Install Infinite Minesweeper for quick access</span>
    <button class="install-banner-btn install-btn">Install</button>
    <button class="install-banner-btn install-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(el);
  bannerEl = el;
  requestAnimationFrame(() => el.classList.add('show'));

  el.querySelector('.install-btn')!.addEventListener('click', async () => {
    if (isIOS()) {
      showIOSInstructions();
      return;
    }
    if (!deferredEvent) return;
    deferredEvent.prompt();
    await deferredEvent.userChoice;
    deferredEvent = null;
    hideBanner();
  });
  el.querySelector('.install-dismiss')!.addEventListener('click', () => hideBanner());
}

function hideBanner() {
  if (!bannerEl) return;
  const el = bannerEl;
  bannerEl = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
}

function showIOSInstructions() {
  if (document.querySelector('.ios-install-modal-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'ios-install-modal-backdrop';
  backdrop.innerHTML = `
    <div class="ios-install-modal">
      <p class="ios-install-title">Install Infinite Minesweeper</p>
      <ol class="ios-install-steps">
        <li><span class="ios-install-icon">${icons.share}</span> Tap the <b>Share</b> button in Safari's toolbar</li>
        <li>Scroll down and tap <b>Add to Home Screen</b></li>
        <li>Tap <b>Add</b> to confirm</li>
      </ol>
      <button class="ios-install-close">Got it</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));

  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('.ios-install-close')!.addEventListener('click', close);
}

export function setupInstallPrompt() {
  if (isStandalone()) return; // already running as the installed app — nothing to prompt for

  if (isIOS()) {
    showBanner();
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e as unknown as { prompt: () => void; userChoice: Promise<unknown> };
    showBanner();
  });

  window.addEventListener('appinstalled', () => hideBanner());
}
