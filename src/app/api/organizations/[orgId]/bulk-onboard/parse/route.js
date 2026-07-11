import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import sql from "@/lib/db";
import { getSession } from "@/lib/auth";
import { authorizeOrgAccess } from "@/lib/authorize";
import { checkAndRecord, clientIp } from "@/lib/rateLimit";
import { normalizeSchedule } from "@/lib/scheduleNormalize";
import { parseCsv, detectMapping, buildAthletes } from "@/lib/rosterImport";
import { canonicalDivision } from "@/lib/divisionKey";
import { scheduleFromColumns } from "@/lib/bulkSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_ROLES = new Set(["super_admin", "association_admin", "service_provider_admin", "goalie_service_provider_admin"]);

// Deterministic schedule parse lives in @/lib/bulkSchedule (scheduleFromColumns) —
// format-aware and unit-tested. Falls back to the AI normalizer when the file has
// no Division column.

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
    let rosterDivisions = [], rosterHasDivisionColumn = false, rosterMappingFields = null;
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
          const raw = (a._division || "").trim();
          const cd = canonicalDivision({ division: raw, label: raw });
          const tagged = { ...a, rawDivision: raw, divisionKey: cd?.key || null };
          athletes.push(tagged);
          if (cd) bump(cd.key, cd.age, cd.tier, "athleteCount", "roster");
          else unmatched.athletes.push(tagged);
        }
        // Distinct source division/team values → the admin maps each to a category.
        const rd = new Map();
        for (const a of athletes) {
          const v = a.rawDivision || "(blank)";
          if (!rd.has(v)) rd.set(v, { value: v, count: 0, suggestedKey: a.divisionKey || null });
          rd.get(v).count++;
        }
        rosterDivisions = [...rd.values()].sort((x, y) => y.count - x.count);
        // Whether the file even had a division/team column at all.
        rosterHasDivisionColumn = !!mapping.division;
        rosterMappingFields = { division: mapping.division || null, firstName: mapping.firstName || null, lastName: mapping.lastName || null, position: mapping.position || null };
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
      rosterDivisions, rosterHasDivisionColumn, rosterMappingFields,
      existing,
      debug,
    });
  } catch (error) {
    console.error("Bulk onboard parse error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
