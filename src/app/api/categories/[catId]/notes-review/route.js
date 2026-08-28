// Surfaces evaluator notes worth a director's second look before they reach a
// report -- currently just notes the recognizer likely cut off mid-thought
// ("...skates hunched over when carrying the"). Not an auto-fix: there's no
// way to guess what an evaluator meant to finish saying, so this is a review
// queue a director works through by hand, editing or clearing wording before
// it goes out. See src/lib/noteToneCheck.js for the detection.

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { looksIncomplete } from "@/lib/noteToneCheck";

const MANAGE = new Set(["super_admin", "association_admin", "director", "service_provider_admin"]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await sql`
      SELECT pn.id, pn.athlete_id, pn.session_number, pn.note_text, a.first_name, a.last_name
      FROM player_notes pn
      JOIN athletes a ON a.id = pn.athlete_id
      WHERE pn.age_category_id = ${params.catId} AND pn.note_text IS NOT NULL AND length(trim(pn.note_text)) > 0
      ORDER BY pn.session_number, a.last_name`;

    const flagged = rows
      .filter(r => looksIncomplete(r.note_text))
      .map(r => ({
        id: r.id, athlete_id: r.athlete_id, session_number: r.session_number,
        athlete_name: `${r.first_name} ${r.last_name}`.trim(), note_text: r.note_text, reason: "incomplete",
      }));

    return NextResponse.json({ flagged });
  } catch (error) {
    console.error("notes-review GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const noteId = parseInt(body.note_id);
    if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 });
    const noteText = String(body.note_text ?? "").trim();

    const [owned] = await sql`SELECT id FROM player_notes WHERE id = ${noteId} AND age_category_id = ${params.catId}`;
    if (!owned) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await sql`UPDATE player_notes SET note_text = ${noteText || null}, updated_at = NOW() WHERE id = ${noteId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("notes-review PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
