# AI-Assisted Live Support ("Something's Wrong" button)

**Date:** 2026-08-15
**Status:** Approved by user

## Problem

When something breaks during a live event — an evaluator's scores flicker/change
unexpectedly, a check-in volunteer doesn't see a player pop up, a director can't
figure out why team building is stuck, an SP's payroll numbers look wrong — the
only path today is "text/call Dan and describe it," with no context captured and
no diagnosis until he's free to dig through the backend himself. That's slow
exactly when it matters most (mid-event).

## Decision

Build a support-incident pipeline: any authenticated user can report a problem
(manually, or automatically for a narrow set of live-event-critical routes).
Claude reads a role-appropriate snapshot of backend state, explains the likely
cause in plain English, and — for two specific, already-safe flows — proposes a
concrete fix that Dan approves with one tap before anything executes. Everywhere
else, Claude's diagnosis reaches Dan immediately by email; he applies the fix
himself the normal way. Auto-fix coverage expands to more domains over time as
each is vetted — it is explicitly NOT "AI can fix anything" in v1.

Nothing ever executes without Dan's explicit approval. There is no
auto-apply-on-timeout path.

## Scope split (why fix menu ≠ diagnosis coverage)

- **Diagnosis is universal from day one.** Every role — evaluator, tester, SP,
  director/association, admin — gets the Help button and a real Claude-generated
  explanation of what's likely wrong, built from that role's own backend state.
  This is safe to make universal immediately because it's read-only: it never
  writes to the database.
- **Auto-fix is narrow at launch.** Only two flows get a proposed fix Dan can
  approve with a tap: evaluator score entry and check-in. Both map to existing,
  already-tested, reversible admin actions (reopen a session, clear a lock,
  force a resync, remove a duplicate signup). Every other domain (payroll, team
  building, org management, etc.) surfaces a diagnosis only — Dan still fixes it
  himself, just with a head start instead of investigating blind. New domains
  get added to the fix menu one at a time as each is vetted; this is explicitly
  future work, not part of this build.

## Trigger paths

1. **Manual** — a "Something's wrong" button, added to each role's main
   dashboard shell (evaluator, tester, SP, association/director, admin
   god-mode — one integration point per dashboard, since there's no shared
   layout across roles today). Tapping it opens a small form: a few canned
   categories (varies by role — e.g. evaluator sees "scores changing on their
   own" / "player not showing", SP sees "schedule looks wrong" / "payroll
   looks wrong") plus free text, and submits to a new endpoint,
   `POST /api/support/incidents`.
2. **Automatic** — a Sentry Alert Rule scoped to only the live-event-critical
   routes (`/api/evaluator/scores`, `/api/checkin/*`, `/api/*/roster`,
   `/api/tester/sessions`, `/api/evaluator/signup`) fires a webhook into the
   same endpoint on error. No other route triggers this automatically — a
   broken PDF export or an admin report failure stays Sentry-only, no ping.

Both paths converge on the same incident pipeline below.

## Context bundle

On incident creation, the server builds a bundle using **existing app
functions only** — Claude never gets direct database access. Every bundle
carries a baseline: reporter's role, user id, current page/tab, their
description (if manual) or the captured error (if automatic), and their
recent errors from Sentry.

The two launch flows (evaluator scoring, check-in) get a richer, hand-built
bundle on top of that baseline — recent scores for that evaluator+session,
full check-in/roster state for that session — because those are the two flows
with an approvable fix behind them. Other roles' bundles start at the
baseline and grow richer per-domain as that domain gets its own fix menu
later; this is explicitly out of scope to fully build for every role now.

## Diagnosis

One Claude call per incident: context bundle → structured output — cause,
plain-English explanation for the reporter, and (only for the two launch
flows) a proposed action from the fixed menu below, or "can't auto-diagnose."
For every other role/domain, the output is diagnosis text only, no action
field.

## Safe-action menu (v1 — evaluator scoring + check-in only)

Each is an existing, already-tested app function, newly reachable through
this approval flow:

- `reopen_session` — clears an accidental Save & Close lock
  (`/api/evaluator/close-session` already supports reopen)
- `clear_stale_lock` — clears a stuck `closed_at` on a signup
- `resync_view` — pushes a hard client refresh so stale cached scores/roster
  clear (via the existing NotificationBell / a targeted invalidation signal)
- `remove_duplicate_signup` — cancels a duplicate signup left by a partial
  batch-signup failure (reuses the existing cancel path)

Nothing that deletes athlete or score data outright in v1.

## Approval + escalation

Diagnosis + proposed action (when there is one) emails Dan via Resend, with a
signed one-tap Approve/Deny link (same HMAC-token pattern as the existing
coach-report links — `lib/calendar-token`, distinct namespace). For
diagnosis-only incidents (no action), the email is just informational — no
approve/deny needed, Dan goes and fixes it himself.

Escalation (actionable incidents only): no response at 2 minutes → resend the
same email. No response at 5 minutes → resend marked urgent. Checked by a new
cron job (`/api/cron?job=support_escalation`, added to `vercel.json`,
running every minute) that scans `support_incidents` for pending rows past
their next escalation threshold. **No auto-apply ever** — timeout only
increases urgency of the ping, never executes the action.

The schema carries an `approvers` list (currently just Dan) so adding more
people later is a data change, not a rebuild — out of scope to build routing
logic for multiple approvers now.

## Requester-facing UX

Immediate acknowledgment on submit — never a bare spinner: "We've spotted
it, working on it," plus a plain-English workaround to try meanwhile when one
applies (e.g., "refresh and check in again"). The incident page polls and
flips to a resolved state once Dan approves and the action executes (launch
flows), or once Dan marks it resolved manually (everywhere else).

## Data model

New table `support_incidents`:
- `id`, `created_at`
- `trigger_source` (`manual` | `sentry`)
- `reporter_user_id`, `reporter_role`, `page_context`
- `description` (reporter's text, nullable for auto-triggered)
- `context_bundle` (jsonb snapshot sent to Claude)
- `diagnosis` (Claude's explanation text)
- `proposed_action` (nullable — one of the fixed menu keys, or null for
  diagnosis-only incidents)
- `action_params` (jsonb, nullable)
- `status` (`pending` | `approved` | `denied` | `executed` | `resolved` |
  `expired`)
- `approvers` (jsonb array, v1 = single entry)
- `escalation_count`, `last_pinged_at`
- `resolved_at`, `resolved_by`

Full audit trail, since actionable incidents are live production writes.

## Out of scope for v1

- Auto-fix menus for any domain beyond evaluator scoring + check-in
- Multiple approvers / routing by issue type
- Auto-apply on timeout
- SMS/push notifications (email only, per earlier decision)
- Deep per-role context bundles beyond the baseline, for roles without a fix
  menu yet
