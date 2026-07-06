import { exportSave, importSave } from '../core/saveTransfer';
import { showToast } from './toast';

/** Backup/restore modal — the only workaround for a platform limitation:
 * an installed PWA and a regular browser tab of the same site don't
 * always share localStorage (notably iOS Safari's "Add to Home Screen",
 * which WebKit keeps in a fully separate storage partition with no API to
 * bridge it). Reachable from the reset-confirm modal rather than its own
 * HUD button, since HUD real estate is already tight on narrow phones and
 * "back up before you do something destructive" is a natural pairing. */
export function showSaveTransfer(onRestored: () => void) {
  if (document.querySelector('.save-transfer-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'save-transfer-backdrop';
  backdrop.innerHTML = `
    <div class="save-transfer">
      <p class="save-transfer-title">Back up / restore your save</p>
      <p class="save-transfer-body">
        An installed home-screen app can't always see a regular browser tab's
        saved progress (an iOS limitation), so copy-pasting a code is the only
        way to carry it across. Restoring overwrites whatever's currently saved.
      </p>
      <label class="save-transfer-label">Your save code</label>
      <textarea class="save-transfer-export" readonly rows="3"></textarea>
      <button class="card-btn save-transfer-copy">Copy code</button>
      <label class="save-transfer-label">Restore from a code</label>
      <textarea class="save-transfer-import" rows="3" placeholder="Paste a save code here"></textarea>
      <button class="card-btn save-transfer-restore">Restore</button>
      <button class="card-btn save-transfer-close">Close</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));

  const exportArea = backdrop.querySelector('.save-transfer-export') as HTMLTextAreaElement;
  exportArea.value = exportSave();

  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('.save-transfer-close')!.addEventListener('click', close);

  backdrop.querySelector('.save-transfer-copy')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(exportArea.value);
      showToast('Save code copied!');
    } catch {
      // Clipboard permission denied or unavailable — select the text so the
      // player can still copy it manually (Cmd/Ctrl+C) instead of it just
      // silently failing.
      exportArea.select();
      showToast('Select the code above and copy it manually');
    }
  });

  backdrop.querySelector('.save-transfer-restore')!.addEventListener('click', () => {
    const importArea = backdrop.querySelector('.save-transfer-import') as HTMLTextAreaElement;
    const code = importArea.value.trim();
    if (!code) return;
    if (importSave(code)) {
      close();
      onRestored();
    } else {
      showToast("That save code doesn't look right");
    }
  });
}
