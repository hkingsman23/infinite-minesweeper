/** Gem-pack pricing (see GEM_ECONOMY_AND_MONETIZATION.md §4) — one-time
 * consumable purchases. Gem amounts scale with an increasing bonus at
 * higher tiers (a bigger pack is a proportionally better deal), the
 * standard shape for this kind of pricing ladder. */
export interface GemPack {
  id: string;
  gems: number;
  priceLabel: string;
}

export const GEM_PACKS: GemPack[] = [
  { id: 'gems_small', gems: 60, priceLabel: '$0.99' },
  { id: 'gems_medium', gems: 220, priceLabel: '$2.99' },
  { id: 'gems_large', gems: 600, priceLabel: '$6.99' },
];

/** Purchase integration point — the gem shop calls this for whichever pack
 * the player picks, so wiring up a real Lemon Squeezy checkout later is a
 * one-file change instead of hunting down every call site. Currently a
 * stand-in that "succeeds" after a short delay, mirroring core/ads.ts's
 * watchRewardedAd() during development.
 *
 * Once real: this should open Lemon Squeezy's hosted checkout (or overlay)
 * for the pack's variant ID and only call onComplete from a confirmed
 * webhook/redirect — never optimistically on button click, since a closed-
 * but-unpaid checkout must not grant gems. */
export function purchaseGemPack(pack: GemPack, onComplete: (pack: GemPack) => void) {
  setTimeout(() => onComplete(pack), 600);
}
