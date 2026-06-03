# Director capabilities: check-in visibility, flag acknowledgment, group building

**Date:** 2026-06-02
**Status:** Approved scope (user picked these 3; audited score-correction explicitly excluded). Built autonomously overnight → PR for review.
**Scope:** `src/middleware.js`, `src/app/api/categories/[catId]/checkin-summary/route.js` (new), `src/app/api/categories/[catId]/flags/route.js`, `src/components/CategoryDashboard.jsx`, tests.

## Background

`authorizeCategoryAccess` already authorizes an assigned director per-category, so the
groups API, flags API, and check-in API all already permit directors. The only
blockers are (1) middleware route-gating and (2) missing UI exposure in the
director-facing `CategoryDashboard`. No schema changes needed — `athlete_flags`
already has `acknowledged/acknowledged_by/acknowledged_at`.

## Design decisions (flagged for review)

- **Scoped middleware grant.** Rather than add `director` to the entire
  `/association/dashboard` route (which would expose org-level admin like
  add-category, setup, teams), grant directors access to **only** the
  `groups` and `flags` sub-pages via a targeted regex. Most reversible, least
  exposure.
- **Groups tab shown to association *and* director.** The `activeTab === "groups"`
  render block already exists in `CategoryDashboard` but no tab triggers it.
  Adding the tab benefits both roles; association admins gaining the tab is a
  minor improvement, not a regression. Noted for review.
- **Check-in total = player_checkins rows** (created lazily when a session's
  check-in screen is opened), matching what the volunteer screen shows. A session
  never opened shows 0/0. Acceptable for a live indicator; a roster-based total
  can come later if needed.

## Changes

### 1. Middleware — scoped director access (`src/middleware.js`)
Before the generic `ROLE_ROUTES` loop, add:
```js
const DIRECTOR_ASSOC_ALLOW = /^\/association\/dashboard\/category\/[^/]+\/(groups|flags)(\/|$)/;
```
and, after the token is verified, allow directors through when the path matches:
```js
if (payload.role === "director" && DIRECTOR_ASSOC_ALLOW.test(pathname)) {
  return NextResponse.next();
}
```
This must run before the `ROLE_ROUTES` loop so the `/association/dashboard` entry
doesn't redirect the director first.

### 2. New endpoint — category check-in summary
`GET /api/categories/[catId]/checkin-summary`, gated by `authorizeCategoryAccess`.
Returns one row per scheduled session/group with checked-in vs total counts:
```json
{ "sessions": [ { "schedule_id": "...", "session_number": 1, "group_number": 1, "checked_in": 8, "total": 10 } ] }
```
Query: `evaluation_schedule` LEFT JOIN `player_checkins` grouped by schedule,
`COUNT(...) FILTER (WHERE pc.checked_in)` vs `COUNT(pc.id)`.

### 3. Flag acknowledgment audit trail (`flags/route.js`)
In the existing `acknowledge` action, after the UPDATE, insert an `audit_log` row
(`user_id`, `action='flag_acknowledged'`, `entity_type='athlete_flag'`,
`entity_id=flag_id`, `age_category_id=catId`) so director acknowledgments are
traceable. The acknowledge action and page already work for directors once
middleware unblocks the flags page.

### 4. CategoryDashboard UI (`CategoryDashboard.jsx`)
- Add a **Groups** tab to the `tabs` array (the render block already exists),
  visible to both association and director.
- In the **Schedule** tab, fetch `checkin-summary` once and show a
  `8/10 checked in` badge per session row (read-only; both roles). This is the
  "live check-in visibility" for directors.

## Testing

- **checkin-summary**: unit tests (sql + auth mocked, mirroring
  `tests/unit/authz_idor.test.js`) — 403 when unauthorized; returns the session
  rows on the happy path.
- **flags acknowledge audit**: unit test asserting the `audit_log` insert fires on
  `acknowledge`.
- **Middleware + UI**: build-verified (`npm run build`) + full suite green; no
  middleware/component test harness exists, stated plainly (not faked).

## Risks

- Middleware regex must be anchored (`^`) and run before the role loop, or it
  either over-grants or is bypassed. Covered by explicit placement.
- The groups/flags standalone pages link "back" to the association dashboard
  (cosmetic for a director). Acceptable; noted.
- N+1 avoided by using one summary endpoint instead of per-schedule fetches.
