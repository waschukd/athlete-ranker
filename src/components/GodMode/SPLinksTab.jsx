import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, Trash2, Building2, AlertCircle, Check } from "lucide-react";

export function SPLinksTab() {
  const queryClient = useQueryClient();
  const [selectedSP, setSelectedSP] = useState("");
  const [selectedAssoc, setSelectedAssoc] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sp-links"],
    queryFn: async () => {
      const res = await fetch("/api/admin/god-mode/sp-links");
      return res.json();
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ sp_id, assoc_id }) => {
      const res = await fetch("/api/admin/god-mode/sp-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_provider_id: parseInt(sp_id), association_id: parseInt(assoc_id) }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.error) { setError(data.error); return; }
      setSuccess("Link created successfully");
      setSelectedSP("");
      setSelectedAssoc("");
      setTimeout(() => setSuccess(""), 3000);
      queryClient.invalidateQueries(["sp-links"]);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ id, assoc_id }) => {
      await fetch(`/api/admin/god-mode/sp-links?id=${id}&assoc_id=${assoc_id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries(["sp-links"]),
  });

  const links = data?.links || [];
  const serviceProviders = data?.serviceProviders || [];
  const associations = data?.associations || [];

  // Group links by SP
  const bySP = links.reduce((acc, link) => {
    if (!acc[link.sp_id]) acc[link.sp_id] = { sp_name: link.sp_name, associations: [] };
    acc[link.sp_id].associations.push(link);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: "var(--gm-text)", fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          Service Provider Links
        </div>
        <div style={{ color: "var(--gm-muted)", fontSize: 13 }}>
          Connect associations to service providers. The SP will see the association's schedule and can assign their evaluators.
        </div>
      </div>

      {/* Create new link */}
      <div className="gm-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ color: "var(--gm-text)", fontSize: 14, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Link2 size={15} style={{ color: "var(--gm-accent)" }} /> Link an Association to a Service Provider
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, marginBottom: 14 }}>
            <AlertCircle size={14} style={{ color: "var(--gm-red)" }} />
            <span style={{ color: "var(--gm-red)", fontSize: 13 }}>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--gm-green-soft)", border: "1px solid rgba(34,211,160,0.2)", borderRadius: 8, marginBottom: 14 }}>
            <Check size={14} style={{ color: "var(--gm-green)" }} />
            <span style={{ color: "var(--gm-green)", fontSize: 13 }}>{success}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label className="gm-label">Service Provider</label>
            <select
              value={selectedSP}
              onChange={e => setSelectedSP(e.target.value)}
              className="gm-input"
            >
              <option value="">Select SP...</option>
              {serviceProviders.map(sp => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="gm-label">Association</label>
            <select
              value={selectedAssoc}
              onChange={e => setSelectedAssoc(e.target.value)}
              className="gm-input"
            >
              <option value="">Select Association...</option>
              {associations.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setError("");
              if (!selectedSP || !selectedAssoc) { setError("Select both a service provider and an association"); return; }
              linkMutation.mutate({ sp_id: selectedSP, assoc_id: selectedAssoc });
            }}
            disabled={linkMutation.isPending || !selectedSP || !selectedAssoc}
            className="gm-btn-primary"
          >
            <Plus size={14} />
            {linkMutation.isPending ? "Linking..." : "Create Link"}
          </button>
        </div>

        {serviceProviders.length === 0 && (
          <p style={{ color: "var(--gm-muted)", fontSize: 12, marginTop: 12 }}>
            No service providers found. Create an organization with type "Service Provider" first.
          </p>
        )}
      </div>

      {/* Existing links */}
      {isLoading ? (
        <div style={{ color: "var(--gm-muted)", fontSize: 13, textAlign: "center", padding: 40 }}>Loading links...</div>
      ) : Object.keys(bySP).length === 0 ? (
        <div className="gm-card" style={{ padding: 40, textAlign: "center" }}>
          <Building2 size={36} style={{ color: "var(--gm-dim)", margin: "0 auto 12px" }} />
          <div style={{ color: "var(--gm-muted)", fontSize: 13 }}>No SP-association links yet</div>
          <div style={{ color: "var(--gm-dim)", fontSize: 12, marginTop: 4 }}>Create a link above to connect a service provider to their client associations</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(bySP).map(([spId, { sp_name, associations: spAssocs }]) => (
            <div key={spId} className="gm-card" style={{ padding: 0, overflow: "hidden" }}>
              {/* SP header */}
              <div style={{
                padding: "14px 20px",
                background: "var(--gm-surface2)",
                borderBottom: "1px solid var(--gm-border)",
                display: "flex", alignItems: "center", gap: 10
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "var(--gm-purple-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Building2 size={15} style={{ color: "var(--gm-purple)" }} />
                </div>
                <div>
                  <div style={{ color: "var(--gm-text)", fontSize: 14, fontWeight: 600 }}>{sp_name}</div>
                  <div style={{ color: "var(--gm-muted)", fontSize: 11 }}>{spAssocs.length} client association{spAssocs.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              {/* Association list */}
              {spAssocs.map(link => (
                <div key={link.id} style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--gm-border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gm-green)", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: "var(--gm-text)", fontSize: 13, fontWeight: 500 }}>{link.assoc_name}</div>
                      <div style={{ color: "var(--gm-dim)", fontSize: 11 }}>
                        Linked {new Date(link.linked_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Remove link between ${sp_name} and ${link.assoc_name}? The association will revert to in-house evaluation.`)) {
                        unlinkMutation.mutate({ id: link.id, assoc_id: link.assoc_id });
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                      background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)",
                      borderRadius: 6, color: "var(--gm-red)", fontSize: 12, cursor: "pointer"
                    }}
                  >
                    <Trash2 size={12} /> Unlink
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
