# Infinite Minesweeper — Project Notes

_A light, no-guess, infinite-minesweeper PWA. Inspired by GRYKUBY's gameplay feel;
clean UI/UX everywhere else. Last updated: 2026-07-02._

See also: [GEM_ECONOMY_AND_MONETIZATION.md](./GEM_ECONOMY_AND_MONETIZATION.md)

## Positioning
- **Hook:** no-guess guarantee + daily-seeded challenge + frictionless PWA.
- Differentiator vs GRYKUBY (native, per-minute interstitials, cluttered HUD),
  m3o (grindy endless), 1000mines (classic): clean, attention-respecting, instant-play web.
- Daily-share loop is the growth engine.

## Tech
- PWA-first. Stack: **Canvas2D + GSAP + Howler**. NOT Unity/Unity-WebGL (too heavy).
- Keep **wrap-ready** (Capacitor) to ship to app stores later.
- Hard piece: **guaranteed no-guess 8×8 sector generator** (generate → solve → reject loop).

## Locked design decisions
| Area | Decision |
|---|---|
| Reveal animation | **3D tile flip**, rippling outward from tap (BFS-distance stagger) |
| Ripple pace | **Dreamy** (slow; ~86ms per ring in mockup) |
| Cascade zoom-out | **On** by default; conditional (big cascades only), subtle, auto-return |
| Colors | Own **light + dark** schemes (dropped GRYKUBY crimson) |
| Icons | **Emoji for now** (🚩 flag, 💎 gem, 💥 explosion for mine); custom SVG set later |
| Progression | **Sectors cleared** = the single number (score + rank). **XP/levels CUT** |
| Mine hit | Red flash + screen shake → sector fades to **locked** state |
| Locked sector UI | Unlock panel rendered **inline in the sector on the board** (NOT a modal): "Solve neighbours" + 3×3 progress diagram + WATCH AD + N💎 buttons. Gem Vault likewise inline ("UNLOCK ▶ +N💎") |

## Gem economy (summary)
- Single currency (gems). Earn: gem tiles, sector clears, daily, streaks, achievements, rewarded ads, **Gem Vault**, **opt-in Gem break**, purchase.
- **Unlock a locked sector** = main sink. Three paths: solve all 8 neighbours (free) / rewarded ad / pay gems.
- **Variable unlock price (GRYKUBY-style, revenue-max):** `price = round((22 + solvedNeighbours × 3) × difficultyMult)`, cap ~50💎
  - Price RISES with investment: more solved neighbours → higher price (monetises the near-completion impulse). Range ~21–48💎, matches GRYKUBY's 22–47.
  - `difficultyMult` ≈ 0.9–1.2 from the sector's mine density.
  - **Harry reversed the earlier player-friendly curve → now mirrors GRYKUBY's extractive pricing.** We still keep the rest player-respecting (opt-in ads, clean UI); unlock price is where we take revenue, attention is where we differentiate.
- **Gem Vault:** rare special sector; clear it → claim via rewarded ad → ~20–30💎. Treasure-you-found hook.

## Ads / monetization
- **Rewarded-first** (voluntary, best RPM).
- GRYKUBY's forced timed **"ad break"** (~2–5 min, 3-2-1 countdown, video, then gems) → we convert to an **opt-in "Gem break"**: dismissible "watch for +N💎" chip, player's terms, no countdown. Earns less, but it's the whole "respects your attention" point.
- No uncompensated interstitials. Premium (Lemon Squeezy) removes forced ads, keeps opt-in rewarded/vault/gem-break. Lead with one-time "Remove Ads" (~$3).

## Assets Claude can produce at build time
- ✅ Synthesized Web-Audio SFX (flip / cascade / gem / explosion / unlock).
- ✅ SVG app icons + generated PNG sizes + `manifest.json` (clean/minimal, not illustrator-grade).
- ❌ Recorded audio files / premium logo — outsource if going beyond "clean".

## Build plan
- **M1 (local):** canvas tile engine — covered/revealed render, press feedback, flip cascade,
  pan/zoom + inertia, no-guess 8×8 generator, lock + unlock panel. No accounts/backend needed.
- **M2:** PWA shell (installable, offline, manifest, icons).
- **M3:** daily challenge + share + leaderboard + accounts (needs small backend) + monetization.

## M1 status: BUILT (2026-07-03)

Vite + vanilla TypeScript, no framework. Dev server on port 5183 (`.claude/launch.json`
config named `minesweeper`, registered in the workspace-root launch.json — the tool
reads the root one, not a per-project one).

**Structure:**
- `src/core/` — pure logic, no DOM: `types.ts`, `rng.ts` (mulberry32 + hash seeding),
  `solver.ts` (single-point + subset-pair logical solver, generation-time only),
  `sectorGenerator.ts` (generate → verify-solvable → reject loop), `economy.ts`
  (gems, localStorage persistence, GRYKUBY-style unlock pricing), `world.ts`
  (sector map, reveal/flood-fill, lock/unlock, vault claim).
- `src/render/` — `theme.ts`, `camera.ts` (pan/zoom/inertia/cascade-zoom),
  `emoji.ts` (rasterized emoji cache), `renderer.ts` (tile flip animation, mine
  flash/shake, lock/vault overlays).
- `src/input/pointerController.ts` — pointer pan/zoom/tap-to-reveal.
- `src/ui/` — `lockPanel.ts` (HTML cards pinned to locked/vault sectors, tracking
  camera transforms), `hud.ts` (gem/cleared counter, theme toggle, recenter).
- `src/audio/sfx.ts` — synthesized Web Audio oscillator SFX (flip/cascade/gem/
  explosion/unlock/vault). **Correction from earlier plan: no Howler** — Howler
  plays audio *files*, these are generated tones, so raw Web Audio is simpler and
  needs no dependency. Howler would come back if real audio files are added later.

**Key design calls made during implementation (not previously decided):**
- **Sectors are fully independent puzzles.** Adjacency numbers only count mines
  *within* the same 8×8 sector (never leak across sector boundaries), and flood-fill
  on a "0" cell stops at the sector edge — crossing into a new sector always needs
  an explicit tap (which is what triggers that sector's on-demand generation from
  `worldSeed + sr + sc`). This is what makes the no-guess guarantee tractable: each
  sector can be validated as a standalone solvable puzzle without needing to know
  neighbouring sectors that don't exist yet. Trade-off: numbers aren't representative
  of a truly continuous infinite minefield at sector seams. Worth revisiting in a
  later milestone if a true cross-sector no-guess algorithm is wanted, but it's a
  materially harder problem and this is a reasonable, honest M1 simplification.
- **No-guess solver** validates using only single-point deduction + pairwise subset
  deduction (the same technique a human "no-guess" solver would use) — no global
  mine-count inference, since the player is never shown a total mine count per
  sector. Generation retries with a fresh mine shuffle on rejection (bounded to 400
  attempts, backs off mine density if it can't find a solvable layout — this never
  hung in testing; most attempts succeed on the first or second try at 16% density).
- **Gem Vault mechanic implemented as spec'd** (clear it normally like any sector,
  *then* an inline "claim" card appears) — not the mockup's shortcut of blocking
  reveal entirely. More consistent with the written spec and better gameplay.
- Local persistence is just **gems + sectors-cleared via localStorage** (not full
  IndexedDB board state) — reasonable for M1; revisit for M2/M3 if resuming a
  half-explored world across sessions becomes a priority.

**Verified working (via live preview + direct game-state inspection):** reveal,
sector-local flood-fill cascade with flip animation at the dreamy pace, gem
collection, mine hit → red flash + shake → sector lock after ~460ms, inline unlock
panel with the GRYKUBY-style rising price (confirmed formula matches on-screen
number), gem-spend unlock, pan with inertia, wheel zoom, recenter, light/dark theme
toggle. Production build: **~23KB JS (8.6KB gzipped) + 2.8KB CSS** — comfortably
"light."

**Not yet built (M2/M3, by design):** PWA manifest/service worker/installability,
daily-seeded challenge, accounts/sync, leaderboard, AdSense/Lemon Squeezy
integration (ad/gem buttons currently simulate a ~400ms "ad" delay), custom SVG
icon set, real sound design.

## Post-M1 revisions (2026-07-03, session 3)

- **Cross-sector cascade.** Flood-fill now crosses 8×8 sector borders freely
  (a locked sector still blocks it); a hard 3000-cell cap per cascade prevents
  a runaway reveal from freezing the tab. Sector-local *adjacency numbers*
  are unchanged (still don't count neighbouring-sector mines — see the
  original M1 trade-off note above).
- **Mine density raised significantly.** `MINE_DENSITY` nominal 0.16 → 0.30.
  Empirically (see density_test in scratchpad, not committed), the no-guess
  solver constraint caps *actual* achievable density around ~0.19 on an 8×8
  sector no matter how high the nominal value goes — pushing nominal further
  only costs more generation attempts, not more real mines. Backoff schedule
  changed from a single step at attempt 200 to a progressive -0.02 every 40
  attempts (floor 0.08), and `MAX_ATTEMPTS` raised 400→600, to keep the
  zero-failure guarantee at the new density (verified 0 failures / 300 trials
  at nominal ≥0.28 with this schedule).
- **Gem tiles removed.** Free per-cell gem pickups made earning gems too easy
  for the revenue model — `CellState.gem` field deleted entirely. Gem Vault
  (rare sector, ad-gated claim) is unaffected/kept, since it's already
  monetised via the rewarded-ad requirement.
- **Fresh-state board.** Removed the auto-reveal on load; the board now
  starts fully covered (ungenerated territory renders as a normal covered
  tile, not blank) and the player reveals the first tile themselves. Starting
  gem balance stays at 15 (intentional, not a bug — gives something to spend
  on the first unlock).
- **Cleared-sector distinction.** Fully-cleared (non-locked, non-vault)
  sectors now get a persistent subtle tint (`theme.clearedOverlay`, ~9-10%
  opacity) plus a one-shot brighter pulse flash (`theme.clearPulse`,
  `Renderer.triggerSectorClearPulse`) the instant they complete, alongside a
  new `sectorClear` SFX.
- **Gems-earned fly animation.** `Hud.flyGems(amount)` spawns a `+N💎` chip at
  the viewport centre that animates to the HUD gem stat, fired on the new
  unified `gemsEarned` world event (covers both sector-clear and vault-claim
  rewards — replaces the old cell-gem-only `gemCollected` event).
- **Frontier-only reveals.** Direct taps are now gated by `World.canRevealAt`:
  only allowed on the very first move, or on a cell touching an
  already-revealed cell. Stops randomly poking far-away tiles; cascade-driven
  reveals are unaffected (the gate only applies to the tapped entry cell).
- **Flag input wired up.** Right-click (desktop) / long-press ~450ms (touch)
  toggles a flag via `World.toggleFlag`, which existed since M1 but had no
  input gesture. No question-mark tri-state (skipped — most modern
  minesweeper apps have dropped it; revisit if wanted).
- **Locked-sector card z-order fix.** `.sector-card` had `pointer-events:auto`
  across its whole (large, scaled-to-fit-sector) bounding box, silently
  eating wheel/pan input meant for the canvas underneath. Now only the actual
  `.card-btn` elements are interactive; the rest of the card lets events
  through to the board.

## Next: git

Repo not yet initialized. Run `git init` + initial commit when ready — holding off
per "don't commit unless asked."
