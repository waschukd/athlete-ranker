import { Building2, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { StatBadge } from "./StatBadge";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function OrganizationCard({ org }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const href = org.type === "service_provider"
    ? `/service-provider/dashboard?org=${org.id}`
    : `/association/dashboard?org=${org.id}`;

  const isProvider = org.type === "service_provider";

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/organizations?id=${org.id}`, { method: "DELETE" });
    queryClient.invalidateQueries(["organizations"]);
    setDeleting(false);
    setConfirming(false);
  };

  return (
    <div
      className="gm-card"
      style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
          background: isProvider ? "var(--gm-purple-soft)" : "var(--gm-accent-soft)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Building2 size={17} style={{ color: isProvider ? "var(--gm-purple)" : "var(--gm-accent)" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "var(--gm-text)", fontSize: 14, fontWeight: 500 }}>{org.name}</span>
            <span className="gm-badge" style={{
              background: isProvider ? "var(--gm-purple-soft)" : "var(--gm-blue-soft)",
              color: isProvider ? "var(--gm-purple)" : "var(--gm-blue)"
            }}>
              {isProvider ? "Provider" : "Association"}
            </span>
          </div>
          <div style={{ color: "var(--gm-muted)", fontSize: 12, marginTop: 2 }}>
            {org.contact_email || "No contact email"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
        <StatBadge label="Age Groups" value={org.age_categories_count || 0} />
        <StatBadge label="Athletes" value={org.athletes_count || 0} />
        <StatBadge label="Active" value={org.active_evaluations || 0} color="emerald" />
        <a
          href={href}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            background: "var(--gm-accent-soft)", border: "1px solid rgba(255,107,53,0.25)",
            borderRadius: 8, color: "var(--gm-accent)", fontSize: 12, fontWeight: 500,
            textDecoration: "none", transition: "all 0.15s", whiteSpace: "nowrap"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,107,53,0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--gm-accent-soft)"}
        >
          <ExternalLink size={13} /> Open Dashboard
        </a>

        {confirming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--gm-red)", whiteSpace: "nowrap" }}>Delete everything?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "var(--gm-red-soft)", color: "var(--gm-red)", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "var(--gm-surface3)", color: "var(--gm-muted)", fontSize: 11, fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer", background: "var(--gm-red-soft)", color: "var(--gm-red)", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "inherit" }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
