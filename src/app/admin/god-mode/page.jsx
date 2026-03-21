"use client";

import { useState } from "react";
import { TabNavigation } from "@/components/GodMode/TabNavigation";
import { OverviewTab } from "@/components/GodMode/OverviewTab";
import { OrganizationsTab } from "@/components/GodMode/OrganizationsTab";
import { UsersTab } from "@/components/GodMode/UsersTab";
import { EvaluatorsTab } from "@/components/GodMode/EvaluatorsTab";
import { SessionsTab } from "@/components/GodMode/SessionsTab";
import { SystemToolsTab } from "@/components/GodMode/SystemToolsTab";
import { SPLinksTab } from "@/components/GodMode/SPLinksTab";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shield } from "lucide-react";

const queryClient = new QueryClient();

export default function GodModeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="gm-root min-h-screen">
        <style dangerouslySetInnerHTML={{__html: `
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Mono:wght@400;500&display=swap');
          .gm-root {
            font-family: 'DM Sans', sans-serif;
            background: #0a0a0f;
            --gm-surface: #13131a;
            --gm-surface2: #1c1c28;
            --gm-surface3: #252535;
            --gm-border: rgba(255,255,255,0.07);
            --gm-border-active: rgba(255,255,255,0.14);
            --gm-text: #f0f0f8;
            --gm-muted: #7878a0;
            --gm-dim: #4a4a6a;
            --gm-accent: #FF6B35;
            --gm-accent-soft: rgba(255,107,53,0.12);
            --gm-green: #22d3a0;
            --gm-green-soft: rgba(34,211,160,0.12);
            --gm-blue: #6c9dff;
            --gm-blue-soft: rgba(108,157,255,0.12);
            --gm-purple: #a78bfa;
            --gm-purple-soft: rgba(167,139,250,0.12);
            --gm-amber: #fbbf24;
            --gm-amber-soft: rgba(251,191,36,0.12);
            --gm-red: #f87171;
            --gm-red-soft: rgba(248,113,113,0.12);
          }
          .gm-root *, .gm-root *::before, .gm-root *::after { box-sizing: border-box; }
          .gm-root input, .gm-root select, .gm-root textarea { font-family: 'DM Sans', sans-serif; }
          .gm-card { background: var(--gm-surface); border: 1px solid var(--gm-border); border-radius: 12px; transition: border-color 0.15s; }
          .gm-card:hover { border-color: var(--gm-border-active); }
          .gm-btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; background: var(--gm-accent); color: white; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; transition: opacity 0.15s; }
          .gm-btn-primary:hover { opacity: 0.9; }
          .gm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
          .gm-btn-ghost { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 8px; cursor: pointer; background: transparent; color: var(--gm-muted); border: 1px solid var(--gm-border); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; transition: all 0.15s; }
          .gm-btn-ghost:hover { background: var(--gm-surface2); color: var(--gm-text); border-color: var(--gm-border-active); }
          .gm-input { width: 100%; padding: 9px 12px; background: var(--gm-surface2); border: 1px solid var(--gm-border); border-radius: 8px; color: var(--gm-text); font-size: 13px; outline: none; transition: border-color 0.15s; }
          .gm-input:focus { border-color: var(--gm-accent); }
          .gm-input::placeholder { color: var(--gm-dim); }
          .gm-label { display: block; color: var(--gm-muted); font-size: 12px; font-weight: 500; margin-bottom: 6px; letter-spacing: 0.3px; }
          .gm-badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; }
          .gm-table { width: 100%; border-collapse: collapse; }
          .gm-table th { padding: 10px 16px; text-align: left; color: var(--gm-dim); font-size: 11px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; border-bottom: 1px solid var(--gm-border); }
          .gm-table td { padding: 13px 16px; color: var(--gm-text); font-size: 13px; border-bottom: 1px solid var(--gm-border); }
          .gm-table tr:last-child td { border-bottom: none; }
          .gm-table tbody tr { transition: background 0.1s; }
          .gm-table tbody tr:hover { background: rgba(255,255,255,0.02); }
          .gm-stat-value { font-size: 26px; font-weight: 700; font-family: 'DM Mono', monospace; letter-spacing: -1px; }
          .gm-section-title { color: var(--gm-text); font-size: 14px; font-weight: 600; margin-bottom: 14px; }
          .gm-modal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
          .gm-modal { background: var(--gm-surface); border: 1px solid var(--gm-border-active); border-radius: 14px; width: 100%; max-width: 440px; padding: 24px; }
          .gm-modal-title { color: var(--gm-text); font-size: 16px; font-weight: 600; margin-bottom: 20px; }
          .gm-form-group { margin-bottom: 14px; }
        `}} />

        <div style={{ borderBottom: "1px solid var(--gm-border)", background: "var(--gm-surface)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: "linear-gradient(135deg, #FF6B35, #d44a1a)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 18px rgba(255,107,53,0.4)" }}>
                <Shield size={18} color="white" />
              </div>
              <div>
                <div style={{ color: "var(--gm-text)", fontSize: 15, fontWeight: 600 }}>God Mode</div>
                <div style={{ color: "var(--gm-muted)", fontSize: 11 }}>System Administration</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 20, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#FF6B35" }} />
              <span style={{ color: "#FF6B35", fontSize: 10, fontWeight: 600, letterSpacing: "0.8px" }}>SUPER ADMIN</span>
            </div>
          </div>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px" }}>
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "organizations" && <OrganizationsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "evaluators" && <EvaluatorsTab />}
          {activeTab === "sessions" && <SessionsTab />}
          {activeTab === "sp-links" && <SPLinksTab />}
          {activeTab === "tools" && <SystemToolsTab />}
        </div>
      </div>
    </QueryClientProvider>
  );
}
