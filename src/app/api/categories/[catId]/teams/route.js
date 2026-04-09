import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

      // Get live rankings
      const rankRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/categories/${catId}/rankings`, { headers: { cookie: request.headers.get("cookie") || "" } });
      const rankData = await rankRes.json();

      if (!rankData.has_scores) {
        return NextResponse.json({ error: "No scores available. Complete all sessions first." }, { status: 400 });
      }

      const ranked = rankData.athletes.sort((a, b) => (a.rank || 999) - (b.rank || 999));

      // Separate goalies — always manually assigned
      const goalies = ranked.filter(a => a.position === 'goalie');
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

      // Build assignment list
      let assignments = []; // [{ athlete_id, team_index, team_rank }]

      if (position_balanced) {
        // Separate by position, assign F then D then fill
        const forwards = skaters.filter(a => a.position === 'forward');
        const defense = skaters.filter(a => a.position === 'defense');
        const other = skaters.filter(a => !a.position || (a.position !== 'forward' && a.position !== 'defense'));

        // Calculate F:D ratio per team (3:2)
        const totalPerTeam = teamConfig.map(t => t.size);
        const fPerTeam = totalPerTeam.map(s => Math.round(s * 3 / 5));
        const dPerTeam = totalPerTeam.map((s, i) => s - fPerTeam[i]);

        // Assign forwards
        const fAssign = assignAthletes(forwards, teamConfig, method, snake_range, fPerTeam);
        const dAssign = assignAthletes(defense, teamConfig, method, snake_range, dPerTeam);
        const oAssign = assignAthletes(other, teamConfig, method, null, null);
        assignments = [...fAssign, ...dAssign, ...oAssign];
      } else {
        assignments = assignAthletes(skaters, teamConfig, method, snake_range, null);
      }

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

    if (action === "clear") {
      await sql`DELETE FROM team_rosters WHERE team_id IN (SELECT id FROM teams WHERE age_category_id = ${catId})`;
      await sql`DELETE FROM teams WHERE age_category_id = ${catId}`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Teams error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function assignAthletes(athletes, teamConfig, method, snakeRange, perTeamLimits) {
  const assignments = [];
  const numTeams = teamConfig.length;

  if (!athletes.length) return assignments;

  // Determine which players get snake vs straight
  const fromIdx = snakeRange ? snakeRange.from - 1 : 0;
  const toIdx = snakeRange ? snakeRange.to : athletes.length;

  const snakePlayers = snakeRange ? athletes.slice(fromIdx, toIdx) : (method === 'snake' ? athletes : []);
  const straightPlayers = snakeRange
    ? [...athletes.slice(0, fromIdx), ...athletes.slice(toIdx)]
    : (method === 'straight' ? athletes : []);

  // Track how many assigned to each team
  const teamCounts = new Array(numTeams).fill(0);
  const teamRanks = new Array(numTeams).fill(0);

  const canAdd = (teamIdx) => {
    if (perTeamLimits) return teamCounts[teamIdx] < perTeamLimits[teamIdx];
    return teamCounts[teamIdx] < teamConfig[teamIdx].size;
  };

  // Snake draft
  let forward = true;
  for (const athlete of snakePlayers) {
    const order = forward
      ? Array.from({ length: numTeams }, (_, i) => i)
      : Array.from({ length: numTeams }, (_, i) => numTeams - 1 - i);

    for (const teamIdx of order) {
      if (canAdd(teamIdx)) {
        teamRanks[teamIdx]++;
        assignments.push({ athlete_id: athlete.id, team_index: teamIdx, team_rank: teamRanks[teamIdx] });
        teamCounts[teamIdx]++;
        break;
      }
    }
    // Flip direction after each full round
    const roundComplete = order.every((_, i) => i === 0 || teamCounts[order[i]] > 0);
    if (roundComplete) forward = !forward;
  }

  // Straight cut — sequential blocks
  let idx = 0;
  for (let t = 0; t < numTeams && idx < straightPlayers.length; t++) {
    const limit = perTeamLimits ? perTeamLimits[t] : teamConfig[t].size;
    for (let p = 0; p < limit && idx < straightPlayers.length; p++) {
      teamRanks[t]++;
      assignments.push({ athlete_id: straightPlayers[idx].id, team_index: t, team_rank: teamRanks[t] });
      teamCounts[t]++;
      idx++;
    }
  }

  return assignments;
}


