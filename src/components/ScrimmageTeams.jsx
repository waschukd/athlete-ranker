"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, Pencil, Trash2, Plus, Shuffle, Search, Users } from "lucide-react";

// Team assignment for a Tournament category. Spreadsheet-style: a player
// list on the left with a team dropdown per row, and each team's resulting
// roster on the right, updating live. No drag-and-drop -- native HTML5 drag
// doesn't fire on touch devices (iOS/Android), which is how this is used
// rinkside. Rendered on the Teams tab when eval_format = 'round_robin'.
const posShort = (p) => { const s = (p || "").toLowerCase(); return s === "forward_defense" ? "F/D" : s.startsWith("d") ? "D" : s.startsWith("g") ? "G" : "F"; };
const nameOf = (a) => `${a.first_name || ""} ${a.last_name || ""}`.trim() || `#${a.jersey_number ?? "?"}`;
const teamLabel = (name) => String(name || "").replace(/^team\s+/i, "").trim() || name;

export default function ScrimmageTeams({ catId }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState(null);
  const [count, setCount] = useState(3);
  const [rebuildCount, setRebuildCount] = useState(2);
  const [applied, setApplied] = useState(null);
  const [err, setErr] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/categories/${catId}/scrimmage-teams`);
    const d = await res.json();
    setData(d);
    if (d.teams?.length) setCount(d.teams.length);
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const post = async (body) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "That didn't work — try again."); }
      await load();
    } catch { setErr("Network error — try again."); }
    setBusy(false);
  };

  const movePlayer = async (athleteId, toTeamId) => {
    setMovingId(athleteId);
    await post({ action: "move_player", athlete_id: athleteId, to_team_id: toTeamId });
    setMovingId(null);
  };

  const startRename = (team) => { setRenamingId(team.id); setNameDraft(teamLabel(team.name)); };
  const saveRename = async (teamId) => {
    const name = nameDraft.trim();
    setRenamingId(null);
    if (!name) return;
    await post({ action: "rename", team_id: teamId, name });
  };

  const removeTeam = (team) => {
    if (teams.length <= 2) return;
    const withPlayers = team.members.length ? ` Its ${team.members.length} player${team.members.length === 1 ? "" : "s"} will go back to unassigned.` : "";
    if (confirm(`Remove ${teamLabel(team.name)}?${withPlayers} This can't be undone (you'd need to re-add and re-place them).`)) {
      post({ action: "remove_team", team_id: team.id });
    }
  };

  const applyMatchups = async () => {
    setBusy(true); setApplied(null);
    try {
      const res = await fetch(`/api/categories/${catId}/scrimmage-teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply_matchups" }) });
      setApplied(await res.json());
    } catch {}
    setBusy(false);
  };

  // Redistribute everyone across the CURRENT teams from scratch -- e.g. after a
  // round of cuts shrinks the roster and hand-dragging each remaining player is
  // impractical. Only cut_at IS NULL players are eligible (seedTeams' own query),
  // so cut players never come back. Clears every existing placement first, so a
  // director who already fine-tuned a lineup should use the per-player dropdown
  // instead -- this is for a fresh redistribution, not a nudge.
  const reseed = async (mode) => {
    if (!confirm(`Clear every player's current team and redistribute all ${roster.length} of them ${mode === "even" ? "by jersey #" : "alphabetically"} across the ${teams.length} existing team${teams.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    await post({ action: "seed", mode, count: teams.length });
  };

  // Same as reseed, but ALSO changes how many teams there are -- the 3-to-2 move
  // after cuts. Shrinking drops the last-added teams and keeps the earlier ones
  // (and their names); everyone still eligible is then redistributed across
  // whatever remains, so no cut player comes back and nobody is left stranded on
  // a team that no longer exists.
  const rebuild = async (mode) => {
    const n = rebuildCount;
    if (n === teams.length) return reseed(mode);
    const dropping = teams.length - n;
    const warn = dropping > 0
      ? `This removes ${dropping} team${dropping === 1 ? "" : "s"} (the most recently added) and `
      : `This adds ${Math.abs(dropping)} team${Math.abs(dropping) === -1 ? "" : "s"} and `;
    if (!confirm(`Rebuild into ${n} teams? ${warn}redistributes all ${roster.length} remaining player${roster.length === 1 ? "" : "s"} ${mode === "even" ? "by jersey #" : "alphabetically"}. Cut players are not included. This can't be undone.`)) return;
    await post({ action: "seed", mode, count: n });
  };

  // Mean current ranking of a team. Two teams from a rank snake draft should
  // land within a point or two of each other; a wide gap means someone has been
  // moved by hand since, which is exactly what this is here to reveal.
  const avgRank = (t) => {
    const rs = (t.members || []).map(m => m.rank).filter(r => typeof r === "number");
    return rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 10) / 10 : null;
  };

  const teams = data?.teams || [];
  const unassigned = data?.unassigned || [];
  const roster = useMemo(() => [
    ...teams.flatMap(t => t.members.map(m => ({ ...m, id: m.athlete_id, teamId: t.id }))),
    ...unassigned.map(a => ({ ...a, teamId: null })),
  ].sort((x, y) => nameOf(x).localeCompare(nameOf(y))), [teams, unassigned]);
  const filtered = query.trim() ? roster.filter(a => nameOf(a).toLowerCase().includes(query.trim().toLowerCase())) : roster;

  if (!data) return <div className="py-10 text-center text-sm text-gray-400">Loading teams…</div>;

  return (
    <div className="space-y-4">
      {err && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
          <span>{err}</span>
          <button onClick={() => setErr("")} className="text-red-400 hover:text-red-600 text-xs font-semibold">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        {teams.length === 0 ? (
          <>
            <span className="text-xs font-medium text-gray-500">Teams:</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={() => post({ action: "create", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create teams
            </button>
            <button onClick={() => post({ action: "seed", mode: "ranked", count })} disabled={busy} title="Snake draft by current ranking — only meaningful once scores exist" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Seed by rank
            </button>
            <button onClick={() => post({ action: "seed", mode: "alphabetical", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Seed alphabetically
            </button>
            <button onClick={() => post({ action: "seed", mode: "even", count })} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              Even split (by #)
            </button>
            <span className="text-[11px] text-gray-400 w-full">Pick a team count, then Create teams (place everyone yourself below) or Seed (auto-fills everyone).</span>
          </>
        ) : (
          <>
            <button onClick={() => post({ action: "add_team" })} disabled={busy || teams.length >= 6} title={teams.length >= 6 ? "Maximum of 6 teams" : "Add another team"} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Plus size={13} /> Add team
            </button>

            {/* Rebuild into a different number of teams. Going 3 -> 2 after cuts
                is routine, but the count picker only ever appeared on an EMPTY
                set, so the only way down was deleting teams one at a time. */}
            <span className="text-xs font-medium text-gray-500 ml-1">Rebuild into</span>
            <select value={rebuildCount} onChange={(e) => setRebuildCount(Number(e.target.value))} disabled={busy}
              className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} teams</option>)}
            </select>
            <button onClick={() => rebuild("ranked")} disabled={busy}
              title="Snake draft by current ranking — best available alternates, so both sides come out even"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50">
              <Shuffle size={13} /> Snake draft by rank
            </button>
            <button onClick={() => rebuild("alphabetical")} disabled={busy}
              title="Ignores ability — only use before any scores exist"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              A–Z
            </button>
            <button onClick={applyMatchups} disabled={busy} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-accent text-accent rounded-lg font-semibold hover:bg-accent-soft disabled:opacity-50">
              Apply to schedule
            </button>
            <span className="w-px h-4 bg-gray-200" />
            <button onClick={() => reseed("alphabetical")} disabled={busy} title="Clear all placements and redistribute alphabetically" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              <Shuffle size={13} /> Reseed alphabetically
            </button>
            <button onClick={() => reseed("even")} disabled={busy} title="Clear all placements and redistribute evenly by jersey #" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">
              Reseed even split
            </button>
            <span className="text-[11px] text-gray-400 w-full">Pick a team from each player's dropdown to nudge one player, or Reseed to redistribute everyone from scratch (e.g. after cuts).</span>
            {applied && <span className="text-[11px] text-gray-500 w-full">Filled {applied.applied} upcoming game{applied.applied === 1 ? "" : "s"}{applied.skipped ? ` · ${applied.skipped} already played/unresolved` : ""}.</span>}
          </>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Pick a team count and Create/Seed above to get started.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
          {/* Player list -- name + team dropdown, the one control that moves people. */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3.5 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">Players ({roster.length})</h4>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Find…"
                  className="pl-7 pr-2.5 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent/40 w-28"
                />
              </div>
            </div>
            <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {filtered.map(a => (
                <div key={a.id} className="flex items-center gap-2 px-3.5 py-2 text-sm">
                  <span className="font-mono text-[11px] text-gray-400 w-5 flex-shrink-0">{a.jersey_number ?? ""}</span>
                  <span className="font-mono text-[11px] text-gray-500 w-7 flex-shrink-0 text-right" title={a.rank != null ? `Currently ranked #${a.rank}` : "No ranking yet"}>{a.rank != null ? `#${a.rank}` : "—"}</span>
                  <span className="truncate flex-1 text-gray-700">{nameOf(a)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${posShort(a.position) === "D" ? "bg-accent-soft text-accent" : "bg-gray-100 text-gray-500"}`}>{posShort(a.position)}</span>
                  <div className="relative flex-shrink-0">
                    <select
                      value={a.teamId ?? ""}
                      onChange={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; if (Number.isFinite(v)) movePlayer(a.id, v); }}
                      disabled={busy}
                      className="text-xs border border-gray-200 rounded-lg pl-2 pr-6 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50 appearance-none">
                      {a.teamId == null && <option value="">Unassigned</option>}
                      {teams.map(t => <option key={t.id} value={t.id}>{teamLabel(t.name)}</option>)}
                    </select>
                    {movingId === a.id && <Loader2 size={11} className="animate-spin absolute right-1.5 top-1/2 -translate-y-1/2 text-accent pointer-events-none" />}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="py-8 text-center text-sm text-gray-300">No players match "{query}".</div>}
            </div>
          </div>

          {/* Team columns -- read-only view of the result, one card per team. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {teams.map(t => {
              const d = t.members.filter(m => posShort(m.position) === "D").length;
              const f = t.members.length - d;
              return (
                <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-3 min-h-[120px]">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    {renamingId === t.id ? (
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={e => setNameDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveRename(t.id); if (e.key === "Escape") setRenamingId(null); }}
                        onBlur={() => saveRename(t.id)}
                        maxLength={40}
                        className="min-w-0 flex-1 text-sm font-bold text-ink border border-accent/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    ) : (
                      <button onClick={() => startRename(t)} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink hover:opacity-70 min-w-0" title="Rename team">
                        <span className="truncate">{teamLabel(t.name)}</span>
                        <Pencil size={11} className="text-gray-300 flex-shrink-0" />
                      </button>
                    )}
                    <span className="text-[11px] text-accent bg-accent-soft rounded-full px-2 py-0.5 font-semibold flex-shrink-0">{t.members.length} · {f}F/{d}D</span>
                    {avgRank(t) != null && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 font-semibold flex-shrink-0" title="Average current ranking of this team — the two should be close after a rank snake draft">
                        avg #{avgRank(t)}
                      </span>
                    )}
                    {teams.length > 2 && (
                      <button onClick={() => removeTeam(t)} disabled={busy} className="text-gray-300 hover:text-red-500 flex-shrink-0 disabled:opacity-40" title={`Remove ${teamLabel(t.name)}`}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {t.members.map(m => (
                      <div key={m.athlete_id} className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg bg-gray-50">
                        <span className="font-mono text-[10px] text-gray-400 w-5">{m.jersey_number ?? ""}</span>
                        <span className="font-mono text-[10px] text-gray-500 w-7 flex-shrink-0 text-right" title={m.rank != null ? `Currently ranked #${m.rank}` : "No ranking yet"}>{m.rank != null ? `#${m.rank}` : "—"}</span>
                        <span className="truncate flex-1 text-gray-700">{nameOf(m)}</span>
                      </div>
                    ))}
                    {t.members.length === 0 && <div className="text-xs text-gray-300 text-center py-4 flex items-center justify-center gap-1.5"><Users size={12} /> No players yet</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
