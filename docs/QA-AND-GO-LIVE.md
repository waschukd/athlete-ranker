# QA & Go-Live Checklist

A manual run-through to verify the whole platform end-to-end, plus the few things
that depend on production config (email) and known gotchas.

---

## 0. Prerequisites to verify once
- [ ] **Email (Resend)** is configured in production: `RESEND_API_KEY` set and the
      `sidelinestar.com` domain **verified** in the Resend dashboard. Until this is
      true, every invite/notification silently no-ops (the UI shows copyable fallback
      links where it can). **Quickest test:** create a test client with your own email
      (below) and confirm the invite lands (check spam).
- [ ] All migrations applied in Neon (the comms + category-evaluators tables, signup
      requests, analytics, anonymous-evaluator). New features degrade quietly if a
      table is missing, so "feature looks empty" usually = migration not run.
- [ ] **Service worker note:** the scoring screen caches itself for offline use. After
      any deploy, a device that already used it auto-reloads to the fresh build on the
      next visit (controllerchange). If you ever see "nothing changed," fully close +
      reopen the tab once.

---

## 1. Service Provider → onboard a client
- [ ] SP dashboard → **New Client**: enter org name + a contact email you control.
- [ ] Confirm the modal shows **"Invite sent to …"** (or a copyable link if email is off).
- [ ] Open the invite email → set password → lands in the new association's dashboard.
- [ ] **Multiple SP admins:** invite a second admin to the SP → that admin logs in and
      can see the SP's associations + drill into their categories (the access fix).

## 2. Association → set up an age category
- [ ] Add Age Category → setup wizard.
- [ ] **Roster import:** upload a real RAMP/TeamSnap/TeamLinkt CSV → columns auto-map,
      combined names split, birth year parsed; if multiple divisions, the matching one
      pre-ticks → preview → import. Confirm count.
- [ ] Sessions/scoring defaults accept; **Schedule** upload (or add a session) works.
- [ ] Assign a **Director**; confirm they land in that category and can switch
      categories if assigned to more than one.
- [ ] (Optional) **Coach / Goalie evaluators**: add one of each in the "Coach & Goalie
      evaluators" manager.

## 3. Evaluators
- [ ] Evaluator joins via code/invite → appears pending → approve in the pool.
- [ ] Evaluator dashboard: **Score now** shows today/next; My Sessions grouped
      (Today / Needs scoring / Upcoming / Completed) with badges.
- [ ] Sign up for a session; cancel one with a reason → SP gets the alert.
- [ ] Mark an **availability** blackout → confirm auto-offer skips that date.

## 4. Scoring (the core)
- [ ] Open a session → players show as **team-colored circles** + green check when done.
- [ ] **Find #** jumps to a jersey; **Compact** collapses the grid after selecting.
- [ ] Score a player: Buttons auto-scroll to next category; Numpad **Enter** advances;
      **Grid** Enter/arrows move cell to cell.
- [ ] **Save state chip** shows "All saved"; flip airplane mode → it shows "Offline · N
      on device" and keeps scoring; back online → auto-syncs.
- [ ] **Backup ▾** → Download backup file → Restore from file loads it back.
- [ ] **Goalie evaluator** sees ONLY goalies (no skaters) — verify with a goalie-kind login.

## 5. Rankings / teams / reports
- [ ] Rankings compute and update; #1 highlighted; ranks plain numbers.
- [ ] **Compare coaches** toggle (if coaches exist) shows coach-rank column + deltas;
      coach scores are NOT in the official total.
- [ ] Build Final Teams from rankings.
- [ ] Player report (internal) opens from a player's name / Report button; AI scouting
      generates; **Share with Parent** + **Export PDF** work.
- [ ] Public parent report link loads (anonymized evaluators).

## 6. Schedule changes (notifications)
- [ ] Cancel a session → signed-up evaluators + SP admins + all association admins +
      directors are emailed; if it's within ~48h and athletes are assigned, parents too.
- [ ] Add/edit a session → the same fan-out; understaffed future sessions auto-offer to
      the eligible pool.
- [ ] SP edits a client's session → association admin + directors are told it was the SP.

## 7. Messaging / notifications
- [ ] SP → message an evaluator (and whole pool); evaluator gets it in-app + email and
      can reply. Notification bell shows unread.

---

## Known caveats (by design / external)
- **Email deliverability** depends entirely on Resend config (above) — code paths are
  correct and degrade gracefully.
- **God Mode** body remains its own theme; functional, internal-only.
- **Branch-preview builds** don't run on the Vercel Hobby plan — live merge is how you
  see changes; that's why low-risk work ships straight to `main`.
- **Per-association scoping** for additional SP admins isn't built yet (today they get
  the SP's full client access).
