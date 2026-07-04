# Infinite Minesweeper — Gem Economy & Monetization Spec

_Last updated: 2026-07-02_

Design principle running through everything: **respect the player's attention.**
Our differentiator vs. GRYKUBY is a clean, non-hostile experience. Money comes
from players who *choose* to spend time (rewarded ads) or money (gems/premium),
not from shoving forced ads at people mid-puzzle.

---

## 1. Core currency: Gems 💎

Single soft currency. No secondary currency, no XP (see §6). Gems are the one
number besides "sectors cleared."

### 1.1 Ways to EARN gems

| Source | Trigger | Amount (starting values, to be tuned) |
|---|---|---|
| Gem tiles | Reveal a tile containing a gem | +1 each |
| Sector clear | Fully clear an 8×8 sector | +2–3 flat |
| Daily challenge | Complete the day's seeded board | +10–15 bonus |
| Streak bonus | N consecutive daily completions | escalating (e.g. +1 per streak day, capped) |
| Achievements | First clear, 10 / 100 / 1000 sectors, etc. | one-time chunks |
| Rewarded ad | Voluntarily watch (opt-in top-up) | +3–5 per view, daily cap |
| **Gem Vault** | Clear a special vault sector, then watch a rewarded ad to crack it | +20–30 (see §2.5) |
| **Gem break** (opt-in) | Accept a periodic "watch for gems" offer | +5–8 per view (see §3.2) |
| Purchase | Gem packs via Lemon Squeezy | bulk (see §4) |

### 1.2 Ways to SPEND gems

| Sink | Cost | Notes |
|---|---|---|
| **Unlock a locked sector** | Variable (see §2) | Primary sink |
| Cosmetic skins / tile themes | Fixed | Vanity, no gameplay effect |
| (Optional) daily-challenge hint | Small | Only if daily mode ships |

The economy must keep the **unlock sink meaningful**: too many gems and unlocking
is trivial (kills the lose-tension); too few and it frustrates. Target: a natural
run earns enough that unlocking feels *possible but considered*.

---

## 2. The lock mechanic & variable unlock pricing

Hitting a mine does **not** end the game. The mine's 8×8 **sector locks.**
A locked sector can be reopened three ways:

| Path | Cost to player | Best when |
|---|---|---|
| **Solve all 8 neighbouring sectors** | Time/effort — free | You're exploring that area anyway |
| **Watch a rewarded ad** | ~30 sec, opt-in | Want it now, won't spend gems |
| **Pay gems** | Variable | Impatient and gem-rich |

### 2.1 Why the gem price varies

We mirror **GRYKUBY's model: the more invested you are in a sector, the more it costs
to instant-unlock.** Price rises with how many of the 8 neighbours you've already
solved — because a player who has cleared most of the surrounding area badly wants
that sector, and is most likely to impulse-pay right at the finish line.

```
unlockPrice = round( (INVEST_BASE + solvedNeighbours × PER_SOLVED) × difficultyMult )
```

- `INVEST_BASE` = **22** — the base cost even for a fresh, fully-isolated sector
- `solvedNeighbours` = 0–8 of the surrounding sectors already solved
- `PER_SOLVED` = **3** — the investment premium per solved neighbour
- `difficultyMult` ≈ 0.9–1.2 from the sector's mine density
- Hard cap ≈ **50💎**

Worked examples:
- 0 of 8 solved (fresh territory) → `(22 + 0) × 0.95 ≈ 21💎`
- 4 of 8 solved, avg difficulty → `(22 + 12) × 1.0 ≈ 34💎`
- 8 of 8 solved, harder sector → `(22 + 24) × 1.05 ≈ 48💎`

Range ≈ **21–48💎**, matching GRYKUBY's observed prices (~22–47).

### 2.2 The intended psychology

The "solve all 8 neighbours" free path is always available — but the closer you get to
finishing it, the **more** the instant-gem option costs. That's deliberate: it monetises
the near-completion / sunk-cost impulse (the exact moment a player most wants to skip the
last bit of work). It's the revenue-maximising choice, and it's what GRYKUBY does.

### 2.3 The trade-off we're accepting

This is the more **extractive** of the two options — it charges players most when they're
most invested, rather than when gems save them the most effort. Harry chose to mirror
GRYKUBY here (2026-07-02), reversing an earlier player-friendly stance.

We still keep the *rest* of the experience player-respecting (opt-in ads, no forced
interstitials, clean UI), so the overall product is less hostile than GRYKUBY even with
matched unlock pricing. The unlock price is where we take the revenue; attention is where
we differentiate. Revisit if playtest shows the pricing sours retention.

### 2.5 Gem Vault (special sector + rewarded earn)

GRYKUBY seeds special **Gem Vault** sectors into the world ("GEM VAULT READY! →
UNLOCK ▶"). We adopt this:

- A rare, visually-distinct sector that, once **cleared**, becomes a claimable vault.
- Claiming plays a **rewarded ad**; on completion the player earns a gem chunk (~20–30).
- It's a rewarded-ad hook that feels like **treasure you found**, not an interruption —
  perfectly on-brand for our opt-in ad philosophy.
- Spawn cadence: roughly one every N sectors of new territory (tune in playtest), so
  vaults feel like a reward for exploration.

---

## 3. Ad strategy

Ordered by priority. The whole philosophy: **opt-in beats forced.**

### 3.1 Rewarded ads — the star (voluntary)
- Player *chooses* to watch in exchange for a benefit: unlock a locked sector, or
  a gem top-up.
- Best RPM, least resented, aligns incentives.
- Daily cap on gem-top-up rewards to protect the economy.
- Delivery: AdSense **H5 Games Ads** rewarded format (web). Native SDKs (AppLovin/
  ironSource) later if/when wrapped with Capacitor for the app stores.

### 3.2 GRYKUBY's "ad break" → our opt-in "Gem break"
GRYKUBY runs a **forced, timed "ad break"** every ~2–5 minutes: a `3, 2, 1` countdown
appears mid-game, a video plays, and afterwards the player is **paid a gem reward**.
So it's a *compensated* forced interstitial — softer than an uncompensated one, but
still interrupts you mid-thought on the game's schedule, not yours.

We do **not** copy the forced version. Instead we convert it into an **opt-in Gem
break**:
- Every few minutes, a small, **dismissible** "Watch for +N💎" offer appears (a chip/
  button, no countdown, no forced playback).
- The player *chooses* to take it. Same gem reward, same ad inventory — but on their terms.
- Frequency-capped; the offer never blocks play and auto-dismisses if ignored.
- Honest trade-off: forced ad breaks earn more per session; the opt-in version earns
  less but is the entire point of our "respects your attention" positioning. We hold the line.

### 3.2b True interstitials — essentially none
- Uncompensated full-screen interstitials: **ship with none.** Revisit only if revenue
  demands, and even then only at natural breaks (every N sectors / app re-open), never a timer.

### 3.3 Banner
- Optional, small, non-intrusive — or omit entirely for cleanliness.

### 3.4 Premium removes forced ads
- Any premium purchase (see §4) removes banner + interstitial ads permanently.
- **Rewarded ads, the Gem break offer, and Gem Vaults remain available** to premium
  users — they're opt-in *benefits*, not interruptions.

---

## 4. Premium & purchases (Lemon Squeezy)

Merchant-of-record handles global VAT/tax. (Note: Stripe acquired Lemon Squeezy;
may migrate to Stripe Managed Payments later — keep the payment layer swappable.)

| Product | Type | Rough price | Delivers |
|---|---|---|---|
| **Remove Ads** | One-time | $2.99–3.99 | No banner/interstitial forever; keeps rewarded |
| **Gem packs** | One-time (consumable) | $0.99 / $2.99 / $6.99 tiers | Bulk gems |
| **Premium bundle** | One-time | $4.99 | Remove Ads + a gem chunk + cosmetic skin |
| Cosmetic skins | One-time | $0.99–1.99 or gem-purchasable | Tile/theme vanity |

Web IAP caveat: card entry converts worse than app-store IAP, so lean on the
one-time "Remove Ads" as the primary conversion (simple value prop) rather than
deep gem-pack merchandising. Repeat gem buyers should be signed in so their card
is on file.

Realistic revenue expectation (web PWA): modest — ~$150–750/mo likely, low
thousands if it does well. Premium tier (~1–3% conversion) can roughly double
ad-only revenue. Treat a viral daily-challenge spike as the upside lottery ticket,
not the plan.

---

## 5. Progression (no XP)

- **Single progression number: "sectors cleared."** It doubles as score and
  leaderboard rank. Keeps the HUD clean (a top complaint about GRYKUBY).
- Optional "levels" are purely **derived milestones** of sectors cleared
  (e.g. every 10 sectors), used only for the occasional dopamine hit /
  achievement — never a parallel currency or a separate HUD bar.

---

## 6. Cut / explicitly rejected

- ❌ Separate XP/level system (redundant with sectors-cleared; HUD clutter).
- ❌ Per-minute forced interstitials (attention-hostile; anti-differentiator).
- ❌ Second currency (keep it to gems only).

---

## 7. Open tuning parameters (decide during playtesting)

- Exact gem earn rates and `BASE` unlock cost.
- Rewarded-ad daily reward cap.
- Whether a banner exists at all.
- Premium price points.
- Streak reward curve.
