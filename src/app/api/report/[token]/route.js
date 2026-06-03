import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { logEvent } from "@/lib/analytics";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";

// Default lifetime for a parent-facing share link. Bounded so that a
// link leaked into search engines or shared in a parents' group chat
// can't be replayed forever. Override per environment if a season runs
// longer than 90 days.
const TOKEN_TTL_DAYS = parseInt(process.env.REPORT_TOKEN_TTL_DAYS || "90", 10);

export async function GET(request, { params }) {
  try {
    const { token } = params;

    // Per-IP throttle before any DB work — this is a public, unauthenticated
    // endpoint, so cap how many report tokens a single IP can probe per hour
    // to blunt bulk token enumeration / guessing. 60/hour is generous for a
    // parent reloading their kid's report.
    const ip = clientIp(request);
    const rl = await checkAndRecord({ endpoint: "report_view", identifier: ip, max: 60, windowMins: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    // Look up share link
    const link = await sql`
      SELECT rl.*, a.first_name, a.last_name, a.position, a.external_id,
        ac.name as category_name, ac.scoring_scale, o.name as org_name
      FROM report_links rl
      JOIN athletes a ON a.id = rl.athlete_id
      JOIN age_categories ac ON ac.id = rl.age_category_id
      JOIN organizations o ON o.id = rl.organization_id
      WHERE rl.token = ${token} AND rl.is_active = true
    `;
    if (!link.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Anonymous report view — parents fetching their kid's report. We don't
    // know who they are; the value is in counting views per athlete + how
    // recently the link was used, not who clicked it.
    logEvent({
      role: "report_viewer",
      event: "report.viewed",
      orgId: link[0].organization_id || null,
      metadata: { athleteId: link[0].athlete_id, catId: link[0].age_category_id },
    });

    // Expiry check derived from created_at — keeps us off a schema
    // migration. created_at is the row's insert default.
    if (link[0].created_at) {
      const ageMs = Date.now() - new Date(link[0].created_at).getTime();
      if (ageMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Report link expired" }, { status: 410 });
      }
    }

    const { athlete_id, age_category_id } = link[0];

    // Check if purchased
    const purchase = await sql`
      SELECT id, cached_scouting_report FROM report_purchases
      WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id} AND status = 'completed'
      LIMIT 1
    `;
    const purchased = purchase.length > 0;

    // Get sessions
    const sessions = await sql`SELECT * FROM category_sessions WHERE age_category_id = ${age_category_id} ORDER BY session_number`;

    // Get scores (aggregated per session for ranking)
    const sessionScores = await sql`
      SELECT session_number, AVG(score) as avg_score, COUNT(DISTINCT evaluator_id) as evaluator_count
      FROM category_scores
      WHERE athlete_id = ${athlete_id} AND age_category_id = ${age_category_id}
      GROUP BY session_number
    `;

    // Get rank
    const allAvgs = await sql`
      SELECT athlete_id, AVG(score) as avg FROM category_scores
      WHERE age_category_id = ${age_category_id}
      GROUP BY athlete_id ORDER BY avg DESC
    `;
    const totalAthletes = allAvgs.length;
    const rankIdx = allAvgs.findIndex(a => a.athlete_id === athlete_id);
    const rank = rankIdx >= 0 ? rankIdx + 1 : null;
    const percentile = rank && totalAthletes > 0 ? Math.round(((totalAthletes - rank) / totalAthletes) * 100) : null;
    const overallAvg = rankIdx >= 0 ? parseFloat(allAvgs[rankIdx].avg) : null;
    const scale = parseFloat(link[0].scoring_scale || 10);

    // Base data (always returned — free tier)
    const data = {
      athlete: {
        first_name: link[0].first_name,
        last_name: link[0].last_name,
        position: link[0].position,
        external_id: link[0].external_id,
      },
      category_name: link[0].category_name,
      org_name: link[0].org_name,
      rank,
      total_athletes: totalAthletes,
      percentile,
      overall_avg: overallAvg ? Math.round(overallAvg * 10) / 10 : null,
      scale,
      sessions: sessions.map(s => {
        const sd = sessionScores.find(ss => ss.session_number === s.session_number);
        return {
          session_number: s.session_number,
          name: s.name,
          session_type: s.session_type,
          avg_score: sd ? Math.round(parseFloat(sd.avg_score) * 10) / 10 : null,
          evaluator_count: sd ? parseInt(sd.evaluator_count) : 0,
        };
      }),
      purchased,
      price: parseInt(process.env.REPORT_PRICE_CENTS || "1999"),
    };

    // Paid tier — include detailed data
    if (purchased) {
      // Detailed per-evaluator scores
      const detailedScores = await sql`
        SELECT cs.session_number, cs.score, cs.scoring_category_id,
          u.name as evaluator_name, sc.name as category_name, sc.display_order
        FROM category_scores cs
        JOIN users u ON u.id = cs.evaluator_id
        JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
        WHERE cs.athlete_id = ${athlete_id} AND cs.age_category_id = ${age_category_id}
        ORDER BY cs.session_number, u.name, sc.display_order
      `;

      // Evaluator notes
      const notes = await sql`
        SELECT pn.session_number, pn.note_text, pn.created_at, u.name as evaluator_name
        FROM player_notes pn
        JOIN users u ON u.id = pn.evaluator_id
        WHERE pn.athlete_id = ${athlete_id} AND pn.age_category_id = ${age_category_id}
        ORDER BY pn.session_number, pn.created_at
      `;

      // Scouting report (cached or generate)
      let scoutingReport = purchase[0].cached_scouting_report;
      if (!scoutingReport && notes.length > 0 && process.env.ANTHROPIC_API_KEY) {
        const notesContext = notes.map(n => `Session ${n.session_number} — ${n.evaluator_name}: "${n.note_text}"`).join("\n");
        const prompt = `You are writing a scouting report for an athlete evaluation.

Player: ${link[0].first_name} ${link[0].last_name}
Position: ${link[0].position || "Not specified"}
Category: ${link[0].category_name}
Rank: ${rank} of ${totalAthletes}

Evaluator Notes:
${notesContext}

Write a concise professional scouting report using the evaluators' observations as your primary source.
Do not invent assessments not supported by the notes.
Structure:
1. Opening sentence identifying the player and their standing
2. Strengths (2-3 sentences drawn from evaluator notes)
3. Areas for development (1-2 sentences, if noted)
4. Suggestions for improvement (1-2 actionable recommendations)
5. Overall assessment (1 sentence)

Keep it factual, professional, and grounded. Maximum 200 words.`;

        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
          });
          if (aiRes.ok) {
            const result = await aiRes.json();
            scoutingReport = result.content?.map(c => c.text || "").join("") || null;
            // Cache it
            if (scoutingReport) {
              await sql`UPDATE report_purchases SET cached_scouting_report = ${scoutingReport} WHERE id = ${purchase[0].id}`;
            }
          }
        } catch {}
      }

      data.scores = detailedScores;
      data.notes = notes;
      data.scouting_report = scoutingReport;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Public report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
