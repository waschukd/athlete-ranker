import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { OrganizationCard } from "./OrganizationCard";
import { LoadingState } from "./LoadingState";
import { CreateOrganizationModal } from "./CreateOrganizationModal";

export function OrganizationsTab() {
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
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
  const typeFiltered = filterType === "all" ? allOrgs : allOrgs.filter((org) => org.type === filterType);
  const needle = search.trim().toLowerCase();
  const displayedOrgs = needle
    ? typeFiltered.filter((org) => org.name?.toLowerCase().includes(needle))
    : typeFiltered;

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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {filterBtn("all", "All", allOrgs.length)}
          {filterBtn("service_provider", "Providers", allOrgs.filter(o => o.type === "service_provider").length)}
          {filterBtn("association", "Associations", allOrgs.filter(o => o.type === "association").length)}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--gm-dim)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="gm-input"
              style={{ paddingLeft: 32, paddingRight: search ? 28 : undefined, minWidth: 200 }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--gm-dim)", padding: 0, display: "flex", alignItems: "center" }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button className="gm-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} />
            New Organization
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingState text="Loading organizations..." />
      ) : displayedOrgs.length === 0 ? (
        <div className="gm-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ color: "var(--gm-dim)", fontSize: 13 }}>
            {needle ? `No organizations match "${search.trim()}"` : "No organizations found"}
          </div>
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
