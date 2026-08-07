import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { snakeDistribute } from "@/lib/teamInsights";
import { computeCategoryRankings } from "@/lib/rankings";
import { sendEmail, parentEmails, esc, parentTeamPlacementHtml, emailWrapper } from "@/lib/email";
import { signCoachReportToken } from "@/lib/calendar-token";
import { generateCoachBriefing } from "@/lib/coachBriefing";

// Default team-placement message. {player} and {team} merge per athlete; the
// association can edit it before sending (e.g. add a TeamLinkt note).
const DEFAULT_TEAM_MESSAGE =
  "Congratulations on completing the evaluation process — and thank you for all of {player}'s hard work and effort throughout. After careful consideration of everything across the sessions, {player} will be playing on {team}.";

const mergeTokens = (tpl, vars) => String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

async function getAppUserId(session) {
  if (!session?.email) return null;
  const user = await sql`SELECT id FROM users WHERE email = ${session.email}`;
  return user[0]?.id || null;
}

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { catId } = params;

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const teams = await sql`
      SELECT t.*, 
        COUNT(DISTINCT tr.athlete_id) as player_count
      FROM teams t
      LEFT JOIN team_rosters tr ON tr.team_id = t.id
      WHERE t.age_category_id = ${catId}
      GROUP BY t.id
      ORDER BY t.rank_order, t.name
    `;

    const rosters = await sql`
      SELECT tr.*, a.first_name, a.last_name, a.external_id, a.position,
        t.name as team_name, t.id as team_id
      FROM team_rosters tr
      JOIN athletes a ON a.id = tr.athlete_id
      JOIN teams t ON t.id = tr.team_id
      WHERE t.age_category_id = ${catId}
      ORDER BY t.rank_order, tr.team_rank
    `;

    // Get unassigned goalies
    const goalies = await sql`
      SELECT a.id, a.first_name, a.last_name, a.external_id
      FROM athletes a
      WHERE a.age_category_id = ${catId}
        AND a.position = 'goalie'
        AND a.is_active = true
        AND a.id NOT IN (
          SELECT tr.athlete_id FROM team_rosters tr
          JOIN teams t ON t.id = tr.team_id
          WHERE t.age_category_id = ${catId}
        )
      ORDER BY a.last_name
    `;

    return NextResponse.json({ teams, rosters, goalies });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { catId } = params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const auth = await authorizeCategoryAccess(session, catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const userId = await getAppUserId(session);
    const body = await request.json();
    const { action } = body;

    if (action === "generate") {
      const { teams: teamConfig, method, snake_range, position_balanced } = body;
      // teamConfig = [{ name: "AA", size: 16 }, { name: "A", size: 15 }, ...]
      // method = "straight" | "snake"
      // snake_range = { from: 1, to: 36 } — optional, null means full list
      // position_balanced = true/false

      // Get live rankings (computed directly — see lib/rankings.js)
      const rankData = await computeCategoryRankings(catId);

      if (!rankData.has_scores) {
        return NextResponse.json({ error: "No scores available. Complete all sessions first." }, { status: 400 });
      }

      const ranked = rankData.athletes.sort((a, b) => (a.rank || 999) - (b.rank || 999));

      // Goalies rank in a SEPARATE pool (rankData.goalies) — they're assigned manually,
      // never auto-drafted. rankData.athletes is skaters only.
      const goalies = rankData.goalies || [];
      const skaters = ranked.filter(a => a.position !== 'goalie');

      // Clear existing teams for this category
      await sql`DELETE FROM team_rosters WHERE team_id IN (SELECT id FROM teams WHERE age_category_id = ${catId})`;
      await sql`DELETE FROM teams WHERE age_category_id = ${catId}`;

      // Create team records
      const createdTeams = [];
      for (let i = 0; i < teamConfig.length; i++) {
        const [team] = await sql`
          INSERT INTO teams (age_category_id, name, max_roster_size, rank_order)
          VALUES (${catId}, ${teamConfig[i].name}, ${teamConfig[i].size}, ${i + 1})
          RETURNING *
        `;
        createdTeams.push(team);
      }

      // Build assignment list — never drops a player who fits within total capacity;
      // honors per-team size caps and (when balanced) a defense target of ~5 (cap 6).
      const assignments = buildTeamAssignments(skaters, teamConfig, method, position_balanced);

      // Insert rosters
      for (const { athlete_id, team_index, team_rank } of assignments) {
        const team = createdTeams[team_index];
        if (!team) continue;
        await sql`
          INSERT INTO team_rosters (team_id, athlete_id, team_rank, age_category_id)
          VALUES (${team.id}, ${athlete_id}, ${team_rank}, ${catId})
          ON CONFLICT DO NOTHING
        `;
      }

      // Audit log
      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, new_value)
        VALUES (${catId}, ${userId}, 'generate_teams', 'category',
          ${JSON.stringify({ method, teams: teamConfig.length, position_balanced })})
      `;

      return NextResponse.json({ success: true, teams: createdTeams.length, assigned: assignments.length, unassigned_goalies: goalies.length });
    }

    if (action === "move_player") {
      const { athlete_id, from_team_id, to_team_id } = body;

      if (from_team_id) {
        await sql`DELETE FROM team_rosters WHERE athlete_id = ${athlete_id} AND team_id = ${from_team_id}`;
      }
      if (to_team_id) {
        const maxRank = await sql`SELECT COALESCE(MAX(team_rank), 0) as max FROM team_rosters WHERE team_id = ${to_team_id}`;
        await sql`
          INSERT INTO team_rosters (team_id, athlete_id, team_rank, age_category_id)
          VALUES (${to_team_id}, ${athlete_id}, ${parseInt(maxRank[0].max) + 1}, ${catId})
          ON CONFLICT DO NOTHING
        `;
      }

      await sql`
        INSERT INTO audit_log (age_category_id, user_id, action, entity_type, entity_id, new_value)
        VALUES (${catId}, ${userId}, 'team_move_player', 'athlete', ${athlete_id},
          ${JSON.stringify({ from_team_id, to_team_id })})
      `;

      return NextResponse.json({ success: true });
    }

    if (action === "assign_goalie") {
      const { athlete_id, team_id } = body;
      const maxRank = await sql`SELECT COALESCE(MAX(team_rank), 0) as max FROM team_rosters WHERE team_id = ${team_id}`;
      await sql`
        INSERT INTO team_rosters (team_id, athlete_id, team_rank, age_category_id)
        VALUES (${team_id}, ${athlete_id}, ${parseInt(maxRank[0].max) + 1}, ${catId})
        ON CONFLICT DO NOTHING
      `;
      return NextResponse.json({ success: true });
    }

    if (action === "auto_assign_goalies") {
      const teamsList = await sql`SELECT id FROM teams WHERE age_category_id = ${catId} ORDER BY rank_order, name`;
      if (!teamsList.length) return NextResponse.json({ error: "Generate teams first" }, { status: 400 });
      const goalieList = await sql`
        SELECT a.id FROM athletes a
        WHERE a.age_category_id = ${catId} AND a.position = 'goalie' AND a.is_active = true
          AND a.id NOT IN (
            SELECT tr.athlete_id FROM team_rosters tr
            JOIN teams t ON t.id = tr.team_id WHERE t.age_category_id = ${catId}
          )
        ORDER BY a.last_name
      `;
      const dist = snakeDistribute(goalieList.length, teamsList.length);
      let assigned = 0;
      for (let i = 0; i < goalieList.length; i++) {
        const team = teamsList[dist[i]];
        if (!team) continue;
        const maxRank = await sql`SELECT COALESCE(MAX(team_rank), 0) as max FROM team_rosters WHERE team_id = ${team.id}`;
        await sql`
          INSERT INTO team_rosters (team_id, athlete_id, team_rank, age_category_id)
          VALUES (${team.id}, ${goalieList[i].id}, ${parseInt(maxRank[0].max) + 1}, ${catId})
          ON CONFLICT DO NOTHING
        `;
        assigned++;
      }
      await sql`INSERT INTO audit_log (age_category_id, user_id, action, entity_type, new_value)
        VALUES (${catId}, ${userId}, 'auto_assign_goalies', 'category', ${JSON.stringify({ assigned })})`;
      return NextResponse.json({ success: true, assigned });
    }

    if (action === "clear") {
      await sql`DELETE FROM team_rosters WHERE team_id IN (SELECT id FROM teams WHERE age_category_id = ${catId})`;
      await sql`DELETE FROM teams WHERE age_category_id = ${catId}`;
      return NextResponse.json({ success: true });
    }

    // Rename a team — associations often use their own numbering (e.g. 401/402).
    if (action === "rename_team") {
      const teamId = parseInt(body.team_id);
      const name = String(body.name || "").trim().slice(0, 60);
      if (!teamId || !name) return NextResponse.json({ error: "team_id and name required" }, { status: 400 });
      await sql`UPDATE teams SET name = ${name} WHERE id = ${teamId} AND age_category_id = ${catId}`;
      return NextResponse.json({ success: true });
    }

    // Assign (or clear) a team's coach. Blank email = no report will be sent.
    if (action === "set_coach") {
      const teamId = parseInt(body.team_id);
      if (!teamId) return NextResponse.json({ error: "team_id required" }, { status: 400 });
      // Update only the field(s) supplied, so the name and email inputs can each
      // save on their own blur without clobbering the other.
      if ("coach_name" in body) {
        const name = String(body.coach_name || "").trim().slice(0, 120) || null;
        await sql`UPDATE teams SET coach_name = ${name} WHERE id = ${teamId} AND age_category_id = ${catId}`;
      }
      if ("coach_email" in body) {
        const email = String(body.coach_email || "").trim().slice(0, 200) || null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
        }
        await sql`UPDATE teams SET coach_email = ${email} WHERE id = ${teamId} AND age_category_id = ${catId}`;
      }
      return NextResponse.json({ success: true });
    }

    // Email each ASSIGNED coach a private link to their own team's development
    // report. Teams with no coach email are skipped (never auto-sent). Can be run
    // now or any time later.
    if (action === "email_coach_reports") {
      const [cat] = await sql`SELECT ac.name AS category_name, o.name AS org_name FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}`;
      if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });
      const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.sidelinestar.com";
      const teamRows = await sql`
        SELECT id, name, coach_name, coach_email, coach_briefing FROM teams
        WHERE age_category_id = ${catId} AND coach_email IS NOT NULL AND coach_email <> ''`;
      let sent = 0, skipped = 0;
      for (const t of teamRows) {
        try {
          // Make sure the emailed link will show a full written briefing —
          // best-effort; a failed/absent AI call just falls back to the
          // deterministic sections.
          if (!t.coach_briefing) { try { await generateCoachBriefing(catId, t.id); } catch (e) { console.error("briefing pregen failed", t.id, e?.message); } }
          const link = `${base}/coach-report/${signCoachReportToken(t.id)}`;
          const html = emailWrapper(`
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">${esc(t.name)} — Team Development Report</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Hi${t.coach_name ? " " + esc(t.coach_name.split(" ")[0]) : ""}, your ${esc(cat.category_name)} team has been finalized. Here's a private development report to help you plan the season — how your roster ranked among teammates, and the development themes evaluators flagged most across the group.</p>
            <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#0b5cd6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">View your team report →</a></p>
            <p style="margin:0;font-size:12px;color:#9aa0aa;line-height:1.6;">This link is private to you — please don't forward it. Sent by ${esc(cat.org_name)}.</p>`);
          await sendEmail(t.coach_email, `${t.name} — Team Development Report (${cat.category_name})`, html);
          sent++;
        } catch (e) {
          console.error("Coach report email failed for team " + t.id + ":", e?.message || e);
          skipped++;
        }
      }
      const [{ total }] = await sql`SELECT COUNT(*)::int total FROM teams WHERE age_category_id = ${catId}`;
      const without = total - teamRows.length;
      return NextResponse.json({ success: true, sent, skipped, without_coach: without });
    }

    // Return the default message + recipient count so the modal can preview before sending.
    if (action === "notify_preview") {
      const [{ n }] = await sql`
        SELECT COUNT(*)::int n FROM team_rosters tr
        JOIN athletes a ON a.id = tr.athlete_id
        WHERE tr.age_category_id = ${catId}
          AND ((a.parent_email IS NOT NULL AND a.parent_email <> '') OR (a.parent_email_2 IS NOT NULL AND a.parent_email_2 <> ''))`;
      return NextResponse.json({ default_message: DEFAULT_TEAM_MESSAGE, recipients: n });
    }

    // Email every rostered player's family their team placement.
    if (action === "notify_teams") {
      const [cat] = await sql`SELECT ac.name AS category_name, o.name AS org_name FROM age_categories ac JOIN organizations o ON o.id = ac.organization_id WHERE ac.id = ${catId}`;
      if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });
      const rows = await sql`
        SELECT a.first_name, a.last_name, a.parent_email, a.parent_email_2, t.name AS team_name
        FROM team_rosters tr
        JOIN teams t ON t.id = tr.team_id
        JOIN athletes a ON a.id = tr.athlete_id
        WHERE tr.age_category_id = ${catId}`;
      const bodyTpl = String(body.message || DEFAULT_TEAM_MESSAGE);
      const subjectTpl = String(body.subject || `Team placement — ${cat.category_name} (${cat.org_name})`);
      let sent = 0, skipped = 0;
      for (const r of rows) {
        const recipients = parentEmails(r);
        if (!recipients.length) { skipped++; continue; }
        const vars = { player: r.first_name, team: r.team_name, org: cat.org_name, category: cat.category_name };
        // Escape the merged (admin-authored) text, then re-apply paragraph breaks —
        // same guard as the onboarding override so it can't inject markup.
        const bodyHtml = mergeTokens(bodyTpl, vars).split(/\n\s*\n/).map(p => esc(p).replace(/\n/g, "<br/>")).join("<br/><br/>");
        const subject = mergeTokens(subjectTpl, vars);
        const html = parentTeamPlacementHtml({ playerName: `${r.first_name} ${r.last_name}`, categoryName: cat.category_name, orgName: cat.org_name, teamName: r.team_name, bodyHtml });
        try { for (const to of recipients) await sendEmail(to, subject, html); sent++; }
        catch (e) { console.error("Team notify failed for " + r.first_name + " " + r.last_name + ":", e?.message || e); skipped++; }
      }
      return NextResponse.json({ success: true, sent, skipped, total: rows.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Teams error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Assign ranked skaters to teams. Guarantees: (1) a real snake draft (1→2→3→3→2→1…)
// for even teams, or straight-cut tiering; (2) per-team size caps respected; (3) NO
// player dropped who fits within total capacity — leftovers always backfill; (4) unique
// team_rank per team (no ON CONFLICT collisions). Balanced mode targets ~5 D (cap 6).
function buildTeamAssignments(skaters, teamConfig, method, positionBalanced) {
  const numTeams = teamConfig.length;
  const size = teamConfig.map(t => Math.max(0, parseInt(t.size) || 0));
  const counts = new Array(numTeams).fill(0);
  const ranks = new Array(numTeams).fill(0);
  const assignments = [];
  const teams012 = Array.from({ length: numTeams }, (_, i) => i);
  const reversed = [...teams012].reverse();
  let round = 0;

  const place = (id, t) => { ranks[t]++; counts[t]++; assignments.push({ athlete_id: id, team_index: t, team_rank: ranks[t] }); };

  // Assign `list` in order; team t accepts until counts[t] reaches min(size[t], target[t]).
  // Snake alternates team order each round (even distribution); straight fills each team
  // to target before moving on. Returns players that didn't fit this phase.
  const assignPhase = (list, target) => {
    const cap = (t) => Math.min(size[t], target[t]);
    let i = 0;
    if (method === "straight") {
      for (let t = 0; t < numTeams && i < list.length; t++) {
        while (counts[t] < cap(t) && i < list.length) { place(list[i].id, t); i++; }
      }
    } else {
      while (i < list.length) {
        const order = (round++ % 2 === 0) ? teams012 : reversed;
        let placed = false;
        for (const t of order) {
          if (i >= list.length) break;
          if (counts[t] < cap(t)) { place(list[i].id, t); i++; placed = true; }
        }
        if (!placed) break; // every team is at its cap for this phase
      }
    }
    return list.slice(i);
  };

  if (positionBalanced) {
    const forwards = skaters.filter(a => a.position === "forward");
    const defense = skaters.filter(a => a.position === "defense");
    const other = skaters.filter(a => a.position !== "forward" && a.position !== "defense");
    const dTarget = size.map(s => Math.min(6, Math.round(s / 3)));   // ~5 D, cap 6
    const dLeft = assignPhase(defense, dTarget);                      // D up to target
    const fLeft = assignPhase(forwards, size.slice());               // F fill to full size (uses any empty D slots)
    assignPhase([...dLeft, ...fLeft, ...other], size.slice());       // backfill everyone else
  } else {
    assignPhase(skaters, size.slice());
  }
  return assignments;
}


