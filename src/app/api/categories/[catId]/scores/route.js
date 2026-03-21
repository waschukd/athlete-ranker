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
