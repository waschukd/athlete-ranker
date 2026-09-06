import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { notifyTestingResultsUploaded } from "@/lib/scheduleNotify";

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

    // Only needed if a row's name matches nobody on the roster -- most uploads
    // never touch this.
    let orgId = null;

    const matched = [];
    const skipped = [];
    const created = [];

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
          continue;
        }

        // Real incident: a tester's results file included a kid who'd genuinely
        // tested but was never in the roster -- getting silently skipped meant
        // their results just vanished with no record they'd shown up at all.
        // Rather than lose that, register them fresh (organization admins can
        // fix up position/birth year/etc. afterward same as any other athlete).
        if (!orgId) {
          const [cat] = await sql`SELECT organization_id FROM age_categories WHERE id = ${catId}`;
          orgId = cat?.organization_id;
        }
        const rawFirst = row.first_name.trim();
        const rawLast = row.last_name.trim();
        const [newAthlete] = await sql`
          INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, is_active, notes)
          VALUES (${orgId}, ${catId}, ${rawFirst}, ${rawLast}, true, 'Added automatically from a testing results upload -- verify roster details (birth year, parent email, position).')
          RETURNING id, first_name, last_name
        `;
        athletes.push(newAthlete); // so a later duplicate row in the same file matches instead of creating twice
        created.push({ athlete_id: newAthlete.id, name: `${newAthlete.first_name} ${newAthlete.last_name}` });
        matched.push({ athlete_id: newAthlete.id, name: `${newAthlete.first_name} ${newAthlete.last_name}`, rank, tests });
        continue;
      }

      matched.push({ athlete_id: athlete.id, name: `${athlete.first_name} ${athlete.last_name}`, rank, tests });
    }

    // Insert/upsert overall rank (used by rankings). Each row's conflict key
    // (athlete_id, age_category_id, session_number) is unique per matched
    // athlete, so these can't race each other -- fire concurrently.
    await Promise.all(matched.map(m => sql`
      INSERT INTO testing_drill_results (athlete_id, age_category_id, session_number, overall_rank)
      VALUES (${m.athlete_id}, ${catId}, ${session_number}, ${m.rank})
      ON CONFLICT (athlete_id, age_category_id, session_number)
      DO UPDATE SET overall_rank = ${m.rank}, updated_at = NOW()
    `));

    // Insert/upsert the individual test values (used by the parent report).
    // Best-effort: degrades silently if the testing_results table isn't there.
    let testsStored = 0;
    try {
      const testUpserts = [];
      for (const m of matched) {
        // Index in the array = column position in the uploaded CSV, left to
        // right -- stored so the viewer can show drills in the order they
        // actually happened instead of an arbitrary/alphabetical order.
        (m.tests || []).forEach((t, order) => {
          const name = (t.name || "").trim();
          const value = parseFloat(t.value);
          if (!name || isNaN(value)) return;
          const trank = parseInt(t.rank);
          testUpserts.push(sql`
            INSERT INTO testing_results (athlete_id, age_category_id, session_number, test_name, value, test_rank, test_order)
            VALUES (${m.athlete_id}, ${catId}, ${session_number}, ${name}, ${value}, ${isNaN(trank) ? null : trank}, ${order})
            ON CONFLICT (athlete_id, age_category_id, session_number, test_name)
            DO UPDATE SET value = ${value}, test_rank = ${isNaN(trank) ? null : trank}, test_order = ${order}, updated_at = NOW()
          `);
        });
      }
      // Each (athlete, session, test_name) conflict key is unique within this
      // batch, same reasoning as above.
      await Promise.all(testUpserts);
      testsStored = testUpserts.length;
    } catch (e) {
      console.error("testing_results upsert skipped:", e.message);
    }

    try {
      await notifyTestingResultsUploaded({ catId, sessionNumber: session_number, matchedCount: matched.length });
    } catch (e) { console.error("notifyTestingResultsUploaded failed:", e?.message); }

    return NextResponse.json({
      success: true,
      matched: matched.length,
      created: created.length,
      skipped: skipped.length,
      tests_stored: testsStored,
      created_names: created.map(c => c.name),
      skipped_names: skipped.map(s => `${s.first_name} ${s.last_name}${s.reason ? ` (${s.reason})` : ""}`),
    });
  } catch (error) {
    console.error("Testing upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
