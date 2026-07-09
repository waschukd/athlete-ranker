"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Shield, Building2, Star, ClipboardList } from "lucide-react";

// God-only launcher. A super_admin already has access to every dashboard
// (middleware admits super_admin everywhere; the pages honor ?org= for
// super_admin), so this is purely convenience links — no role switch, no
// impersonation, no privilege the account doesn't already hold. Rendered ONLY
// when the active role is super_admin, so no other user ever sees it.
export default function GodJump({ activeRole }) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState(null);

  useEffect(() => {
    if (activeRole !== "super_admin" || orgs !== null) return;
    let alive = true;
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((d) => { if (alive) setOrgs(d.organizations || []); })
      .catch(() => { if (alive) setOrgs([]); });
    return () => { alive = false; };
  }, [activeRole, orgs]);

  if (activeRole !== "super_admin") return null;

  const go = (href) => { window.location.href = href; };
  const sps = (orgs || []).filter((o) => o.type === "service_provider" || o.type === "goalie_service_provider");
  const assocs = (orgs || []).filter((o) => o.type === "association");

  const Item = ({ icon: Icon, label, sub, onClick }) => (
    <button onClick={onClick} className="w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2 hover:bg-white/5" style={{ color: "#e5e5e7" }}>
      {Icon && <Icon size={13} className="flex-shrink-0" style={{ color: "#9aa0aa" }} />}
      <span className="truncate">{label}</span>
      {sub && <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: "#71717a" }}>{sub}</span>}
    </button>
  );
  const Section = (label) => (
    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide" style={{ color: "#71717a" }}>{label}</div>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full hover:opacity-80"
        style={{ background: "rgba(255,255,255,0.06)", color: "#e5e5e7" }}
        title="Jump to any dashboard"
      >
        Jump to <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1.5 min-w-[260px] max-h-[70vh] overflow-y-auto rounded-lg py-1 shadow-xl z-50" style={{ background: "#1b1b1f", border: "1px solid #2a2a30" }}>
            <Item icon={Shield} label="God Mode" onClick={() => go("/admin/god-mode")} />
            <Item icon={ClipboardList} label="My evaluator view" onClick={() => go("/evaluator/dashboard")} />
            {sps.length > 0 && Section("Service Providers")}
            {sps.map((o) => (
              <Item key={o.id} icon={o.type === "goalie_service_provider" ? Star : Building2} label={o.name} sub={o.type === "goalie_service_provider" ? "goalie" : null} onClick={() => go(`/service-provider/dashboard?org=${o.id}`)} />
            ))}
            {assocs.length > 0 && Section("Associations")}
            {assocs.map((o) => (
              <Item key={o.id} icon={Building2} label={o.name} onClick={() => go(`/association/dashboard?org=${o.id}`)} />
            ))}
            {orgs === null && <div className="px-3 py-2 text-[12px]" style={{ color: "#71717a" }}>Loading…</div>}
          </div>
        </>
      )}
    </div>
  );
}
