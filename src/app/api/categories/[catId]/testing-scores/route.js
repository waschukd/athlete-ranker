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

    const [category, drillRows, testRows] = await Promise.all([
      sql`SELECT id, name FROM age_categories WHERE id = ${catId}`,
      sql`
        SELECT tdr.athlete_id, tdr.session_number, tdr.overall_rank, a.first_name, a.last_name, a.position
        FROM testing_drill_results tdr
        JOIN athletes a ON a.id = tdr.athlete_id
        WHERE tdr.age_category_id = ${catId}
        ORDER BY tdr.session_number, tdr.overall_rank
      `,
      sql`
        SELECT athlete_id, session_number, test_name, value, test_rank, test_order
        FROM testing_results
        WHERE age_category_id = ${catId}
        ORDER BY session_number, athlete_id
      `,
    ]);

    // Per-athlete test breakdown, keyed by session_number
    const testsByAthleteSession = {};
    for (const t of testRows) {
      const key = `${t.session_number}_${t.athlete_id}`;
      if (!testsByAthleteSession[key]) testsByAthleteSession[key] = [];
      testsByAthleteSession[key].push({
        test_name: t.test_name,
        value: parseFloat(t.value),
        rank: t.test_rank,
      });
    }

    // Column order = the order drills happened in, left to right on the
    // original upload -- not alphabetical/insertion order, which scrambled
    // the sequence and made the results confusing to read.
    const testOrderBySession = {};
    for (const t of testRows) {
      if (!testOrderBySession[t.session_number]) testOrderBySession[t.session_number] = {};
      const known = testOrderBySession[t.session_number][t.test_name];
      if (t.test_order != null && (known == null || t.test_order < known)) {
        testOrderBySession[t.session_number][t.test_name] = t.test_order;
      } else if (known === undefined) {
        testOrderBySession[t.session_number][t.test_name] = null;
      }
    }
    const testNamesBySession = {};
    for (const [sNum, order] of Object.entries(testOrderBySession)) {
      testNamesBySession[sNum] = Object.keys(order).sort((a, b) => {
        const oa = order[a], ob = order[b];
        if (oa == null && ob == null) return a.localeCompare(b);
        if (oa == null) return 1;
        if (ob == null) return -1;
        return oa - ob;
      });
    }

    const sessionsMap = {};
    for (const row of drillRows) {
      const sNum = row.session_number;
      if (!sessionsMap[sNum]) {
        sessionsMap[sNum] = {
          session_number: sNum,
          test_names: [...(testNamesBySession[sNum] || [])],
          athletes: [],
        };
      }
      sessionsMap[sNum].athletes.push({
        athlete_id: row.athlete_id,
        first_name: row.first_name,
        last_name: row.last_name,
        position: row.position,
        overall_rank: row.overall_rank,
        tests: testsByAthleteSession[`${sNum}_${row.athlete_id}`] || [],
      });
    }

    // Athletes with NO row at all for a session that has data — the exact gap
    // that let Hannah Erickson's score go missing silently (name-match failed
    // at upload time, no error surfaced beyond a toast the admin may have missed).
    const allAthletes = await sql`
      SELECT id, first_name, last_name FROM athletes
      WHERE age_category_id = ${catId} AND is_active = true AND (position IS NULL OR position <> 'Goalie')
    `;
    for (const s of Object.values(sessionsMap)) {
      const coveredIds = new Set(s.athletes.map(a => a.athlete_id));
      s.missing = allAthletes.filter(a => !coveredIds.has(a.id)).map(a => ({ athlete_id: a.id, first_name: a.first_name, last_name: a.last_name }));
    }

    return NextResponse.json({
      category: category[0] || null,
      sessions: Object.values(sessionsMap).sort((a, b) => a.session_number - b.session_number),
    });
  } catch (error) {
    console.error("Testing scores error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
