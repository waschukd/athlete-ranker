import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { createAndSendOrgInvite } from "@/lib/invites";
import { applyGoalieTemplate } from "@/lib/goalieTemplate";

// Re-materialize this association's goalie categories from whoever now owns the
// template (in-house / SP). Best-effort — a propagation hiccup never blocks the
// mode/link change itself.
async function reapplyGoalie(orgId) {
  try { await applyGoalieTemplate(orgId); } catch (e) { console.error("goalie reapply:", e?.message); }
}

// Association-level goalie evaluation setting: who evaluates goalies org-wide
// (association / service_provider / goalie_service_provider) + the connected
// goalie SP. Set once here; every category inherits it (no per-category prompt).

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgId } = params;
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const org = await sql`SELECT goalie_eval_mode FROM organizations WHERE id = ${orgId}`;
    const providers = await sql`SELECT id, name, contact_email FROM organizations WHERE type = 'goalie_service_provider' ORDER BY name`;
    const linked = await sql`
      SELECT o.id, o.name FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id AND o.type = 'goalie_service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active' LIMIT 1`;
    return NextResponse.json({ goalie_eval_mode: org[0]?.goalie_eval_mode || "association", providers, linked: linked[0] || null });
  } catch (e) {
    console.error("org goalie-provider GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { orgId } = params;
    const auth = await authorizeOrgAccess(session, orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();

    if (body.action === "set_mode") {
      const mode = ["association", "service_provider", "goalie_service_provider"].includes(body.goalie_eval_mode) ? body.goalie_eval_mode : "association";
      await sql`UPDATE organizations SET goalie_eval_mode = ${mode} WHERE id = ${orgId}`;
      await reapplyGoalie(orgId);
      return NextResponse.json({ success: true, goalie_eval_mode: mode });
    }

    if (body.action === "link") {
      const spId = parseInt(body.goalie_sp_id);
      if (!spId) return NextResponse.json({ error: "goalie_sp_id required" }, { status: 400 });
      const sp = await sql`SELECT id FROM organizations WHERE id = ${spId} AND type = 'goalie_service_provider'`;
      if (!sp.length) return NextResponse.json({ error: "Not a goalie service provider" }, { status: 400 });
      const existing = await sql`SELECT id FROM sp_association_links WHERE service_provider_id = ${spId} AND association_id = ${orgId}`;
      if (!existing.length) await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${spId}, ${orgId}, 'active')`;
      else await sql`UPDATE sp_association_links SET status = 'active' WHERE id = ${existing[0].id}`;
      await sql`UPDATE organizations SET goalie_eval_mode = 'goalie_service_provider' WHERE id = ${orgId}`;
      await reapplyGoalie(orgId);
      return NextResponse.json({ success: true, goalie_sp_id: spId });
    }

    if (body.action === "unlink") {
      const spId = parseInt(body.goalie_sp_id);
      await sql`UPDATE sp_association_links SET status = 'inactive' WHERE service_provider_id = ${spId} AND association_id = ${orgId}`;
      await reapplyGoalie(orgId);
      return NextResponse.json({ success: true });
    }

    if (body.action === "invite") {
      const name = (body.name || "").trim();
      const email = (body.email || "").trim();
      if (!name || !email) return NextResponse.json({ error: "Company name and contact email are required" }, { status: 400 });
      let orgCode = null;
      for (let i = 0; i < 10; i++) {
        const c = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!(await sql`SELECT id FROM organizations WHERE org_code = ${c}`).length) { orgCode = c; break; }
      }
      const [created] = await sql`INSERT INTO organizations (name, type, contact_email, org_code) VALUES (${name}, 'goalie_service_provider', ${email}, ${orgCode}) RETURNING *`;
      await sql`INSERT INTO sp_association_links (service_provider_id, association_id, status) VALUES (${created.id}, ${orgId}, 'active')`;
      await sql`UPDATE organizations SET goalie_eval_mode = 'goalie_service_provider' WHERE id = ${orgId}`;
      let invite = null;
      try { invite = await createAndSendOrgInvite({ organizationId: created.id, email, name: null, orgName: name, orgType: "goalie_service_provider" }); }
      catch (e) { console.error("org goalie SP invite error:", e); invite = { sent: false, url: null }; }
      await reapplyGoalie(orgId);
      return NextResponse.json({ success: true, goalie_sp_id: created.id, name: created.name, invite });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("org goalie-provider POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
