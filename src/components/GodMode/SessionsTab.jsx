import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "./LoadingState";

const statusStyle = {
  completed: { bg: "var(--gm-green-soft)", text: "var(--gm-green)" },
  in_progress: { bg: "var(--gm-amber-soft)", text: "var(--gm-amber)" },
  scheduled: { bg: "var(--gm-blue-soft)", text: "var(--gm-blue)" },
};

export function SessionsTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["god-mode-sessions", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/api/admin/god-mode/sessions?status=${statusFilter}`
        : "/api/admin/god-mode/sessions";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
  });

  const allSessions = data?.sessions || [];
  const stats = data?.stats || {};

  // Client-side date-range filter over the already-loaded sessions, by scheduled_date.
  // (The sessions endpoint is not date-paginated, so this filters the loaded set.)
  const sessions = allSessions.filter((session) => {
    if (!fromDate && !toDate) return true;
    if (!session.scheduled_date) return false;
    const d = session.scheduled_date.toString().split("T")[0];
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });

  const statItems = [
    { label: "Total", value: stats.total || 0, color: "var(--gm-text)" },
    { label: "Scheduled", value: stats.scheduled || 0, color: "var(--gm-blue)" },
    { label: "In Progress", value: stats.in_progress || 0, color: "var(--gm-amber)" },
    { label: "Completed", value: stats.completed || 0, color: "var(--gm-green)" },
    { label: "Upcoming", value: stats.upcoming || 0, color: "var(--gm-purple)" },
    { label: "Overdue", value: stats.overdue || 0, color: "var(--gm-red)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {statItems.map(({ label, value, color }) => (
          <div key={label} className="gm-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 3, fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="gm-input"
          style={{ width: "auto", minWidth: 180 }}
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--gm-muted)", fontWeight: 500 }}>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="gm-input"
            style={{ width: "auto" }}
          />
          <span style={{ fontSize: 12, color: "var(--gm-muted)", fontWeight: 500 }}>To</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="gm-input"
            style={{ width: "auto" }}
          />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => { setFromDate(""); setToDate(""); }}
            className="gm-input"
            style={{ width: "auto", cursor: "pointer", color: "var(--gm-muted)" }}
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState text="Loading sessions..." />
      ) : (
        <div className="gm-card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="gm-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Organization</th>
                  <th>Date</th>
                  <th>Groups</th>
                  <th>Athletes</th>
                  <th>Evaluators</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--gm-dim)" }}>No sessions found</td></tr>
                ) : sessions.map((session) => {
                  const s = statusStyle[session.status] || statusStyle.scheduled;
                  return (
                    <tr key={session.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{session.name}</div>
                        <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 2 }}>{session.age_category_name}</div>
                      </td>
                      <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>{session.organization_name}</td>
                      <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>
                        {session.scheduled_date ? new Date(session.scheduled_date).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{session.group_count || 0}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{session.athlete_count || 0}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{session.evaluator_count || 0}</td>
                      <td>
                        <span className="gm-badge" style={{ background: s.bg, color: s.text }}>
                          {session.status?.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
