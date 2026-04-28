# Sideline Star — Privacy Incident Response Runbook

This runbook covers what to do when personal information held by Sideline
Star is exposed, lost, stolen, or otherwise compromised. It also covers
the recurring data-retention purge.

The legal frame is **PIPEDA** (federal Canada) and, where Quebec
associations are involved, **Quebec Law 25**. Both have mandatory breach
reporting obligations.

---

## 1. Detection — how we notice an incident

A "privacy incident" is any event where personal information may have
been:

- **Exposed** to people who shouldn't have seen it (e.g. an IDOR bug
  shipped to production, a misconfigured public storage bucket, an
  email sent to the wrong recipient).
- **Lost** in a way that we can't recover (e.g. accidental DELETE,
  Neon outage with no recent backup).
- **Stolen** (e.g. a credential leak, a compromised admin account, a
  successful phishing attack against a staff member).
- **Tampered with** (e.g. unauthorized score edits at scale, audit
  log corruption).

Sources of detection:

- Vercel error logs / function logs — watch for unexpected 500 spikes
  or unauthorized 401/403 patterns.
- Neon query logs — unusual cross-org reads, large bulk DELETEs,
  unfamiliar IPs hitting the database directly.
- Stripe dashboard — chargeback spikes, unfamiliar payouts.
- Reports from associations, evaluators, or parents.
- Reports from security researchers (responsible disclosure to the
  email in [`src/app/privacy/page.jsx`](../src/app/privacy/page.jsx)).
- GitHub Dependabot / Vercel security advisories.

---

## 2. Containment — first 60 minutes

Do these in parallel as soon as the incident is plausible. Speed
matters more than certainty at this stage.

1. **Isolate the vulnerability.**
   - If a code path is leaking data, push a deploy that disables it
     (return 503, comment out the route handler, or revert the
     offending commit). It is acceptable to break a feature briefly
     in order to stop the leak.
   - If a credential is leaked, rotate it immediately:
     `AUTH_SECRET`, Neon connection string, Stripe keys, Resend API
     key. The rotation list lives in
     [`memory/project_credential_rotation.md`](../../../.claude/projects/C--Users-DBag--claude/memory/project_credential_rotation.md).
   - If an admin account is compromised, revoke its sessions (delete
     `auth-token` cookies are JWT-based; a `AUTH_SECRET` rotation is
     the kill switch — invalidates ALL sessions, including yours).

2. **Preserve evidence.** Before touching anything, snapshot:
   - Current Vercel logs (export to a file).
   - Relevant Neon query logs.
   - The state of the affected DB rows (a `pg_dump` of the affected
     tables).
   - Any emails or reports that surfaced the incident.

3. **Stop the bleed without blowing up the rebuild.** Don't wipe the
   audit trail or the compromised user records — you need them to
   assess scope.

---

## 3. Assessment — within 72 hours

Decide three things:

1. **What data was involved?** Categories matter for notification:
   - Account credentials (email + password hash)
   - Athlete personal info (name, birth year, jersey number, position)
   - Evaluator notes and scores (potentially sensitive observations
     about minors)
   - Payment data (Stripe handles cards directly; we hold transaction
     IDs and buyer emails)
   - Voice transcripts (we don't store audio; transcripts are written
     into player_notes)

2. **How many individuals were affected?** Query the audit log and
   route logs to bound the count. Be specific — "all athletes in
   org X" vs "every athlete in the database" leads to different
   notification strategies.

3. **Is there a real risk of significant harm (RROSH)?** This is the
   PIPEDA test for mandatory notification. Factors:
   - Sensitivity of the data (an under-13 minor's evaluation notes
     are more sensitive than an adult evaluator's email address).
   - Probability of misuse (was the data scraped at scale, or
     theoretically reachable but no evidence of actual access?).
   - Who has it now (one researcher who reported responsibly vs
     dumped on a public paste site).

If RROSH is **yes**, notification is mandatory. If RROSH is **no**, you
still log it internally but don't have to notify externally. When in
doubt, notify — the regulator penalty for under-reporting is much
worse than the embarrassment of over-reporting.

---

## 4. Notification — who to tell, in what order

### a. Office of the Privacy Commissioner of Canada (federal)

Required under PIPEDA when RROSH is met. File via the OPC's online
form (https://www.priv.gc.ca). Include:

- Date and time of the incident.
- Description of what happened.
- What personal information was involved.
- Number of individuals affected (or estimate).
- Steps taken to reduce harm.
- Steps individuals can take to protect themselves.
- Contact for the OPC to follow up.

### b. Commission d'accès à l'information du Québec (Quebec)

Required if any affected individual is in Quebec or any affected
association operates in Quebec. Same-day or "as soon as possible"
notification is required under Law 25.

### c. Affected associations

Sideline Star does not have direct contact info for parents or athletes
— their relationship is with the association. So:

- Identify the associations whose athletes / users were affected.
- Email each association's primary contact (the
  `organizations.contact_email` row) with:
  - What happened (plain English, no jargon).
  - Which of their athletes / users are affected.
  - What we are doing about it.
  - What they need to do (forward the notice to parents, change any
    of their own credentials, etc.).
  - Our incident contact.

### d. Affected Sideline Star users (evaluators, directors, admins)

Email anyone whose own account information was involved. Use the
existing Resend infrastructure but draft the message manually —
don't reuse a transactional template.

### e. Internal record

Log the incident in `docs/INCIDENT_LOG.md` (create on first incident).
Each entry: date, summary, scope, response, lessons learned. PIPEDA
requires us to keep breach records for **24 months** even if no
external notification was triggered.

---

## 5. Recovery and post-mortem

After the immediate crisis is over:

1. Patch the vulnerability properly (not just the production
   workaround).
2. Add a regression test that would have caught the bug
   ([`tests/unit/authz_idor.test.js`](../tests/unit/authz_idor.test.js)
   is the canonical pattern — pin the fix so the door can't quietly
   re-open).
3. Run the audit one level wider — if the bug was in one route, scan
   sibling routes for the same shape.
4. Review what detection signal *should* have caught it earlier and
   add the missing alert / log line.
5. Update this runbook with anything you learned.

---

## 6. Routine data-retention purge

Per the privacy policy, evaluation data is retained for **the season
plus three years**, then purged.

This is currently a **manual quarterly task**, not an automated cron
job — auto-deleting historical athlete data has too much downside if
it goes wrong. Don't wire it into [`src/app/api/cron/route.js`](../src/app/api/cron/route.js)
without a dry-run flag, a confirmation gate, and a tested restore path
from the Neon backup.

Quarterly checklist (run at the start of each calendar quarter):

1. Identify candidate rows: athletes whose
   `age_categories.evaluation_end_date` (or equivalent season-end
   timestamp) is more than 3 years in the past, AND who have no
   active membership in any current-season age category.
2. Generate a count + sample report. Send to the affected
   associations 30 days before the purge so they can object or
   request export.
3. After 30 days, run the purge inside a transaction. Order matters
   because of foreign keys: `category_scores` →
   `evaluator_session_signups` → `player_checkins` →
   `player_group_assignments` → `player_notes` → `report_purchases`
   → `report_links` → `athletes`.
4. Log the purge in `docs/INCIDENT_LOG.md` (count, cutoff date,
   associations notified).

---

## 7. Contacts

| Role | Who | Where |
|---|---|---|
| Incident lead | Owner / operator | `waschukd@gmail.com` |
| OPC (federal) | Office of the Privacy Commissioner of Canada | https://www.priv.gc.ca |
| CAI (Quebec) | Commission d'accès à l'information du Québec | https://www.cai.gouv.qc.ca |
| Hosting | Vercel | https://vercel.com/help |
| Database | Neon | https://neon.tech/docs/introduction/support |
| Payments | Stripe | https://support.stripe.com |
| Email | Resend | https://resend.com/contact |
