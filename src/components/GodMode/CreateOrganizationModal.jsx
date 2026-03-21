import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

export function CreateOrganizationModal({ onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    type: "association",
    contact_email: "",
    contact_name: "",
    contact_phone: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || "Failed to create organization");
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["organizations"]);
      onClose();
    },
  });

  const field = (label, key, type = "text", required = false) => (
    <div className="gm-form-group">
      <label className="gm-label">{label}{required && <span style={{ color: "var(--gm-accent)" }}> *</span>}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="gm-input"
        required={required}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  return (
    <div className="gm-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gm-modal">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="gm-modal-title" style={{ margin: 0 }}>Create Organization</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gm-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
          {field("Organization Name", "name", "text", true)}
          <div className="gm-form-group">
            <label className="gm-label">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="gm-input">
              <option value="association">Association</option>
              <option value="service_provider">Service Provider</option>
            </select>
          </div>
          {field("Contact Email", "contact_email", "email", true)}
          {field("Contact Name", "contact_name")}

          {createMutation.isError && (
            <div style={{ padding: "10px 14px", background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, marginBottom: 14 }}>
              <p style={{ color: "var(--gm-red)", fontSize: 12 }}>{createMutation.error.message}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} className="gm-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
            <button type="submit" className="gm-btn-primary" disabled={createMutation.isPending} style={{ flex: 1, justifyContent: "center" }}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
