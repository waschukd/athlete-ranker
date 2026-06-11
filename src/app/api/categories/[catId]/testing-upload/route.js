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
    // results = [{ first_name, last_name, overall_rank, tests?: [{ name, value, rank }] }]
    // `tests` is the full SportTesting per-test breakdown (kept for reporting);
    // overall_rank alone is what rankings use.

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
      const tests = Array.isArray(row.tests) ? row.tests : [];

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
          matched.push({ athlete_id: partial.id, name: `${partial.first_name} ${partial.last_name}`, rank, tests });
        } else {
          skipped.push({ ...row, reason: "No name match" });
        }
        continue;
      }

      matched.push({ athlete_id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}`, rank, tests });
    }

    // Insert/upsert overall rank (used by rankings)
    for (const m of matched) {
      await sql`
        INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank)
        VALUES (${m.athlete_id}, ${catId}, ${session_number}, ${m.rank})
        ON CONFLICT (athlete_id, age_category_id, session_number)
        DO UPDATE SET overall_rank = ${m.rank}, updated_at = NOW()
      `;
    }

    // Insert/upsert the individual test values (used by the parent report).
    // Best-effort: degrades silently if the testing_results table isn't there.
    let testsStored = 0;
    try {
      for (const m of matched) {
        for (const t of (m.tests || [])) {
          const name = (t.name || "").trim();
          const value = parseFloat(t.value);
          if (!name || isNaN(value)) continue;
          const trank = parseInt(t.rank);
          await sql`
            INSERT INTO testing_results (athlete_id, age_category_id, session_number, test_name, value, test_rank)
            VALUES (${m.athlete_id}, ${catId}, ${session_number}, ${name}, ${value}, ${isNaN(trank) ? null : trank})
            ON CONFLICT (athlete_id, age_category_id, session_number, test_name)
            DO UPDATE SET value = ${value}, test_rank = ${isNaN(trank) ? null : trank}, updated_at = NOW()
          `;
          testsStored++;
        }
      }
    } catch (e) {
      console.error("testing_results upsert skipped:", e.message);
    }

    return NextResponse.json({
      success: true,
      matched: matched.length,
      skipped: skipped.length,
      tests_stored: testsStored,
      skipped_names: skipped.map(s => `${s.first_name} ${s.last_name}${s.reason ? ` (${s.reason})` : ""}`),
    });
  } catch (error) {
    console.error("Testing upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
