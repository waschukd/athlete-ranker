import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athlete_id, age_category_id, bulk } = await request.json();

    if (!age_category_id) return NextResponse.json({ error: "age_category_id required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, age_category_id);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const users = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const userId = users[0]?.id;

    // Bulk generate for all athletes in category
    if (bulk) {
      const athletes = await sql`SELECT id FROM athletes WHERE age_category_id = ${age_category_id} AND is_active = true`;
      const links = [];
      for (const a of athletes) {
        const existing = await sql`SELECT token FROM report_links WHERE athlete_id = ${a.id} AND age_category_id = ${age_category_id}`;
        if (existing.length) {
          links.push({ athlete_id: a.id, token: existing[0].token });
        } else {
          const result = await sql`
            INSERT INTO report_links (athlete_id, age_category_id, organization_id, created_by)
            VALUES (${a.id}, ${age_category_id}, ${auth.orgId}, ${userId})
            RETURNING token
          `;
          links.push({ athlete_id: a.id, token: result[0].token });
        }
      }
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
      return NextResponse.json({
        success: true,
        links: links.map(l => ({ ...l, url: `${baseUrl}/report/${l.token}` })),
        count: links.length,
      });
    }

    // Single athlete
    if (!athlete_id) return NextResponse.json({ error: "athlete_id required" }, { status: 400 });

    const existing = await sql`SELECT token FROM report_links WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id}`;
    if (existing.length) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
      return NextResponse.json({ token: existing[0].token, url: `${baseUrl}/report/${existing[0].token}` });
    }

    const result = await sql`
      INSERT INTO report_links (athlete_id, age_category_id, organization_id, created_by)
      VALUES (${athlete_id}, ${age_category_id}, ${auth.orgId}, ${userId})
      RETURNING token
    `;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com";
    return NextResponse.json({ token: result[0].token, url: `${baseUrl}/report/${result[0].token}` });
  } catch (error) {
    console.error("Generate link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
