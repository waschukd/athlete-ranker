# Team Insights: clean breaks + bubble players + recommendation

**Date:** 2026-06-03
**Status:** Approved design. Flagship sales feature.
**Scope:** `src/lib/teamInsights.js` (new, pure + tested), `src/components/CategoryDashboard.jsx` (new Insights tab). No new API — runs on the existing `/rankings` data already fetched by the dashboard.

## Why

Associations are tired of manually (a) finding the natural "clean break" cut lines
in a ranking, (b) sorting out evaluator anomalies, and (c) deciding the players on
the bubble between teams. The app already computes composite scores, per-session
scores, evaluator agreement, and rank history. This feature packages that into a
plain-English story: where to cut, who's on the bubble, and a recommended lean —
**with game play prioritized over testing**, because the #1 association fear is the
player who "tests great but plays poorly."

## Data available (from `/api/categories/[catId]/rankings`, already fetched)

Per athlete in `athletes` (sorted by rank): `id, first_name, last_name, rank,
weighted_total` (composite 0–100), `agreement_pct`, `rank_history` (per-session
ranks), and `session_scores` (map `session_number → { normalized_score, source:
"testing"|"skills", weight }`). Plus `sessions` (each has `session_number`,
`session_type` — `"testing"` vs everything else = game/scrimmage).

## Engine (`src/lib/teamInsights.js`, pure, unit-tested)

Constants (tunable): `WINDOW = 5`, `CLEAN_RATIO = 1.5`, `MIN_GAP = 1.0`,
`DIVERGENCE = 15` (points of testing-vs-game disagreement that count as "strong").

1. **`buildSignals(athlete, sessions)`** → `{ id, name, rank, composite,
   testingScore, gameScore, divergence, trend, agreement }`.
   - `testingScore` = normalized_score of the testing session(s) (avg if multiple).
   - `gameScore` = average normalized_score across non-testing (game/scrimmage)
     sessions; null if none.
   - `divergence = gameScore - testingScore` (negative = tests better than plays).
   - `trend` = slope of the athlete's game-session ranks over time (improving =
     positive). 0 if insufficient data.
   - `agreement` = agreement_pct (or null).

2. **`detectBreaks(ranked, teamSizes, opts)`** → one entry per interior cut line.
   - Cut positions = cumulative team sizes excluding the last (sizes `[17,17]` →
     cut after rank 17; `[12,11,11]` → after 12 and 23).
   - For each cut `c`: search window of adjacent gaps for ranks in
     `[c-WINDOW, c+WINDOW]` (clamped). `gap[i] = composite[i] - composite[i+1]`.
   - `localMedian` = median of all adjacent gaps in the field. Find the max gap in
     the window → `suggestedCut`, `gap`, `cleanliness = gap / max(localMedian, ε)`,
     `isClean = cleanliness >= CLEAN_RATIO && gap >= MIN_GAP`.
   - Returns `{ intendedCut, suggestedCut, gap, cleanliness, isClean, teamAbove,
     teamBelow }`. When not clean: `isClean=false` → UI says "judgment call."

3. **`computeLean(signals, opts)`** → `{ lean: "up"|"down"|"tossup", confidence:
   "high"|"med"|"low", needsReview: bool, reasons: string[] }`.
   - **Game prioritized:** the dominant term is `divergence`. If `divergence <=
     -DIVERGENCE` (tests well, plays down) → push **down**, reason
     `"tests well but plays down — game play prioritized"`. If `>= +DIVERGENCE`
     (plays better than tests) → push **up**.
   - Secondary: `trend` (improving → up, fading → down).
   - `confidence`: agreement ≥ 80 → high; 60–79 → med; < 60 → low + `needsReview`
     (low agreement never flips the lean, only lowers confidence and flags it).
   - Net of the weighted terms → up / down / tossup; `reasons` lists the
     contributing signals, strongest first.

4. **`analyzeTeams(ranked, sessions, teamSizes, opts)`** → `{ breaks, bubbles }`.
   - `breaks` from `detectBreaks`.
   - `bubbles`: athletes whose rank is within `WINDOW` of a `suggestedCut`, each
     `{ ...signals, boundary, sideAboveCut, ...computeLean }`.

## UI (Insights tab in `CategoryDashboard.jsx`)

- New "Insights" tab (visible to association admin + director — same as the other
  analysis tabs). Uses the rankings query data already in the component.
- A small team-structure control (number of teams / sizes) — default to an even
  split; if the Teams page config is readily available reuse it, else a simple
  input. Runs `analyzeTeams` client-side on change.
- Render per cut line: the proposed break + cleanliness ("Clean break #16↔#17,
  4.2 vs 0.8 typical" or "No clean break — judgment call"), then the bubble list:
  each player with lean badge (Up/Down/Toss-up), confidence, the one-line
  reason(s), and mini-stats (composite, game vs testing, trend, agreement). Low
  agreement shows a "needs a look" tag.
- A "Use this cut" affordance that carries the suggested cut into team generation
  (at minimum, prefill/deep-link the Teams page; full auto-apply optional).
- Empty/early states: if `has_scores` is false or no game sessions yet, show a
  friendly "Insights appear once scrimmage scores are in" message (don't crash).

## Testing

- **Engine (TDD, the heart):** `tests/unit/teamInsights.test.js` covers:
  - `detectBreaks`: obvious gap near a cut → `isClean`, correct `suggestedCut`;
    flat field → `isClean=false`; multi-cut sizes produce one entry per interior cut.
  - `computeLean`: **tests-well-plays-poorly → "down" + game-prioritized reason**
    (the headline); plays-well-tests-poorly → "up"; balanced+high agreement →
    "tossup"/high; low agreement → low confidence + needsReview.
  - `analyzeTeams`: small roster + sizes → returns breaks and bubble list with leans.
- **UI:** build-verified (`npm run build`) + suite green; no component harness.

## Risks

- Thresholds (window, clean-ratio, divergence) are heuristics — centralized as
  constants and tunable; the "no clean break / judgment call" output keeps the tool
  honest rather than forcing a false cut.
- Game-vs-testing requires both signals; if a category has no testing session (or
  no scrimmages yet), `divergence` is 0 and the lean falls back to composite/trend —
  handled, not crashed.
- Runs client-side on already-fetched data → no new endpoint, no auth surface added.
