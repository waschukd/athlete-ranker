"use client";

import { useState, useRef, Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ArrowLeft, Users, Shuffle, Check, AlertCircle,
  GripVertical, ChevronRight, Copy, ExternalLink, RefreshCw
} from "lucide-react";

const qc = new QueryClient();

const POSITION_COLORS = {
  forward: "bg-blue-100 text-blue-700",
  defense: "bg-purple-100 text-purple-700",
  goalie: "bg-amber-100 text-amber-700",
};
const POSITION_SHORT = { forward: "F", defense: "D", goalie: "G" };

function GroupsManagerInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const catId = params.catId;
  const orgId = searchParams.get("org");
  const queryClient = useQueryClient();

  const initialSession = searchParams.get("session") ? parseInt(searchParams.get("session")) : null;
  const [selectedSession, setSelectedSession] = useState(initialSession);
  const [dragging, setDragging] = useState(null); // { athleteId, fromGroupId }
  const [dragOver, setDragOver] = useState(null); // groupId
  const [message, setMessage] = useState(null);

  // Get sessions
  const { data: setupData } = useQuery({
    queryKey: ["category-setup", catId],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/setup`);
      return res.json();
    },
  });

  // Get groups + assignments for selected session
  const { data: groupsData, isLoading: groupsLoading, refetch } = useQuery({
    queryKey: ["groups", catId, selectedSession],
    queryFn: async () => {
      const res = await fetch(`/api/categories/${catId}/groups?session=${selectedSession}`);
      return res.json();
    },
    enabled: !!selectedSession,
    refetchInterval: 15000,
  });

  const sessions = setupData?.sessions || [];
  const groups = groupsData?.groups || [];
  const assignments = groupsData?.assignments || [];

  // Auto-select first session
  useEffect(() => {
    if (sessions.length && !selectedSession) setSelectedSession(sessions[0].session_number);
  }, [sessions]);

  // Build group -> players map
  const groupPlayers = groups.reduce((acc, g) => {
    acc[g.id] = assignments.filter(a => a.session_group_id === g.id)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return acc;
  }, {});

  const unassigned = assignments.filter(a => !groups.find(g => g.id === a.session_group_id));
  const goalies = groupsData?.goalies || [];

  const showMsg = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const autoAssign = async (method, position_balanced = false) => {
    const res = await fetch(`/api/categories/${catId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto_assign", session_number: selectedSession, method, position_balanced }),
    });
    const data = await res.json();
    if (data.success) {
      showMsg(`Assigned ${data.assigned} athletes across ${data.groups} groups`);
      refetch();
    } else {
      showMsg(data.error, "error");
    }
  };

  const movePlayer = async (athleteId, fromGroupId, toGroupId) => {
    if (fromGroupId === toGroupId) return;
    const toGroup = groups.find(g => g.id === toGroupId);
    const currentPlayers = groupPlayers[toGroupId] || [];

    const res = await fetch(`/api/categories/${catId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_player",
        athlete_id: athleteId,
        from_group_id: fromGroupId,
        to_group_id: toGroupId,
        display_order: currentPlayers.length,
      }),
    });
    const data = await res.json();
    if (data.success) {
      refetch();
    } else {
      showMsg(data.error, "error");
    }
  };

  // Drag handlers
  const onDragStart = (e, athleteId, fromGroupId) => {
    setDragging({ athleteId, fromGroupId });
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, groupId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(groupId);
  };

  const onDrop = (e, toGroupId) => {
    e.preventDefault();
    if (dragging && dragging.fromGroupId !== toGroupId) {
      movePlayer(dragging.athleteId, dragging.fromGroupId, toGroupId);
    }
    setDragging(null);
    setDragOver(null);
  };

  const selectedSessionData = sessions.find(s => s.session_number === selectedSession);
  const checkedInCount = assignments.filter(a => a.checked_in).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <a href={`/association/dashboard/category/${catId}?org=${orgId}`}
            className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#1A6BFF] mb-4 text-sm font-medium transition-colors">
            <ArrowLeft size={15} /> Back to Category
          </a>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Group Management</h1>
              <p className="text-sm text-gray-400 mt-0.5">Assign athletes to groups · drag and drop to move players</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => refetch()}
                className="p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Session selector */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {sessions.map(s => (
              <button key={s.session_number}
                onClick={() => setSelectedSession(s.session_number)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  selectedSession === s.session_number
                    ? "border-[#1A6BFF] text-[#1A6BFF]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                Session {s.session_number}
                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                  s.session_type === "testing" ? "bg-blue-100 text-blue-600" :
                  s.session_type === "skills" ? "bg-purple-100 text-purple-600" :
                  "bg-green-100 text-green-600"
                }`}>{s.session_type}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Message */}
        {message && (
          <div className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
            message.type === "error"
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-green-50 border border-green-200 text-green-700"
          }`}>
            {message.type === "error" ? <AlertCircle size={15} /> : <Check size={15} />}
            {message.text}
          </div>
        )}

        {/* Controls */}
        {selectedSession && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{assignments.length}</span> athletes ·{" "}
                <span className="font-semibold text-gray-900">{groups.length}</span> groups ·{" "}
                <span className="font-semibold text-green-600">{checkedInCount}</span> checked in
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => autoAssign("alphabetical", false)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Shuffle size={14} /> A–Z
              </button>
              <button
                onClick={() => autoAssign("ranking", false)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
              >
                <Shuffle size={14} /> By Ranking
              </button>
              <button
                onClick={() => autoAssign("ranking", true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg text-sm font-semibold hover:shadow-md transition-shadow"
              >
                <Shuffle size={14} /> Position Balanced (3:2 F:D)
              </button>
            </div>
          </div>
        )}

        {groupsLoading ? (
          <div className="py-12 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A6BFF] mx-auto mb-3" />
            Loading groups...
          </div>
        ) : groups.length === 0 ? (
          <div className="py-16 text-center bg-white border border-dashed border-gray-200 rounded-2xl">
            <Users size={48} className="mx-auto text-gray-200 mb-4" />
            <h3 className="font-semibold text-gray-700 mb-2">No groups for this session</h3>
            <p className="text-sm text-gray-400 mb-1">Groups are created automatically when you upload a schedule.</p>
            <p className="text-sm text-gray-400">Make sure your schedule CSV includes group numbers for Session {selectedSession}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {groups.map(group => {
              const players = groupPlayers[group.id] || [];
              const groupSchedule = assignments.find(a => a.session_group_id === group.id);
              const checkinCode = groupSchedule?.checkin_code;
              const scheduleId = groupSchedule?.schedule_id;
              const isDropTarget = dragOver === group.id;

              return (
                <div
                  key={group.id}
                  onDragOver={e => onDragOver(e, group.id)}
                  onDrop={e => onDrop(e, group.id)}
                  onDragLeave={() => setDragOver(null)}
                  className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${
                    isDropTarget
                      ? "border-[#1A6BFF] shadow-lg shadow-orange-100"
                      : "border-gray-200"
                  }`}
                >
                  {/* Group header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center text-white text-sm font-bold">
                        {group.group_number}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 text-sm">{group.name || `Group ${group.group_number}`}</div>
                        <div className="text-xs text-gray-400">{players.length} players</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {checkinCode && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {checkinCode}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(checkinCode)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            title="Copy code"
                          >
                            <Copy size={11} />
                          </button>
                          {scheduleId && (
                            <a href={`/checkin/${scheduleId}`} target="_blank"
                              className="p-1 text-[#1A6BFF] hover:text-[#0F4FCC] rounded"
                              title="Open check-in">
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Check-in progress */}
                  {players.some(p => p.checked_in !== null) && (
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Check-in</span>
                        <span className="font-medium text-gray-700">
                          {players.filter(p => p.checked_in).length}/{players.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${players.length ? (players.filter(p => p.checked_in).length / players.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Player list */}
                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {players.length === 0 ? (
                      <div className={`py-8 text-center text-xs text-gray-400 ${isDropTarget ? "bg-orange-50" : ""}`}>
                        {isDropTarget ? "Drop player here" : "No players assigned"}
                      </div>
                    ) : (
                      players.map((player, idx) => (
                        <div
                          key={player.athlete_id}
                          draggable
                          onDragStart={e => onDragStart(e, player.athlete_id, group.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing transition-colors ${
                            dragging?.athleteId === player.athlete_id ? "opacity-50" : ""
                          } ${player.checked_in ? "bg-green-50/30" : ""}`}
                        >
                          <GripVertical size={13} className="text-gray-300 flex-shrink-0" />

                          {/* Jersey/color indicator */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            player.team_color === "White"
                              ? "bg-white border-2 border-gray-300 text-gray-700"
                              : player.team_color === "Dark"
                              ? "bg-gray-800 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {player.jersey_number || (idx + 1)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {player.last_name}, {player.first_name}
                            </div>
                            <div className="text-xs text-gray-400">{player.external_id || ""}</div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {player.position && (
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${POSITION_COLORS[player.position] || "bg-gray-100 text-gray-600"}`}>
                                {POSITION_SHORT[player.position] || player.position}
                              </span>
                            )}
                            {player.checked_in && (
                              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                <Check size={10} className="text-white" />
                              </div>
                            )}
                            {player.team_color && (
                              <span className="text-xs text-gray-400">{player.team_color}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Drop zone indicator */}
                    {isDropTarget && players.length > 0 && (
                      <div className="py-2 text-center text-xs text-[#1A6BFF] bg-orange-50 font-medium">
                        Drop to add to this group
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Goalie Assignment Panel */}
        {goalies.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              🥅 Unassigned Goalies ({goalies.length})
            </h3>
            <p className="text-xs text-amber-600 mb-4">Goalies are not included in auto-assign. Drag them into a group or use the buttons below.</p>
            <div className="flex flex-wrap gap-3">
              {goalies.map(g => (
                <div key={g.id} className="bg-white border border-amber-200 rounded-xl px-3 py-2">
                  <div className="text-sm font-medium text-gray-900">{g.last_name}, {g.first_name}</div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {groups.map(group => (
                      <button
                        key={group.id}
                        onClick={async () => {
                          await fetch(`/api/categories/${catId}/groups`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "assign_goalie", athlete_id: g.id, group_id: group.id }),
                          });
                          refetch();
                        }}
                        className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium"
                      >
                        → G{group.group_number}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GroupsPage() {
  return (
    <QueryClientProvider client={qc}>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A6BFF]" />
        </div>
      }>
        <GroupsManagerInner />
      </Suspense>
    </QueryClientProvider>
  );
}
