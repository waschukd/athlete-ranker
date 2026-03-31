import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const flags = await sql`
      SELECT
        af.*,
        a.first_name, a.last_name, a.position, a.external_id,
        u.name as acknowledged_by_name
      FROM athlete_flags af
      JOIN athletes a ON a.id = af.athlete_id
      LEFT JOIN users u ON u.id = af.acknowledged_by
      WHERE af.age_category_id = ${catId}
      ORDER BY af.created_at DESC
    `;

    return NextResponse.json({ flags });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { action, flag_id } = await request.json();

    if (action === "acknowledge") {
      const userRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
      const userId = userRes[0]?.id;
      await sql`
        UPDATE athlete_flags
        SET acknowledged = true, acknowledged_by = ${userId}, acknowledged_at = NOW()
        WHERE id = ${flag_id}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "detect") {
      // Get all sessions for this category
      const sessions = await sql`SELECT * FROM category_sessions WHERE age_category_id = ${catId} ORDER BY session_number`;
      const athletes = await sql`SELECT id FROM athletes WHERE age_category_id = ${catId} AND is_active = true`;
      const N = athletes.length;

      // Get normalized scores per athlete per session from rankings
      // We'll calculate directly here to avoid circular fetch
      const scoreRows = await sql`
        WITH per_category AS (
          SELECT
            athlete_id, session_number, scoring_category_id,
            AVG(score) as cat_avg
          FROM category_scores
          WHERE age_category_id = ${catId}
          GROUP BY athlete_id, session_number, scoring_category_id
        )
        SELECT athlete_id, session_number, AVG(cat_avg) as session_avg
        FROM per_category
        GROUP BY athlete_id, session_number
      `;

      const testingRows = await sql`
        SELECT DISTINCT ON (athlete_id, session_number) athlete_id, session_number, overall_rank
        FROM testing_drill_results
        WHERE age_category_id = ${catId}
        ORDER BY athlete_id, session_number
      `;

      // Build normalized score map per session
      const rawBySession = {};
      for (const row of scoreRows) {
        const sNum = parseInt(row.session_number);
        if (!rawBySession[sNum]) rawBySession[sNum] = [];
        rawBySession[sNum].push({ athlete_id: row.athlete_id, avg: parseFloat(row.session_avg) });
      }

      const normalizedMap = {}; // { athleteId: { sessionNum: normalizedScore } }

      for (const [sNum, rows] of Object.entries(rawBySession)) {
        const avgs = rows.map(r => r.avg);
        const min = Math.min(...avgs);
        const max = Math.max(...avgs);
        const range = max - min;
        for (const row of rows) {
          const normalized = range > 0 ? ((row.avg - min) / range) * 100 : 50;
          if (!normalizedMap[row.athlete_id]) normalizedMap[row.athlete_id] = {};
          normalizedMap[row.athlete_id][parseInt(sNum)] = normalized;
        }
      }

      for (const t of testingRows) {
        const percentile = N > 1 ? ((N - parseInt(t.overall_rank)) / (N - 1)) * 100 : 100;
        if (!normalizedMap[t.athlete_id]) normalizedMap[t.athlete_id] = {};
        normalizedMap[t.athlete_id][parseInt(t.session_number)] = percentile;
      }

      let flagsCreated = 0;

      for (const session of sessions) {
        const sNum = session.session_number;
        const sessionScores = Object.entries(normalizedMap)
          .map(([id, sessions]) => ({ athlete_id: parseInt(id), score: sessions[sNum] }))
          .filter(s => s.score !== undefined);

        if (sessionScores.length < 3) continue;

        // Session mean and SD for outlier detection
        const mean = sessionScores.reduce((s, r) => s + r.score, 0) / sessionScores.length;
        const sd = Math.sqrt(sessionScores.reduce((s, r) => s + Math.pow(r.score - mean, 2), 0) / sessionScores.length);

        for (const { athlete_id, score } of sessionScores) {
          const zScore = sd > 0 ? (score - mean) / sd : 0;
          const flagsToInsert = [];

          // Session outlier: >2 SD below mean
          if (zScore < -2) {
            flagsToInsert.push({
              flag_type: "session_outlier",
              severity: zScore < -2.5 ? "critical" : "warning",
              details: { z_score: Math.round(zScore * 100) / 100, session_mean: Math.round(mean * 10) / 10, athlete_score: Math.round(score * 10) / 10 }
            });
          }

          // Personal drop: compare to athlete's own previous session average
          const prevSessions = sessions
            .filter(s => s.session_number < sNum)
            .map(s => normalizedMap[athlete_id]?.[s.session_number])
            .filter(s => s !== undefined);

          if (prevSessions.length >= 1) {
            const prevMean = prevSessions.reduce((a, b) => a + b, 0) / prevSessions.length;
            const prevSD = prevSessions.length > 1
              ? Math.sqrt(prevSessions.reduce((s, v) => s + Math.pow(v - prevMean, 2), 0) / prevSessions.length)
              : prevMean * 0.15; // assume 15% SD if only one prior session
            const dropThreshold = prevMean - 1.5 * Math.max(prevSD, 5);
            if (score < dropThreshold) {
              flagsToInsert.push({
                flag_type: "personal_drop",
                severity: score < prevMean - 2.5 * Math.max(prevSD, 5) ? "critical" : "warning",
                details: { prev_avg: Math.round(prevMean * 10) / 10, current_score: Math.round(score * 10) / 10, drop: Math.round((prevMean - score) * 10) / 10 }
              });
            }
          }

          for (const flag of flagsToInsert) {
            // Only insert if not already flagged for this athlete+session+type
            const existing = await sql`
              SELECT id FROM athlete_flags
              WHERE athlete_id = ${athlete_id} AND age_category_id = ${catId}
                AND session_number = ${sNum} AND flag_type = ${flag.flag_type}
            `;
            if (!existing.length) {
              await sql`
                INSERT INTO athlete_flags (athlete_id, age_category_id, session_number, flag_type, severity, details)
                VALUES (${athlete_id}, ${catId}, ${sNum}, ${flag.flag_type}, ${flag.severity}, ${JSON.stringify(flag.details)})
              `;
              flagsCreated++;
            }
          }
        }
      }

      return NextResponse.json({ success: true, flags_created: flagsCreated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Flags error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
