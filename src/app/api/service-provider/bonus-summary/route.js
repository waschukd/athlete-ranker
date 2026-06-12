import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, resolveSpOrgId } from "@/lib/auth";
import { getNoteBonusRate, eligibleNoteCount } from "@/lib/reportBonus";

// Per-SP bonus overview: the rate + each evaluator's eligible notes and bonus.
export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = await resolveSpOrgId(session, new URL(request.url).searchParams.get("org"));
    if (!orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rateCents = await getNoteBonusRate(orgId);

    let evaluators = [];
    try {
      const pool = await sql`
        SELECT em.user_id AS id, u.name
        FROM evaluator_memberships em
        JOIN users u ON u.id = em.user_id
        WHERE em.organization_id = ${orgId} AND em.status = 'active'
        ORDER BY u.name
      `;
      evaluators = await Promise.all(pool.map(async e => {
        const eligible = await eligibleNoteCount(e.id);
        return { id: e.id, name: e.name, eligible_notes: eligible, bonus_cents: eligible * rateCents };
      }));
    } catch { evaluators = []; }

    const total_bonus_cents = evaluators.reduce((s, e) => s + e.bonus_cents, 0);
    const total_eligible_notes = evaluators.reduce((s, e) => s + e.eligible_notes, 0);

    return NextResponse.json({ note_bonus_cents: rateCents, evaluators, total_bonus_cents, total_eligible_notes });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
