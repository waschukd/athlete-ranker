import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { snakeDistribute } from "@/lib/teamInsights";
import { computeCategoryRankings } from "@/lib/rankings";

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


