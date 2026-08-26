import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";

// Which association(s) is the current user the designated lead of? Powers the
// "You're the lead for X" card on the evaluator dashboard -- their only way to
// discover the association dashboard exists for them at all, since nothing
// about their role changes otherwise.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    if (!user) return NextResponse.json({ orgs: [] });

    const orgs = await sql`
      SELECT o.id, o.name
      FROM evaluator_memberships em
      JOIN organizations o ON o.id = em.organization_id
      WHERE em.user_id = ${user.id} AND em.status = 'active' AND em.is_lead = true
      ORDER BY o.name
    `;
    return NextResponse.json({ orgs });
  } catch (error) {
    console.error("led-orgs GET error:", error);
    return NextResponse.json({ orgs: [] });
  }
}
