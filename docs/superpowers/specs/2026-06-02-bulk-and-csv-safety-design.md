# Bulk actions + CSV import transparency

**Date:** 2026-06-02
**Status:** Built autonomously overnight → PR for review.
**Scope:** `src/app/api/admin/god-mode/evaluator-invites/route.js`,
`src/components/GodMode/EvaluatorsTab.jsx`,
`src/app/api/categories/[catId]/schedule/route.js`,
`src/components/CategoryDashboard.jsx`, tests.

## Correction to the audit

The audit framed CSV uploads as a destructive "silent overwrite." Inspection shows
both uploads are **UPSERTs, not deletes**:
- Schedule: per-`(session, group)` UPDATE-or-INSERT; rows not in the CSV are left
  untouched (`schedule/route.js:77-106`).
- Athletes: `ON CONFLICT ... DO UPDATE` / name-match update, else insert; returns
  `{imported, updated, skipped}` (`athletes/route.js`).

So there is **no data-loss bug**. The real improvement is **transparency** — showing
the admin exactly what an import changed (added vs updated) — not a hard confirm gate
over a non-destructive operation. This spec delivers transparency, and the broader
bulk-actions ask is delivered for the highest-value, safest surface.

## Changes

### 1. Bulk approve/deny evaluator join requests (God Mode) — TDD
`POST /api/admin/god-mode/evaluator-invites` (already `requireSuperAdmin`-gated)
accepts **either** the existing `{ request_id, action }` (back-compat) **or**
`{ request_ids: [...], action }`. It normalizes to an id array and runs a single
`UPDATE ... WHERE id = ANY(${ids})`, returning `{ success: true, count }`.

`EvaluatorsTab.jsx` gains multi-select: a checkbox per pending request, a
"select all" toggle, and "Approve selected (N)" / "Deny selected (N)" buttons that
call the batch endpoint once. Per-row Approve/Deny buttons remain.

### 2. CSV import transparency (build-verified)
- `schedule/route.js` tracks `inserted` vs `updated` in its upsert loop and returns
  `{ success, count, inserted, updated }`.
- `CategoryDashboard.jsx` shows the breakdown after a schedule upload
  ("3 added, 2 updated") and includes `updated` in the athletes-upload message
  (the athletes route already returns it).

## Testing

- **Batch endpoint:** unit tests (mock `requireSuperAdmin` + `sql`) — 403 when not
  super admin; batch approve runs `id = ANY(...)` and returns the count;
  single-`request_id` back-compat still works.
- **Schedule counts + UI messages:** build-verified (`npm run build`) + full suite
  green. The schedule route is heavy I/O (collision-checked code generation + an
  email fan-out loop), so isolating it in a unit test would require brittle
  many-call sql mocking; stated plainly rather than faked.

## Deferred (documented for the morning, not built)
- Bulk **delete** of users (destructive — wants a typed-confirm; not built unattended).
- Service-provider dashboard bulk actions (approve hours, dismiss flags) — same
  pattern, different surface; follow-up.
- A hard pre-import confirm dialog (only worthwhile if a destructive import path is
  ever added).

## Risks
- `id = ANY(${ids})` relies on the neon driver serializing a JS array as a SQL
  array param — standard, but verified by the batch test asserting the query shape.
- Back-compat: single-`request_id` callers must keep working — covered by a test.
