# Bulk Association Onboarding — Design

**Date:** 2026-07-07
**Status:** Draft for review
**Scope:** Let an association (or the SP setting them up) stand up their **entire season in a
couple of uploads** — drop the whole-association schedule and/or roster, auto-detect the
divisions, confirm, and create every age category (with standard config), routing each schedule
slot and athlete to its category. Removes the per-category wizard repetition.

## Problem

An association has many categories (U9 / U11 / U13 / U15 / U18, often × AA / AAA / A / House).
Today each is a fresh 7-step wizard from the generic defaults, even though every category in an
association uses essentially the same settings — so the admin re-answers the same questions
10–15 times. The single-category flow is already well-defaulted and has smart schedule + roster
import; the remaining pain is **repetition across categories**.

## Goals

1. **One panel to onboard a whole association**: upload the full schedule and/or roster file(s)
   exactly as received (the messy BAHA/Fuzion files).
2. **Auto-detect divisions from EITHER file** (schedule via the existing AI normalizer, roster via
   its division column) and propose a category per distinct division.
3. **Confirm/edit step** — the admin renames / merges / removes proposed categories and **maps any
   unmatched rows** before anything is created. Nothing is guessed silently.
4. **One commit** creates every category with the **standard default config** (Testing + 3
   scrimmage + standard scoring + goalie config), then routes athletes (by division) and schedule
   slots (by division) into their category.
5. **Preserve tier exactly** — AA ≠ AAA ≠ A ≠ House. Division is part of the category identity.

## Non-Goals

- Not replacing the single-category wizard (kept for one-offs and per-category tweaks).
- Not auto-tuning per-category config from the file — everyone gets the standard default; tweak
  later in the wizard.
- Not parsing goalie-specific structure from the file — goalie config uses the org default.

## Model

### A. Canonical division key (load-bearing)
Both sources funnel through one `canonicalDivision(ageGroup, division)` → a stable key like
`U11 AA`. Schedule rows get age_group + division from the AI normalizer; roster rows from the
division column. Normalization: age → `U<n>`; division tier uppercased and de-noised
(strip "TEAM 1 / GROUP 2 / GAME" etc.), mapping common forms (AAA, AA, A, BB, B, C, House/HL).
Same input → same key from both files, so schedule and roster line up on the same category.

### B. Parse endpoint — `POST /api/organizations/[orgId]/bulk-onboard/parse`
- Auth: admin of the org (association_admin / super_admin / service_provider_admin serving it).
- Accepts `schedule` file and/or `roster` file (multipart).
- Schedule → `scheduleNormalize` (AI, cost-capped, reuses the smart-import pipeline) → normalized
  rows. Roster → `rosterImport.parseCsv` + `buildAthletes` (no division filter).
- Returns:
  - `divisions`: `[{ key, age_group, division, label, scheduleCount, athleteCount, source }]`
    (union of divisions seen in either file).
  - `scheduleRows`, `athletes` (each tagged with its canonical `divisionKey`), plus
    `unmatched` buckets for rows whose division couldn't be canonicalized.
- Existing categories in the org are returned too, so the UI can offer "route into existing
  U11 AA" instead of creating a duplicate.

### C. Confirm/edit (client) — `BulkOnboard` panel
- Shows detected divisions as editable rows: canonical name, counts (schedule/athletes), and a
  target: **Create new** | **Use existing category X** | **Skip**.
- Unmatched schedule/roster rows are listed under "Needs a home" → the admin points each at a
  category (or skips). Flag, don't guess.
- Merge: two detected divisions can be pointed at the same target category.

### D. Commit endpoint — `POST /api/organizations/[orgId]/bulk-onboard/commit`
- Input: the confirmed division→target decisions + the tagged rows/athletes.
- For each **Create new** target: create the age category, then apply the **standard default**
  (category_sessions, scoring_categories, goalie_config) — the same DEFAULT_* the wizard seeds.
- Bulk-insert athletes into their target category (reuse the athletes bulk-insert logic; upsert by
  external_id).
- Bulk-insert schedule slots into their target category (reuse the smart-import row→session
  mapping + per-session unique group numbering we already fixed; evaluator counts from per-type
  defaults, testing = 0).
- Idempotent-ish: re-running matches existing categories/athletes rather than duplicating.
- Runs in transaction chunks; returns a summary (categories created, athletes imported, slots
  imported, anything skipped).

### E. Entry point
A **"Set up your whole season"** panel above the "Add Age Category" button on the association
dashboard. Single-category "Add Category" stays for one-offs.

## Data flow

```
drop schedule + roster
  → /bulk-onboard/parse  (AI-normalize schedule, parse roster) → canonical divisions + tagged rows
  → confirm/edit: name/merge/skip each division, map unmatched rows, choose new-vs-existing
  → /bulk-onboard/commit → create categories (+standard config) → route athletes + schedule
  → dashboard fully populated; tweak any category in the wizard if non-standard
```

## Edge cases / guards

- **Schedule label noise** ("U11 AA TEAM 1 // U11 AA TEAM 2", "U9 TIME TRIALS GROUP 1") →
  canonicalizer strips TEAM/GROUP/GAME and keeps age+tier. Ambiguous ones go to "Needs a home".
- **AA vs AAA vs A** must never collapse — canonical key includes the exact tier.
- **Only one file provided** — works with just schedule OR just roster (the other stays empty for
  those categories; admin adds later).
- **Category already exists** — offer "use existing" (route in) rather than creating a duplicate.
- **AI unavailable / over budget** — schedule detection falls back to the template importer or a
  manual division list; roster detection is deterministic and always available.
- **Huge files** — row caps as in the smart importer; report anything dropped.
- **Re-run** — athletes upsert by external_id; schedule upserts by (category, session, group);
  categories match by name so a second run doesn't duplicate.

## Reuse (this is mostly assembly)

- `lib/scheduleNormalize` (AI schedule → rows) — already built + tested.
- `lib/rosterImport` (CSV → athletes, division-aware) — already built + tested.
- SmartScheduleImport's row→session mapping + group numbering — already built + fixed.
- The wizard's DEFAULT_SESSIONS / DEFAULT_SCORING_CATS / goalie defaults — reuse verbatim.
- The setup route's category-config persistence — reuse.
The genuinely new code is: the canonicalizer, the two bulk endpoints (parse/commit orchestration),
and the confirm/edit UI.

## Open questions

1. **Canonical division vocabulary** — confirm the tier set to recognize (AAA, AA, A, BB, B, C,
   House/HL, and how to treat sub-designations like U18 "BC/NBC"). Start with the common set;
   unknown tiers pass through verbatim and can be renamed in the confirm step.
2. **Where the entry point lives** — association dashboard only, or also the SP "create client"
   flow (SP onboards a new association's whole season at once). Lean association dashboard first.
3. **Standard config source** — the generic DEFAULT_* (lean) vs an org-level template if/when
   that exists.

## Why this stays clean

Bulk onboarding is an orchestration layer over primitives that already exist and are tested
(schedule normalize, roster parse, category-config defaults, schedule/athlete bulk insert). The
only new load-bearing logic is the canonical division key, which both files share so they align.
