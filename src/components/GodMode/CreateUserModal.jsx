import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "service_provider_admin", label: "Service Provider Admin" },
  { value: "service_provider_evaluator", label: "Service Provider Evaluator" },
  { value: "association_admin", label: "Association Admin" },
  { value: "age_director", label: "Age Director" },
  { value: "association_evaluator", label: "Association Evaluator" },
  { value: "volunteer", label: "Volunteer" },
];

export function CreateUserModal({ onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "association_evaluator" });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/admin/god-mode/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["god-mode-users"]);
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
          <h2 className="gm-modal-title" style={{ margin: 0 }}>Create User</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gm-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
          {field("Full Name", "name", "text", true)}
          {field("Email Address", "email", "email", true)}
          {field("Phone Number", "phone", "tel")}
          <div className="gm-form-group">
            <label className="gm-label">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="gm-input">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {createMutation.isError && (
            <div style={{ padding: "10px 14px", background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, marginBottom: 14 }}>
              <p style={{ color: "var(--gm-red)", fontSize: 12 }}>{createMutation.error.message}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} className="gm-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
            <button type="submit" className="gm-btn-primary" disabled={createMutation.isPending} style={{ flex: 1, justifyContent: "center" }}>
              {createMutation.isPending ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
