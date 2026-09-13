// Slipped-finger scores, for the service provider to approve.
//
// An evaluator means 7 and enters 0.5. lib/scoreSlips finds these from the
// evaluator's OWN other scores for the same athlete in the same session -- it
// never judges one evaluator against another. Every hit becomes a pending
// suggestion here; nothing changes until the SP approves it.
//
// GET  ?org=  -> scans the last 14 days of scores across every category this SP
//                staffs, records any new slips, returns everything still pending.
//                The SP dashboard calls this on load, so "ask me every time I
//                log in" is exactly what happens.
// POST { action: "approve" | "dismiss", id }
//      approve writes the suggested value to category_scores, audited as an
//      SP correction with the original and the reason kept.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId, resolveSpContext } from "@/lib/auth";
import { detectSlips } from "@/lib/scoreSlips";

const SP_ADMIN_ROLES = new Set(["super_admin", "service_provider_admin", "goalie_service_provider_admin"]);
const LOOKBACK_DAYS = 14;

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS score_slip_suggestions (
      id SERIAL PRIMARY KEY,
      category_score_id INTEGER NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL,
      age_category_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      athlete_id INTEGER NOT NULL,
      evaluator_id INTEGER NOT NULL,
      scoring_category_id INTEGER NOT NULL,
      original_score NUMERIC NOT NULL,
      suggested_score NUMERIC NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS score_slip_org_status_idx ON score_slip_suggestions (organization_id, status)`.catch(() => {});
}

async function spCategoryIds(spId) {
  return (await sql`
    SELECT c.id, c.scoring_scale, c.scoring_increment FROM age_categories c
    WHERE c.organization_id = ${spId}
       OR c.organization_id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId} AND status = 'active')`);
}

async function scan(spId) {
  const cats = await spCategoryIds(spId);
  if (!cats.length) return 0;
  const byCat = new Map(cats.map(c => [c.id, c]));
  const rows = await sql`
    SELECT id, evaluator_id, athlete_id, age_category_id, session_number, scoring_category_id, score
    FROM category_scores
    WHERE age_category_id = ANY(${cats.map(c => c.id)})
      AND updated_at >= NOW() - (${LOOKBACK_DAYS} * INTERVAL '1 day')`;
  // Detect per category so scale/increment are right for each.
  const perCat = new Map();
  for (const r of rows) { if (!perCat.has(r.age_category_id)) perCat.set(r.age_category_id, []); perCat.get(r.age_category_id).push(r); }
  let added = 0;
  for (const [catId, list] of perCat) {
    const c = byCat.get(catId);
    const hits = detectSlips(list, { scale: parseFloat(c.scoring_scale || 10), increment: parseFloat(c.scoring_increment || 1) });
    for (const h of hits) {
      // A score already reviewed (approved or dismissed) is never re-raised
      // unless the evaluator has since changed it -- ON CONFLICT keeps the row.
      const r = await sql`
        INSERT INTO score_slip_suggestions
          (category_score_id, organization_id, age_category_id, session_number, athlete_id, evaluator_id, scoring_category_id, original_score, suggested_score, reason)
        VALUES (${h.score_id}, ${spId}, ${h.age_category_id}, ${h.session_number}, ${h.athlete_id}, ${h.evaluator_id}, ${h.scoring_category_id}, ${h.original}, ${h.suggested}, ${h.reason})
        ON CONFLICT (category_score_id) DO NOTHING RETURNING id`;
      added += r.length;
    }
  }
  return added;
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SP_ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const { orgId: spId } = await resolveSpContext(session, searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });

    await ensureTable();
    const added = await scan(spId);

    // Pending only, and only where the evaluator has not already fixed it
    // themselves -- if the live score no longer matches what was flagged,
    // the suggestion is stale and is closed out quietly.
    await sql`
      UPDATE score_slip_suggestions s SET status = 'resolved', reviewed_at = NOW()
      FROM category_scores cs
      WHERE s.category_score_id = cs.id AND s.status = 'pending' AND s.organization_id = ${spId}
        AND cs.score::numeric <> s.original_score`;

    const pending = await sql`
      SELECT s.id, s.original_score::float AS original, s.suggested_score::float AS suggested, s.reason, s.created_at,
             s.session_number, a.first_name || ' ' || a.last_name AS athlete, u.name AS evaluator,
             sc.name AS criterion, c.name AS category, o.name AS org, s.age_category_id
      FROM score_slip_suggestions s
      JOIN athletes a ON a.id = s.athlete_id
      JOIN users u ON u.id = s.evaluator_id
      JOIN scoring_categories sc ON sc.id = s.scoring_category_id
      JOIN age_categories c ON c.id = s.age_category_id
      JOIN organizations o ON o.id = c.organization_id
      WHERE s.organization_id = ${spId} AND s.status = 'pending'
      ORDER BY s.created_at DESC`;
    return NextResponse.json({ pending, added });
  } catch (e) {
    console.error("score-slips GET:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SP_ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const { orgId: spId } = await resolveSpContext(session, body.org);
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });
    const adminId = await getAppUserId(session);
    const id = parseInt(body.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await ensureTable();
    const [s] = await sql`SELECT * FROM score_slip_suggestions WHERE id = ${id} AND organization_id = ${spId} AND status = 'pending'`;
    if (!s) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 });

    if (body.action === "dismiss") {
      await sql`UPDATE score_slip_suggestions SET status = 'dismissed', reviewed_by = ${adminId}, reviewed_at = NOW() WHERE id = ${id}`;
      return NextResponse.json({ success: true, status: "dismissed" });
    }
    if (body.action !== "approve") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    // Only apply if the score is still what was flagged. If the evaluator has
    // fixed it in the meantime, their value stands and this closes as resolved.
    const [cs] = await sql`SELECT id, score FROM category_scores WHERE id = ${s.category_score_id}`;
    if (!cs) return NextResponse.json({ error: "Score no longer exists" }, { status: 404 });
    if (parseFloat(cs.score) !== parseFloat(s.original_score)) {
      await sql`UPDATE score_slip_suggestions SET status = 'resolved', reviewed_by = ${adminId}, reviewed_at = NOW() WHERE id = ${id}`;
      return NextResponse.json({ success: true, status: "resolved", note: "The evaluator already changed this score; their value was kept." });
    }

    await sql`UPDATE category_scores SET score = ${s.suggested_score}, updated_at = NOW() WHERE id = ${s.category_score_id}`;
    await sql`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, field_changed, old_value, new_value, notes, age_category_id)
      VALUES (${adminId}, 'score_slip_approved', 'athlete', ${s.athlete_id}, 'score',
        ${String(s.original_score)}, ${String(s.suggested_score)},
        ${JSON.stringify({ evaluator_id: s.evaluator_id, scoring_category_id: s.scoring_category_id, session_number: s.session_number, reason: s.reason, suggestion_id: id })},
        ${s.age_category_id})`;
    await sql`UPDATE score_slip_suggestions SET status = 'approved', reviewed_by = ${adminId}, reviewed_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ success: true, status: "approved", from: parseFloat(s.original_score), to: parseFloat(s.suggested_score) });
  } catch (e) {
    console.error("score-slips POST:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
