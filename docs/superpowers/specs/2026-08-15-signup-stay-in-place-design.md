# Session Signup: Stay in Place on Available Tab

**Date:** 2026-08-15
**Status:** Approved by user

## Problem

Staff signing up for sessions (testers and evaluators) lose their place every time
they sign up: the session immediately disappears from the "Available" list (query
invalidation refetch), the list reflows, and on the tester dashboard the code even
force-switches to the "My Sessions" tab (`setTab("mine")`). To sign up for several
sessions they must repeatedly navigate back and re-scroll.

## Decision

Keep the existing signup flow exactly as is — one-tap Sign Up, the back-to-back
block popup (`BatchSignupPrompt`), and its confirm step all stay. The only change:
**after signing up, the user stays on the Available tab, in the same scroll spot.**

Explicitly rejected: a cart/multi-select model. User wants the current flow, minus
the jumping.

## Behavior

1. **Tester dashboard** (`src/app/tester/dashboard/page.jsx`): no more
   `setTab("mine")` after signup or batch signup. User stays on Available.
2. **Both dashboards** (tester + evaluator `src/app/evaluator/dashboard/page.jsx`):
   after a successful signup (single or block), the session card **stays in place**
   in the Available list, flipped to a "✓ Signed up" state — button replaced by a
   checkmark indicator, card lightly tinted. No removal, no reflow, scroll position
   untouched.
3. Signed-up cards clear out on the next real refresh of the Available list
   (tab switch away and back, page reload). By then they appear in My Sessions.
4. My Sessions is still refreshed immediately after signup so its counts/content
   are correct if the user switches over.
5. Failed signups behave as today (error banner, card unchanged).

## Implementation approach

- Track a client-side `justSignedUp` set of `schedule_id`s (plus kind on the
  evaluator dashboard, where testing + evaluation sessions are combined).
- On successful signup: add id(s) to the set, invalidate/refresh **My Sessions
  only** — do **not** refetch/reload the Available list (that refetch is what
  removes cards and causes reflow).
- Render: an Available card whose id is in the set renders in "✓ Signed up" state
  with signup controls disabled.
- Reset the set + do a real Available refresh when the user re-enters the
  Available tab (evaluator) or on next full `load()` (tester).
- Conflict detection (`myOccupied` / `availConflict`) should treat just-signed-up
  sessions as occupied so overlapping cards flag correctly without a refetch.
- Header count "open to sign up" may be stale by the number of just-signed-up
  cards until the next refresh — acceptable.

No API, database, or My Sessions changes.
