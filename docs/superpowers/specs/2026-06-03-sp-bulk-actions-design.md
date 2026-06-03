# Service-provider bulk actions

**Date:** 2026-06-03
**Scope:** `src/app/api/service-provider/evaluators/route.js`, `src/app/service-provider/dashboard/page.jsx`, tests.

## Goal

Add multi-select bulk versions of the SP admin's repetitive per-row actions:
approve pending hours, dismiss flags, approve evaluators, suspend evaluators, and
delete evaluators — the last gated by a typed confirmation because it is
destructive. Reuse the `id = ANY(...)` bulk pattern already shipped for join
requests; preserve `getSession` + `resolveSpOrgId` org-scoped auth.

## API (`evaluators/route.js` POST)

Each targeted action accepts **either** its existing single id **or** an array
(back-compat preserved). `asArray(body.x_ids, single)` normalizes; empty → 400.

- `approve_hours` — `hours_ids[]` → `UPDATE evaluator_hours SET status='approved', approved_by, approved_at WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`. **Adds org scope** (single version lacked it — hardening). Returns `{success, count}`.
- `dismiss_flag` — `flag_ids[]` → `UPDATE evaluator_flags SET reviewed... WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`. Adds org scope. Returns `{success, count}`.
- `approve` — `evaluator_ids[]` → membership `UPDATE ... WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}`, then one `audit_log` insert per id. Returns `{success, count}`.
- `suspend` — `evaluator_ids[]` → membership suspend `WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}` + session-signup suspend `WHERE user_id = ANY(${ids}) AND status='signed_up' AND future`, then audit per id. Returns `{success, count}`.
- `delete_account` — `evaluator_ids[]` → **loop per id**, preserving the existing
  per-id history guard: an evaluator WITH session history is **skipped** (not an
  error that aborts the batch); others run the existing membership/auth/user
  delete cascade. Returns `{success, deleted, skipped}`.
- `rate_evaluator`, `reinstate` — unchanged (not in bulk scope).

Auth (unchanged, must be preserved): `getSession` → 401; `resolveSpOrgId(session, ?org)`
→ 403 if not an SP admin; admin id looked up for audit/approval stamps.

## UI (`dashboard/page.jsx`)

- **Pending hours table** + **flags section** + **evaluators table** each get a
  per-row checkbox and a "select all" toggle, with selection state per list.
- A bulk action bar appears when ≥1 is selected:
  - Hours: "Approve selected (N)".
  - Flags: "Dismiss selected (N)".
  - Evaluators: "Approve (N)", "Suspend (N)" (normal confirm), "Delete (N)"
    (opens a **typed-confirm modal**: the admin must type `DELETE` to proceed;
    the modal states evaluators with session history will be skipped).
- On success: clear that list's selection, refetch, show a count toast/message.
- Per-row buttons remain for single actions.

## Testing

- **API (TDD):** mock `getSession` + `resolveSpOrgId` + `sql`. Cover: 403 when not
  an SP admin; `approve_hours` bulk runs `ANY` + returns count; `approve_hours`
  single back-compat; `dismiss_flag` bulk; `approve` bulk (membership `ANY`);
  `suspend` bulk (two `ANY` updates); `delete_account` bulk skips an evaluator
  with history (`{deleted:1, skipped:1}`).
- **UI:** build-verified (`npm run build`) + full suite green; no component test
  harness — stated plainly.

## Risks

- **Destructive bulk delete.** Mitigated by: per-id history guard (skips evaluators
  with session history, matching current single behavior), typed-`DELETE` confirm,
  and a skipped-count in the response. Still irreversible for eligible accounts —
  the typed confirm is the guard.
- Adding org-scope to `approve_hours`/`dismiss_flag` changes the single-action SQL
  slightly; legitimate calls are unaffected (rows belong to `sp_id`). Covered by
  tests asserting the scoped query.
- Bulk audit/delete loop = N queries; fine for admin-scale batches.
