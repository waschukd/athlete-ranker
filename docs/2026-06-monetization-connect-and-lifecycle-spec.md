# Spec: Report payments (Stripe Connect) + lifecycle email automation

Status: **design — not built.** Authored 2026-06-11 during the autonomous build
session. The report/bonus/provider/email features in the same PR are built; this
doc covers the two pieces deliberately left as design (payments because it can't
be tested without Stripe config; lifecycle because it touches scheduling and I
couldn't runtime-test). Decisions reflect the owner's calls:
**all money flows through Sideline Star ("God") and is distributed down; SP
controls access; 25% platform cut; SP↔association split is off-platform;
per-association on/off toggle.**

---

## Part A — Payments: Stripe Connect platform model

### Goal
Every $24.99 report is charged on Sideline Star's Stripe account; Sideline Star
keeps a **25% application fee**; the remainder is paid out to the **provider**
(the SP that ran the evals, or a self-running association acting as its own
provider). Stripe splits it atomically — no manual disbursement.

### Account model (Stripe Connect **Express**)
- Each **provider org** onboards a Stripe **Express** connected account (Stripe
  hosts KYC, bank, tax forms, payout dashboard → minimal liability/ops for us).
- "Provider" = the org that earns a category's report revenue:
  - SP-run category → the SP org.
  - Self-running association (no SP) → the association org (flows/approved via
    **God Mode**).

### Schema changes
```sql
-- on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_account_id TEXT;          -- acct_…
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false; -- set by account.updated webhook
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS report_purchasing_enabled BOOLEAN DEFAULT true; -- per-association on/off

-- on report_purchases (audit the split)
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER;
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS provider_org_id INTEGER;
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS destination_account_id TEXT;
```

### Resolving the provider for a category
`resolveReportProvider(catId)` → `{ orgId, stripeAccountId, chargesEnabled }`:
1. If an SP runs this category (existing SP↔category link), use the SP org.
2. Else use the category's own association org.
Purchasing is only offered when that provider has `stripe_charges_enabled = true`
and `report_purchasing_enabled = true`.

### Onboarding flow
- Provider admin → "Set up payouts" button → `POST /api/payments/connect/onboard`:
  - Create/lookup `stripe.accounts.create({ type: 'express', ... })`, store
    `stripe_account_id`.
  - `stripe.accountLinks.create({ account, type: 'account_onboarding', refresh_url, return_url })`
    → redirect the admin to Stripe.
- Webhook `account.updated` → set `stripe_charges_enabled = account.charges_enabled`.

### Checkout change (destination charge)
In `create-checkout`:
- `const fee = Math.round(priceCents * (parseInt(process.env.REPORT_PLATFORM_FEE_BPS || "2500", 10) / 10000));`
- `stripe.checkout.sessions.create({ ..., payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: providerStripeAccountId } } })`.
- Block (friendly message) if provider not onboarded or purchasing disabled.
- Store `application_fee_cents`, `provider_org_id`, `destination_account_id` on the purchase row in the webhook.

### Paywall gating
- Token report route already returns `purchased`. Add `purchasable` (provider
  onboarded + toggle on). When `purchasable === false`, the `/report/[token]`
  page shows the preview but hides the buy button (e.g. "purchasing isn't enabled
  for this association").

### God Mode
- Providers table: onboarding status, lifetime gross, fees collected, payouts.
- Approve self-running associations as providers.
- Global fee override (env `REPORT_PLATFORM_FEE_BPS`, default 2500 = 25%).

### Cost reference (per $24.99 report)
Stripe 2.9%+$0.30 ≈ $1.02; Connect payout ≈ $0.31; AI ≈ $0.01 → ≈ **$1.35**.
At a 25% fee you net ≈ **$4.90**; provider gets **$18.74**.

### Test checklist (owner, on return)
1. Stripe dashboard → enable **Connect**. 2. Add Connect keys + `account.updated`
to the webhook. 3. Onboard a test Express account (test mode). 4. Run a test
purchase; confirm the application fee + transfer in the Stripe dashboard.

---

## Part B — Lifecycle email automation (P2)

### The missing keystone event
Today group-assignment and parent notification are separate manual actions.
Introduce one discrete, idempotent action:

**"Publish session N"** (director/SP) = (a) lock the groups for the upcoming
session and (b) auto-email the affected parents their next ice time (+ report
CTA once reports exist).

### Schema
```sql
CREATE TABLE IF NOT EXISTS session_publish_log (
  age_category_id INTEGER NOT NULL,
  session_number  INTEGER NOT NULL,
  published_at    TIMESTAMPTZ DEFAULT NOW(),
  published_by    INTEGER,
  PRIMARY KEY (age_category_id, session_number)
);
-- consent / deliverability
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS parent_unsub_token TEXT;   -- per-parent unsubscribe
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS parent_email_status TEXT;  -- 'ok' | 'bounced' | 'unsubscribed'
```

### Flow
- **Session 1 publish** → welcome email (from **SP on behalf of association**,
  reuses the editable template) + first ice time.
- **After each session** → publishing the next session's groups emails those
  parents their next time. Reuses `parentScheduleHtml` (already has `.ics`).
- **Final teams** → "Publish final teams" action → optional parent notify.
- **Idempotency** → `session_publish_log` blocks double-sends; re-publish only
  emails parents whose time changed.

### Cross-cutting (build alongside)
- **Unsubscribe**: every parent email gets an unsubscribe link (`parent_unsub_token`);
  a suppression check before send; `parent_email_status='unsubscribed'` opt-out.
  (CASL/CAN-SPAM.)
- **Bounces**: Resend bounce webhook → set `parent_email_status='bounced'`,
  surface "N undeliverable" to the SP so they can fix addresses.

### Where it hooks
- New "Publish session" control on the category dashboard / SP surface, calling a
  new `/api/categories/[catId]/publish-session` route that writes the log and
  fans out the emails (respecting suppression + idempotency).
- The per-parent report-link email (built in this PR, `send-reports`) becomes the
  natural CTA embedded in these lifecycle emails once reports are ready.

### Why specced, not built
Touches the scheduling/groups subsystem and the live email path; doing it
unattended without runtime tests risks the same kind of regression we hit on the
report API. Recommend building it with the app running so each fan-out can be
verified against real data.
