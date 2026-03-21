import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Shield, Database, Clock, CheckCircle, AlertCircle, X } from "lucide-react";

function ToolModal({ tool, onClose, onSubmit, isPending }) {
  const [fields, setFields] = useState({});

  return (
    <div className="gm-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gm-modal">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="gm-modal-title" style={{ margin: 0 }}>{tool.title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--gm-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <p style={{ color: "var(--gm-muted)", fontSize: 13, marginBottom: 20 }}>{tool.description}</p>

        {tool.fields?.map(f => (
          <div key={f.key} className="gm-form-group">
            <label className="gm-label">{f.label}{f.required && <span style={{ color: "var(--gm-accent)" }}> *</span>}</label>
            <input
              type={f.type || "text"}
              value={fields[f.key] || ""}
              onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="gm-input"
              placeholder={f.placeholder || ""}
              required={f.required}
            />
          </div>
        ))}

        {tool.confirm && (
          <div style={{ padding: "12px 14px", background: "var(--gm-amber-soft)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: 16 }}>
            <p style={{ color: "var(--gm-amber)", fontSize: 12 }}>⚠ {tool.confirm}</p>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} className="gm-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
          <button
            onClick={() => {
              const missing = tool.fields?.filter(f => f.required && !fields[f.key]);
              if (missing?.length) return;
              onSubmit(fields);
            }}
            className="gm-btn-primary"
            disabled={isPending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {isPending ? "Running..." : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SystemToolsTab() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState(null);
  const [activeTool, setActiveTool] = useState(null);

  const toolMutation = useMutation({
    mutationFn: async ({ action, data }) => {
      const res = await fetch("/api/admin/god-mode/system-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ success: true, message: data.message || "Operation completed successfully." });
      setActiveTool(null);
      queryClient.invalidateQueries();
    },
    onError: (error) => {
      setResult({ success: false, message: error.message });
      setActiveTool(null);
    },
  });

  const tools = [
    {
      id: "test_admin",
      title: "Create Test Admin",
      description: "Create a test association admin account with email/password credentials.",
      icon: UserPlus,
      color: "var(--gm-blue)",
      colorSoft: "var(--gm-blue-soft)",
      fields: [
        { key: "name", label: "Full Name", required: true, placeholder: "Test Admin" },
        { key: "email", label: "Email Address", type: "email", required: true, placeholder: "admin@test.com" },
        { key: "password", label: "Password", type: "password", required: true, placeholder: "••••••••" },
      ],
      action: "create_test_admin",
    },
    {
      id: "test_evaluator",
      title: "Create Test Evaluator",
      description: "Create a test evaluator account with email/password credentials.",
      icon: Shield,
      color: "var(--gm-purple)",
      colorSoft: "var(--gm-purple-soft)",
      fields: [
        { key: "name", label: "Full Name", required: true, placeholder: "Test Evaluator" },
        { key: "email", label: "Email Address", type: "email", required: true, placeholder: "eval@test.com" },
        { key: "password", label: "Password", type: "password", required: true, placeholder: "••••••••" },
      ],
      action: "create_test_evaluator",
    },
    {
      id: "seed_demo",
      title: "Seed Demo Data",
      description: "Create a demo organization (Demo Hockey Association) with 12 sample athletes and one age category.",
      icon: Database,
      color: "var(--gm-green)",
      colorSoft: "var(--gm-green-soft)",
      confirm: "This will create a new organization and sample data in the database.",
      action: "seed_demo_data",
    },
    {
      id: "clear_expired",
      title: "Clear Expired Invites",
      description: "Mark all past-due pending invitations as expired and clean up the invitations table.",
      icon: Clock,
      color: "var(--gm-amber)",
      colorSoft: "var(--gm-amber-soft)",
      confirm: "This will update all expired pending invitations. This action cannot be undone.",
      action: "clear_expired_invites",
    },
  ];

  const currentTool = tools.find(t => t.id === activeTool);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {result && (
        <div style={{
          padding: "14px 16px", borderRadius: 10, display: "flex", alignItems: "center", gap: 10,
          background: result.success ? "var(--gm-green-soft)" : "var(--gm-red-soft)",
          border: `1px solid ${result.success ? "rgba(34,211,160,0.2)" : "rgba(248,113,113,0.2)"}`,
        }}>
          {result.success
            ? <CheckCircle size={16} style={{ color: "var(--gm-green)", flexShrink: 0 }} />
            : <AlertCircle size={16} style={{ color: "var(--gm-red)", flexShrink: 0 }} />}
          <span style={{ fontSize: 13, color: result.success ? "var(--gm-green)" : "var(--gm-red)", fontWeight: 500 }}>{result.message}</span>
          <button onClick={() => setResult(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6 }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              disabled={toolMutation.isPending}
              className="gm-card"
              style={{
                padding: "20px", cursor: "pointer", textAlign: "left",
                border: "1px solid var(--gm-border)", borderRadius: 12,
                background: "var(--gm-surface)", transition: "all 0.15s",
                opacity: toolMutation.isPending ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = tool.color;
                e.currentTarget.style.background = tool.colorSoft;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--gm-border)";
                e.currentTarget.style.background = "var(--gm-surface)";
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: tool.colorSoft, display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon size={17} style={{ color: tool.color }} />
                </div>
                <div>
                  <div style={{ color: "var(--gm-text)", fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{tool.title}</div>
                  <div style={{ color: "var(--gm-muted)", fontSize: 12, lineHeight: 1.5 }}>{tool.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {currentTool && (
        <ToolModal
          tool={currentTool}
          onClose={() => setActiveTool(null)}
          isPending={toolMutation.isPending}
          onSubmit={(data) => toolMutation.mutate({ action: currentTool.action, data })}
        />
      )}
    </div>
  );
}
