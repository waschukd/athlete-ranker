import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";
import { normalizeSchedule } from "@/lib/scheduleNormalize";
import { parseCsv, detectMapping, buildAthletes } from "@/lib/rosterImport";
import { canonicalDivision } from "@/lib/divisionKey";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// Deterministic schedule parse — used when the file has a clean "Division" column
// (our bulk template). No AI, no cost, no failure modes. Returns rows in the same
// shape the AI normalizer produces, or null if there's no Division column.
function scheduleFromColumns(grid) {
  let hi = -1, H = [];
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const low = (grid[i] || []).map(c => String(c).toLowerCase().trim());
    if (low.some(c => c === "division" || c.includes("division")) && low.some(c => c.includes("date"))) { hi = i; H = low; break; }
  }
  if (hi < 0) return null;
  const col = (names) => H.findIndex(h => names.some(n => h.includes(n)));
  const ci = { div: col(["division"]), type: col(["session type", "type"]), date: col(["date"]), start: col(["start"]), end: col(["end"]), loc: col(["location", "rink"]), pe: col(["player eval"]), ge: col(["goalie eval"]) };
  const to24 = (t) => { const s = String(t || "").trim(); if (!s) return null; const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i); if (!m) { const m2 = s.match(/^(\d{1,2}):(\d{2})/); return m2 ? `${m2[1].padStart(2, "0")}:${m2[2]}` : null; } let h = parseInt(m[1]); const ap = m[3] ? m[3].toUpperCase() : null; if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0; return `${String(h).padStart(2, "0")}:${m[2]}`; };
  const toISO = (d) => { const s = String(d || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m) return `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return null; };
  const stype = (t) => { const s = String(t || "").toLowerCase(); if (s.includes("test") || s.includes("time trial")) return "testing"; if (s.includes("goalie")) return "goalie_skills"; if (s.includes("scrim") || s.includes("game")) return "scrimmage"; if (s.includes("skill") || s.includes("pre")) return "skills"; return "scrimmage"; };
  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const division = ci.div >= 0 ? String(r[ci.div] || "").trim() : "";
    const date = toISO(ci.date >= 0 ? r[ci.date] : "");
    if (!division && !date) continue;
    rows.push({
      raw_label: division, age_group: null, division, session_type: stype(ci.type >= 0 ? r[ci.type] : ""),
      date, start_time: to24(ci.start >= 0 ? r[ci.start] : ""), end_time: to24(ci.end >= 0 ? r[ci.end] : ""),
      location: ci.loc >= 0 ? String(r[ci.loc] || "").trim() || null : null,
      player_evaluators: ci.pe >= 0 ? r[ci.pe] : null, goalie_evaluators: ci.ge >= 0 ? r[ci.ge] : null,
    });
  }
  return rows;
}

// CSV/XLSX → plain string grid (CSV read raw so text dates aren't UTC-shifted).
function fileToGrid(buf, name) {
  const isCsv = /\.csv$/i.test(name || "");
  const wb = isCsv ? XLSX.read(buf, { type: "buffer", raw: true, cellDates: false })
                   : XLSX.read(buf, { type: "buffer", cellDates: true, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: isCsv, defval: "", blankrows: false })
    .map(row => (Array.isArray(row) ? row.map(c => (c == null ? "" : String(c))) : []));
}

export async function POST(request, { params }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!ADMIN_ROLES.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const auth = await authorizeOrgAccess(session, params.orgId);
    if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const form = await request.formData();
    const scheduleFile = form.get("schedule");
    const rosterFile = form.get("roster");
    if ((!scheduleFile || typeof scheduleFile === "string") && (!rosterFile || typeof rosterFile === "string")) {
      return NextResponse.json({ error: "Upload a schedule and/or a roster file." }, { status: 400 });
    }

    const divisions = new Map(); // key → { key, age, tier, scheduleCount, athleteCount, sources:Set }
    const bump = (key, age, tier, kind, source) => {
      if (!divisions.has(key)) divisions.set(key, { key, age, tier, scheduleCount: 0, athleteCount: 0, sources: new Set() });
      const d = divisions.get(key);
      d[kind]++; d.sources.add(source);
    };

    let scheduleRows = [], athletes = [], scheduleDebugRaw = "";
    const unmatched = { schedule: [], athletes: [] };

    // ── Schedule ──
    // Prefer the DETERMINISTIC column parse (our template with a Division column):
    // no AI, no cost, no failure modes. Only fall back to the AI for a messy file
    // that has no clean Division column.
    if (scheduleFile && typeof scheduleFile !== "string") {
      const buf = Buffer.from(await scheduleFile.arrayBuffer());
      if (buf.length > 4 * 1024 * 1024) return NextResponse.json({ error: "Schedule file too large (max 4 MB)." }, { status: 413 });
      let grid;
      try { grid = fileToGrid(buf, scheduleFile.name); } catch { return NextResponse.json({ error: "Couldn't read the schedule file." }, { status: 400 }); }

      let rows = scheduleFromColumns(grid); // template path
      if (!rows) {
        if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "That schedule has no Division column, and AI reading isn't configured. Use the bulk schedule template, or add a Division column.", fallback: true }, { status: 503 });
        const { allowed } = await checkAndRecord({ endpoint: "bulk_onboard", identifier: session.email || clientIp(request), max: 20, windowMins: 1440 });
        if (!allowed) return NextResponse.json({ error: "Daily import limit reached — try the template, or again tomorrow.", fallback: true }, { status: 429 });
        let norm;
        try { norm = await normalizeSchedule(grid, { apiKey: process.env.ANTHROPIC_API_KEY }); }
        catch (e) { console.error("Schedule normalize error:", e.message); return NextResponse.json({ error: "Couldn't read the schedule automatically. Try the bulk schedule template.", detail: String(e.message).slice(0, 400), fallback: true }, { status: 502 }); }
        scheduleDebugRaw = norm.raw || "";
        rows = norm.rows || [];
      }
      for (const r of rows) {
        const cd = canonicalDivision({ ageGroup: r.age_group, division: r.division, label: r.raw_label });
        const tagged = { ...r, divisionKey: cd?.key || null };
        scheduleRows.push(tagged);
        if (cd) bump(cd.key, cd.age, cd.tier, "scheduleCount", "schedule");
        else unmatched.schedule.push(tagged);
      }
    }

    // ── Roster (deterministic column parse) ──
    if (rosterFile && typeof rosterFile !== "string") {
      const buf = Buffer.from(await rosterFile.arrayBuffer());
      if (buf.length > 4 * 1024 * 1024) return NextResponse.json({ error: "Roster file too large (max 4 MB)." }, { status: 413 });
      const text = /\.csv$/i.test(rosterFile.name) ? buf.toString("utf8")
        : XLSX.utils.sheet_to_csv(XLSX.read(buf, { type: "buffer" }).Sheets[XLSX.read(buf, { type: "buffer" }).SheetNames[0]]);
      const { headers, rows } = parseCsv(text);
      if (headers.length) {
        const mapping = detectMapping(headers);
        const { athletes: built } = buildAthletes(rows, mapping, null);
        for (const a of built) {
          const cd = canonicalDivision({ division: a._division, label: a._division });
          const tagged = { ...a, divisionKey: cd?.key || null };
          athletes.push(tagged);
          if (cd) bump(cd.key, cd.age, cd.tier, "athleteCount", "roster");
          else unmatched.athletes.push(tagged);
        }
      }
    }

    // Existing categories so the UI can offer "route into existing" instead of duplicating.
    const existing = await sql`SELECT id, name FROM age_categories WHERE organization_id = ${params.orgId} ORDER BY name`;

    // When nothing was detected, include the raw AI text so we can see why.
    const debug = divisions.size === 0 ? { aiRaw: (scheduleDebugRaw || "").slice(0, 1200), scheduleRowCount: scheduleRows.length } : undefined;

    const divisionList = [...divisions.values()]
      .map(d => ({ key: d.key, age: d.age, tier: d.tier, scheduleCount: d.scheduleCount, athleteCount: d.athleteCount, sources: [...d.sources] }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return NextResponse.json({
      divisions: divisionList,
      scheduleRows, athletes,
      unmatched: { schedule: unmatched.schedule.length, athletes: unmatched.athletes.length, scheduleRows: unmatched.schedule, athleteRows: unmatched.athletes },
      existing,
      debug,
    });
  } catch (error) {
    console.error("Bulk onboard parse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
