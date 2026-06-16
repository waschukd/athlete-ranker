import { NextResponse } from "next/server";
import { getSession, resolveSpContext } from "@/lib/auth";
import { getNoteBonusRate, setNoteBonusRate } from "@/lib/reportBonus";

// SP-level setting: flat bonus (cents) per evaluator note that lands in a sold report.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (await resolveSpContext(session, null)).orgId;
  if (!orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ note_bonus_cents: await getNoteBonusRate(orgId) });
}

export async function PUT(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (await resolveSpContext(session, null)).orgId;
  if (!orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const cents = Math.max(0, Math.round(Number(body.note_bonus_cents) || 0));
  await setNoteBonusRate(orgId, cents);
  return NextResponse.json({ ok: true, note_bonus_cents: cents });
}
