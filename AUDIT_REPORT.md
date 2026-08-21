# SidelineStar — Full Codebase Audit

Read-only audit. Next.js 14.2.35 (App Router), Neon Postgres (`@neondatabase/serverless`), Vercel. JWT session cookie (`jose`), Stripe payments, Resend email. Findings below are evidence-based — every claim cites `file:line` and, where practical, quotes the code. Anything the audit could not confirm statically is marked **unverified**.

---

## 1. Executive Summary

The worst finding: a service-provider admin can permanently delete **any** user account on the platform — including admins and evaluators in organizations they don't run — because one action in `service-provider/evaluators/route.js` skips the tenant-scope check every sibling action in the same file has. Close behind: an authenticated evaluator can pull another organization's session roster by supplying an arbitrary `schedule_id` to `evaluator/scores` (a cross-tenant IDOR), and roughly ten `categories/[catId]/*` write endpoints check tenant membership but not role, letting any evaluator wipe teams, hard-delete sessions, or mass-email arbitrary addresses. Separately, real production secrets (`DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`) were committed to git history in the initial commit and are still recoverable by anyone with repo access — rotation is unverified. The paid ($35) parent report's API also leaks the athlete's percentile/rank to unauthenticated token holders even before payment, contradicting the product's own design (the paid report UI never shows this number). On the positive side: the authorization core (`lib/authorize.js`, `lib/auth.js`), session/cookie handling, password reset, Stripe/Resend webhook signature verification, and SQL parameterization are all solid and consistently applied across the large majority of the app's 124 API routes. Efficiency-wise, ranking/statistics math is recomputed from scratch on every request with no caching and duplicated in 4+ places outside its canonical source — the same bug class that caused a documented past percentile incident. Dependencies carry 1 critical + 8 high `npm audit` findings, including an outdated Next.js. None of this reflects a fundamentally broken system — it reflects a well-architected app with a handful of specific gaps that should be closed before calling it hardened.

---

## 2. Dashboard-by-Dashboard Summary

**Admin / God Mode** (`/admin/god-mode`, super_admin only) — Platform-wide console: manage every organization, user, signup request, SP↔association link, and system tooling. Every handler under `api/admin/god-mode/*` independently calls `requireSuperAdmin()` server-side, not just relying on the middleware's path-prefix gate. Data flows straight from Postgres with no tenant filter (by design — it's global). Biggest weakness: `POST /api/admin/god-mode/users` inserts an unvalidated `role` string with no enum check — low risk since it's super-admin-only, but a typo silently creates an unrecognized role.

**Association Dashboard** (`/association/dashboard`, association_admin/SP admins) — An association's home base: categories, schedule, roster import, director invites, messaging. Data is scoped through `authorizeOrgAccess`/`authorizeCategoryAccess` against the session's org. Biggest weakness: `CategoryDashboard.jsx` (2235 lines) bundles 8 tabs, CSV export, and ranking-insight math into one component, and several of its underlying category-write APIs (teams, schedule hard-delete, notify-volunteers, anchors, flags, consensus close-session, groups) only check tenant membership, not role — so an evaluator with access to the category can trigger admin-level destructive actions.

**Director Dashboard** (`/director/dashboard`, director role) — A director's assigned categories only, reusing the shared `CategoryDashboard` component. Access to any category is checked per-category via `director_assignments`. Biggest weakness: shares the same missing-role-check surface as the association dashboard (directors and evaluators end up with overlapping write capability on category-management actions that should be director/admin-only vs. evaluator-only).

**Evaluator Dashboard** (`/evaluator/dashboard`, `/evaluator/score/[scheduleId]`) — Signup, availability, pay, and the live scoring UI. Session/pay/availability data is always scoped to `session.email`-derived `user_id` — an evaluator cannot see another evaluator's pay or availability. Biggest weakness: the live-scoring page (2051 lines) mixes offline sync, audio feedback, and three view modes into one component; and the scoring API's legacy GET branch has the cross-tenant roster IDOR described above. Score values submitted here also skip the range validation the admin-correction path enforces.

**Tester Dashboard** (`/tester/dashboard`) — Session signup and hours logging for SP testers. All writes verified against `tester_session_signups`/`testerOrgIds` before being recorded. Clean — no findings.

**Service Provider Dashboard** (`/service-provider/dashboard`, SP admins) — The largest and most complex portal (2695 lines, largest file in the repo): client associations, evaluator/tester management, payroll, bonus config, reports, messaging. Every route resolves the caller's actual SP org via `resolveSpOrgId`/`resolveSpContext` before scoping queries — except the one `delete_account` action, which is the audit's most severe finding.

**Goalie Provider Dashboard** (`/goalie-provider/dashboard`) — A parallel, position-scoped SP portal for goalie evaluation, kept isolated from skater SP data via `organizations.type='goalie_service_provider'`. Consistently well-guarded (`resolveGoalieSpOrgId`, org-code-based connect flow). Clean — no findings.

**Player / Report (parent-facing)** (`/player/report`, `/report/[token]`, `/coach-report/[token]`) — Parents have no account; access is via an opaque token, gated behind a Stripe-verified `report_purchases` row before returning the full report body. Biggest weakness: the API response includes the athlete's percentile/tier/rank-band object regardless of payment status, even though the paid UI itself never renders it — and the coach-report token flow is actually broken in production because its paths were never added to the middleware's public-path allowlist, so real (account-less) coach recipients get redirected to a login page instead of their report.

**Check-in** (`/checkin`, volunteer/rink-side) — Public, code-based (6-char, ~1.3B keyspace) or staff-session entry point for marking athletes present. Rate-limited, athlete edits explicitly re-verified against the category. Clean — no findings.

---

## 3. Access Control Matrix

`SA`=super_admin · `AA`=association_admin · `DIR`=director · `SPA`=service_provider_admin · `GSA`=goalie_service_provider_admin · `AE`=association_evaluator · `SE`=service_provider_evaluator · `ST`=service_provider_tester · `VOL`=volunteer (checkin token) · `PAR`=parent (report token). **A** = allowed & server-verified · **D** = correctly denied · **BROKEN** = missing/insufficient server-side check.

### Auth / Account
| Endpoint | SA | AA | DIR | SPA | GSA | AE/SE | ST | Server check |
|---|---|---|---|---|---|---|---|---|
| `POST /api/auth/login` | A | A | A | A | A | A | A | rate-limited, bcrypt, DB-resolved role |
| `POST /api/auth/switch-role` | A | A | A | A | A | A | A | validated against `getUserRoles()` — cannot escalate |
| `PATCH /api/auth/me` | self | self | self | self | self | self | self | scoped `WHERE email=session.email` |
| `POST /api/auth/forgot-password`, `reset-password` | public | — | rate-limited, no-enumeration, token TTL |

### Admin / God Mode (`/api/admin/god-mode/*`)
| Endpoint | SA | everyone else |
|---|---|---|
| analytics, evaluator-invites, sessions, signup-requests, sp-links, system-tools, users (GET/POST/PATCH/DELETE) | A (`requireSuperAdmin()`) | **D** (403, verified server-side on every handler) |

### Organizations (`/api/organizations/*`)
| Action | SA | AA (own org) | SPA/GSA (own org) | DIR/AE/SE | Notes |
|---|---|---|---|---|---|
| `GET /api/organizations` | A | A (filtered) | A (filtered) | A (filtered) | `getAccessibleOrgIds` |
| `POST /api/organizations` (create) | A (any type) | D | **A — but not restricted to `type=association`** | D | scope-creep finding |
| `GET/PUT /[orgId]` | A | A | A (if linked) | read-only via membership | `authorizeOrgAccess` |
| `DELETE /[orgId]` | A | D | D | D | explicit `role!=="super_admin"` check |
| `/[orgId]/admins`, `/join-codes`, `/leads`, `/logo`, `/schedule`, `/age-categories*` | A | A (own org) | A (if linked) | scoped read | all IDOR-guarded (row re-checked against `orgId`) |

### Categories (`/api/categories/[catId]/*`) — 26 routes
| Action | Tenant check (`authorizeCategoryAccess`) | Role check present? |
|---|---|---|
| athletes, cut, evaluators, setup, scores (admin), export, audit, coaches-report, compare-analysis, coach-briefing | ✅ | ✅ role allow-list |
| **anchors** (approve/calibration), **flags** (acknowledge/detect), **consensus** (close_session), **contention** (roster targets), **groups** (all mutations), **schedule** (POST/PATCH/DELETE incl. hard-delete), **teams** (generate/clear/notify), **notify-parents**, **notify-volunteers**, **group-emails**, **send-reports**, **invite-director** (DELETE only) | ✅ | **BROKEN — no role check; any category-authorized evaluator can perform these admin/director-level actions** |
| rankings, checkin-summary, athletes (GET) | ✅ | n/a (read-only) |

No cross-tenant `catId` IDOR was found anywhere in this cluster — the systemic gap is role granularity within an already-authorized tenant, not tenant isolation itself.

### Evaluator / Tester / Director / Checkin
| Endpoint | Self-scoped? | Notes |
|---|---|---|
| availability, calendar-link, calibration, close-session, invite, kind, pay, signup, session-floor, sessions, status | ✅ | `user_id` always derived from session, never trusted from client |
| `evaluator/scores` GET (`hydrate=1`) | ✅ | clean |
| `evaluator/scores` GET (legacy, no `hydrate`) | ❌ | **BROKEN — `schedule_id` not bound to authorized `catId` (IDOR)** |
| `evaluator/scores` POST | ✅ | writes IDOR-safe, but score values unvalidated |
| `evaluator/join`, `register` (GET) | n/a (public/code-based) | **no rate limiting** |
| `checkin/[scheduleId]`, `checkin/entry` | ✅ | dual auth (staff session or signed token), rate-limited |
| calendar `.ics` feeds (evaluator/tester/SP/association/session) | n/a (HMAC token) | namespaced, `timingSafeEqual`, sound |

### Service Provider / Goalie Provider
| Endpoint | Tenant resolution | Notes |
|---|---|---|
| associations, bonus-config/summary, calendar, evaluator/[evalId] (read), evaluators (GET/most POST actions), leads, notify, payroll, reports, schedule, testers, testing-events | `resolveSpOrgId`/`resolveGoalieSpOrgId`/`resolveSpContext`/`canViewEvaluator` | all scoped correctly |
| `evaluators` POST `delete_account` | **none** | **BROKEN — CRITICAL, see Finding C-1** |
| `goalie-connect`, `goalie-provider/invite-association`, `/associations` (connect) | email/org-code + `authorizeOrgAccess` | correctly prevents hijacking an unrelated association |

### Payments / Reports / Webhooks
| Endpoint | Auth model | Verdict |
|---|---|---|
| `payments/create-checkout` | token-based, server-resolved pricing | clean |
| `payments/webhook` | Stripe signature (`constructEvent`) | clean, fails closed |
| `webhooks/resend` | Svix HMAC, `timingSafeEqual` | clean, fails closed in prod |
| `cron` | `Authorization` header + `timingSafeEqual` | clean, fails closed |
| `report/[token]` | token + `report_purchases` gate | payment gate itself is correct; **payload leaks `standing` regardless of purchase — see Finding H-2** |
| `coach-report/[token]` | HMAC token | payload clean, but **unreachable in prod — missing from `PUBLIC_PATHS`, Finding M-1** |
| `athletes/[athleteId]/report`, `/scouting` | session + `authorizeCategoryAccess` + row-level `athlete_id`/`catId` match | clean |

---

## 4. Findings

### CRITICAL

**C-1. Cross-tenant account deletion — any SP admin can delete any user platform-wide.**
`src/app/api/service-provider/evaluators/route.js:158-175`, action `delete_account`.
```js
if (action === "delete_account") {
  const ids = asArray(body.evaluator_ids, evaluator_id);
  for (const id of ids) {
    const hasHistory = await sql`SELECT COUNT(*) as count FROM evaluator_session_signups WHERE user_id = ${id}`;
    if (parseInt(hasHistory[0].count) > 0) { skipped.push(id); continue; }
    await sql`DELETE FROM evaluator_memberships WHERE user_id = ${id}`;
    const authUser = await sql`SELECT id FROM auth_users WHERE email = (SELECT email FROM users WHERE id = ${id})`;
    if (authUser.length) {
      await sql`DELETE FROM auth_accounts WHERE "userId" = ${authUser[0].id}`;
      await sql`DELETE FROM auth_users WHERE id = ${authUser[0].id}`;
    }
    await sql`DELETE FROM users WHERE id = ${id}`;
  }
```
Every sibling action in this same file (`approve`, `suspend`, `rate_evaluator`, `set_rate`, `mark_paid`, `dismiss_flag`) filters by `organization_id = sp_id` or checks `evaluator_memberships` first. `delete_account` does neither — the only gate is "no session-signup history." **Impact:** a `service_provider_admin` or `goalie_service_provider_admin` can pass any `users.id` on the platform — another SP's evaluator, an association admin, an unrelated account — and permanently delete their membership, credentials, and user row. **Fix:** add the same `organization_id = sp_id` / membership check every other action in this file already has, before the delete loop.

**C-2. Cross-tenant IDOR — evaluator can read another organization's session roster.**
`src/app/api/evaluator/scores/route.js` (legacy GET branch, no `hydrate=1`). `authorizeCategoryAccess(session, catId)` (L30-31) only checks access to `catId`; the query then does `FROM player_checkins pc ... WHERE pc.schedule_id = ${scheduleId}` (L112) with `scheduleId` taken straight from the query string and never verified to belong to `catId`. The route's own comment acknowledges the roster-leak risk was flagged before but only half-fixed (the `catId` check was added, the `schedule_id`↔`catId` binding was not). **Impact:** any authenticated evaluator can pass an arbitrary `schedule_id` and receive another organization's checked-in roster (names, jersey numbers, positions). The current frontend never calls this branch, but it remains live and directly reachable. **Fix:** add `AND sch.age_category_id = ${catId}` (mirror the check the POST handler already performs at L175-176).

### HIGH

**H-1. Missing role check on ~10 category-management write endpoints — any evaluator can perform admin/director actions.**
Representative examples (all use the identical pattern — `authorizeCategoryAccess` only, no role-set check):
- `src/app/api/categories/[catId]/teams/route.js:80` — team wipe/regenerate, mass parent/coach email
- `src/app/api/categories/[catId]/schedule/route.js:293-301` — `DELETE ?hard=1`, permanently deletes a session + all sign-ups/check-ins
- `src/app/api/categories/[catId]/anchors/route.js:116-132` — approve/toggle score-calibration corrections affecting the whole category
- `src/app/api/categories/[catId]/flags/route.js:39` — acknowledge/dismiss integrity flags, including ones raised against the caller's own scoring
- `src/app/api/categories/[catId]/consensus/route.js:170-184` — `close_session`, generates integrity flags against peer evaluators
- `src/app/api/categories/[catId]/groups/route.js:103` — auto-assign/lock/unlock groups mid-event
- `src/app/api/categories/[catId]/invite-director/route.js:156-168` (DELETE) — inconsistent with its own POST, which does have `DIRECTOR_INVITE_ROLES`
- `notify-volunteers/route.js:7-14`, `notify-parents/route.js:9`, `group-emails/route.js:139`, `send-reports/route.js:36` — mass communications, no role gate
- `contention/route.js:43-50` — overwrite roster targets feeding cut logic

**Impact:** within their own authorized category, any evaluator can destroy schedule/team data, approve calibration changes, dismiss integrity flags about themselves, or trigger mass email/SMS-equivalent blasts — actions that should require director or admin authority. `notify-volunteers` is the sharpest edge: it accepts a client-supplied `emails` array with **no check that the addresses belong to this category's staff at all**, making it a generic mail relay for anyone who is merely an authorized evaluator.
**Fix:** add the same role-allow-list pattern already used correctly elsewhere in these same files (e.g., `MANAGE_ROLES`, `SETUP_ROLES`, `DIRECTOR_INVITE_ROLES`) before or alongside the `authorizeCategoryAccess` call.

**H-2. Parent report API leaks percentile/rank data regardless of payment.**
`src/app/api/report/[token]/route.js:75-129`. The `base` object — including `standing: report.standing` (`{percentile, tier, band, total}` from `src/lib/reportData.js:70-82`) — is spread into **both** the purchased and unpurchased response branches. `src/components/DevelopmentReport.jsx`, the actual paid-report UI, never renders `.percentile`/`.tier`/`.band` (verified: zero property accesses) and states outright *"The point of this report isn't a ranking."* `reportData.js`'s own comment says `standing` is *"not currently rendered in the paid parent report itself."* **Impact:** anyone holding a report token (or calling the API directly instead of using the UI) can retrieve the child's exact percentile/rank band without paying — a design-intent violation and effective bypass of the one thing the product deliberately hides from parents. **Fix:** strip `standing` from the API response (or reduce to a boolean) unless it's genuinely meant to be public.

**H-3. Real secrets committed to git history, still recoverable.**
Commit `8e64602` ("Initial deploy") tracked `.env.local` containing `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`. Commit `9ee416e` later untracked the file, but **history was not rewritten** — `git log --all` still shows `8e64602` reachable, and `git show 8e64602:.env.local` still resolves to the original blob. **Impact:** anyone with clone access to the repo can recover these four secret *values* (not just names) from that historical revision. If unrotated, this is full compromise: direct DB access, forged session tokens, ability to send email as the org, and ability to trigger cron-protected endpoints. **Unverified:** whether these specific values have since been rotated in production — recommend confirming immediately, and rotating regardless as defense-in-depth. Rewriting git history is a secondary option once rotation is confirmed.

**H-4. Coach report feature is unreachable by its actual (account-less) recipients.**
`src/middleware.js` `PUBLIC_PATHS` lists `/report` and `/api/report` but omits `/coach-report` and `/api/coach-report`, even though coaches (emailed a link at `src/app/api/categories/[catId]/teams/route.js:279`) have no account. Middleware redirects the page to `/account/signin` and 401s the API before the route's own token verification ever runs. Fails closed (no leak), but the feature is fully broken for its intended audience. **Fix:** add `/coach-report` and `/api/coach-report` to `PUBLIC_PATHS`.

**H-5. Dependency risk — 1 critical, 8 high `npm audit` findings.**
`npm audit` (16 vulnerabilities total): `tar` (critical, transitive) — PAX header parsing/file-smuggling/DoS; `next` (high, **direct dependency**, `^14.2.35`) — advisory range covers SSRF via rewrites/Server Actions, HTTP request smuggling, cache poisoning, unauthenticated disclosure of internal Server Function endpoints; `postcss` (high, direct) — XSS via unescaped stringify output, arbitrary `.map` file read; plus `@xmldom/xmldom`, `undici`, `fast-uri`, `brace-expansion`, `vite`, `nanoid` (all high, transitive). Note: the specific middleware-bypass CVE-2025-29927 is patched as of 14.2.25, so 14.2.35 is clean on *that* CVE specifically — but the broader advisory list still applies. **Fix:** `npm audit fix` for transitive packages; schedule a Next.js/postcss version bump.

### MEDIUM

**M-1. No rate limiting on evaluator join-code redemption.**
`src/app/api/evaluator/join/route.js` (POST) and `src/app/api/evaluator/register/route.js` (GET) have no `checkAndRecord` call, unlike sibling `evaluator/register` POST (30/hr) and `checkin/entry` (60/min). **Impact:** an authenticated user can script-guess join codes with no throttle; bounded impact since matches land as `pending` and need admin approval, but inconsistent with the pattern used everywhere else. **Fix:** add `checkAndRecord` to both.

**M-2. Evaluator score submissions skip value validation.**
`src/app/api/evaluator/scores/route.js` (POST) inserts `score` with no `parseFloat`/`isNaN`/range check, while the admin-correction path (`src/app/api/categories/[catId]/scores/route.js` PATCH) does perform this check on the same data. **Fix:** apply the same validation to the primary write path.

**M-3. Non-super-admin roles can create arbitrary top-level organizations.**
`src/app/api/organizations/route.js:51-62` — role gate permits `service_provider_admin`/`goalie_service_provider_admin`, but the `type` field isn't restricted to `association` for those callers, so an SP admin can mint a new unrelated `service_provider`/`goalie_service_provider` org with an arbitrary `contact_email`. **Fix:** restrict non-super-admin callers to `type === "association"`.

**M-4. `/prototype/voice-scoring` is public and unauthenticated in production.**
`src/middleware.js:39` lists `/prototype` in `PUBLIC_PATHS`. The page loads a CDN-hosted Whisper-WASM model and requests microphone access with zero authentication. **Fix:** remove from `PUBLIC_PATHS` (gate by role) or delete if validation is complete.

**M-5. Ranking math independently reimplemented outside `lib/rankings.js`, including a live-scoring path that bypasses it entirely.**
`src/app/api/categories/[catId]/groups/route.js:133-179` (`auto_assign`) recomputes weighted rank from raw SQL instead of calling `computeCategoryRankings`; also reimplemented in `src/lib/reportData.js:74`, `src/app/api/categories/[catId]/flags/route.js:111,128-154`, `src/app/player/report/page.jsx:219-221`, and `src/app/association/dashboard/category/[catId]/groups/page.jsx:490-521`. This is the same bug class the project's own `rankings-source-of-truth` convention exists to prevent (a documented past 100th-percentile incident traced to exactly this pattern). **Fix:** point `auto_assign` and the other reimplementations at `computeCategoryRankings`/`lib/scoring.js`.

### LOW

**L-1.** `src/app/api/categories/[catId]/setup/route.js` — `for (const sess of data.sessions)` with no `Array.isArray` guard; malformed input throws to a generic 500 instead of a clean 400.
**L-2.** `src/app/api/admin/god-mode/users/route.js:147-151` — `role` inserted with no allow-list check (super-admin-only, low impact).
**L-3.** `src/app/api/organizations/[orgId]/route.js:47-60` — `contact_email` editable by any authorized co-admin (via `user_organization_roles`), not just the original owner; can silently redirect ownership-signal email.
**L-4.** `src/app/api/templates/route.js` — no `getSession()` call at all; currently harmless (returns static fixture CSV, and middleware blocks unauthenticated access by default anyway) but deviates from the "every route self-authorizes" convention.
**L-5.** `src/app/email-preview/parent-report/route.js` — no `ROLE_ROUTES` entry, so any authenticated user (not just admins) can view the sample-report preview. Low risk (fixture data only).
**L-6.** Dead code: `emailLateCancel48hr` (`src/lib/email.js:289`), `backfillSessionGroups` (`src/lib/sessionGroups.js:26`), `requireTester` (`src/lib/testers.js:38`), `SKILL_LABELS` (`src/lib/rubric.js:30`) — zero callers anywhere. `sendEmail`'s `attachments` parameter (`src/lib/email.js:46,53`) is never passed by any caller. `@testing-library/react` is an unused dependency (`package.json:38`).
**L-7.** `src/lib/reportAnon.js` — well-written anonymization helpers with zero call sites; currently redundant (identity is stripped earlier at the SQL level) but flag for whoever eventually adds a per-evaluator score breakdown to the parent report, since this module would need to be wired in at that point.
**L-8.** `report_links.token` generation could not be statically verified — no `CREATE TABLE report_links` exists in tracked `migrations/`; the token's randomness lives in a DB-side default outside the audited codebase. **Unverified** — recommend confirming it's a strong random value (e.g. 32-byte hex), not sequential.

---

## 5. Efficiency Findings (ranked by user-visible impact)

1. **N+1 queries in schedule-apply and roster import.** `src/lib/scrimmageTeams.js:185-203` (`applyAllMatchups`) issues ~4+ sequential queries per scheduled row plus a per-roster-member insert loop inside `assignMatchupRoster` (L161-172) — a 20-game tournament schedule can trigger 100+ serial DB round trips from one button click. `src/app/api/categories/[catId]/athletes/route.js:72-157` (bulk CSV roster import) issues 2-5 queries per athlete row, so a 100-player import can hit 300-500 sequential queries and risk a Vercel function timeout.
2. **Rankings computed from scratch, uncached, on every request — and redundantly by 4+ endpoints.** `src/lib/rankings.js`'s `computeCategoryRankings()` (O(athletes × evaluators × sessions) of JS work) is called fresh on every `GET /rankings` (polled every 120s per open tab per `CategoryDashboard.jsx:230`), and again independently by `coaches-report`, `report`, `contention`, and `export` routes instead of being shared or precomputed on score write.
3. **`analyzeContention`'s Monte Carlo simulation** (`src/lib/contention.js`, 2000 runs × athletes × remaining sessions) stacks on top of a full rankings recompute — the single most CPU-expensive request path in the app, though only on-demand rather than polled.
4. **Rankings payload over-fetches per-session detail for every consumer** — the same full breakdown (session scores, rank history, agreement %) is sent to every downstream view regardless of what it actually renders, adding bandwidth/parse cost that scales with roster size on the 120s poll.
5. **`athletes` route `SELECT *`** (`src/app/api/categories/[catId]/athletes/route.js:39-43`) exposes parent-email columns to any category-authorized evaluator viewing the roster tab — minor over-fetch, not cross-tenant.
6. **Clean:** Neon's HTTP driver (`src/lib/db.js`) is the only DB client construction anywhere in `src/` — no connection-pool exhaustion risk. Client/server boundaries are mostly clean — the three largest dashboards fetch via React Query (keyed/deduped/cached) rather than raw fetch-and-filter. No server-side Next.js caching exists anywhere, which is a missed optimization but also means **no risk of a cross-tenant cached-response leak**.

---

## 6. Architecture Verdicts

**OVERLOADED** (cite: distinct responsibilities bundled in one file; proposed split):
- `src/app/service-provider/dashboard/page.jsx` (2695 lines, largest file in the repo) — tab-routes over ~20 already-self-contained components defined inline (`TestersTab`, `PayrollTab`, `ScheduleFormModal`, `EvaluatorEfficiencyReport`, `LeadsSection`, `MessagesSection`, etc.). **Split:** promote each to `src/components/service-provider/*.jsx` — mechanical, boundaries already exist.
- `src/components/CategoryDashboard.jsx` (2235 lines) — 8 tabs inline, ~60 `useState` hooks, plus CSV export and ranking-insight computation mixed into the component. **Split:** `CategoryDashboard/{RankingsTab,TeamsTab,ScheduleTab,AthletesTab,AnalysisTab,AuditTab,SettingsTab}.jsx` + a `useCategoryInsights` hook.
- `src/app/evaluator/score/[scheduleId]/page.jsx` (2051 lines) — core scoring state is legitimately unified, but offline-sync, Web Audio feedback, voice scoring, and three alternate view modes are bolted on. **Split:** `useAudioFeedback.js`, `useOfflineScoreSync.js`, `ConsensusReviewPanel.jsx`, `GridView`/`CardView`/`NumpadView.jsx`.
- `src/app/evaluator/dashboard/page.jsx` (1523 lines) — five distinct feature domains (signup, calendar export, availability, pay, messaging) tab-routed over already-separated components. **Split:** promote to `src/components/evaluator/*.jsx`.
- `src/app/association/dashboard/page.jsx` (1113 lines) — sidebar nav + bulk-invite + 3 tabs with independent filter state. **Split:** `OverviewTab`, `ScheduleTab`, `AthletesTab`, `BulkDirectorInviteModal`.
- `src/app/association/dashboard/category/[catId]/groups/page.jsx` (1105 lines, mild) — core drag-and-drop builder is defensible; `TournamentGamesGrid`/`FlagInfo` are separable and its promote-plan math re-derives stddev instead of importing `lib/scoring.js`.
- `src/app/api/categories/[catId]/groups/route.js` (541 lines) — `POST` dispatches 8 unrelated actions; `auto_assign` alone inlines a full ranking computation that duplicates `lib/rankings.js` (see Finding M-5). **Split:** `src/lib/groupAssignment.js`.
- `src/app/api/categories/[catId]/teams/route.js` (396 lines) — team-draft algorithm + roster CRUD + email composition that bypasses `lib/email.js`'s shared helpers. **Split:** `src/lib/teamGeneration.js`.
- `src/app/api/categories/[catId]/scores/route.js` (375 lines) — score PATCH/DELETE/GET is cohesive; the manual CSV bulk-import POST is a different domain. **Split** the import path out.
- `src/app/api/categories/[catId]/consensus/route.js` (353 lines) — tier-consensus GET is cohesive; `close_session` bundles 4 evaluator-integrity checks. **Split:** `src/lib/evaluatorIntegrity.js`.

**RIGHT-SIZED:** `src/lib/authorize.js`, `src/lib/auth.js`, `src/lib/email.js` (long only because it holds ~20 independent templates), `src/lib/rosterImport.js` (no per-provider branching despite the "universal" name — one generic heuristic matcher), `checkin/[scheduleId]/route.js`, `categories/[catId]/schedule/route.js`, `evaluator/signup/route.js`, `evaluator/scores/route.js`, `admin/god-mode/users/route.js`, `categories/[catId]/setup/route.js`, the association setup wizard page, `service-provider/evaluator/[evalId]/page.jsx`, `DevelopmentReport.jsx`, `ScoreEditor.jsx`, `player/report/page.jsx`, `teams/page.jsx`, `goalie-provider/dashboard/page.jsx` (notably the same tabs-as-components shape as the SP dashboard, caught at 505 lines before it could grow into the same problem).

**Dead code:** `npx knip` ran clean (no unused files). One unused dependency (`@testing-library/react`), and the handful of dead exports listed in Finding L-6. No orphaned database tables — every table in `migrations/*.sql` has a live query site.

**Duplicated logic:** authorization helpers are used consistently (178+ call sites); the one real duplication is ranking/percentile/z-score math (Finding M-5).

**Dead/prototype routes:** `/prototype/voice-scoring` is live and unauthenticated in production (Finding M-4). `design-prototypes/`/`design-samples/` at the repo root are plain static files outside `src/app`, not part of the Next.js build — no action needed.

---

## 7. Prioritized Fix List

**Critical (fix first, smallest change first):**
1. Add an `organization_id`/membership scope check to `delete_account` in `src/app/api/service-provider/evaluators/route.js:158-175`, mirroring every sibling action in the same file. (C-1)
2. Bind `schedule_id` to the authorized `catId` in the legacy GET branch of `src/app/api/evaluator/scores/route.js`, mirroring the check the POST handler already performs. (C-2)

**High:**
3. Add the missing role-allow-list check to the ~10 `categories/[catId]/*` write endpoints listed in H-1, reusing role-set constants already defined elsewhere in the same files.
4. Scope `notify-volunteers`'s recipient list to actual category staff instead of an arbitrary client-supplied email array (part of H-1, but call out separately — it's an open mail-relay risk beyond tenant boundaries).
5. Strip or gate the `standing` (percentile/tier/band) field out of `report/[token]`'s unpurchased response branch. (H-2)
6. Confirm rotation of `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`; rotate immediately if unconfirmed. (H-3)
7. Add `/coach-report` and `/api/coach-report` to `middleware.js`'s `PUBLIC_PATHS`. (H-4)
8. Run `npm audit fix` for transitive packages and schedule a Next.js/postcss version bump. (H-5)

**Medium:**
9. Add `checkAndRecord` rate limiting to `evaluator/join` POST and `evaluator/register` GET. (M-1)
10. Add score-value range/type validation to `evaluator/scores` POST, matching the existing admin-override check. (M-2)
11. Restrict `organizations` POST so non-super-admin callers can only create `type: "association"`. (M-3)
12. Remove `/prototype` from `PUBLIC_PATHS` or delete the route. (M-4)
13. Point `groups/route.js`'s `auto_assign` (and the other 4 reimplementations) at `computeCategoryRankings`/`lib/scoring.js`. (M-5)

**Low:**
14. Add an `Array.isArray` guard in `categories/[catId]/setup/route.js`. (L-1)
15. Validate `role` against an allow-list in `admin/god-mode/users/route.js`. (L-2)
16. Restrict `contact_email` edits to the original org owner, or add a confirmation step. (L-3)
17. Add `getSession()` to `templates/route.js` for consistency. (L-4)
18. Gate `/email-preview/parent-report` behind an admin role check. (L-5)
19. Delete the confirmed-dead exports and the unused `@testing-library/react` dependency. (L-6)
20. Wire `lib/reportAnon.js` in (or delete it) the next time a per-evaluator breakdown is added to the parent report. (L-7)
21. Confirm `report_links.token` generation is cryptographically random at the DB level. (L-8)
22. (Non-urgent, architecture) Split the OVERLOADED dashboard files and extract inline business-rule engines (group auto-assign, evaluator-integrity checks, team-balancing) into `src/lib/*` — start with the SP dashboard split, which is nearly mechanical since the component boundaries already exist.
