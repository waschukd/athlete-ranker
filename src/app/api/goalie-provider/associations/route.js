import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveGoalieSpOrgId } from "@/lib/auth";

// A Goalie Service Provider's OWN association connections. Unlike the old flow
// (an association invites a goalie SP), here the goalie SP connects itself to an
// EXISTING association by that association's org code — no duplicate association
// is created. The association then gains a "Manage Goalies" view of the results.

async function spContext(request) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const orgParam = new URL(request.url).searchParams.get("org");
  const spId = await resolveGoalieSpOrgId(session, orgParam);
  if (!spId) return { error: NextResponse.json({ error: "Not a goalie service provider" }, { status: 403 }) };
  return { session, spId };
}

// GET — the goalie SP's linked associations, with a live goalie count each.
export async function GET(request) {
  try {
    const ctx = await spContext(request);
    if (ctx.error) return ctx.error;
    const rows = await sql`
      SELECT o.id, o.name, o.org_code, sal.status, sal.linked_at,
        COUNT(a.id) FILTER (WHERE a.position = 'goalie' AND a.is_active = true)::int AS goalie_count
      FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.association_id AND o.type = 'association'
      LEFT JOIN age_categories ac ON ac.organization_id = o.id
      LEFT JOIN athletes a ON a.age_category_id = ac.id
      WHERE sal.service_provider_id = ${ctx.spId} AND sal.status = 'active'
      GROUP BY o.id, o.name, o.org_code, sal.status, sal.linked_at
      ORDER BY o.name`;
    return NextResponse.json({ associations: rows });
  } catch (e) {
    console.error("goalie-provider associations GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { action: "connect", org_code } — link this goalie SP to an existing
// association by its org code, and mark that association's goalies as handled by a
// goalie SP so its Manage Goalies view lights up. Idempotent (reactivates a link).
export async function POST(request) {
  try {
    const ctx = await spContext(request);
    if (ctx.error) return ctx.error;
    const body = await request.json();
    const action = body.action || "connect";

    if (action === "connect") {
      const code = (body.org_code || "").toString().trim().toUpperCase();
      if (!code) return NextResponse.json({ error: "An association code is required." }, { status: 400 });
      const [assoc] = await sql`SELECT id, name FROM organizations WHERE UPPER(org_code) = ${code} AND type = 'association' LIMIT 1`;
      if (!assoc) return NextResponse.json({ error: "No association found with that code. Double-check it with the association." }, { status: 404 });

      const [existing] = await sql`SELECT id, status FROM sp_association_links WHERE service_provider_id = ${ctx.spId} AND association_id = ${assoc.id}`;
      if (existing && existing.status === "active") {
        return NextResponse.json({ ok: true, alreadyLinked: true, association: assoc });
      }
      if (existing) {
        await sql`UPDATE sp_association_links SET status = 'active', linked_at = NOW() WHERE id = ${existing.id}`;
      } else {
        await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${ctx.spId}, ${assoc.id}, 'active')`;
      }
      // Route this association's goalie evaluations to the goalie SP.
      await sql`UPDATE organizations SET goalie_eval_mode = 'goalie_service_provider' WHERE id = ${assoc.id}`;
      return NextResponse.json({ ok: true, association: assoc });
    }

    if (action === "disconnect") {
      const associationId = parseInt(body.association_id);
      if (!associationId) return NextResponse.json({ error: "association_id required" }, { status: 400 });
      await sql`UPDATE sp_association_links SET status = 'inactive' WHERE service_provider_id = ${ctx.spId} AND association_id = ${associationId}`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("goalie-provider associations POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
