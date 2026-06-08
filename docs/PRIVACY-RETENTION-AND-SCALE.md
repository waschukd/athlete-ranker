# Privacy, Retention & Scale — Plan

Status of the data-lifecycle and scaling items. Two are addressed; the deletion
feature is **designed but intentionally not built yet** (it's destructive and was
queued while you were away — needs your sign-off first).

---

## 1. Report-link expiry — ✅ DONE
Public parent report links (`/report/[token]`) expire after **90 days**, derived
from the link's `created_at` (no migration needed). Expired links return HTTP 410.
Tune per environment with `REPORT_TOKEN_TTL_DAYS`. Links are also `is_active`-gated
and IP-rate-limited (60/hr) against token guessing. *(src/app/api/report/[token]/route.js)*

---

## 2. Self-service data deletion — 🟡 DESIGNED, NOT BUILT
This is destructive + privacy-sensitive, so here's the plan to approve rather than a
silent deploy.

**Who can delete what**
- **Association admin:** delete an age category (already exists — cascades athletes,
  scores, sessions, schedule, groups; behind the type-the-name confirm). Add:
  delete the whole association's data on request.
- **Parent/athlete request:** a "request my child's data be removed" path → routes to
  the association admin to action (we don't expose direct public delete).
- **God Mode:** delete an org (exists; now type-the-org-name confirmed).

**How (recommended)**
- **Soft-delete + purge window:** mark records `deleted_at` and exclude everywhere;
  a scheduled purge (cron) hard-deletes after N days. Gives an undo window and matches
  how schedule soft-cancel already works.
- **Hard delete** stays available for God Mode (full cascade already written in
  `DELETE /api/organizations`).
- Every deletion writes an **audit_log** row (who/when/what).
- All destructive UI uses the existing **ConfirmDialog** with type-to-confirm.

**Build estimate:** ~1 migration (`deleted_at` columns or a `deletion_requests`
table) + a request route + admin action UI + a purge cron. Medium. **Hold for
approval** — say go and I'll stage it on a branch with the migration.

**Privacy policy:** the public `/privacy` page should state retention (reports 90d,
deletion-on-request, purge window) once the above ships.

---

## 3. Scale / plan upgrade — recommendations
Current: Vercel **Hobby** + Neon (serverless). Fine for pilot load; here's when/what
to upgrade.

**Vercel Pro (~$20/seat/mo)** — worth it soon because:
- **Branch/preview deployments** — the single biggest workflow win. Right now nothing
  builds on a branch, so the only way to see a change is merging to `main` (live).
  Pro gives every branch a preview URL → review before production. (This is why this
  whole project has shipped straight to `main`.)
- Higher function concurrency + longer timeouts; better analytics; password-protected
  previews.
- **Trigger:** before you onboard real paying associations / want a staging review step.

**Neon** — the serverless tier autoscales, but watch:
- **Connection limits** under many concurrent evaluators scoring live. Use a pooled
  connection string (`-pooler` host) for the app if not already.
- **Point-in-time restore / backups** — confirm retention is set; bump the plan for
  longer PITR before real data lands.
- **Trigger:** sustained concurrent sessions, or once athlete/score volume crosses a
  few hundred thousand rows.

**Email (Resend)** — confirm domain verification + consider a paid tier once volume
grows (you're sending invites, schedule changes, staffing alerts, parent comms).

**Rough capacity read:** the heavy real-time path is live scoring. It's offline-first
(localStorage + debounced sync), so a dropped/slow DB doesn't block evaluators. The
main scale lever is DB connections during simultaneous sessions — pooling + Neon
autoscale handles the realistic range (tens of concurrent sessions) comfortably.
