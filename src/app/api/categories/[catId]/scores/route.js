import { getSession, getAppUserId } from "@/lib/auth";
import { authorizeCategoryAccess, isOrgLead } from "@/lib/authorize";

import { NextResponse } from "next/server";
import sql from "@/lib/db";

// This whole route is the admin/director score-management tool (override,
// bulk delta, delete, manual-upload import) -- authorizeCategoryAccess alone
// also admits plain evaluators, who should only ever submit their OWN scores
// through the separate live-scoring path (evaluator/scores). Every handler
// below needs this on top of authorizeCategoryAccess.
const SCORE_MANAGE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin", "director"]);

// An org's designated lead gets the same score-management rights as an admin,
// but ONLY within that one association -- checked per-request against
// auth.orgId (never session.role, which has no notion of "lead"). Every
// handler below needs this on top of authorizeCategoryAccess + the check.
async function canManageScores(session, editorId, orgId) {
  if (SCORE_MANAGE_ROLES.has(session.role)) return { allowed: true, asLead: false };
  if (await isOrgLead(editorId, orgId)) return { allowed: true, asLead: true };
  return { allowed: false, asLead: false };
}

// ── PATCH: Edit a single evaluator score (admin/director override) ────────
export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const editorId = await getAppUserId(session);
    const { allowed, asLead } = await canManageScores(session, editorId, auth.orgId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { athlete_id, evaluator_id, scoring_category_id, session_number, new_score, reason } = body;

    // ── Bulk bump: shift ALL of one player's scores up/down by a whole number of
    // levels (delta), clamped to the scale. For correcting a player an evaluator
    // mis-placed. Optionally scoped to one evaluator and/or session. Audited.
    if (body.action === "bump") {
      const delta = parseFloat(body.delta);
      if (!athlete_id || !Number.isFinite(delta) || delta === 0) {
        return NextResponse.json({ error: "athlete_id and a non-zero delta are required" }, { status: 400 });
      }
      if (session.role === "director" && !(reason && String(reason).trim())) {
        return NextResponse.json({ error: "A reason is required for a director score adjustment" }, { status: 400 });
      }
      const [cat] = await sql`SELECT scoring_scale FROM age_categories WHERE id = ${catId}`;
      const scale = parseFloat(cat?.scoring_scale || 10);
      const evId = body.evaluator_id ? parseInt(body.evaluator_id) : null;
      const sess = body.session_number ? parseInt(body.session_number) : null;
      const rows = await sql`
        SELECT id, score FROM category_scores
        WHERE athlete_id = ${athlete_id} AND age_category_id = ${catId}
          AND (${evId}::int IS NULL OR evaluator_id = ${evId})
          AND (${sess}::int IS NULL OR session_number = ${sess})`;
      let changed = 0;
      for (const r of rows) {
        const oldS = parseFloat(r.score);
        const newS = Math.max(0, Math.min(scale, Math.round((oldS + delta) * 100) / 100));
        if (newS !== oldS) {
          await sql`UPDATE category_scores SET score = ${newS}, updated_at = NOW() WHERE id = ${r.id}`;
          changed++;
        }
      }
      await sql`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
        VALUES (${editorId}, 'score_bump', 'athlete', ${athlete_id}, 'all scores',
          ${(delta > 0 ? "+" : "") + delta + " levels"}, ${changed + " scores"},
          ${JSON.stringify({ delta, changed, evaluator_id: evId, session_number: sess, reason: reason || null, editor_role: session.role, acted_as: asLead ? "association_lead" : session.role })}, ${catId})`;
      return NextResponse.json({ success: true, changed, delta });
    }

    if (!athlete_id || !evaluator_id || !scoring_category_id || !session_number || new_score === undefined) {
      return NextResponse.json({ error: "athlete_id, evaluator_id, scoring_category_id, session_number, new_score required" }, { status: 400 });
    }

    // Directors may correct scores, but must record a reason (audited).
    if (session.role === "director" && !(reason && String(reason).trim())) {
      return NextResponse.json({ error: "A reason is required for a director score correction" }, { status: 400 });
    }

    // Validate score against category scale
    const category = await sql`SELECT scoring_scale, scoring_increment FROM age_categories WHERE id = ${catId}`;
    const scale = parseFloat(category[0]?.scoring_scale || 10);
    const increment = parseFloat(category[0]?.scoring_increment || 1);
    const score = parseFloat(new_score);
    if (isNaN(score) || score < 0 || score > scale) {
      return NextResponse.json({ error: `Score must be between 0 and ${scale}` }, { status: 400 });
    }

    // Get old score
    const existing = await sql`
      SELECT score FROM category_scores
      WHERE athlete_id = ${athlete_id} AND evaluator_id = ${evaluator_id}
        AND scoring_category_id = ${scoring_category_id} AND session_number = ${session_number}
        AND age_category_id = ${catId}
    `;
    if (!existing.length) return NextResponse.json({ error: "Score not found" }, { status: 404 });
    const oldScore = parseFloat(existing[0].score);

    // Update score
    await sql`
      UPDATE category_scores SET score = ${score}, updated_at = NOW()
      WHERE athlete_id = ${athlete_id} AND evaluator_id = ${evaluator_id}
        AND scoring_category_id = ${scoring_category_id} AND session_number = ${session_number}
        AND age_category_id = ${catId}
    `;

    // Get evaluator name and scoring category name for audit
    const evaluator = await sql`SELECT name FROM users WHERE id = ${evaluator_id}`;
    const scoringCat = await sql`SELECT name FROM scoring_categories WHERE id = ${scoring_category_id}`;

    // Audit log
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
      VALUES (${editorId}, 'score_override', 'athlete', ${athlete_id}, ${scoringCat[0]?.name || scoring_category_id},
        ${oldScore.toString()}, ${score.toString()},
        ${JSON.stringify({
          evaluator_id,
          evaluator_name: evaluator[0]?.name || "Unknown",
          session_number,
          scoring_category_id,
          reason: reason || null,
          editor_role: session.role,
          acted_as: asLead ? "association_lead" : session.role,
        })},
        ${catId})
    `;

    return NextResponse.json({ success: true, old_score: oldScore, new_score: score });
  } catch (error) {
    console.error("PATCH score error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const editorId = await getAppUserId(session);
    const { allowed } = await canManageScores(session, editorId, auth.orgId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (session.role === "director") {
      return NextResponse.json({ error: "Directors cannot delete scores" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sessionNumber = searchParams.get("session");
    const evaluatorId = searchParams.get("evaluator");

    let deleted;

    if (evaluatorId) {
      // Delete specific evaluator's scores for a session
      deleted = await sql`
        DELETE FROM category_scores
        WHERE age_category_id = ${catId}
          AND session_number = ${sessionNumber}
          AND evaluator_id = ${evaluatorId}
        RETURNING id
      `;
    } else if (sessionNumber) {
      // Delete ALL scores for a session
      deleted = await sql`
        DELETE FROM category_scores
        WHERE age_category_id = ${catId}
          AND session_number = ${sessionNumber}
        RETURNING id
      `;
    } else {
      return NextResponse.json({ error: "session number required" }, { status: 400 });
    }

    // Bulk score deletion had no audit trail at all before this -- for anyone,
    // not just leads. Given a lead's write access now reaches this same
    // destructive, irreversible action, it needs one.
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
      VALUES (${editorId}, 'scores_deleted', 'category_scores', ${sessionNumber}, 'session_number',
        ${deleted.length + " scores"}, '0 scores',
        ${JSON.stringify({ session_number: sessionNumber, evaluator_id: evaluatorId || null, editor_role: session.role, acted_as: SCORE_MANAGE_ROLES.has(session.role) ? session.role : "association_lead" })},
        ${catId})
    `;

    return NextResponse.json({ success: true, deleted: deleted.length });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const editorId = await getAppUserId(session);
    const { allowed } = await canManageScores(session, editorId, auth.orgId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const sessionNumber = searchParams.get("session");
    const search = searchParams.get("search");
    const evaluatorId = searchParams.get("evaluator");
    const detailed = searchParams.get("detailed");

    // The session-summary view (used by ScoreManager) keys off `?session=N`
    // alone. The detailed editor passes `detailed=1`, which lets it also use
    // the `session` param as a filter without colliding with summary mode.
    const isSummary = sessionNumber && !detailed;

    // Detailed mode: per-evaluator scores grouped by athlete, filterable by
    // player (name/jersey), evaluator, and session — each filter optional and
    // composable. With no filters we return every scored athlete in the
    // category alphabetically so the Scores tab has a default list to browse.
    if (!isSummary) {
      const searchPattern = search ? `%${search}%` : null;
      const evalFilter = evaluatorId ? parseInt(evaluatorId) : null;
      const sessFilter = sessionNumber ? parseInt(sessionNumber) : null;

      const detailedScores = await sql`
        SELECT cs.athlete_id, cs.session_number, cs.evaluator_id, cs.scoring_category_id, cs.score,
          a.first_name, a.last_name, a.jersey_number,
          u.name as evaluator_name,
          sc.name as category_name, sc.display_order
        FROM category_scores cs
        JOIN athletes a ON a.id = cs.athlete_id
        JOIN users u ON u.id = cs.evaluator_id
        JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
        WHERE cs.age_category_id = ${catId}
          AND (${searchPattern}::text IS NULL
               OR LOWER(a.first_name || ' ' || a.last_name) LIKE LOWER(${searchPattern})
               OR CAST(a.jersey_number AS TEXT) = ${search})
          AND (${evalFilter}::int IS NULL OR cs.evaluator_id = ${evalFilter})
          AND (${sessFilter}::int IS NULL OR cs.session_number = ${sessFilter})
        ORDER BY a.last_name, a.first_name, cs.session_number, u.name, sc.display_order
      `;

      // Column headers + full filter option lists (independent of the active
      // filters, so the dropdowns stay stable as you narrow the results).
      const scoringCats = await sql`SELECT id, name FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;
      const evaluators = await sql`
        SELECT DISTINCT u.id, u.name
        FROM category_scores cs JOIN users u ON u.id = cs.evaluator_id
        WHERE cs.age_category_id = ${catId}
        ORDER BY u.name
      `;
      const sessionRows = await sql`
        SELECT DISTINCT session_number FROM category_scores
        WHERE age_category_id = ${catId} ORDER BY session_number
      `;

      return NextResponse.json({
        scores: detailedScores,
        scoringCategories: scoringCats,
        evaluators,
        sessions: sessionRows.map(r => r.session_number),
      });
    }

    // Default mode: scores grouped by evaluator for a specific session
    const scores = await sql`
      SELECT
        u.id as evaluator_id, u.name as evaluator_name, u.email,
        COUNT(DISTINCT cs.athlete_id) as athletes_scored,
        MIN(cs.created_at) as first_score,
        MAX(cs.updated_at) as last_score
      FROM category_scores cs
      JOIN users u ON u.id = cs.evaluator_id
      WHERE cs.age_category_id = ${catId}
        AND cs.session_number = ${sessionNumber}
      GROUP BY u.id
      ORDER BY u.name
    `;

    return NextResponse.json({ scores });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const postEditorId = await getAppUserId(session);
    const { allowed } = await canManageScores(session, postEditorId, auth.orgId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { evaluatorName, sessionNumber, rows } = await request.json();

    if (!evaluatorName || !sessionNumber || !rows?.length) {
      return NextResponse.json({ error: "evaluatorName, sessionNumber, and rows required" }, { status: 400 });
    }

    // Find or create a user record for this evaluator name
    let evaluatorUser = await sql`SELECT id FROM users WHERE name = ${evaluatorName} LIMIT 1`;
    if (!evaluatorUser.length) {
      const fakeEmail = `manual_${evaluatorName.toLowerCase().replace(/\s+/g, "_")}@manual.upload`;
      await sql`INSERT INTO auth_users (email, name) VALUES (${fakeEmail}, ${evaluatorName}) ON CONFLICT (email) DO NOTHING`;
      const [newUser] = await sql`
        INSERT INTO users (email, name, role) VALUES (${fakeEmail}, ${evaluatorName}, 'association_evaluator')
        ON CONFLICT (email) DO UPDATE SET name = ${evaluatorName}
        RETURNING id
      `;
      evaluatorUser = [newUser];
    }
    const evaluatorId = evaluatorUser[0].id;

    // Get scoring categories for this age category in order
    const scoringCats = await sql`SELECT id, name FROM scoring_categories WHERE age_category_id = ${catId} ORDER BY display_order`;

    // Delete existing scores from this evaluator for this session (overwrite)
    await sql`DELETE FROM category_scores WHERE age_category_id = ${catId} AND session_number = ${sessionNumber} AND evaluator_id = ${evaluatorId}`;

    // Resolve every row's athlete-name lookup concurrently -- reads, independent
    // of each other and of everything that follows.
    const athleteLookups = await Promise.all(rows.map(row => sql`
      SELECT id FROM athletes WHERE age_category_id = ${catId}
        AND LOWER(first_name) = LOWER(${row.first_name})
        AND LOWER(last_name) = LOWER(${row.last_name})
        AND is_active = true
      LIMIT 1
    `));

    let imported = 0;
    let skipped = 0;
    const scoreUpserts = [];
    const noteTasks = [];

    rows.forEach((row, idx) => {
      const { scores, notes } = row;
      const athlete = athleteLookups[idx];
      if (!athlete.length) { skipped++; return; }
      const athleteId = athlete[0].id;

      // Each upsert's conflict key is (athlete_id, session_number, evaluator_id,
      // scoring_category_id) -- distinct athlete_id per row, distinct category_id
      // per iteration, so nothing here can collide with anything else in the batch.
      for (let i = 0; i < scoringCats.length; i++) {
        const score = parseFloat(scores[i]);
        if (isNaN(score)) continue;
        scoreUpserts.push(sql`
          INSERT INTO category_scores (athlete_id, age_category_id, session_number, evaluator_id, scoring_category_id, score, notes, scored_via, updated_at)
          VALUES (${athleteId}, ${catId}, ${sessionNumber}, ${evaluatorId}, ${scoringCats[i].id}, ${score}, ${notes || null}, 'manual_upload', NOW())
          ON CONFLICT (athlete_id, session_number, evaluator_id, scoring_category_id)
          DO UPDATE SET score = ${score}, notes = ${notes || null}, scored_via = 'manual_upload', updated_at = NOW()
        `);
      }

      // category_scores.notes above is write-only -- every report/export reads
      // free-form notes from player_notes instead (the live-scoring path writes
      // both). Without this, a note entered via bulk upload silently never
      // appears anywhere. This is a SELECT-then-write, not a plain upsert, but
      // each row targets a distinct (athlete_id, session_number, evaluator_id) key
      // so different rows' note tasks can still run concurrently with each other.
      if (notes?.trim()) {
        noteTasks.push((async () => {
          const existingNote = await sql`
            SELECT id, note_text FROM player_notes
            WHERE athlete_id = ${athleteId} AND age_category_id = ${catId}
              AND session_number = ${sessionNumber} AND evaluator_id = ${evaluatorId}
            ORDER BY created_at DESC LIMIT 1
          `;
          if (existingNote.length) {
            if (existingNote[0].note_text !== notes.trim()) {
              await sql`UPDATE player_notes SET note_text = ${notes}, scored_via = 'manual_upload', updated_at = NOW() WHERE id = ${existingNote[0].id}`;
            }
          } else {
            await sql`
              INSERT INTO player_notes (athlete_id, age_category_id, session_number, evaluator_id, note_text, scored_via)
              VALUES (${athleteId}, ${catId}, ${sessionNumber}, ${evaluatorId}, ${notes}, 'manual_upload')
            `;
          }
        })());
      }

      imported++;
    });

    await Promise.all([...scoreUpserts, ...noteTasks]);

    return NextResponse.json({ success: true, imported, skipped });
  } catch (error) {
    console.error("Manual score upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
