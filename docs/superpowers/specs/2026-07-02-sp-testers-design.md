# Service-Provider Testers — Design

**Date:** 2026-07-02
**Status:** Draft for review
**Scope:** Give a service provider that runs objective testing its own **tester crew** —
invited, scheduled, and notified separately from evaluators, and **completely walled off
from the association.** Builds on the existing evaluator membership / signup / invite
patterns; does not change the evaluator flow.

## Problem

An SP like Competitive Thread runs the **testing** session with a crew of ~6–8 **testers**
(they run the SportTesting hardware). Today the platform only models **evaluators** — there's
no way for an SP to invite, schedule, or notify testers, and no place for testers to sign up
for testing dates.

Key real-world rules:
- **Testers ≠ evaluators.** Testers run objective testing; evaluators subjectively score
  scrimmages. Different crews, mostly different people.
- **One-directional overlap.** Some testers are *also* evaluators (SP-approved, met the
  criteria). Being an evaluator does **not** make you a tester. Model: testers are younger/
  developing; evaluators are experienced. A person can be tester, evaluator, or both.
- **The association must never see tester data.** The association schedules testing *events*
  (date/rink) but tester counts, signups, and schedules are the SP's discretion — N/A to the
  association. Hard isolation.
- Testers see testing dates and sign up; the SP notifies them when spots are short. A tester
  who is also an evaluator sees **both**, in **separate tabs**.

## Goals

1. **Two separate pools** managed by the SP: Testers and Evaluators.
2. **Invite testers** (parallel to inviting evaluators) and **promote** a tester to also be an
   evaluator (one-directional; adds evaluator capability, keeps tester).
3. **SP-set "testers needed" per testing session** — private to the SP, drives spots-open and
   notifications; the association never sees it.
4. **Tester sign-up** for testing sessions + SP **notify** when short.
5. **Dual-capability dashboard** with **separate Testing / Evaluations tabs**.
6. **Hard association isolation** — no tester field, count, or signup ever reaches an
   association-facing view or API.

## Non-Goals

- No change to how evaluators are invited/scheduled/scored.
- Not letting the association staff or even see testing crews.
- Not auto-qualifying testers as evaluators — promotion is always a deliberate SP action.
- No tester *scoring* UI — testing data comes from the hardware/software, not the app. Testers
  sign up and check in; they don't enter scores here.

## Model

### A. Two pools (memberships)
Reuse `evaluator_memberships (user_id, organization_id, role, status)` with a new role:
- Evaluators: `role = 'service_provider_evaluator'` (unchanged).
- Testers: `role = 'service_provider_tester'` (new), under the SP org.
A person who is both simply has **two membership rows** under the same SP. "Two pools" =
filter the SP's memberships by role.

### B. Promotion (tester → also evaluator)
An SP action on a tester: "Approve as evaluator" → inserts the
`service_provider_evaluator` membership (keeps the tester one). One-directional: there is no
"make evaluator a tester" affordance. Evaluators invited directly never get a tester row.

### C. Invites
Reuse the invite path with a role discriminator so the SP has **Invite Tester** and **Invite
Evaluator** actions:
- Extend `evaluator_invitations` / `evaluator_join_codes` with a `role` (default
  `service_provider_evaluator`) so a join lands the invitee in the right pool.
- Tester invite email mirrors the evaluator one, worded for testing.

### D. Tester capacity per testing session (SP-private)
Add `testers_required` (int, default 0) to `evaluation_schedule`. Only SP endpoints read/write
it; **no association endpoint selects or returns it.** The association's own "player/goalie
evaluators" inputs are untouched and remain N/A for testing.

### E. Tester sign-ups
New table `tester_session_signups (id, schedule_id, user_id, status, created_at)` — a dedicated
table (not shared with `evaluator_session_signups`) to keep the wall clean and the queries
simple. `spots_open = testers_required − signed_up` (SP + tester views only).

### F. Dashboards
- **SP side:** a **Testers** management screen alongside the existing Evaluators screen —
  invite, list, remove, **promote to evaluator**, and per-testing-session **set testers needed /
  see signups / notify**. The SP schedule view gains tester staffing on testing rows (which
  today read "no evaluators needed").
- **Tester / evaluator side:** the person's dashboard renders **tabs by capability** —
  a **Testing** tab (if they hold a tester membership) listing testing sessions to sign up for,
  and an **Evaluations** tab (if they hold an evaluator membership) with the existing evaluator
  sign-ups. Someone with one capability sees one tab (no empty tab).

### G. Notifications
Parallel to the evaluator "needs evaluators" fan-out: the SP can notify testers when a testing
session is short (`signed_up < testers_required`). Reuse the notification/email plumbing with a
tester recipient set and testing-worded copy.

### H. Association isolation (the hard wall)
- Association age-category / schedule / dashboard endpoints **never** select `testers_required`
  or join `tester_session_signups`. Testing rows show only what they already do (date/rink;
  "no evaluators needed").
- Tester management + signup endpoints authorize as the **SP** (service_provider_admin) or the
  **tester themselves** — never association roles.
- The evaluator "available sessions" query already excludes testing, so evaluators still never
  see testing; testers get a mirror query that returns *only* testing sessions for their SP.

## Auth / roles

- Testers authenticate like evaluators; their landing dashboard is capability-driven (tabs from
  memberships), so a new hard role in the JWT may not be needed — capability is derived from
  `evaluator_memberships`. **Open question:** do we mint a `service_provider_tester` primary
  role for middleware gating, or gate the shared dashboard purely on membership presence?
- Middleware: whatever route the tester dashboard lives on must admit tester-capability users.

## Data flow

```
SP invites tester → tester accepts (join/invite, role='service_provider_tester')
   ↓
Association schedules testing event (date/rink) — tester staffing N/A to them
   ↓
SP sets 'testers needed' on the testing session (private) → notify testers if short
   ↓
Tester signs up (Testing tab) → SP sees signups / spots_open
   ↓
(optional) SP promotes a tester → also gets evaluator membership → Evaluations tab appears
```

## Edge cases

- **Removing a tester who is also an evaluator:** removing the tester role must not touch the
  evaluator role (and vice-versa) — they're independent membership rows.
- **A tester with no testing sessions available:** empty state, not an error.
- **Association trying to view/staff testing:** simply absent from their UI; endpoints reject/
  omit tester fields defensively.
- **Goalie testing:** out of scope — goalies run goalie-skills, not SportTesting drills here.

## Open questions

1. **Tester primary role vs membership-only gating** for middleware (Auth section).
2. **Invite reuse vs dedicated tester-invite table** — extend `evaluator_invitations` with a
   `role` column (lean) or a parallel `tester_invitations`.
3. **Shared dashboard vs dedicated `/tester` route** — one capability-tabbed dashboard (lean,
   best for dual-role people) or a separate tester dashboard.
4. **Notifications reuse** — confirm the existing evaluator-notify plumbing can carry a tester
   recipient set without leaking to association fan-outs.

## Why this stays clean

Testers reuse the exact evaluator primitives (membership, invite, signup, notify) with a role
discriminator and a dedicated signup table — so the code paths are familiar and the evaluator
flow is untouched. The one invariant we enforce everywhere is the **association wall**: tester
capacity, signups, and schedules live only behind SP + tester auth and never appear in an
association query.
