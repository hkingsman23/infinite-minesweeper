import { World } from '../core/world';
import { watchRewardedAd } from '../core/ads';
import { GEM_PACKS, purchaseGemPack } from '../core/payments';
import { playSfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { icons } from './icons';
import { showToast } from './toast';

/** Gem shop — reachable by tapping the gem count in the HUD. Two earn paths
 * live here: the opt-in rewarded-ad top-up (daily-capped, see
 * Economy.claimAdGems) and one-time gem-pack purchases (see
 * core/payments.ts). `onGemsGranted` lets the caller trigger the existing
 * "+N💎 flies to the HUD" animation (Hud.flyGems) without this module
 * needing to know about Hud directly. */
export function showGemShop(world: World, onGemsGranted: (amount: number) => void) {
  if (document.querySelector('.gem-shop-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'gem-shop-backdrop';
  const packsHtml = GEM_PACKS.map(
    (p) => `<button class="card-btn gem-pack-btn" data-pack-id="${p.id}">${p.gems} 💎 — ${p.priceLabel}</button>`,
  ).join('');
  backdrop.innerHTML = `
    <div class="gem-shop">
      <p class="gem-shop-title">Get more gems</p>
      <button class="card-btn gem-shop-ad-btn">${icons.play} Watch ad for +5 💎 <span class="gem-shop-ad-remaining"></span></button>
      <p class="gem-shop-sub">Or buy a gem pack:</p>
      ${packsHtml}
      <button class="card-btn gem-shop-close">Close</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));

  const adBtn = backdrop.querySelector('.gem-shop-ad-btn') as HTMLButtonElement;
  const adRemainingEl = backdrop.querySelector('.gem-shop-ad-remaining')!;

  const refreshAdButton = () => {
    const remaining = world.economy.adGemsRemainingToday();
    if (remaining <= 0) {
      adBtn.disabled = true;
      adRemainingEl.textContent = '(none left today)';
    } else {
      adBtn.disabled = false;
      adRemainingEl.textContent = `(${remaining} left today)`;
    }
  };
  refreshAdButton();

  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('.gem-shop-close')!.addEventListener('click', close);

  adBtn.addEventListener('click', () => {
    if (adBtn.disabled) return;
    adBtn.disabled = true;
    watchRewardedAd(() => {
      const reward = world.economy.claimAdGems();
      if (reward != null) {
        playSfx('gem');
        vibrate('gem');
        onGemsGranted(reward);
      }
      refreshAdButton();
    });
  });

  backdrop.querySelectorAll('.gem-pack-btn').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.packId;
      const pack = GEM_PACKS.find((p) => p.id === id);
      if (!pack) return;
      (el as HTMLButtonElement).disabled = true;
      purchaseGemPack(pack, (bought) => {
        // Not routed through onGemsGranted/Hud.flyGems here — that spawns one
        // flying emoji *per gem*, which is fine for the small ad reward but
        // would spawn hundreds of elements for a pack this size. A toast is
        // enough confirmation for a purchase.
        world.economy.addGems(bought.gems);
        playSfx('gem');
        vibrate('gem');
        showToast(`+${bought.gems} 💎 added!`);
        (el as HTMLButtonElement).disabled = false;
      });
    });
  });
}
