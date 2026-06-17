"use client";

import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";

// Friendly role labels — what the user sees ("am I in as God Mode, SP, etc.?").
const ROLE_LABEL = {
  super_admin: "God Mode",
  service_provider_admin: "Service Provider",
  goalie_service_provider_admin: "Goalie Service Provider",
  association_admin: "Association",
  director: "Director",
  association_evaluator: "Evaluator",
  service_provider_evaluator: "Evaluator",
  volunteer: "Volunteer",
};

// Global "who's logged in + log out" bar, rendered once in the root layout so it
// appears at the top of every page. Renders nothing when logged out, and is
// hidden in print. Self-styled (dark) so it's consistent regardless of page theme.
export default function SessionBar() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (alive) setUser(d.user || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!user) return null;

  const label = ROLE_LABEL[user.role] || user.role || "Signed in";
  const who = user.name || user.email || "Account";

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/account/signin";
  };

  return (
    <div
      className="print:hidden sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-1.5 text-[13px]"
      style={{ background: "#111114", borderBottom: "1px solid #2a2a30", color: "#e5e5e7" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[#9aa0aa] hidden sm:inline">Signed in as</span>
        <span className="font-semibold truncate" style={{ color: "#f4f4f5" }}>{who}</span>
        <span
          className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: "rgba(205,164,52,0.16)", color: "#cda434" }}
        >
          {label}
        </span>
      </div>
      <button
        onClick={logout}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium flex-shrink-0 hover:opacity-80 transition-opacity"
        style={{ background: "rgba(255,255,255,0.06)", color: "#e5e5e7" }}
      >
        <LogOut size={13} /> Log out
      </button>
    </div>
  );
}
