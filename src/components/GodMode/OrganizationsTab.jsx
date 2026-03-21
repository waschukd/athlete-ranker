import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { OrganizationCard } from "./OrganizationCard";
import { LoadingState } from "./LoadingState";
import { CreateOrganizationModal } from "./CreateOrganizationModal";

export function OrganizationsTab() {
  const [filterType, setFilterType] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: organizations, isLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await fetch("/api/organizations");
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
  });

  const allOrgs = organizations?.organizations || [];
  const displayedOrgs = filterType === "all" ? allOrgs : allOrgs.filter((org) => org.type === filterType);

  const filterBtn = (id, label, count) => {
    const isActive = filterType === id;
    return (
      <button
        onClick={() => setFilterType(id)}
        style={{
          padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
          background: isActive ? "var(--gm-accent-soft)" : "var(--gm-surface2)",
          color: isActive ? "var(--gm-accent)" : "var(--gm-muted)",
          fontSize: 12, fontWeight: isActive ? 600 : 400, fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        {label} <span style={{ opacity: 0.6 }}>({count})</span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {filterBtn("all", "All", allOrgs.length)}
          {filterBtn("service_provider", "Providers", allOrgs.filter(o => o.type === "service_provider").length)}
          {filterBtn("association", "Associations", allOrgs.filter(o => o.type === "association").length)}
        </div>
        <button className="gm-btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} />
          New Organization
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingState text="Loading organizations..." />
      ) : displayedOrgs.length === 0 ? (
        <div className="gm-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ color: "var(--gm-dim)", fontSize: 13 }}>No organizations found</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {displayedOrgs.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateOrganizationModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
