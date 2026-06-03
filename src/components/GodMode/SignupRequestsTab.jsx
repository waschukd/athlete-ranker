import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Inbox, Mail, Phone, Building2, User } from "lucide-react";
import { LoadingState } from "./LoadingState";

export function SignupRequestsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["god-mode-signup-requests"],
    queryFn: async () => {
      const res = await fetch("/api/admin/god-mode/signup-requests?status=pending");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }) => {
      const res = await fetch("/api/admin/god-mode/signup-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(["god-mode-signup-requests"]),
  });

  const requests = data?.requests || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="gm-card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div className="gm-section-title" style={{ margin: 0 }}>Pending Signup Requests</div>
          {requests.length > 0 && (
            <span className="gm-badge" style={{ background: "var(--gm-amber-soft)", color: "var(--gm-amber)" }}>
              {requests.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <LoadingState text="Loading requests..." />
        ) : requests.length === 0 ? (
          <div style={{ padding: "28px 0", textAlign: "center", color: "var(--gm-dim)", fontSize: 13 }}>
            <Inbox size={24} style={{ margin: "0 auto 8px", opacity: 0.4, display: "block" }} />
            No pending signup requests
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((req) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                padding: "14px 16px", background: "var(--gm-surface2)",
                borderRadius: 8, border: "1px solid var(--gm-border)", gap: 12, flexWrap: "wrap"
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--gm-text)", fontSize: 14 }}>
                    <Building2 size={14} style={{ color: "var(--gm-muted)", flexShrink: 0 }} />
                    {req.association_name}
                  </div>
                  {req.contact_name && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gm-muted)", marginTop: 6 }}>
                      <User size={12} style={{ flexShrink: 0 }} /> {req.contact_name}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gm-muted)", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    <Mail size={12} style={{ flexShrink: 0 }} /> {req.email}
                  </div>
                  {req.phone && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gm-muted)", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      <Phone size={12} style={{ flexShrink: 0 }} /> {req.phone}
                    </div>
                  )}
                  {req.message && (
                    <div style={{ fontSize: 12, color: "var(--gm-muted)", marginTop: 8, fontStyle: "italic", borderLeft: "2px solid var(--gm-border)", paddingLeft: 8 }}>
                      &ldquo;{req.message}&rdquo;
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--gm-dim)", marginTop: 8 }}>
                    Submitted {new Date(req.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => reviewMutation.mutate({ id: req.id, action: "approve" })}
                    disabled={reviewMutation.isPending}
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
                    onClick={() => reviewMutation.mutate({ id: req.id, action: "deny" })}
                    disabled={reviewMutation.isPending}
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
    </div>
  );
}
