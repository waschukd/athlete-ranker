import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { logEvent } from "@/lib/analytics";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

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

    return NextResponse.json({ category, sessions, scoringCategories });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        // Delete existing sessions and recreate
        await sql`DELETE FROM category_sessions WHERE age_category_id = ${catId}`;
        for (const session of data.sessions) {
          await sql`
            INSERT INTO category_sessions (age_category_id, session_number, name, session_type, weight_percentage)
            VALUES (${catId}, ${session.session_number}, ${session.name}, ${session.session_type}, ${session.weight_percentage})
          `;
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
        // SKATER scoring only. Goalie config/categories are handled in goalie_scoring.
        await sql`
          UPDATE age_categories SET
            scoring_scale = ${data.scoring_scale},
            scoring_increment = ${data.scoring_increment},
            position_tagging = ${data.position_tagging},
            director_can_edit_scores = ${data.director_can_edit_scores || false},
            evaluators_anonymous = ${data.evaluators_anonymous ?? true}
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
