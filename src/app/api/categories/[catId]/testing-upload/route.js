import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { session_number, results } = body;
    // results = [{ first_name, last_name, overall_rank }]

    const athletes = await sql`
      SELECT id, first_name, last_name FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true
    `;

    const matched = [];
    const skipped = [];

    for (const row of results) {
      const firstName = row.first_name?.trim().toLowerCase();
      const lastName = row.last_name?.trim().toLowerCase();
      const rank = parseInt(row.overall_rank || row.overall_ranking);

      if (!firstName || !lastName || isNaN(rank)) { skipped.push(row); continue; }

      // Match by first + last name (case insensitive)
      const athlete = athletes.find(a =>
        a.first_name.toLowerCase() === firstName &&
        a.last_name.toLowerCase() === lastName
      );

      if (!athlete) {
        // Try last name only if first name partial match
        const partial = athletes.find(a =>
          a.last_name.toLowerCase() === lastName &&
          a.first_name.toLowerCase().startsWith(firstName[0])
        );
        if (partial) {
          matched.push({ athlete_id: partial.id, name: `${partial.first_name} ${partial.last_name}`, rank });
        } else {
          skipped.push({ ...row, reason: "No name match" });
        }
        continue;
      }

      matched.push({ athlete_id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}`, rank });
    }

    // Insert/upsert testing results
    for (const m of matched) {
      await sql`
        INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank)
        VALUES (${m.athlete_id}, ${catId}, ${session_number}, ${m.rank})
        ON CONFLICT (athlete_id, age_category_id, session_number)
        DO UPDATE SET overall_rank = ${m.rank}, updated_at = NOW()
      `;
    }

    return NextResponse.json({
      success: true,
      matched: matched.length,
      skipped: skipped.length,
      skipped_names: skipped.map(s => `${s.first_name} ${s.last_name}${s.reason ? ` (${s.reason})` : ""}`),
    });
  } catch (error) {
    console.error("Testing upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
