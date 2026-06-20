# Round-Robin (Matchup) Scrimmages — Design

**Date:** 2026-06-19
**Status:** Draft for review
**Scope:** Two related pieces. (1) An opt-in, per-category **round-robin (matchup) scrimmage
mode** that does **not** change the default lockstep flow most house categories use. (2) A
**final-session contention planner** (sit recommendations) that works in **both** modes —
useful even for a standard 4th session. They share the per-player "dressed/sat" mechanic.

## Problem

The current model assumes every athlete in a category moves through the same sessions in
lockstep: Session 1 (testing), then Scrimmages on fixed dates that *everyone* plays
together. A scheduled slot = one shared `session_number` for all participants.

Some associations (not all) run the scrimmage phase as **matchups between teams** instead:

- ~45 skaters are split into **persistent teams** (e.g. Team 1 / 2 / 3), seeded from testing.
- A calendar **slot is a game between two teams**; with 3 teams you can't run all at once, so
  one team always sits out that slot.
- Because of that, teams march through their **game count at different rates**. The *same*
  slot can be **Game 2 for one team and Game 1 for the other**.

Worked example (3-team round-robin — even, two games each):

| Slot | Matchup | Team 1 | Team 2 | Team 3 |
|------|---------|--------|--------|--------|
| 1 | T1 v T2 | Game 1 | Game 1 | — |
| 2 | T1 v T3 | **Game 2** | — | **Game 1** |
| 3 | T2 v T3 | — | Game 2 | Game 2 |

A 4th slot (a repeat matchup) can push some/all teams to a third game.

**Player-level sitting (strategic):** when a third game is played, coaches **rest players
whose placement is already decided** — locks for the top team and clear cuts for the bottom.
They **never sit the bubble** (the middle), because the middle is precisely who needs the most
looks. So players who log fewer games are always the high-confidence ones; the smaller sample
is *by design*, not an evaluation gap.

The current schema can't represent any of this: `session_number` is a property of the slot,
shared by all, and there's no notion of a matchup, a per-team game number, or a planned sit.

## Goals

1. A **per-category toggle** ("Round-robin scrimmages") that turns this mode on. Default off →
   existing behavior is 100% unchanged for every other category.
2. **Persistent scrimmage teams** for the category, seeded from testing rankings.
3. A **matchup-grid schedule** authored ahead of time: each slot is `Team A vs Team B` with a
   date/time/rink. The system stamps each team's **running game number** for that slot.
4. **Scores attribute to the player's own game**, derived from their team's game number on the
   matchup — Team 1's scores in Slot 2 go to Scrimmage 2, Team 3's go to Scrimmage 1.
5. **Planned + at-rink sits**: the director can pre-designate rested players per game when
   building the grid; check-in can also mark sits. Sat players don't surface for scoring that
   slot and record no score for it.
6. **No change to scoring units, weighting, ranking, or reports** beyond consuming the
   per-team game number instead of the raw slot number, and normalizing over games actually
   played per player.
7. **Final-session contention planner** (applies to lockstep *and* round-robin): before the
   final game(s), use the data to classify players as Locked / Out / Bubble against configured
   roster targets, and **recommend who to sit** — the math recommends, the director confirms.
8. **Capture intended roster size(s) at setup** so the cut line(s) exist before the final
   session (see Setup inputs).

## Non-Goals

- Not changing the default lockstep flow.
- Not auto-generating the matchup grid or auto-balancing game counts — the grid is authored by
  hand (it's an occasional, association-specific format).
- Not building bracket/playoff logic — this is evaluation games, not a tournament.
- Not exposing *why* a player was rested on parent-facing reports (don't leak the coach's hand).

## Setup inputs

- **Mode flag** (Section A).
- **Intended roster target(s)** — new setup question capturing how many players "make it"
  (e.g. a single number "top 17", or per-tier sizes AA 17 / A 17 / BB 15). These define the
  **cut line(s)** the contention planner classifies against. Stored on the category
  (e.g. `age_categories.roster_targets` jsonb, or reuse Team Builder team sizes if present).
  Applies to *both* modes — the planner is useful for the standard 4th session too.

## Model

### A. Per-category mode flag
`age_categories.scrimmage_format` ∈ `{ lockstep (default), round_robin }` (or a boolean
`round_robin_scrimmages`). Set during category setup. When `lockstep`, every code path below is
bypassed and the system behaves exactly as today.

### B. Persistent scrimmage teams
Round-robin categories define **scrimmage teams** (Team 1..N) that stay fixed across the
scrimmage phase — distinct from the *final* AA/A/BB teams produced by the post-eval Team
Builder. Seeded from testing rankings (snake by default), editable.

- Likely reuse/extend the existing grouping tables (`session_groups` /
  `player_group_assignments`) but make the assignment **persist across scrimmage sessions**
  rather than being per-session. **Open question** below.

### C. Matchup-grid schedule
Each scrimmage slot becomes a **matchup**: `{ date, time, location, home_team, away_team }`.
On save, the system computes and stores each team's **running game number** for the slot
(its Nth appearance in the grid). One slot row therefore knows: "Team 1 → game 2, Team 3 →
game 1."

- Extend `evaluation_schedule` (add `home_team_id`, `away_team_id`, `home_game_no`,
  `away_game_no`) or introduce a `scrimmage_matchups` table. **Open question** below.
- The number of scrimmage "sessions" for the category = max game number any team reaches from
  the grid (2 for a plain 3-team round-robin; 3 if a repeat slot is added). Weights spread
  across that count.

### D. Per-player participation (dressed / sat)
A `matchup_participation` marker per (matchup, athlete): `dressed | sat`. Default dressed.

- **Planned:** director sets sits while authoring the grid (knowing the locks/cuts ahead).
- **At-rink:** check-in can flip a player to sat (or confirm dressed).
- Only dressed players appear on the scoring screen for that slot.
- Soft guardrail (optional): warn if a *middle-ranked* player is being sat ("the bubble is who
  you usually want the most looks on"). Never hard-block.

### E. Scoring
When an evaluator opens a matchup:
- Both rosters load, each player tagged with **their** scrimmage number (their team's game_no).
- Sat players are hidden.
- Scores save to `category_scores` with `session_number` = that player's game number. Team 1's
  rows → Scrimmage 2, Team 3's → Scrimmage 1, automatically. The evaluator never thinks about it.

### F. Ranking, weighting, reports — unchanged in spirit
- `category_scores.session_number` remains the unit. Ranking already takes a **weighted average
  over the sessions a player has data for**, so a sat game is simply absent — no penalty beyond
  one fewer data point. (Verify the normalization in `lib/rankings.js` during build.)
- Reports compare Scrimmage 1↔1, 2↔2 across players, as today.
- Report shows **"N of M games"** when a player was rested, so the smaller sample reads as
  intentional, not missing — **without** stating the reason.

### G. Final-session contention planner (sit recommendations)

Helps an association decide, before the **final game(s)**, who they still need to evaluate vs.
who can be rested. Applies to **lockstep and round-robin**. The math **recommends**; the
director **confirms** (and the confirmation of a "Locked" sit is the "this player made the team"
declaration).

**Inputs**
- Configured roster target(s) → cut line(s) at those rank boundaries (from Setup inputs).
- Each player's current weighted standing from scored sessions (`lib/rankings.js`).
- Each player's **remaining game(s)** and their weight: lockstep = the 1 final session;
  round-robin = whatever that player has left on the matchup grid.
- Observed **movement spread** for this category — the variability of a player's per-session
  score (we already compute session-to-session movement; the seed script's `moveStats` is the
  same idea). This is what makes "realistically caught" concrete rather than worst-case.

**Method — probabilistic (chosen):**
- Monte-Carlo the final game(s): for each player, draw plausible final-session score(s) from a
  distribution centered on their established level with spread = the category's observed
  per-session variability; recompute the weighted ranking each run (hundreds–thousands of runs).
- For each player, compute **P(finishing inside each cut line)** across runs.
- Classify against a **confidence knob** (default ~5%, director-adjustable):
  - 🔒 **Locked in** — P(in) ≥ 1 − threshold (can't realistically fall out).
  - ❌ **Out of contention** — P(in) ≤ threshold (can't realistically climb in).
  - 🎯 **Bubble** — anything between → **must play.**
- Absolute/mathematical locks are a strict subset and always shown as locked regardless of knob.

**Output / UX**
- A "Final Session Planner" view: roster sorted by standing, cut line(s) drawn in, each player
  badged Locked / Bubble / Out, with the bubble band highlighted as "evaluate these."
- "Recommend sits" = Locked + Out; one action to apply → sets the dressed/sat markers
  (Section D) for the final session. Director can override any individual mark.
- Guardrail: never auto-sit a Bubble player; warn if the director manually does.

**Guards**
- Needs enough scored data to estimate movement (≥1–2 scored sessions); until then, show
  "not enough data yet," no recommendations.
- Show the assumptions plainly (confidence level, games remaining) so it's a decision aid, not a
  black box.

## Data flow summary

```
setup: mode=round_robin → define persistent teams (seed from testing)
   ↓
schedule: author matchup grid (TeamA v TeamB per slot)
   → system stamps home_game_no / away_game_no per slot
   → director marks planned sits (locks/cuts) per slot
   ↓
before final game(s): Contention Planner classifies Locked/Bubble/Out vs roster targets
   → "Recommend sits" (Locked + Out) → director confirms → sets dressed/sat for final session
   ↓
rink: check-in confirms/adjusts dressed-vs-sat
   ↓
score: open slot → dressed players tagged with their game# → scores save at that session_number
   ↓
rank/report: unchanged; weighted avg over games each player actually played; "N of M games"
```

## Edge cases

- **3-team round robin = 2 games each** (even). Three games requires an added/repeat slot.
- **A player sits → fewer games**: expected for locks/cuts; ranking normalizes; report annotates.
- **Goalies**: same matchup belongs to a goalie's team; goalie scores follow their team's game
  number identically. Goalie skills session (session 1) is unaffected.
- **Mid-eval team edit**: moving a player between scrimmage teams after games are played is
  messy (their existing game scores were vs a different team). Likely lock teams once scrimmage
  scoring begins, or warn loudly. **Open question.**
- **Uneven team sizes** (45 / 3 = 15 clean; 46 would be 16/15/15) — already handled by team
  seeding; no special logic.

## Open questions (resolve before/at planning)

1. **Schema shape**: extend `evaluation_schedule` with matchup columns, or a dedicated
   `scrimmage_matchups` + `matchup_participation` pair? (Leaning: dedicated tables, to avoid
   overloading the lockstep schedule and keep the mode cleanly separable.)
2. **Persistent teams**: reuse `session_groups` with a "persists across sessions" flag, or a
   new `scrimmage_teams` table? (Leaning: new table — semantics differ from per-session groups
   and from final Team Builder teams.)
3. **Team lock**: do we hard-lock scrimmage teams once the first game is scored, or allow edits
   with a warning?
4. **Weights**: when game count is 2 (not 3), how are scrimmage weights set — even split auto,
   or director-configurable as today? (Leaning: reuse existing per-session weight UI, seeded to
   an even split across the grid's game count.)
5. **Roster targets shape**: single "top N" number vs. per-tier sizes (AA/A/BB). (Leaning:
   support per-tier, since the planner and Team Builder both benefit; allow a single number as
   the simple case.)
6. **Movement estimate**: derive the per-session score spread from *this* category's data only,
   or blend with a global prior when early/sparse? (Leaning: this category's data, with a
   sensible default spread until ≥2 sessions exist.)
7. **Confidence default**: starting threshold for Locked/Out (e.g. 5%) and whether it's exposed
   as a slider in v1 or fixed.

## Why this stays clean

The only thing we're truly changing is the assumption **"a calendar slot = everyone's same
session."** We replace it with **"a player's score is stamped with their own game number,"** and
everything downstream — scoring categories, weights, rankings, reports — keeps running on
`session_number` exactly as it does today. The mode is fully opt-in and isolated behind a flag,
so house categories are untouched.
