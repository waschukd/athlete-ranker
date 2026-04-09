import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

async function getAppUserId(session) {
  if (!session?.email) return null;
  const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return user[0]?.id || null;
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const appUserId = await getAppUserId(session);

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get("schedule_id");
    const catId = searchParams.get("category_id");

    const athletes = await sql`
      SELECT 
        a.id, a.first_name, a.last_name, a.external_id, a.position,
        pc.jersey_number, pc.team_color, pc.checked_in,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'scoring_category_id', cs.scoring_category_id,
              'score', cs.score,
              'notes', cs.notes
            )
          ) FILTER (WHERE cs.id IS NOT NULL),
          '[]'
        ) as scores
      FROM player_checkins pc
      JOIN athletes a ON a.id = pc.athlete_id
      LEFT JOIN category_scores cs ON cs.athlete_id = a.id
        AND cs.evaluator_id = ${appUserId}
        AND cs.age_category_id = ${catId}
      WHERE pc.schedule_id = ${scheduleId} AND pc.checked_in = true
      GROUP BY a.id, pc.jersey_number, pc.team_color, pc.checked_in
      ORDER BY pc.jersey_number, a.last_name
    `;

    const scoringCats = await sql`
      SELECT * FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order
    `;

    return NextResponse.json({ athletes, scoringCategories: scoringCats });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const appUserId = await getAppUserId(session);

    const body = await request.json();
    const { athlete_id, category_id, session_number, scores, notes, jersey_number, scored_via, schedule_id } = body;

    if (!athlete_id || !category_id || !session_number) {
      return NextResponse.json({ error: "athlete_id, category_id, session_number required" }, { status: 400 });
    }

    const now = new Date();

    // Upsert each score
    for (const { scoring_category_id, score } of scores) {
      if (score === null || score === undefined) continue;

      const existing = await sql`
        SELECT score FROM category_scores
        WHERE athlete_id = ${athlete_id}
          AND age_category_id = ${category_id}
          AND session_number = ${session_number}
          AND evaluator_id = ${appUserId}
          AND scoring_category_id = ${scoring_category_id}
      `;

      await sql`
        INSERT INTO category_scores (
          athlete_id, age_category_id, session_number, evaluator_id,
          scoring_category_id, score, notes, scored_via, jersey_number, updated_at
        )
        VALUES (
          ${athlete_id}, ${category_id}, ${session_number}, ${appUserId},
          ${scoring_category_id}, ${score}, ${notes || null}, ${scored_via || 'manual'}, ${jersey_number || null}, NOW()
        )
        ON CONFLICT (athlete_id, session_number, evaluator_id, scoring_category_id)
        DO UPDATE SET score = ${score}, notes = ${notes || null}, scored_via = ${scored_via || 'manual'}, updated_at = NOW()
      `;

      if (existing.length && parseFloat(existing[0].score) !== parseFloat(score)) {
        await sql`
          INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, age_category_id)
          VALUES (${appUserId}, 'score_updated', 'athlete', ${athlete_id}, 'score',
            ${existing[0].score?.toString()}, ${score?.toString()}, ${category_id})
        `;
      }
    }

    // Save notes — upsert to prevent duplicates from repeated syncs
    if (notes?.trim()) {
      const existing = await sql`
        SELECT id, note_text FROM player_notes
        WHERE athlete_id = ${athlete_id}
          AND age_category_id = ${category_id}
          AND session_number = ${session_number}
          AND evaluator_id = ${appUserId}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (existing.length) {
        // Only update if text actually changed
        if (existing[0].note_text !== notes.trim()) {
          await sql`
            UPDATE player_notes SET note_text = ${notes}, scored_via = ${scored_via || 'manual'}, updated_at = NOW()
            WHERE id = ${existing[0].id}
          `;
        }
      } else {
        await sql`
          INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via)
          VALUES (${athlete_id}, ${category_id}, ${session_number}, ${appUserId}, ${notes}, ${scored_via || 'manual'})
        `;
      }
    }

    // Update signup timing + auto-calculate hours + run integrity checks
    if (schedule_id) {
      const signup = await sql`
        SELECT ess.id, ess.first_score_at, ess.athletes_scored
        FROM evaluator_session_signups ess
        WHERE ess.user_id = ${appUserId} AND ess.schedule_id = ${schedule_id}
      `;

      if (signup.length) {
        const isFirstScore = !signup[0].first_score_at;

        const scoredCount = await sql`
          SELECT COUNT(DISTINCT athlete_id) as count
          FROM category_scores
          WHERE evaluator_id = ${appUserId}
            AND age_category_id = ${category_id}
            AND session_number = ${session_number}
        `;
        const athletesScored = parseInt(scoredCount[0].count);

        await sql`
          UPDATE evaluator_session_signups SET
            first_score_at = COALESCE(first_score_at, NOW()),
            last_score_at = NOW(),
            athletes_scored = ${athletesScored}
          WHERE id = ${signup[0].id}
        `;

        // Get schedule details for checks
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

          // ── INTEGRITY CHECK 0: Front-loading / too fast ──
          // Flag if evaluator scored all players in less than 25% of the session duration
          if (!isFirstScore && sched.start_time && sched.end_time && totalCheckedIn >= 5) {
            const updatedSignup = await sql`SELECT first_score_at, last_score_at, athletes_scored FROM evaluator_session_signups WHERE id = ${signup[0].id}`;
            if (updatedSignup.length && updatedSignup[0].first_score_at && updatedSignup[0].last_score_at) {
              const sessionStart = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.start_time}`);
              const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
              const sessionDurationMins = (sessionEnd - sessionStart) / 60000;
              const scoringDurationMins = (new Date(updatedSignup[0].last_score_at) - new Date(updatedSignup[0].first_score_at)) / 60000;
              const pctOfSession = sessionDurationMins > 0 ? (scoringDurationMins / sessionDurationMins) * 100 : 100;
              const scoredAll = parseInt(updatedSignup[0].athletes_scored) >= totalCheckedIn;

              // Flag if they scored everyone in under 25% of the session time
              if (scoredAll && pctOfSession < 25 && scoringDurationMins < 20) {
                const existingFlag = await sql`SELECT id FROM evaluator_flags WHERE evaluator_id = ${appUserId} AND schedule_id = ${schedule_id} AND flag_type = 'too_fast'`;
                if (!existingFlag.length) {
                  await sql`
                    INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                    VALUES (
                      ${appUserId}, ${orgId}, ${schedule_id}, 'too_fast', 'warning',
                      ${JSON.stringify({
                        scoring_duration_mins: Math.round(scoringDurationMins),
                        session_duration_mins: Math.round(sessionDurationMins),
                        pct_of_session: Math.round(pctOfSession),
                        athletes_scored: updatedSignup[0].athletes_scored,
                        note: 'Evaluator scored all players in under 25% of session time — possible front-loading'
                      })}
                    )
                  `;
                }
              }
            }
          }

          // ── INTEGRITY CHECK 1: Late scoring ──
          // Flag if evaluator is submitting scores AFTER session end time
          if (sched.end_time) {
            const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
            if (now > sessionEnd) {
              const minsLate = Math.round((now - sessionEnd) / 60000);
              // Only flag if substantially late (>15 min) and this is a late submission pattern
              if (minsLate > 15) {
                await sql`
                  INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                  VALUES (
                    ${appUserId}, ${orgId}, ${schedule_id}, 'late_scoring', 'warning',
                    ${JSON.stringify({ minutes_late: minsLate, session: `S${sched.session_number} G${sched.group_number}`, note: 'Scores submitted after session end time' })}
                  )
                  ON CONFLICT DO NOTHING
                `;
              }
            }
          }

          // ── AUTO-CALCULATE HOURS on first score ──
          if (isFirstScore && sched.start_time && sched.end_time) {
            const [sh, sm] = sched.start_time.toString().split(":").map(Number);
            const [eh, em] = sched.end_time.toString().split(":").map(Number);
            const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

            await sql`
              INSERT INTO evaluator_hours (evaluator_id, organization_id, schedule_id, session_date, hours_worked, status)
              VALUES (${appUserId}, ${orgId}, ${schedule_id}, ${sched.scheduled_date}, ${hours}, 'pending')
              ON CONFLICT (evaluator_id, schedule_id) DO NOTHING
            `;
          }

          // ── INTEGRITY CHECK 2: Incomplete scoring ──
          // Check at session end if evaluator didn't score everyone
          if (sched.end_time && totalCheckedIn > 0) {
            const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
            if (now > sessionEnd && athletesScored < totalCheckedIn) {
              const missing = totalCheckedIn - athletesScored;
              await sql`
                INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                VALUES (
                  ${appUserId}, ${orgId}, ${schedule_id}, 'incomplete',
                  ${missing > totalCheckedIn * 0.3 ? 'critical' : 'warning'},
                  ${JSON.stringify({ athletes_scored: athletesScored, total_checked_in: totalCheckedIn, missing, session: `S${sched.session_number} G${sched.group_number}` })}
                )
                ON CONFLICT DO NOTHING
              `;
            }
          }

          // ── INTEGRITY CHECK 3: Score copying detection ──
          // Only run AFTER session end — compare scores with other evaluators
          if (sched.end_time) {
            const sessionEnd = new Date(`${sched.scheduled_date?.toString().split("T")[0]}T${sched.end_time}`);
            if (now > sessionEnd) {
              // Get all evaluators who scored in this session
              const otherEvals = await sql`
                SELECT DISTINCT evaluator_id FROM category_scores
                WHERE age_category_id = ${category_id}
                  AND session_number = ${session_number}
                  AND evaluator_id != ${appUserId}
              `;

              for (const other of otherEvals) {
                // Compare scores for athletes both evaluators scored
                const comparison = await sql`
                  SELECT 
                    COUNT(*) as shared_athletes,
                    AVG(ABS(a.score - b.score)) as avg_diff,
                    SUM(CASE WHEN a.score = b.score THEN 1 ELSE 0 END) as exact_matches
                  FROM category_scores a
                  JOIN category_scores b ON b.athlete_id = a.athlete_id
                    AND b.age_category_id = a.age_category_id
                    AND b.session_number = a.session_number
                    AND b.scoring_category_id = a.scoring_category_id
                    AND b.evaluator_id = ${other.evaluator_id}
                  WHERE a.evaluator_id = ${appUserId}
                    AND a.age_category_id = ${category_id}
                    AND a.session_number = ${session_number}
                `;

                if (comparison.length && parseInt(comparison[0].shared_athletes) >= 5) {
                  const exactMatchRate = parseInt(comparison[0].exact_matches) / parseInt(comparison[0].shared_athletes);
                  const avgDiff = parseFloat(comparison[0].avg_diff || 99);

                  // Flag if >80% exact matches AND avg diff < 0.3 — highly suspicious
                  if (exactMatchRate > 0.8 && avgDiff < 0.3) {
                    await sql`
                      INSERT INTO evaluator_flags (evaluator_id, organization_id, schedule_id, flag_type, severity, details)
                      VALUES (
                        ${appUserId}, ${orgId}, ${schedule_id}, 'score_copy_suspected', 'critical',
                        ${JSON.stringify({
                          compared_with_evaluator: other.evaluator_id,
                          exact_match_rate: (exactMatchRate * 100).toFixed(0) + '%',
                          avg_score_diff: avgDiff.toFixed(2),
                          shared_athletes: comparison[0].shared_athletes,
                          note: 'Scores are statistically too similar to another evaluator post-session'
                        })}
                      )
                      ON CONFLICT DO NOTHING
                    `;
                  }
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Score submit error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
