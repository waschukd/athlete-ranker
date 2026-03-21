import { BarChart3, Building2, Users, Shield, Calendar, Wrench , Link2} from "lucide-react";

export function TabNavigation({ activeTab, onTabChange }) {
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "organizations", label: "Organizations", icon: Building2 },
    { id: "users", label: "Users", icon: Users },
    { id: "evaluators", label: "Evaluators", icon: Shield },
    { id: "sessions", label: "Sessions", icon: Calendar },
    { id: "sp-links", label: "SP Links", icon: Link2 },
    { id: "tools", label: "Tools", icon: Wrench },
  ];

  return (
    <div style={{ overflowX: "auto", marginBottom: "-1px" }}>
      <div style={{ display: "flex", gap: 2, minWidth: "max-content" }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 16px",
                background: "none", border: "none",
                borderBottom: isActive ? "2px solid var(--gm-accent)" : "2px solid transparent",
                color: isActive ? "var(--gm-accent)" : "var(--gm-muted)",
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "var(--gm-text)"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "var(--gm-muted)"; }}
            >
              <Icon size={14} />
              <span className="gm-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
