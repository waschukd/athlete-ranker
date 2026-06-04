"use client";

import { useState } from "react";
import { TabNavigation } from "@/components/GodMode/TabNavigation";
import { OverviewTab } from "@/components/GodMode/OverviewTab";
import { OrganizationsTab } from "@/components/GodMode/OrganizationsTab";
import { UsersTab } from "@/components/GodMode/UsersTab";
import { EvaluatorsTab } from "@/components/GodMode/EvaluatorsTab";
import { SignupRequestsTab } from "@/components/GodMode/SignupRequestsTab";
import { SessionsTab } from "@/components/GodMode/SessionsTab";
import { SystemToolsTab } from "@/components/GodMode/SystemToolsTab";
import { SPLinksTab } from "@/components/GodMode/SPLinksTab";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function GodModeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="gm-root min-h-screen">
        <style dangerouslySetInnerHTML={{__html: `
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
          .gm-root {
            background: #fbfbf9;
            --gm-surface: #ffffff;
            --gm-surface2: #f7f7f5;
            --gm-surface3: #f0f0ee;
            --gm-border: #ededeb;
            --gm-border-active: #0b5cd6;
            --gm-text: #101113;
            --gm-muted: #5b606b;
            --gm-dim: #9aa0aa;
            --gm-accent: #0b5cd6;
            --gm-accent-soft: #eaf1fe;
            --gm-green: #15803d;
            --gm-green-soft: #dcfce7;
            --gm-blue: #0b5cd6;
            --gm-blue-soft: #eaf1fe;
            --gm-purple: #7c3aed;
            --gm-purple-soft: #ede9fe;
            --gm-amber: #b45309;
            --gm-amber-soft: #fef3c7;
            --gm-red: #dc2626;
            --gm-red-soft: #fee2e2;
          }
          .gm-root *, .gm-root *::before, .gm-root *::after { box-sizing: border-box; }
          .gm-card { background: var(--gm-surface); border: 1px solid var(--gm-border); border-radius: 12px; transition: border-color 0.15s; }
          .gm-card:hover { border-color: var(--gm-border-active); }
          .gm-btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; background: var(--gm-accent); color: white; font-size: 13px; font-weight: 500; transition: opacity 0.15s; }
          .gm-btn-primary:hover { opacity: 0.9; }
          .gm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
          .gm-btn-ghost { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 8px; cursor: pointer; background: transparent; color: var(--gm-muted); border: 1px solid var(--gm-border); font-size: 13px; font-weight: 500; transition: all 0.15s; }
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
          .gm-table tbody tr:hover { background: #f7f7f5; }
          .gm-stat-value { font-size: 26px; font-weight: 700; letter-spacing: -1px; }
          .gm-section-title { color: var(--gm-text); font-size: 14px; font-weight: 600; margin-bottom: 14px; }
          .gm-modal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
          .gm-modal { background: var(--gm-surface); border: 1px solid var(--gm-border); border-radius: 14px; width: 100%; max-width: 440px; padding: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.10); }
          .gm-modal-title { color: var(--gm-text); font-size: 16px; font-weight: 600; margin-bottom: 20px; }
          .gm-form-group { margin-bottom: 14px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />

        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px 0 24px" }}>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-accent mb-2">God Mode</div>
                <div className="flex items-end gap-4 flex-wrap">
                  <h1 className="font-display font-black tracking-tight text-ink text-4xl sm:text-5xl leading-none">Platform Admin</h1>
                  <img src="/s-mark-dark.svg" style={{ width: 44, height: 44, objectFit: "contain" }} alt="Sideline Star" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-soft border border-accent/20">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-accent text-[10px] font-bold tracking-[0.8px]">SUPER ADMIN</span>
              </div>
            </div>
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>
          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "organizations" && <OrganizationsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "evaluators" && <EvaluatorsTab />}
          {activeTab === "signups" && <SignupRequestsTab />}
          {activeTab === "sessions" && <SessionsTab />}
          {activeTab === "sp-links" && <SPLinksTab />}
          {activeTab === "tools" && <SystemToolsTab />}
        </div>
      </div>
    </QueryClientProvider>
  );
}
