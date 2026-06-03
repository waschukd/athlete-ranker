# Association Leads (scoped SP delegation)

**Date:** 2026-06-03
**Ship:** PR (new permissions surface — owner review before live).
**Scope:** new `src/app/api/service-provider/leads/route.js`; `src/app/service-provider/dashboard/page.jsx` (Leads UI); `src/app/association/dashboard/page.jsx` (club switcher); tests.

## Why / model

A service provider serves 9 associations and wants to delegate management of a
**subset** to a trusted "lead." A lead gets full **association-admin** control over
only their assigned clubs (staff, roster, schedule, scoring, teams) and sees nothing
about the SP's other clients. One lead can cover multiple clubs.

**Key finding (from audit):** authorization is already handled by
`user_organization_roles`. A row `(user_id, organization_id, role='association_admin')`
grants a user full scoped access to exactly that org (`authorize.js`
`authorizeOrgAccess`/`authorizeCategoryAccess`/`getAccessibleOrgIds`), and middleware
already lets `association_admin` into `/association/dashboard`. So **a lead is just an
`association_admin` whose scope = the `user_organization_roles` rows we create.** No
new role, no middleware/authorize changes.

## Build

### 1. Assign-lead API — `src/app/api/service-provider/leads/route.js`
Gated like other SP routes: `getSession` + `resolveSpOrgId(session, ?org)` → the
caller's SP org id `sp_id` (403 if not an SP admin).
- **GET** → list current leads for this SP: users who have `user_organization_roles`
  rows on associations linked to this SP, with which associations each covers.
- **POST** `{ email, name, association_ids: [...] }`:
  - **Security (critical):** every `association_id` MUST be linked to `sp_id` via
    `sp_association_links` (active). Reject the whole request (403) if any isn't.
  - Find-or-create the user by email (reuse the existing user-creation pattern from
    the God-Mode users POST / invite-admin — create `auth_users` + `auth_accounts`
    with a temp password, `users` row with `role='association_admin'`, email them
    credentials). If the user already exists, do NOT downgrade/clobber a higher role
    (super_admin/service_provider_admin) — just add the org rows; if they're a lower
    role (evaluator) set `users.role='association_admin'` so they can reach the
    dashboard (document this).
  - Insert `user_organization_roles(user_id, organization_id, role='association_admin')`
    for each association `ON CONFLICT DO NOTHING`.
  - Return `{ success, count }`.
- **DELETE** `?user_id=&association_id=` → remove that lead's row for that association
  (only if the association is linked to `sp_id`). Removes their access to that club.

### 2. SP dashboard — Leads UI (`service-provider/dashboard/page.jsx`)
A "Leads" section/tab: a form (email + name + multi-select of the SP's linked
associations) → POST; a list of current leads showing which clubs each covers, with
a per-club "remove" control. Reuse existing dashboard styling + the SP's association
list it already fetches.

### 3. Association dashboard — club switcher (`association/dashboard/page.jsx`)
Today the dashboard shows one club via `?org=` with no picker. Add a small "switch
club" dropdown shown when the signed-in user has access to **more than one** org
(fetch their accessible orgs — reuse `/api/organizations` which already filters by
`getAccessibleOrgIds`, or a tiny endpoint). Selecting one navigates to
`?org=<id>`. Single-org admins see no picker (unchanged). This lets a multi-club lead
move between their clubs.

## Testing
- **API (TDD):** mock sql/getSession/resolveSpOrgId. Cover: 403 when not SP admin;
  POST rejects (403) if any association_id is NOT linked to the SP (no writes);
  happy path inserts user_organization_roles for linked associations + returns count;
  DELETE only removes for an SP-linked association. (The security check is the
  highest-value test.)
- **UI + switcher:** build-verified.

## Risks / notes
- **Single global `users.role` column.** JWT role is a coarse hint; `user_organization_roles`
  is the real scope. A lead's JWT says `association_admin` (global-ish), but every
  data route re-checks org access via authorize.js, so they can't reach other orgs.
  Documented; do not treat JWT role as sufficient.
- Don't let an SP assign a lead to a club they don't own — enforced by the
  `sp_association_links` check (tested).
- Reuses existing user-creation/email; no new invite-token system.
