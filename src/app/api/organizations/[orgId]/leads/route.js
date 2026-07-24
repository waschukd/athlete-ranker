// Association leads: list the association's evaluators with their lead status,
// and promote/demote a lead. A lead is an evaluator of the association with
// authority over its session assignments.
//
//   GET   → evaluators of this org, each with is_lead
//   PATCH → { user_id, is_lead } to promote or demote
//
// Same authority as session assignment: whoever runs the association's evals may
// designate its leads (God, an SP admin that serves it, an in-house association
// admin), plus an existing lead.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageSessionAssignments } from "@/lib/authorize";
import { eligiblePeople, setLead } from "@/lib/sessionRoster";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = parseInt(params.orgId);
    if (!orgId) return NextResponse.json({ error: "Invalid org" }, { status: 400 });

    const manage = await canManageSessionAssignments(session, orgId);
    if (!manage.authorized) return NextResponse.json({ error: "Forbidden", reason: manage.reason }, { status: 403 });

    // The promotable pool is everyone eligible to evaluate this association —
    // its own members and the members of any SP serving it — with is_lead
    // reflecting a designation on THIS association.
    const people = await eligiblePeople(orgId);
    const evaluators = people
      .filter(p => p.is_evaluator)
      .sort((a, b) => (b.is_lead - a.is_lead) || a.name.localeCompare(b.name));
    return NextResponse.json({ evaluators, canManage: true });
  } catch (error) {
    console.error("leads GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = parseInt(params.orgId);
    const { user_id, is_lead } = await request.json();
    if (!orgId || !user_id || typeof is_lead !== "boolean") {
      return NextResponse.json({ error: "orgId, user_id and is_lead (boolean) required" }, { status: 400 });
    }

    const manage = await canManageSessionAssignments(session, orgId);
    if (!manage.authorized) return NextResponse.json({ error: "Forbidden", reason: manage.reason }, { status: 403 });

    const ok = await setLead(orgId, user_id, is_lead);
    if (!ok) return NextResponse.json({ error: "That person isn't an active evaluator of this association." }, { status: 400 });

    return NextResponse.json({ ok: true, is_lead });
  } catch (error) {
    console.error("leads PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
