import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const categories = await sql`
      SELECT ac.*,
        COUNT(DISTINCT a.id) as athletes_count,
        COUNT(DISTINCT es.id) as sessions_count,
        ac.setup_complete
      FROM age_categories ac
      LEFT JOIN athletes a ON a.age_category_id = ac.id AND a.is_active = true
      LEFT JOIN evaluation_schedule es ON es.age_category_id = ac.id
      WHERE ac.organization_id = ${params.orgId}
      GROUP BY ac.id
      ORDER BY ac.name
    `;
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { name, min_age, max_age } = await request.json();
    const result = await sql`
      INSERT INTO age_categories (organization_id, name, min_age, max_age)
      VALUES (${params.orgId}, ${name}, ${min_age || null}, ${max_age || null})
      RETURNING *
    `;
    return NextResponse.json({ category: result[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
