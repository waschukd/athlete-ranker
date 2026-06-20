import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { computeCategoryRankings } from "@/lib/rankings";
import { analyzeContention } from "@/lib/contention";

const intId = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

// GET → contention analysis for the skater pool against the category's roster targets.
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = intId(params.catId);
    if (!catId) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [cat] = await sql`SELECT roster_targets FROM age_categories WHERE id = ${catId}`;
    const rosterTargets = cat?.roster_targets ?? null;

    const ranking = await computeCategoryRankings(catId);
    // Skater pool only for v1 (goalies are a separate, tiny pool ranked apart).
    const skaterRanking = {
      athletes: ranking.athletes || [],
      sessions: (ranking.sessions || []).filter(s => s.session_type !== "testing"),
      completed_sessions: ranking.completed_sessions || [],
    };

    const analysis = rosterTargets
      ? analyzeContention(skaterRanking, { rosterTargets })
      : { dataReady: false, reason: "no_roster_targets" };

    return NextResponse.json({ roster_targets: rosterTargets, analysis, phase: ranking.phase });
  } catch (error) {
    console.error("Contention error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST { roster_targets } → save the intended roster size(s) for this category.
export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const catId = intId(params.catId);
    if (!catId) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    // Accept a single number, [numbers], or [{name,size}] tiers; store normalized tiers.
    let targets = body.roster_targets;
    if (typeof targets === "number") targets = [{ name: "Roster", size: Math.floor(targets) }];
    if (Array.isArray(targets)) {
      targets = targets
        .map((t, i) => (typeof t === "number"
          ? { name: `Tier ${i + 1}`, size: Math.floor(t) }
          : { name: String(t.name || `Tier ${i + 1}`).slice(0, 40), size: Math.floor(Number(t.size)) }))
        .filter(t => Number.isInteger(t.size) && t.size > 0);
    } else {
      targets = null;
    }

    await sql`UPDATE age_categories SET roster_targets = ${targets ? JSON.stringify(targets) : null} WHERE id = ${catId}`;
    return NextResponse.json({ success: true, roster_targets: targets });
  } catch (error) {
    console.error("Contention save error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
