import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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

    // Verify user has access to this category
    const auth = await authorizeCategoryAccess(session, category_id);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Verify evaluator is signed up for this schedule (skip for admins)
    if (schedule_id && !["super_admin", "association_admin", "service_provider_admin"].includes(session.role)) {
      const signup = await sql`
        SELECT id FROM evaluator_session_signups
        WHERE user_id = ${appUserId} AND schedule_id = ${schedule_id}
      `;
      if (!signup.length) return NextResponse.json({ error: "Not signed up for this session" }, { status: 403 });
    }

    // Verify athlete is checked in for this session
    if (schedule_id && !["super_admin", "association_admin", "service_provider_admin"].includes(session.role)) {
      const checkin = await sql`
        SELECT id FROM player_checkins
        WHERE athlete_id = ${athlete_id} AND schedule_id = ${schedule_id} AND checked_in = true
      `;
      if (!checkin.length) return NextResponse.json({ error: "Athlete not checked in for this session" }, { status: 400 });
    }

    const validScores = (scores || []).filter(s => s.score !== null && s.score !== undefined);

    // ── 1. Get existing scores for audit comparison (single query) ────────
    const existingScores = validScores.length > 0
      ? await sql`
          SELECT scoring_category_id, score FROM category_scores
          WHERE athlete_id = ${athlete_id}
            AND age_category_id = ${category_id}
            AND session_number = ${session_number}
            AND evaluator_id = ${appUserId}
        `
      : [];
    const existingMap = new Map(existingScores.map(r => [r.scoring_category_id, parseFloat(r.score)]));

    // ── 2. Transaction: batch upsert scores + audit log + notes ──────────
    const txnQueries = [];

    // Batch upsert all scores via individual ON CONFLICT statements in one transaction
    for (const { scoring_category_id, score } of validScores) {
      txnQueries.push(sql`
        INSERT INTO category_scores (
          athlete_id, age_category_id, session_number, evaluator_id,
          scoring_category_id, score, notes, scored_via, jersey_number, updated_at
        ) VALUES (
          ${athlete_id}, ${category_id}, ${session_number}, ${appUserId},
          ${scoring_category_id}, ${score}, ${notes || null}, ${scored_via || 'manual'}, ${jersey_number || null}, NOW()
        )
        ON CONFLICT (athlete_id, session_number, evaluator_id, scoring_category_id)
        DO UPDATE SET score = ${score}, notes = ${notes || null}, scored_via = ${scored_via || 'manual'}, updated_at = NOW()
      `);

      // Audit log for changed scores
      const oldScore = existingMap.get(scoring_category_id);
      if (oldScore !== undefined && oldScore !== parseFloat(score)) {
        txnQueries.push(sql`
          INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, age_category_id)
          VALUES (${appUserId}, 'score_updated', 'athlete', ${athlete_id}, 'score',
            ${oldScore.toString()}, ${score.toString()}, ${category_id})
        `);
      }
    }

    // Notes upsert inside transaction
    if (notes?.trim()) {
      const existingNote = await sql`
        SELECT id, note_text FROM player_notes
        WHERE athlete_id = ${athlete_id}
          AND age_category_id = ${category_id}
          AND session_number = ${session_number}
          AND evaluator_id = ${appUserId}
        ORDER BY created_at DESC LIMIT 1
      `;
      if (existingNote.length) {
        if (existingNote[0].note_text !== notes.trim()) {
          txnQueries.push(sql`
            UPDATE player_notes SET note_text = ${notes}, scored_via = ${scored_via || 'manual'}, updated_at = NOW()
            WHERE id = ${existingNote[0].id}
          `);
        }
      } else {
        txnQueries.push(sql`
          INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via)
          VALUES (${athlete_id}, ${category_id}, ${session_number}, ${appUserId}, ${notes}, ${scored_via || 'manual'})
        `);
      }
    }

    // Execute transaction (all score upserts + audits + notes atomically)
    if (txnQueries.length > 0) {
      await sql.transaction(txnQueries);
    }

    // ── 3. Signup tracking (outside transaction — non-critical) ──────────
    if (schedule_id) {
      const signup = await sql`
        SELECT ess.id, ess.first_score_at
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

        // Auto-calculate hours on first score only
        if (isFirstScore) {
          const schedInfo = await sql`
            SELECT es.start_time, es.end_time, es.scheduled_date, ac.organization_id
            FROM evaluation_schedule es
            JOIN age_categories ac ON ac.id = es.age_category_id
            WHERE es.id = ${schedule_id}
          `;
          if (schedInfo.length) {
            const sched = schedInfo[0];
            if (sched.start_time && sched.end_time) {
              const [sh, sm] = sched.start_time.toString().split(":").map(Number);
              const [eh, em] = sched.end_time.toString().split(":").map(Number);
              const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
              await sql`
                INSERT INTO evaluator_hours (evaluator_id, organization_id, schedule_id, session_date, hours_worked, status)
                VALUES (${appUserId}, ${sched.organization_id}, ${schedule_id}, ${sched.scheduled_date}, ${hours}, 'pending')
                ON CONFLICT (evaluator_id, schedule_id) DO NOTHING
              `;
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Score submit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
