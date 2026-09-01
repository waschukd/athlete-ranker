import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeCategoryAccess } from "@/lib/authorize";
import { getScrimmageTeams, createTeams, setTeamCount, rankMap, addTeam, seedTeams, moveAthlete, applyAllMatchups, renameTeam, removeTeam } from "@/lib/scrimmageTeams";

const MANAGE = new Set(["super_admin", "association_admin", "director", "service_provider_admin"]);

export async function GET(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const teams = await getScrimmageTeams(params.catId);
    // Unassigned skaters (so the UI can show a pool to drag from).
    const assigned = new Set(teams.flatMap(t => t.members.map(m => m.athlete_id)));
    const skaters = await sql`
      SELECT id, first_name, last_name, jersey_number, helmet_number, position FROM athletes
      WHERE age_category_id = ${params.catId} AND is_active = true AND cut_at IS NULL AND COALESCE(position,'') <> 'goalie'
      ORDER BY last_name, first_name`;
    const unassigned = skaters.filter(a => !assigned.has(a.id));

    // Current standing per athlete, so the Teams tab can show WHO is on each
    // side and how the talent actually splits -- a snake draft is only
    // trustworthy if you can see the result.
    const ranks = await rankMap(params.catId);
    const withRank = (a) => ({ ...a, rank: ranks.get(a.athlete_id ?? a.id) ?? null });
    return NextResponse.json({
      teams: teams.map(t => ({ ...t, members: t.members.map(withRank) })),
      unassigned: unassigned.map(withRank),
    });
  } catch (error) {
    console.error("scrimmage-teams GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!MANAGE.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeCategoryAccess(session, params.catId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    if (body.action === "create") {
      const teams = await createTeams(params.catId, body.count);
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "add_team") {
      try {
        const teams = await addTeam(params.catId);
        return NextResponse.json({ success: true, teams });
      } catch (e) {
        return NextResponse.json({ error: e.message || "Could not add team" }, { status: 400 });
      }
    }
    if (body.action === "seed") {
      // Create the teams first if none exist, then seed. Also used to RESEED
      // an existing set (e.g. after a round of cuts shrinks the roster) --
      // seedTeams() clears and refills current membership either way.
      // A requested count now actually takes effect on an EXISTING set too.
      // Before, this only created teams when there were none, so seeding with
      // count:2 against 3 teams silently reseeded into 3 -- there was no way to
      // drop to 2 after cuts without deleting teams one at a time.
      const existing = await getScrimmageTeams(params.catId);
      const want = parseInt(body.count);
      if (!existing.length) await createTeams(params.catId, Number.isFinite(want) ? want : 3);
      else if (Number.isFinite(want) && want !== existing.length) await setTeamCount(params.catId, want);
      const teams = await seedTeams(params.catId, body.mode || "alphabetical");
      // Same as move_player/remove_team: keep any already-resolved-but-unplayed
      // game in sync with the new membership instead of leaving it stale until
      // someone separately hits "Apply to schedule". Frozen (past/checked-in)
      // games are untouched. Best-effort: a failure here must never undo the reseed.
      try { await applyAllMatchups(params.catId); } catch (e) { console.error("seed: re-apply matchups failed:", e?.message); }
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "move_player") {
      const athleteId = parseInt(body.athlete_id);
      const toTeamId = parseInt(body.to_team_id);
      // Unlike rename/remove_team below, this had no validation at all --
      // a malformed/missing athlete_id parsed to NaN and blew up the DELETE
      // query with a raw Postgres "invalid input syntax for type integer"
      // error (500) instead of a clean 400.
      if (!Number.isFinite(athleteId) || !Number.isFinite(toTeamId)) {
        return NextResponse.json({ error: "athlete_id and to_team_id required" }, { status: 400 });
      }
      await moveAthlete(params.catId, athleteId, toTeamId);
      // Without this, moving someone here didn't touch any game's already-
      // resolved roster -- a director would move a player, look at Manage
      // Groups, and see no change until someone separately hit "Apply to
      // schedule". Re-resolving every un-played game keeps them in sync
      // automatically. Best-effort: a failure here must never undo the move.
      try { await applyAllMatchups(params.catId); } catch (e) { console.error("move_player: re-apply matchups failed:", e?.message); }
      return NextResponse.json({ success: true });
    }
    if (body.action === "rename") {
      if (!body.team_id || !body.name) return NextResponse.json({ error: "team_id and name required" }, { status: 400 });
      await renameTeam(params.catId, parseInt(body.team_id), body.name);
      const teams = await getScrimmageTeams(params.catId);
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "remove_team") {
      if (!body.team_id) return NextResponse.json({ error: "team_id required" }, { status: 400 });
      const existing = await getScrimmageTeams(params.catId);
      if (existing.length <= 2) return NextResponse.json({ error: "At least 2 teams are required — remove players instead, or start over with a new team count." }, { status: 400 });
      await removeTeam(params.catId, parseInt(body.team_id));
      try { await applyAllMatchups(params.catId); } catch (e) { console.error("remove_team: re-apply matchups failed:", e?.message); }
      const teams = await getScrimmageTeams(params.catId);
      return NextResponse.json({ success: true, teams });
    }
    if (body.action === "apply_matchups") {
      const r = await applyAllMatchups(params.catId);
      return NextResponse.json({ success: true, ...r });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("scrimmage-teams POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
