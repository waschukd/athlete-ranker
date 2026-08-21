// Quick live pings between evaluators actually signed up for the same session
// -- "running late", "anyone see a black #23?" -- not a general chat, not
// tied to the existing SP<->evaluator messages inbox. Deliberately scoped
// tighter than category access: only people with an active signup on THIS
// exact schedule_id can read or post, so it's a message board for "who's
// actually at this game right now", not "anyone eligible for this club".
// Self-healing table, same convention as scoring_rubrics.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession, getAppUserId } from "@/lib/auth";

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS session_pings (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES evaluation_schedule(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS session_pings_schedule_idx ON session_pings (schedule_id, created_at)`;
}

async function isOnThisSession(scheduleId, userId) {
  const rows = await sql`
    SELECT 1 FROM evaluator_session_signups
    WHERE schedule_id = ${scheduleId} AND user_id = ${userId} AND status = 'signed_up'
    UNION
    SELECT 1 FROM tester_session_signups
    WHERE schedule_id = ${scheduleId} AND user_id = ${userId} AND status = 'signed_up'
    LIMIT 1`;
  return rows.length > 0;
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scheduleId = parseInt(new URL(request.url).searchParams.get("schedule_id"));
    if (!scheduleId) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

    const userId = await getAppUserId(session);
    if (!userId || !(await isOnThisSession(scheduleId, userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureTable();
    const pings = await sql`
      SELECT sp.id, sp.message, sp.created_at, sp.user_id, u.name
      FROM session_pings sp
      JOIN users u ON u.id = sp.user_id
      WHERE sp.schedule_id = ${scheduleId}
      ORDER BY sp.created_at DESC
      LIMIT 100`;
    return NextResponse.json({ pings, meUserId: userId });
  } catch (error) {
    console.error("session-pings GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { schedule_id, message } = await request.json();
    const scheduleId = parseInt(schedule_id);
    if (!scheduleId) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });
    const text = String(message || "").trim().slice(0, 200);
    if (!text) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const userId = await getAppUserId(session);
    if (!userId || !(await isOnThisSession(scheduleId, userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureTable();
    const [row] = await sql`
      INSERT INTO session_pings (schedule_id, user_id, message)
      VALUES (${scheduleId}, ${userId}, ${text})
      RETURNING id, message, created_at, user_id`;
    return NextResponse.json({ success: true, ping: { ...row, name: session.name || null } });
  } catch (error) {
    console.error("session-pings POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
