import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
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

    const org = await sql`SELECT goalie_eval_mode, org_code FROM organizations WHERE id = ${orgId}`;
    // The association shares its org_code with a goalie SP to connect. Some older
    // associations have no code — generate one now so there's always a code to share.
    let orgCode = org[0]?.org_code || null;
    if (!orgCode) {
      for (let i = 0; i < 10; i++) {
        const c = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!(await sql`SELECT id FROM organizations WHERE org_code = ${c}`).length) { orgCode = c; break; }
      }
      if (orgCode) await sql`UPDATE organizations SET org_code = ${orgCode} WHERE id = ${orgId} AND org_code IS NULL`;
    }
    // The connected goalie SP (if any). Goalie SPs now connect THEMSELVES using the
    // association's org_code — the association shares that code, it doesn't pick a
    // provider. So we no longer return a provider list for the association to choose.
    const linked = await sql`
      SELECT o.id, o.name FROM sp_association_links sal
      JOIN organizations o ON o.id = sal.service_provider_id AND o.type = 'goalie_service_provider'
      WHERE sal.association_id = ${orgId} AND sal.status = 'active' LIMIT 1`;
    return NextResponse.json({ goalie_eval_mode: org[0]?.goalie_eval_mode || "association", org_code: orgCode, linked: linked[0] || null });
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

    // Note: associations no longer LINK or INVITE goalie SPs from here. A goalie SP
    // connects itself using the association's org_code (see
    // /api/goalie-provider/associations). The association can still disconnect one.
    if (body.action === "unlink") {
      const spId = parseInt(body.goalie_sp_id);
      await sql`UPDATE sp_association_links SET status = 'inactive' WHERE service_provider_id = ${spId} AND association_id = ${orgId}`;
      await reapplyGoalie(orgId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("org goalie-provider POST error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
