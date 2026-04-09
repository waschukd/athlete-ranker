
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import sql from "@/lib/db";

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const sessionNum = searchParams.get("session");

    const anchors = await sql`
      SELECT ap.*, a.first_name, a.last_name, a.external_id
      FROM anchor_players ap
      JOIN athletes a ON a.id = ap.athlete_id
      WHERE ap.age_category_id = ${catId}
      ${sessionNum ? sql`AND ap.session_number = ${sessionNum}` : sql``}
      ORDER BY ap.session_number, a.last_name
    `;

    // Calculate correction factors if enough anchors exist
    const category = await sql`SELECT evaluation_config FROM age_categories WHERE id = ${catId}`;
    const config = category[0]?.evaluation_config || {};

    return NextResponse.json({ anchors, calibration_enabled: config.anchor_calibration_enabled || false });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;
    const { action, athlete_id, session_number } = await request.json();
    const userRes = await sql`SELECT id FROM users WHERE email = ${session.email}`;
    const userId = userRes[0]?.id;

    if (action === "flag") {
      // Max 3 anchors per session
      const existing = await sql`SELECT COUNT(*) as count FROM anchor_players WHERE age_category_id = ${catId} AND session_number = ${session_number}`;
      if (parseInt(existing[0].count) >= 3) return NextResponse.json({ error: "Maximum 3 anchor players per session" }, { status: 400 });

      await sql`
        INSERT INTO anchor_players (age_category_id, athlete_id, session_number, flagged_by)
        VALUES (${catId}, ${athlete_id}, ${session_number}, ${userId})
        ON CONFLICT (age_category_id, athlete_id, session_number) DO NOTHING
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "unflag") {
      await sql`DELETE FROM anchor_players WHERE age_category_id = ${catId} AND athlete_id = ${athlete_id} AND session_number = ${session_number}`;
      return NextResponse.json({ success: true });
    }

    if (action === "calculate") {
      // Calculate correction factors for each group boundary using anchor scores
      const anchors = await sql`SELECT * FROM anchor_players WHERE age_category_id = ${catId} AND session_number = ${session_number}`;
      
      // Get all scores for anchor players in this session
      const corrections = [];
      for (const anchor of anchors) {
        const scores = await sql`
          SELECT cs.score, sc.name as category_name, 
            sg.group_number,
            AVG(cs.score) OVER (PARTITION BY sg.group_number) as group_avg_for_anchor
          FROM category_scores cs
          JOIN scoring_categories sc ON sc.id = cs.scoring_category_id
          JOIN player_group_assignments pga ON pga.athlete_id = cs.athlete_id
          JOIN session_groups sg ON sg.id = pga.session_group_id AND sg.session_number = cs.session_number
          WHERE cs.athlete_id = ${anchor.athlete_id} AND cs.age_category_id = ${catId} AND cs.session_number = ${session_number}
        `;
        
        const byGroup = {};
        scores.forEach(s => {
          if (!byGroup[s.group_number]) byGroup[s.group_number] = [];
          byGroup[s.group_number].push(parseFloat(s.score));
        });

        const groupAvgs = {};
        Object.entries(byGroup).forEach(([g, vals]) => {
          groupAvgs[g] = vals.reduce((a, b) => a + b, 0) / vals.length;
        });

        await sql`
          UPDATE anchor_players SET raw_scores = ${JSON.stringify(groupAvgs)}
          WHERE age_category_id = ${catId} AND athlete_id = ${anchor.athlete_id} AND session_number = ${session_number}
        `;
        corrections.push({ anchor_id: anchor.id, athlete_id: anchor.athlete_id, groupAvgs });
      }

      // Calculate correction factor per group boundary
      const groups = Object.keys(corrections[0]?.groupAvgs || {}).map(Number).sort();
      const factors = {};
      for (let i = 0; i < groups.length - 1; i++) {
        const g1 = groups[i], g2 = groups[i+1];
        const ratios = corrections
          .filter(c => c.groupAvgs[g1] && c.groupAvgs[g2])
          .map(c => c.groupAvgs[g1] / c.groupAvgs[g2]);
        if (ratios.length) factors[`${g1}_${g2}`] = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      }

      return NextResponse.json({ success: true, correction_factors: factors, anchor_count: anchors.length });
    }

    if (action === "approve") {
      const { correction_factors } = await request.json().catch(() => ({})) || {};
      // Store approved correction in evaluation_config
      const cat = await sql`SELECT evaluation_config FROM age_categories WHERE id = ${catId}`;
      const config = cat[0]?.evaluation_config || {};
      config.approved_corrections = config.approved_corrections || {};
      config.approved_corrections[session_number] = { factors: correction_factors, approved_by: userId, approved_at: new Date().toISOString() };
      await sql`UPDATE age_categories SET evaluation_config = ${JSON.stringify(config)} WHERE id = ${catId}`;
      return NextResponse.json({ success: true });
    }

    if (action === "toggle_calibration") {
      const { enabled } = await request.json().catch(() => ({})) || {};
      const cat = await sql`SELECT evaluation_config FROM age_categories WHERE id = ${catId}`;
      const config = cat[0]?.evaluation_config || {};
      config.anchor_calibration_enabled = enabled;
      await sql`UPDATE age_categories SET evaluation_config = ${JSON.stringify(config)} WHERE id = ${catId}`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Anchors error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
