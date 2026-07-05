import { Camera } from '../render/camera';
import { Renderer } from '../render/renderer';
import { World } from '../core/world';
import { VAULT_REWARD } from '../core/economy';
import { playSfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { icons } from './icons';
import { showToast } from './toast';

interface PanelEntry {
  el: HTMLDivElement;
  kind: 'lock' | 'vault';
  sr: number;
  sc: number;
  lastSolved: number;
}

const CARD_W = 236;

export class LockPanelManager {
  private panels = new Map<string, PanelEntry>();

  constructor(
    private host: HTMLElement,
    private world: World,
    private renderer: Renderer,
  ) {}

  private makeLockCard(sr: number, sc: number): PanelEntry {
    const el = document.createElement('div');
    el.className = 'sector-card';
    el.innerHTML = `
      <p class="card-title">Sector locked</p>
      <p class="card-sub"><span class="nb-count">0</span> of 8 neighbours solved</p>
      <div class="nb-grid"></div>
      <button class="card-btn ad-btn">${icons.play} Watch ad to unlock</button>
      <button class="card-btn gem-btn">Unlock — <span class="price">0</span> 💎</button>
      <p class="card-foot">or solve all 8 surrounding sectors</p>
    `;
    el.querySelector('.ad-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.simulateAd(() => {
        this.world.unlockWithAd(sr, sc);
        playSfx('unlock');
        vibrate('unlock');
      });
    });
    el.querySelector('.gem-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.world.unlockWithGems(sr, sc)) {
        playSfx('unlock');
        vibrate('unlock');
      } else {
        const price = this.world.unlockPriceFor(sr, sc);
        const have = this.world.economy.state.gems;
        showToast(`Not enough gems — need ${price}💎, you have ${have}💎`);
      }
    });
    this.host.appendChild(el);
    return { el, kind: 'lock', sr, sc, lastSolved: -1 };
  }

  private makeVaultCard(sr: number, sc: number): PanelEntry {
    const el = document.createElement('div');
    el.className = 'sector-card vault-card';
    el.innerHTML = `
      <div class="vault-icon">💰</div>
      <p class="card-title vault-title">Gem vault ready!</p>
      <p class="card-sub">You cleared a vault sector. Crack it open for a gem reward.</p>
      <button class="card-btn vault-btn">${icons.play} Watch ad to collect</button>
    `;
    el.querySelector('.vault-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.simulateAd(() => {
        if (this.world.claimVault(sr, sc, VAULT_REWARD)) {
          playSfx('vault');
          vibrate('vault');
        } else {
          showToast("This vault can't be claimed right now");
        }
        el.classList.add('dismissed');
      });
    });
    this.host.appendChild(el);
    return { el, kind: 'vault', sr, sc, lastSolved: -1 };
  }

  private simulateAd(onComplete: () => void) {
    // Stand-in for a real rewarded-ad SDK call (AdSense H5 Games Ads in production).
    setTimeout(onComplete, 400);
  }

  private fillLockCard(entry: PanelEntry) {
    const { solved } = this.world.solvedNeighbourCount(entry.sr, entry.sc);
    const price = this.world.unlockPriceFor(entry.sr, entry.sc);
    entry.el.querySelector('.nb-count')!.textContent = String(solved);
    entry.el.querySelector('.price')!.textContent = String(price);
    const grid = entry.el.querySelector('.nb-grid')!;
    let html = '';
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) {
          html += '<div class="nb-cell nb-center">🔒</div>';
        } else {
          const n = this.world.getSector(entry.sr + dr, entry.sc + dc);
          const isSolved = !!n && n.cleared;
          html += isSolved
            ? `<div class="nb-cell nb-solved">${icons.check}</div>`
            : `<div class="nb-cell">${icons.minus}</div>`;
        }
      }
    }
    grid.innerHTML = html;
    entry.lastSolved = solved;
  }

  update(camera: Camera) {
    const wanted = new Set<string>();
    for (const { sr, sc } of this.renderer.visibleSectors(camera)) {
      const sector = this.world.getSector(sr, sc);
      if (!sector) continue;
      const key = `${sr},${sc}`;
      if (sector.locked) {
        wanted.add(key);
        let entry = this.panels.get(key);
        if (!entry) {
          entry = this.makeLockCard(sr, sc);
          this.panels.set(key, entry);
        }
        if (entry.kind !== 'lock') continue;
        const { solved } = this.world.solvedNeighbourCount(sr, sc);
        if (solved !== entry.lastSolved) this.fillLockCard(entry);
        this.positionCard(entry, camera);
      } else if (sector.isVault && sector.cleared && !sector.vaultClaimed) {
        wanted.add(key);
        let entry = this.panels.get(key);
        if (!entry || entry.kind !== 'vault') {
          entry?.el.remove();
          entry = this.makeVaultCard(sr, sc);
          this.panels.set(key, entry);
        }
        this.positionCard(entry, camera);
      }
    }
    for (const [key, entry] of this.panels) {
      if (!wanted.has(key) || entry.el.classList.contains('dismissed')) {
        entry.el.remove();
        this.panels.delete(key);
      }
    }
  }

  private positionCard(entry: PanelEntry, camera: Camera) {
    const rect = this.renderer.sectorScreenRect(camera, entry.sr, entry.sc);
    // Bounds were previously hardcoded to 500x800, which hid cards on any
    // viewport bigger than that (i.e. most windows) once panning/zooming
    // moved a sector's rect past that arbitrary cutoff — use the real
    // viewport size instead.
    if (
      rect.x > this.renderer.viewportW ||
      rect.y > this.renderer.viewportH ||
      rect.x + rect.w < 0 ||
      rect.y + rect.h < 0
    ) {
      entry.el.style.display = 'none';
      return;
    }
    entry.el.style.display = 'block';
    const ph = entry.el.offsetHeight || 300;
    const scale = Math.min((rect.w * 0.96) / CARD_W, (rect.h * 0.94) / ph);
    const tx = rect.x + (rect.w - CARD_W * scale) / 2;
    const ty = rect.y + (rect.h - ph * scale) / 2;
    entry.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }
}
