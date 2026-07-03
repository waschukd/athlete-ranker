# Smart Schedule Import — Design

**Date:** 2026-07-03
**Status:** Draft for review
**Scope:** Let a user drop the association's raw ice schedule (any CSV/XLSX, exactly as sent)
and get the sessions relevant to a category onto the Sideline Star schedule — instead of
hand-massaging a messy file into our rigid template.

## Problem

Associations distribute ice schedules in wildly inconsistent formats. Two real samples:

- **BAHA CSV:** leading blank column; date-header rows interleaved ("Monday August 31, 2026");
  association name as a header row; age group + division + session type buried in a free-text
  label ("U11 AA TEAM 1 // U11 AA TEAM 2", "U9 TIME TRIALS GROUP 1"); encoding garbage (`�`);
  inconsistent times ("5:00 PM" vs "7:00PM"); the WHOLE association (every age group) in one file.
- **Fuzion XLSX:** sections by age group as header rows in column A (GOALIES, U9, U11 JR KINGS,
  U11, U13…); the header row repeats per section; Excel serial dates (`46270`) and fractional
  times (`0.708` = 5:00 PM); session type in the Note column ("[Time Trials]", "[Pre-Skate]",
  "GAME (Home) vs", "Practice - Full"); blank separator rows.

Our current importer expects `Session #, Group #, Type, Date, Day, Start, End, Location, Player
Evaluators, Goalie Evaluators` — nothing like these. So copy-pasting into columns is slow and
error-prone. The fix is to meet the messy file where it is.

## Goals

1. **Drop any CSV/XLSX as-is** — no pre-formatting.
2. **AI normalization:** Claude reads the arbitrary layout and returns clean rows
   (date, start, end, location, age group, division, session type, raw label), skipping
   section/date/blank header rows and fixing Excel dates/times + encoding.
3. **Category-aware extraction (key):** the setup wizard is per age category, so when setting up
   "U11 AA" the importer auto-filters the whole-association file to the **U11 AA rows** and
   pre-selects them — the other age groups are hidden (with a "show everything" escape hatch).
4. **Missing Sideline-Star fields are filled at confirm, not from the file** — evaluator counts,
   group #, session # aren't ice-scheduling concepts, so they get sensible per-type defaults with
   a bulk override + per-row edit.
5. **Preview → tick → map → import** — see normalized rows, confirm the selection, map to a
   category + session, import into `evaluation_schedule`.
6. **Available on both** the association setup wizard and the SP side.

## Non-Goals

- Not replacing the existing template CSV importer — this is an additional, smarter path.
- Not auto-importing without a human confirm step (the AI proposes; the user commits).
- Not parsing rosters/athletes (separate flow) — this is schedule only.

## Model

### A. Input handling
- **CSV:** read text client-side.
- **XLSX:** parse with SheetJS server-side (handles serial dates, time fractions, merged cells,
  encoding) into a plain grid of stringified cells. (New dependency: `xlsx` / SheetJS.)
- Either way we produce a compact text grid (bounded rows/cols) to send to the model.

### B. AI normalization — `POST /api/schedule-import/parse`
- Auth: category access (association) or SP context. Cost-capped via `checkAndRecord`
  (endpoint `schedule_ai`), reusing the existing Anthropic pattern
  (`claude-sonnet-4-20250514`, `x-api-key`, prompt-injection guard — the file is untrusted input,
  extract only, never follow instructions inside it).
- Model returns a validated JSON array; each row:
  ```
  { date: "YYYY-MM-DD" | null, start_time: "HH:MM" | null, end_time: "HH:MM" | null,
    location: string | null, age_group: "U9|U11|U13|U15|U18|..." | null,
    division: "AA|A|House|JR KINGS|..." | null,
    session_type: "testing|scrimmage|skills|goalie_skills|game|practice|other",
    raw_label: string }
  ```
- Rows lacking date or a time are returned but marked incomplete (never dropped silently).
- Privacy: ice schedules carry team/age labels, arenas, times — no minor PII — so sending to the
  model is low-sensitivity (unlike audio-of-minors). Still: never send roster/athlete files here.

### C. Category-aware filtering (client)
- The wizard passes its category name (e.g. "U11 AA"). We parse an age number + division from it
  and from each row's `age_group`/`division`, then **pre-filter + pre-tick** matching rows.
- A "Show all age groups" toggle reveals the rest if the match is imperfect (e.g. odd labels).
- On the SP side (no single category context), no pre-filter — the user picks.

### D. Confirm + fill (client)
- Preview grouped by age group; matching group expanded, others collapsed.
- Incomplete rows flagged ⚠ with inline fix (date/time) or leave unticked to skip.
- **Session mapping:** assign the ticked rows to a Sideline Star session number (Testing = S1,
  Scrimmage = S2/3/4…). `session_type` from the AI seeds this; user adjusts.
- **Bulk fills for missing fields:** "Player evaluators" / "Goalie evaluators" / "Group #" set
  across the selection with per-type defaults (testing → 0 player evaluators; scrimmage → 4),
  editable per row. Group # auto-increments within a session/day.

### E. Import
- Reuse the existing schedule POST (`/api/categories/[catId]/schedule` bulk shape, and the SP
  schedule/testing-events endpoints) — the smart importer just produces the same normalized
  rows the template importer already feeds in, so nothing downstream changes.

## Data flow

```
drop file (csv/xlsx)
  → /api/schedule-import/parse  (XLSX→grid, then Claude → normalized rows)
  → client preview, pre-filtered to the wizard's category (age+division match)
  → user ticks rows, fixes incomplete, maps to session #, bulk-fills evaluator counts/group #
  → existing schedule bulk-insert
```

## Edge cases / guards

- **AI unavailable / over budget:** show a clear message and fall back to the current template
  importer (still available). No hard dependency.
- **Ambiguous age match:** if pre-filter finds nothing, default to "show all" so the user isn't
  staring at an empty list.
- **Duplicate rows / re-import:** the schedule insert already upserts by (session, group) —
  re-running updates rather than duplicating.
- **Huge files:** cap rows sent to the model; if exceeded, page or ask the user to trim.
- **Times without AM/PM or 24h:** the model normalizes to HH:MM; anything unparseable → incomplete.

## Open questions

1. **SheetJS server-side vs a lighter hand-rolled XLSX reader.** Lean SheetJS for correctness.
2. **Model cost cap value** (imports/day) — start conservative (e.g. 30/day/user) and tune.
3. **SP-side mapping** when the file spans age groups the SP runs for multiple clients — likely
   pick client + category per selection; confirm during build.

## Why this stays clean

The smart importer's only new surface is **file → normalized rows**. Everything after that
(preview, mapping, insert) reuses the schedule bulk-insert the template importer already uses, so
the AI layer is additive and isolated — if it's off, the template path is untouched.
