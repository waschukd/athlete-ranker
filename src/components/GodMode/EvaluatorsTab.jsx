import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { LoadingState } from "./LoadingState";

const inviteStatusStyle = {
  pending: { bg: "var(--gm-amber-soft)", text: "var(--gm-amber)" },
  accepted: { bg: "var(--gm-green-soft)", text: "var(--gm-green)" },
  expired: { bg: "rgba(255,255,255,0.05)", text: "var(--gm-dim)" },
  cancelled: { bg: "rgba(255,255,255,0.05)", text: "var(--gm-dim)" },
};

export function EvaluatorsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["god-mode-evaluator-invites"],
    queryFn: async () => {
      const res = await fetch("/api/admin/god-mode/evaluator-invites");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const queryClient = useQueryClient();
  const approveMutation = useMutation({
    mutationFn: async ({ request_id, action }) => {
      const res = await fetch("/api/admin/god-mode/evaluator-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id, action }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["god-mode-evaluator-invites"]),
  });

  const stats = data?.stats || {};
  const joinRequests = data?.joinRequests || [];
  const invitations = data?.invitations || [];
  const pendingRequests = joinRequests.filter((r) => r.status === "pending");

  const statItems = [
    { label: "Pending Requests", value: stats.pending_requests || 0, color: "var(--gm-amber)" },
    { label: "Approved", value: stats.approved_requests || 0, color: "var(--gm-green)" },
    { label: "Denied", value: stats.denied_requests || 0, color: "var(--gm-red)" },
    { label: "Pending Invites", value: stats.pending_invites || 0, color: "var(--gm-blue)" },
    { label: "Accepted", value: stats.accepted_invites || 0, color: "var(--gm-purple)" },
    { label: "Expired", value: stats.expired_invites || 0, color: "var(--gm-dim)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
        {statItems.map(({ label, value, color }) => (
          <div key={label} className="gm-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 3, fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Pending Join Requests */}
      <div className="gm-card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div className="gm-section-title" style={{ margin: 0 }}>Pending Join Requests</div>
          {pendingRequests.length > 0 && (
            <span className="gm-badge" style={{ background: "var(--gm-amber-soft)", color: "var(--gm-amber)" }}>
              {pendingRequests.length}
            </span>
          )}
        </div>
        {isLoading ? (
          <LoadingState text="Loading requests..." />
        ) : pendingRequests.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 13 }}>
            <Clock size={24} style={{ margin: "0 auto 8px", opacity: 0.4, display: "block" }} />
            No pending requests
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingRequests.map((request) => (
              <div key={request.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", background: "var(--gm-surface2)",
                borderRadius: 8, border: "1px solid var(--gm-border)", gap: 12, flexWrap: "wrap"
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: "var(--gm-text)", fontSize: 13 }}>{request.user_name}</div>
                  <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{request.user_email}</div>
                  <div style={{ fontSize: 11, color: "var(--gm-dim)", marginTop: 4 }}>→ {request.organization_name}</div>
                  {request.message && (
                    <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 6, fontStyle: "italic", borderLeft: "2px solid var(--gm-border)", paddingLeft: 8 }}>
                      "{request.message}"
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => approveMutation.mutate({ request_id: request.id, action: "approve" })}
                    disabled={approveMutation.isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "7px 12px",
                      background: "var(--gm-green-soft)", border: "1px solid rgba(34,211,160,0.2)",
                      borderRadius: 7, color: "var(--gm-green)", cursor: "pointer",
                      fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                    }}
                  >
                    <CheckCircle size={13} /> Approve
                  </button>
                  <button
                    onClick={() => approveMutation.mutate({ request_id: request.id, action: "deny" })}
                    disabled={approveMutation.isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "7px 12px",
                      background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)",
                      borderRadius: 7, color: "var(--gm-red)", cursor: "pointer",
                      fontSize: 12, fontWeight: 500, fontFamily: "inherit",
                    }}
                  >
                    <XCircle size={13} /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Invitations */}
      <div className="gm-card" style={{ padding: "20px" }}>
        <div className="gm-section-title">All Invitations</div>
        {invitations.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 13 }}>No invitations yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="gm-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Organization</th>
                  <th>Invited By</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => {
                  const s = inviteStatusStyle[inv.status] || inviteStatusStyle.expired;
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{inv.email}</td>
                      <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>{inv.organization_name}</td>
                      <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>{inv.invited_by_name || "—"}</td>
                      <td>
                        <span className="gm-badge" style={{ background: s.bg, color: s.text }}>{inv.status}</span>
                      </td>
                      <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
