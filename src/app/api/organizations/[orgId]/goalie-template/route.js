import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import {
  getGoalieTemplate, getEffectiveGoalieTemplate, saveGoalieTemplate,
  applyGoalieTemplate, propagateSpGoalieTemplate,
} from "@/lib/goalieTemplate";

const WRITE_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// GET: the goalie template to show for this org.
//  - association → its EFFECTIVE template (owner's) + whether it can edit
//  - SP org      → its OWN template (always editable by the SP)
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgRows = await sql`SELECT type FROM organizations WHERE id = ${params.orgId}`;
    if (!orgRows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const type = orgRows[0].type;

    if (type === "service_provider" || type === "goalie_service_provider") {
      const template = await getGoalieTemplate(params.orgId);
      return NextResponse.json({ template, editable: true, owner: "self" });
    }
    const { template, mode, editableByAssociation } = await getEffectiveGoalieTemplate(params.orgId);
    return NextResponse.json({ template, editable: editableByAssociation, mode });
  } catch (error) {
    console.error("goalie-template GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: save this org's template, then materialize it.
//  - association (mode=association) → apply to its own categories
//  - SP org → apply to every association it owns goalies for
export async function PUT(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!WRITE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const orgRows = await sql`SELECT type, goalie_eval_mode FROM organizations WHERE id = ${params.orgId}`;
    if (!orgRows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { type, goalie_eval_mode } = orgRows[0];
    const isSp = type === "service_provider" || type === "goalie_service_provider";

    // An association can only own its template when it evaluates in-house.
    if (!isSp && (goalie_eval_mode || "association") !== "association") {
      return NextResponse.json({ error: "Your goalie service provider controls this template." }, { status: 403 });
    }

    const body = await request.json();
    await saveGoalieTemplate(params.orgId, body.template || body);

    let applied = 0;
    if (isSp) applied = await propagateSpGoalieTemplate(params.orgId);
    else applied = await applyGoalieTemplate(params.orgId);

    return NextResponse.json({ success: true, applied });
  } catch (error) {
    console.error("goalie-template PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
