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

/** Publishes the banner's on-screen footprint (its height + how far off the
 * bottom it sits) as a CSS variable so the toast host can lift itself above
 * it — otherwise toasts render behind the banner. 0px when hidden. offsetHeight
 * is transform-independent, so it's valid to read even mid slide-in. */
function updateBannerOffset() {
  const root = document.documentElement;
  if (!bannerEl) {
    root.style.setProperty('--install-banner-offset', '0px');
    return;
  }
  const bottomPx = parseFloat(getComputedStyle(bannerEl).bottom) || 12;
  const offset = bannerEl.offsetHeight + bottomPx + 10 - 28; // relative to toast's 28px base gap
  root.style.setProperty('--install-banner-offset', `${Math.max(0, offset)}px`);
}

function showBanner() {
  if (bannerEl) return;
  const el = document.createElement('div');
  el.className = 'install-banner';
  el.innerHTML = `
    <span class="install-banner-text">Install Minesweeper Beyond for quick access</span>
    <button class="install-banner-btn install-btn">Install</button>
    <button class="install-banner-btn install-dismiss" aria-label="Dismiss">✕</button>
  `;
  document.body.appendChild(el);
  bannerEl = el;
  updateBannerOffset();
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
  updateBannerOffset();
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
}

function showIOSInstructions() {
  if (document.querySelector('.ios-install-modal-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'ios-install-modal-backdrop';
  backdrop.innerHTML = `
    <div class="ios-install-modal">
      <p class="ios-install-title">Add to Home Screen</p>
      <div class="ios-install-row">
        <span class="ios-install-icon">${icons.share}</span>
        <p>Tap the Share button in Safari's toolbar.</p>
      </div>
      <div class="ios-install-row">
        <span class="ios-install-icon">${icons.addBox}</span>
        <p>Scroll down and tap "Add to Home Screen".</p>
      </div>
      <div class="ios-install-row">
        <span class="ios-install-icon">${icons.device}</span>
        <p>Now you can open Minesweeper Beyond right from your home screen — even offline.</p>
      </div>
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

  // Banner can wrap to a taller height on rotation/resize — keep the toast
  // offset in sync so it still clears it.
  window.addEventListener('resize', updateBannerOffset);

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
