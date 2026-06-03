# Self-serve signup (God-approved)

**Date:** 2026-06-03
**Ship:** PR (new PUBLIC surface + a DB migration). Needs the migration applied before live.
**Scope:** new migration `migrations/2026-06-signup-requests.sql`; public `src/app/account/signup/page.jsx` + `src/app/api/auth/signup-request/route.js`; God-Mode review (`src/app/api/admin/god-mode/signup-requests/route.js` + a UI tab); tests.

## Why
An independent association (not an existing SP client) can request an account
themselves. The request is **reviewed/approved in God Mode by the super admin**
(per owner decision). On approval, their association org + an admin account are
provisioned. (SP-client associations are handled by the SP via the leads/links flow,
not here.)

## Migration (the one Neon change)
`migrations/2026-06-signup-requests.sql`:
```sql
CREATE TABLE IF NOT EXISTS signup_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_name text NOT NULL,
  contact_name  text,
  email         text NOT NULL,
  phone         text,
  message       text,
  status        text NOT NULL DEFAULT 'pending',   -- pending | approved | denied
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_requests_status_idx ON signup_requests(status);
```
Additive, safe. Must be applied to Neon before the feature works in prod.

## Public submit — `POST /api/auth/signup-request`
- Public (add to middleware PUBLIC_PATHS). Rate-limited via `src/lib/rateLimit.js`
  (`checkAndRecord({ endpoint: "signup_request", identifier: ip, max: 5, windowMins: 60 })`)
  → 429 if exceeded.
- Body `{ association_name, contact_name, email, phone?, message? }`; validate
  association_name + email (basic email shape); 400 otherwise.
- Insert a `signup_requests` row (status 'pending'). Return `{ success: true }`.
- Do NOT reveal whether the email already exists (anti-enumeration).
- Public page `src/app/account/signup/page.jsx`: simple form posting to it, with a
  "request received — we'll review and email you" success state. Link to it from the
  signin page ("New association? Request an account").

## God-Mode review — `/api/admin/god-mode/signup-requests`
`requireSuperAdmin`-gated (like other god-mode routes).
- **GET** → list requests (filter by status, default pending).
- **POST** `{ id, action: "approve" | "deny" }`:
  - **deny:** set status='denied', reviewed_by/at.
  - **approve:** create the association org (`organizations`, type association,
    name=association_name, contact_email=email) + an admin user (reuse the god-mode
    user-creation pattern: auth_users + auth_accounts temp password + users row
    role='association_admin', email credentials). Because the org's
    contact_email == the user's email, `authorizeOrgAccess` grants them admin access
    (no user_organization_roles row needed). Set status='approved', reviewed_by/at.
    Idempotency: if already approved, no-op.
- A God-Mode UI tab "Signup Requests" (in the existing TabNavigation/tabs): pending
  list with Approve/Deny buttons; reuse existing god-mode styling + react-query.

## Testing
- **signup-request POST (TDD):** mock db + rateLimit. 400 on missing fields; 429 when
  rate-limited; happy path inserts a pending row + returns success.
- **god-mode approve (TDD):** mock requireSuperAdmin + db. 403 when not super admin;
  approve creates org + user + marks approved (assert the org/user inserts fire +
  status update); deny just updates status.
- UI build-verified.

## Risks
- **Migration must be applied** or the endpoints 500. Stated; applied at merge time.
- Public endpoint = spam target → rate-limited + minimal work (single insert).
- Approval provisions real org+admin → super-admin-only, audited via reviewed_by.
