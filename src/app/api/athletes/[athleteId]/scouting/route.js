import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { athleteId } = params;
    const { catId } = await request.json();

    if (!catId) return NextResponse.json({ error: "catId required" }, { status: 400 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Get athlete info
    const athlete = await sql`SELECT first_name, last_name, position FROM athletes WHERE id = ${athleteId}`;
    if (!athlete.length) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

    const category = await sql`SELECT name, scoring_scale FROM age_categories WHERE id = ${catId}`;

    // Get evaluator notes
    const notes = await sql`
      SELECT pn.session_number, pn.note_text, u.name as evaluator_name
      FROM player_notes pn
      JOIN users u ON u.id = pn.evaluator_id
      WHERE pn.athlete_id = ${athleteId} AND pn.age_category_id = ${catId}
      ORDER BY pn.session_number, pn.created_at
    `;

    if (!notes.length) {
      return NextResponse.json({ report: "No evaluator notes available to generate a scouting report. Evaluators need to submit observations first." });
    }

    // Get scores for context
    const scores = await sql`
      SELECT cs.session_number, cs.score, sc.name as category_name
      FROM category_scores cs
      JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
      WHERE cs.athlete_id = ${athleteId} AND cs.age_category_id = ${catId}
      ORDER BY cs.session_number, sc.display_order
    `;

    // Get ranking
    const ranking = await sql`
      SELECT COUNT(*) + 1 as rank FROM (
        SELECT athlete_id, AVG(score) as avg
        FROM category_scores WHERE age_category_id = ${catId}
        GROUP BY athlete_id
        HAVING AVG(score) > (
          SELECT AVG(score) FROM category_scores WHERE athlete_id = ${athleteId} AND age_category_id = ${catId}
        )
      ) better
    `;
    const totalAthletes = await sql`SELECT COUNT(DISTINCT athlete_id) as count FROM category_scores WHERE age_category_id = ${catId}`;

    // Build context
    const notesContext = notes.map(n =>
      `Session ${n.session_number} — ${n.evaluator_name}: "${n.note_text}"`
    ).join("\n");

    const scoresBySession = {};
    for (const s of scores) {
      if (!scoresBySession[s.session_number]) scoresBySession[s.session_number] = [];
      scoresBySession[s.session_number].push(`${s.category_name}: ${s.score}`);
    }
    const scoresContext = Object.entries(scoresBySession).map(([sess, cats]) =>
      `Session ${sess}: ${cats.join(", ")}`
    ).join("\n");

    const prompt = `You are writing a scouting report for an athlete evaluation.

Player: ${athlete[0].first_name} ${athlete[0].last_name}
Position: ${athlete[0].position || "Not specified"}
Category: ${category[0]?.name || "Unknown"}
Approximate Rank: ${ranking[0]?.rank || "?"} of ${totalAthletes[0]?.count || "?"}

Scores by Session:
${scoresContext || "No scores available"}

Evaluator Notes:
${notesContext}

Write a concise professional scouting report using the evaluators' observations as your primary source.
Do not invent assessments not supported by the notes.
Structure:
1. Opening sentence identifying the player and their standing
2. Strengths (2-3 sentences drawn from evaluator notes)
3. Areas for development (1-2 sentences, if noted)
4. Suggestions for improvement (1-2 actionable recommendations based on what evaluators observed)
5. Overall assessment (1 sentence)

Keep it factual, professional, and grounded in what the evaluators actually observed. Maximum 200 words.`;

    // Call Anthropic API server-side
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in environment variables." }, { status: 503 });
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const result = await aiRes.json();
    const report = result.content?.map(c => c.text || "").join("") || "Unable to generate report.";

    return NextResponse.json({ report });
  } catch (error) {
    console.error("Scouting report error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
