// "Watch this player" flags: a director reviewing a completed/current
// session's groups notices someone ranked too high or too low and flags them
// for their UPCOMING session, so whichever evaluator ends up scoring them
// sees a star and looks a little closer. Session-scoped like anchor_players
// (a director flags for a specific session, not "forever"), but a separate
// table -- anchor_players drives the score-correction formula, this is a
// plain visibility flag with no scoring math behind it.
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

const MANAGE_ROLES = new Set(["super_admin", "association_admin", "director", "service_provider_admin", "goalie_service_provider_admin"]);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS watch_players (
      id SERIAL PRIMARY KEY,
      age_category_id INTEGER NOT NULL,
      athlete_id INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      note TEXT,
      flagged_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (age_category_id, athlete_id, session_number)
    )
  `;
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sessionNumber = new URL(request.url).searchParams.get("session_number");
    if (!sessionNumber) return NextResponse.json({ error: "session_number required" }, { status: 400 });

    await ensureTable();
    const rows = await sql`
      SELECT athlete_id, note FROM watch_players
      WHERE age_category_id = ${catId} AND session_number = ${sessionNumber}
    `;
    return NextResponse.json({ watched: rows });
  } catch (error) {
    console.error("watch-players GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { action, athlete_id, session_number, note } = await request.json();
    if (!athlete_id || !session_number) return NextResponse.json({ error: "athlete_id and session_number required" }, { status: 400 });

    await ensureTable();
    const userRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const userId = userRes[0]?.id || null;

    if (action === "unflag") {
      await sql`DELETE FROM watch_players WHERE age_category_id = ${catId} AND athlete_id = ${athlete_id} AND session_number = ${session_number}`;
      return NextResponse.json({ success: true });
    }

    await sql`
      INSERT INTO watch_players (age_category_id, athlete_id, session_number, note, flagged_by)
      VALUES (${catId}, ${athlete_id}, ${session_number}, ${note || null}, ${userId})
      ON CONFLICT (age_category_id, athlete_id, session_number) DO UPDATE SET note = ${note || null}
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("watch-players POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
