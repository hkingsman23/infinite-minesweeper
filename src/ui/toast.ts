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
  }, 3200);
}

/** Quick, wordless confirmation that a flag toggle actually registered —
 * separate from showToast() above (which is for infrequent, explanatory
 * messages) because flagging is frequent and expected-to-succeed, so a
 * 3.2s text banner every time would get noisy fast. Fixed at the top of
 * the screen rather than at the tap point deliberately: on a touch device
 * a long-press flag is placed right where the thumb already is, so any
 * cue drawn there is invisible until the player lifts their finger — this
 * shows up somewhere they're not currently covering, confirming a flag
 * landed even with sound/haptics off. Replaces any cue still fading out
 * rather than stacking, so rapid flagging doesn't pile up indicators. */
let flagCueEl: HTMLElement | null = null;

export function showFlagCue() {
  if (flagCueEl) {
    flagCueEl.remove();
    flagCueEl = null;
  }
  const el = document.createElement('div');
  el.className = 'flag-cue';
  el.textContent = '🚩';
  document.body.appendChild(el);
  flagCueEl = el;
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.remove();
      if (flagCueEl === el) flagCueEl = null;
    }, 200);
  }, 500);
}
