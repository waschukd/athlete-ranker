"use client";

import { useState, useEffect } from "react";
import { LogOut, ChevronDown, Check } from "lucide-react";
import GodJump from "@/components/GodJump";

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
const labelFor = (r) => ROLE_LABEL[r] || r || "Signed in";

// Global "who's logged in + switch role + log out" bar, rendered once in the
// root layout so it's on every page. Renders nothing when logged out; hidden in
// print. Self-styled (dark) so it's consistent regardless of page theme.
export default function SessionBar() {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (alive) setUser(d.user || null); }).catch(() => {});
    fetch("/api/auth/roles").then(r => r.json()).then(d => { if (alive) { setRoles(d.roles || []); setActive(d.active || null); } }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!user) return null;

  const who = user.name || user.email || "Account";
  const activeRole = active || user.role;
  const multi = roles.length > 1;

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/account/signin";
  };

  const switchTo = async (role) => {
    if (role === activeRole || switching) { setOpen(false); return; }
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const d = await res.json();
      if (res.ok && d.redirectTo) { window.location.href = d.redirectTo; return; }
    } catch {}
    setSwitching(false);
    setOpen(false);
  };

  const chip = (
    <span
      className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1"
      style={{ background: "rgba(205,164,52,0.16)", color: "#cda434" }}
    >
      {labelFor(activeRole)}{multi && <ChevronDown size={12} />}
    </span>
  );

  return (
    <div
      className="print:hidden sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-1.5 text-[13px]"
      style={{ background: "#111114", borderBottom: "1px solid #2a2a30", color: "#e5e5e7" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[#9aa0aa] hidden sm:inline">Signed in as</span>
        <span className="font-semibold truncate" style={{ color: "#f4f4f5" }}>{who}</span>
        {multi ? (
          <div className="relative">
            <button onClick={() => setOpen(o => !o)} disabled={switching} title="Switch role" className="hover:opacity-80">
              {chip}
            </button>
            {open && (
              <div className="absolute left-0 mt-1.5 min-w-[200px] rounded-lg py-1 shadow-xl z-50" style={{ background: "#1b1b1f", border: "1px solid #2a2a30" }}>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide" style={{ color: "#71717a" }}>Switch role</div>
                {roles.map(r => (
                  <button key={r} onClick={() => switchTo(r)} className="w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between gap-2 hover:bg-white/5" style={{ color: r === activeRole ? "#cda434" : "#e5e5e7" }}>
                    {labelFor(r)}{r === activeRole && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : chip}
        <GodJump activeRole={activeRole} />
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
