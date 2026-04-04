import { getSession } from "@/lib/auth";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
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
    const { searchParams } = new URL(request.url);
    const sessionNumber = searchParams.get("session");

    // Get scores grouped by evaluator for this session
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
