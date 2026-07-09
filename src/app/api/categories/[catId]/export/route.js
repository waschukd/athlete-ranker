import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { computeCategoryRankings } from "@/lib/rankings";

// Camp-bridge export: one JSON payload per category with everything the
// CT Camp dashboard needs to import results — per-criterion averages,
// official rank, per-test bests, and evaluator notes. Read-only.
// GET /api/categories/:catId/export            -> JSON inline
// GET /api/categories/:catId/export?download=1 -> JSON as attachment
export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rankings = await computeCategoryRankings(catId, {});
    const scale = parseFloat(rankings.category?.scoring_scale || 10);

    const avgRows = await sql`
      SELECT cs.athlete_id, sc.name AS criterion,
        AVG(cs.score)::float AS avg_score, COUNT(*)::int AS n
      FROM category_scores cs
      JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      WHERE cs.age_category_id = ${catId}
      GROUP BY cs.athlete_id, sc.name
    `;
    const testRows = await sql`
      SELECT athlete_id, test_name, MIN(value)::float AS best
      FROM testing_results
      WHERE age_category_id = ${catId}
      GROUP BY athlete_id, test_name
    `;
    const noteRows = await sql`
      SELECT n.athlete_id, n.session_number, n.note_text, n.created_at,
        u.name AS evaluator_name
      FROM player_notes n
      LEFT JOIN users u ON u.id = n.evaluator_id
      WHERE n.age_category_id = ${catId}
      ORDER BY n.created_at
    `;

    const byAthlete = (rows) => {
      const m = new Map();
      for (const r of rows) {
        if (!m.has(r.athlete_id)) m.set(r.athlete_id, []);
        m.get(r.athlete_id).push(r);
      }
      return m;
    };
    const avgBy = byAthlete(avgRows);
    const testBy = byAthlete(testRows);
    const noteBy = byAthlete(noteRows);

    const athletes = (rankings.athletes || []).map((a) => {
      const skills = {};
      for (const r of avgBy.get(a.id) || []) {
        // Normalize any scoring scale to 0-10 for the consumer.
        skills[r.criterion] = Math.round((r.avg_score * 10 / scale) * 10) / 10;
      }
      return {
        first_name: a.first_name,
        last_name: a.last_name,
        birth_year: a.birth_year ?? null,
        position: a.position ?? null,
        external_id: a.external_id ?? null,
        rank: a.rank ?? null,
        weighted_total: a.weighted_total ?? null,
        skills,
        testing: (testBy.get(a.id) || []).map(t => ({ test_name: t.test_name, best: t.best })),
        notes: (noteBy.get(a.id) || []).map(n => ({
          text: n.note_text,
          evaluator: n.evaluator_name || null,
          session_number: n.session_number ?? null,
          created_at: n.created_at,
        })),
      };
    });

    const payload = {
      format: "sideline-star-camp-export",
      version: 1,
      exported_at: new Date().toISOString(),
      category: {
        id: rankings.category?.id ?? Number(catId),
        name: rankings.category?.name ?? null,
        scoring_scale: scale,
      },
      total_athletes: athletes.length,
      athletes,
    };

    const res = NextResponse.json(payload);
    if (new URL(request.url).searchParams.get("download")) {
      res.headers.set("Content-Disposition", `attachment; filename="sideline-star-export-${catId}.json"`);
    }
    return res;
  } catch (error) {
    console.error("Camp export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
