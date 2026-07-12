/** Rewarded-ad integration point — every place in the app that wants to show
 * a rewarded ad (sector unlock, vault claim, the gem-shop's ad-for-gems
 * button) calls this single function, so wiring up the real Google AdSense
 * H5 Games Ads SDK later is a one-file change instead of hunting down every
 * call site. Currently a stand-in: just waits briefly and calls back, same
 * as the simulateAd() this replaced.
 *
 * `onComplete` should only be called if the player actually finished
 * watching (a real SDK call fires a "reward earned" callback distinct from
 * "ad closed early" — once wired up for real, an early-close should just
 * never call onComplete, exactly like it already behaves as a stand-in). */
export function watchRewardedAd(onComplete: () => void) {
  setTimeout(onComplete, 400);
}
