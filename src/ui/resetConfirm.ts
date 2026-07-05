/** Confirmation modal for wiping all saved progress — deliberately a
 * separate opt-in action rather than something that happens implicitly
 * anywhere, since it's destructive and can't be undone. Started as a
 * testing convenience but is a reasonable thing for a real player to want
 * too ("start completely fresh"), so it's a proper UI affordance rather
 * than a console-only debug hook. */
export function showResetConfirm(onConfirm: () => void) {
  if (document.querySelector('.reset-confirm-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'reset-confirm-backdrop';
  backdrop.innerHTML = `
    <div class="reset-confirm">
      <p class="reset-confirm-title">Start completely fresh?</p>
      <p class="reset-confirm-body">
        This clears your gems, sectors-cleared count, the current board, camera
        position, and your daily-challenge streak. It can't be undone.
      </p>
      <button class="card-btn reset-confirm-cancel">Cancel</button>
      <button class="card-btn reset-confirm-danger">Reset everything</button>
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
  backdrop.querySelector('.reset-confirm-cancel')!.addEventListener('click', close);
  backdrop.querySelector('.reset-confirm-danger')!.addEventListener('click', () => {
    close();
    onConfirm();
  });
}
