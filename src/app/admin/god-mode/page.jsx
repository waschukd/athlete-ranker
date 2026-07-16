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
import { useTheme } from "@/lib/useTheme";
import ThemeToggle from "@/components/ThemeToggle";

const queryClient = new QueryClient();

export default function GodModeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [theme, toggleTheme] = useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <div data-theme={theme} className="gm-root min-h-screen">
        <style dangerouslySetInnerHTML={{__html: `
          /* Dark/gold is the default here — God Mode matches the premium skin the
             rest of the app wears. Values mirror globals.css --p-* so there is one
             gold in the codebase, not two. Hanken Grotesk + JetBrains Mono are
             already loaded globally; no extra font import. */
          .gm-root {
            --gm-bg: #0d0d0d;
            --gm-surface: #1a1a1a;
            --gm-surface2: #1f1f1f;
            --gm-surface3: #252525;
            --gm-border: #2c2c2c;
            --gm-border-active: rgba(212,175,55,0.40);
            --gm-text: #f4f1ea;
            --gm-muted: #c2bdb2;
            --gm-dim: #a8a39a;
            --gm-accent: #d4af37;
            --gm-accent-hi: #e6c14a;
            --gm-accent-soft: rgba(212,175,55,0.10);
            --gm-accent-bd: rgba(212,175,55,0.32);
            --gm-on-accent: #251a00;
            /* Chart history step. Dark mode is picked, not flipped: validated at
               3.3:1 vs the card and CVD ΔE 21.8 against the accent. */
            --gm-spark: #8a6d1c;
            --gm-green: #74c25f;
            --gm-green-soft: rgba(116,194,95,0.12);
            --gm-amber: #e0a93f;
            --gm-amber-soft: rgba(224,169,63,0.12);
            --gm-red: #d4685f;
            --gm-red-soft: rgba(212,104,95,0.12);
            --gm-blue: #b9a7f5;
            --gm-purple: #b9a7f5;
            --gm-glass: linear-gradient(135deg, #1d1d1d 0%, #131313 100%);

            background: radial-gradient(circle at 50% 0%, #1c1a15 0%, var(--gm-bg) 60%);
            background-attachment: fixed;
            color: var(--gm-text);
            font-family: 'Hanken Grotesk', system-ui, sans-serif;
          }

          /* Light variant — the toggle now actually drives these (it used to be
             inert here). Gold goes to the readable-on-white step; the chart's
             history bars go warm-neutral because no lighter gold clears 3:1. */
          .gm-root[data-theme="premium-light"] {
            --gm-bg: #faf8f3;
            --gm-surface: #ffffff;
            --gm-surface2: #f6f4ee;
            --gm-surface3: #efece3;
            --gm-border: #e6e2d8;
            --gm-border-active: rgba(168,127,28,0.45);
            --gm-text: #17140d;
            --gm-muted: #5f5949;
            --gm-dim: #8d8778;
            --gm-accent: #a87f1c;
            --gm-accent-hi: #c19a2c;
            --gm-accent-soft: #f6edd2;
            --gm-accent-bd: rgba(168,127,28,0.38);
            --gm-on-accent: #ffffff;
            --gm-spark: #5c5850;
            --gm-green: #2f7d32;
            --gm-green-soft: rgba(47,125,50,0.10);
            --gm-amber: #8a5a00;
            --gm-amber-soft: rgba(138,90,0,0.10);
            --gm-red: #a3271f;
            --gm-red-soft: rgba(163,39,31,0.10);
            --gm-glass: linear-gradient(135deg, #ffffff 0%, #fbf9f4 100%);
            background: radial-gradient(circle at 50% 0%, #fffdf7 0%, var(--gm-bg) 60%);
          }

          .gm-root *, .gm-root *::before, .gm-root *::after { box-sizing: border-box; }

          /* The glass treatment carries the look: a gradient surface, a hairline
             gold edge that warms on hover, and a small lift. */
          .gm-card {
            background: var(--gm-glass);
            border: 1px solid var(--gm-border);
            border-radius: 14px;
            transition: border-color .25s, transform .25s cubic-bezier(.175,.885,.32,1.275), box-shadow .25s;
          }
          .gm-card:hover {
            border-color: var(--gm-border-active);
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0,0,0,.28);
          }
          .gm-root[data-theme="premium-light"] .gm-card:hover { box-shadow: 0 10px 26px rgba(90,70,20,.10); }

          /* Mono micro-label — the JetBrains Mono kicker used across the page. */
          .gm-mono {
            font-family: 'JetBrains Mono', monospace;
            text-transform: uppercase;
            letter-spacing: .18em;
            font-weight: 600;
          }
          /* Big numerals: proportional figures on purpose — tabular-nums is for
             columns, and makes a display number look loose. */
          .gm-stat-value { font-size: 34px; font-weight: 800; letter-spacing: -.03em; line-height: 1.05; }
          .gm-section-title { color: var(--gm-text); font-size: 15px; font-weight: 700; letter-spacing: -.01em; margin-bottom: 14px; }

          .gm-btn-primary { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 9px; border: none; cursor: pointer; background: linear-gradient(135deg, var(--gm-accent-hi), var(--gm-accent)); color: var(--gm-on-accent); font-size: 13px; font-weight: 700; transition: filter .15s, transform .15s; }
          .gm-btn-primary:hover { filter: brightness(1.08); }
          .gm-btn-primary:active { transform: scale(.97); }
          .gm-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
          .gm-btn-ghost { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 9px; cursor: pointer; background: transparent; color: var(--gm-muted); border: 1px solid var(--gm-border); font-size: 13px; font-weight: 500; transition: all .15s; }
          .gm-btn-ghost:hover { background: var(--gm-surface2); color: var(--gm-text); border-color: var(--gm-border-active); }
          .gm-input { width: 100%; padding: 9px 12px; background: var(--gm-surface2); border: 1px solid var(--gm-border); border-radius: 9px; color: var(--gm-text); font-size: 13px; outline: none; transition: border-color .15s; }
          .gm-input:focus { border-color: var(--gm-accent); }
          .gm-input::placeholder { color: var(--gm-dim); }
          .gm-label { display: block; color: var(--gm-muted); font-size: 12px; font-weight: 500; margin-bottom: 6px; letter-spacing: .3px; }
          .gm-badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; }
          .gm-table { width: 100%; border-collapse: collapse; }
          .gm-table th { padding: 10px 16px; text-align: left; color: var(--gm-dim); font-size: 11px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; border-bottom: 1px solid var(--gm-border); font-family: 'JetBrains Mono', monospace; }
          .gm-table td { padding: 13px 16px; color: var(--gm-text); font-size: 13px; border-bottom: 1px solid var(--gm-border); }
          .gm-table tr:last-child td { border-bottom: none; }
          .gm-table tbody tr { transition: background .1s; }
          .gm-table tbody tr:hover { background: var(--gm-surface2); }
          .gm-modal-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
          .gm-modal { background: var(--gm-surface); border: 1px solid var(--gm-border); border-radius: 16px; width: 100%; max-width: 440px; padding: 24px; box-shadow: 0 18px 50px rgba(0,0,0,.45); }
          .gm-modal-title { color: var(--gm-text); font-size: 16px; font-weight: 700; margin-bottom: 20px; }
          .gm-form-group { margin-bottom: 14px; }

          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes gm-pulse { 0%,100% { opacity: .45; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.15); } }
          .gm-live-dot { animation: gm-pulse 2.4s cubic-bezier(.4,0,.6,1) infinite; }
          @media (prefers-reduced-motion: reduce) {
            .gm-card, .gm-card:hover { transition: none; transform: none; }
            .gm-live-dot { animation: none; }
          }
        `}} />

        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "color-mix(in srgb, var(--gm-bg) 82%, transparent)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid var(--gm-border)",
        }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "18px 24px 0 24px" }}>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="gm-mono mb-2" style={{ fontSize: 10, color: "var(--gm-accent)" }}>
                  Command Center
                </div>
                <div className="flex items-end gap-4 flex-wrap">
                  <h1
                    className="font-black tracking-tight text-4xl sm:text-5xl leading-none"
                    style={{
                      background: "linear-gradient(100deg, var(--gm-accent-hi), var(--gm-accent))",
                      WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                    }}
                  >
                    Platform Admin
                  </h1>
                  <img src="/mark-gold.svg" style={{ width: 46, height: 42, objectFit: "contain" }} alt="Sideline Star" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                     style={{ background: "var(--gm-accent-soft)", border: "1px solid var(--gm-accent-bd)" }}>
                  <div className="w-1.5 h-1.5 rounded-full gm-live-dot" style={{ background: "var(--gm-accent)" }} />
                  <span className="gm-mono" style={{ color: "var(--gm-accent)", fontSize: 10 }}>Super Admin</span>
                </div>
              </div>
            </div>
            <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px 64px" }}>
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
