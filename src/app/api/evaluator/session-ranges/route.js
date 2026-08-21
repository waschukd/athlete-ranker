// Per-group score ranges for a session — every group that exists for this
// category+session, not just the ones before the one currently being scored
// (that's session-floor's job, which stays as the one-sided "don't undercut"
// guard). This is calibration context: "Group 1 landed 7.0-9.0, Group 2 is at
// 7.5-9.5" so an evaluator who thinks a player deserves to beat Group 1's top
// score knows exactly what number that takes. Naturally evolves as more
// scores land within a session, and differs session to session since it's
// scoped to one session_number's own data.
//
// Deliberately never names a player or flags anyone as a "bubble" case --
// that's a group-level number, not an individual signal, so it doesn't
// anchor an evaluator's opinion of any one kid the way a per-player flag
// would.
//
// Returns: { ranges: [{ group_number, floor, ceiling, athletes_counted }] }

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const catId = searchParams.get("category_id");
    const sessionNumber = searchParams.get("session_number");

    if (!catId || !sessionNumber) {
      return NextResponse.json({ error: "category_id and session_number required" }, { status: 400 });
    }

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await sql`
      WITH scored AS (
        SELECT cs.athlete_id, cs.score, sg.group_number
        FROM category_scores cs
        JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
        JOIN session_groups sg ON sg.id = pga.session_group_id
          AND sg.age_category_id = cs.age_category_id
          AND sg.session_number = cs.session_number
        WHERE cs.age_category_id = ${catId} AND cs.session_number = ${sessionNumber}
      ),
      athlete_avgs AS (
        SELECT athlete_id, group_number, AVG(score)::float AS avg_score
        FROM scored GROUP BY athlete_id, group_number
      )
      SELECT
        sg.group_number,
        MIN(aa.avg_score)::float AS floor,
        MAX(aa.avg_score)::float AS ceiling,
        COUNT(aa.athlete_id)::int AS athletes_counted
      FROM session_groups sg
      LEFT JOIN athlete_avgs aa ON aa.group_number = sg.group_number
      WHERE sg.age_category_id = ${catId} AND sg.session_number = ${sessionNumber}
      GROUP BY sg.group_number
      ORDER BY sg.group_number
    `;

    const ranges = rows.map(r => ({
      group_number: r.group_number,
      floor: r.floor != null ? Math.round(r.floor * 10) / 10 : null,
      ceiling: r.ceiling != null ? Math.round(r.ceiling * 10) / 10 : null,
      athletes_counted: r.athletes_counted || 0,
    }));

    return NextResponse.json({ ranges });
  } catch (error) {
    console.error("Session ranges error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
