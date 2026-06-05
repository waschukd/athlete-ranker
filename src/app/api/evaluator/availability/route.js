import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { appUserId } from "@/lib/notify";

const EVAL_ROLES = new Set(["association_evaluator", "service_provider_evaluator"]);

// Evaluator-managed unavailability windows. Used so auto-offer / staffing skips
// evaluators who've marked themselves out.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ blackouts: [] });
    try {
      const blackouts = await sql`
        SELECT id, start_date, end_date, note FROM evaluator_unavailability
        WHERE user_id = ${userId} AND end_date >= CURRENT_DATE
        ORDER BY start_date
      `;
      return NextResponse.json({ blackouts });
    } catch {
      return NextResponse.json({ blackouts: [] });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!EVAL_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ error: "No user" }, { status: 400 });

    const { start_date, end_date, note } = await request.json().catch(() => ({}));
    if (!start_date) return NextResponse.json({ error: "start_date required" }, { status: 400 });
    const end = end_date || start_date;
    if (end < start_date) return NextResponse.json({ error: "end_date must be on or after start_date" }, { status: 400 });

    try {
      const [row] = await sql`
        INSERT INTO evaluator_unavailability (user_id, start_date, end_date, note)
        VALUES (${userId}, ${start_date}, ${end}, ${note || null}) RETURNING *
      `;
      return NextResponse.json({ success: true, blackout: row });
    } catch {
      return NextResponse.json({ error: "Availability isn't available yet (pending migration)." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await appUserId(session);
    if (!userId) return NextResponse.json({ success: true });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    try { await sql`DELETE FROM evaluator_unavailability WHERE id = ${id} AND user_id = ${userId}`; } catch {}
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
