import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

// ── PATCH: Edit a single evaluator score (admin/director override) ────────
export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Directors need explicit permission
    if (session.role === "director") {
      const cat = await sql`SELECT director_can_edit_scores FROM age_categories WHERE id = ${catId}`;
      if (!cat.length || !cat[0].director_can_edit_scores) {
        return NextResponse.json({ error: "Directors cannot edit scores for this category" }, { status: 403 });
      }
    }

    const editorId = await getAppUserId(session);
    const { athlete_id, evaluator_id, scoring_category_id, session_number, new_score, reason } = await request.json();

    if (!athlete_id || !evaluator_id || !scoring_category_id || !session_number || new_score === undefined) {
      return NextResponse.json({ error: "athlete_id, evaluator_id, scoring_category_id, session_number, new_score required" }, { status: 400 });
    }

    // Validate score against category scale
    const category = await sql`SELECT scoring_scale, scoring_increment FROM age_categories WHERE id = ${catId}`;
    const scale = parseFloat(category[0]?.scoring_scale || 10);
    const increment = parseFloat(category[0]?.scoring_increment || 1);
    const score = parseFloat(new_score);
    if (isNaN(score) || score < 0 || score > scale) {
      return NextResponse.json({ error: `Score must be between 0 and ${scale}` }, { status: 400 });
    }

    // Get old score
    const existing = await sql`
      SELECT score FROM category_scores
      WHERE athlete_id = ${athlete_id} AND evaluator_id = ${evaluator_id}
        AND scoring_category_id = ${scoring_category_id} AND session_number = ${session_number}
        AND age_category_id = ${catId}
    `;
    if (!existing.length) return NextResponse.json({ error: "Score not found" }, { status: 404 });
    const oldScore = parseFloat(existing[0].score);

    // Update score
    await sql`
      UPDATE category_scores SET score = ${score}, updated_at = NOW()
      WHERE athlete_id = ${athlete_id} AND evaluator_id = ${evaluator_id}
        AND scoring_category_id = ${scoring_category_id} AND session_number = ${session_number}
        AND age_category_id = ${catId}
    `;

    // Get evaluator name and scoring category name for audit
    const evaluator = await sql`SELECT name FROM users WHERE id = ${evaluator_id}`;
    const scoringCat = await sql`SELECT name FROM scoring_categories WHERE id = ${scoring_category_id}`;

    // Audit log
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
      VALUES (${editorId}, 'score_override', 'athlete', ${athlete_id}, ${scoringCat[0]?.name || scoring_category_id},
        ${oldScore.toString()}, ${score.toString()},
        ${JSON.stringify({
          evaluator_id,
          evaluator_name: evaluator[0]?.name || "Unknown",
          session_number,
          scoring_category_id,
          reason: reason || null,
          editor_role: session.role,
        })},
        ${catId})
    `;

    return NextResponse.json({ success: true, old_score: oldScore, new_score: score });
  } catch (error) {
    console.error("PATCH score error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const sessionNumber = searchParams.get("session");
    const evaluatorId = searchParams.get("evaluator");

    let deleted;

    if (evaluatorId) {
      // Delete specific evaluator's scores for a session
      deleted = await sql`
        DELETE FROM category_scores
        WHERE age_category_id = ${catId}
          AND session_number = ${sessionNumber}
          AND evaluator_id = ${evaluatorId}
        RETURNING id
      `;
    } else if (sessionNumber) {
      // Delete ALL scores for a session
      deleted = await sql`
        DELETE FROM category_scores
        WHERE age_category_id = ${catId}
          AND session_number = ${sessionNumber}
        RETURNING id
      `;
    } else {
      return NextResponse.json({ error: "session number required" }, { status: 400 });
    }

    return NextResponse.json({ success: true, deleted: deleted.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const sessionNumber = searchParams.get("session");
    const search = searchParams.get("search");

    // Search mode: return detailed per-evaluator scores for matching athletes
    if (search && !sessionNumber) {
      const searchPattern = `%${search}%`;
      const detailedScores = await sql`
        SELECT cs.athlete_id, cs.session_number, cs.evaluator_id, cs.scoring_category_id, cs.score,
          a.first_name, a.last_name, a.jersey_number,
          u.name as evaluator_name,
          sc.name as category_name, sc.display_order
        FROM category_scores cs
        JOIN athletes a ON a.id = cs.athlete_id
        JOIN users u ON u.id = cs.evaluator_id
        JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
        WHERE cs.age_category_id = ${catId}
          AND (LOWER(a.first_name || ' ' || a.last_name) LIKE LOWER(${searchPattern})
               OR CAST(a.jersey_number AS TEXT) = ${search})
        ORDER BY a.last_name, a.first_name, cs.session_number, u.name, sc.display_order
      `;

      // Get scoring categories for column headers
      const scoringCats = await sql`SELECT id, name FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;

      return NextResponse.json({ scores: detailedScores, scoringCategories: scoringCats });
    }

    // Default mode: scores grouped by evaluator for a specific session
    const scores = await sql`
      SELECT
        u.id as evaluator_id, u.name as evaluator_name, u.email,
        COUNT(DISTINCT cs.athlete_id) as athletes_scored,
        MIN(cs.created_at) as first_score,
        MAX(cs.updated_at) as last_score
      FROM category_scores cs
      JOIN users u ON u.id = cs.evaluator_id
      WHERE cs.age_category_id = ${catId}
        AND cs.session_number = ${sessionNumber}
      GROUP BY u.id
      ORDER BY u.name
    `;

    return NextResponse.json({ scores });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { evaluatorName, sessionNumber, rows } = await request.json();

    if (!evaluatorName || !sessionNumber || !rows?.length) {
      return NextResponse.json({ error: "evaluatorName, sessionNumber, and rows required" }, { status: 400 });
    }

    // Find or create a user record for this evaluator name
    let evaluatorUser = await sql`SELECT id FROM users WHERE name = ${evaluatorName} LIMIT 1`;
    if (!evaluatorUser.length) {
      const fakeEmail = `manual_${evaluatorName.toLowerCase().replace(/\s+/g, "_")}@manual.upload`;
      await sql`INSERT INTO auth_users (email, name) VALUES (${fakeEmail}, ${evaluatorName}) ON CONFLICT (email) DO NOTHING`;
      const [newUser] = await sql`
        INSERT INTO users (email, name, role) VALUES (${fakeEmail}, ${evaluatorName}, 'association_evaluator')
        ON CONFLICT (email) DO UPDATE SET name = ${evaluatorName}
        RETURNING id
      `;
      evaluatorUser = [newUser];
    }
    const evaluatorId = evaluatorUser[0].id;

    // Get scoring categories for this age category in order
    const scoringCats = await sql`SELECT id, name FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;

    // Delete existing scores from this evaluator for this session (overwrite)
    await sql`DELETE FROM category_scores WHERE age_category_id = ${catId} AND session_number = ${sessionNumber} AND evaluator_id = ${evaluatorId}`;

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const { first_name, last_name, scores, notes } = row;
      const athlete = await sql`
        SELECT id FROM athletes WHERE age_category_id = ${catId}
          AND LOWER(first_name) = LOWER(${first_name})
          AND LOWER(last_name) = LOWER(${last_name})
          AND is_active = true
        LIMIT 1
      `;
      if (!athlete.length) { skipped++; continue; }
      const athleteId = athlete[0].id;

      for (let i = 0; i < scoringCats.length; i++) {
        const score = parseFloat(scores[i]);
        if (isNaN(score)) continue;
        await sql`
          INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, notes, scored_via, updated_at)
          VALUES (${athleteId}, ${catId}, ${sessionNumber}, ${evaluatorId}, ${scoringCats[i].id}, ${score}, ${notes || null}, 'manual_upload', NOW())
          ON CONFLICT (athlete_id, session_number, evaluator_id, scoring_category_id)
          DO UPDATE SET score = ${score}, notes = ${notes || null}, scored_via = 'manual_upload', updated_at = NOW()
        `;
      }
      imported++;
    }

    return NextResponse.json({ success: true, imported, skipped });
  } catch (error) {
    console.error("Manual score upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
