/** Tiny transient message shown at the bottom of the screen, for explaining
 * why an action the player just tried didn't go through (locked sector,
 * frontier-only reveal, insufficient gems, etc). */
let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (host) return host;
  host = document.createElement('div');
  host.id = 'toast-host';
  document.body.appendChild(host);
  return host;
}

export function showToast(message: string) {
  const h = ensureHost();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  h.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 1800);
}
