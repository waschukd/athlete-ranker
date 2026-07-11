# Association Onboarding — Standard vs Tournament Formats

**Date:** 2026-07-11
**Status:** Approved design, pending implementation plan
**Area:** Association bulk onboarding, per-category setup wizard, round-robin ("Tournament") format

## Problem

Associations are the largest client-facing usage. The all-association bulk load
("one schedule, one athlete list") is powerful but the current template can't
express two things that determine how a division actually runs:

1. **Evaluation format.** A division is either **Standard** (House — one pool,
   groups skate in waves, players move up/down on performance) or **Tournament**
   (Elite, or House — set teams A/B/C/D play matchup games; every skate is
   scored). The bulk template has no way to declare this, so a Tournament
   division can't be stood up from a bulk load.
2. **Explicit structure.** The bulk schedule template silently auto-derives
   `Session #` and `Group #`. An association filling it out can't see or control
   that structure, so a batch load can "jam up" in non-obvious ways.

Most of the Tournament *engine* already exists from earlier round-robin work
(`eval_format`, `scrimmage_teams`, matchup resolution, ranking proration). This
project wires that engine into the two onboarding paths (bulk load + setup
wizard), makes the template explicit, and adds a first-class Teams tab.

## Goals

- One unified bulk template that handles Standard and Tournament divisions in a
  single file, with **explicit** `Session #` and a `Group/Matchup` column.
- Bulk load stands a Tournament division up end-to-end (format set, matchups
  stored), not just a shell.
- Setup wizard asks format **first** (right after age category) and branches.
- A dashboard **Teams** tab to assign/move players any time, with a hard
  guarantee that team moves never affect past scores.
- Consistent, plain-language naming: **Standard** and **Tournament** everywhere.

## Non-goals

- No change to how Standard (House) divisions already work.
- No DB migration of the `eval_format` value (`round_robin` stays internal).
- Automated multi-round bracket advancement — deferred. Manual **cut & reassign**
  IS in scope (§7).

## Terminology (shown to users verbatim)

> **STANDARD (House)** — One pool per age group. Players skate in groups/waves
> and move up or down based on performance. Ranking-based.
>
> **TOURNAMENT (Elite, or House)** — Players are split into set teams (A/B/C/D)
> that play each other in matchup games. Every player is scored every game they
> skate; missing a game doesn't hurt them. Teams are assigned in the dashboard.

Internally: `age_categories.eval_format` = `standard` | `round_robin`. UI,
templates, and copy say "Standard" / "Tournament". No migration.

## Design

### 1. Unified bulk schedule template

Header:

```
Division, Format, Session #, Group/Matchup, Type, Date, Start Time, End Time, Location, Player Eval, Goalie Eval
```

Column meaning flips by `Format`:

| Column | Standard (House) | Tournament |
|---|---|---|
| Format | `Standard` | `Tournament` |
| Session # | wave number: 1,1,1, 2,2,2… | one per game (may reuse # for same-day games) |
| Group/Matchup | group number: `1`, `2`, `3` | matchup: `A vs B`, `Bubble A/B` |
| Type | `Testing` / `Scrimmage` / `Goalie Skills` | blank → defaults to `Game` |

`Day` column is dropped (auto-derived from Date). A blank `Session #` or
`Group/Matchup` still auto-fills as a graceful fallback rather than jamming.

Example (mixed association, one file):

```
U11 AA,  Tournament, 1, A vs B,   , 2026-09-19, 17:30, 18:30, Rink A, 4, 1
U11 AA,  Tournament, 2, C vs D,   , 2026-09-20, 18:15, 19:15, Rink A, 4, 1
U13 House, Standard, 1, 1, Testing,   2026-09-09, 18:00, 19:00, Rink B, 0, 0
U13 House, Standard, 1, 2, Scrimmage, 2026-09-09, 19:15, 20:30, Rink B, 4, 0
```

The downloadable template carries the two-format explainer (Terminology block)
as instruction rows above the header.

The bulk roster template is unchanged (`Division, First Name, Last Name,
Position, Birth Year, HC#, Parent Email`). Teams are **not** set at load.

### 2. Format is per-division and validated

- All rows for a Division must share one `Format`. Mixed rows produce a clear
  pre-commit error ("U11 AA has both Standard and Tournament rows"), not a
  silent mess.
- On commit, each division's category has `eval_format` set:
  `Tournament → round_robin`, otherwise `standard`.

### 3. Commit order (matchup labels persisted)

```
1. Create categories per Division
2. Set eval_format per Division
3. Import rosters
4. Create schedule rows.
   - Tournament rows: STORE the raw matchup label ("A vs B") on the schedule
     row. Rosters are NOT resolved yet (no teams exist at load).
```

This requires persisting the matchup label on the schedule row. Add
`evaluation_schedule.matchup text` (nullable). Today matchups resolve
immediately at import; storing the label lets the Teams tab resolve them
whenever the association assigns teams. Standard divisions ignore this column.

### 4. Teams tab — persistent, movable, score-safe

Promotes the existing `ScrimmageTeams` "Assign Teams" panel into a first-class
**Teams** tab on the category dashboard, shown only for `eval_format =
round_robin`.

- Teams (2–6, default A/B/C/D) persist for the whole tournament.
- Seed alphabetical / even / blank, then drag-drop to assign or move players any
  time.
- **"Apply to schedule"** resolves matchup rows → fills each game's session
  group with the two teams' current members.

**Score-integrity rules (hard guarantees):**

- A game **freezes** once it has been played — defined as: it has any scores, OR
  its scheduled date is in the past.
- "Apply" only re-resolves **upcoming (unplayed)** games. Frozen games keep
  their exact roster and scores; they are never re-resolved.
- Scores are anchored to `athlete_id + game (schedule/session) + category`,
  independent of team membership. No team move ever rewrites, moves, or deletes
  a score — past or future.
- Rankings already prorate over games actually played
  (`computeCategoryRankings`), so a player who switches teams mid-tournament
  simply keeps accumulating scores cleanly; uneven games-per-player don't skew.

Result: a player moved B→C in week 3 keeps their B-game scores, counts in
C-games onward, and the ranking stays fair.

### 5. Setup wizard — format is the first fork

```
Step 1  Age category (name, birth years, …)      ← unchanged
Step 2  FORMAT (moved up; the gate for everything after)
        ○ Standard   — House. One pool, groups skate in waves, move up/down.
        ○ Tournament — Elite (or House). Teams (A/B/C/D) play matchup games;
                        every skate is scored.
Step 3+ branch:
        Standard   → sessions → scoring → group assignment → schedule
        Tournament → sessions → scoring → schedule (with matchups); NO group step
                     (teams assigned later in the dashboard Teams tab)
```

Both option descriptions use the Terminology copy. The wizard path and the bulk
path converge on the same downstream model — same `eval_format`, same Teams tab,
same matchup resolution — so a category set up either way behaves identically.

### 6. Naming

`round_robin` stays as the internal `eval_format` value (no migration). UI,
templates, wizard, and dashboard all say **"Tournament"** / **"Standard"**.

### 7. Cut Player flow (Tournament ranking page)

Cuts happen from elite divisions (AAA/AA). A cut player drops to the house
tryouts at the **same age level** (e.g. U11 AA → U11 house pool).

UI — on the Tournament category's **ranking page**, each player row gets a small
"cut" icon. Selecting it opens a short flow:

1. **Confirm** — "Confirm cut player — [Name]?" Yes / No.
2. **Destination** — "Choose where this player goes": dropdown of age categories
   in the same association (default suggestion: same age level, non-elite — e.g.
   U11 house).
3. **Notify** (optional) — checkbox + editable message preview, sent to the
   player's parent email. Default copy (gentle, division names auto-filled):
   > "Thank you for attending our AA evaluations. We've decided you won't be
   > moving on in this process. Moving forward you'll be registered in the U11
   > house league evaluations — best of luck in the process!"
4. **Confirm** → executes.

On confirm:

- The source (AA) athlete is marked cut (`cut_at`, `cut_to_category_id`). Their
  AA scores and history are untouched; they stay visible in the AA ranking
  flagged **"Cut"**, and are excluded from future AA game rosters / check-in.
- A **new athlete** is created in the destination category carrying identity
  fields (name, birth year, position, HC#, parent email) with a clean slate (no
  scores), so they enter the house pool fresh.
- If Notify is checked, the templated email is sent to the parent.

**Score integrity:** cutting never alters existing scores in either category —
same athlete-anchored guarantee as §4. The AA ranking keeps the player's real
evaluation; the house category starts them at zero.

## Data model changes

- `age_categories.eval_format` — already exists (`standard` | `round_robin`).
- `scrimmage_teams`, `scrimmage_team_members` — already exist.
- **New:** `evaluation_schedule.matchup text` (nullable) — persists the raw
  matchup label so the Teams tab can resolve it after load. Non-breaking.
- **New (§7):** `athletes.cut_at timestamptz`, `athletes.cut_to_category_id integer`
  (both nullable). Future-roster resolution and check-in treat
  `cut_at IS NOT NULL` as excluded. Non-breaking.

## Reused existing infrastructure

- `src/lib/scrimmageTeams.js` — create/seed/move teams, `resolveMatchupTeams`,
  `assignMatchupRoster`.
- `src/components/ScrimmageTeams.jsx` — team assignment UI (promote to a tab).
- `age_categories.eval_format` storage + setup step (`case "format"`).
- `round-robin-schedule` single-category template + matchup parsing in
  `categories/[catId]/schedule/route.js`.
- `computeCategoryRankings` proration over games played.
- Bulk onboard parse/commit (`organizations/[orgId]/bulk-onboard/*`).

## Error handling & edge cases

- Mixed `Format` within a Division → pre-commit validation error naming the
  Division.
- Unknown matchup letter (e.g. `A vs E` with only 3 teams) → row flagged; game
  created but roster left empty until teams cover it, surfaced in the Teams tab.
- "Apply" with no teams yet → no-op with a prompt to create teams first.
- Blank `Session #`/`Group/Matchup` → auto-derive (current behavior) so a
  loosely filled file still imports.
- Team move after some games played → only future games re-resolve; frozen
  games untouched (see §4).

## Testing

- Unit: matchup parsing (`A vs B`, `Bubble A/B`, `Team A vs Team C`), per-division
  format validation, "frozen game" predicate (has-scores OR past-date).
- Integration: bulk load a mixed file (Standard + Tournament divisions) →
  categories created with correct `eval_format`, matchup labels stored, Standard
  groups auto-numbered.
- Integration: assign teams → Apply → upcoming game rosters filled; then move a
  player and re-Apply → past game roster + scores unchanged, future games
  updated.
- Regression: existing Standard (House) bulk load and all current Fuzion
  evaluations unchanged (default `standard`).
- Cut flow: cut an AA player → source flagged Cut with scores intact and
  excluded from future AA rosters; new athlete exists in destination category
  with zero scores; optional email queued.

## Open questions

None blocking. Automated multi-round advancement deferred; manual cut & reassign
specified in §7.
