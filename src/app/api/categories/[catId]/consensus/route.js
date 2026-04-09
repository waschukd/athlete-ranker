import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { sendEmail } from "@/lib/email";

// Calculate standard deviation
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Agreement % = (1 - stdDev/scale) * 100, clamped 0-100
function agreementPct(values, scale = 10) {
  if (values.length < 2) return 100;
  const sd = stdDev(values);
  return Math.round(Math.max(0, Math.min(100, (1 - sd / scale) * 100)));
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("schedule_id");
    const sessionNumber = searchParams.get("session");

    const category = await sql`SELECT * FROM age_categories WHERE id = ${catId}`;
    const scale = parseFloat(category[0]?.scoring_scale || 10);

    // Get all scores for this session
    const scores = await sql`
      SELECT 
        cs.athlete_id, cs.scoring_category_id, cs.score, cs.evaluator_id,
        a.first_name, a.last_name, a.jersey_number,
        sc.name as category_name,
        u.name as evaluator_name,
        pc.team_color, pc.jersey_number as checkin_jersey
      FROM category_scores cs
      JOIN athletes a ON a.id = cs.athlete_id
      JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      JOIN users u ON u.id = cs.evaluator_id
      LEFT JOIN player_checkins pc ON pc.athlete_id = cs.athlete_id AND pc.schedule_id = ${scheduleId}
      WHERE cs.age_category_id = ${catId} AND cs.session_number = ${sessionNumber}
      ORDER BY a.last_name, a.first_name, sc.name
    `;

    // Build per-athlete consensus data
    const athleteMap = {};
    for (const row of scores) {
      if (!athleteMap[row.athlete_id]) {
        athleteMap[row.athlete_id] = {
          athlete_id: row.athlete_id,
          first_name: row.first_name,
          last_name: row.last_name,
          jersey_number: row.checkin_jersey,
          team_color: row.team_color,
          categories: {},
        };
      }
      if (!athleteMap[row.athlete_id].categories[row.scoring_category_id]) {
        athleteMap[row.athlete_id].categories[row.scoring_category_id] = {
          name: row.category_name,
          scores: [],
        };
      }
      athleteMap[row.athlete_id].categories[row.scoring_category_id].scores.push({
        score: parseFloat(row.score),
        evaluator: row.evaluator_name,
        evaluator_id: row.evaluator_id,
      });
    }

    // Calculate agreement per athlete
    const athletes = Object.values(athleteMap).map(a => {
      const catResults = Object.values(a.categories).map(cat => {
        const vals = cat.scores.map(s => s.score);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const agreement = agreementPct(vals, scale);
        return {
          name: cat.name,
          scores: cat.scores,
          avg: Math.round(avg * 10) / 10,
          agreement,
          spread: vals.length > 1 ? Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10 : 0,
          flagged: agreement < 80,
        };
      });

      const overallAgreement = catResults.length > 0
        ? Math.round(catResults.reduce((s, c) => s + c.agreement, 0) / catResults.length)
        : 100;

      return {
        ...a,
        categories: catResults,
        overall_agreement: overallAgreement,
        flagged: overallAgreement < 80,
        evaluator_count: new Set(scores.filter(s => s.athlete_id === a.athlete_id).map(s => s.evaluator_id)).size,
      };
    });

    athletes.sort((a, b) => a.overall_agreement - b.overall_agreement);

    const flaggedCount = athletes.filter(a => a.flagged).length;

    return NextResponse.json({ athletes, flagged_count: flaggedCount, scale });
  } catch (error) {
    console.error("Consensus GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { action, schedule_id, session_number, unreviewed_flags } = body;

    if (action === "close_session") {
      // Mark session as closed
      await sql`
        UPDATE evaluator_session_signups
        SET completed = true
        WHERE schedule_id = ${schedule_id}
      `;

      // ── Run integrity checks (batch — all evaluators at once) ──────────
      try {
        const schedInfo = await sql`
          SELECT es.start_time, es.end_time, es.scheduled_date, es.session_number, es.group_number,
            ac.organization_id,
            COUNT(pc.id) as total_checked_in
          FROM evaluation_schedule es
          JOIN age_categories ac ON ac.id = es.age_category_id
          LEFT JOIN player_checkins pc ON pc.schedule_id = es.id AND pc.checked_in = true
          WHERE es.id = ${schedule_id}
          GROUP BY es.id, ac.organization_id
        `;

        if (schedInfo.length) {
          const sched = schedInfo[0];
          const orgId = sched.organization_id;
          const totalCheckedIn = parseInt(sched.total_checked_in || 0);
          const now = new Date();

          // Get all evaluator signup data for this session
          const signups = await sql`
            SELECT ess.user_id as evaluator_id, ess.first_score_at, ess.last_score_at, ess.athletes_scored
            FROM evaluator_session_signups ess
            WHERE ess.schedule_id = ${schedule_id}
          `;

          for (const ev of signups) {
            if (!ev.first_score_at || !ev.last_score_at) continue;

            // CHECK 0: Too fast — scored everyone in < 25% of session time
            if (sched.start_time && sched.end_time && totalCheckedIn >= 5) {
              const sessionStart = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.start_time}`);
              const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
              const sessionDurationMins = (sessionEnd - sessionStart) / 60000;
              const scoringDurationMins = (new Date(ev.last_score_at) - new Date(ev.first_score_at)) / 60000;
              const pctOfSession = sessionDurationMins > 0 ? (scoringDurationMins / sessionDurationMins) * 100 : 100;
              const scoredAll = parseInt(ev.athletes_scored || 0) >= totalCheckedIn;

              if (scoredAll && pctOfSession < 25 && scoringDurationMins < 20) {
                await sql`
                  INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                  VALUES (${ev.evaluator_id}, ${orgId}, ${schedule_id}, 'too_fast', 'warning',
                    ${JSON.stringify({ scoring_duration_mins: Math.round(scoringDurationMins), session_duration_mins: Math.round(sessionDurationMins), pct_of_session: Math.round(pctOfSession), athletes_scored: ev.athletes_scored, note: 'Evaluator scored all players in under 25% of session time' })})
                  ON CONFLICT DO NOTHING
                `;
              }
            }

            // CHECK 1: Late scoring — last score after session end
            if (sched.end_time) {
              const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
              const minsLate = Math.round((new Date(ev.last_score_at) - sessionEnd) / 60000);
              if (minsLate > 15) {
                await sql`
                  INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                  VALUES (${ev.evaluator_id}, ${orgId}, ${schedule_id}, 'late_scoring', 'warning',
                    ${JSON.stringify({ minutes_late: minsLate, session: `S${sched.session_number} G${sched.group_number}`, note: 'Scores submitted after session end time' })})
                  ON CONFLICT DO NOTHING
                `;
              }
            }

            // CHECK 2: Incomplete scoring — didn't score everyone
            if (totalCheckedIn > 0) {
              const scored = parseInt(ev.athletes_scored || 0);
              if (scored < totalCheckedIn) {
                const missing = totalCheckedIn - scored;
                await sql`
                  INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                  VALUES (${ev.evaluator_id}, ${orgId}, ${schedule_id}, 'incomplete',
                    ${missing > totalCheckedIn * 0.3 ? 'critical' : 'warning'},
                    ${JSON.stringify({ athletes_scored: scored, total_checked_in: totalCheckedIn, missing, session: `S${sched.session_number} G${sched.group_number}` })})
                  ON CONFLICT DO NOTHING
                `;
              }
            }
          }

          // CHECK 3: Score copy detection — single self-join for ALL evaluator pairs
          if (session_number) {
            const copies = await sql`
              SELECT a.evaluator_id AS eval_a, b.evaluator_id AS eval_b,
                COUNT(*) AS shared_scores,
                SUM(CASE WHEN a.score = b.score THEN 1 ELSE 0 END) AS exact_matches,
                AVG(ABS(a.score - b.score)) AS avg_diff
              FROM category_scores a
              JOIN category_scores b ON b.athlete_id = a.athlete_id
                AND b.age_category_id = a.age_category_id
                AND b.session_number = a.session_number
                AND b.scoring_category_id = a.scoring_category_id
                AND b.evaluator_id > a.evaluator_id
              WHERE a.age_category_id = ${catId} AND a.session_number = ${session_number}
              GROUP BY a.evaluator_id, b.evaluator_id
              HAVING COUNT(*) >= 5
            `;

            for (const pair of copies) {
              const exactMatchRate = parseInt(pair.exact_matches) / parseInt(pair.shared_scores);
              const avgDiff = parseFloat(pair.avg_diff || 99);
              if (exactMatchRate > 0.8 && avgDiff < 0.3) {
                // Flag both evaluators
                for (const evalId of [pair.eval_a, pair.eval_b]) {
                  await sql`
                    INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                    VALUES (${evalId}, ${orgId}, ${schedule_id}, 'score_copy_suspected', 'critical',
                      ${JSON.stringify({ exact_match_rate: (exactMatchRate * 100).toFixed(0) + '%', avg_score_diff: avgDiff.toFixed(2), shared_scores: pair.shared_scores, note: 'Scores are statistically too similar to another evaluator' })})
                    ON CONFLICT DO NOTHING
                  `;
                }
              }
            }
          }
        }
      } catch (integrityErr) {
        // Don't fail the session close if integrity checks error
        console.error("Integrity check error:", integrityErr);
      }

      // If there were unreviewed flagged players, notify SP
      if (unreviewed_flags && unreviewed_flags.length > 0) {
        const schedInfo = await sql`
          SELECT es.*, ac.name as category_name, o.name as org_name, o.id as org_id
          FROM evaluation_schedule es
          JOIN age_categories ac ON ac.id = es.age_category_id
          JOIN organizations o ON o.id = ac.organization_id
          WHERE es.id = ${schedule_id}
        `;

        if (schedInfo.length) {
          const s = schedInfo[0];
          const spAdmins = await sql`
            SELECT u.email, u.name FROM users u
            JOIN sp_association_links sal ON sal.service_provider_id = u.organization_id
            JOIN organizations o ON o.contact_email = u.email
            WHERE sal.association_id = ${s.org_id}
          `;

          const playerList = unreviewed_flags.map(p => `- ${p.first_name} ${p.last_name} — ${p.overall_agreement}% agreement`).join("\n");
          const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
            <h2 style="color:#f59e0b;">⚠️ Consensus Not Reviewed</h2>
            <p>Evaluators closed <strong>${s.category_name} — Group ${s.group_number}</strong> on ${s.scheduled_date?.toString().split("T")[0]} without reviewing all flagged players.</p>
            <p><strong>Unreviewed players (below 80% agreement):</strong></p>
            <pre style="background:#f9fafb;padding:12px;border-radius:8px;font-size:13px;">${playerList}</pre>
            <p style="color:#6b7280;font-size:13px;">These players may require additional review or re-evaluation.</p>
          </div>`;

          for (const admin of spAdmins) {
            await sendEmail(admin.email, `⚠️ Consensus Skipped — ${s.category_name} Group ${s.group_number}`, html);
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Consensus POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
