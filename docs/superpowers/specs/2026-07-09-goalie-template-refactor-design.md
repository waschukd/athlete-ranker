# Goalie setup refactor — org-level template

**Goal:** Move goalie evaluation setup out of the per-category wizard. One goalie
template per org, owned by whoever evaluates goalies. Keep goalie/skater
evaluators strictly separate.

## Decisions (approved)
- One goalie template per org (not per category).
- In-house → the association owns/edits it. Goalie SP → the goalie SP owns it
  (association can't edit). Keep all three `goalie_eval_mode` values.

## Data
- New `organizations.goalie_template` JSONB:
  `{ scale, increment, players_eval_goalies, sessions[], categories[], skills_categories[] }`.
- Per-category `goalie_config` + goalie `scoring_categories` stay as the
  **materialized** form the ranking/scoring engine reads — engine untouched.

## Resolution & propagation (`src/lib/goalieTemplate.js`)
- `resolveGoalieTemplateOrg(assocOrgId)` → owner org from the association's mode
  (association→self, service_provider→linked skater SP, goalie_service_provider→
  linked goalie SP; falls back to self if no link).
- `applyGoalieTemplate(assocOrgId)` → read owner's template, write `goalie_config`
  + regenerate goalie `scoring_categories` for every category in the association.
- Runs on: template save, mode change, SP link, new category created.

## Endpoint
- `/api/organizations/[orgId]/goalie-template` GET/PUT (admin-gated).
  - PUT on an association (mode=association) → save + apply to its categories.
  - PUT on an SP → save + apply to every association that resolves to that SP.

## UI
- Wizard: drop the two goalie steps (Skater Sessions → Skater Scoring → Athletes
  → Schedule → Review). Review notes goalies are set in the Goalie panel.
- Association "Goalie Evaluation" modal: in-house → show the template editor;
  SP-served → read-only "your provider controls the goalie template".
- SP dashboard: a "Goalie template" editor (goalie SP always; skater SP when it
  serves a service_provider-mode client). Save propagates to all clients.

## Staffing isolation
- A skater SP no longer sees goalie-only (`goalie_skills`) sessions on its
  schedule feed/dashboard; shared scrimmages stay visible to both sides.
