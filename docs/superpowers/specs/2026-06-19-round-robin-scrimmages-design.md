# Round-Robin (Matchup) Scrimmages — Design

**Date:** 2026-06-19
**Status:** Draft for review
**Scope:** Opt-in, per-category evaluation mode. Does **not** change the default lockstep
flow that the vast majority of (house) categories use.

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

## Non-Goals

- Not changing the default lockstep flow.
- Not auto-generating the matchup grid or auto-balancing game counts — the grid is authored by
  hand (it's an occasional, association-specific format).
- Not building bracket/playoff logic — this is evaluation games, not a tournament.
- Not exposing *why* a player was rested on parent-facing reports (don't leak the coach's hand).

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

## Data flow summary

```
setup: mode=round_robin → define persistent teams (seed from testing)
   ↓
schedule: author matchup grid (TeamA v TeamB per slot)
   → system stamps home_game_no / away_game_no per slot
   → director marks planned sits (locks/cuts) per slot
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

## Why this stays clean

The only thing we're truly changing is the assumption **"a calendar slot = everyone's same
session."** We replace it with **"a player's score is stamped with their own game number,"** and
everything downstream — scoring categories, weights, rankings, reports — keeps running on
`session_number` exactly as it does today. The mode is fully opt-in and isolated behind a flag,
so house categories are untouched.
