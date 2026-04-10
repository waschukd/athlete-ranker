import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

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

      case "scoring": {
        // Update category scoring config
        await sql`
          UPDATE age_categories SET
            scoring_scale = ${data.scoring_scale},
            scoring_increment = ${data.scoring_increment},
            position_tagging = ${data.position_tagging},
            director_can_edit_scores = ${data.director_can_edit_scores || false}
          WHERE id = ${catId}
        `;

        // Recreate scoring categories
        await sql`DELETE FROM scoring_categories WHERE age_category_id = ${catId}`;
        for (let i = 0; i < data.categories.length; i++) {
          await sql`
            INSERT INTO scoring_categories (age_category_id, name, display_order, applies_to)
            VALUES (${catId}, ${data.categories[i].name}, ${i}, ${data.categories[i].applies_to || 'all'})
          `;
        }
        return NextResponse.json({ success: true });
      }

      case "complete": {
        await sql`
          UPDATE age_categories SET setup_complete = true, status = 'active' WHERE id = ${catId}
        `;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown step" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
