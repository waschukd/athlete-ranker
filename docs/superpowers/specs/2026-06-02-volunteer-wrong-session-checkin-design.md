# Volunteer wrong-session check-in fix + instant refresh

**Date:** 2026-06-02
**Status:** Approved design, pending implementation plan
**Scope:** `src/app/checkin/[scheduleId]/page.jsx`, `src/app/api/checkin/[scheduleId]/route.js`, tests

## Problem

A volunteer is bound to a single session via a `checkin-token`. When a player who
belongs elsewhere physically shows up (the "wrong session" case) or was missed,
the only tool available is `+ Add`, which calls the `add_player` action and
**unconditionally `INSERT`s a brand-new `athletes` row**
(`api/checkin/[scheduleId]/route.js:258`). The same child then exists twice in the
same org + age category. Evaluators (who read `player_checkins WHERE checked_in =
true`) see both. The duplicate `athlete_id` is permanent and corrupts rankings.

There is no action to reassign an existing athlete to the volunteer's session —
`move_team` only flips White/Dark.

Secondary: the check-in screen polls every 15s, so two volunteers at one table
see stale state (a check-in can take up to 15s to appear on the other's screen).

## Goal

Let a volunteer get any physically-present player checked into **their** session
without ever creating a duplicate athlete, and keep multiple volunteers in sync.

Non-goals (explicitly deferred): offline/failure banner, undo toast,
duplicate-name confirmation on new adds, cross-session "move out" of the other
session. A player added here is left untouched in any other session.

## Design

### A. Search-first Add

All "missed / wrong session" cases reduce to one need: check the present player
into this session, reusing their existing identity if they already have one.

**UI** — Add form (`page.jsx:152–180`):
- While the volunteer types a name, run a debounced lookup (≥2 chars, ~250ms
  debounce) against the category roster.
- Render up to 5 matches beneath the name inputs. Each row shows
  `Last, First · #jersey · S{n}·G{n}` (or "unassigned") and a **"Check in here"**
  button.
- "Check in here" → `add_existing` action with that `athlete_id`. On success,
  clear the form and refetch.
- The existing primary button is relabeled **"Add new player"** and still calls
  `add_player`. It is the fallback for genuine walk-ups with no roster match.

**API** (`api/checkin/[scheduleId]/route.js`) — two new POST actions, both gated by
the existing `authorizeCheckin(scheduleId)` (staff session OR `checkin-token`):

1. `find_existing { query }`
   - Resolve the schedule's `age_category_id`.
   - Return athletes in that category whose `first_name`/`last_name` match the
     query (case-insensitive `ILIKE`), capped at ~8 rows.
   - Exclude athletes already assigned to **this** session group (they're already
     in the main list).
   - For each match include current session/group label if any (via
     `player_group_assignments` → `session_groups`).
   - Require `query.trim().length >= 2`; otherwise return `[]`.

2. `add_existing { athlete_id, jersey_number?, team_color? }`
   - **Security guard:** load the athlete; if its `age_category_id` does not equal
     the schedule's `age_category_id`, return 403 and perform **no writes**.
     (Prevents pulling an arbitrary athlete from another org/category via a
     guessed id — the IDOR concern.)
   - Find the `session_groups` row for this schedule's
     `(age_category_id, session_number, group_number)`. If present, `INSERT` a
     `player_group_assignments` row `ON CONFLICT DO NOTHING` (display_order 99,
     matching `add_player`).
   - Upsert `player_checkins` for `(athlete_id, schedule_id)`:
     `checked_in = true, checked_in_at = NOW()`, set jersey/team_color when
     provided, `ON CONFLICT (athlete_id, schedule_id) DO UPDATE`.
   - Return `{ success: true }`.
   - Does not modify any other schedule's `player_checkins` or assignments.

### B. Instant refresh

- `page.jsx:37` `refetchInterval: 15000` → `5000`.
- `doAction` already calls `refetch()` after each action; no change there. A
  failed POST self-corrects on the next 5s poll (player reverts to "Out"),
  partially mitigating silent failures for free.

## Data flow (wrong-session, end to end)

1. Sarah (athlete 42) is rostered in S2·G1 but walks up to the S1·G1 table.
2. Volunteer types "Sar" → `find_existing` returns `Chen, Sarah · #7 · S2·G1`.
3. Volunteer taps "Check in here" → `add_existing { athlete_id: 42 }`.
4. Server verifies athlete 42 ∈ this category, adds a S1·G1
   `player_group_assignments` row, upserts a `player_checkins` row for this
   schedule with `checked_in = true`.
5. The S1·G1 evaluator now sees Sarah (athlete 42, not a clone). Her S2·G1
   roster row is untouched.

## Testing

Unit tests in `tests/unit/`, mocking `@/lib/db` in the style of
`authorize.test.js` / `authz_idor.test.js`:

- `add_existing` **rejects** an athlete whose `age_category_id` differs from the
  schedule's category → 403, asserts no assignment/checkin INSERT runs.
- `add_existing` **happy path** → asserts the group-assignment insert and the
  `player_checkins` upsert both fire for the correct ids.
- `find_existing` returns `[]` for queries under 2 chars (no DB query for the
  roster scan).

Full suite (`npm run test`) must stay green.

## Files touched

- `src/app/checkin/[scheduleId]/page.jsx` — Add-form search UI, relabel, refetch interval.
- `src/app/api/checkin/[scheduleId]/route.js` — `find_existing` + `add_existing` actions, category guard.
- `tests/unit/checkin-actions.test.js` (new) — guard + happy-path + min-query tests.

## Risks

- **Roster search scope:** a `checkin-token` can now read category-wide names via
  `find_existing`. Acceptable — same sensitivity as the group list already
  exposed, and confined to the schedule's own category. Min-query length limits
  bulk enumeration.
- **Concurrent cross-session check-in:** a player can be `checked_in` in two
  sessions at once after `add_existing`. Intended; resolving the stale one is the
  other session's volunteer's job (out of scope).
