import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const spId = await resolveSpOrgId(session, searchParams.get("org"));
    if (!spId) return NextResponse.json({ error: "Not a service provider" }, { status: 403 });
    const evaluators = await sql`
      SELECT u.id, u.name, u.email, u.role, em.created_at as joined_at, em.status as membership_status, em.hourly_rate,
        COUNT(DISTINCT ess.id) FILTER (WHERE ess.status = 'signed_up' OR ess.status = 'completed') as total_sessions,
        COUNT(DISTINCT ess.id) FILTER (WHERE ess.no_show = true) as no_shows,
        COUNT(DISTINCT ess.id) FILTER (WHERE ess.completed = true) as completed_sessions,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE ess.no_show IS NOT true), 0) as total_hours,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'pending' AND ess.no_show IS NOT true), 0) as pending_hours,
        COALESCE(SUM(eh.hours_worked) FILTER (WHERE eh.status = 'approved'), 0) as approved_hours,
        COALESCE(AVG(er.rating), 0) as avg_rating,
        COUNT(DISTINCT er.id) as rating_count,
        COUNT(DISTINCT ef.id) FILTER (WHERE ef.reviewed = false) as open_flags
      FROM evaluator_memberships em
      JOIN users u ON u.id = em.user_id
      LEFT JOIN evaluator_session_signups ess ON ess.user_id = u.id
      LEFT JOIN evaluator_hours eh ON eh.evaluator_id = u.id AND eh.schedule_id = ess.schedule_id
        AND eh.organization_id IN (SELECT association_id FROM sp_association_links WHERE service_provider_id = ${spId} AND status = 'active')
      LEFT JOIN evaluator_ratings er ON er.evaluator_id = u.id AND er.organization_id = ${spId}
      LEFT JOIN evaluator_flags ef ON ef.evaluator_id = u.id AND ef.organization_id = ${spId}
      WHERE em.organization_id = ${spId} AND em.status != 'deleted'
      GROUP BY u.id, em.created_at, em.status, em.hourly_rate ORDER BY u.name
    `;
    const flags = await sql`
      SELECT ef.*, u.name as evaluator_name, es.session_number, es.scheduled_date, o.name as org_name
      FROM evaluator_flags ef
      JOIN users u ON u.id = ef.evaluator_id
      LEFT JOIN evaluation_schedule es ON es.id = ef.schedule_id
      LEFT JOIN organizations o ON o.id = ef.organization_id
      WHERE ef.organization_id = ${spId} AND ef.reviewed = false
      ORDER BY ef.created_at DESC LIMIT 20
    `;
    const pendingHours = await sql`
      SELECT eh.*, u.name as evaluator_name, es.session_number, es.scheduled_date, es.start_time, es.end_time, ac.name as category_name, o.name as org_name
      FROM evaluator_hours eh
      JOIN users u ON u.id = eh.evaluator_id
      JOIN evaluation_schedule es ON es.id = eh.schedule_id
      JOIN age_categories ac ON ac.id = es.age_category_id
      JOIN organizations o ON o.id = ac.organization_id
      WHERE eh.organization_id = ${spId} AND eh.status = 'pending'
      ORDER BY eh.session_date DESC
    `;
    return NextResponse.json({ evaluators, flags, pendingHours });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { action, evaluator_id, schedule_id, hours_id, rating, notes, flag_id } = body;
    const asArray = (arr, single) => Array.isArray(arr) ? arr : (single != null ? [single] : []);
    const { searchParams } = new URL(request.url);
    const sp_id = await resolveSpOrgId(session, searchParams.get("org"));
    if (!sp_id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const adminRes = await sql`SELECT id FROM users WHERE email = ${session.email} LIMIT 1`;
    const admin_id = adminRes[0]?.id;
    if (action === "approve_hours") {
      const ids = asArray(body.hours_ids, hours_id);
      if (!ids.length) return NextResponse.json({ error: "No hours ids" }, { status: 400 });
      await sql`UPDATE evaluator_hours SET status = 'approved', approved_by = ${admin_id}, approved_at = NOW() WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`;
      return NextResponse.json({ success: true, count: ids.length });
    }
    if (action === "set_rate") {
      // Per-evaluator hourly rate for THIS service provider (IDOR-guarded).
      const mem = await sql`SELECT id FROM evaluator_memberships WHERE user_id = ${evaluator_id} AND organization_id = ${sp_id}`;
      if (!mem.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const rate = body.hourly_rate === null || body.hourly_rate === "" ? null : parseFloat(body.hourly_rate);
      if (rate !== null && (isNaN(rate) || rate < 0)) return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
      try {
        await sql`UPDATE evaluator_memberships SET hourly_rate = ${rate} WHERE user_id = ${evaluator_id} AND organization_id = ${sp_id}`;
      } catch {
        return NextResponse.json({ error: "Wages aren't available yet (pending migration)." }, { status: 503 });
      }
      return NextResponse.json({ success: true });
    }
    if (action === "set_rates") {
      // Batch: [{ evaluator_id, hourly_rate }]. Only this SP's evaluators (IDOR-safe).
      const rates = Array.isArray(body.rates) ? body.rates : [];
      if (!rates.length) return NextResponse.json({ error: "No rates" }, { status: 400 });
      let updated = 0;
      try {
        for (const r of rates) {
          const eid = parseInt(r.evaluator_id);
          if (!eid) continue;
          const rate = r.hourly_rate === null || r.hourly_rate === "" ? null : parseFloat(r.hourly_rate);
          if (rate !== null && (isNaN(rate) || rate < 0)) continue;
          await sql`UPDATE evaluator_memberships SET hourly_rate = ${rate} WHERE user_id = ${eid} AND organization_id = ${sp_id}`;
          updated++;
        }
      } catch {
        return NextResponse.json({ error: "Wages aren't available yet (pending migration)." }, { status: 503 });
      }
      return NextResponse.json({ success: true, updated });
    }
    if (action === "mark_paid") {
      const ids = asArray(body.hours_ids, hours_id);
      if (!ids.length) return NextResponse.json({ error: "No hours ids" }, { status: 400 });
      // Only approved hours can be marked paid
      await sql`UPDATE evaluator_hours SET status = 'paid' WHERE id = ANY(${ids}) AND organization_id = ${sp_id} AND status = 'approved'`;
      return NextResponse.json({ success: true, count: ids.length });
    }
    if (action === "rate_evaluator") {
      // Verify the evaluator belongs to this SP org before rating (IDOR guard)
      const mem = await sql`SELECT id FROM evaluator_memberships WHERE user_id = ${evaluator_id} AND organization_id = ${sp_id}`;
      if (!mem.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      await sql`INSERT INTO evaluator_ratings (evaluator_id, rated_by, organization_id, schedule_id, rating, notes) VALUES (${evaluator_id}, ${admin_id}, ${sp_id}, ${schedule_id}, ${rating}, ${notes || null}) ON CONFLICT (evaluator_id, schedule_id) DO UPDATE SET rating = ${rating}, notes = ${notes || null}`;
      return NextResponse.json({ success: true });
    }
    if (action === "approve") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      await sql`UPDATE evaluator_memberships SET status = 'active', pending = false WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}`;
      for (const id of ids) {
        await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${admin_id}, 'evaluator_approved', 'user', ${id}, 'approved by SP admin')`;
      }
      return NextResponse.json({ success: true, count: ids.length });
    }
    if (action === "suspend") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      await sql`UPDATE evaluator_memberships SET status = 'suspended' WHERE user_id = ANY(${ids}) AND organization_id = ${sp_id}`;
      await sql`UPDATE evaluator_session_signups SET status = 'suspended' WHERE user_id = ANY(${ids}) AND status = 'signed_up' AND schedule_id IN (SELECT id FROM evaluation_schedule WHERE scheduled_date > CURRENT_DATE)`;
      for (const id of ids) {
        await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${admin_id}, 'evaluator_suspended', 'user', ${id}, 'suspended by SP admin')`;
      }
      return NextResponse.json({ success: true, count: ids.length });
    }
    if (action === "delete_account") {
      const ids = asArray(body.evaluator_ids, evaluator_id);
      if (!ids.length) return NextResponse.json({ error: "No evaluator ids" }, { status: 400 });
      let deleted = 0; const skipped = [];
      for (const id of ids) {
        const hasHistory = await sql`SELECT COUNT(*) as count FROM evaluator_session_signups WHERE user_id = ${id}`;
        if (parseInt(hasHistory[0].count) > 0) { skipped.push(id); continue; }
        await sql`DELETE FROM evaluator_memberships WHERE user_id = ${id}`;
        const authUser = await sql`SELECT id FROM auth_users WHERE email = (SELECT email FROM users WHERE id = ${id})`;
        if (authUser.length) {
          await sql`DELETE FROM auth_accounts WHERE "userId" = ${authUser[0].id}`;
          await sql`DELETE FROM auth_users WHERE id = ${authUser[0].id}`;
        }
        await sql`DELETE FROM users WHERE id = ${id}`;
        deleted++;
      }
      return NextResponse.json({ success: true, deleted, skipped: skipped.length });
    }
    if (action === "reinstate") {
      // Verify the evaluator belongs to this SP org before mutating (IDOR guard)
      const mem = await sql`SELECT id FROM evaluator_memberships WHERE user_id = ${evaluator_id} AND organization_id = ${sp_id}`;
      if (!mem.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      await sql`UPDATE evaluator_flags SET reviewed = true, reviewed_by = ${admin_id}, reviewed_at = NOW() WHERE evaluator_id = ${evaluator_id} AND flag_type = 'late_cancel' AND organization_id = ${sp_id}`;
      await sql`UPDATE evaluator_session_signups SET status = 'cancelled' WHERE user_id = ${evaluator_id} AND status = 'suspended'`;
      await sql`INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value) VALUES (${admin_id}, 'evaluator_reinstated', 'user', ${evaluator_id}, 'reinstated by SP admin')`;
      return NextResponse.json({ success: true });
    }
    if (action === "dismiss_flag") {
      const ids = asArray(body.flag_ids, flag_id);
      if (!ids.length) return NextResponse.json({ error: "No flag ids" }, { status: 400 });
      await sql`UPDATE evaluator_flags SET reviewed = true, reviewed_by = ${admin_id}, reviewed_at = NOW() WHERE id = ANY(${ids}) AND organization_id = ${sp_id}`;
      return NextResponse.json({ success: true, count: ids.length });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
