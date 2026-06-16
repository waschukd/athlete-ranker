# Goalie evaluation + Goalie Service Provider — design

Date: 2026-06-15 · Status: building autonomously overnight, deploying live (user authorized). Skater path is left untouched; everything here is additive.

## Problem
Goalies are evaluated entirely separately from skaters (different skills, different people, different session-1 format). Today the app only models skater evaluation. We need (A) a goalie evaluation model and (B) a position-scoped Goalie Service Provider account.

## Domain rules (from owner)
- Goalies identified at roster upload (`position='goalie'`).
- Session 1: goalies do a **goalie station session** (run by the goalie SP), NOT testing.
- Sessions 2–4: goalies are in the scrimmages but graded by **goalie evaluators** on goalie categories — never by skater evaluators.
- Goalie scores/rankings show on the association dashboard (separate goalie section) but tie to the **goalie SP**, not the skater SP.
- 5 goalie categories: Skating/Balance/Agility · Positioning/Angles/Net Coverage · Feet/Hands/Stick/Rebounds · Concentration/Consistency/Big Saves · Anticipation/Reading the Play.
- A goalie SP is typically a goalie-specific training company and is usually **invited by an association**.

## (A) Goalie evaluation model
- **Categories**: stored in `scoring_categories` with `applies_to='goalies'` (column already exists; setup UI already exposes it). Skater categories stay `all`/`skaters`.
- **Ranking** (`lib/rankings.js`): already splits goalies into their own ranked group. Because the per-athlete session-score query averages whatever `category_scores` an athlete actually has, a goalie scored only on goalie categories is ranked purely on those — no skater-path change required. Goalies have no `testing_drill_results`, so their session-1 score comes from their station `category_scores`.
- **Scoring screen** (`/evaluator/score/[scheduleId]`): filter the visible scoring categories by the selected athlete's position — goalie → `applies_to in (goalies, all)`, skater → `applies_to in (skaters, all)`.
- **Report** (`lib/reportData.js`): a goalie's skill profile shows only goalie categories.
- **Demo data**: seed the 5 goalie categories + realistic stable goalie scores for Mill Woods' 5 goalies across all 4 sessions; remove their old skater-category + testing rows.

## (B) Goalie Service Provider account (MVP, additive)
- **Org type**: `goalie_service_provider`. **Role**: `goalie_service_provider_admin` (evaluators reuse the goalie-evaluator concept, `category_evaluators.kind='goalie'`).
- **Linking**: reuse `sp_association_links` (org type distinguishes a goalie SP from a skater SP). An association can be linked to both.
- **Invite**: association action "Invite goalie service provider" → creates the org + link + `createAndSendOrgInvite` (existing flow). `accept-invite` maps the type → role + redirect to `/goalie-provider/dashboard`. God Mode can also create one.
- **Dashboard** (`/goalie-provider/dashboard`, new isolated route): scoped to goalies only — linked associations, goalie counts/rankings per category, and goalie-evaluator pool management (invite + assign as `kind='goalie'` so they only see goalies when scoring). Mirrors the skater SP dashboard's feel but goalie-only.
- **Middleware**: protect `/goalie-provider` + `/api/goalie-provider` for `goalie_service_provider_admin` + `super_admin`.
- **Isolation**: new files/routes only; the existing SP dashboard and skater flows are not modified.

## Out of scope for the overnight MVP (flag for review)
- Deep goalie-session scheduling separate from the association schedule (goalies reuse association sessions for now).
- Goalie SP billing/Stripe Connect split.
- Goalie-evaluator self-serve session signup UI beyond category assignment.

## Risk control
Additive only; skater ranking/scoring/report paths unchanged and re-verified after deploy. Build must pass before each deploy.
