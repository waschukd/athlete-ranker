import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { logEvent } from "@/lib/analytics";
import { notifySessionChange } from "@/lib/scheduleNotify";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

const SESSION_TYPE_LABEL = { testing: "Testing", scrimmage: "Scrimmage", goalie_skills: "Goalie Skills", skills: "Skills" };
const typeLabel = (t) => SESSION_TYPE_LABEL[t] || t;

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const cats = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;
    if (!cats.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const category = cats[0];

    const sessions = await sql`
      SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number
    `;

    const scoringCategories = await sql`
      SELECT * FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order
    `;

    // A goalie-only association: served by a goalie SP and NOT by a skater SP.
    // These evaluate goalies only, so the setup wizard runs in goalie mode (no
    // skater sessions/scoring).
    let goalie_only = false;
    try {
      const [f] = await sql`
        SELECT
          EXISTS(SELECT 1 FROM sp_association_links sal JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'goalie_service_provider' WHERE sal.association_id = ${category.organization_id} AND sal.status = 'active') AS has_goalie_sp,
          EXISTS(SELECT 1 FROM sp_association_links sal JOIN organizations sp ON sp.id = sal.service_provider_id AND sp.type = 'service_provider' WHERE sal.association_id = ${category.organization_id} AND sal.status = 'active') AS has_skater_sp`;
      goalie_only = !!f?.has_goalie_sp && !f?.has_skater_sp;
    } catch { /* best-effort */ }

    return NextResponse.json({ category, sessions, scoringCategories, goalie_only });
  } catch (error) {
    console.error("Category setup GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// authorizeCategoryAccess alone also admits plain evaluators/directors --
// every step here does a destructive delete-and-recreate of live category
// config (sessions, scoring categories, format), so it needs the admin check.
const SETUP_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SETUP_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { step, data } = body;

    // Snapshot pre-update state so we can detect the setup_complete
    // transition and the edited-after-complete signal in one place.
    const existing = await sql`SELECT setup_complete, organization_id, created_at FROM age_categories WHERE id = ${catId}`;
    const wasComplete = !!existing[0]?.setup_complete;
    const orgId = existing[0]?.organization_id ?? null;
    const createdAt = existing[0]?.created_at;
    const userId = await getAppUserId(session);
    const role = session.role || "anonymous";

    if (wasComplete) {
      logEvent({ userId, role, event: "category.edited_after_complete", orgId, metadata: { catId, step } });
    }

    switch (step) {
      case "sessions": {
        if (!Array.isArray(data.sessions)) {
          return NextResponse.json({ error: "sessions must be an array" }, { status: 400 });
        }
        // Snapshot the current session types before replacing, so a genuine type
        // change (e.g. Scrimmage -> Testing) can notify everyone attached to it
        // after the swap -- same reach as an edited/cancelled schedule row
        // (evaluators signed up, the SP + its admins, all association admins,
        // and the category's directors). Only fires for an already-launched
        // category; nobody's signed up to anything yet during initial setup.
        const beforeTypes = wasComplete
          ? Object.fromEntries((await sql`SELECT session_number, session_type FROM category_sessions WHERE age_category_id = ${catId}`).map(s => [s.session_number, s.session_type]))
          : {};

        // Delete existing sessions and recreate. evaluators_required/
        // goalie_evaluators_required were dropped here despite the setup
        // wizard already computing them correctly per session type (0 for
        // Testing/Goalie Skills) -- every save silently fell back to the
        // evaluators_required column's DB default (4), so a session already
        // switched to Testing kept showing "needs evaluators" to browsing
        // evaluators on every subsequent settings save.
        await sql`DELETE FROM category_sessions WHERE age_category_id = ${catId}`;
        for (const sess of data.sessions) {
          const isTesting = sess.session_type === "testing";
          const evaluators_required = sess.evaluators_required != null ? parseInt(sess.evaluators_required) || 0 : (isTesting ? 0 : 4);
          const goalie_evaluators_required = parseInt(sess.goalie_evaluators_required) || 0;
          await sql`
            INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage, evaluators_required, goalie_evaluators_required)
            VALUES (${catId}, ${sess.session_number}, ${sess.name}, ${sess.session_type}, ${sess.weight_percentage}, ${evaluators_required}, ${goalie_evaluators_required})
          `;
        }

        if (wasComplete) {
          const changedNums = data.sessions
            .filter(sess => beforeTypes[sess.session_number] && beforeTypes[sess.session_number] !== sess.session_type)
            .map(sess => ({ num: sess.session_number, from: beforeTypes[sess.session_number], to: sess.session_type }));
          if (changedNums.length) {
            const initiator = { name: session.name || session.email, role: session.role };
            for (const c of changedNums) {
              try {
                const isTesting = c.to === "testing";
                const rows = await sql`SELECT * FROM evaluation_schedule WHERE age_category_id = ${catId} AND session_number = ${c.num} AND status <> 'cancelled'`;
                const summary = isTesting
                  ? `Session ${c.num}'s type changed from ${typeLabel(c.from)} to ${typeLabel(c.to)} — player evaluators are no longer needed for this session, and any existing evaluator signups have been released.`
                  : `Session ${c.num}'s type changed from ${typeLabel(c.from)} to ${typeLabel(c.to)}.`;
                for (const row of rows) {
                  // Notify while signups are still 'signed_up' -- notifySessionChange's
                  // recipient query only reaches that status, so this must run before
                  // the release below or the very people we most need to reach get skipped.
                  await notifySessionChange({
                    catId, scheduleRow: row, scheduleId: row.id, changeType: "edited",
                    summary, initiator,
                  });
                }
                // Keep staffing requirements in sync with the new type -- these were
                // previously left at whatever the OLD type needed, so a session that
                // just became Testing still showed "needs evaluators" (evaluators_
                // required never got zeroed) even though testers, not evaluators, are
                // what it actually needs now.
                if (isTesting) {
                  await sql`UPDATE evaluation_schedule SET evaluators_required = 0, testers_required = GREATEST(COALESCE(testers_required, 0), 7) WHERE age_category_id = ${catId} AND session_number = ${c.num} AND status <> 'cancelled'`;
                  // Nobody needs to be an evaluator here anymore -- release them
                  // rather than leaving them silently signed up to a role the
                  // session no longer has.
                  const rowIds = rows.map(r => r.id);
                  if (rowIds.length) {
                    await sql`UPDATE evaluator_session_signups SET status = 'released' WHERE schedule_id = ANY(${rowIds}) AND status = 'signed_up'`;
                  }
                } else {
                  await sql`UPDATE evaluation_schedule SET testers_required = 0, evaluators_required = GREATEST(COALESCE(evaluators_required, 0), 4) WHERE age_category_id = ${catId} AND session_number = ${c.num} AND status <> 'cancelled'`;
                }
              } catch (e) { console.error("sessions: type-change notify", e?.message); }
            }
          }
        }

        return NextResponse.json({ success: true });
      }

      // Goalie sessions live in goalie_config.sessions (separate from the skater
      // category_sessions). The client sends the full goalie_config.
      case "goalie_sessions": {
        await sql`
          UPDATE age_categories SET
            evaluates_goalies = true,
            goalie_config = ${data.goalie_config ? JSON.stringify(data.goalie_config) : null}::jsonb
          WHERE id = ${catId}`;
        return NextResponse.json({ success: true });
      }

      case "scoring": {
        // Real incident: a live category's scoring_scale field reached this
        // route as "" (an in-progress edit, or a form field cleared then
        // submitted before retyping) -- scoring_scale/scoring_increment are
        // real INTEGER/NUMERIC columns, so "" fails the cast with an
        // uncaught Postgres exception, which the catch-all below turned into
        // a silent, unlogged 500 with no clue what happened. Validate first
        // and reject with a real message instead of crashing the request --
        // this must run BEFORE the DELETE below, or a bad payload wipes the
        // category's scoring criteria without ever getting to recreate them.
        const scoringScale = parseInt(data.scoring_scale, 10);
        const scoringIncrement = parseFloat(data.scoring_increment);
        if (!Number.isFinite(scoringScale) || scoringScale <= 0) {
          return NextResponse.json({ error: "Scoring scale must be a positive number (e.g. 10)." }, { status: 400 });
        }
        if (!Number.isFinite(scoringIncrement) || scoringIncrement <= 0) {
          return NextResponse.json({ error: "Scoring increment must be a positive number (e.g. 0.5)." }, { status: 400 });
        }
        if (!Array.isArray(data.categories)) {
          return NextResponse.json({ error: "categories must be an array" }, { status: 400 });
        }

        // SKATER scoring only. Goalie config/categories are handled in goalie_scoring.
        // sticky_jersey_numbers is COALESCEd (not defaulted) -- this step also runs
        // from the plain setup wizard, which knows nothing about that field; a hard
        // default would silently flip a category's toggle back off on its next
        // unrelated scoring save.
        await sql`
          UPDATE age_categories SET
            scoring_scale = ${scoringScale},
            scoring_increment = ${scoringIncrement},
            position_tagging = ${!!data.position_tagging},
            director_can_edit_scores = ${data.director_can_edit_scores || false},
            evaluators_anonymous = ${data.evaluators_anonymous ?? true},
            sticky_jersey_numbers = COALESCE(${data.sticky_jersey_numbers ?? null}, sticky_jersey_numbers)
          WHERE id = ${catId}
        `;
        // Recreate SKATER categories (all/skaters); leave goalie sets untouched.
        await sql`DELETE FROM scoring_categories WHERE age_category_id = ${catId} AND applies_to NOT IN ('goalies','goalie_skills')`;
        for (let i = 0; i < data.categories.length; i++) {
          if (!data.categories[i]?.name) continue;
          await sql`
            INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to)
            VALUES (${catId}, ${data.categories[i].name}, ${i}, ${data.categories[i].applies_to || 'all'})
          `;
        }
        return NextResponse.json({ success: true });
      }

      // GOALIE scoring: who evaluates (A association / B service_provider /
      // C goalie_service_provider), goalie scale/increment, and goalie categories.
      case "goalie_scoring": {
        // Who evaluates goalies (goalie_eval_mode) is set org-wide on the
        // association dashboard and inherited — not stored per category here.
        await sql`
          UPDATE age_categories SET
            evaluates_goalies = true,
            players_eval_goalies = ${data.players_eval_goalies ?? false},
            goalie_config = ${data.goalie_config ? JSON.stringify(data.goalie_config) : null}::jsonb
          WHERE id = ${catId}`;
        // Recreate GOALIE categories (goalies + goalie_skills); leave skater sets alone.
        await sql`DELETE FROM scoring_categories WHERE age_category_id = ${catId} AND applies_to IN ('goalies','goalie_skills')`;
        if (Array.isArray(data.goalie_categories)) {
          for (let i = 0; i < data.goalie_categories.length; i++) {
            if (!data.goalie_categories[i]?.name) continue;
            await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${data.goalie_categories[i].name}, ${100 + i}, 'goalies')`;
          }
        }
        if (Array.isArray(data.goalie_skills_categories)) {
          for (let i = 0; i < data.goalie_skills_categories.length; i++) {
            if (!data.goalie_skills_categories[i]?.name) continue;
            await sql`INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to) VALUES (${catId}, ${data.goalie_skills_categories[i].name}, ${120 + i}, 'goalie_skills')`;
          }
        }
        return NextResponse.json({ success: true });
      }

      // Evaluation format: 'standard' (default) or 'round_robin' (team matchups).
      // Resilient to a pre-migration DB — a missing column just no-ops.
      case "format": {
        const fmt = data.eval_format === "round_robin" ? "round_robin" : "standard";
        try { await sql`UPDATE age_categories SET eval_format = ${fmt} WHERE id = ${catId}`; } catch { /* column not migrated */ }
        return NextResponse.json({ success: true, eval_format: fmt });
      }

      // Contact / non-contact group split (U15+). contact_groups = count of the
      // lowest-numbered groups that are contact; the rest are non-contact. Null/0
      // both sides = feature off. Resilient to a pre-migration DB.
      case "contact_split": {
        const c = Number.isInteger(data?.contact_groups) && data.contact_groups > 0 ? data.contact_groups : null;
        const nc = Number.isInteger(data?.non_contact_groups) && data.non_contact_groups > 0 ? data.non_contact_groups : null;
        try {
          await sql`UPDATE age_categories SET contact_groups = ${c}, non_contact_groups = ${nc} WHERE id = ${catId}`;
        } catch { /* columns not migrated */ }
        return NextResponse.json({ success: true, contact_groups: c, non_contact_groups: nc });
      }

      case "complete": {
        await sql`
          UPDATE age_categories SET setup_complete = true, status = 'active' WHERE id = ${catId}
        `;
        // Only fire on the first transition to complete — re-completing
        // an already-complete category is the edited_after_complete signal.
        if (!wasComplete) {
          const durationMs = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
          logEvent({ userId, role, event: "category.setup_completed", orgId, durationMs, metadata: { catId } });
        }
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown step" }, { status: 400 });
    }
  } catch (error) {
    // This route previously swallowed every exception with zero logging --
    // the real incident (a "" scoring_scale crashing an integer cast) left
    // no trace anywhere, only a generic 500 the client saw with no way to
    // diagnose what actually broke.
    console.error("Category setup POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
