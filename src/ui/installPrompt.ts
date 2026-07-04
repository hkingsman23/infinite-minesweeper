/** Replaces the browser's own automatic "Add to Home Screen" banner (whose
 * position/timing/styling we can't control at all — it's browser chrome, not
 * part of our page) with a small bar we fully own, anchored to the bottom so
 * it never covers the HUD. Chrome fires `beforeinstallprompt` when the PWA
 * installability criteria are met (manifest + service worker + HTTPS) and
 * would show its native banner immediately unless we call preventDefault()
 * and save the event to trigger ourselves later via event.prompt(). */
const DISMISSED_KEY = 'infinite-minesweeper-install-dismissed-v1';

let deferredEvent: any = null;
let bannerEl: HTMLElement | null = null;

function showBanner() {
  if (bannerEl || localStorage.getItem(DISMISSED_KEY)) return;
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
    if (!deferredEvent) return;
    deferredEvent.prompt();
    await deferredEvent.userChoice;
    deferredEvent = null;
    hideBanner();
  });
  el.querySelector('.install-dismiss')!.addEventListener('click', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    hideBanner();
  });
}

function hideBanner() {
  if (!bannerEl) return;
  const el = bannerEl;
  bannerEl = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
}

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e;
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    hideBanner();
  });
}
